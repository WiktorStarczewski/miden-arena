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
 *  | commit        | attachment MSG_TYPE_COMMIT |
 *  | reveal        | attachment MSG_TYPE_REVEAL |
 *  | stake         | 10_000_000                  |
 *
 * Commit and reveal notes use NoteAttachment for data, detected by
 * useCommitReveal directly from raw InputNoteRecords.
 */

import { useMemo } from "react";
import { useNotes } from "@miden-sdk/react";
import type { InputNoteRecord } from "@miden-sdk/miden-sdk";
import {
  JOIN_SIGNAL,
  ACCEPT_SIGNAL,
  LEAVE_SIGNAL,
  DRAFT_PICK_MIN,
  DRAFT_PICK_MAX,
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
  /** Notes where amount === LEAVE_SIGNAL (102). */
  leaveNotes: DecodedNote[];
  /** Notes where amount is in [1, 10] (draft pick range). */
  draftPickNotes: DecodedNote[];
  /** Notes where amount === STAKE_AMOUNT. */
  stakeNotes: DecodedNote[];
  /** All notes from the opponent, unfiltered (decoded summaries). */
  allOpponentNotes: DecodedNote[];
  /** Raw InputNoteRecord[] from the opponent, for attachment-based reading. */
  rawOpponentNotes: InputNoteRecord[];
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
  const { notes: rawNotes, noteSummaries } = useNotes({ status: "committed" });

  return useMemo(() => {
    const empty: UseNoteDecoderReturn = {
      joinNotes: [],
      acceptNotes: [],
      leaveNotes: [],
      draftPickNotes: [],
      stakeNotes: [],
      allOpponentNotes: [],
      rawOpponentNotes: [],
    };

    if (!opponentId) return empty;

    // Filter summaries to opponent + map to DecodedNote.
    // NoteSummary.sender is bech32-encoded (matching opponentId format).
    const opponentNotes: DecodedNote[] = [];
    const opponentNoteIds = new Set<string>();
    for (const note of noteSummaries) {
      if (note.sender !== opponentId) continue;
      // Extract the first asset amount (all game signals use a single asset)
      const amount =
        note.assets.length > 0 ? note.assets[0].amount : 0n;
      opponentNotes.push({ noteId: note.id, sender: note.sender!, amount });
      opponentNoteIds.add(note.id);
    }

    // Filter raw InputNoteRecords to opponent using note IDs from summaries.
    // This avoids format mismatches (AccountId.toString() returns hex,
    // but opponentId is bech32).
    const rawOpponentNotes: InputNoteRecord[] = [];
    for (const record of rawNotes) {
      if (opponentNoteIds.has(record.id().toString())) {
        rawOpponentNotes.push(record);
      }
    }


    const joinNotes: DecodedNote[] = [];
    const acceptNotes: DecodedNote[] = [];
    const leaveNotes: DecodedNote[] = [];
    const draftPickNotes: DecodedNote[] = [];
    const stakeNotes: DecodedNote[] = [];

    for (const note of opponentNotes) {
      const a = note.amount;

      if (a === JOIN_SIGNAL) {
        joinNotes.push(note);
      } else if (a === ACCEPT_SIGNAL) {
        acceptNotes.push(note);
      } else if (a === LEAVE_SIGNAL) {
        leaveNotes.push(note);
      } else if (a === STAKE_AMOUNT) {
        stakeNotes.push(note);
      } else if (a >= DRAFT_PICK_MIN && a <= DRAFT_PICK_MAX) {
        draftPickNotes.push(note);
      }
      // Commit/reveal notes are no longer classified by amount range.
      // They are detected by attachment in useCommitReveal.
    }

    return {
      joinNotes,
      acceptNotes,
      leaveNotes,
      draftPickNotes,
      stakeNotes,
      allOpponentNotes: opponentNotes,
      rawOpponentNotes,
    };
  }, [rawNotes, noteSummaries, opponentId]);
}
