/**
 * useStaking — Arena-based staking via process_stake_note.
 *
 * Sends a stake note to the arena account which triggers the `join()` procedure.
 * Opponent staking is detected by polling arena state (gameState >= 2 means both joined).
 *
 * Withdrawal sends remaining session wallet funds back to the MidenFi wallet via P2ID.
 */

import { useState, useCallback } from "react";
import { useSend, useMiden } from "@miden-sdk/react";
import { useGameStore } from "../store/gameStore";
import { useArenaState } from "./useArenaState";
import { buildStakeNote, submitArenaNote } from "../utils/arenaNote";
import { MIDEN_FAUCET_ID, STAKE_AMOUNT, ARENA_ACCOUNT_ID } from "../constants/miden";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseStakingReturn {
  /** Send the stake to the arena (triggers join). */
  sendStake: () => Promise<void>;
  /** Whether the local player has sent their stake. */
  hasStaked: boolean;
  /** Whether both players have staked (arena gameState >= 2). */
  opponentStaked: boolean;
  /** Withdraw all session wallet funds back to the MidenFi wallet. */
  withdraw: () => Promise<void>;
  /** Whether a withdrawal transaction is in progress. */
  isWithdrawing: boolean;
  /** Error message if any staking operation fails. */
  error: string | null;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useStaking(): UseStakingReturn {
  const sessionWalletId = useGameStore((s) => s.setup.sessionWalletId);
  const midenFiAddress = useGameStore((s) => s.setup.midenFiAddress);
  const winner = useGameStore((s) => s.result.winner);

  const { client, prover } = useMiden();
  const { send } = useSend();
  const { gameState, refresh } = useArenaState();

  const [hasStaked, setHasStaked] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Both players have joined when gameState >= 2
  const opponentStaked = gameState >= 2;

  // -----------------------------------------------------------------------
  // sendStake — Submit process_stake_note to arena
  // -----------------------------------------------------------------------
  const sendStake = useCallback(async () => {
    if (hasStaked) {
      setError("Already staked.");
      return;
    }

    if (!sessionWalletId) {
      setError("Session wallet not ready.");
      return;
    }

    if (!client || !prover) {
      setError("Miden client not ready.");
      return;
    }

    setError(null);

    try {
      const note = await buildStakeNote(sessionWalletId, ARENA_ACCOUNT_ID);

      await submitArenaNote({
        client,
        prover,
        sessionWalletId,
        arenaAccountId: ARENA_ACCOUNT_ID,
        note,
        consumeArgs: null,
      });

      setHasStaked(true);

      // Refresh arena state to see updated gameState
      await refresh();

      console.log("[useStaking] stake submitted to arena");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to send stake.";
      console.error("[useStaking] sendStake failed", err);
      setError(message);
    }
  }, [hasStaked, sessionWalletId, client, prover, refresh]);

  // -----------------------------------------------------------------------
  // withdraw - Send remaining funds back to MidenFi wallet
  // -----------------------------------------------------------------------
  const withdraw = useCallback(async () => {
    if (!midenFiAddress) {
      setError("MidenFi address not available.");
      return;
    }

    if (!sessionWalletId) {
      setError("Session wallet not available.");
      return;
    }

    setIsWithdrawing(true);
    setError(null);

    try {
      const withdrawalAmount = winner === "me"
        ? STAKE_AMOUNT * 2n
        : winner === "draw"
          ? STAKE_AMOUNT
          : 0n;

      if (withdrawalAmount <= 0n) {
        setIsWithdrawing(false);
        return;
      }

      await send({
        from: sessionWalletId,
        to: midenFiAddress,
        assetId: MIDEN_FAUCET_ID,
        amount: withdrawalAmount,
        noteType: "public",
      });

      setIsWithdrawing(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to withdraw funds.";
      setError(message);
      setIsWithdrawing(false);
    }
  }, [midenFiAddress, sessionWalletId, winner, send]);

  return {
    sendStake,
    hasStaked,
    opponentStaked,
    withdraw,
    isWithdrawing,
    error,
  };
}
