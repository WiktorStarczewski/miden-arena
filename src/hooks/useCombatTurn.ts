/**
 * useCombatTurn - Full turn lifecycle orchestrator for the battle phase.
 *
 * Each turn proceeds through a strict sequence of phases:
 *
 *  1. **choosing**      - Player selects a champion and ability.
 *  2. **committing**    - The move is hashed and commitment is sent to the arena.
 *  3. **waitingCommit** - Waiting for the opponent's commitment (arena polling).
 *  4. **revealing**     - Both committed; reveal is sent to the arena.
 *  5. **waitingReveal** - Waiting for the opponent's reveal (arena polling).
 *  6. **resolving**     - Both revealed; combat engine runs to determine outcomes.
 *  7. **animating**     - UI plays attack/damage animations before next turn.
 *
 * The arena contract auto-resolves when both reveals arrive. The frontend
 * detects this via two mechanisms:
 *  - Normal: opponent's reveal slot becomes non-zero (move readable)
 *  - Fallback: arena.round increments past battle.round (move data cleared)
 *
 * After resolution, champion states are updated, and the game checks whether
 * either team has been eliminated. If so, the match result is set and the
 * game transitions to the game-over screen.
 */

import { useCallback, useEffect, useRef } from "react";
import { useGameStore, type BattlePhase } from "../store/gameStore";
import { useCommitReveal } from "./useCommitReveal";
import { encodeMove, decodeMove } from "../engine/codec";
import { resolveTurn, isTeamEliminated } from "../engine/combat";
import { playSfx } from "../audio/audioManager";
import type { TurnAction, TurnRecord } from "../types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Duration (ms) to show the animation phase before advancing to the next turn.
 *  Must accommodate two sequential attack animations (faster champ first). */
const ANIMATION_DURATION_MS = 4000;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseCombatTurnReturn {
  /** Submit the player's chosen move for this turn. */
  submitMove: (action: TurnAction) => Promise<void>;
  /** Current phase of the turn lifecycle. */
  phase: BattlePhase;
  /** Whether the player can currently submit a move (only during "choosing" phase). */
  canSubmit: boolean;
  /** Error from the commit-reveal layer. */
  error: string | null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCombatTurn(): UseCombatTurnReturn {
  const phase = useGameStore((s) => s.battle.phase);
  const round = useGameStore((s) => s.battle.round);
  const myChampions = useGameStore((s) => s.battle.myChampions);
  const opponentChampions = useGameStore((s) => s.battle.opponentChampions);
  const setBattlePhase = useGameStore((s) => s.setBattlePhase);
  const updateChampions = useGameStore((s) => s.updateChampions);
  const addTurnRecord = useGameStore((s) => s.addTurnRecord);
  const nextRound = useGameStore((s) => s.nextRound);
  const setResult = useGameStore((s) => s.setResult);

  const {
    commit,
    reveal,
    isCommitted,
    isRevealed,
    opponentCommitted,
    opponentRevealed,
    opponentMove,
    error,
  } = useCommitReveal();

  // Read arena state directly from Zustand (avoids creating a duplicate polling loop).
  const arenaRound = useGameStore((s) => s.arena.round);
  const arenaWinner = useGameStore((s) => s.arena.winner);

  // Keep track of the encoded local move for resolution
  const localMoveRef = useRef<number | null>(null);
  // Guard against double-resolution in the same round
  const resolvedRoundRef = useRef<number>(0);

  // -----------------------------------------------------------------------
  // submitMove - Player has chosen their action
  // -----------------------------------------------------------------------
  const submitMove = useCallback(
    async (action: TurnAction) => {
      if (phase !== "choosing") return;

      const encoded = encodeMove(action);
      localMoveRef.current = encoded;

      setBattlePhase("committing");

      await commit(encoded);
    },
    [phase, commit, setBattlePhase],
  );

  // -----------------------------------------------------------------------
  // Phase transitions driven by commit-reveal state
  // -----------------------------------------------------------------------

  // committing -> waitingCommit (once our commit is sent)
  useEffect(() => {
    if (phase === "committing" && isCommitted) {
      if (opponentCommitted) {
        // Opponent already committed, skip straight to revealing
        setBattlePhase("revealing");
      } else {
        setBattlePhase("waitingCommit");
      }
    }
  }, [phase, isCommitted, opponentCommitted, setBattlePhase]);

  // waitingCommit -> revealing (opponent committed)
  useEffect(() => {
    if (phase === "waitingCommit" && opponentCommitted) {
      setBattlePhase("revealing");
    }
  }, [phase, opponentCommitted, setBattlePhase]);

  // revealing -> send our reveal -> waitingReveal
  useEffect(() => {
    if (phase !== "revealing" || isRevealed) return;

    reveal().catch((err) => {
      console.error("[useCombatTurn] reveal failed", err);
    });
  }, [phase, isRevealed, reveal]);

  // Once we have revealed, advance to waiting or resolving
  useEffect(() => {
    if (phase === "revealing" && isRevealed) {
      if (opponentRevealed && opponentMove !== null) {
        setBattlePhase("resolving");
      } else {
        setBattlePhase("waitingReveal");
      }
    }
  }, [phase, isRevealed, opponentRevealed, opponentMove, setBattlePhase]);

  // waitingReveal -> resolving (opponent revealed and move detected)
  useEffect(() => {
    if (phase === "waitingReveal" && opponentRevealed && opponentMove !== null) {
      setBattlePhase("resolving");
    }
  }, [phase, opponentRevealed, opponentMove, setBattlePhase]);

  // -----------------------------------------------------------------------
  // Fallback: arena round advanced without us detecting opponent's reveal.
  // This happens when both reveals land in the same block — the arena
  // auto-resolves and clears the reveal slots before we can poll them.
  // In this case, advance to resolving with a null opponent move.
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (phase !== "waitingReveal" && phase !== "waitingCommit") return;
    if (resolvedRoundRef.current === round) return;
    if (arenaRound <= round) return;

    // Arena has advanced past our local round — the turn was resolved on-chain
    console.log("[useCombatTurn] arena round advanced (fallback)", {
      arenaRound,
      localRound: round,
    });
    setBattlePhase("resolving");
  }, [phase, round, arenaRound, setBattlePhase]);

  // -----------------------------------------------------------------------
  // resolving -> run combat engine -> animating
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (phase !== "resolving") return;
    if (resolvedRoundRef.current === round) return; // Already resolved this round
    if (localMoveRef.current === null) return;

    resolvedRoundRef.current = round;

    // If we have the opponent's move, resolve locally for accurate animation.
    // If not (fallback case), we still advance but with limited animation data.
    if (opponentMove !== null) {
      const myAction = decodeMove(localMoveRef.current);
      const oppAction = decodeMove(opponentMove);

      const result = resolveTurn(myChampions, opponentChampions, myAction, oppAction);

      // Update champion states
      updateChampions(result.myChampions, result.opponentChampions);

      // Record the turn
      const record: TurnRecord = {
        round,
        myAction,
        opponentAction: oppAction,
        events: result.events,
      };
      addTurnRecord(record);

      // Check if any champion was newly KO'd this turn
      const prevMyKOs = myChampions.filter((c) => c.isKO).length;
      const prevOppKOs = opponentChampions.filter((c) => c.isKO).length;
      const newMyKOs = result.myChampions.filter((c) => c.isKO).length;
      const newOppKOs = result.opponentChampions.filter((c) => c.isKO).length;
      if (newMyKOs > prevMyKOs || newOppKOs > prevOppKOs) {
        setTimeout(() => playSfx("ko"), 500);
      }

      // Transition to animation phase
      setBattlePhase("animating");

      // Check for game-over conditions after animations
      const myEliminated = isTeamEliminated(result.myChampions);
      const oppEliminated = isTeamEliminated(result.opponentChampions);

      if (myEliminated || oppEliminated) {
        const winner: "me" | "opponent" | "draw" =
          myEliminated && oppEliminated
            ? "draw"
            : oppEliminated
              ? "me"
              : "opponent";

        const allChampions = [...result.myChampions, ...result.opponentChampions];
        const mvp = allChampions.reduce(
          (best, c) => (c.totalDamageDealt > (best?.totalDamageDealt ?? 0) ? c : best),
          allChampions[0],
        );

        setTimeout(() => {
          setResult(winner, mvp?.id ?? null);
        }, ANIMATION_DURATION_MS);
      } else {
        setTimeout(() => {
          localMoveRef.current = null;
          nextRound();
        }, ANIMATION_DURATION_MS);
      }
    } else {
      // Fallback: arena resolved but we don't have the opponent's specific move.
      // This is a rare edge case (both reveals in same block).
      // Skip animation, check arena winner slot, and advance.
      console.warn("[useCombatTurn] resolving without opponent move (arena fallback)");

      setBattlePhase("animating");

      // Check arena winner slot for game-over
      if (arenaWinner !== 0) {
        const role = useGameStore.getState().match.role;
        const isHost = role === "host";

        const winner: "me" | "opponent" | "draw" =
          arenaWinner === 3
            ? "draw"
            : (arenaWinner === 1 && isHost) || (arenaWinner === 2 && !isHost)
              ? "me"
              : "opponent";

        setTimeout(() => {
          setResult(winner, null);
        }, ANIMATION_DURATION_MS);
      } else {
        // Turn resolved but game continues — advance to next round
        setTimeout(() => {
          localMoveRef.current = null;
          nextRound();
        }, ANIMATION_DURATION_MS);
      }
    }
  }, [
    phase,
    round,
    opponentMove,
    myChampions,
    opponentChampions,
    updateChampions,
    addTurnRecord,
    setBattlePhase,
    nextRound,
    setResult,
    arenaWinner,
  ]);

  return {
    submitMove,
    phase,
    canSubmit: phase === "choosing",
    error,
  };
}
