#![no_std]
#![feature(alloc_error_handler)]

extern crate alloc;

use miden::{
    asset, component, output_note, tx, AccountId, Asset, Digest, Felt, NoteType,
    Recipient, Tag, Value, ValueAccess, Word,
};

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

fn u64_to_felt(v: u64) -> Felt {
    Felt::from_u64_unchecked(v)
}

// ---------------------------------------------------------------------------
// Matchmaking Account Component — 13 storage slots
// ---------------------------------------------------------------------------

#[component]
struct MatchmakingAccount {
    #[storage(description = "0=waiting,1=a_joined,2=both_joined,3=teams_done,4=resolved")]
    game_state: Value,
    #[storage(description = "Player A account ID [prefix, suffix, 0, 0]")]
    player_a: Value,
    #[storage(description = "Player B account ID [prefix, suffix, 0, 0]")]
    player_b: Value,
    #[storage(description = "Player A team [c0, c1, c2, 0]")]
    team_a: Value,
    #[storage(description = "Player B team [c0, c1, c2, 0]")]
    team_b: Value,
    #[storage(description = "Bitfield: bit0=team_a set, bit1=team_b set")]
    teams_submitted: Value,
    #[storage(description = "Player A stake amount")]
    stake_a: Value,
    #[storage(description = "Player B stake amount")]
    stake_b: Value,
    #[storage(description = "Timeout block height")]
    timeout_height: Value,
    #[storage(description = "0=undecided,1=player_a,2=player_b,3=draw")]
    winner: Value,
    #[storage(description = "Faucet AccountId [prefix, suffix, 0, 0] for stake token")]
    faucet_id: Value,
    #[storage(description = "P2ID note script digest [d0, d1, d2, d3]")]
    p2id_script_hash: Value,
    #[storage(description = "Combat account ID [prefix, suffix, 0, 0] - trusted for results")]
    combat_account_id: Value,
}

#[component]
impl MatchmakingAccount {
    // -----------------------------------------------------------------------
    // P2ID payout helper
    // -----------------------------------------------------------------------

    fn send_payout(&self, target_player: &Word, amount: u64, payout_id: u64) {
        let serial_num = Word::from_u64_unchecked(payout_id, 0, 0, 0);
        let p2id_hash: Word = self.p2id_script_hash.read();
        let p2id_digest = Digest::from_word(p2id_hash);

        // P2ID note inputs: [target_prefix, target_suffix]
        let inputs = alloc::vec![target_player[0], target_player[1]];
        let recipient = Recipient::compute(serial_num, p2id_digest, inputs);

        let tag = Tag::from(felt_zero());
        let note_type = NoteType::from(u64_to_felt(1)); // public
        let note_idx = output_note::create(tag, note_type, recipient);

        // Build fungible asset
        let faucet_word: Word = self.faucet_id.read();
        let faucet = AccountId::new(faucet_word[0], faucet_word[1]);
        let fungible_asset = asset::build_fungible_asset(faucet, u64_to_felt(amount));
        output_note::add_asset(fungible_asset, note_idx);
    }

    // -----------------------------------------------------------------------
    // Public procedures
    // -----------------------------------------------------------------------

    // -----------------------------------------------------------------------
    // join — first or second player joins
    // -----------------------------------------------------------------------

    pub fn join(&mut self, player_prefix: Felt, player_suffix: Felt, stake: Felt) {
        let stake_val = stake.as_u64();
        assert!(stake_val == STAKE_AMOUNT, "incorrect stake amount");

        let player_word = Word::new([player_prefix, player_suffix, felt_zero(), felt_zero()]);

        let state: Felt = self.game_state.read();
        let state_val = state.as_u64();

        match state_val {
            0 => {
                self.player_a.write(player_word);
                self.stake_a.write(stake);
                self.game_state.write(u64_to_felt(1));
                let current_block = tx::get_block_number().as_u64();
                self.timeout_height.write(u64_to_felt(current_block + TIMEOUT_BLOCKS));
            }
            1 => {
                let pa: Word = self.player_a.read();
                assert!(
                    !(player_prefix == pa[0] && player_suffix == pa[1]),
                    "cannot play yourself"
                );
                self.player_b.write(player_word);
                self.stake_b.write(stake);
                self.game_state.write(u64_to_felt(2));
                let current_block = tx::get_block_number().as_u64();
                self.timeout_height.write(u64_to_felt(current_block + TIMEOUT_BLOCKS));
            }
            _ => panic!("game already full"),
        }
    }

    // -----------------------------------------------------------------------
    // set_team — player submits their team of 3 champions
    // Validates champion IDs (0-7), no duplicates, no overlap.
    // Does NOT init champion states — that happens in combat account.
    // -----------------------------------------------------------------------

    pub fn set_team(
        &mut self,
        player_prefix: Felt,
        player_suffix: Felt,
        c0: Felt,
        c1: Felt,
        c2: Felt,
    ) {
        let state: Felt = self.game_state.read();
        assert!(state.as_u64() == 2, "must be in both_joined state");

        let pa: Word = self.player_a.read();
        let pb: Word = self.player_b.read();
        let is_player_a = player_prefix == pa[0] && player_suffix == pa[1];
        let is_player_b = player_prefix == pb[0] && player_suffix == pb[1];
        assert!(is_player_a || is_player_b, "not a player in this game");

        let teams_sub_felt: Felt = self.teams_submitted.read();
        let teams_sub = teams_sub_felt.as_u64();
        let my_bit: u64 = if is_player_a { 0b01 } else { 0b10 };
        assert!(teams_sub & my_bit == 0, "team already submitted");

        let c0_id = c0.as_u64() as u8;
        let c1_id = c1.as_u64() as u8;
        let c2_id = c2.as_u64() as u8;

        assert!(c0_id <= 7 && c1_id <= 7 && c2_id <= 7, "invalid champion ID");
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
        } else {
            self.team_b.write(team_word);
        }

        let new_teams_sub = teams_sub | my_bit;
        self.teams_submitted.write(u64_to_felt(new_teams_sub));

        if new_teams_sub == 0b11 {
            self.game_state.write(u64_to_felt(3));
            let current_block = tx::get_block_number().as_u64();
            self.timeout_height.write(u64_to_felt(current_block + TIMEOUT_BLOCKS));
        }
    }

    // -----------------------------------------------------------------------
    // receive_result — combat account sends the winner
    // -----------------------------------------------------------------------

    pub fn receive_result(
        &mut self,
        sender_prefix: Felt,
        sender_suffix: Felt,
        winner_val: Felt,
    ) {
        // Verify sender is the trusted combat account
        let combat_id: Word = self.combat_account_id.read();
        assert!(
            sender_prefix == combat_id[0] && sender_suffix == combat_id[1],
            "sender is not the combat account"
        );

        let state: Felt = self.game_state.read();
        assert!(state.as_u64() == 3, "game not in teams_done state");

        let wv = winner_val.as_u64();
        assert!(wv >= 1 && wv <= 3, "invalid winner value");

        self.winner.write(winner_val);
        self.game_state.write(u64_to_felt(4));

        let pa: Word = self.player_a.read();
        let pb: Word = self.player_b.read();
        let stake_a_val: Felt = self.stake_a.read();
        let stake_b_val: Felt = self.stake_b.read();
        let total_stake = stake_a_val.as_u64() + stake_b_val.as_u64();

        match wv {
            1 => {
                // Player A wins — gets total stake
                self.send_payout(&pa, total_stake, 2_000_000);
            }
            2 => {
                // Player B wins — gets total stake
                self.send_payout(&pb, total_stake, 2_000_000);
            }
            3 => {
                // Draw — refund both (distinct IDs to avoid note collision)
                self.send_payout(&pa, stake_a_val.as_u64(), 2_000_000);
                self.send_payout(&pb, stake_b_val.as_u64(), 2_000_001);
            }
            _ => panic!("unreachable winner state"),
        }
    }

    // -----------------------------------------------------------------------
    // claim_timeout — handle abandoned games
    // States 1-3. Sets game_state → 4 BEFORE payouts to prevent double-payout.
    // -----------------------------------------------------------------------

    pub fn claim_timeout(&mut self, player_prefix: Felt, player_suffix: Felt) {
        let state: Felt = self.game_state.read();
        let state_val = state.as_u64();
        assert!(state_val >= 1 && state_val <= 3, "game not active");

        let current_block = tx::get_block_number().as_u64();
        let timeout: Felt = self.timeout_height.read();
        assert!(current_block > timeout.as_u64(), "timeout not reached");

        // Set state to resolved BEFORE payouts to prevent double-payout
        self.game_state.write(u64_to_felt(4));

        let pa: Word = self.player_a.read();
        let pb: Word = self.player_b.read();
        let is_player_a = player_prefix == pa[0] && player_suffix == pa[1];
        let is_player_b = player_prefix == pb[0] && player_suffix == pb[1];

        let stake_a_felt: Felt = self.stake_a.read();
        let stake_b_felt: Felt = self.stake_b.read();

        let timeout_payout_base: u64 = 1_000_000 + state_val;

        match state_val {
            1 => {
                // Only player A has joined — refund
                assert!(is_player_a, "only player A can claim in state 1");
                self.send_payout(&pa, stake_a_felt.as_u64(), timeout_payout_base);
            }
            2 => {
                // Both joined, teams phase — refund both
                assert!(is_player_a || is_player_b, "not a player in this game");
                self.send_payout(&pa, stake_a_felt.as_u64(), timeout_payout_base);
                self.send_payout(&pb, stake_b_felt.as_u64(), timeout_payout_base + 1);
            }
            3 => {
                // Teams done but init-combat never happened — refund both
                assert!(is_player_a || is_player_b, "not a player in this game");
                self.winner.write(u64_to_felt(3)); // draw
                self.send_payout(&pa, stake_a_felt.as_u64(), timeout_payout_base);
                self.send_payout(&pb, stake_b_felt.as_u64(), timeout_payout_base + 1);
            }
            _ => panic!("invalid state for timeout"),
        }
    }

    // -----------------------------------------------------------------------
    // receive_asset — accept an asset into the account vault
    // -----------------------------------------------------------------------

    pub fn receive_asset(&mut self, asset: Asset) {
        self.add_asset(asset);
    }
}
