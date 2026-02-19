/**
 * useMatchmaking - Host or join a match via Miden note exchange.
 *
 * Protocol:
 *  1. **Host** - Shares their session wallet ID out-of-band (e.g. copy/paste).
 *     Waits for an incoming note with amount = JOIN_SIGNAL (100).
 *     When received, sends ACCEPT_SIGNAL (101) back to the joiner.
 *
 *  2. **Joiner** - Sends JOIN_SIGNAL to the host's wallet ID.
 *     Waits for an incoming ACCEPT_SIGNAL from the host.
 *
 * Once both sides have exchanged signals, the match transitions to the draft
 * screen. Opponent IDs and roles are persisted so the match can survive
 * page reloads.
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { useSend, useNotes } from "@miden-sdk/react";
import { JOIN_SIGNAL, ACCEPT_SIGNAL, LEAVE_SIGNAL } from "../constants/protocol";
import { MIDEN_FAUCET_ID } from "../constants/miden";
import { useGameStore } from "../store/gameStore";
import { saveOpponentId, saveRole, clearGameState, getOpponentId } from "../utils/persistence";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseMatchmakingReturn {
  /** Start hosting a match. The caller should display `sessionWalletId` for the opponent. */
  host: () => void;
  /** Join a hosted match by sending JOIN_SIGNAL to the host's wallet ID. */
  join: (hostWalletId: string) => Promise<void>;
  /** Whether we are currently waiting for the other player. */
  isWaiting: boolean;
  /** The detected opponent's account ID (set once matchmaking completes). */
  opponentId: string | null;
  /** Error message if matchmaking fails. */
  error: string | null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useMatchmaking(): UseMatchmakingReturn {
  const sessionWalletId = useGameStore((s) => s.setup.sessionWalletId);
  const setOpponent = useGameStore((s) => s.setOpponent);
  const setScreen = useGameStore((s) => s.setScreen);
  const initDraft = useGameStore((s) => s.initDraft);
  const resetGame = useGameStore((s) => s.resetGame);

  const { send, stage } = useSend();
  const { noteSummaries } = useNotes({ status: "committed" });

  const [isWaiting, setIsWaiting] = useState(false);
  const [opponentId, setOpponentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [role, setLocalRole] = useState<"host" | "joiner" | null>(null);

  // Keep a ref to the latest noteSummaries so host()/join() can snapshot
  // stale notes at call time (before effects run).
  const noteSummariesRef = useRef(noteSummaries);
  noteSummariesRef.current = noteSummaries;

  // Track which JOIN / ACCEPT note IDs we have already handled.
  // Populated with stale notes when host()/join() is called so that
  // only genuinely new notes are processed.
  const handledJoinNoteIds = useRef<Set<string>>(new Set());
  const handledAcceptNoteIds = useRef<Set<string>>(new Set());
  const matchCompletedRef = useRef(false);

  // -----------------------------------------------------------------------
  // host() - Wait for a JOIN signal
  // -----------------------------------------------------------------------
  const host = useCallback(() => {
    // If rehosting, notify the previous opponent and clear persisted state
    const prevOpponent = getOpponentId();
    if (prevOpponent && sessionWalletId) {
      send({
        from: sessionWalletId,
        to: prevOpponent,
        assetId: MIDEN_FAUCET_ID,
        amount: LEAVE_SIGNAL,
        noteType: "public",
      }).catch(() => { /* best-effort */ });
    }
    clearGameState();

    // Reset all in-memory game state (draft/match/battle/result)
    resetGame();
    // resetGame sets screen to "title"; override back to "lobby"
    setScreen("lobby");

    // Snapshot ALL current JOIN notes as stale so the detection effect
    // only reacts to genuinely new JOIN notes from a new joiner.
    handledJoinNoteIds.current = new Set(
      noteSummariesRef.current
        .filter((n) => n.assets.length > 0 && n.assets[0].amount === JOIN_SIGNAL)
        .map((n) => n.id),
    );

    setLocalRole("host");
    setOpponentId(null);
    setIsWaiting(true);
    setError(null);
    matchCompletedRef.current = false;
  }, [sessionWalletId, send, resetGame, setScreen]);

  // -----------------------------------------------------------------------
  // join() - Send JOIN signal and wait for ACCEPT
  // -----------------------------------------------------------------------
  const join = useCallback(
    async (hostWalletId: string) => {
      if (!sessionWalletId) {
        setError("Session wallet not ready. Please complete setup first.");
        return;
      }

      // ---------------------------------------------------------------
      // Always treat a lobby join as a fresh game — clear any stale
      // persisted state so we never accidentally restore an old session.
      // ---------------------------------------------------------------
      clearGameState();
      resetGame();
      setScreen("lobby");

      // Snapshot ALL current ACCEPT notes from this host as stale so
      // we only react to the new ACCEPT that follows our JOIN.
      handledAcceptNoteIds.current = new Set(
        noteSummariesRef.current
          .filter(
            (n) =>
              n.sender === hostWalletId &&
              n.assets.length > 0 &&
              n.assets[0].amount === ACCEPT_SIGNAL,
          )
          .map((n) => n.id),
      );

      setLocalRole("joiner");
      setIsWaiting(true);
      setError(null);
      matchCompletedRef.current = false;

      try {
        await send({
          from: sessionWalletId,
          to: hostWalletId,
          assetId: MIDEN_FAUCET_ID,
          amount: JOIN_SIGNAL,
          noteType: "public",
        });

        // The opponent ID for a joiner is the host's wallet ID
        setOpponentId(hostWalletId);
      } catch (err) {
        console.error("[useMatchmaking] join send failed:", err);
        const message =
          err instanceof Error ? err.message : "Failed to send join signal.";
        setError(message);
        setIsWaiting(false);
      }
    },
    [sessionWalletId, send, resetGame, setScreen],
  );

  // -----------------------------------------------------------------------
  // Host: detect JOIN note and respond with ACCEPT
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (role !== "host" || !isWaiting || matchCompletedRef.current) return;

    const joinNote = noteSummaries.find(
      (n) =>
        n.assets.length > 0 &&
        n.assets[0].amount === JOIN_SIGNAL &&
        !handledJoinNoteIds.current.has(n.id),
    );

    if (!joinNote) return;

    // Mark as handled so we do not process it twice
    handledJoinNoteIds.current.add(joinNote.id);
    const joinerId = joinNote.sender!;
    setOpponentId(joinerId);

    // Send ACCEPT back to the joiner
    (async () => {
      try {
        if (!sessionWalletId) throw new Error("Session wallet not ready.");

        await send({
          from: sessionWalletId,
          to: joinerId,
          assetId: MIDEN_FAUCET_ID,
          amount: ACCEPT_SIGNAL,
          noteType: "public",
        });

        // Snapshot ALL note IDs from the joiner so useDraft can distinguish
        // stale notes (from previous games) from new ones by ID.
        const staleNoteIds = noteSummaries
          .filter((n) => n.sender === joinerId)
          .map((n) => n.id);

        matchCompletedRef.current = true;
        setOpponent(joinerId, "host");
        saveOpponentId(joinerId);
        saveRole("host");
        initDraft(staleNoteIds);
        setScreen("draft");
        setIsWaiting(false);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to send accept signal.";
        setError(message);
        setIsWaiting(false);
      }
    })();
  }, [role, isWaiting, noteSummaries, sessionWalletId, send, setOpponent, setScreen, initDraft]);

  // -----------------------------------------------------------------------
  // Joiner: detect ACCEPT note
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (role !== "joiner" || !isWaiting || !opponentId || matchCompletedRef.current) {
      return;
    }

    const acceptNote = noteSummaries.find(
      (n) =>
        n.sender === opponentId &&
        n.assets.length > 0 &&
        n.assets[0].amount === ACCEPT_SIGNAL &&
        !handledAcceptNoteIds.current.has(n.id),
    );

    if (!acceptNote) return;

    // Snapshot ALL note IDs from the host so useDraft can distinguish
    // stale notes (from previous games) from new ones by ID.
    const staleNoteIds = noteSummaries
      .filter((n) => n.sender === opponentId)
      .map((n) => n.id);

    matchCompletedRef.current = true;
    setOpponent(opponentId, "joiner");
    saveOpponentId(opponentId);
    saveRole("joiner");
    initDraft(staleNoteIds);
    setScreen("draft");
    setIsWaiting(false);
  }, [role, isWaiting, opponentId, noteSummaries, setOpponent, setScreen, initDraft]);

  // Keep send stage visible for debugging, suppress unused lint
  void stage;

  return {
    host,
    join,
    isWaiting,
    opponentId,
    error,
  };
}
