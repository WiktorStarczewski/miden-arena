/**
 * useCombatTurn - Full turn lifecycle orchestrator for the battle phase.
 *
 * Each turn proceeds through a strict sequence of phases:
 *
 *  1. **choosing**      - Player selects a champion and ability.
 *  2. **committing**    - The move is hashed and commitment notes are sent.
 *  3. **waitingCommit** - Waiting for the opponent's commitment notes.
 *  4. **revealing**     - Both committed; reveal notes are sent.
 *  5. **waitingReveal** - Waiting for the opponent's reveal notes.
 *  6. **resolving**     - Both revealed; combat engine runs to determine outcomes.
 *  7. **animating**     - UI plays attack/damage animations before next turn.
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
import type { TurnAction, TurnRecord } from "../types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Duration (ms) to show the animation phase before advancing to the next turn. */
const ANIMATION_DURATION_MS = 2500;

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

    (async () => {
      await reveal();
    })();
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

  // waitingReveal -> resolving (opponent revealed and verified)
  useEffect(() => {
    if (phase === "waitingReveal" && opponentRevealed && opponentMove !== null) {
      setBattlePhase("resolving");
    }
  }, [phase, opponentRevealed, opponentMove, setBattlePhase]);

  // -----------------------------------------------------------------------
  // resolving -> run combat engine -> animating
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (phase !== "resolving") return;
    if (resolvedRoundRef.current === round) return; // Already resolved this round
    if (localMoveRef.current === null || opponentMove === null) return;

    resolvedRoundRef.current = round;

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

    // Transition to animation phase
    setBattlePhase("animating");

    // Check for game-over conditions after a brief delay for animations
    const myEliminated = isTeamEliminated(result.myChampions);
    const oppEliminated = isTeamEliminated(result.opponentChampions);

    if (myEliminated || oppEliminated) {
      // Determine winner
      const winner: "me" | "opponent" | "draw" =
        myEliminated && oppEliminated
          ? "draw"
          : oppEliminated
            ? "me"
            : "opponent";

      // Determine MVP: the champion with the most total damage dealt
      const allChampions = [...result.myChampions, ...result.opponentChampions];
      const mvp = allChampions.reduce(
        (best, c) => (c.totalDamageDealt > (best?.totalDamageDealt ?? 0) ? c : best),
        allChampions[0],
      );

      setTimeout(() => {
        setResult(winner, mvp?.id ?? null);
      }, ANIMATION_DURATION_MS);
    } else {
      // Advance to next round after animation
      setTimeout(() => {
        localMoveRef.current = null;
        nextRound();
      }, ANIMATION_DURATION_MS);
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
  ]);

  return {
    submitMove,
    phase,
    canSubmit: phase === "choosing",
    error,
  };
}
