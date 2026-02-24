#![no_std]
#![feature(alloc_error_handler)]

use combat_engine::combat::init_champion_state;
use combat_engine::champions::get_champion;
use combat_engine::damage::{calculate_damage, calculate_burn_damage, sum_buffs};
use combat_engine::types::{AbilityType, ChampionState, StatType, TurnAction};

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

/// Full 1v1 to KO using fully inlined logic (no &mut through function calls).
/// Storm (Wind, HP 85) vs Quake (Earth, HP 130), both use ability 0 (damage).
#[no_mangle]
pub fn entrypoint() -> i32 {
    let mut storm = init_champion_state(7);  // Wind, HP 85, ATK 17, SPD 15
    let mut quake = init_champion_state(6);  // Earth, HP 130, ATK 13, SPD 7

    let champ_a = get_champion(7);
    let champ_b = get_champion(6);
    let ability_a = &champ_a.abilities[0]; // Lightning: power 30, Damage
    let ability_b = &champ_b.abilities[0]; // Earthquake: power 26, Damage

    let mut rounds = 0u32;

    while !storm.is_ko && !quake.is_ko && rounds < 50 {
        rounds += 1;

        // Speed check (Storm SPD 15 > Quake SPD 7, so Storm always first)
        let speed_a = champ_a.speed + sum_buffs(&storm, StatType::Speed);
        let speed_b = champ_b.speed + sum_buffs(&quake, StatType::Speed);
        let a_first = speed_a > speed_b || (speed_a == speed_b && champ_a.id < champ_b.id);

        if a_first {
            // Storm attacks Quake
            let (dmg, _) = calculate_damage(champ_a, champ_b, &quake, ability_a, &storm);
            quake.current_hp = quake.current_hp.saturating_sub(dmg);
            storm.total_damage_dealt += dmg;
            if quake.current_hp == 0 { quake.is_ko = true; }

            // Quake attacks Storm (if alive)
            if !quake.is_ko {
                let (dmg, _) = calculate_damage(champ_b, champ_a, &storm, ability_b, &quake);
                storm.current_hp = storm.current_hp.saturating_sub(dmg);
                quake.total_damage_dealt += dmg;
                if storm.current_hp == 0 { storm.is_ko = true; }
            }
        } else {
            // Quake attacks Storm
            let (dmg, _) = calculate_damage(champ_b, champ_a, &storm, ability_b, &quake);
            storm.current_hp = storm.current_hp.saturating_sub(dmg);
            quake.total_damage_dealt += dmg;
            if storm.current_hp == 0 { storm.is_ko = true; }

            // Storm attacks Quake (if alive)
            if !storm.is_ko {
                let (dmg, _) = calculate_damage(champ_a, champ_b, &quake, ability_a, &storm);
                quake.current_hp = quake.current_hp.saturating_sub(dmg);
                storm.total_damage_dealt += dmg;
                if quake.current_hp == 0 { quake.is_ko = true; }
            }
        }

        // Burn ticks
        if storm.burn_turns > 0 && !storm.is_ko {
            let bd = calculate_burn_damage(&storm);
            storm.current_hp = storm.current_hp.saturating_sub(bd);
            storm.burn_turns -= 1;
            if storm.current_hp == 0 { storm.is_ko = true; }
        }
        if quake.burn_turns > 0 && !quake.is_ko {
            let bd = calculate_burn_damage(&quake);
            quake.current_hp = quake.current_hp.saturating_sub(bd);
            quake.burn_turns -= 1;
            if quake.current_hp == 0 { quake.is_ko = true; }
        }
    }

    // Pack: rounds * 10^6 + storm_hp * 10^3 + quake_hp
    (rounds as i32) * 1_000_000 + (storm.current_hp as i32) * 1_000 + (quake.current_hp as i32)
}
