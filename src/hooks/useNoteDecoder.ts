/**
 * useNoteDecoder - Filters and categorises incoming notes from the opponent.
 *
 * Every Miden note carries an `amount` field that encodes a game signal.
 * This hook reads the raw notes from the SDK, keeps only those sent by the
 * known opponent, and buckets them by signal type:
 *
 *  | Signal        | Amount range               |
 *  |---------------|----------------------------|
 *  | join          | 100                        |
 *  | accept        | 101                        |
 *  | draft_pick    | 1 - 10                     |
 *  | commit        | 1 - 2^48 (two notes)       |
 *  | reveal        | 1 - 2^32 + moves 1-20      |
 *  | stake         | 10_000_000                  |
 *
 * Commit and reveal notes overlap in amount ranges, so they are separated by
 * context (the number of notes that arrive in a batch and ordering).
 */

import { useMemo } from "react";
import { useNotes } from "@miden-sdk/react";
import {
  JOIN_SIGNAL,
  ACCEPT_SIGNAL,
  DRAFT_PICK_MIN,
  DRAFT_PICK_MAX,
  COMMIT_CHUNK_MAX,
  NONCE_CHUNK_MAX,
  MOVE_MIN,
  MOVE_MAX,
} from "../constants/protocol";
import { STAKE_AMOUNT } from "../constants/miden";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Decoded note representation used across all hooks. */
export interface DecodedNote {
  noteId: string;
  sender: string;
  amount: bigint;
}

export interface UseNoteDecoderReturn {
  /** Notes where amount === JOIN_SIGNAL (100). */
  joinNotes: DecodedNote[];
  /** Notes where amount === ACCEPT_SIGNAL (101). */
  acceptNotes: DecodedNote[];
  /** Notes where amount is in [1, 10] (draft pick range). */
  draftPickNotes: DecodedNote[];
  /** Notes where amount is in [1, COMMIT_CHUNK_MAX] (hash chunks). */
  commitNotes: DecodedNote[];
  /** Notes where amount is in [1, NONCE_CHUNK_MAX] or [MOVE_MIN, MOVE_MAX] (reveal data). */
  revealNotes: DecodedNote[];
  /** Notes where amount === STAKE_AMOUNT. */
  stakeNotes: DecodedNote[];
  /** All notes from the opponent, unfiltered. */
  allOpponentNotes: DecodedNote[];
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Decode and categorise incoming notes from a specific opponent.
 *
 * @param opponentId - The Miden account ID of the opponent. When `null`, all
 *                     categorised arrays will be empty.
 */
export function useNoteDecoder(opponentId: string | null): UseNoteDecoderReturn {
  const { noteSummaries } = useNotes({ status: "committed" });

  return useMemo(() => {
    const empty: UseNoteDecoderReturn = {
      joinNotes: [],
      acceptNotes: [],
      draftPickNotes: [],
      commitNotes: [],
      revealNotes: [],
      stakeNotes: [],
      allOpponentNotes: [],
    };

    if (!opponentId) return empty;

    // Filter to opponent + map to DecodedNote
    const opponentNotes: DecodedNote[] = [];
    for (const note of noteSummaries) {
      if (note.sender !== opponentId) continue;
      // Extract the first asset amount (all game signals use a single asset)
      const amount =
        note.assets.length > 0 ? note.assets[0].amount : 0n;
      opponentNotes.push({ noteId: note.id, sender: note.sender!, amount });
    }

    const joinNotes: DecodedNote[] = [];
    const acceptNotes: DecodedNote[] = [];
    const draftPickNotes: DecodedNote[] = [];
    const commitNotes: DecodedNote[] = [];
    const revealNotes: DecodedNote[] = [];
    const stakeNotes: DecodedNote[] = [];

    for (const note of opponentNotes) {
      const a = note.amount;

      if (a === JOIN_SIGNAL) {
        joinNotes.push(note);
      } else if (a === ACCEPT_SIGNAL) {
        acceptNotes.push(note);
      } else if (a === STAKE_AMOUNT) {
        stakeNotes.push(note);
      } else if (a >= DRAFT_PICK_MIN && a <= DRAFT_PICK_MAX) {
        // Draft picks: 1-10
        draftPickNotes.push(note);
      } else if (a >= MOVE_MIN && a <= MOVE_MAX) {
        // Could be reveal_move (1-20) - but only classified as reveal
        // when NOT in draft_pick range (1-10 overlaps, handled above)
        revealNotes.push(note);
      } else if (a > 0n && a <= NONCE_CHUNK_MAX) {
        // Reveal nonce chunks: 1 to 2^32 - 1
        revealNotes.push(note);
      } else if (a > NONCE_CHUNK_MAX && a <= COMMIT_CHUNK_MAX) {
        // Commit hash chunks: values above nonce range up to 2^48
        commitNotes.push(note);
      }
    }

    return {
      joinNotes,
      acceptNotes,
      draftPickNotes,
      commitNotes,
      revealNotes,
      stakeNotes,
      allOpponentNotes: opponentNotes,
    };
  }, [noteSummaries, opponentId]);
}
