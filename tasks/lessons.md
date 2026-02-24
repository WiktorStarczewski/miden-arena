# Lessons Learned

## 2026-02-24: Miden Compiler Prototype

### Toolchain Assumptions Were Wrong
- **Plan said:** `nightly-2025-07-20`, `wasm32-wasip1`, `miden-sdk` crate
- **Reality:** `nightly-2025-12-10`, `wasm32-wasip2`, `miden = "0.10"` crate
- **Lesson:** Always run `cargo miden new --account` first to get the canonical template. Don't guess the toolchain or dependency names.

### `cargo miden new` Is the Source of Truth
- The template generator produces the correct `Cargo.toml`, `rust-toolchain.toml`, and skeleton code
- Use `--account`, `--program`, `--note`, `--tx-script`, or `--auth-component` flags
- The generated `rust-toolchain.toml` will auto-install the correct nightly

### Storage API Pattern
- Struct fields with `#[storage(description = "...")]` must be `Value` or `StorageMap` types
- Use `ValueAccess` trait (`.read()`, `.write()`) for `Value`
- Use `StorageMapAccess` trait (`.get()`, `.set()`) for `StorageMap`
- Types going into/out of storage need `Into<Word>` / `From<Word>` implementations

### cargo miden test Is Broken (v0.7.1)
- The test framework's macro expansion has a bug with `Felt` type construction
- Tests need to be run a different way (native unit tests, or wait for fix)
- The build pipeline works perfectly — only the test harness is affected

### Version Compatibility
- compiler v0.7.1 targets miden-core 0.20 / miden-protocol 0.13
- local miden-base is v0.14 with miden-core 0.20
- Core VM versions match; protocol version difference (0.13 vs 0.14) only matters at deployment time

## 2026-02-24: Miden VM Combat Resolution Testing

### Large Struct Returns Are Broken in the Miden Compiler
- `resolve_turn` returns `TurnResult` which contains `[TurnEvent; 16]` — a huge enum array
- The Miden compiler (v0.7.1) silently produces incorrect MASM for large struct returns
- Symptoms: function executes (events counted), but mutated state fields read as original values
- **Root cause:** The copy-back from local variables to the return struct is miscompiled for large structs
- **Workaround:** Inline the logic directly in the calling function, avoid `&mut` through function call boundaries for complex structs
- This affects any function that returns or modifies through `&mut` a struct containing arrays (like `[BuffSlot; 8]`)

### What Works in Miden VM
- `calculate_damage()` — immutable refs to complex structs: works perfectly
- Direct field mutation (`state.current_hp = x`): works perfectly
- `init_champion_state()` — small struct return: works
- All arithmetic (u32, u64): works, including `saturating_sub`, division
- `match` on enums: works
- Looping (`while` with mutable state): works
- Static array indexing (`CHAMPIONS[id]`): works

### Verified: Deterministic Combat in Miden VM
- `miden vm run` of inlined combat logic produces **identical results** to native `cargo test`
- Storm vs Quake 1v1: Miden output `2000086` = native output `2000086`
- 1v1 damage-only fight runs correctly to KO in 2 rounds, ~101k VM cycles, 55ms
- Single turn resolution: ~57k cycles, ~40ms

### Pattern for On-Chain Combat
- Don't use `resolve_turn` (large return struct) in Miden code
- Instead, inline the combat logic or use `resolve_turn_mut` with `#[inline(always)]`
- The on-chain account doesn't need the event log — only the final state matters
- Events are for the client-side TypeScript engine (animation/UI)

## 2026-02-24: Arena Account Component (Phase 2)

### Miden SDK Felt/Word API Gotchas
- `Word` is a **struct** (not `[Felt; 4]`) — construct via `Word::new([f0, f1, f2, f3])`
- No `Felt::ZERO` constant — use `Felt::from_u32(0)`
- No `Felt::from(u64)` — use `Felt::from_u64_unchecked(v)` (panics if > field modulus)
- `felt.as_u64()` for extraction (or `felt.into()` where `u64` return is inferred)
- `Value.write(val)` **returns** the previous value — ignore with `let _ =` or bind
- `Value.read()` is generic: return type annotation (`Felt` vs `Word`) controls conversion
- **Borrow checker**: `self.write_helper(&self.field, v)` fails (simultaneous &mut self + &self). Write directly: `self.field.write(v)`

### 21 Value Fields Works
- The `#[component]` macro handles 21 `Value` storage fields without issue
- No need for `StorageMap` fallback — Value slots are sufficient
- Slot numbering follows declaration order (slot 0 = first field, slot 20 = last)

### Champion State Packing
- Pure Rust `[u64; 4]` packing in combat-engine enables native testing without Miden SDK dependency
- Arena account converts `[u64; 4] ↔ Word` at the boundary
- 7 roundtrip tests verify correctness across all 10 champions, buff states, KO states

### Arena Account Build Size
- 381KB .masp with 21 storage slots, 6 procedures, inlined combat resolution
- Comparable to the 145KB combat-test program (which had only 1 procedure)

## 2026-02-24: Phase 3 — Hash, Timeouts, Payouts & Note Scripts

### RPO Hash API
- `hash_elements(Vec<Felt>) -> Digest` — RPO256, ~1 cycle in Miden VM
- `Digest.inner` gives the `Word` (4 Felts) — direct field access
- RPO gives full 256-bit security (vs SHA-256 which would need 32-bit truncation in Felt)
- Import: `use miden::hash_elements;` (re-exported from `miden_stdlib_sys`)

### Block Height API
- `tx::get_block_number() -> Felt` — returns current block as a single Felt
- Import: `use miden::tx;`
- Usable in account component context (kernel procedure)

### Output Note API (P2ID Payouts)
- `output_note::create(tag, note_type, recipient) -> NoteIdx`
- `output_note::add_asset(asset, note_idx)` — attach asset to note
- `Recipient::compute(serial_num: Word, script_digest: Digest, inputs: Vec<Felt>) -> Recipient`
- `asset::build_fungible_asset(faucet_id: AccountId, amount: Felt) -> Asset`
- Types: `Tag`, `NoteType`, `NoteIdx`, `Recipient`, `Asset`, `AccountId`, `Digest`
- All from `use miden::{...}` (re-exported from `miden_base_sys::bindings`)

### AccountId is 2 Felts
- `AccountId { prefix: Felt, suffix: Felt }` — constructor: `AccountId::new(prefix, suffix)`
- Player storage must use Word `[prefix, suffix, 0, 0]` for full ID
- P2ID note inputs: `[target_prefix, target_suffix]`

### WIT Naming Constraint
- `#[component]` macro converts Rust parameter names to WIT kebab-case
- Parameters like `commit_0` become `commit-0` in WIT — INVALID (digit after dash)
- **Lesson:** Never use digits-after-underscore in public procedure parameter names
- Use `commit_a, commit_b, commit_c, commit_d` instead of `commit_0..3`

### Note Script Limitations in Rust
- `#[note]` struct + impl, `#[note_script]` on entrypoint method
- Entrypoint signature: `fn execute(self, arg: Word)` or `fn execute(self, arg: Word, account: &mut Account)`
- `Account` parameter only provides `ActiveAccount` trait (read-only: `get_id`, `get_balance`, etc.)
- **Cannot** call custom account procedures from Rust note scripts
- For calling `join`, `set_team`, `submit_commit`, etc., need MASM note scripts
- `active_note::get_inputs() -> Vec<Felt>` and `active_note::get_sender() -> AccountId` work fine
- `project-kind = "note-script"` (NOT `"note"`) in Cargo.toml metadata

### P2ID Note Convention
- P2ID script is a well-known MASM script in `miden-standards`
- Script hash is computed at runtime (not a compile-time constant)
- Must store P2ID script digest in account storage (`p2id_script_hash` slot)
- P2ID note inputs: exactly 2 Felts = `[target_prefix, target_suffix]`
- Note serial_num must be unique per payout to avoid nullifier collisions

### Payout Serial Number Uniqueness
- Two notes with same (serial_num, script_hash, inputs) produce same recipient/nullifier
- In draw payouts to different players, inputs differ → safe
- But same player receiving two payouts needs distinct serial_nums
- Pattern: use round number for combat payouts, high offset (1_000_000+) for timeout payouts

## 2026-02-24: Cross-Context Note Scripts (Phase 3b)

### Note Scripts CAN Call Custom Account Procedures
- The `#[note]`/`#[note_script]` macro pattern only provides `ActiveAccount` trait (read-only)
- **Solution:** Use `miden::generate!()` + `bindings::export!()` pattern instead
- Note scripts import the account's WIT interface and call procedures as regular functions
- This is the same pattern used in `miden-compiler/tests/rust-apps-wasm/rust-sdk/cross-ctx-note/`

### Cross-Context Calling Pattern
- **Account side:** Keep `#[component]` macro — it auto-generates WIT at `target/generated-wit/`
- **Note side:** Manual WIT world file that `import`s account interface, `export`s `miden:base/note-script@1.0.0`
- **Cargo.toml metadata sections required:**
  - `[package.metadata.miden.dependencies]` — references account crate path
  - `[package.metadata.component.target.dependencies]` — references account WIT file path
- **Rust code:** `miden::generate!()` creates `bindings` module, `bindings::export!(StructName)` wires it
- **Import path:** `bindings::miden::arena_account::arena_account::function_name` (WIT kebab-case → Rust snake_case)

### WIT File Management
- Copy generated WIT from `target/generated-wit/` to `contracts/<name>/wit/` for stability
- Note scripts reference the stable path, not `target/` which gets cleaned by `cargo clean`
- Build order matters: account must be built first to generate WIT, then note scripts

### Asset Type Works in WIT
- `Asset` Rust type maps cleanly to WIT `asset` type (from `core-types`)
- The `#[component]` macro auto-generates `use core-types.{asset, felt}` in WIT
- `receive_asset(asset: Asset)` compiles and builds without issues
- Pattern from `basic-wallet` example: `self.add_asset(asset)` works in `#[component]`

### SDK Functions Available in generate!() Pattern
- `active_note::get_sender()` → `AccountId { prefix, suffix }`
- `active_note::get_assets()` → `Vec<Asset>` (note assets)
- `active_note::get_inputs()` → `Vec<Felt>` (note inputs)
- All available via `use miden::*` — SDK functions work in both `#[note_script]` and `generate!()` patterns

## 2026-02-24: Deployment Automation (Phase 4)

### Deploy Script Pattern
- Build order matters: arena-account first (generates WIT), then note scripts
- Copy generated WIT to stable `wit/` dir before building note scripts
- `miden-client new-account` with `--packages`, `--deploy`, `--storage-mode public`
- Extract account ID from CLI output via `grep -oE '0x[0-9a-fA-F]+'`
- Write centralized `contracts.ts` with account ID and note script paths

### Frontend Contract Integration
- Note script .masp files served as static assets from `public/contracts/`
- Single `src/constants/contracts.ts` file re-exported via `src/constants/miden.ts`
- Placeholder values allow frontend to compile before first deployment
- Deploy script overwrites the file with real values after deployment

## 2026-02-24: Plan Review — Frontend Arena Integration

### Always Verify SDK API Signatures Before Writing Integration Code
- `AccountStorage.getItem()` may accept string names or numeric indices — depends on `#[component]` macro
- `NoteStorage` constructor may take `FeltArray` or a different argument type
- `importAccountById` behavior for public accounts (does it pull full component code?) needs testing
- **Lesson:** Deploy + test API calls in browser console BEFORE writing hooks that depend on them

### Arena Storage Initialization is Not Automatic
- `faucet_id` (slot 21) and `p2id_script_hash` (slot 22) are read by `send_payout` but never written by any procedure
- `scripts/deploy.sh` creates the account but doesn't initialize these slots
- Payouts will silently produce invalid notes with zero faucet/zero script hash
- **Lesson:** Always trace data flow — if a procedure reads a storage slot, verify something writes it

### Two-Tx Arena Flow Needs Nonce Conflict Handling
- Both players submit consume txs against the same arena account (single nonce)
- One tx will fail with a nonce conflict in concurrent submission scenarios
- **Lesson:** Any shared-account pattern needs retry logic with re-sync + re-query

### Contract Procedure Ordering Constraints
- `set_team` asserts `game_state == 2` (both joined) — cannot be called before both players stake
- Frontend must gate team submission on arena state poll, not just local state
- **Lesson:** Always read the contract's assert conditions and translate them into frontend guards

### Game State Machine Needs Explicit Screen State
- Adding a phase between draft and battle requires a new `Screen` variant
- Can't overload `preBattleLoading` — it's a different flow now (stake → wait → team → wait → battle)
- **Lesson:** If the game flow changes, update the state machine enum first

### Use `submitNewTransactionWithProver` Consistently
- The codebase uses `submitNewTransactionWithProver(id, req, prover)` everywhere
- Plan originally referenced `submitNewTransaction(id, req)` for arena txs — would fail
- **Lesson:** Grep for actual usage patterns in existing code, don't mix API variants

### `randomFelt()` Shared Between Modules
- Both `arenaNote.ts` (serial numbers) and `commitment.ts` (nonces) need random Felts
- Duplicating the function invites divergence (one shifts >> 2n, the other forgets)
- **Lesson:** Extract shared crypto primitives to a single module from the start
