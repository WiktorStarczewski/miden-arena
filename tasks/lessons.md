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
