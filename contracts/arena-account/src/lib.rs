#![no_std]
#![feature(alloc_error_handler)]

extern crate alloc;

use miden::{component, Felt, Value, ValueAccess, Word};

use combat_engine::champions::get_champion;
use combat_engine::combat::init_champion_state;
use combat_engine::damage::{calculate_burn_damage, calculate_damage, sum_buffs};
use combat_engine::pack::{pack_champion_state, unpack_champion_state};
use combat_engine::types::{AbilityType, BuffSlot, ChampionState, StatType, MAX_BUFFS};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STAKE_AMOUNT: u64 = 10_000_000;
const TIMEOUT_BLOCKS: u64 = 900;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn felt_zero() -> Felt {
    Felt::from_u32(0)
}

fn empty_word() -> Word {
    Word::new([felt_zero(), felt_zero(), felt_zero(), felt_zero()])
}

fn word_is_empty(w: &Word) -> bool {
    w[0] == felt_zero() && w[1] == felt_zero() && w[2] == felt_zero() && w[3] == felt_zero()
}

fn u64_to_felt(v: u64) -> Felt {
    Felt::from_u64_unchecked(v)
}

fn word_to_u64_array(w: &Word) -> [u64; 4] {
    [w[0].as_u64(), w[1].as_u64(), w[2].as_u64(), w[3].as_u64()]
}

fn u64_array_to_word(a: [u64; 4]) -> Word {
    Word::new([
        u64_to_felt(a[0]),
        u64_to_felt(a[1]),
        u64_to_felt(a[2]),
        u64_to_felt(a[3]),
    ])
}

// ---------------------------------------------------------------------------
// Move decoding
// ---------------------------------------------------------------------------

struct TurnAction {
    champion_id: u8,
    ability_index: u8,
}

fn decode_move(encoded: u32) -> TurnAction {
    TurnAction {
        champion_id: ((encoded - 1) / 2) as u8,
        ability_index: ((encoded - 1) % 2) as u8,
    }
}

// ---------------------------------------------------------------------------
// Arena Account Component — 21 storage slots
// ---------------------------------------------------------------------------

#[component]
struct ArenaAccount {
    #[storage(description = "0=waiting,1=player_a_joined,2=both_joined,3=combat,4=resolved")]
    game_state: Value,
    #[storage(description = "Player A account ID")]
    player_a: Value,
    #[storage(description = "Player B account ID")]
    player_b: Value,
    #[storage(description = "Player A team [c0, c1, c2, 0]")]
    team_a: Value,
    #[storage(description = "Player B team [c0, c1, c2, 0]")]
    team_b: Value,
    #[storage(description = "Current round number")]
    round: Value,
    #[storage(description = "Player A move commit hash")]
    move_a_commit: Value,
    #[storage(description = "Player B move commit hash")]
    move_b_commit: Value,
    #[storage(description = "Player A move reveal")]
    move_a_reveal: Value,
    #[storage(description = "Player B move reveal")]
    move_b_reveal: Value,
    #[storage(description = "Player A champion 0 state")]
    champ_a_0: Value,
    #[storage(description = "Player A champion 1 state")]
    champ_a_1: Value,
    #[storage(description = "Player A champion 2 state")]
    champ_a_2: Value,
    #[storage(description = "Player B champion 0 state")]
    champ_b_0: Value,
    #[storage(description = "Player B champion 1 state")]
    champ_b_1: Value,
    #[storage(description = "Player B champion 2 state")]
    champ_b_2: Value,
    #[storage(description = "Timeout block height")]
    timeout_height: Value,
    #[storage(description = "0=undecided,1=player_a,2=player_b,3=draw")]
    winner: Value,
    #[storage(description = "Player A stake amount")]
    stake_a: Value,
    #[storage(description = "Player B stake amount")]
    stake_b: Value,
    #[storage(description = "Bitfield: bit0=team_a set, bit1=team_b set")]
    teams_submitted: Value,
}

#[component]
impl ArenaAccount {
    // -----------------------------------------------------------------------
    // Champion state storage helpers
    // -----------------------------------------------------------------------

    fn read_champ_state(&self, slot_index: u8, champion_id: u8) -> ChampionState {
        let w: Word = match slot_index {
            10 => self.champ_a_0.read(),
            11 => self.champ_a_1.read(),
            12 => self.champ_a_2.read(),
            13 => self.champ_b_0.read(),
            14 => self.champ_b_1.read(),
            15 => self.champ_b_2.read(),
            _ => panic!("invalid champion slot"),
        };
        unpack_champion_state(word_to_u64_array(&w), champion_id)
    }

    fn write_champ_state(&mut self, slot_index: u8, state: &ChampionState) {
        let packed = pack_champion_state(state);
        let w = u64_array_to_word(packed);
        match slot_index {
            10 => { self.champ_a_0.write(w); }
            11 => { self.champ_a_1.write(w); }
            12 => { self.champ_a_2.write(w); }
            13 => { self.champ_b_0.write(w); }
            14 => { self.champ_b_1.write(w); }
            15 => { self.champ_b_2.write(w); }
            _ => panic!("invalid champion slot"),
        }
    }

    fn init_champ_in_storage(&mut self, slot_index: u8, champion_id: u8) {
        let state = init_champion_state(champion_id);
        self.write_champ_state(slot_index, &state);
    }

    fn find_team_slot(&self, is_player_a: bool, champion_id: u8) -> u8 {
        let team: Word = if is_player_a {
            self.team_a.read()
        } else {
            self.team_b.read()
        };
        let base_slot: u8 = if is_player_a { 10 } else { 13 };
        for i in 0..3u8 {
            if team[i as usize].as_u64() as u8 == champion_id {
                return base_slot + i;
            }
        }
        panic!("champion not on team");
    }

    fn load_team_states_a(&self) -> [ChampionState; 3] {
        let team: Word = self.team_a.read();
        [
            self.read_champ_state(10, team[0].as_u64() as u8),
            self.read_champ_state(11, team[1].as_u64() as u8),
            self.read_champ_state(12, team[2].as_u64() as u8),
        ]
    }

    fn load_team_states_b(&self) -> [ChampionState; 3] {
        let team: Word = self.team_b.read();
        [
            self.read_champ_state(13, team[0].as_u64() as u8),
            self.read_champ_state(14, team[1].as_u64() as u8),
            self.read_champ_state(15, team[2].as_u64() as u8),
        ]
    }

    fn teams_all_ko(states: &[ChampionState; 3]) -> bool {
        states[0].is_ko && states[1].is_ko && states[2].is_ko
    }

    // -----------------------------------------------------------------------
    // join — first or second player joins the arena
    // -----------------------------------------------------------------------

    pub fn join(&mut self, player_id: Felt, stake: Felt) {
        let stake_val = stake.as_u64();
        assert!(stake_val == STAKE_AMOUNT, "incorrect stake amount");

        let state: Felt = self.game_state.read();
        let state_val = state.as_u64();

        match state_val {
            0 => {
                self.player_a.write(player_id);
                self.stake_a.write(stake);
                self.game_state.write(u64_to_felt(1));
                // TODO: timeout_height = current_block + TIMEOUT_BLOCKS
                self.timeout_height.write(u64_to_felt(TIMEOUT_BLOCKS));
            }
            1 => {
                let existing_a: Felt = self.player_a.read();
                assert!(existing_a.as_u64() != player_id.as_u64(), "cannot play yourself");
                self.player_b.write(player_id);
                self.stake_b.write(stake);
                self.game_state.write(u64_to_felt(2));
                self.timeout_height.write(u64_to_felt(TIMEOUT_BLOCKS));
            }
            _ => panic!("game already full"),
        }
    }

    // -----------------------------------------------------------------------
    // set_team — player submits their team of 3 champions
    // -----------------------------------------------------------------------

    pub fn set_team(&mut self, player_id: Felt, c0: Felt, c1: Felt, c2: Felt) {
        let state: Felt = self.game_state.read();
        assert!(state.as_u64() == 2, "must be in both_joined state");

        let pid = player_id.as_u64();
        let pa: Felt = self.player_a.read();
        let pb: Felt = self.player_b.read();
        let is_player_a = pid == pa.as_u64();
        assert!(is_player_a || pid == pb.as_u64(), "not a player in this game");

        let teams_sub_felt: Felt = self.teams_submitted.read();
        let teams_sub = teams_sub_felt.as_u64();
        let my_bit: u64 = if is_player_a { 0b01 } else { 0b10 };
        assert!(teams_sub & my_bit == 0, "team already submitted");

        let c0_id = c0.as_u64() as u8;
        let c1_id = c1.as_u64() as u8;
        let c2_id = c2.as_u64() as u8;

        assert!(c0_id <= 9 && c1_id <= 9 && c2_id <= 9, "invalid champion ID");
        assert!(
            c0_id != c1_id && c0_id != c2_id && c1_id != c2_id,
            "duplicate champion"
        );

        // Check overlap with opponent's team if already set
        let opp_set = if is_player_a {
            teams_sub & 0b10 != 0
        } else {
            teams_sub & 0b01 != 0
        };
        if opp_set {
            let opp: Word = if is_player_a {
                self.team_b.read()
            } else {
                self.team_a.read()
            };
            let o0 = opp[0].as_u64() as u8;
            let o1 = opp[1].as_u64() as u8;
            let o2 = opp[2].as_u64() as u8;
            assert!(c0_id != o0 && c0_id != o1 && c0_id != o2, "champion overlap");
            assert!(c1_id != o0 && c1_id != o1 && c1_id != o2, "champion overlap");
            assert!(c2_id != o0 && c2_id != o1 && c2_id != o2, "champion overlap");
        }

        let team_word = Word::new([c0, c1, c2, felt_zero()]);

        if is_player_a {
            self.team_a.write(team_word);
            self.init_champ_in_storage(10, c0_id);
            self.init_champ_in_storage(11, c1_id);
            self.init_champ_in_storage(12, c2_id);
        } else {
            self.team_b.write(team_word);
            self.init_champ_in_storage(13, c0_id);
            self.init_champ_in_storage(14, c1_id);
            self.init_champ_in_storage(15, c2_id);
        }

        let new_teams_sub = teams_sub | my_bit;
        self.teams_submitted.write(u64_to_felt(new_teams_sub));

        if new_teams_sub == 0b11 {
            self.game_state.write(u64_to_felt(3));
            // TODO: timeout_height = current_block + TIMEOUT_BLOCKS
            self.timeout_height.write(u64_to_felt(TIMEOUT_BLOCKS));
        }
    }

    // -----------------------------------------------------------------------
    // submit_commit — player submits a hash commitment for their move
    // -----------------------------------------------------------------------

    pub fn submit_commit(&mut self, player_id: Felt, hash_part1: Felt, hash_part2: Felt) {
        let state: Felt = self.game_state.read();
        assert!(state.as_u64() == 3, "must be in combat state");

        let pid = player_id.as_u64();
        let pa: Felt = self.player_a.read();
        let pb: Felt = self.player_b.read();
        let is_player_a = pid == pa.as_u64();
        assert!(is_player_a || pid == pb.as_u64(), "not a player in this game");

        let existing: Word = if is_player_a {
            self.move_a_commit.read()
        } else {
            self.move_b_commit.read()
        };
        assert!(word_is_empty(&existing), "already committed this round");

        let commit_word = Word::new([hash_part1, hash_part2, felt_zero(), felt_zero()]);
        if is_player_a {
            self.move_a_commit.write(commit_word);
        } else {
            self.move_b_commit.write(commit_word);
        }
    }

    // -----------------------------------------------------------------------
    // submit_reveal — player reveals their move (SHA-256 verification deferred)
    // -----------------------------------------------------------------------

    pub fn submit_reveal(
        &mut self,
        player_id: Felt,
        encoded_move: Felt,
        nonce_p1: Felt,
        nonce_p2: Felt,
    ) {
        let state: Felt = self.game_state.read();
        assert!(state.as_u64() == 3, "must be in combat state");

        let pid = player_id.as_u64();
        let pa: Felt = self.player_a.read();
        let pb: Felt = self.player_b.read();
        let is_player_a = pid == pa.as_u64();
        assert!(is_player_a || pid == pb.as_u64(), "not a player in this game");

        // Must have committed
        let commitment: Word = if is_player_a {
            self.move_a_commit.read()
        } else {
            self.move_b_commit.read()
        };
        assert!(!word_is_empty(&commitment), "must commit before revealing");

        // Must not have already revealed
        let existing_reveal: Word = if is_player_a {
            self.move_a_reveal.read()
        } else {
            self.move_b_reveal.read()
        };
        assert!(word_is_empty(&existing_reveal), "already revealed this round");

        // TODO: SHA-256 hash verification
        // Verify hash(encoded_move || nonce) matches commitment

        // Validate move legality
        let em = encoded_move.as_u64() as u32;
        assert!(em >= 1 && em <= 20, "move out of range");

        let action = decode_move(em);
        let team: Word = if is_player_a {
            self.team_a.read()
        } else {
            self.team_b.read()
        };

        // Verify champion is on this player's team
        let mut found = false;
        let mut slot_idx: u8 = 0;
        for i in 0..3u8 {
            if team[i as usize].as_u64() as u8 == action.champion_id {
                found = true;
                slot_idx = if is_player_a { 10 + i } else { 13 + i };
            }
        }
        assert!(found, "champion not on player's team");

        // Verify champion is alive
        let champ_state = self.read_champ_state(slot_idx, action.champion_id);
        assert!(!champ_state.is_ko, "cannot act with KO'd champion");

        // Store reveal
        let reveal_word = Word::new([encoded_move, nonce_p1, nonce_p2, felt_zero()]);
        if is_player_a {
            self.move_a_reveal.write(reveal_word);
        } else {
            self.move_b_reveal.write(reveal_word);
        }

        // If both reveals are present, resolve
        let rev_a: Word = self.move_a_reveal.read();
        let rev_b: Word = self.move_b_reveal.read();
        if !word_is_empty(&rev_a) && !word_is_empty(&rev_b) {
            self.resolve_current_turn();
        }
    }

    // -----------------------------------------------------------------------
    // resolve_current_turn — inlined combat resolution
    //
    // Due to a Miden compiler bug (v0.7.1), all mutation of ChampionState
    // MUST be physically inlined. Function calls that pass &mut ChampionState
    // silently lose mutations. Immutable-ref calls (calculate_damage,
    // sum_buffs, etc.) work fine.
    // -----------------------------------------------------------------------

    fn resolve_current_turn(&mut self) {
        // 1. Decode moves from reveals
        let rev_a: Word = self.move_a_reveal.read();
        let rev_b: Word = self.move_b_reveal.read();
        let move_a = rev_a[0].as_u64() as u32;
        let move_b = rev_b[0].as_u64() as u32;
        let action_a = decode_move(move_a);
        let action_b = decode_move(move_b);

        // 2. Map champion IDs to storage slots and load states
        let slot_a = self.find_team_slot(true, action_a.champion_id);
        let slot_b = self.find_team_slot(false, action_b.champion_id);
        let mut state_a = self.read_champ_state(slot_a, action_a.champion_id);
        let mut state_b = self.read_champ_state(slot_b, action_b.champion_id);

        // 3. Defense-in-depth: verify both alive
        assert!(!state_a.is_ko, "player A's champion is KO'd");
        assert!(!state_b.is_ko, "player B's champion is KO'd");

        // 4. Get champion definitions
        let champ_a = get_champion(action_a.champion_id);
        let champ_b = get_champion(action_b.champion_id);
        let ability_a = &champ_a.abilities[action_a.ability_index as usize];
        let ability_b = &champ_b.abilities[action_b.ability_index as usize];

        // 5. Speed priority
        let speed_a = champ_a.speed + sum_buffs(&state_a, StatType::Speed);
        let speed_b = champ_b.speed + sum_buffs(&state_b, StatType::Speed);
        let a_goes_first =
            speed_a > speed_b || (speed_a == speed_b && champ_a.id < champ_b.id);

        // 6. Execute actions in speed order — ALL MUTATION INLINED
        if a_goes_first {
            // --- A acts on B ---
            inline_execute_action(champ_a, &mut state_a, ability_a, champ_b, &mut state_b);
            // --- B acts on A (if B alive) ---
            if !state_b.is_ko {
                inline_execute_action(champ_b, &mut state_b, ability_b, champ_a, &mut state_a);
            }
        } else {
            // --- B acts on A ---
            inline_execute_action(champ_b, &mut state_b, ability_b, champ_a, &mut state_a);
            // --- A acts on B (if A alive) ---
            if !state_a.is_ko {
                inline_execute_action(champ_a, &mut state_a, ability_a, champ_b, &mut state_b);
            }
        }

        // 7. Burn ticks (deterministic order: A then B) — INLINED
        if state_a.burn_turns > 0 && !state_a.is_ko {
            let bd = calculate_burn_damage(&state_a);
            state_a.current_hp = state_a.current_hp.saturating_sub(bd);
            state_a.burn_turns -= 1;
            if state_a.current_hp == 0 {
                state_a.is_ko = true;
            }
        }
        if state_b.burn_turns > 0 && !state_b.is_ko {
            let bd = calculate_burn_damage(&state_b);
            state_b.current_hp = state_b.current_hp.saturating_sub(bd);
            state_b.burn_turns -= 1;
            if state_b.current_hp == 0 {
                state_b.is_ko = true;
            }
        }

        // 8. Tick down buff durations — INLINED
        for i in 0..MAX_BUFFS {
            if state_a.buffs[i].active {
                state_a.buffs[i].turns_remaining -= 1;
                if state_a.buffs[i].turns_remaining == 0 {
                    state_a.buffs[i].active = false;
                    state_a.buff_count = state_a.buff_count.saturating_sub(1);
                }
            }
        }
        for i in 0..MAX_BUFFS {
            if state_b.buffs[i].active {
                state_b.buffs[i].turns_remaining -= 1;
                if state_b.buffs[i].turns_remaining == 0 {
                    state_b.buffs[i].active = false;
                    state_b.buff_count = state_b.buff_count.saturating_sub(1);
                }
            }
        }

        // 9. Write updated states back to storage
        self.write_champ_state(slot_a, &state_a);
        self.write_champ_state(slot_b, &state_b);

        // 10. Check for team elimination
        let team_a_states = self.load_team_states_a();
        let team_b_states = self.load_team_states_b();
        let a_elim = Self::teams_all_ko(&team_a_states);
        let b_elim = Self::teams_all_ko(&team_b_states);

        if a_elim || b_elim {
            let winner_val: u64 = if a_elim && b_elim {
                3 // draw
            } else if b_elim {
                1 // player_a wins
            } else {
                2 // player_b wins
            };
            self.winner.write(u64_to_felt(winner_val));
            self.game_state.write(u64_to_felt(4));

            // TODO: send_p2id payouts
        } else {
            // Reset for next round
            let round_felt: Felt = self.round.read();
            self.round.write(u64_to_felt(round_felt.as_u64() + 1));
            self.move_a_commit.write(empty_word());
            self.move_b_commit.write(empty_word());
            self.move_a_reveal.write(empty_word());
            self.move_b_reveal.write(empty_word());
            // TODO: timeout_height = current_block + TIMEOUT_BLOCKS
            self.timeout_height.write(u64_to_felt(TIMEOUT_BLOCKS));
        }
    }

    // -----------------------------------------------------------------------
    // claim_timeout — handle abandoned games (P2ID note creation deferred)
    // -----------------------------------------------------------------------

    pub fn claim_timeout(&mut self, player_id: Felt) {
        let state: Felt = self.game_state.read();
        let state_val = state.as_u64();
        assert!(state_val >= 1 && state_val <= 3, "game not active");

        // TODO: verify current_block > timeout_height
        // let current_block = tx::block_number();
        // let timeout: Felt = self.timeout_height.read();
        // assert!(current_block > timeout.as_u64(), "timeout not reached");

        let pid = player_id.as_u64();

        match state_val {
            1 => {
                // Only player A has joined
                let pa: Felt = self.player_a.read();
                assert!(pid == pa.as_u64(), "only player A can claim in state 1");
                // TODO: send_p2id(player_a, stake_a)
            }
            2 => {
                // Both joined, teams phase — refund both
                let pa: Felt = self.player_a.read();
                let pb: Felt = self.player_b.read();
                assert!(
                    pid == pa.as_u64() || pid == pb.as_u64(),
                    "not a player in this game"
                );
                // TODO: send_p2id(player_a, stake_a)
                // TODO: send_p2id(player_b, stake_b)
            }
            3 => {
                // Combat phase — determine who is inactive
                let pa: Felt = self.player_a.read();
                let pb: Felt = self.player_b.read();
                assert!(
                    pid == pa.as_u64() || pid == pb.as_u64(),
                    "not a player in this game"
                );

                let commit_a: Word = self.move_a_commit.read();
                let commit_b: Word = self.move_b_commit.read();
                let reveal_a: Word = self.move_a_reveal.read();
                let reveal_b: Word = self.move_b_reveal.read();

                let a_progress: u64 = if !word_is_empty(&reveal_a) {
                    2
                } else if !word_is_empty(&commit_a) {
                    1
                } else {
                    0
                };
                let b_progress: u64 = if !word_is_empty(&reveal_b) {
                    2
                } else if !word_is_empty(&commit_b) {
                    1
                } else {
                    0
                };

                if a_progress > b_progress {
                    self.winner.write(u64_to_felt(1));
                    // TODO: send_p2id(player_a, stake_a + stake_b)
                } else if b_progress > a_progress {
                    self.winner.write(u64_to_felt(2));
                    // TODO: send_p2id(player_b, stake_a + stake_b)
                } else {
                    self.winner.write(u64_to_felt(3));
                    // TODO: send_p2id(player_a, stake_a)
                    // TODO: send_p2id(player_b, stake_b)
                }
            }
            _ => panic!("invalid state for timeout"),
        }

        self.game_state.write(u64_to_felt(4));
    }
}

// ---------------------------------------------------------------------------
// Inlined action execution — free function to avoid &mut self conflicts
//
// NOTE: This function takes &mut ChampionState. Whether the Miden compiler
// bug affects this depends on whether it's inlined by LLVM into
// resolve_current_turn. If the bug manifests, this logic must be copy-pasted
// directly into resolve_current_turn. For now, we keep it as a free function
// for readability — the combat-test proved that direct field mutation works
// when calculate_damage is called as a cross-crate immutable-ref function.
// ---------------------------------------------------------------------------

fn inline_execute_action(
    actor_champ: &combat_engine::types::Champion,
    actor_state: &mut ChampionState,
    ability: &combat_engine::types::Ability,
    target_champ: &combat_engine::types::Champion,
    target_state: &mut ChampionState,
) {
    match ability.ability_type {
        AbilityType::Damage => {
            let (dmg, _) =
                calculate_damage(actor_champ, target_champ, target_state, ability, actor_state);
            target_state.current_hp = target_state.current_hp.saturating_sub(dmg);
            actor_state.total_damage_dealt += dmg;
            if target_state.current_hp == 0 {
                target_state.is_ko = true;
            }
        }
        AbilityType::DamageDot => {
            let (dmg, _) =
                calculate_damage(actor_champ, target_champ, target_state, ability, actor_state);
            target_state.current_hp = target_state.current_hp.saturating_sub(dmg);
            actor_state.total_damage_dealt += dmg;
            if target_state.current_hp == 0 {
                target_state.is_ko = true;
            }
            if ability.applies_burn && ability.duration > 0 && !target_state.is_ko {
                target_state.burn_turns = ability.duration;
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
        }
        AbilityType::Buff => {
            if ability.stat_value > 0 && ability.duration > 0 {
                let slot = BuffSlot {
                    stat: ability.stat,
                    value: ability.stat_value,
                    turns_remaining: ability.duration,
                    is_debuff: false,
                    active: true,
                };
                let mut inserted = false;
                for i in 0..MAX_BUFFS {
                    if !actor_state.buffs[i].active && !inserted {
                        actor_state.buffs[i] = slot;
                        actor_state.buff_count += 1;
                        inserted = true;
                    }
                }
                assert!(inserted, "buff array full");
            }
        }
        AbilityType::Debuff => {
            if ability.stat_value > 0 && ability.duration > 0 {
                let slot = BuffSlot {
                    stat: ability.stat,
                    value: ability.stat_value,
                    turns_remaining: ability.duration,
                    is_debuff: true,
                    active: true,
                };
                let mut inserted = false;
                for i in 0..MAX_BUFFS {
                    if !target_state.buffs[i].active && !inserted {
                        target_state.buffs[i] = slot;
                        target_state.buff_count += 1;
                        inserted = true;
                    }
                }
                assert!(inserted, "buff array full");
            }
        }
    }
}
