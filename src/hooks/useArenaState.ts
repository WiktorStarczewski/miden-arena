/**
 * useArenaState — Polls matchmaking + combat account storage and exposes on-chain game state.
 *
 * Backed by the `arena` slice in the Zustand game store to avoid duplicate
 * polling when multiple components/hooks read arena state.
 *
 * After the split, matchmaking holds: game_state, players, teams, stakes, winner.
 * Combat holds: round, commits, reveals, champion states, combat_state.
 *
 * Usage:
 *   const { gameState, round, refresh } = useArenaState();
 *   // or with custom interval:
 *   const arena = useArenaState(3000);
 */

import { useEffect, useRef, useCallback, useMemo } from "react";
import { useMiden } from "@miden-sdk/react";
import { useGameStore, type ArenaState } from "../store/gameStore";
import { MATCHMAKING_ACCOUNT_ID, COMBAT_ACCOUNT_ID } from "../constants/miden";
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
  const importedMatchmakingRef = useRef(false);
  const importedCombatRef = useRef(false);

  // ----- Refresh: read both account storage slots -----
  const refresh = useCallback(async () => {
    if (!client || (!MATCHMAKING_ACCOUNT_ID && !COMBAT_ACCOUNT_ID)) return;

    try {
      setArena({ loading: true, error: null });

      const newState: Partial<ArenaState> = {};

      // --- Read matchmaking account storage ---
      if (MATCHMAKING_ACCOUNT_ID) {
        const matchmakingId = parseId(MATCHMAKING_ACCOUNT_ID);

        if (!importedMatchmakingRef.current) {
          try {
            await client.importAccountById(matchmakingId);
          } catch {
            // Already imported
          }
          importedMatchmakingRef.current = true;
        }

        await client.syncState();
        const account = await client.getAccount(matchmakingId);
        if (!account) throw new Error("Matchmaking account not found");
        const storage = account.storage();

        const readSlot = (name: string): bigint[] => {
          try {
            const w = storage.getItem(name);
            if (w && typeof w.toU64s === "function") {
              const u64s = w.toU64s();
              return [u64s[0], u64s[1], u64s[2], u64s[3]];
            }
            if (w && typeof w.toFelts === "function") {
              return [w.toFelts()[0].asInt(), 0n, 0n, 0n];
            }
            return [0n, 0n, 0n, 0n];
          } catch {
            return [0n, 0n, 0n, 0n];
          }
        };

        newState.gameState = wordToFelt(readSlot("game_state"));
        newState.winner = wordToFelt(readSlot("winner"));
        newState.teamsSubmitted = wordToFelt(readSlot("teams_submitted"));
        newState.playerA = parsePlayer(readSlot("player_a"));
        newState.playerB = parsePlayer(readSlot("player_b"));
      }

      // --- Read combat account storage ---
      if (COMBAT_ACCOUNT_ID) {
        const combatId = parseId(COMBAT_ACCOUNT_ID);

        if (!importedCombatRef.current) {
          try {
            await client.importAccountById(combatId);
          } catch {
            // Already imported
          }
          importedCombatRef.current = true;
        }

        // Sync again if matchmaking wasn't read (otherwise already synced above)
        if (!MATCHMAKING_ACCOUNT_ID) {
          await client.syncState();
        }

        const account = await client.getAccount(combatId);
        if (!account) throw new Error("Combat account not found");
        const storage = account.storage();

        const readSlot = (name: string): bigint[] => {
          try {
            const w = storage.getItem(name);
            if (w && typeof w.toU64s === "function") {
              const u64s = w.toU64s();
              return [u64s[0], u64s[1], u64s[2], u64s[3]];
            }
            if (w && typeof w.toFelts === "function") {
              return [w.toFelts()[0].asInt(), 0n, 0n, 0n];
            }
            return [0n, 0n, 0n, 0n];
          } catch {
            return [0n, 0n, 0n, 0n];
          }
        };

        newState.round = wordToFelt(readSlot("round"));
        newState.moveACommit = readSlot("move_a_commit");
        newState.moveBCommit = readSlot("move_b_commit");
        newState.moveAReveal = readSlot("move_a_reveal");
        newState.moveBReveal = readSlot("move_b_reveal");
        newState.playerAChamps = [
          readSlot("champ_a_0"),
          readSlot("champ_a_1"),
          readSlot("champ_a_2"),
        ];
        newState.playerBChamps = [
          readSlot("champ_b_0"),
          readSlot("champ_b_1"),
          readSlot("champ_b_2"),
        ];
      }

      newState.loading = false;
      newState.error = null;
      setArena(newState);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to read arena state";
      console.error("[useArenaState] refresh failed", err);
      setArena({ loading: false, error: message });
    }
  }, [client, setArena]);

  // ----- Poll loop -----
  useEffect(() => {
    if (!MATCHMAKING_ACCOUNT_ID && !COMBAT_ACCOUNT_ID) return;

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
