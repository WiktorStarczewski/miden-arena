#![no_std]
#![feature(alloc_error_handler)]

extern crate alloc;

use miden::{component, Felt, StorageMap, StorageMapAccess, Value, ValueAccess, Word};

#[component]
struct ArenaPrototype {
    /// Simple counter to validate Value storage
    #[storage(description = "Game counter - total games played")]
    game_count: Value,

    /// Map storage to validate keyed lookups (game_id -> state)
    #[storage(description = "Game state map keyed by game ID")]
    game_states: StorageMap,
}

#[component]
impl ArenaPrototype {
    // --- Value storage ---

    /// Read the current game count
    pub fn get_game_count(&self) -> Felt {
        self.game_count.read()
    }

    /// Increment game count and return the new value
    pub fn increment_game_count(&mut self) -> Felt {
        let old: Felt = self.game_count.read();
        let new = old + Felt::from_u32(1);
        self.game_count.write(new);
        new
    }

    // --- Map storage ---

    /// Read game state by game ID
    pub fn get_game_state(&self, game_id: Word) -> Word {
        self.game_states.get(&game_id)
    }

    /// Write game state for a game ID, returns old value
    pub fn set_game_state(&mut self, game_id: Word, state: Word) -> Word {
        self.game_states.set(game_id, state)
    }
}
