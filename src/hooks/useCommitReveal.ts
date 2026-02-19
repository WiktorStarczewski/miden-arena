/**
 * useCommitReveal - Core commit-reveal cryptographic protocol for combat moves.
 *
 * Each combat turn follows a two-phase protocol:
 *
 *  **Commit phase:**
 *   1. Player picks a move (encoded as 1-20).
 *   2. A random nonce is generated and SHA-256(move || nonce) is computed.
 *   3. The first 96 bits of the hash are split into 2 x 48-bit values.
 *   4. Two notes are sent to the opponent carrying these hash parts.
 *
 *  **Reveal phase:**
 *   1. Three notes are sent: the move (1-20), and 2 x 32-bit nonce parts.
 *   2. The opponent reconstructs the nonce, recomputes the hash, and checks
 *      that it matches the committed values.
 *
 * This prevents either player from changing their move after seeing the
 * opponent's choice, achieving fair simultaneous-move semantics on an
 * asynchronous blockchain.
 */

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useMultiSend } from "@miden-sdk/react";
import { useGameStore } from "../store/gameStore";
import { useNoteDecoder } from "./useNoteDecoder";
import {
  createCommitment,
  createReveal,
  verifyReveal,
} from "../engine/commitment";
import { MIDEN_FAUCET_ID } from "../constants/miden";
import { COMMIT_CHUNK_MAX, NONCE_CHUNK_MAX, MOVE_MIN, MOVE_MAX } from "../constants/protocol";
import type { CommitData, RevealData } from "../types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseCommitRevealReturn {
  /** Create a cryptographic commitment for a move and send hash parts to the opponent. */
  commit: (move: number) => Promise<void>;
  /** Reveal our previously committed move by sending the move + nonce parts. */
  reveal: () => Promise<void>;
  /** Verify that the opponent's reveal matches their commitment. */
  verify: (
    move: number,
    noncePart1: bigint,
    noncePart2: bigint,
    commitPart1: bigint,
    commitPart2: bigint,
  ) => Promise<boolean>;
  /** Whether we have sent our commitment this turn. */
  isCommitted: boolean;
  /** Whether we have sent our reveal this turn. */
  isRevealed: boolean;
  /** Whether the opponent has sent their 2 commit notes this turn. */
  opponentCommitted: boolean;
  /** Whether the opponent has sent their 3 reveal notes this turn. */
  opponentRevealed: boolean;
  /** The decoded opponent move (set after reveal verification). `null` until verified. */
  opponentMove: number | null;
  /** Error message if any step fails. */
  error: string | null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCommitReveal(): UseCommitRevealReturn {
  const opponentId = useGameStore((s) => s.match.opponentId);
  const round = useGameStore((s) => s.battle.round);
  const setMyCommit = useGameStore((s) => s.setMyCommit);
  const setOpponentCommitNotes = useGameStore((s) => s.setOpponentCommitNotes);
  const setMyReveal = useGameStore((s) => s.setMyReveal);
  const setOpponentReveal = useGameStore((s) => s.setOpponentReveal);

  const { sendMany, stage } = useMultiSend();
  const { commitNotes, revealNotes, allOpponentNotes } = useNoteDecoder(opponentId);

  const [isCommitted, setIsCommitted] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);
  const [opponentMove, setOpponentMove] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Store the current commitment locally for the reveal step
  const commitDataRef = useRef<CommitData | null>(null);

  // Track processed commit/reveal notes per round to avoid reprocessing
  const lastProcessedRound = useRef<number>(0);
  const commitProcessedRef = useRef(false);
  const revealProcessedRef = useRef(false);

  // Suppress unused lint for stage (useful for debugging)
  void stage;

  // -----------------------------------------------------------------------
  // Reset state when round changes
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (round !== lastProcessedRound.current) {
      lastProcessedRound.current = round;
      setIsCommitted(false);
      setIsRevealed(false);
      setOpponentMove(null);
      setError(null);
      commitDataRef.current = null;
      commitProcessedRef.current = false;
      revealProcessedRef.current = false;
    }
  }, [round]);

  // -----------------------------------------------------------------------
  // commit(move) - Generate commitment and send 2 hash-part notes
  // -----------------------------------------------------------------------
  const commit = useCallback(
    async (move: number) => {
      if (isCommitted) {
        setError("Already committed this turn.");
        return;
      }

      if (!opponentId) {
        setError("No opponent connected.");
        return;
      }

      setError(null);

      try {
        const commitment = await createCommitment(move);
        const commitData: CommitData = {
          move: commitment.move,
          nonce: commitment.nonce,
          part1: commitment.part1,
          part2: commitment.part2,
        };

        // Send 2 notes: hash part1 and hash part2
        await sendMany([
          {
            recipientAddress: opponentId,
            faucetId: MIDEN_FAUCET_ID,
            amount: commitment.part1,
            noteType: "public",
          },
          {
            recipientAddress: opponentId,
            faucetId: MIDEN_FAUCET_ID,
            amount: commitment.part2,
            noteType: "public",
          },
        ]);

        commitDataRef.current = commitData;
        setMyCommit(commitData);
        setIsCommitted(true);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to send commitment.";
        setError(message);
      }
    },
    [isCommitted, opponentId, sendMany, setMyCommit],
  );

  // -----------------------------------------------------------------------
  // reveal() - Send 3 notes: move, noncePart1, noncePart2
  // -----------------------------------------------------------------------
  const reveal = useCallback(async () => {
    if (isRevealed) {
      setError("Already revealed this turn.");
      return;
    }

    if (!commitDataRef.current) {
      setError("Must commit before revealing.");
      return;
    }

    if (!opponentId) {
      setError("No opponent connected.");
      return;
    }

    setError(null);

    try {
      const { move, nonce } = commitDataRef.current;
      const revealData = createReveal(move, nonce);

      await sendMany([
        {
          recipientAddress: opponentId,
          faucetId: MIDEN_FAUCET_ID,
          amount: BigInt(revealData.move),
          noteType: "public",
        },
        {
          recipientAddress: opponentId,
          faucetId: MIDEN_FAUCET_ID,
          amount: revealData.noncePart1,
          noteType: "public",
        },
        {
          recipientAddress: opponentId,
          faucetId: MIDEN_FAUCET_ID,
          amount: revealData.noncePart2,
          noteType: "public",
        },
      ]);

      const revealStoreData: RevealData = {
        move: revealData.move,
        noncePart1: revealData.noncePart1,
        noncePart2: revealData.noncePart2,
      };
      setMyReveal(revealStoreData);
      setIsRevealed(true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to send reveal.";
      setError(message);
    }
  }, [isRevealed, opponentId, sendMany, setMyReveal]);

  // -----------------------------------------------------------------------
  // verify() - Check that an opponent's reveal matches their commitment
  // -----------------------------------------------------------------------
  const verify = useCallback(
    async (
      move: number,
      noncePart1: bigint,
      noncePart2: bigint,
      commitPart1: bigint,
      commitPart2: bigint,
    ): Promise<boolean> => {
      return verifyReveal(move, noncePart1, noncePart2, commitPart1, commitPart2);
    },
    [],
  );

  // -----------------------------------------------------------------------
  // Detect opponent commit notes (exactly 2 notes with amounts in commit range)
  // -----------------------------------------------------------------------

  // We identify commit notes as those with amounts above the nonce range
  // (since nonce chunks fit in 32 bits but commit chunks use 48 bits).
  // For amounts in the overlapping range [1, NONCE_CHUNK_MAX], we rely on
  // the note count and the game phase.
  const opponentCommitParts = useMemo(() => {
    // Commit notes have amounts in [1, COMMIT_CHUNK_MAX].
    // We look at ALL opponent notes, not just those pre-categorised,
    // because the amount-based categorisation has overlapping ranges.
    // We use a heuristic: commit comes as a pair of notes with large amounts.
    return allOpponentNotes.filter(
      (n) => n.amount > 0n && n.amount <= COMMIT_CHUNK_MAX,
    );
  }, [allOpponentNotes]);

  const opponentCommitted = commitNotes.length >= 2 || opponentCommitParts.length >= 2;

  useEffect(() => {
    if (commitProcessedRef.current || !opponentCommitted) return;

    // Use the first 2 commit-range notes as the opponent's commitment
    const parts =
      commitNotes.length >= 2 ? commitNotes : opponentCommitParts;
    if (parts.length < 2) return;

    commitProcessedRef.current = true;
    setOpponentCommitNotes([
      { noteId: parts[0].noteId, amount: parts[0].amount },
      { noteId: parts[1].noteId, amount: parts[1].amount },
    ]);
  }, [opponentCommitted, commitNotes, opponentCommitParts, setOpponentCommitNotes]);

  // -----------------------------------------------------------------------
  // Detect opponent reveal notes (3 notes: move + 2 nonce parts)
  // -----------------------------------------------------------------------
  const opponentRevealed = revealNotes.length >= 3;

  useEffect(() => {
    if (revealProcessedRef.current || !opponentRevealed) return;
    if (revealNotes.length < 3) return;

    revealProcessedRef.current = true;

    // Identify the move note (amount in [MOVE_MIN, MOVE_MAX])
    // and the 2 nonce parts (amount in [1, NONCE_CHUNK_MAX])
    const moveNote = revealNotes.find(
      (n) => n.amount >= MOVE_MIN && n.amount <= MOVE_MAX,
    );
    const nonceParts = revealNotes.filter(
      (n) => n.amount > 0n && n.amount <= NONCE_CHUNK_MAX && n !== moveNote,
    );

    if (!moveNote || nonceParts.length < 2) return;

    const oppMove = Number(moveNote.amount);
    const noncePart1 = nonceParts[0].amount;
    const noncePart2 = nonceParts[1].amount;

    // Read committed values from store
    const storeState = useGameStore.getState();
    const commitNoteRefs = storeState.battle.opponentCommitNotes;
    if (commitNoteRefs.length < 2) return;

    const commitPart1 = commitNoteRefs[0].amount;
    const commitPart2 = commitNoteRefs[1].amount;

    // Verify asynchronously
    (async () => {
      const valid = await verifyReveal(
        oppMove,
        noncePart1,
        noncePart2,
        commitPart1,
        commitPart2,
      );

      if (valid) {
        setOpponentMove(oppMove);
        setOpponentReveal({
          move: oppMove,
          noncePart1,
          noncePart2,
        });
      } else {
        setError("Opponent reveal verification failed - possible cheating detected.");
      }
    })();
  }, [opponentRevealed, revealNotes, setOpponentReveal]);

  return {
    commit,
    reveal,
    verify,
    isCommitted,
    isRevealed,
    opponentCommitted,
    opponentRevealed,
    opponentMove,
    error,
  };
}
