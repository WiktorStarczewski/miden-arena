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

## Phase 2 — Deferred Items

- [ ] SHA-256 hash verification in `submit_reveal` (requires MASM binding research)
- [ ] P2ID note creation in `claim_timeout` and `resolve_current_turn` payouts
- [ ] Block height access for timeout logic (`tx::block_number()` or equivalent)
- [ ] Note scripts: `submit-move-note`, `process-team-note`, `process-stake-note`
- [ ] Consider RPO hash instead of SHA-256 (~1 cycle vs ~8500)

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
- Arena account component (21 slots, full combat): 381KB .masp

### Known Issues
- `cargo miden test` fails with macro expansion error
- Large struct returns miscompiled (compiler v0.7.1 bug) — reported to Dennis with repro zip
- `#[inline(always)]` not sufficient across crate boundaries
