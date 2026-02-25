/**
 * ArenaSetupScreen — Orchestrates post-draft arena setup:
 *  1. Send stake to arena (join)
 *  2. Wait for both players to join (gameState >= 2)
 *  3. Submit team to arena (set_team)
 *  4. Wait for both teams submitted & combat ready (gameState === 3)
 *  5. Transition to preBattleLoading (asset preload)
 */

import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import { useMiden } from "@miden-sdk/react";
import { Word } from "@miden-sdk/miden-sdk";
import { useGameStore } from "../store/gameStore";
import { useStaking } from "../hooks/useStaking";
import { useArenaState } from "../hooks/useArenaState";
import { buildTeamNote, submitArenaNote } from "../utils/arenaNote";
import { MATCHMAKING_ACCOUNT_ID } from "../constants/miden";
import { getChampion } from "../constants/champions";

// ---------------------------------------------------------------------------
// Setup phases
// ---------------------------------------------------------------------------

type SetupPhase =
  | "staking"
  | "waitingOpponentStake"
  | "submittingTeam"
  | "waitingOpponentTeam"
  | "ready";

const PHASE_LABELS: Record<SetupPhase, string> = {
  staking: "Sending stake to arena...",
  waitingOpponentStake: "Waiting for opponent to join...",
  submittingTeam: "Submitting team to arena...",
  waitingOpponentTeam: "Waiting for opponent's team...",
  ready: "Arena ready! Entering battle...",
};

const PHASE_ORDER: SetupPhase[] = [
  "staking",
  "waitingOpponentStake",
  "submittingTeam",
  "waitingOpponentTeam",
  "ready",
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ArenaSetupScreen() {
  const sessionWalletId = useGameStore((s) => s.setup.sessionWalletId);
  const myTeam = useGameStore((s) => s.draft.myTeam);
  const setScreen = useGameStore((s) => s.setScreen);

  const { client, prover } = useMiden();
  const { sendStake, hasStaked, opponentStaked, error: stakingError } = useStaking();
  const { gameState, teamsSubmitted, refresh } = useArenaState(3000);

  const [phase, setPhase] = useState<SetupPhase>("staking");
  const [teamSubmitted, setTeamSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const transitioned = useRef(false);

  // -----------------------------------------------------------------------
  // Phase 1: Auto-send stake on mount
  // -----------------------------------------------------------------------
  const stakeStarted = useRef(false);
  useEffect(() => {
    if (stakeStarted.current || hasStaked) return;
    stakeStarted.current = true;
    sendStake();
  }, [sendStake, hasStaked]);

  // -----------------------------------------------------------------------
  // Phase 2: Advance phase when stake is done (one-directional only)
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!hasStaked) return;

    setPhase((prev) => {
      // Never regress — only advance forward
      if (PHASE_ORDER.indexOf(prev) >= PHASE_ORDER.indexOf("submittingTeam")) return prev;

      if (opponentStaked) {
        return "submittingTeam";
      }
      if (PHASE_ORDER.indexOf(prev) < PHASE_ORDER.indexOf("waitingOpponentStake")) {
        return "waitingOpponentStake";
      }
      return prev;
    });
  }, [hasStaked, opponentStaked]);

  // -----------------------------------------------------------------------
  // Phase 2→3: Opponent staked → submit team
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (phase === "waitingOpponentStake" && opponentStaked) {
      setPhase("submittingTeam");
    }
  }, [phase, opponentStaked]);

  // -----------------------------------------------------------------------
  // Phase 3: Submit team to arena (gated on gameState >= 2)
  // -----------------------------------------------------------------------
  const teamSubmitStarted = useRef(false);
  const submitTeam = useCallback(async () => {
    if (teamSubmitStarted.current || teamSubmitted) return;
    if (!sessionWalletId || !client || !prover) return;

    teamSubmitStarted.current = true;
    setError(null);

    try {
      const note = await buildTeamNote(sessionWalletId, MATCHMAKING_ACCOUNT_ID);

      // Champion IDs as bigints, 0-indexed
      const c0 = BigInt(myTeam[0] ?? 0);
      const c1 = BigInt(myTeam[1] ?? 0);
      const c2 = BigInt(myTeam[2] ?? 0);
      const teamWord = new Word(BigUint64Array.from([c0, c1, c2, 0n]));

      await submitArenaNote({
        client,
        prover,
        sessionWalletId,
        arenaAccountId: MATCHMAKING_ACCOUNT_ID,
        note,
        consumeArgs: teamWord,
      });

      setTeamSubmitted(true);
      await refresh();
      console.log("[ArenaSetup] team submitted to arena", { myTeam });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to submit team.";
      console.error("[ArenaSetup] submitTeam failed", err);
      setError(message);
      teamSubmitStarted.current = false;
    }
  }, [sessionWalletId, client, prover, myTeam, teamSubmitted, refresh]);

  useEffect(() => {
    if (phase === "submittingTeam" && !teamSubmitted) {
      submitTeam();
    }
  }, [phase, teamSubmitted, submitTeam]);

  // -----------------------------------------------------------------------
  // Phase 4: After team submitted, wait for opponent's team
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!teamSubmitted) return;
    // Both teams submitted when teamsSubmitted === 3 (bit0 + bit1)
    if (teamsSubmitted === 3 && gameState >= 3) {
      setPhase("ready");
    } else {
      setPhase("waitingOpponentTeam");
    }
  }, [teamSubmitted, teamsSubmitted, gameState]);

  // -----------------------------------------------------------------------
  // Phase 5: Transition to preBattleLoading
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (phase !== "ready" || transitioned.current) return;
    transitioned.current = true;

    // Small delay for the "ready" message to display
    const timeout = setTimeout(() => {
      setScreen("preBattleLoading");
    }, 800);
    return () => clearTimeout(timeout);
  }, [phase, setScreen]);

  // -----------------------------------------------------------------------
  // Display error from staking hook
  // -----------------------------------------------------------------------
  const displayError = error || stakingError;

  // -----------------------------------------------------------------------
  // Progress calculation
  // -----------------------------------------------------------------------
  const phaseIndex = PHASE_ORDER.indexOf(phase);
  const progress = ((phaseIndex + 1) / PHASE_ORDER.length) * 100;

  // Team info for display
  const myTeamInfo = useMemo(
    () => myTeam.map((id) => ({ id, name: getChampion(id).name })),
    [myTeam],
  );

  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-[#0a0a1a]">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="flex w-full max-w-lg flex-col items-center px-6"
      >
        {/* Heading */}
        <motion.h1
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mb-8 text-3xl font-bold tracking-widest text-white sm:text-4xl"
        >
          ARENA <span className="text-amber-400">SETUP</span>
        </motion.h1>

        {/* Team display */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="mb-8 text-center"
        >
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-amber-400/80">
            Your Team
          </h2>
          <div className="flex justify-center gap-4">
            {myTeamInfo.map((c, i) => (
              <motion.span
                key={c.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.4 + i * 0.1 }}
                className="text-sm text-gray-300"
              >
                {c.name}
              </motion.span>
            ))}
          </div>
        </motion.div>

        {/* Phase status */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.5 }}
          className="mb-6 w-full"
        >
          {/* Steps indicator */}
          <div className="mb-4 space-y-2">
            {PHASE_ORDER.map((p, i) => {
              const isActive = p === phase;
              const isDone = i < phaseIndex;
              return (
                <div
                  key={p}
                  className={`flex items-center gap-3 text-sm transition-colors ${
                    isActive
                      ? "text-amber-400"
                      : isDone
                        ? "text-green-400/70"
                        : "text-gray-600"
                  }`}
                >
                  <span className="w-5 text-center">
                    {isDone ? "\u2713" : isActive ? "\u25CF" : "\u25CB"}
                  </span>
                  <span>{PHASE_LABELS[p]}</span>
                </div>
              );
            })}
          </div>

          {/* Progress bar */}
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-800">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-amber-500 to-purple-500"
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </motion.div>

        {/* Error display */}
        {displayError && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-4 text-center text-sm text-red-400"
          >
            {displayError}
          </motion.p>
        )}

        {/* Loading dots */}
        {phase !== "ready" && (
          <div className="mt-6 flex items-center gap-2">
            {[0, 1, 2].map((i) => (
              <motion.div
                key={i}
                className="h-2 w-2 rounded-full bg-amber-400"
                animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.2, 0.8] }}
                transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
              />
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}
