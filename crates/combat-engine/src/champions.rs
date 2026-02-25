use crate::types::Element;

// ---------------------------------------------------------------------------
// Struct-of-Arrays champion data — parallel const arrays for minimal WASM size.
// Index = champion ID (0-7).
// ---------------------------------------------------------------------------

pub const HP:      [u32; 8] = [80, 140, 90, 110, 75, 100, 130, 85];
pub const ATTACK:  [u32; 8] = [20, 14, 16, 12, 15, 11, 13, 17];
pub const DEFENSE: [u32; 8] = [5, 16, 8, 12, 6, 14, 15, 7];
pub const SPEED:   [u32; 8] = [16, 5, 14, 10, 18, 9, 7, 15];
pub const ELEMENT: [Element; 8] = [
    Element::Fire, Element::Earth, Element::Fire, Element::Water,
    Element::Wind, Element::Water, Element::Earth, Element::Wind,
];

// ---------------------------------------------------------------------------
// Ability data — 16 entries = 8 champs × 2 abilities.
// Index = champion_id * 2 + ability_index.
//
// Order: Inferno ab0, Inferno ab1, Boulder ab0, Boulder ab1, Ember ab0,
//        Ember ab1, Torrent ab0, Torrent ab1, Gale ab0, Gale ab1,
//        Tide ab0, Tide ab1, Quake ab0, Quake ab1, Storm ab0, Storm ab1
//
// AB_TYPE: 0=Damage, 1=Heal, 2=StatMod
// AB_STAT: 0=Defense, 1=Speed, 2=Attack
// ---------------------------------------------------------------------------

pub const AB_POWER:     [u32; 16] = [35, 20, 28,  0, 25,  0, 22,  0, 24,  0, 20,  0, 26,  0, 30,  0];
pub const AB_TYPE:      [u8; 16]  = [ 0,  0,  0,  2,  0,  2,  0,  1,  0,  2,  0,  2,  0,  2,  0,  2];
pub const AB_STAT:      [u8; 16]  = [ 0,  0,  0,  0,  0,  0,  0,  0,  0,  1,  0,  2,  0,  0,  0,  1];
pub const AB_STAT_VAL:  [u32; 16] = [ 0,  0,  0,  6,  0,  5,  0,  0,  0,  5,  0,  4,  0,  8,  0,  6];
pub const AB_DURATION:  [u32; 16] = [ 0,  0,  0,  2,  0,  2,  0,  0,  0,  2,  0,  2,  0,  1,  0,  2];
pub const AB_HEAL:      [u32; 16] = [ 0,  0,  0,  0,  0,  0,  0, 25,  0,  0,  0,  0,  0,  0,  0,  0];
pub const AB_IS_DEBUFF: [bool; 16] = [
    false, false, false, false, false, false, false, false,
    false, false, false, true,  false, false, false, false,
];

// ---------------------------------------------------------------------------
// Legacy AoS interface — feature-gated for test/library builds only.
// The on-chain build (combat-account) uses SoA arrays directly.
// ---------------------------------------------------------------------------

use crate::types::{Ability, AbilityType, Champion, StatType};

/// Build a Champion struct from the SoA arrays. Used by tests and event-based
/// combat resolution (frontend parity).
pub fn get_champion(id: u8) -> &'static Champion {
    &CHAMPIONS[id as usize]
}

/// Lazily-constructed AoS view for test/library compatibility.
/// This is a compile-time constant so it costs nothing at runtime.
pub const CHAMPIONS: [Champion; 8] = build_champions();

const fn build_champions() -> [Champion; 8] {
    let mut champs = [Champion {
        id: 0,
        hp: 0,
        attack: 0,
        defense: 0,
        speed: 0,
        element: Element::Fire,
        abilities: [Ability {
            power: 0,
            ability_type: AbilityType::Damage,
            stat: StatType::Defense,
            stat_value: 0,
            duration: 0,
            heal_amount: 0,
            is_debuff: false,
        }; 2],
    }; 8];

    let mut i = 0;
    while i < 8 {
        champs[i].id = i as u8;
        champs[i].hp = HP[i];
        champs[i].attack = ATTACK[i];
        champs[i].defense = DEFENSE[i];
        champs[i].speed = SPEED[i];
        champs[i].element = ELEMENT[i];

        let ab0 = i * 2;
        let ab1 = i * 2 + 1;

        champs[i].abilities[0] = Ability {
            power: AB_POWER[ab0],
            ability_type: ab_type_from_u8(AB_TYPE[ab0]),
            stat: stat_from_u8(AB_STAT[ab0]),
            stat_value: AB_STAT_VAL[ab0],
            duration: AB_DURATION[ab0],
            heal_amount: AB_HEAL[ab0],
            is_debuff: AB_IS_DEBUFF[ab0],
        };
        champs[i].abilities[1] = Ability {
            power: AB_POWER[ab1],
            ability_type: ab_type_from_u8(AB_TYPE[ab1]),
            stat: stat_from_u8(AB_STAT[ab1]),
            stat_value: AB_STAT_VAL[ab1],
            duration: AB_DURATION[ab1],
            heal_amount: AB_HEAL[ab1],
            is_debuff: AB_IS_DEBUFF[ab1],
        };

        i += 1;
    }
    champs
}

const fn ab_type_from_u8(v: u8) -> AbilityType {
    match v {
        0 => AbilityType::Damage,
        1 => AbilityType::Heal,
        2 => AbilityType::StatMod,
        _ => AbilityType::Damage, // unreachable in practice
    }
}

const fn stat_from_u8(v: u8) -> StatType {
    match v {
        0 => StatType::Defense,
        1 => StatType::Speed,
        2 => StatType::Attack,
        _ => StatType::Defense, // unreachable in practice
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::Element;

    #[test]
    fn all_8_champions_load() {
        for i in 0..8u8 {
            let c = get_champion(i);
            assert_eq!(c.id, i);
            assert!(c.hp > 0);
        }
    }

    #[test]
    fn inferno_stats() {
        let c = get_champion(0);
        assert_eq!(c.hp, 80);
        assert_eq!(c.attack, 20);
        assert_eq!(c.defense, 5);
        assert_eq!(c.speed, 16);
        assert_eq!(c.element, Element::Fire);
    }

    #[test]
    fn inferno_scorch_is_plain_damage() {
        let c = get_champion(0);
        let scorch = &c.abilities[1];
        assert_eq!(scorch.ability_type, AbilityType::Damage);
        assert_eq!(scorch.power, 20);
    }

    #[test]
    fn soa_matches_aos() {
        for i in 0..8usize {
            let c = &CHAMPIONS[i];
            assert_eq!(c.hp, HP[i]);
            assert_eq!(c.attack, ATTACK[i]);
            assert_eq!(c.defense, DEFENSE[i]);
            assert_eq!(c.speed, SPEED[i]);
            assert_eq!(c.element, ELEMENT[i]);

            for ab in 0..2usize {
                let idx = i * 2 + ab;
                let ability = &c.abilities[ab];
                assert_eq!(ability.power, AB_POWER[idx]);
                assert_eq!(ability.stat_value, AB_STAT_VAL[idx]);
                assert_eq!(ability.duration, AB_DURATION[idx]);
                assert_eq!(ability.heal_amount, AB_HEAL[idx]);
                assert_eq!(ability.is_debuff, AB_IS_DEBUFF[idx]);
            }
        }
    }

    #[test]
    #[should_panic]
    fn panics_on_invalid_id() {
        get_champion(8);
    }
}
