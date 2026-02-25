#![no_std]
#![feature(alloc_error_handler)]

extern crate alloc;

use miden::{
    asset, component, hash_elements, output_note, tx, AccountId, Asset, Digest, Felt, NoteType,
    Recipient, Tag, Value, ValueAccess, Word,
};

use combat_engine::champions::{
    HP, ATTACK, DEFENSE, SPEED, ELEMENT,
    AB_POWER, AB_TYPE, AB_STAT, AB_STAT_VAL, AB_DURATION, AB_HEAL, AB_IS_DEBUFF,
};
use combat_engine::damage::{sum_buffs, sum_debuffs};
use combat_engine::elements::get_type_multiplier;
use combat_engine::pack::{pack_champion_state, unpack_champion_state};
use combat_engine::types::{BuffSlot, ChampionState, StatType, MAX_BUFFS};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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
// Move decoding (inline — same as codec.rs but avoids importing the module)
// ---------------------------------------------------------------------------

struct TurnAction {
    champion_id: u8,
    ability_index: u8,
}

fn decode_move(encoded: u32) -> TurnAction {
    assert!(encoded >= 1 && encoded <= 16, "invalid encoded move");
    TurnAction {
        champion_id: ((encoded - 1) / 2) as u8,
        ability_index: ((encoded - 1) % 2) as u8,
    }
}

// ---------------------------------------------------------------------------
// Champion state init using SoA arrays (no get_champion / Champion struct)
// ---------------------------------------------------------------------------

fn init_champion_state(champion_id: u8) -> ChampionState {
    let idx = champion_id as usize;
    ChampionState {
        id: champion_id,
        current_hp: HP[idx],
        max_hp: HP[idx],
        buffs: [BuffSlot::EMPTY; MAX_BUFFS],
        buff_count: 0,
        is_ko: false,
    }
}

// ---------------------------------------------------------------------------
// Combat Account Component — 20 storage slots
// ---------------------------------------------------------------------------

#[component]
struct CombatAccount {
    #[storage(description = "0=idle,1=active,2=resolved")]
    combat_state: Value,
    #[storage(description = "Player A account ID [prefix, suffix, 0, 0]")]
    player_a: Value,
    #[storage(description = "Player B account ID [prefix, suffix, 0, 0]")]
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
    #[storage(description = "Matchmaking account ID [prefix, suffix, 0, 0] - reserved")]
    matchmaking_id: Value,
    #[storage(description = "Result note script digest [d0, d1, d2, d3]")]
    result_script_hash: Value,
    #[storage(description = "Faucet AccountId [prefix, suffix, 0, 0] for dust asset")]
    faucet_id: Value,
}

#[component]
impl CombatAccount {
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
    // send_result_note — create a dust-asset note to matchmaking with winner
    // -----------------------------------------------------------------------

    fn send_result_note(&self, winner_val: u64) {
        let serial_num = Word::from_u64_unchecked(3_000_000 + winner_val, 0, 0, 0);
        let script_hash: Word = self.result_script_hash.read();
        let script_digest = Digest::from_word(script_hash);

        // Result note inputs: [winner_val]
        let inputs = alloc::vec![u64_to_felt(winner_val)];
        let recipient = Recipient::compute(serial_num, script_digest, inputs);

        let tag = Tag::from(felt_zero());
        let note_type = NoteType::from(u64_to_felt(1)); // public
        let note_idx = output_note::create(tag, note_type, recipient);

        // Dust asset (1 unit) to make the note valid
        let faucet_word: Word = self.faucet_id.read();
        let faucet = AccountId::new(faucet_word[0], faucet_word[1]);
        let fungible_asset = asset::build_fungible_asset(faucet, u64_to_felt(1));
        output_note::add_asset(fungible_asset, note_idx);
    }

    // -----------------------------------------------------------------------
    // Public procedures
    // -----------------------------------------------------------------------

    // -----------------------------------------------------------------------
    // init_combat — initialize combat with game data from init-combat-note
    // -----------------------------------------------------------------------

    pub fn init_combat(
        &mut self,
        _sender_prefix: Felt,
        _sender_suffix: Felt,
        pa_prefix: Felt,
        pa_suffix: Felt,
        pb_prefix: Felt,
        pb_suffix: Felt,
        c0a: Felt,
        c1a: Felt,
        c2a: Felt,
        c0b: Felt,
        c1b: Felt,
        c2b: Felt,
    ) {
        // One-time init — prevents replay
        let state: Felt = self.combat_state.read();
        assert!(state.as_u64() == 0, "combat already initialized");

        // Validate champion IDs
        let c0a_id = c0a.as_u64() as u8;
        let c1a_id = c1a.as_u64() as u8;
        let c2a_id = c2a.as_u64() as u8;
        let c0b_id = c0b.as_u64() as u8;
        let c1b_id = c1b.as_u64() as u8;
        let c2b_id = c2b.as_u64() as u8;

        assert!(
            c0a_id <= 7 && c1a_id <= 7 && c2a_id <= 7
            && c0b_id <= 7 && c1b_id <= 7 && c2b_id <= 7,
            "invalid champion ID"
        );

        // No duplicates within teams
        assert!(
            c0a_id != c1a_id && c0a_id != c2a_id && c1a_id != c2a_id,
            "duplicate champion in team A"
        );
        assert!(
            c0b_id != c1b_id && c0b_id != c2b_id && c1b_id != c2b_id,
            "duplicate champion in team B"
        );

        // No overlap between teams
        assert!(
            c0a_id != c0b_id && c0a_id != c1b_id && c0a_id != c2b_id
            && c1a_id != c0b_id && c1a_id != c1b_id && c1a_id != c2b_id
            && c2a_id != c0b_id && c2a_id != c1b_id && c2a_id != c2b_id,
            "champion overlap between teams"
        );

        // Store players
        let pa_word = Word::new([pa_prefix, pa_suffix, felt_zero(), felt_zero()]);
        let pb_word = Word::new([pb_prefix, pb_suffix, felt_zero(), felt_zero()]);
        self.player_a.write(pa_word);
        self.player_b.write(pb_word);

        // Store teams
        let team_a_word = Word::new([c0a, c1a, c2a, felt_zero()]);
        let team_b_word = Word::new([c0b, c1b, c2b, felt_zero()]);
        self.team_a.write(team_a_word);
        self.team_b.write(team_b_word);

        // Init champion states in storage
        let sa0 = init_champion_state(c0a_id);
        let sa1 = init_champion_state(c1a_id);
        let sa2 = init_champion_state(c2a_id);
        self.write_champ_state(10, &sa0);
        self.write_champ_state(11, &sa1);
        self.write_champ_state(12, &sa2);

        let sb0 = init_champion_state(c0b_id);
        let sb1 = init_champion_state(c1b_id);
        let sb2 = init_champion_state(c2b_id);
        self.write_champ_state(13, &sb0);
        self.write_champ_state(14, &sb1);
        self.write_champ_state(15, &sb2);

        // Set state to active
        self.combat_state.write(u64_to_felt(1));
        let current_block = tx::get_block_number().as_u64();
        self.timeout_height.write(u64_to_felt(current_block + TIMEOUT_BLOCKS));
    }

    // -----------------------------------------------------------------------
    // submit_commit — player submits a hash commitment for their move
    // -----------------------------------------------------------------------

    pub fn submit_commit(
        &mut self,
        player_prefix: Felt,
        player_suffix: Felt,
        commit_a: Felt,
        commit_b: Felt,
        commit_c: Felt,
        commit_d: Felt,
    ) {
        let state: Felt = self.combat_state.read();
        assert!(state.as_u64() == 1, "combat not active");

        let pa: Word = self.player_a.read();
        let pb: Word = self.player_b.read();
        let is_player_a = player_prefix == pa[0] && player_suffix == pa[1];
        let is_player_b = player_prefix == pb[0] && player_suffix == pb[1];
        assert!(is_player_a || is_player_b, "not a player in this game");

        let existing: Word = if is_player_a {
            self.move_a_commit.read()
        } else {
            self.move_b_commit.read()
        };
        assert!(word_is_empty(&existing), "already committed this round");

        let commit_word = Word::new([commit_a, commit_b, commit_c, commit_d]);
        if is_player_a {
            self.move_a_commit.write(commit_word);
        } else {
            self.move_b_commit.write(commit_word);
        }
    }

    // -----------------------------------------------------------------------
    // submit_reveal — player reveals their move with RPO hash verification
    // -----------------------------------------------------------------------

    pub fn submit_reveal(
        &mut self,
        player_prefix: Felt,
        player_suffix: Felt,
        encoded_move: Felt,
        nonce_p1: Felt,
        nonce_p2: Felt,
    ) {
        let state: Felt = self.combat_state.read();
        assert!(state.as_u64() == 1, "combat not active");

        let pa: Word = self.player_a.read();
        let pb: Word = self.player_b.read();
        let is_player_a = player_prefix == pa[0] && player_suffix == pa[1];
        let is_player_b = player_prefix == pb[0] && player_suffix == pb[1];
        assert!(is_player_a || is_player_b, "not a player in this game");

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

        // RPO hash verification
        let computed: Digest = hash_elements(alloc::vec![encoded_move, nonce_p1, nonce_p2]);
        let hash_word: Word = computed.inner;
        assert!(
            hash_word[0] == commitment[0]
                && hash_word[1] == commitment[1]
                && hash_word[2] == commitment[2]
                && hash_word[3] == commitment[3],
            "commitment mismatch"
        );

        // Validate move legality
        let em = encoded_move.as_u64() as u32;
        assert!(em >= 1 && em <= 16, "move out of range");

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
    // resolve_current_turn — inlined combat resolution using SoA arrays
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

        // 4. Ability indices (SoA lookup)
        let ab_idx_a = (action_a.champion_id as usize) * 2 + (action_a.ability_index as usize);
        let ab_idx_b = (action_b.champion_id as usize) * 2 + (action_b.ability_index as usize);

        // 5. Speed priority (using SoA SPEED array)
        let speed_a = SPEED[action_a.champion_id as usize] + sum_buffs(&state_a, StatType::Speed);
        let speed_b = SPEED[action_b.champion_id as usize] + sum_buffs(&state_b, StatType::Speed);
        let a_goes_first =
            speed_a > speed_b || (speed_a == speed_b && action_a.champion_id < action_b.champion_id);

        // 6. Execute actions in speed order — ALL MUTATION INLINED
        if a_goes_first {
            inline_execute_action(
                action_a.champion_id, ab_idx_a, &mut state_a,
                action_b.champion_id, &mut state_b,
            );
            if !state_b.is_ko {
                inline_execute_action(
                    action_b.champion_id, ab_idx_b, &mut state_b,
                    action_a.champion_id, &mut state_a,
                );
            }
        } else {
            inline_execute_action(
                action_b.champion_id, ab_idx_b, &mut state_b,
                action_a.champion_id, &mut state_a,
            );
            if !state_a.is_ko {
                inline_execute_action(
                    action_a.champion_id, ab_idx_a, &mut state_a,
                    action_b.champion_id, &mut state_b,
                );
            }
        }

        // 7. Tick down buff durations — INLINED
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

        // 8. Write updated states back to storage
        self.write_champ_state(slot_a, &state_a);
        self.write_champ_state(slot_b, &state_b);

        // 9. Check for team elimination
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
            self.combat_state.write(u64_to_felt(2));
            self.send_result_note(winner_val);
        } else {
            // Reset for next round
            let round_felt: Felt = self.round.read();
            self.round.write(u64_to_felt(round_felt.as_u64() + 1));
            self.move_a_commit.write(empty_word());
            self.move_b_commit.write(empty_word());
            self.move_a_reveal.write(empty_word());
            self.move_b_reveal.write(empty_word());
            let current_block = tx::get_block_number().as_u64();
            self.timeout_height.write(u64_to_felt(current_block + TIMEOUT_BLOCKS));
        }
    }

    // -----------------------------------------------------------------------
    // claim_combat_timeout — handle timeouts during combat phase
    // -----------------------------------------------------------------------

    pub fn claim_combat_timeout(&mut self, player_prefix: Felt, player_suffix: Felt) {
        let state: Felt = self.combat_state.read();
        assert!(state.as_u64() == 1, "combat not active");

        let current_block = tx::get_block_number().as_u64();
        let timeout: Felt = self.timeout_height.read();
        assert!(current_block > timeout.as_u64(), "timeout not reached");

        let pa: Word = self.player_a.read();
        let pb: Word = self.player_b.read();
        let is_player_a = player_prefix == pa[0] && player_suffix == pa[1];
        let is_player_b = player_prefix == pb[0] && player_suffix == pb[1];
        assert!(is_player_a || is_player_b, "not a player in this game");

        // Determine winner by commit/reveal progress
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

        let winner_val: u64 = if a_progress > b_progress {
            1 // player A wins
        } else if b_progress > a_progress {
            2 // player B wins
        } else {
            3 // draw
        };

        self.combat_state.write(u64_to_felt(2));
        self.send_result_note(winner_val);
    }

    // -----------------------------------------------------------------------
    // receive_asset — accept an asset into the account vault
    // -----------------------------------------------------------------------

    pub fn receive_asset(&mut self, asset: Asset) {
        self.add_asset(asset);
    }
}

// ---------------------------------------------------------------------------
// Inlined action execution using SoA arrays — free function
// ---------------------------------------------------------------------------

fn inline_execute_action(
    actor_id: u8,
    ab_idx: usize,
    actor_state: &mut ChampionState,
    target_id: u8,
    target_state: &mut ChampionState,
) {
    let ab_type = AB_TYPE[ab_idx];

    match ab_type {
        0 => {
            // Damage — use SoA arrays for attacker/defender stats
            let attack_debuffs = sum_debuffs(actor_state, StatType::Attack);
            let effective_atk = ATTACK[actor_id as usize].saturating_sub(attack_debuffs);

            let mult_x100 = get_type_multiplier(
                ELEMENT[actor_id as usize],
                ELEMENT[target_id as usize],
            );

            let defense_buffs = sum_buffs(target_state, StatType::Defense);
            let effective_def = DEFENSE[target_id as usize] + defense_buffs;

            let raw = (AB_POWER[ab_idx] as u64) * (20 + effective_atk as u64) * (mult_x100 as u64) / 2000;
            let raw_u32 = raw as u32;

            let dmg = if raw_u32 > effective_def {
                raw_u32 - effective_def
            } else {
                1
            };

            target_state.current_hp = target_state.current_hp.saturating_sub(dmg);
            if target_state.current_hp == 0 {
                target_state.is_ko = true;
            }
        }
        1 => {
            // Heal
            let heal_amount = AB_HEAL[ab_idx];
            let old_hp = actor_state.current_hp;
            let new_hp = if old_hp + heal_amount > actor_state.max_hp {
                actor_state.max_hp
            } else {
                old_hp + heal_amount
            };
            actor_state.current_hp = new_hp;
        }
        2 => {
            // StatMod
            let stat_val = AB_STAT_VAL[ab_idx];
            let duration = AB_DURATION[ab_idx];
            if stat_val > 0 && duration > 0 {
                let stat = match AB_STAT[ab_idx] {
                    0 => StatType::Defense,
                    1 => StatType::Speed,
                    2 => StatType::Attack,
                    _ => StatType::Defense,
                };
                let is_debuff = AB_IS_DEBUFF[ab_idx];
                let slot = BuffSlot {
                    stat,
                    value: stat_val,
                    turns_remaining: duration,
                    is_debuff,
                    active: true,
                };
                if is_debuff {
                    let mut inserted = false;
                    for i in 0..MAX_BUFFS {
                        if !target_state.buffs[i].active && !inserted {
                            target_state.buffs[i] = slot;
                            target_state.buff_count += 1;
                            inserted = true;
                        }
                    }
                    assert!(inserted, "buff array full");
                } else {
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
        }
        _ => panic!("invalid ability type"),
    }
}
