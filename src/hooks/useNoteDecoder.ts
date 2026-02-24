/**
 * useNoteDecoder - Filters and categorises incoming P2P notes from the opponent.
 *
 * Every Miden note carries an `amount` field that encodes a game signal.
 * This hook reads the raw notes from the SDK, keeps only those sent by the
 * known opponent, and buckets them by signal type:
 *
 *  | Signal        | Amount range |
 *  |---------------|-------------|
 *  | join          | 100         |
 *  | accept        | 101         |
 *  | leave         | 102         |
 *  | draft_pick    | 1 - 10      |
 *
 * Staking, commit, and reveal are handled via arena contract notes and
 * detected by arena state polling (useArenaState), not P2P notes.
 */

import { useMemo } from "react";
import { useNotes } from "@miden-sdk/react";
import {
  JOIN_SIGNAL,
  ACCEPT_SIGNAL,
  LEAVE_SIGNAL,
  DRAFT_PICK_MIN,
  DRAFT_PICK_MAX,
} from "../constants/protocol";

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
  /** Notes where amount === LEAVE_SIGNAL (102). */
  leaveNotes: DecodedNote[];
  /** Notes where amount is in [1, 10] (draft pick range). */
  draftPickNotes: DecodedNote[];
  /** All notes from the opponent, unfiltered (decoded summaries). */
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
      leaveNotes: [],
      draftPickNotes: [],
      allOpponentNotes: [],
    };

    if (!opponentId) return empty;

    // Filter summaries to opponent + map to DecodedNote.
    // NoteSummary.sender is bech32-encoded (matching opponentId format).
    const opponentNotes: DecodedNote[] = [];
    for (const note of noteSummaries) {
      if (note.sender !== opponentId) continue;
      const amount =
        note.assets.length > 0 ? note.assets[0].amount : 0n;
      opponentNotes.push({ noteId: note.id, sender: note.sender!, amount });
    }

    const joinNotes: DecodedNote[] = [];
    const acceptNotes: DecodedNote[] = [];
    const leaveNotes: DecodedNote[] = [];
    const draftPickNotes: DecodedNote[] = [];

    for (const note of opponentNotes) {
      const a = note.amount;

      if (a === JOIN_SIGNAL) {
        joinNotes.push(note);
      } else if (a === ACCEPT_SIGNAL) {
        acceptNotes.push(note);
      } else if (a === LEAVE_SIGNAL) {
        leaveNotes.push(note);
      } else if (a >= DRAFT_PICK_MIN && a <= DRAFT_PICK_MAX) {
        draftPickNotes.push(note);
      }
    }

    return {
      joinNotes,
      acceptNotes,
      leaveNotes,
      draftPickNotes,
      allOpponentNotes: opponentNotes,
    };
  }, [noteSummaries, opponentId]);
}
