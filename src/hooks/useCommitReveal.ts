/**
 * useCommitReveal - Core commit-reveal cryptographic protocol for combat moves.
 *
 * Each combat turn follows a two-phase protocol:
 *
 *  **Commit phase:**
 *   1. Player picks a move (encoded as 1-20).
 *   2. A random nonce is generated and SHA-256(move || nonce) is computed.
 *   3. The first 32 bits of the hash are split into 2 × 16-bit values.
 *   4. Two notes are sent with amounts = hashPart + COMMIT_AMOUNT_OFFSET.
 *
 *  **Reveal phase:**
 *   1. Three notes are sent: the move (1-20), and 2 × 16-bit nonce parts (+21 offset).
 *   2. The opponent reconstructs the nonce, recomputes the hash, and checks
 *      that it matches the committed values.
 *
 * Note amounts occupy non-overlapping ranges for deterministic classification:
 *   - Commit notes:  [100_001, 165_536]  (hash chunk + 1 + 100_000)
 *   - Reveal move:   [1, 20]
 *   - Reveal nonce:  [21, 65_556]        (nonce chunk + 21)
 *
 * Note detection uses ID-based filtering: all opponent note IDs that existed
 * before battle are marked as stale. New notes are classified by amount range,
 * not by arrival order.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { useMultiSend, useSyncState } from "@miden-sdk/react";
import { useGameStore } from "../store/gameStore";
import { useNoteDecoder } from "./useNoteDecoder";
import {
  createCommitment,
  createReveal,
  verifyReveal,
  COMMIT_AMOUNT_OFFSET,
} from "../engine/commitment";
import { MIDEN_FAUCET_ID } from "../constants/miden";
import { MOVE_MIN, MOVE_MAX, NONCE_CHUNK_MAX, COMMIT_CHUNK_MAX } from "../constants/protocol";
import type { CommitData, RevealData } from "../types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseCommitRevealReturn {
  /** Create a cryptographic commitment for a move and send hash parts to the opponent. */
  commit: (move: number) => Promise<void>;
  /** Reveal our previously committed move by sending the move + nonce parts. */
  reveal: () => Promise<void>;
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
  const sessionWalletId = useGameStore((s) => s.setup.sessionWalletId);
  const opponentId = useGameStore((s) => s.match.opponentId);
  const round = useGameStore((s) => s.battle.round);
  const battleStaleNoteIds = useGameStore((s) => s.battle.staleNoteIds);
  const setMyCommit = useGameStore((s) => s.setMyCommit);
  const setOpponentCommitNotes = useGameStore((s) => s.setOpponentCommitNotes);
  const setMyReveal = useGameStore((s) => s.setMyReveal);
  const setOpponentReveal = useGameStore((s) => s.setOpponentReveal);

  const { sendMany } = useMultiSend();
  const { sync } = useSyncState();
  const { allOpponentNotes } = useNoteDecoder(opponentId);

  const [isCommitted, setIsCommitted] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);
  const [opponentCommitted, setOpponentCommitted] = useState(false);
  const [opponentRevealed, setOpponentRevealed] = useState(false);
  const [opponentMove, setOpponentMove] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Store the current commitment locally for the reveal step
  const commitDataRef = useRef<CommitData | null>(null);

  // ID-based note tracking: notes in this set are skipped.
  // Initialised from battle staleNoteIds (all notes before battle started).
  // Notes consumed as commits or reveals are added here so they're not
  // reprocessed in later rounds.
  const handledNoteIds = useRef(new Set(battleStaleNoteIds));

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
    // Snapshot ALL current opponent notes as handled so that notes from
    // previous rounds cannot be misclassified in the new round, even if
    // earlier notes were missed by ID tracking (e.g. notes that arrived
    // between syncs or were re-fetched with new JS objects).
    for (const note of allOpponentNotes) {
      handledNoteIds.current.add(note.noteId);
    }
  }, [round, allOpponentNotes]);

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

        // Sync wallet state before building tx to avoid stale commitment
        await sync();
        // Send 2 notes: hash part1 and part2, with offset for distinct range
        await sendMany({
          from: sessionWalletId!,
          assetId: MIDEN_FAUCET_ID,
          recipients: [
            { to: opponentId, amount: commitment.part1 + COMMIT_AMOUNT_OFFSET },
            { to: opponentId, amount: commitment.part2 + COMMIT_AMOUNT_OFFSET },
          ],
          noteType: "public",
        });

        commitDataRef.current = commitData;
        setMyCommit(commitData);
        setIsCommitted(true);

        console.log("[useCommitReveal] commit sent", {
          round,
          part1: commitment.part1.toString(),
          part2: commitment.part2.toString(),
          sentAmount1: (commitment.part1 + COMMIT_AMOUNT_OFFSET).toString(),
          sentAmount2: (commitment.part2 + COMMIT_AMOUNT_OFFSET).toString(),
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to send commitment.";
        console.error("[useCommitReveal] commit failed", err);
        setError(message);
      }
    },
    [isCommitted, sessionWalletId, opponentId, round, sendMany, setMyCommit],
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

      await sync();
      await sendMany({
        from: sessionWalletId!,
        assetId: MIDEN_FAUCET_ID,
        recipients: [
          { to: opponentId!, amount: BigInt(revealData.move) },
          { to: opponentId!, amount: revealData.noncePart1 },
          { to: opponentId!, amount: revealData.noncePart2 },
        ],
        noteType: "public",
      });

      const revealStoreData: RevealData = {
        move: revealData.move,
        noncePart1: revealData.noncePart1,
        noncePart2: revealData.noncePart2,
      };
      setMyReveal(revealStoreData);
      setIsRevealed(true);

      console.log("[useCommitReveal] reveal sent", {
        round,
        move: revealData.move,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to send reveal.";
      console.error("[useCommitReveal] reveal failed", err);
      setError(message);
    }
  }, [isRevealed, sessionWalletId, opponentId, round, sendMany, setMyReveal]);

  // -----------------------------------------------------------------------
  // Detect opponent commit notes: 2 new notes with amount in commit range
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (opponentCommitted) return;

    const newNotes = allOpponentNotes.filter(
      (n) => !handledNoteIds.current.has(n.noteId),
    );

    // Commit amounts live in (COMMIT_AMOUNT_OFFSET, COMMIT_CHUNK_MAX].
    // The upper bound excludes stake notes (10M) and other high-value notes.
    const commitCandidates = newNotes.filter(
      (n) => n.amount > COMMIT_AMOUNT_OFFSET && n.amount <= COMMIT_CHUNK_MAX,
    );

    if (commitCandidates.length < 2) return;

    const part1 = commitCandidates[0];
    const part2 = commitCandidates[1];

    handledNoteIds.current.add(part1.noteId);
    handledNoteIds.current.add(part2.noteId);

    // Strip offset to get raw hash values for verification
    const rawPart1 = part1.amount - COMMIT_AMOUNT_OFFSET;
    const rawPart2 = part2.amount - COMMIT_AMOUNT_OFFSET;

    console.log("[useCommitReveal] opponent commit detected", {
      round,
      rawPart1: rawPart1.toString(),
      rawPart2: rawPart2.toString(),
    });

    setOpponentCommitNotes([
      { noteId: part1.noteId, amount: rawPart1 },
      { noteId: part2.noteId, amount: rawPart2 },
    ]);
    setOpponentCommitted(true);
  }, [opponentCommitted, allOpponentNotes, round, setOpponentCommitNotes]);

  // -----------------------------------------------------------------------
  // Detect opponent reveal notes: 3 new notes with amount <= NONCE_CHUNK_MAX
  // (1 move in [1,20] + 2 nonce parts in [21, NONCE_CHUNK_MAX])
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!opponentCommitted || opponentRevealed) return;

    const newNotes = allOpponentNotes.filter(
      (n) => !handledNoteIds.current.has(n.noteId),
    );

    // Reveal notes: move in [1, 20], nonce parts in [21, NONCE_CHUNK_MAX].
    // Cap at NONCE_CHUNK_MAX instead of COMMIT_AMOUNT_OFFSET to exclude
    // stray signal notes (join=100, accept=101) that could contaminate
    // nonce part detection.
    const revealCandidates = newNotes.filter(
      (n) => n.amount > 0n && n.amount <= NONCE_CHUNK_MAX,
    );

    if (revealCandidates.length < 3) return;

    // Identify move note (amount in [1, 20]) and nonce parts (amount > 20)
    const moveNote = revealCandidates.find(
      (n) => n.amount >= MOVE_MIN && n.amount <= MOVE_MAX,
    );
    const nonceParts = revealCandidates.filter(
      (n) => n !== moveNote && n.amount > MOVE_MAX,
    );

    if (!moveNote || nonceParts.length < 2) return;

    // Mark as handled
    handledNoteIds.current.add(moveNote.noteId);
    handledNoteIds.current.add(nonceParts[0].noteId);
    handledNoteIds.current.add(nonceParts[1].noteId);

    const oppMove = Number(moveNote.amount);
    const noncePart1 = nonceParts[0].amount;
    const noncePart2 = nonceParts[1].amount;

    // Read committed values from store (already offset-stripped)
    const storeState = useGameStore.getState();
    const commitNoteRefs = storeState.battle.opponentCommitNotes;
    if (commitNoteRefs.length < 2) return;

    const commitPart1 = commitNoteRefs[0].amount;
    const commitPart2 = commitNoteRefs[1].amount;

    console.log("[useCommitReveal] opponent reveal detected", {
      round,
      move: oppMove,
      noncePart1: noncePart1.toString(),
      noncePart2: noncePart2.toString(),
      commitPart1: commitPart1.toString(),
      commitPart2: commitPart2.toString(),
    });

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
        console.log("[useCommitReveal] opponent reveal verified", { round, move: oppMove });
        setOpponentMove(oppMove);
        setOpponentReveal({
          move: oppMove,
          noncePart1,
          noncePart2,
        });
        setOpponentRevealed(true);
      } else {
        console.error("[useCommitReveal] opponent reveal verification FAILED", {
          round,
          oppMove,
          noncePart1: noncePart1.toString(),
          noncePart2: noncePart2.toString(),
          commitPart1: commitPart1.toString(),
          commitPart2: commitPart2.toString(),
          revealNoteIds: [moveNote!.noteId, nonceParts[0].noteId, nonceParts[1].noteId],
          commitNoteIds: commitNoteRefs.map((n) => n.noteId),
          unhandledNoteCount: newNotes.length,
        });
        setError("Opponent reveal verification failed - possible cheating detected.");
      }
    })();
  }, [opponentCommitted, opponentRevealed, allOpponentNotes, round, setOpponentReveal]);

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
