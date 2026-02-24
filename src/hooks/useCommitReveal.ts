/**
 * useCommitReveal — Arena-based commit-reveal for combat moves.
 *
 * Each combat turn follows a two-phase protocol:
 *
 *  **Commit phase:**
 *   1. Player picks a move (encoded as 1-20).
 *   2. RPO256 hash of (move, nonce_p1, nonce_p2) is computed.
 *   3. A commit note is sent to the arena via submit_move_note (phase=0).
 *   4. The 4-Felt RPO hash is passed as the consume arg Word.
 *
 *  **Reveal phase:**
 *   1. A reveal note is sent to the arena via submit_move_note (phase=1).
 *   2. The arg Word carries [move, nonce_p1, nonce_p2, 0].
 *   3. The arena contract verifies the RPO hash matches the commitment.
 *   4. If both players have revealed, the arena auto-resolves the turn.
 *
 * Opponent detection is via arena state polling (not P2P notes).
 */

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useMiden } from "@miden-sdk/react";
import { Word } from "@miden-sdk/miden-sdk";
import { useGameStore } from "../store/gameStore";
import { buildCommitNote, buildRevealNote, submitArenaNote } from "../utils/arenaNote";
import { createCommitment, createReveal } from "../engine/commitment";
import { ARENA_ACCOUNT_ID } from "../constants/miden";
import type { CommitData } from "../types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseCommitRevealReturn {
  /** Create a cryptographic commitment for a move and send to the arena. */
  commit: (move: number) => Promise<void>;
  /** Reveal our previously committed move to the arena. */
  reveal: () => Promise<void>;
  /** Whether we have sent our commitment this turn. */
  isCommitted: boolean;
  /** Whether we have sent our reveal this turn. */
  isRevealed: boolean;
  /** Whether the opponent has sent their commit to the arena. */
  opponentCommitted: boolean;
  /** Whether the opponent has sent their reveal to the arena. */
  opponentRevealed: boolean;
  /** The decoded opponent move (read from arena reveal slot). `null` until revealed. */
  opponentMove: number | null;
  /** Error message if any step fails. */
  error: string | null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCommitReveal(): UseCommitRevealReturn {
  const sessionWalletId = useGameStore((s) => s.setup.sessionWalletId);
  const round = useGameStore((s) => s.battle.round);
  const setMyCommit = useGameStore((s) => s.setMyCommit);
  const setMyReveal = useGameStore((s) => s.setMyReveal);

  const { client, prover } = useMiden();

  // Read arena state directly from Zustand (avoids creating a duplicate polling loop).
  // The polling loop is owned by useArenaState in the parent screen component.
  const moveACommit = useGameStore((s) => s.arena.moveACommit);
  const moveBCommit = useGameStore((s) => s.arena.moveBCommit);
  const moveAReveal = useGameStore((s) => s.arena.moveAReveal);
  const moveBReveal = useGameStore((s) => s.arena.moveBReveal);
  const playerA = useGameStore((s) => s.arena.playerA);

  const [isCommitted, setIsCommitted] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);
  const [opponentCommitted, setOpponentCommitted] = useState(false);
  const [opponentRevealed, setOpponentRevealed] = useState(false);
  const [opponentMove, setOpponentMove] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Store the current commitment locally for the reveal step
  const commitDataRef = useRef<CommitData | null>(null);

  // Track which round we last reset for
  const lastResetRound = useRef<number>(0);

  // -----------------------------------------------------------------------
  // Reset state when round changes
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (round === lastResetRound.current) return;
    lastResetRound.current = round;
    setIsCommitted(false);
    setIsRevealed(false);
    setOpponentCommitted(false);
    setOpponentRevealed(false);
    setOpponentMove(null);
    setError(null);
    commitDataRef.current = null;
  }, [round]);

  // -----------------------------------------------------------------------
  // commit(move) — Generate RPO commitment and send to arena
  // -----------------------------------------------------------------------
  const commit = useCallback(
    async (move: number) => {
      if (isCommitted) {
        setError("Already committed this turn.");
        return;
      }

      if (!sessionWalletId) {
        setError("Session wallet not ready.");
        return;
      }

      if (!client || !prover) {
        setError("Miden client not ready.");
        return;
      }

      setError(null);

      try {
        // Generate RPO256 commitment (sync)
        const commitment = createCommitment(move);

        // Build commit note (phase=0)
        const note = await buildCommitNote(sessionWalletId, ARENA_ACCOUNT_ID);

        // Args: the 4-Felt RPO hash
        const commitArgs = new Word(BigUint64Array.from(commitment.commitWord));

        await submitArenaNote({
          client,
          prover,
          sessionWalletId,
          arenaAccountId: ARENA_ACCOUNT_ID,
          note,
          consumeArgs: commitArgs,
        });

        commitDataRef.current = commitment;
        setMyCommit(commitment);
        setIsCommitted(true);

        console.log("[useCommitReveal] commit sent to arena", {
          round,
          commitWord: commitment.commitWord.map(String),
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to send commitment.";
        console.error("[useCommitReveal] commit failed", err);
        setError(message);
      }
    },
    [isCommitted, sessionWalletId, client, prover, round, setMyCommit],
  );

  // -----------------------------------------------------------------------
  // reveal() — Send move + nonces to arena for verification
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

    if (!sessionWalletId) {
      setError("Session wallet not ready.");
      return;
    }

    if (!client || !prover) {
      setError("Miden client not ready.");
      return;
    }

    setError(null);

    try {
      const revealData = createReveal(commitDataRef.current);

      // Build reveal note (phase=1)
      const note = await buildRevealNote(sessionWalletId, ARENA_ACCOUNT_ID);

      // Args: [encoded_move, nonce_p1, nonce_p2, 0]
      const revealArgs = new Word(
        BigUint64Array.from([
          BigInt(revealData.move),
          revealData.noncePart1,
          revealData.noncePart2,
          0n,
        ]),
      );

      await submitArenaNote({
        client,
        prover,
        sessionWalletId,
        arenaAccountId: ARENA_ACCOUNT_ID,
        note,
        consumeArgs: revealArgs,
      });

      setMyReveal(revealData);
      setIsRevealed(true);

      console.log("[useCommitReveal] reveal sent to arena", {
        round,
        move: revealData.move,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to send reveal.";
      console.error("[useCommitReveal] reveal failed", err);
      setError(message);
    }
  }, [isRevealed, sessionWalletId, client, prover, round, setMyReveal]);

  // -----------------------------------------------------------------------
  // Determine which player we are (stable across renders)
  // -----------------------------------------------------------------------
  const amPlayerA = useMemo(() => {
    if (!sessionWalletId || !playerA) return false;
    // Simple comparison: check if playerA was set by our session wallet.
    // This is set when the arena's player_a slot matches our account.
    // The full AccountId comparison is done by useArenaState helpers.
    // Here we use a simplified check against the Zustand store directly.
    return useGameStore.getState().match.role === "host";
  }, [sessionWalletId, playerA]);

  // Derive opponent's commit/reveal slots based on our role
  const opponentCommitSlot = amPlayerA ? moveBCommit : moveACommit;
  const opponentRevealSlot = amPlayerA ? moveBReveal : moveAReveal;

  // -----------------------------------------------------------------------
  // Detect opponent commit via arena state polling
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (opponentCommitted) return;

    const hasCommit = opponentCommitSlot.some((v) => v !== 0n);
    if (hasCommit) {
      console.log("[useCommitReveal] opponent commit detected via arena", { round });
      setOpponentCommitted(true);
    }
  }, [opponentCommitted, opponentCommitSlot, round]);

  // -----------------------------------------------------------------------
  // Detect opponent reveal via arena state polling
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!opponentCommitted || opponentRevealed) return;

    const hasReveal = opponentRevealSlot.some((v) => v !== 0n);
    if (hasReveal) {
      // Read the opponent's move from the first element of their reveal slot
      const decodedMove = Number(opponentRevealSlot[0]);
      console.log("[useCommitReveal] opponent reveal detected via arena", {
        round,
        move: decodedMove,
      });
      setOpponentMove(decodedMove);
      setOpponentRevealed(true);
    }
  }, [opponentCommitted, opponentRevealed, opponentRevealSlot, round]);

  return {
    commit,
    reveal,
    isCommitted,
    isRevealed,
    opponentCommitted,
    opponentRevealed,
    opponentMove,
    error,
  };
}
