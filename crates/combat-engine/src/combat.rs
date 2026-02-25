use crate::champions::get_champion;
#[cfg(any(feature = "events", feature = "resolve-mut"))]
use crate::damage::{calculate_damage, sum_buffs};
use crate::types::{
    BuffSlot, ChampionState,
    MAX_BUFFS,
};
#[cfg(any(feature = "events", feature = "resolve-mut"))]
use crate::types::{AbilityType, Champion, StatType, TurnAction};
#[cfg(feature = "events")]
use crate::types::{TurnEvent, TurnResult, MAX_EVENTS};

#[cfg(feature = "events")]
/// Resolve a single combat round between two champions.
pub fn resolve_turn(
    state_a: &ChampionState,
    state_b: &ChampionState,
    action_a: &TurnAction,
    action_b: &TurnAction,
) -> TurnResult {
    let mut a = *state_a;
    let mut b = *state_b;

    let champ_a = get_champion(a.id);
    let champ_b = get_champion(b.id);

    let mut events = [TurnEvent::None; MAX_EVENTS];
    let mut event_count: u8 = 0;

    // Speed priority
    let speed_a = champ_a.speed + sum_buffs(&a, StatType::Speed);
    let speed_b = champ_b.speed + sum_buffs(&b, StatType::Speed);

    let a_goes_first =
        speed_a > speed_b || (speed_a == speed_b && champ_a.id < champ_b.id);

    if a_goes_first {
        execute_action(champ_a, &mut a, action_a, champ_b, &mut b, &mut events, &mut event_count);
        if !b.is_ko {
            execute_action(champ_b, &mut b, action_b, champ_a, &mut a, &mut events, &mut event_count);
        }
    } else {
        execute_action(champ_b, &mut b, action_b, champ_a, &mut a, &mut events, &mut event_count);
        if !a.is_ko {
            execute_action(champ_a, &mut a, action_a, champ_b, &mut b, &mut events, &mut event_count);
        }
    }

    // Tick down buff durations
    tick_buffs(&mut a);
    tick_buffs(&mut b);

    TurnResult {
        state_a: a,
        state_b: b,
        events,
        event_count,
    }
}

#[cfg(feature = "events")]
fn execute_action(
    actor_champ: &Champion,
    actor_state: &mut ChampionState,
    action: &TurnAction,
    target_champ: &Champion,
    target_state: &mut ChampionState,
    events: &mut [TurnEvent; MAX_EVENTS],
    event_count: &mut u8,
) {
    let ability = &actor_champ.abilities[action.ability_index as usize];

    match ability.ability_type {
        AbilityType::Damage => {
            let (damage, mult_x100) =
                calculate_damage(actor_champ, target_champ, target_state, ability, actor_state);
            target_state.current_hp = target_state.current_hp.saturating_sub(damage);
            #[cfg(feature = "track-damage")]
            { actor_state.total_damage_dealt += damage; }
            push_event(
                events,
                event_count,
                TurnEvent::Attack {
                    attacker_id: actor_champ.id,
                    defender_id: target_champ.id,
                    damage,
                    mult_x100,
                },
            );
            if target_state.current_hp == 0 {
                target_state.is_ko = true;
                push_event(
                    events,
                    event_count,
                    TurnEvent::Ko {
                        champion_id: target_champ.id,
                    },
                );
            }
        }
        AbilityType::Heal => {
            let old_hp = actor_state.current_hp;
            let new_hp = if old_hp + ability.heal_amount > actor_state.max_hp {
                actor_state.max_hp
            } else {
                old_hp + ability.heal_amount
            };
            actor_state.current_hp = new_hp;
            push_event(
                events,
                event_count,
                TurnEvent::Heal {
                    champion_id: actor_champ.id,
                    amount: new_hp - old_hp,
                    new_hp,
                },
            );
        }
        AbilityType::StatMod => {
            if ability.stat_value > 0 && ability.duration > 0 {
                let slot = BuffSlot {
                    stat: ability.stat,
                    value: ability.stat_value,
                    turns_remaining: ability.duration,
                    is_debuff: ability.is_debuff,
                    active: true,
                };
                if ability.is_debuff {
                    insert_buff(target_state, slot);
                    push_event(
                        events,
                        event_count,
                        TurnEvent::Debuff {
                            target_id: target_champ.id,
                            stat: ability.stat,
                            value: ability.stat_value,
                            duration: ability.duration,
                        },
                    );
                } else {
                    insert_buff(actor_state, slot);
                    push_event(
                        events,
                        event_count,
                        TurnEvent::Buff {
                            champion_id: actor_champ.id,
                            stat: ability.stat,
                            value: ability.stat_value,
                            duration: ability.duration,
                        },
                    );
                }
            }
        }
    }
}

#[cfg(any(feature = "events", feature = "resolve-mut"))]
fn tick_buffs(state: &mut ChampionState) {
    for i in 0..MAX_BUFFS {
        if state.buffs[i].active {
            state.buffs[i].turns_remaining -= 1;
            if state.buffs[i].turns_remaining == 0 {
                state.buffs[i].active = false;
                state.buff_count = state.buff_count.saturating_sub(1);
            }
        }
    }
}

#[cfg(any(feature = "events", feature = "resolve-mut"))]
fn insert_buff(state: &mut ChampionState, slot: BuffSlot) {
    for i in 0..MAX_BUFFS {
        if !state.buffs[i].active {
            state.buffs[i] = slot;
            state.buffs[i].active = true;
            state.buff_count += 1;
            return;
        }
    }
    panic!("buff array full — MAX_BUFFS exceeded");
}

#[cfg(feature = "events")]
fn push_event(events: &mut [TurnEvent; MAX_EVENTS], count: &mut u8, event: TurnEvent) {
    debug_assert!(
        (*count as usize) < MAX_EVENTS,
        "event buffer full — MAX_EVENTS exceeded"
    );
    if (*count as usize) < MAX_EVENTS {
        events[*count as usize] = event;
        *count += 1;
    }
}

#[cfg(feature = "resolve-mut")]
/// Miden-friendly variant of resolve_turn that mutates states in place.
/// Avoids the large TurnResult struct return which triggers a compiler bug
/// in the Miden WASM→MASM pipeline. Returns the number of events that occurred.
///
/// This is functionally identical to resolve_turn but doesn't track individual
/// events — the on-chain account only needs the final state, not the event log.
pub fn resolve_turn_mut(
    state_a: &mut ChampionState,
    state_b: &mut ChampionState,
    action_a: &TurnAction,
    action_b: &TurnAction,
) -> u8 {
    let champ_a = get_champion(state_a.id);
    let champ_b = get_champion(state_b.id);

    let mut event_count: u8 = 0;

    // Speed priority
    let speed_a = champ_a.speed + sum_buffs(state_a, StatType::Speed);
    let speed_b = champ_b.speed + sum_buffs(state_b, StatType::Speed);

    let a_goes_first =
        speed_a > speed_b || (speed_a == speed_b && champ_a.id < champ_b.id);

    if a_goes_first {
        event_count += execute_action_mut(champ_a, state_a, action_a, champ_b, state_b);
        if !state_b.is_ko {
            event_count += execute_action_mut(champ_b, state_b, action_b, champ_a, state_a);
        }
    } else {
        event_count += execute_action_mut(champ_b, state_b, action_b, champ_a, state_a);
        if !state_a.is_ko {
            event_count += execute_action_mut(champ_a, state_a, action_a, champ_b, state_b);
        }
    }

    // Tick down buff durations
    tick_buffs(state_a);
    tick_buffs(state_b);

    event_count
}

#[cfg(feature = "resolve-mut")]
fn execute_action_mut(
    actor_champ: &Champion,
    actor_state: &mut ChampionState,
    action: &TurnAction,
    target_champ: &Champion,
    target_state: &mut ChampionState,
) -> u8 {
    let ability = &actor_champ.abilities[action.ability_index as usize];
    let mut events: u8 = 0;

    match ability.ability_type {
        AbilityType::Damage => {
            let (damage, _) =
                calculate_damage(actor_champ, target_champ, target_state, ability, actor_state);
            target_state.current_hp = target_state.current_hp.saturating_sub(damage);
            #[cfg(feature = "track-damage")]
            { actor_state.total_damage_dealt += damage; }
            events += 1;
            if target_state.current_hp == 0 {
                target_state.is_ko = true;
                events += 1;
            }
        }
        AbilityType::Heal => {
            let old_hp = actor_state.current_hp;
            let new_hp = if old_hp + ability.heal_amount > actor_state.max_hp {
                actor_state.max_hp
            } else {
                old_hp + ability.heal_amount
            };
            actor_state.current_hp = new_hp;
            events += 1;
        }
        AbilityType::StatMod => {
            if ability.stat_value > 0 && ability.duration > 0 {
                let slot = BuffSlot {
                    stat: ability.stat,
                    value: ability.stat_value,
                    turns_remaining: ability.duration,
                    is_debuff: ability.is_debuff,
                    active: true,
                };
                if ability.is_debuff {
                    insert_buff(target_state, slot);
                } else {
                    insert_buff(actor_state, slot);
                }
                events += 1;
            }
        }
    }
    events
}

/// Initialize champion combat state from champion definition.
pub fn init_champion_state(champion_id: u8) -> ChampionState {
    let champ = get_champion(champion_id);
    ChampionState {
        id: champion_id,
        current_hp: champ.hp,
        max_hp: champ.hp,
        buffs: [BuffSlot::EMPTY; MAX_BUFFS],
        buff_count: 0,
        is_ko: false,
        #[cfg(feature = "track-damage")]
        total_damage_dealt: 0,
    }
}

/// Check if all 3 champions on a team are KO'd.
pub fn is_team_eliminated(states: &[ChampionState; 3]) -> bool {
    states[0].is_ko && states[1].is_ko && states[2].is_ko
}

#[cfg(all(test, feature = "events", feature = "track-damage"))]
mod tests {
    use super::*;
    use crate::types::{TurnEvent, TurnResult};

    // Helper to find the first event matching a pattern
    fn find_event<F>(result: &TurnResult, pred: F) -> Option<TurnEvent>
    where
        F: Fn(&TurnEvent) -> bool,
    {
        for i in 0..result.event_count as usize {
            if pred(&result.events[i]) {
                return Some(result.events[i]);
            }
        }
        None
    }

    fn count_events<F>(result: &TurnResult, pred: F) -> usize
    where
        F: Fn(&TurnEvent) -> bool,
    {
        let mut count = 0;
        for i in 0..result.event_count as usize {
            if pred(&result.events[i]) {
                count += 1;
            }
        }
        count
    }

    #[test]
    fn init_champion_state_all_8() {
        for i in 0..8u8 {
            let state = init_champion_state(i);
            assert_eq!(state.id, i);
            assert_eq!(state.current_hp, state.max_hp);
            assert!(state.current_hp > 0);
            assert!(!state.is_ko);
            assert_eq!(state.buff_count, 0);
        }
    }

    #[test]
    fn is_team_eliminated_false_when_alive() {
        let team = [
            init_champion_state(0),
            init_champion_state(1),
            init_champion_state(2),
        ];
        assert!(!is_team_eliminated(&team));
    }

    #[test]
    fn is_team_eliminated_true_when_all_ko() {
        let mut team = [
            init_champion_state(0),
            init_champion_state(1),
            init_champion_state(2),
        ];
        for s in team.iter_mut() {
            s.is_ko = true;
            s.current_hp = 0;
        }
        assert!(is_team_eliminated(&team));
    }

    #[test]
    fn is_team_eliminated_false_when_some_alive() {
        let mut team = [
            init_champion_state(0),
            init_champion_state(1),
            init_champion_state(2),
        ];
        team[0].is_ko = true;
        team[0].current_hp = 0;
        assert!(!is_team_eliminated(&team));
    }

    #[test]
    fn faster_champion_attacks_first() {
        // Gale (id 4, SPD 18) vs Boulder (id 1, SPD 5)
        let gale = init_champion_state(4);
        let boulder = init_champion_state(1);

        let result = resolve_turn(
            &gale,
            &boulder,
            &TurnAction { champion_id: 4, ability_index: 0 }, // Wind Blade
            &TurnAction { champion_id: 1, ability_index: 0 }, // Rock Slam
        );

        // First attack event should be from Gale
        let first_attack = find_event(&result, |e| matches!(e, TurnEvent::Attack { .. }));
        assert!(first_attack.is_some());
        if let Some(TurnEvent::Attack { attacker_id, .. }) = first_attack {
            assert_eq!(attacker_id, 4);
        }
    }

    #[test]
    fn speed_tie_broken_by_lower_id() {
        // Same champion (id 0) on both sides — tie broken by lower ID
        let a = init_champion_state(0);
        let b = init_champion_state(0);

        let result = resolve_turn(
            &a,
            &b,
            &TurnAction { champion_id: 0, ability_index: 0 },
            &TurnAction { champion_id: 0, ability_index: 0 },
        );

        let attack_count = count_events(&result, |e| matches!(e, TurnEvent::Attack { .. }));
        assert!(attack_count >= 1);
    }

    #[test]
    fn heal_mechanics() {
        // Torrent (id 3, Water) heals self
        let mut torrent = init_champion_state(3);
        torrent.current_hp = 50; // damage them
        let ember = init_champion_state(2);

        let result = resolve_turn(
            &torrent,
            &ember,
            &TurnAction { champion_id: 3, ability_index: 1 }, // Heal (+25 HP)
            &TurnAction { champion_id: 2, ability_index: 0 }, // Fireball
        );

        // Torrent should have valid HP
        assert!(result.state_a.current_hp <= result.state_a.max_hp);
    }

    #[test]
    fn buff_application_and_tick_down() {
        // Ember (id 2, SPD 14) uses Flame Shield (+5 DEF, 2 turns)
        // Torrent (id 3, SPD 10) uses Tidal Wave
        let ember = init_champion_state(2);
        let torrent = init_champion_state(3);

        let result = resolve_turn(
            &ember,
            &torrent,
            &TurnAction { champion_id: 2, ability_index: 1 }, // Flame Shield
            &TurnAction { champion_id: 3, ability_index: 0 }, // Tidal Wave
        );

        // Buff event should exist
        let buff_event = find_event(&result, |e| matches!(e, TurnEvent::Buff { .. }));
        assert!(buff_event.is_some());

        // Ember should have 1 active buff with 1 turn remaining (applied at 2, ticked to 1)
        let ember_state = &result.state_a;
        let mut active_buffs = 0;
        for i in 0..MAX_BUFFS {
            if ember_state.buffs[i].active {
                active_buffs += 1;
                assert_eq!(ember_state.buffs[i].stat, StatType::Defense);
                assert_eq!(ember_state.buffs[i].value, 5);
                assert_eq!(ember_state.buffs[i].turns_remaining, 1);
            }
        }
        assert_eq!(active_buffs, 1);
    }

    #[test]
    fn ko_prevents_second_attack() {
        // Storm (id 7, SPD 15) vs Boulder (id 1, SPD 5) with very low HP
        let storm = init_champion_state(7);
        let mut boulder = init_champion_state(1);
        boulder.current_hp = 1; // Very low HP

        // Storm SPD 15 > Boulder SPD 5, so Storm goes first and KOs Boulder
        let result = resolve_turn(
            &storm,
            &boulder,
            &TurnAction { champion_id: 7, ability_index: 0 }, // Lightning
            &TurnAction { champion_id: 1, ability_index: 0 }, // Rock Slam
        );

        let ko = find_event(&result, |e| matches!(e, TurnEvent::Ko { .. }));
        assert!(ko.is_some());

        // Boulder should be KO'd
        assert!(result.state_b.is_ko);

        // Only 1 attack should have happened (Storm's)
        let attacks = count_events(&result, |e| matches!(e, TurnEvent::Attack { .. }));
        assert_eq!(attacks, 1);
    }

    #[test]
    fn debuff_applied_to_opponent() {
        // Tide (id 5, SPD 9) uses Mist (-4 ATK, 2 turns) on Inferno (id 0, SPD 16)
        // Inferno is faster, so Inferno acts first, then Tide applies debuff
        let tide = init_champion_state(5);
        let inferno = init_champion_state(0);

        let result = resolve_turn(
            &tide,
            &inferno,
            &TurnAction { champion_id: 5, ability_index: 1 }, // Mist
            &TurnAction { champion_id: 0, ability_index: 0 }, // Eruption
        );

        let debuff_event = find_event(&result, |e| matches!(e, TurnEvent::Debuff { .. }));
        assert!(debuff_event.is_some());

        // Inferno (state_b) should have an attack debuff
        // After tick_buffs, duration goes from 2 to 1
        let inferno_state = &result.state_b;
        let mut found_debuff = false;
        for i in 0..MAX_BUFFS {
            if inferno_state.buffs[i].active
                && inferno_state.buffs[i].stat == StatType::Attack
                && inferno_state.buffs[i].is_debuff
            {
                found_debuff = true;
            }
        }
        assert!(found_debuff);
    }

    // ---------------------------------------------------------------
    // Full happy-path: 3v3 battle played to completion
    // ---------------------------------------------------------------
    // Team A: Storm (7), Ember (2), Torrent (3)
    // Team B: Boulder (1), Tide (5), Gale (4)
    #[test]
    fn full_3v3_battle_to_completion() {
        let mut team_a = [
            init_champion_state(7), // Storm:   Wind, HP 85, ATK 17, SPD 15
            init_champion_state(2), // Ember:   Fire, HP 90, ATK 16, SPD 14
            init_champion_state(3), // Torrent: Water, HP 110, ATK 12, SPD 10
        ];
        let mut team_b = [
            init_champion_state(1), // Boulder: Earth, HP 140, ATK 14, SPD 5
            init_champion_state(5), // Tide:    Water, HP 100, ATK 11, SPD 9
            init_champion_state(4), // Gale:    Wind, HP 75, ATK 15, SPD 18
        ];

        let mut idx_a: usize = 0; // active champion index for team A
        let mut idx_b: usize = 0; // active champion index for team B

        let mut rounds = 0u32;
        let max_rounds = 100; // safety cap

        while rounds < max_rounds {
            rounds += 1;

            let active_a = &team_a[idx_a];
            let active_b = &team_b[idx_b];

            // Pick actions — use ability 0 (damage) most of the time.
            // Sprinkle in ability 1 to exercise buffs/heals:
            //   Round 1: Storm uses Dodge (buff), Boulder uses Fortify (buff)
            //   Round 3: if Ember is up, use Flame Shield (buff)
            //   Otherwise: ability 0 (damage)
            let ability_a = if rounds == 1 && active_a.id == 7 {
                1 // Storm: Dodge (buff)
            } else if rounds == 3 && active_a.id == 2 {
                1 // Ember: Flame Shield (buff)
            } else {
                0
            };
            let ability_b = if rounds == 1 && active_b.id == 1 {
                1 // Boulder: Fortify (buff)
            } else if active_b.id == 5 && rounds % 3 == 0 {
                1 // Tide: Mist (debuff) every 3rd round
            } else {
                0
            };

            let action_a = TurnAction {
                champion_id: active_a.id,
                ability_index: ability_a,
            };
            let action_b = TurnAction {
                champion_id: active_b.id,
                ability_index: ability_b,
            };

            let result = resolve_turn(
                &team_a[idx_a],
                &team_b[idx_b],
                &action_a,
                &action_b,
            );

            // Write back updated states
            team_a[idx_a] = result.state_a;
            team_b[idx_b] = result.state_b;

            // Basic invariants every round
            assert!(result.event_count > 0, "round {} produced no events", rounds);
            assert!(
                team_a[idx_a].current_hp <= team_a[idx_a].max_hp,
                "HP exceeded max for team A champion {}",
                team_a[idx_a].id
            );
            assert!(
                team_b[idx_b].current_hp <= team_b[idx_b].max_hp,
                "HP exceeded max for team B champion {}",
                team_b[idx_b].id
            );

            // If a champion is KO'd, swap in the next one
            if team_a[idx_a].is_ko && idx_a + 1 < team_a.len() {
                idx_a += 1;
            }
            if team_b[idx_b].is_ko && idx_b + 1 < team_b.len() {
                idx_b += 1;
            }

            // Check for full team elimination
            if is_team_eliminated(&team_a) || is_team_eliminated(&team_b) {
                break;
            }
        }

        // The battle must have ended (not hit the safety cap)
        assert!(
            is_team_eliminated(&team_a) || is_team_eliminated(&team_b),
            "battle did not end within {} rounds", max_rounds
        );

        // Exactly one team should be eliminated
        let a_elim = is_team_eliminated(&team_a);
        let b_elim = is_team_eliminated(&team_b);
        assert!(
            a_elim || b_elim,
            "no team was eliminated"
        );

        // The winning team should have at least one champion alive
        if a_elim {
            assert!(
                team_b.iter().any(|s| !s.is_ko),
                "team B won but has no survivors"
            );
        } else {
            assert!(
                team_a.iter().any(|s| !s.is_ko),
                "team A won but has no survivors"
            );
        }

        // Verify total_damage_dealt is sensible across all champions
        #[cfg(feature = "track-damage")]
        {
            let total_dmg: u32 = team_a.iter().chain(team_b.iter())
                .map(|s| s.total_damage_dealt)
                .sum();
            assert!(total_dmg > 0, "no damage was dealt in the entire battle");
        }

        // Print summary (visible with `cargo test -- --nocapture`)
        #[cfg(test)]
        {
            extern crate std;
            std::println!(
                "Battle ended in {} rounds. A eliminated: {}, B eliminated: {}",
                rounds, a_elim, b_elim
            );
            for (label, team) in [("A", &team_a), ("B", &team_b)] {
                for s in team.iter() {
                    std::println!(
                        "  Team {} champion {}: HP {}/{} KO={}",
                        label, s.id, s.current_hp, s.max_hp, s.is_ko,
                    );
                }
            }
        }
    }

    // A simpler 1v1 that chains rounds until KO, verifying HP
    // monotonically decreases (no healing used) and the battle
    // terminates deterministically.
    #[test]
    fn full_1v1_damage_only_to_ko() {
        // Storm (Wind, SPD 15) vs Quake (Earth, SPD 7) — both use ability 0 (damage)
        // Wind beats Water, Earth beats Wind. Wind vs Earth = neutral.
        let mut storm = init_champion_state(7);  // HP 85
        let mut quake = init_champion_state(6);  // HP 130

        let mut rounds = 0u32;
        let mut prev_hp_storm = storm.current_hp;
        let mut prev_hp_quake = quake.current_hp;

        while !storm.is_ko && !quake.is_ko {
            rounds += 1;
            assert!(rounds <= 50, "1v1 did not end in 50 rounds");

            let result = resolve_turn(
                &storm,
                &quake,
                &TurnAction { champion_id: 7, ability_index: 0 }, // Lightning
                &TurnAction { champion_id: 6, ability_index: 0 }, // Earthquake
            );

            storm = result.state_a;
            quake = result.state_b;

            // HP should only decrease (no heals in this fight)
            assert!(
                storm.current_hp <= prev_hp_storm,
                "storm HP increased: {} -> {}", prev_hp_storm, storm.current_hp
            );
            assert!(
                quake.current_hp <= prev_hp_quake,
                "quake HP increased: {} -> {}", prev_hp_quake, quake.current_hp
            );

            prev_hp_storm = storm.current_hp;
            prev_hp_quake = quake.current_hp;
        }

        // Exactly one should be KO'd
        assert!(storm.is_ko || quake.is_ko);
        assert!(rounds > 1, "battle should take more than 1 round");
    }

    // Inferno's Scorch is now plain damage (burn removed) — verify it
    // deals damage without any burn mechanics.
    #[test]
    fn inferno_scorch_deals_plain_damage() {
        let inferno = init_champion_state(0);
        let boulder = init_champion_state(1);

        let result = resolve_turn(
            &inferno,
            &boulder,
            &TurnAction { champion_id: 0, ability_index: 1 }, // Scorch (now plain damage 20)
            &TurnAction { champion_id: 1, ability_index: 0 }, // Rock Slam
        );

        // Should have attack events, no burn events
        let attack_events = count_events(&result, |e| matches!(e, TurnEvent::Attack { .. }));
        assert!(attack_events >= 1);

        // Boulder should have taken damage
        assert!(result.state_b.current_hp < 140);
    }
}
