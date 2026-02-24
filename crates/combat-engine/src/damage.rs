use crate::elements::get_type_multiplier;
use crate::types::{Ability, Champion, ChampionState, StatType, MAX_BUFFS};

/// Sum buff values for a given stat type (buffs only, not debuffs).
pub fn sum_buffs(state: &ChampionState, stat: StatType) -> u32 {
    let mut total: u32 = 0;
    for i in 0..MAX_BUFFS {
        if state.buffs[i].active && state.buffs[i].stat == stat && !state.buffs[i].is_debuff {
            total += state.buffs[i].value;
        }
    }
    total
}

/// Sum debuff values for a given stat type (debuffs only).
pub fn sum_debuffs(state: &ChampionState, stat: StatType) -> u32 {
    let mut total: u32 = 0;
    for i in 0..MAX_BUFFS {
        if state.buffs[i].active && state.buffs[i].stat == stat && state.buffs[i].is_debuff {
            total += state.buffs[i].value;
        }
    }
    total
}

/// Calculate damage for a damage ability.
/// Returns (damage, type_multiplier_x100).
pub fn calculate_damage(
    attacker: &Champion,
    defender: &Champion,
    defender_state: &ChampionState,
    ability: &Ability,
    attacker_state: &ChampionState,
) -> (u32, u32) {
    // 1. Effective attack (apply attack debuffs)
    let attack_debuffs = sum_debuffs(attacker_state, StatType::Attack);
    let effective_atk: u32 = attacker.attack.saturating_sub(attack_debuffs);

    // 2. Type multiplier (x100)
    let mult_x100 = get_type_multiplier(attacker.element, defender.element);

    // 3. Effective defense (base + defense buffs)
    let defense_buffs = sum_buffs(defender_state, StatType::Defense);
    let effective_def = defender.defense + defense_buffs;

    // 4. Combined formula in u64 to avoid overflow
    let raw = (ability.power as u64) * (20 + effective_atk as u64) * (mult_x100 as u64) / 2000;
    let raw_u32 = raw as u32;

    let damage = if raw_u32 > effective_def {
        raw_u32 - effective_def
    } else {
        1 // minimum 1 damage
    };

    (damage, mult_x100)
}

/// Calculate burn tick damage: max_hp / 10, minimum 1.
pub fn calculate_burn_damage(state: &ChampionState) -> u32 {
    (state.max_hp / 10).max(1)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::champions::CHAMPIONS;
    use crate::combat::init_champion_state;
    use crate::types::BuffSlot;

    fn make_state(champion_id: u8) -> ChampionState {
        init_champion_state(champion_id)
    }

    #[test]
    fn ember_vs_boulder_fire_advantage() {
        let ember = &CHAMPIONS[2]; // Fire, ATK 16
        let boulder = &CHAMPIONS[1]; // Earth, DEF 16
        let boulder_state = make_state(1);
        let ember_state = make_state(2);
        let ability = &ember.abilities[0]; // Fireball: 25 power

        let (damage, mult) = calculate_damage(ember, boulder, &boulder_state, ability, &ember_state);

        // baseDamage = 25 * (20 + 16) * 150 / 2000 = 25 * 36 * 150 / 2000 = 135000 / 2000 = 67
        // finalDamage = 67 - 16 = 51
        assert_eq!(mult, 150);
        assert_eq!(damage, 51);
    }

    #[test]
    fn ember_vs_torrent_fire_disadvantage() {
        let ember = &CHAMPIONS[2]; // Fire
        let torrent = &CHAMPIONS[3]; // Water, DEF 12
        let torrent_state = make_state(3);
        let ember_state = make_state(2);
        let ability = &ember.abilities[0]; // Fireball: 25 power

        let (damage, mult) = calculate_damage(ember, torrent, &torrent_state, ability, &ember_state);

        // 25 * 36 * 67 / 2000 = 60300 / 2000 = 30
        // 30 - 12 = 18
        assert_eq!(mult, 67);
        assert_eq!(damage, 18);
    }

    #[test]
    fn ember_vs_gale_neutral() {
        let ember = &CHAMPIONS[2]; // Fire
        let gale = &CHAMPIONS[4]; // Wind
        let gale_state = make_state(4);
        let ember_state = make_state(2);
        let ability = &ember.abilities[0];

        let (_, mult) = calculate_damage(ember, gale, &gale_state, ability, &ember_state);
        assert_eq!(mult, 100);
    }

    #[test]
    fn respects_defense_buffs() {
        let ember = &CHAMPIONS[2];
        let boulder = &CHAMPIONS[1];
        let mut boulder_state = make_state(1);
        let ember_state = make_state(2);

        // Add +6 DEF buff
        boulder_state.buffs[0] = BuffSlot {
            stat: StatType::Defense,
            value: 6,
            turns_remaining: 2,
            is_debuff: false,
            active: true,
        };
        boulder_state.buff_count = 1;

        let ability = &ember.abilities[0];
        let (damage, _) = calculate_damage(ember, boulder, &boulder_state, ability, &ember_state);

        // effective_def = 16 + 6 = 22
        // raw = 25 * 36 * 150 / 2000 = 67
        // 67 - 22 = 45
        assert_eq!(damage, 45);
    }

    #[test]
    fn respects_attack_debuffs() {
        let ember = &CHAMPIONS[2]; // ATK 16
        let boulder = &CHAMPIONS[1]; // DEF 16
        let boulder_state = make_state(1);
        let mut ember_state = make_state(2);

        // Add -4 ATK debuff on attacker
        ember_state.buffs[0] = BuffSlot {
            stat: StatType::Attack,
            value: 4,
            turns_remaining: 2,
            is_debuff: true,
            active: true,
        };
        ember_state.buff_count = 1;

        let ability = &ember.abilities[0];
        let (damage, _) = calculate_damage(ember, boulder, &boulder_state, ability, &ember_state);

        // effective_atk = max(0, 16 - 4) = 12
        // raw = 25 * (20 + 12) * 150 / 2000 = 25 * 32 * 150 / 2000 = 120000 / 2000 = 60
        // 60 - 16 = 44
        assert_eq!(damage, 44);
    }

    #[test]
    fn minimum_1_damage() {
        let gale = &CHAMPIONS[4]; // ATK 15
        let ember = &CHAMPIONS[2]; // DEF 8
        let mut ember_state = make_state(2);
        let gale_state = make_state(4);

        // Give massive defense buff
        ember_state.buffs[0] = BuffSlot {
            stat: StatType::Defense,
            value: 100,
            turns_remaining: 1,
            is_debuff: false,
            active: true,
        };
        ember_state.buff_count = 1;

        // Use a low-power ability (construct one)
        let weak_ability = Ability {
            power: 1,
            ability_type: crate::types::AbilityType::Damage,
            stat: StatType::Defense,
            stat_value: 0,
            duration: 0,
            heal_amount: 0,
            applies_burn: false,
        };

        let (damage, _) = calculate_damage(gale, ember, &ember_state, &weak_ability, &gale_state);
        assert_eq!(damage, 1);
    }

    #[test]
    fn burn_damage_90hp() {
        let state = make_state(2); // Ember: 90 HP
        assert_eq!(calculate_burn_damage(&state), 9);
    }

    #[test]
    fn burn_damage_min_1() {
        let mut state = make_state(0);
        state.max_hp = 5;
        assert_eq!(calculate_burn_damage(&state), 1);
    }

    #[test]
    fn all_matchups_produce_at_least_1_damage() {
        for i in 0..10u8 {
            for j in 0..10u8 {
                let attacker = &CHAMPIONS[i as usize];
                let defender = &CHAMPIONS[j as usize];
                let def_state = make_state(j);
                let atk_state = make_state(i);

                for ability in &attacker.abilities {
                    match ability.ability_type {
                        crate::types::AbilityType::Damage | crate::types::AbilityType::DamageDot => {
                            let (damage, _) =
                                calculate_damage(attacker, defender, &def_state, ability, &atk_state);
                            assert!(damage >= 1, "champion {} vs {} produced 0 damage", i, j);
                        }
                        _ => {}
                    }
                }
            }
        }
    }
}
