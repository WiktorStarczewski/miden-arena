/**
 * useStaking - P2IDE (Pay-to-ID with Expiry) stake management.
 *
 * Before battle begins, both players lock a stake (10 MIDEN) into a note
 * that is consumable by the opponent's session wallet. The note includes
 * a `recallHeight` so the sender can reclaim their tokens if the game is
 * abandoned.
 *
 * Flow:
 *  1. `sendStake()` - Sends STAKE_AMOUNT to the opponent with a recall height.
 *  2. Detects the opponent's stake note and consumes it.
 *  3. On game end:
 *     - **Winner** keeps the opponent's consumed stake.
 *     - `withdraw()` sends all session wallet funds back to the MidenFi wallet.
 *
 * The staking notes are identified by their exact amount (STAKE_AMOUNT = 10 MIDEN).
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { useSend, useConsume, useSyncState } from "@miden-sdk/react";
import { useGameStore } from "../store/gameStore";
import { useNoteDecoder } from "./useNoteDecoder";
import { MIDEN_FAUCET_ID, STAKE_AMOUNT, RECALL_BLOCK_OFFSET } from "../constants/miden";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UseStakingReturn {
  /** Send the stake to the opponent. */
  sendStake: () => Promise<void>;
  /** Whether the local player has sent their stake. */
  hasStaked: boolean;
  /** Whether the opponent's stake note has been detected and consumed. */
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
  const opponentId = useGameStore((s) => s.match.opponentId);
  const midenFiAddress = useGameStore((s) => s.setup.midenFiAddress);
  const sessionWalletId = useGameStore((s) => s.setup.sessionWalletId);
  const winner = useGameStore((s) => s.result.winner);

  const { send, stage: sendStage } = useSend();
  const { consume } = useConsume();
  const { syncHeight } = useSyncState();
  const { stakeNotes } = useNoteDecoder(opponentId);

  const [hasStaked, setHasStaked] = useState(false);
  const [opponentStaked, setOpponentStaked] = useState(false);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Prevent double-consuming the opponent's stake
  const consumedStakeRef = useRef(false);

  // Suppress unused lint for sendStage
  void sendStage;

  // -----------------------------------------------------------------------
  // sendStake - Lock STAKE_AMOUNT for the opponent
  // -----------------------------------------------------------------------
  const sendStake = useCallback(async () => {
    if (hasStaked) {
      setError("Already staked.");
      return;
    }

    if (!opponentId) {
      setError("No opponent connected.");
      return;
    }

    setError(null);

    try {
      await send({
        from: sessionWalletId!,
        to: opponentId,
        assetId: MIDEN_FAUCET_ID,
        amount: STAKE_AMOUNT,
        noteType: "public",
        recallHeight: syncHeight + RECALL_BLOCK_OFFSET,
      });

      setHasStaked(true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to send stake.";
      setError(message);
    }
  }, [hasStaked, opponentId, sessionWalletId, syncHeight, send]);

  // -----------------------------------------------------------------------
  // Detect and consume opponent's stake note
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (consumedStakeRef.current || opponentStaked) return;
    if (stakeNotes.length === 0) return;

    const stakeNote = stakeNotes[0];
    consumedStakeRef.current = true;

    (async () => {
      try {
        await consume({
          accountId: sessionWalletId!,
          noteIds: [stakeNote.noteId],
        });
        setOpponentStaked(true);
      } catch (err) {
        consumedStakeRef.current = false;
        const message =
          err instanceof Error ? err.message : "Failed to consume opponent stake.";
        setError(message);
      }
    })();
  }, [stakeNotes, opponentStaked, sessionWalletId, consume]);

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
      // Calculate the withdrawal amount.
      // If we won, we have our remaining funds + opponent's stake.
      // If we lost, we only have whatever is left after losing our stake.
      // We send everything back to MidenFi; the SDK handles the balance.
      const withdrawalAmount = winner === "me"
        ? STAKE_AMOUNT * 2n // Our original funding minus spent gas + opponent stake
        : winner === "draw"
          ? STAKE_AMOUNT // Return our own stake in a draw
          : 0n; // Lost - opponent already consumed our stake

      if (withdrawalAmount <= 0n) {
        setIsWithdrawing(false);
        return;
      }

      await send({
        from: sessionWalletId!,
        to: midenFiAddress!,
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
