use crate::types::TurnAction;

/// Encode a turn action into an amount value.
/// Formula: champion_id * 2 + ability_index + 1, range [1, 16]
pub fn encode_move(action: &TurnAction) -> u32 {
    let encoded = (action.champion_id as u32) * 2 + (action.ability_index as u32) + 1;
    assert!(
        (1..=16).contains(&encoded),
        "invalid move encoding: champion={}, ability={}",
        action.champion_id,
        action.ability_index
    );
    encoded
}

/// Decode an amount value back into a turn action.
/// Input range: [1, 16]
pub fn decode_move(amount: u32) -> TurnAction {
    assert!(
        (1..=16).contains(&amount),
        "invalid move amount: {}",
        amount
    );
    let value = amount - 1;
    TurnAction {
        champion_id: (value / 2) as u8,
        ability_index: (value % 2) as u8,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_all_valid_moves() {
        for champ_id in 0..=7u8 {
            for ability_idx in 0..=1u8 {
                let action = TurnAction {
                    champion_id: champ_id,
                    ability_index: ability_idx,
                };
                let encoded = encode_move(&action);
                assert!(encoded >= 1 && encoded <= 16);
                let decoded = decode_move(encoded);
                assert_eq!(decoded.champion_id, champ_id);
                assert_eq!(decoded.ability_index, ability_idx);
            }
        }
    }

    #[test]
    fn specific_encode_values() {
        // (0,0) -> 1
        assert_eq!(
            encode_move(&TurnAction { champion_id: 0, ability_index: 0 }),
            1
        );
        // (0,1) -> 2
        assert_eq!(
            encode_move(&TurnAction { champion_id: 0, ability_index: 1 }),
            2
        );
        // (7,1) -> 16
        assert_eq!(
            encode_move(&TurnAction { champion_id: 7, ability_index: 1 }),
            16
        );
    }

    #[test]
    #[should_panic]
    fn decode_rejects_zero() {
        decode_move(0);
    }

    #[test]
    #[should_panic]
    fn decode_rejects_17() {
        decode_move(17);
    }
}
