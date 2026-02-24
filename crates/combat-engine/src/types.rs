#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum Element {
    Fire = 0,
    Water = 1,
    Earth = 2,
    Wind = 3,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum AbilityType {
    Damage = 0,
    DamageDot = 1,
    Heal = 2,
    Buff = 3,
    Debuff = 4,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(u8)]
pub enum StatType {
    Defense = 0,
    Speed = 1,
    Attack = 2,
}

#[derive(Clone, Copy)]
pub struct Ability {
    pub power: u32,
    pub ability_type: AbilityType,
    pub stat: StatType,
    pub stat_value: u32,
    pub duration: u32,
    pub heal_amount: u32,
    pub applies_burn: bool,
}

#[derive(Clone, Copy)]
pub struct Champion {
    pub id: u8,
    pub hp: u32,
    pub attack: u32,
    pub defense: u32,
    pub speed: u32,
    pub element: Element,
    pub abilities: [Ability; 2],
}

pub const MAX_BUFFS: usize = 8;

#[derive(Clone, Copy)]
pub struct BuffSlot {
    pub stat: StatType,
    pub value: u32,
    pub turns_remaining: u32,
    pub is_debuff: bool,
    pub active: bool,
}

impl BuffSlot {
    pub const EMPTY: BuffSlot = BuffSlot {
        stat: StatType::Defense,
        value: 0,
        turns_remaining: 0,
        is_debuff: false,
        active: false,
    };
}

#[derive(Clone, Copy)]
pub struct ChampionState {
    pub id: u8,
    pub current_hp: u32,
    pub max_hp: u32,
    pub buffs: [BuffSlot; MAX_BUFFS],
    pub buff_count: u8,
    pub burn_turns: u32,
    pub is_ko: bool,
    pub total_damage_dealt: u32,
}

#[derive(Clone, Copy)]
pub struct TurnAction {
    pub champion_id: u8,
    pub ability_index: u8,
}

pub const MAX_EVENTS: usize = 16;

#[derive(Clone, Copy)]
pub enum TurnEvent {
    Attack {
        attacker_id: u8,
        defender_id: u8,
        damage: u32,
        mult_x100: u32,
    },
    Heal {
        champion_id: u8,
        amount: u32,
        new_hp: u32,
    },
    Buff {
        champion_id: u8,
        stat: StatType,
        value: u32,
        duration: u32,
    },
    Debuff {
        target_id: u8,
        stat: StatType,
        value: u32,
        duration: u32,
    },
    BurnTick {
        champion_id: u8,
        damage: u32,
    },
    Ko {
        champion_id: u8,
    },
    BurnApplied {
        target_id: u8,
        duration: u32,
    },
    None,
}

#[derive(Clone, Copy)]
pub struct TurnResult {
    pub state_a: ChampionState,
    pub state_b: ChampionState,
    pub events: [TurnEvent; MAX_EVENTS],
    pub event_count: u8,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn buff_slot_empty_has_expected_defaults() {
        let slot = BuffSlot::EMPTY;
        assert!(!slot.active);
        assert_eq!(slot.value, 0);
        assert_eq!(slot.turns_remaining, 0);
        assert!(!slot.is_debuff);
    }

    #[test]
    fn champion_state_initialization_roundtrip() {
        let state = ChampionState {
            id: 5,
            current_hp: 100,
            max_hp: 100,
            buffs: [BuffSlot::EMPTY; MAX_BUFFS],
            buff_count: 0,
            burn_turns: 0,
            is_ko: false,
            total_damage_dealt: 0,
        };
        assert_eq!(state.id, 5);
        assert_eq!(state.current_hp, 100);
        assert_eq!(state.max_hp, 100);
        assert_eq!(state.buff_count, 0);
        assert!(!state.is_ko);
        for i in 0..MAX_BUFFS {
            assert!(!state.buffs[i].active);
        }
    }
}
