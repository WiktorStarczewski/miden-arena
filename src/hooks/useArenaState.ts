/**
 * useArenaState — Polls arena account storage and exposes on-chain game state.
 *
 * Backed by the `arena` slice in the Zustand game store to avoid duplicate
 * polling when multiple components/hooks read arena state.
 *
 * Usage:
 *   const { gameState, round, refresh } = useArenaState();
 *   // or with custom interval:
 *   const arena = useArenaState(3000);
 */

import { useEffect, useRef, useCallback, useMemo } from "react";
import { useMiden } from "@miden-sdk/react";
import { useGameStore, type ArenaState } from "../store/gameStore";
import { ARENA_ACCOUNT_ID } from "../constants/miden";
import { parseId } from "../utils/arenaNote";

/** Check if a bigint[] is all zeros (empty slot). */
function isEmptyWord(w: bigint[]): boolean {
  return w.length === 4 && w[0] === 0n && w[1] === 0n && w[2] === 0n && w[3] === 0n;
}

/** Extract a single Felt value from a Word (first element). */
function wordToFelt(w: bigint[]): number {
  return Number(w[0] ?? 0n);
}

/** Parse a player identity from a Word [prefix, suffix, 0, 0]. */
function parsePlayer(w: bigint[]): { prefix: bigint; suffix: bigint } | null {
  if (isEmptyWord(w)) return null;
  return { prefix: w[0], suffix: w[1] };
}

// ---------------------------------------------------------------------------
// Default interval
// ---------------------------------------------------------------------------

const DEFAULT_POLL_MS = 5000;

// ---------------------------------------------------------------------------
// Hook return type
// ---------------------------------------------------------------------------

export interface UseArenaStateReturn extends ArenaState {
  refresh: () => Promise<void>;
  isPlayerA: (myAccountId: string) => boolean;
  isPlayerB: (myAccountId: string) => boolean;
  myCommitSlotEmpty: (myAccountId: string) => boolean;
  myRevealSlotEmpty: (myAccountId: string) => boolean;
  bothCommitted: () => boolean;
  bothRevealed: () => boolean;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useArenaState(pollIntervalMs?: number): UseArenaStateReturn {
  const { client } = useMiden();
  const arena = useGameStore((s) => s.arena);
  const setArena = useGameStore((s) => s.setArena);
  const importedRef = useRef(false);

  // ----- Refresh: read all arena storage slots -----
  const refresh = useCallback(async () => {
    if (!client || !ARENA_ACCOUNT_ID) return;

    try {
      setArena({ loading: true, error: null });

      const arenaId = parseId(ARENA_ACCOUNT_ID);

      // Import arena account once (idempotent)
      if (!importedRef.current) {
        try {
          await client.importAccountById(arenaId);
        } catch {
          // Already imported
        }
        importedRef.current = true;
      }

      // Sync to get latest state
      await client.syncState();

      const storage = await client.getAccountStorage(arenaId);

      // Read slots — try string names first (matching Rust field names).
      // If this doesn't work, Step 0 verification will reveal the correct access pattern.
      const readSlot = (name: string): bigint[] => {
        try {
          const w = storage.getItem(name);
          if (w && typeof w.toU64s === "function") {
            const u64s = w.toU64s();
            return [u64s[0], u64s[1], u64s[2], u64s[3]];
          }
          // Single Felt value — extract via toFelts()[0]
          if (w && typeof w.toFelts === "function") {
            return [w.toFelts()[0].asInt(), 0n, 0n, 0n];
          }
          return [0n, 0n, 0n, 0n];
        } catch {
          return [0n, 0n, 0n, 0n];
        }
      };

      const newState: Partial<ArenaState> = {
        gameState: wordToFelt(readSlot("game_state")),
        round: wordToFelt(readSlot("round")),
        winner: wordToFelt(readSlot("winner")),
        teamsSubmitted: wordToFelt(readSlot("teams_submitted")),
        playerA: parsePlayer(readSlot("player_a")),
        playerB: parsePlayer(readSlot("player_b")),
        moveACommit: readSlot("move_a_commit"),
        moveBCommit: readSlot("move_b_commit"),
        moveAReveal: readSlot("move_a_reveal"),
        moveBReveal: readSlot("move_b_reveal"),
        playerAChamps: [
          readSlot("champ_a_0"),
          readSlot("champ_a_1"),
          readSlot("champ_a_2"),
        ],
        playerBChamps: [
          readSlot("champ_b_0"),
          readSlot("champ_b_1"),
          readSlot("champ_b_2"),
        ],
        loading: false,
        error: null,
      };

      setArena(newState);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to read arena state";
      console.error("[useArenaState] refresh failed", err);
      setArena({ loading: false, error: message });
    }
  }, [client, setArena]);

  // ----- Poll loop -----
  useEffect(() => {
    if (!ARENA_ACCOUNT_ID) return;

    // Initial fetch
    refresh();

    const interval = setInterval(refresh, pollIntervalMs ?? DEFAULT_POLL_MS);
    return () => clearInterval(interval);
  }, [refresh, pollIntervalMs]);

  // ----- Derived helpers -----
  const helpers = useMemo(() => {
    const matchesPlayer = (
      myAccountId: string,
      player: { prefix: bigint; suffix: bigint } | null,
    ): boolean => {
      if (!player) return false;
      try {
        const id = parseId(myAccountId);
        return id.prefix().asInt() === player.prefix && id.suffix().asInt() === player.suffix;
      } catch {
        return false;
      }
    };

    return {
      isPlayerA: (myAccountId: string) => matchesPlayer(myAccountId, arena.playerA),
      isPlayerB: (myAccountId: string) => matchesPlayer(myAccountId, arena.playerB),
      myCommitSlotEmpty: (myAccountId: string) => {
        if (matchesPlayer(myAccountId, arena.playerA)) return isEmptyWord(arena.moveACommit);
        if (matchesPlayer(myAccountId, arena.playerB)) return isEmptyWord(arena.moveBCommit);
        return true;
      },
      myRevealSlotEmpty: (myAccountId: string) => {
        if (matchesPlayer(myAccountId, arena.playerA)) return isEmptyWord(arena.moveAReveal);
        if (matchesPlayer(myAccountId, arena.playerB)) return isEmptyWord(arena.moveBReveal);
        return true;
      },
      bothCommitted: () => !isEmptyWord(arena.moveACommit) && !isEmptyWord(arena.moveBCommit),
      bothRevealed: () => !isEmptyWord(arena.moveAReveal) && !isEmptyWord(arena.moveBReveal),
    };
  }, [arena]);

  return {
    ...arena,
    refresh,
    ...helpers,
  };
}
