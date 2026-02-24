/**
 * useDraft - Manages the champion draft phase via note exchange.
 *
 * The draft follows a snake order defined in DRAFT_ORDER: A-B-B-A-A-B where
 * "A" is the host and "B" is the joiner.
 *
 * When it is the local player's turn:
 *  1. Call `pickChampion(championId)` to select a champion from the pool.
 *  2. The hook encodes the pick as `championId + 1` and sends it to the opponent.
 *  3. The pick is recorded in the game store.
 *
 * When it is the opponent's turn:
 *  - The hook watches for incoming draft pick notes.
 *  - Upon detection, decodes the champion ID and records the opponent's pick.
 *
 * Once both players have TEAM_SIZE (3) champions, the draft is complete and
 * the game transitions to the battle screen.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { useSend, useSyncState } from "@miden-sdk/react";
import { useGameStore } from "../store/gameStore";
import { useNoteDecoder } from "./useNoteDecoder";
import { MIDEN_FAUCET_ID } from "../constants/miden";
import { TEAM_SIZE } from "../constants/protocol";
import { encodeDraftPick, decodeDraftPick } from "../engine/codec";
import {
  getCurrentPicker,
  isDraftComplete,
  isValidPick,
} from "../engine/draft";
import { saveDraftState, clearGameState } from "../utils/persistence";
import { playSfx } from "../audio/audioManager";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseDraftReturn {
  /** Pick a champion from the available pool. Only callable when it is our turn. */
  pickChampion: (championId: number) => Promise<void>;
  /** Whether it is the local player's turn to pick. */
  isMyTurn: boolean;
  /** Whether the draft phase is complete (both teams have TEAM_SIZE champions). */
  isDone: boolean;
  /** The remaining champion IDs available in the pool. */
  draftPool: number[];
  /** Error message if a pick fails. */
  error: string | null;
  /** Whether a pick transaction is currently in-flight. */
  isSending: boolean;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDraft(): UseDraftReturn {
  const sessionWalletId = useGameStore((s) => s.setup.sessionWalletId);
  const opponentId = useGameStore((s) => s.match.opponentId);
  const role = useGameStore((s) => s.match.role);
  const pool = useGameStore((s) => s.draft.pool);
  const myTeam = useGameStore((s) => s.draft.myTeam);
  const opponentTeam = useGameStore((s) => s.draft.opponentTeam);
  const pickNumber = useGameStore((s) => s.draft.pickNumber);
  const storePickChampion = useGameStore((s) => s.pickChampion);
  const setCurrentPicker = useGameStore((s) => s.setCurrentPicker);
  const setScreen = useGameStore((s) => s.setScreen);
  const initBattle = useGameStore((s) => s.initBattle);

  const resetGame = useGameStore((s) => s.resetGame);

  const { send } = useSend();
  const { sync } = useSyncState();
  const { draftPickNotes, leaveNotes, allOpponentNotes } = useNoteDecoder(opponentId);

  const staleNoteIds = useGameStore((s) => s.draft.staleNoteIds);

  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const isSendingRef = useRef(false);

  // Set of note IDs from the opponent that existed before this game started
  // (snapshotted by useMatchmaking at match-complete time) plus IDs already
  // processed in this session. Notes in this set are skipped by the detector.
  const handledNoteIds = useRef(new Set(staleNoteIds));
  const initialLeaveCount = useRef(-1);

  // -----------------------------------------------------------------------
  // Detect opponent leaving (rehost) and redirect to lobby
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (initialLeaveCount.current === -1) {
      initialLeaveCount.current = leaveNotes.length;
      return;
    }
    if (leaveNotes.length > initialLeaveCount.current) {
      clearGameState();
      resetGame();
      setScreen("lobby");
    }
  }, [leaveNotes, resetGame, setScreen]);

  // -----------------------------------------------------------------------
  // Derived state
  // -----------------------------------------------------------------------
  const done = isDraftComplete(myTeam, opponentTeam);
  const isMyTurn =
    !done && role !== null && getCurrentPicker(pickNumber, role) === "me";

  // -----------------------------------------------------------------------
  // Update currentPicker in store whenever pickNumber or role changes
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (role === null || done) return;
    const picker = getCurrentPicker(pickNumber, role);
    setCurrentPicker(picker);
  }, [pickNumber, role, done, setCurrentPicker]);

  // -----------------------------------------------------------------------
  // pickChampion - Local player picks a champion
  // -----------------------------------------------------------------------
  const pickChampion = useCallback(
    async (championId: number) => {
      // Synchronous ref guard — prevents concurrent sends even if React
      // hasn't re-rendered yet (isSending state would be stale).
      if (isSendingRef.current) return;

      if (!isMyTurn) {
        setError("It is not your turn to pick.");
        return;
      }

      if (!isValidPick(pool, championId)) {
        setError(`Champion ${championId} is not available in the pool.`);
        return;
      }

      if (!opponentId) {
        setError("No opponent connected.");
        return;
      }

      setError(null);
      isSendingRef.current = true;
      setIsSending(true);

      try {
        // Sync wallet state before building tx to avoid stale commitment
        await sync();
        // Send pick to opponent
        const amount = encodeDraftPick(championId);
        await send({
          from: sessionWalletId!,
          to: opponentId,
          assetId: MIDEN_FAUCET_ID,
          amount,
          noteType: "public",
        });

        console.log("[useDraft] pick sent successfully", {
          championId,
          to: opponentId,
          amount: amount.toString(),
        });

        // Record pick locally
        storePickChampion(championId, "me");
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to send draft pick.";
        setError(message);
      } finally {
        isSendingRef.current = false;
        setIsSending(false);
      }
    },
    [isMyTurn, pool, sessionWalletId, opponentId, send, storePickChampion],
  );

  // -----------------------------------------------------------------------
  // Detect opponent draft picks
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (done) return;

    // Find the first draft-pick note we haven't handled yet.
    // Uses ID-based filtering so late-arriving stale notes are skipped.
    const note = draftPickNotes.find(
      (n) => !handledNoteIds.current.has(n.noteId),
    );
    if (!note) return;

    // Mark handled immediately so we don't reprocess on the next render
    handledNoteIds.current.add(note.noteId);

    console.log("[useDraft] processing pick note", {
      noteId: note.noteId,
      amount: note.amount.toString(),
    });

    try {
      const championId = decodeDraftPick(note.amount);
      if (isValidPick(pool, championId)) {
        storePickChampion(championId, "opponent");
        playSfx("pick");
      } else {
        console.warn("[useDraft] skipping invalid pick", { championId, pool });
      }
    } catch (err) {
      console.warn("[useDraft] failed to decode pick note", err);
    }
  }, [draftPickNotes, pool, done, storePickChampion]);

  // -----------------------------------------------------------------------
  // Persist draft state to localStorage on every change
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (pool.length === 0) return; // not initialised yet
    saveDraftState({
      pool,
      myTeam,
      opponentTeam,
      pickNumber,
      processedOpponentNotes: opponentTeam.length,
    });
  }, [pool, myTeam, opponentTeam, pickNumber]);

  // -----------------------------------------------------------------------
  // Transition to battle when draft is complete
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!done) return;
    if (myTeam.length !== TEAM_SIZE || opponentTeam.length !== TEAM_SIZE) return;

    // Snapshot all current opponent note IDs so the battle phase can
    // distinguish pre-battle notes from new combat notes.
    const battleStaleNoteIds = allOpponentNotes.map((n) => n.noteId);

    clearGameState();
    initBattle(battleStaleNoteIds);
    setScreen("arenaSetup");
  }, [done, myTeam.length, opponentTeam.length, allOpponentNotes, initBattle, setScreen]);

  return {
    pickChampion,
    isMyTurn,
    isDone: done,
    draftPool: pool,
    error,
    isSending,
  };
}
