use crate::types::{Ability, AbilityType, Champion, Element, StatType};

pub const CHAMPIONS: [Champion; 10] = [
    // 0: Inferno — Fire, HP 80, ATK 20, DEF 5, SPD 16
    Champion {
        id: 0,
        hp: 80,
        attack: 20,
        defense: 5,
        speed: 16,
        element: Element::Fire,
        abilities: [
            Ability {
                power: 35,
                ability_type: AbilityType::Damage,
                stat: StatType::Defense,
                stat_value: 0,
                duration: 0,
                heal_amount: 0,
                applies_burn: false,
            },
            Ability {
                power: 15,
                ability_type: AbilityType::DamageDot,
                stat: StatType::Defense,
                stat_value: 0,
                duration: 3,
                heal_amount: 0,
                applies_burn: true,
            },
        ],
    },
    // 1: Boulder — Earth, HP 140, ATK 14, DEF 16, SPD 5
    Champion {
        id: 1,
        hp: 140,
        attack: 14,
        defense: 16,
        speed: 5,
        element: Element::Earth,
        abilities: [
            Ability {
                power: 28,
                ability_type: AbilityType::Damage,
                stat: StatType::Defense,
                stat_value: 0,
                duration: 0,
                heal_amount: 0,
                applies_burn: false,
            },
            Ability {
                power: 0,
                ability_type: AbilityType::Buff,
                stat: StatType::Defense,
                stat_value: 6,
                duration: 2,
                heal_amount: 0,
                applies_burn: false,
            },
        ],
    },
    // 2: Ember — Fire, HP 90, ATK 16, DEF 8, SPD 14
    Champion {
        id: 2,
        hp: 90,
        attack: 16,
        defense: 8,
        speed: 14,
        element: Element::Fire,
        abilities: [
            Ability {
                power: 25,
                ability_type: AbilityType::Damage,
                stat: StatType::Defense,
                stat_value: 0,
                duration: 0,
                heal_amount: 0,
                applies_burn: false,
            },
            Ability {
                power: 0,
                ability_type: AbilityType::Buff,
                stat: StatType::Defense,
                stat_value: 5,
                duration: 2,
                heal_amount: 0,
                applies_burn: false,
            },
        ],
    },
    // 3: Torrent — Water, HP 110, ATK 12, DEF 12, SPD 10
    Champion {
        id: 3,
        hp: 110,
        attack: 12,
        defense: 12,
        speed: 10,
        element: Element::Water,
        abilities: [
            Ability {
                power: 22,
                ability_type: AbilityType::Damage,
                stat: StatType::Defense,
                stat_value: 0,
                duration: 0,
                heal_amount: 0,
                applies_burn: false,
            },
            Ability {
                power: 0,
                ability_type: AbilityType::Heal,
                stat: StatType::Defense,
                stat_value: 0,
                duration: 0,
                heal_amount: 25,
                applies_burn: false,
            },
        ],
    },
    // 4: Gale — Wind, HP 75, ATK 15, DEF 6, SPD 18
    Champion {
        id: 4,
        hp: 75,
        attack: 15,
        defense: 6,
        speed: 18,
        element: Element::Wind,
        abilities: [
            Ability {
                power: 24,
                ability_type: AbilityType::Damage,
                stat: StatType::Defense,
                stat_value: 0,
                duration: 0,
                heal_amount: 0,
                applies_burn: false,
            },
            Ability {
                power: 0,
                ability_type: AbilityType::Buff,
                stat: StatType::Speed,
                stat_value: 5,
                duration: 2,
                heal_amount: 0,
                applies_burn: false,
            },
        ],
    },
    // 5: Tide — Water, HP 100, ATK 11, DEF 14, SPD 9
    Champion {
        id: 5,
        hp: 100,
        attack: 11,
        defense: 14,
        speed: 9,
        element: Element::Water,
        abilities: [
            Ability {
                power: 20,
                ability_type: AbilityType::Damage,
                stat: StatType::Defense,
                stat_value: 0,
                duration: 0,
                heal_amount: 0,
                applies_burn: false,
            },
            Ability {
                power: 0,
                ability_type: AbilityType::Debuff,
                stat: StatType::Attack,
                stat_value: 4,
                duration: 2,
                heal_amount: 0,
                applies_burn: false,
            },
        ],
    },
    // 6: Quake — Earth, HP 130, ATK 13, DEF 15, SPD 7
    Champion {
        id: 6,
        hp: 130,
        attack: 13,
        defense: 15,
        speed: 7,
        element: Element::Earth,
        abilities: [
            Ability {
                power: 26,
                ability_type: AbilityType::Damage,
                stat: StatType::Defense,
                stat_value: 0,
                duration: 0,
                heal_amount: 0,
                applies_burn: false,
            },
            Ability {
                power: 0,
                ability_type: AbilityType::Buff,
                stat: StatType::Defense,
                stat_value: 8,
                duration: 1,
                heal_amount: 0,
                applies_burn: false,
            },
        ],
    },
    // 7: Storm — Wind, HP 85, ATK 17, DEF 7, SPD 15
    Champion {
        id: 7,
        hp: 85,
        attack: 17,
        defense: 7,
        speed: 15,
        element: Element::Wind,
        abilities: [
            Ability {
                power: 30,
                ability_type: AbilityType::Damage,
                stat: StatType::Defense,
                stat_value: 0,
                duration: 0,
                heal_amount: 0,
                applies_burn: false,
            },
            Ability {
                power: 0,
                ability_type: AbilityType::Buff,
                stat: StatType::Speed,
                stat_value: 6,
                duration: 2,
                heal_amount: 0,
                applies_burn: false,
            },
        ],
    },
    // 8: Phoenix — Fire, HP 65, ATK 22, DEF 4, SPD 17
    Champion {
        id: 8,
        hp: 65,
        attack: 22,
        defense: 4,
        speed: 17,
        element: Element::Fire,
        abilities: [
            Ability {
                power: 38,
                ability_type: AbilityType::Damage,
                stat: StatType::Defense,
                stat_value: 0,
                duration: 0,
                heal_amount: 0,
                applies_burn: false,
            },
            Ability {
                power: 0,
                ability_type: AbilityType::Heal,
                stat: StatType::Defense,
                stat_value: 0,
                duration: 0,
                heal_amount: 30,
                applies_burn: false,
            },
        ],
    },
    // 9: Kraken — Water, HP 120, ATK 10, DEF 16, SPD 6
    Champion {
        id: 9,
        hp: 120,
        attack: 10,
        defense: 16,
        speed: 6,
        element: Element::Water,
        abilities: [
            Ability {
                power: 24,
                ability_type: AbilityType::Damage,
                stat: StatType::Defense,
                stat_value: 0,
                duration: 0,
                heal_amount: 0,
                applies_burn: false,
            },
            Ability {
                power: 0,
                ability_type: AbilityType::Buff,
                stat: StatType::Defense,
                stat_value: 7,
                duration: 2,
                heal_amount: 0,
                applies_burn: false,
            },
        ],
    },
];

pub fn get_champion(id: u8) -> &'static Champion {
    &CHAMPIONS[id as usize]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::Element;

    #[test]
    fn all_10_champions_load() {
        for i in 0..10u8 {
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
    #[should_panic]
    fn panics_on_invalid_id() {
        get_champion(10);
    }
}
