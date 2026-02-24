use crate::types::Element;

/// Element advantage cycle: Fire -> Earth -> Wind -> Water -> Fire
/// Returns multiplier x100: 150 = super effective, 67 = resisted, 100 = neutral
pub fn get_type_multiplier(attacker: Element, defender: Element) -> u32 {
    if attacker == defender {
        return 100;
    }

    let attacker_beats = match attacker {
        Element::Fire => Element::Earth,
        Element::Earth => Element::Wind,
        Element::Wind => Element::Water,
        Element::Water => Element::Fire,
    };

    let defender_beats = match defender {
        Element::Fire => Element::Earth,
        Element::Earth => Element::Wind,
        Element::Wind => Element::Water,
        Element::Water => Element::Fire,
    };

    if attacker_beats == defender {
        150
    } else if defender_beats == attacker {
        67
    } else {
        100
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn all_16_element_pairs() {
        use Element::*;
        // Same element = 100
        assert_eq!(get_type_multiplier(Fire, Fire), 100);
        assert_eq!(get_type_multiplier(Water, Water), 100);
        assert_eq!(get_type_multiplier(Earth, Earth), 100);
        assert_eq!(get_type_multiplier(Wind, Wind), 100);

        // Advantages = 150
        assert_eq!(get_type_multiplier(Fire, Earth), 150);
        assert_eq!(get_type_multiplier(Earth, Wind), 150);
        assert_eq!(get_type_multiplier(Wind, Water), 150);
        assert_eq!(get_type_multiplier(Water, Fire), 150);

        // Disadvantages = 67
        assert_eq!(get_type_multiplier(Earth, Fire), 67);
        assert_eq!(get_type_multiplier(Wind, Earth), 67);
        assert_eq!(get_type_multiplier(Water, Wind), 67);
        assert_eq!(get_type_multiplier(Fire, Water), 67);

        // Neutral (non-adjacent in cycle) = 100
        assert_eq!(get_type_multiplier(Fire, Wind), 100);
        assert_eq!(get_type_multiplier(Wind, Fire), 100);
        assert_eq!(get_type_multiplier(Water, Earth), 100);
        assert_eq!(get_type_multiplier(Earth, Water), 100);
    }
}
