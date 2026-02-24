# Miden Compiler & Arena Account Component Prototype

## Completed Steps

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

## Key Findings

### Toolchain
- **Compiler:** `cargo-miden v0.7.1` from `0xMiden/compiler` repo
- **Nightly:** `nightly-2025-12-10` (template's default, not `nightly-2025-07-20` from our plan)
- **Target:** `wasm32-wasip2` (not `wasip1` as assumed)
- **SDK crate:** `miden = { version = "0.10" }` (not `miden-sdk`)

### Real API (vs RustEngine.md pseudocode)
- `#[component]` on struct + impl (not `#[account_component]`)
- `Value` type for single storage slots (with `ValueAccess` trait)
- `StorageMap` type for keyed storage (with `StorageMapAccess` trait)
- `Felt` for field elements, `Word` for 4-Felt tuples
- `#[storage(description = "...")]` attribute on struct fields
- Account type metadata: `[package.metadata.miden] project-kind = "account"`

### Build Pipeline
- `cargo miden build --release` → produces `.masp` file
- Template counter (no storage): 9KB .masp
- With Value storage: 40KB .masp
- With Value + StorageMap: 52KB .masp
- Combat engine program: 145KB .masp
- Build time: ~0.2s incremental, ~40s clean

### Combat Execution in Miden VM
- Single turn: ~57k cycles, ~40ms
- 1v1 fight to KO (2 rounds): ~101k cycles, ~55ms
- **Output matches native Rust** — verified deterministic
- Must inline combat logic (no large struct returns through function calls)
- `resolve_turn_mut` added to combat-engine for Miden-friendly in-place mutation

### Known Issues
- `cargo miden test` fails with macro expansion error (`Felt` tuple vs struct variant mismatch)
- Large struct returns miscompiled (compiler v0.7.1 bug) — workaround: inline
- `#[inline(always)]` not sufficient across crate boundaries — must physically inline

## Next Steps (Phase 2 Concrete Plan)

- [ ] Rename `counter-test` → `arena-account` with real arena storage layout
- [ ] Define arena storage schema (game counter, game states map, champion registry)
- [ ] Implement arena account component with inlined combat resolution
- [ ] Serialize/deserialize ChampionState to/from Word storage format
- [ ] Set up proving pipeline (cargo miden build + miden vm prove)
