use crate::types::{BuffSlot, ChampionState, StatType, MAX_BUFFS};

/// Goldilocks prime: p = 2^64 - 2^32 + 1
const GOLDILOCKS_P: u64 = 0xFFFF_FFFF_0000_0001;

/// Pack a ChampionState into 4 u64 values (matching Miden Word/Felt layout).
///
/// Layout:
///   felt0: (current_hp << 32) | max_hp
///   felt1: (is_ko << 32) [| total_damage_dealt if track-damage]
///   felt2: buffs 0-3 packed (4 x 16 bits, buff[0] in MSBs)
///   felt3: 0 (unused)
///
/// `id` and `buff_count` are NOT packed — they are recovered during unpack.
pub fn pack_champion_state(state: &ChampionState) -> [u64; 4] {
    let felt0 = ((state.current_hp as u64) << 32) | (state.max_hp as u64);
    #[cfg(feature = "track-damage")]
    let felt1 = ((state.is_ko as u64) << 32)
        | (state.total_damage_dealt as u64);
    #[cfg(not(feature = "track-damage"))]
    let felt1 = (state.is_ko as u64) << 32;

    assert!(felt0 < GOLDILOCKS_P, "felt0 overflow");
    assert!(felt1 < GOLDILOCKS_P, "felt1 overflow");

    let mut felt2: u64 = 0;
    for i in 0..4usize {
        let packed = pack_single_buff(&state.buffs[i]);
        felt2 |= (packed as u64) << ((3 - i) * 16);
    }

    assert!(felt2 < GOLDILOCKS_P, "buff felt2 overflow");

    [felt0, felt1, felt2, 0]
}

/// Unpack a ChampionState from 4 u64 values.
/// `champion_id` must be provided by the caller (recovered from team array).
/// `buff_count` is recomputed by counting active buff slots.
pub fn unpack_champion_state(word: [u64; 4], champion_id: u8) -> ChampionState {
    let current_hp = (word[0] >> 32) as u32;
    let max_hp = word[0] as u32;
    let is_ko = ((word[1] >> 32) & 1) == 1;

    let mut buffs = [BuffSlot::EMPTY; MAX_BUFFS];

    for i in 0..4usize {
        let bits = ((word[2] >> ((3 - i) * 16)) & 0xFFFF) as u16;
        buffs[i] = unpack_single_buff(bits);
    }

    let mut buff_count: u8 = 0;
    for i in 0..MAX_BUFFS {
        if buffs[i].active {
            buff_count += 1;
        }
    }

    ChampionState {
        id: champion_id,
        current_hp,
        max_hp,
        buffs,
        buff_count,
        is_ko,
        #[cfg(feature = "track-damage")]
        total_damage_dealt: word[1] as u32,
    }
}

/// Pack a single BuffSlot into 16 bits.
/// Layout: stat(2) | is_debuff(1) | value(6) | turns(4) | active(1) | reserved(2)
fn pack_single_buff(buff: &BuffSlot) -> u16 {
    if !buff.active {
        return 0;
    }
    let stat_bits = (buff.stat as u16) & 0x03;
    let debuff_bit = (buff.is_debuff as u16) & 0x01;
    let value_bits = (buff.value as u16) & 0x3F;
    let turns_bits = (buff.turns_remaining as u16) & 0x0F;
    let active_bit: u16 = 1;
    (stat_bits << 14) | (debuff_bit << 13) | (value_bits << 7) | (turns_bits << 3) | (active_bit << 2)
}

/// Unpack a single BuffSlot from 16 bits.
fn unpack_single_buff(bits: u16) -> BuffSlot {
    let active = ((bits >> 2) & 1) == 1;
    if !active {
        return BuffSlot::EMPTY;
    }

    BuffSlot {
        stat: match (bits >> 14) & 0x03 {
            0 => StatType::Defense,
            1 => StatType::Speed,
            2 => StatType::Attack,
            _ => panic!("invalid stat type"),
        },
        is_debuff: ((bits >> 13) & 1) == 1,
        value: ((bits >> 7) & 0x3F) as u32,
        turns_remaining: ((bits >> 3) & 0x0F) as u32,
        active: true,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::combat::init_champion_state;

    #[test]
    fn roundtrip_fresh_champion() {
        for id in 0..8u8 {
            let state = init_champion_state(id);
            let packed = pack_champion_state(&state);
            let unpacked = unpack_champion_state(packed, id);

            assert_eq!(unpacked.id, state.id);
            assert_eq!(unpacked.current_hp, state.current_hp);
            assert_eq!(unpacked.max_hp, state.max_hp);
            assert_eq!(unpacked.is_ko, state.is_ko);
            #[cfg(feature = "track-damage")]
            assert_eq!(unpacked.total_damage_dealt, state.total_damage_dealt);
            assert_eq!(unpacked.buff_count, state.buff_count);
        }
    }

    #[test]
    fn roundtrip_with_buffs_and_damage() {
        let mut state = init_champion_state(0); // Inferno, HP 80
        state.current_hp = 45;
        #[cfg(feature = "track-damage")]
        { state.total_damage_dealt = 137; }
        state.buffs[0] = BuffSlot {
            stat: StatType::Defense,
            value: 6,
            turns_remaining: 2,
            is_debuff: false,
            active: true,
        };
        state.buffs[1] = BuffSlot {
            stat: StatType::Attack,
            value: 4,
            turns_remaining: 1,
            is_debuff: true,
            active: true,
        };
        state.buffs[2] = BuffSlot {
            stat: StatType::Speed,
            value: 5,
            turns_remaining: 3,
            is_debuff: false,
            active: true,
        };
        state.buff_count = 3;

        let packed = pack_champion_state(&state);
        let unpacked = unpack_champion_state(packed, 0);

        assert_eq!(unpacked.current_hp, 45);
        assert_eq!(unpacked.max_hp, 80);
        #[cfg(feature = "track-damage")]
        assert_eq!(unpacked.total_damage_dealt, 137);
        assert_eq!(unpacked.buff_count, 3);
        assert!(!unpacked.is_ko);

        // Check buff 0
        assert!(unpacked.buffs[0].active);
        assert_eq!(unpacked.buffs[0].stat, StatType::Defense);
        assert_eq!(unpacked.buffs[0].value, 6);
        assert_eq!(unpacked.buffs[0].turns_remaining, 2);
        assert!(!unpacked.buffs[0].is_debuff);

        // Check buff 1 (debuff)
        assert!(unpacked.buffs[1].active);
        assert_eq!(unpacked.buffs[1].stat, StatType::Attack);
        assert_eq!(unpacked.buffs[1].value, 4);
        assert_eq!(unpacked.buffs[1].turns_remaining, 1);
        assert!(unpacked.buffs[1].is_debuff);

        // Check buff 2
        assert!(unpacked.buffs[2].active);
        assert_eq!(unpacked.buffs[2].stat, StatType::Speed);
        assert_eq!(unpacked.buffs[2].value, 5);
        assert_eq!(unpacked.buffs[2].turns_remaining, 3);
        assert!(!unpacked.buffs[2].is_debuff);

        // Inactive slots should be empty
        assert!(!unpacked.buffs[3].active);
    }

    #[test]
    fn roundtrip_ko_champion() {
        let mut state = init_champion_state(7); // Storm, HP 85
        state.current_hp = 0;
        state.is_ko = true;
        #[cfg(feature = "track-damage")]
        { state.total_damage_dealt = 250; }

        let packed = pack_champion_state(&state);
        let unpacked = unpack_champion_state(packed, 7);

        assert_eq!(unpacked.current_hp, 0);
        assert!(unpacked.is_ko);
        #[cfg(feature = "track-damage")]
        assert_eq!(unpacked.total_damage_dealt, 250);
        assert_eq!(unpacked.max_hp, 85);
    }

    #[test]
    fn all_8_champions_roundtrip() {
        for id in 0..8u8 {
            let state = init_champion_state(id);
            let packed = pack_champion_state(&state);
            let unpacked = unpack_champion_state(packed, id);

            assert_eq!(unpacked.id, id);
            assert_eq!(unpacked.current_hp, state.current_hp);
            assert_eq!(unpacked.max_hp, state.max_hp);
        }
    }

    #[test]
    fn buff_count_recomputed_correctly() {
        let mut state = init_champion_state(3);
        // Set 3 active buffs in various slots
        for i in [0, 1, 3] {
            state.buffs[i] = BuffSlot {
                stat: StatType::Defense,
                value: 3,
                turns_remaining: 1,
                is_debuff: false,
                active: true,
            };
        }
        state.buff_count = 3;

        let packed = pack_champion_state(&state);
        let unpacked = unpack_champion_state(packed, 3);
        assert_eq!(unpacked.buff_count, 3);
    }

    #[test]
    fn max_buff_values_roundtrip() {
        let mut state = init_champion_state(0);
        // Max representable: value=63, turns=15
        state.buffs[0] = BuffSlot {
            stat: StatType::Attack,
            value: 63,
            turns_remaining: 15,
            is_debuff: true,
            active: true,
        };
        state.buff_count = 1;

        let packed = pack_champion_state(&state);
        let unpacked = unpack_champion_state(packed, 0);
        assert_eq!(unpacked.buffs[0].value, 63);
        assert_eq!(unpacked.buffs[0].turns_remaining, 15);
        assert!(unpacked.buffs[0].is_debuff);
        assert_eq!(unpacked.buffs[0].stat, StatType::Attack);
    }
}
