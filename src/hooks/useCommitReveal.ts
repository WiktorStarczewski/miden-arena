/**
 * useCommitReveal - Core commit-reveal cryptographic protocol for combat moves.
 *
 * Each combat turn follows a two-phase protocol:
 *
 *  **Commit phase:**
 *   1. Player picks a move (encoded as 1-20).
 *   2. A random nonce is generated and SHA-256(move || nonce) is computed.
 *   3. The first 32 bits of the hash are split into 2 × 16-bit values.
 *   4. One note is sent with amount=1 and a NoteAttachment carrying
 *      [MSG_TYPE_COMMIT, hashPart1, hashPart2].
 *
 *  **Reveal phase:**
 *   1. One note is sent with amount=1 and a NoteAttachment carrying
 *      [MSG_TYPE_REVEAL, move, noncePart1, noncePart2].
 *   2. The opponent reconstructs the nonce, recomputes the hash, and checks
 *      that it matches the committed values.
 *
 * Data is carried in NoteAttachment (not token amounts), reducing wallet
 * drain to ~2n per turn instead of ~265K.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { useTransaction, useSyncState } from "@miden-sdk/react";
import {
  AccountId,
  Felt,
  FeltArray,
  FungibleAsset,
  Note,
  NoteAssets,
  NoteAttachment,
  NoteAttachmentKind,
  NoteAttachmentScheme,
  NoteType,
  OutputNote,
  OutputNoteArray,
  TransactionRequestBuilder,
} from "@miden-sdk/miden-sdk";
import type { InputNoteRecord } from "@miden-sdk/miden-sdk";
import { useGameStore } from "../store/gameStore";
import { useNoteDecoder } from "./useNoteDecoder";
import {
  createCommitment,
  createReveal,
  verifyReveal,
} from "../engine/commitment";
import { MIDEN_FAUCET_ID, PROTOCOL_NOTE_AMOUNT } from "../constants/miden";
import { MSG_TYPE_COMMIT, MSG_TYPE_REVEAL } from "../constants/protocol";
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
  /** Whether the opponent has sent their commit note this turn. */
  opponentCommitted: boolean;
  /** Whether the opponent has sent their reveal note this turn. */
  opponentRevealed: boolean;
  /** The decoded opponent move (set after reveal verification). `null` until verified. */
  opponentMove: number | null;
  /** Error message if any step fails. */
  error: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse an AccountId from a bech32/hex string. */
function parseId(id: string): AccountId {
  try {
    return AccountId.fromBech32(id);
  } catch {
    return AccountId.fromHex(id);
  }
}

/** Build and send a single P2ID note with a FeltArray attachment. */
async function sendAttachmentNote(
  execute: ReturnType<typeof useTransaction>["execute"],
  senderId: string,
  targetId: string,
  feltValues: bigint[],
): Promise<void> {
  const sender = parseId(senderId);
  const target = parseId(targetId);
  const faucet = parseId(MIDEN_FAUCET_ID);

  const elements = new FeltArray(feltValues.map((v) => new Felt(v)));
  const scheme = NoteAttachmentScheme.none();
  const attachment = NoteAttachment.newArray(scheme, elements);

  const note = Note.createP2IDNote(
    sender,
    target,
    new NoteAssets([new FungibleAsset(faucet, PROTOCOL_NOTE_AMOUNT)]),
    NoteType.Public,
    attachment,
  );

  const txRequest = new TransactionRequestBuilder()
    .withOwnOutputNotes(new OutputNoteArray([OutputNote.full(note)]))
    .build();

  await execute({ accountId: senderId, request: txRequest });
}

/**
 * Try to read the attachment from an InputNoteRecord.
 * Returns the FeltArray if the note has an Array attachment, or null.
 */
function readAttachment(record: InputNoteRecord): FeltArray | null {
  const meta = record.metadata();
  if (!meta) return null;
  const att = meta.attachment();
  if (att.attachmentKind() === NoteAttachmentKind.None) return null;
  return att.asArray() ?? null;
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

  const { execute } = useTransaction();
  const { sync } = useSyncState();
  const { allOpponentNotes, rawOpponentNotes } = useNoteDecoder(opponentId);

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
    // previous rounds cannot be misclassified in the new round.
    for (const note of allOpponentNotes) {
      handledNoteIds.current.add(note.noteId);
    }
  }, [round, allOpponentNotes]);

  // -----------------------------------------------------------------------
  // commit(move) - Generate commitment and send 1 attachment note
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

        await sendAttachmentNote(
          execute,
          sessionWalletId,
          opponentId,
          [MSG_TYPE_COMMIT, commitment.part1, commitment.part2],
        );

        commitDataRef.current = commitData;
        setMyCommit(commitData);
        setIsCommitted(true);

        console.log("[useCommitReveal] commit sent", {
          round,
          part1: commitment.part1.toString(),
          part2: commitment.part2.toString(),
        });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to send commitment.";
        console.error("[useCommitReveal] commit failed", err);
        setError(message);
      }
    },
    [isCommitted, sessionWalletId, opponentId, round, execute, sync, setMyCommit],
  );

  // -----------------------------------------------------------------------
  // reveal() - Send 1 attachment note: move + nonce parts
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

    if (!opponentId) {
      setError("No opponent connected.");
      return;
    }

    setError(null);

    try {
      const { move, nonce } = commitDataRef.current;
      const revealData = createReveal(move, nonce);

      await sync();

      await sendAttachmentNote(
        execute,
        sessionWalletId,
        opponentId,
        [MSG_TYPE_REVEAL, BigInt(revealData.move), revealData.noncePart1, revealData.noncePart2],
      );

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
  }, [isRevealed, sessionWalletId, opponentId, round, execute, sync, setMyReveal]);

  // -----------------------------------------------------------------------
  // Detect opponent commit note: 1 new note with MSG_TYPE_COMMIT attachment
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (opponentCommitted) return;

    for (const record of rawOpponentNotes) {
      const noteId = record.id().toString();
      if (handledNoteIds.current.has(noteId)) continue;

      const felts = readAttachment(record);
      if (!felts || felts.length() < 3) continue;

      const msgType = felts.get(0).asInt();
      if (msgType !== MSG_TYPE_COMMIT) continue;

      const rawPart1 = felts.get(1).asInt();
      const rawPart2 = felts.get(2).asInt();

      handledNoteIds.current.add(noteId);

      console.log("[useCommitReveal] opponent commit detected", {
        round,
        rawPart1: rawPart1.toString(),
        rawPart2: rawPart2.toString(),
      });

      setOpponentCommitNotes([
        { noteId, amount: rawPart1 },
        { noteId, amount: rawPart2 },
      ]);
      setOpponentCommitted(true);
      break;
    }
  }, [opponentCommitted, rawOpponentNotes, round, setOpponentCommitNotes]);

  // -----------------------------------------------------------------------
  // Detect opponent reveal note: 1 new note with MSG_TYPE_REVEAL attachment
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!opponentCommitted || opponentRevealed) return;

    for (const record of rawOpponentNotes) {
      const noteId = record.id().toString();
      if (handledNoteIds.current.has(noteId)) continue;

      const felts = readAttachment(record);
      if (!felts || felts.length() < 4) continue;

      const msgType = felts.get(0).asInt();
      if (msgType !== MSG_TYPE_REVEAL) continue;

      const oppMove = Number(felts.get(1).asInt());
      const noncePart1 = felts.get(2).asInt();
      const noncePart2 = felts.get(3).asInt();

      handledNoteIds.current.add(noteId);

      // Read committed values from store (already raw)
      const storeState = useGameStore.getState();
      const commitNoteRefs = storeState.battle.opponentCommitNotes;
      if (commitNoteRefs.length < 2) break;

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
        try {
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
            });
            setError("Opponent reveal verification failed - possible cheating detected.");
          }
        } catch (err) {
          console.error("[useCommitReveal] reveal verification threw", err);
          setError("Reveal verification error.");
        }
      })();

      break;
    }
  }, [opponentCommitted, opponentRevealed, rawOpponentNotes, round, setOpponentReveal]);

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
