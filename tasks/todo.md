# Miden Compiler & Arena Account Component

## Phase 1 — Completed

- [x] Install Miden compiler toolchain (cargo-miden v0.7.1)
- [x] Verify compatibility (compiler uses miden-core 0.20, matches local miden-base)
- [x] Scaffold counter-test account component via `cargo miden new --account`
- [x] Build & validate: Rust → WASM → MASM pipeline produces .masp
- [x] Prototype arena storage: Value + StorageMap both compile cleanly
- [x] Document findings
- [x] Test combat-engine import in Miden program — compiles and builds .masp (145KB)
- [x] Execute combat in Miden VM — `miden vm run` works
- [x] Verify determinism: Miden VM output matches native Rust output exactly
- [x] Identify compiler bug: large struct returns broken, workaround = inline logic

## Phase 2 — Arena Account Component — Completed

- [x] Add `pack.rs` module to combat-engine (ChampionState ↔ [u64; 4] packing)
- [x] Create `contracts/arena-account/` crate with 21-slot storage layout
- [x] Implement `join` procedure (first/second player joins, stake validation)
- [x] Implement `set_team` procedure (team validation, overlap check, champion init)
- [x] Implement `submit_commit` procedure (hash commitment storage)
- [x] Implement `submit_reveal` procedure (move validation, triggers resolution)
- [x] Implement `resolve_current_turn` with fully inlined combat resolution
- [x] Implement `claim_timeout` procedure (forfeit/refund logic)
- [x] Build produces .masp (381KB)
- [x] All 40 combat-engine tests pass (33 existing + 7 new packing tests)

## Phase 3 — Hash, Timeouts, Payouts & Note Scripts — Completed

- [x] RPO hash verification in `submit_reveal` (using `hash_elements`, ~1 cycle)
- [x] Block height access for timeout logic (`tx::get_block_number()`)
- [x] Refactor player ID storage from single Felt to 2-Felt AccountId (prefix, suffix)
- [x] P2ID note creation in `resolve_current_turn` and `claim_timeout` payouts
- [x] Add `faucet_id` and `p2id_script_hash` storage slots (23 total)
- [x] `send_payout` helper with `Recipient::compute`, `build_fungible_asset`, unique serial numbers
- [x] `submit_commit` accepts full 4-Felt RPO commitment Word
- [x] Note script crates: `submit-move-note`, `process-team-note`, `process-stake-note`
- [x] All 3 note scripts build to .masp (27-100KB each)
- [x] Arena account builds to .masp (475KB)
- [x] All 40 combat-engine tests pass
- [x] Code review fixes: unique payout serial numbers, decode_move defense-in-depth, saturating_add for damage

## Phase 3b — Cross-Context Note Scripts — Completed

- [x] Add `receive_asset` procedure to arena account (accepts Asset, calls `self.add_asset()`)
- [x] Copy generated WIT to `contracts/arena-account/wit/` for note script imports
- [x] Rewrite `process-stake-note` with `generate!()`/`export!()` cross-context pattern
  - Calls `receive_asset()` to deposit stake, then `join()` to register player
- [x] Rewrite `process-team-note` with cross-context pattern
  - Calls `set_team()` with sender ID and champion IDs from arg Word
- [x] Rewrite `submit-move-note` with cross-context pattern
  - Phase 0: calls `submit_commit()` with 4-Felt RPO commitment
  - Phase 1: calls `submit_reveal()` with encoded move + nonce
- [x] All 3 note scripts build to .masp (24-106KB each)
- [x] Arena account builds to .masp (510KB) with `receive_asset`
- [x] All 40 combat-engine tests pass
- [x] Caller authentication: note scripts pass `active_note::get_sender()` to account procedures

## Phase 3 — Remaining Items

- [ ] Single-use contract: no reset mechanism after game_state=4 (one game per account)
- [ ] Consider penalizing staller in state 2 timeout (award to team-submitter)
- [ ] Consider resetting timeout on each commit/reveal for fairer timing

## Key Findings

### Toolchain
- **Compiler:** `cargo-miden v0.7.1` from `0xMiden/compiler` repo
- **Nightly:** `nightly-2025-12-10`
- **Target:** `wasm32-wasip2`
- **SDK crate:** `miden = { version = "0.10" }`

### Real API (vs RustEngine.md pseudocode)
- `#[component]` on struct + impl (not `#[account_component]`)
- `Value` type for single storage slots (with `ValueAccess` trait)
- `Word` is a struct (not `[Felt; 4]`), constructed via `Word::new([...])`
- `Felt::from_u32()` / `Felt::from_u64_unchecked()` for construction
- `felt.as_u64()` for extraction
- `Value.read()` / `Value.write()` are generic — return type annotation determines conversion
- `Value.write()` returns the previous value

### Build Sizes
- Template counter: 9KB .masp
- Combat engine program: 145KB .masp
- Arena account component (Phase 2, 21 slots): 381KB .masp
- Arena account component (Phase 3, 23 slots, payouts): 475KB .masp
- Arena account component (Phase 3b, +receive_asset): 510KB .masp
- submit-move-note (cross-ctx): 106KB .masp
- process-stake-note (cross-ctx): 95KB .masp
- process-team-note (cross-ctx): 24KB .masp

### Known Issues
- `cargo miden test` fails with macro expansion error
- Large struct returns miscompiled (compiler v0.7.1 bug) — reported to Dennis with repro zip
- `#[inline(always)]` not sufficient across crate boundaries
