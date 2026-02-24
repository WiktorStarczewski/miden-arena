#![no_std]
#![feature(alloc_error_handler)]

use combat_engine::combat::{init_champion_state, resolve_turn};
use combat_engine::types::TurnAction;

#[cfg(not(test))]
#[panic_handler]
fn my_panic(_info: &core::panic::PanicInfo) -> ! {
    loop {}
}

#[cfg(not(test))]
#[alloc_error_handler]
fn my_alloc_error(_info: core::alloc::Layout) -> ! {
    loop {}
}

/// Bug repro: resolve_turn returns TurnResult with stale HP values.
///
/// Inferno (Fire, HP 80, ATK 20, SPD 16) vs Gale (Wind, HP 75, ATK 15, SPD 18).
/// Both use ability 0 (damage). Gale is faster (SPD 18 > 16), so Gale attacks first.
///
/// Native Rust (cargo test) computes:
///   Gale → Inferno: 37 damage → Inferno HP 80 → 43
///   Inferno → Gale:  64 damage → Gale HP 75 → 11
///   event_count = 2
///
/// Expected output: 43_011_002  (a_hp=43, b_hp=11, events=2)
/// Actual output:   80_075_002  (a_hp=80, b_hp=75, events=2)
///
/// The event_count=2 proves the function executed both attacks.
/// But the HP mutations don't survive into the returned TurnResult struct.
///
/// TurnResult is ~300 bytes: two ChampionState (each contains [BuffSlot; 8])
/// plus [TurnEvent; 16] plus event_count.
#[no_mangle]
pub fn entrypoint() -> i32 {
    let state_a = init_champion_state(0); // Inferno: Fire, HP 80
    let state_b = init_champion_state(4); // Gale: Wind, HP 75

    let action_a = TurnAction { champion_id: 0, ability_index: 0 };
    let action_b = TurnAction { champion_id: 4, ability_index: 0 };

    let result = resolve_turn(&state_a, &state_b, &action_a, &action_b);

    // Pack: a_hp * 10^6 + b_hp * 10^3 + event_count
    let a_hp = result.state_a.current_hp as i32;
    let b_hp = result.state_b.current_hp as i32;
    let ec = result.event_count as i32;

    a_hp * 1_000_000 + b_hp * 1_000 + ec
}
