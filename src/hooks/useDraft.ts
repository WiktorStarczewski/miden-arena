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
import { useSend } from "@miden-sdk/react";
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

  const { send } = useSend();
  const { draftPickNotes } = useNoteDecoder(opponentId);

  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  // Track how many opponent picks we have already processed
  const processedPickCount = useRef(0);

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
      setIsSending(true);

      try {
        // Send pick to opponent
        const amount = encodeDraftPick(championId);
        await send({
          recipientAddress: opponentId,
          faucetId: MIDEN_FAUCET_ID,
          amount,
          noteType: "public",
        });

        // Record pick locally
        storePickChampion(championId, "me");
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to send draft pick.";
        setError(message);
      } finally {
        setIsSending(false);
      }
    },
    [isMyTurn, pool, opponentId, send, storePickChampion],
  );

  // -----------------------------------------------------------------------
  // Detect opponent draft picks
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (done) return;

    // Process any new draft pick notes we have not handled yet
    const unprocessed = draftPickNotes.slice(processedPickCount.current);
    if (unprocessed.length === 0) return;

    for (const note of unprocessed) {
      try {
        const championId = decodeDraftPick(note.amount);
        if (isValidPick(pool, championId)) {
          storePickChampion(championId, "opponent");
        }
      } catch {
        // Ignore malformed notes
      }
    }

    processedPickCount.current = draftPickNotes.length;
  }, [draftPickNotes, pool, done, storePickChampion]);

  // -----------------------------------------------------------------------
  // Transition to battle when draft is complete
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!done) return;
    if (myTeam.length !== TEAM_SIZE || opponentTeam.length !== TEAM_SIZE) return;

    initBattle();
    setScreen("battle");
  }, [done, myTeam.length, opponentTeam.length, initBattle, setScreen]);

  return {
    pickChampion,
    isMyTurn,
    isDone: done,
    draftPool: pool,
    error,
    isSending,
  };
}
