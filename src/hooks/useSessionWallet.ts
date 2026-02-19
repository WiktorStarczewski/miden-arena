/**
 * useSessionWallet - Manages MidenFi wallet connection, session wallet creation, and funding.
 *
 * Flow:
 *  1. Uses MidenFiSignerProvider + useMidenFiWallet() for wallet connection.
 *  2. connect() - Prompts the user to connect their MidenFi wallet (via wallet adapter).
 *  3. Creates a local session wallet via the Miden SDK (no popups for gameplay).
 *  4. Requests MidenFi to fund the session wallet with FUND_AMOUNT (15 MIDEN).
 *  5. Syncs state and consumes the funding note so the session wallet is ready.
 *
 * Persists `midenFiAddress` and `sessionWalletId` to localStorage so the user
 * does not need to reconnect on page reload.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  useCreateWallet,
  useSyncState,
  useConsume,
  useNotes,
} from "@miden-sdk/react";
import { useMidenFiWallet } from "@miden-sdk/miden-wallet-adapter";
import { MIDEN_FAUCET_ID, FUND_AMOUNT } from "../constants/miden";
import { useGameStore } from "../store/gameStore";
import {
  saveSessionWalletId,
  getSessionWalletId,
  saveMidenFiAddress,
  getMidenFiAddress,
} from "../utils/persistence";

// ---------------------------------------------------------------------------
// Hook return type
// ---------------------------------------------------------------------------

export interface UseSessionWalletReturn {
  /** Initiate the full connection + wallet creation + funding flow. */
  connect: () => Promise<void>;
  /** Whether MidenFi extension is detected in the browser. */
  isExtensionDetected: boolean;
  /** Whether the MidenFi wallet has been connected (address obtained). */
  isConnected: boolean;
  /** Whether the session wallet is funded and ready for gameplay. */
  isReady: boolean;
  /** Current step in the setup flow. */
  step: "idle" | "connecting" | "creatingWallet" | "funding" | "consuming" | "done";
  /** The connected MidenFi wallet address (if any). */
  midenFiAddress: string | null;
  /** The local session wallet ID (if created). */
  sessionWalletId: string | null;
  /** Error message if any step fails. */
  error: string | null;
}

// ---------------------------------------------------------------------------
// Hook implementation
// ---------------------------------------------------------------------------

export function useSessionWallet(): UseSessionWalletReturn {
  const setSetupStep = useGameStore((s) => s.setSetupStep);
  const setMidenFiAddress = useGameStore((s) => s.setMidenFiAddress);
  const setSessionWalletId = useGameStore((s) => s.setSessionWalletId);

  const [midenFiAddress, setLocalMidenFiAddress] = useState<string | null>(null);
  const [sessionWalletId, setLocalSessionWalletId] = useState<string | null>(null);
  const [step, setStep] = useState<
    "idle" | "connecting" | "creatingWallet" | "funding" | "consuming" | "done"
  >("idle");
  const [error, setError] = useState<string | null>(null);

  // MidenFi wallet adapter hook
  const {
    connect: walletConnect,
    address: walletAddress,
    connected: walletConnected,
    requestSend,
    wallets,
  } = useMidenFiWallet();

  const isExtensionDetected = wallets.length > 0;

  const { createWallet } = useCreateWallet();
  const { syncHeight, isSyncing } = useSyncState();
  const { consume } = useConsume();
  const notes = useNotes();

  // Prevent concurrent connect() calls
  const connectingRef = useRef(false);

  // -----------------------------------------------------------------------
  // Restore persisted session on mount
  // -----------------------------------------------------------------------
  useEffect(() => {
    const savedAddress = getMidenFiAddress();
    const savedWalletId = getSessionWalletId();

    if (savedAddress && savedWalletId) {
      setLocalMidenFiAddress(savedAddress);
      setLocalSessionWalletId(savedWalletId);
      setMidenFiAddress(savedAddress);
      setSessionWalletId(savedWalletId);
      setStep("done");
      setSetupStep("done");
    }
  }, [setMidenFiAddress, setSessionWalletId, setSetupStep]);

  // -----------------------------------------------------------------------
  // When the wallet adapter connects (e.g. autoConnect), update local state
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (walletConnected && walletAddress && step === "connecting") {
      setLocalMidenFiAddress(walletAddress);
      setMidenFiAddress(walletAddress);
      saveMidenFiAddress(walletAddress);
    }
  }, [walletConnected, walletAddress, step, setMidenFiAddress]);

  // -----------------------------------------------------------------------
  // connect - Full setup flow
  // -----------------------------------------------------------------------
  const connect = useCallback(async () => {
    if (connectingRef.current) return;
    connectingRef.current = true;

    try {
      // Step 1: Connect to MidenFi extension via wallet adapter
      if (!walletConnected) {
        try {
          await walletConnect();
        } catch (connectErr) {
          const msg = connectErr instanceof Error
            ? connectErr.message
            : typeof connectErr === "string"
              ? connectErr
              : JSON.stringify(connectErr);
          setError(`Failed to connect MidenFi wallet: ${msg}`);
          connectingRef.current = false;
          return;
        }
      }

      // Clear error and update step now that connection succeeded
      setError(null);
      setStep("connecting");
      setSetupStep("connecting");

      // The wallet adapter provides the address via walletAddress
      // Wait briefly for the address to propagate after connect
      const address = walletAddress ?? await waitForAddress();
      if (!address) {
        throw new Error("Failed to get wallet address after connecting.");
      }

      setLocalMidenFiAddress(address);
      setMidenFiAddress(address);
      saveMidenFiAddress(address);

      // Step 2: Create local session wallet
      setStep("creatingWallet");
      setSetupStep("creatingWallet");

      const walletId = await createWallet();
      if (!walletId) {
        throw new Error("Failed to create session wallet.");
      }
      const walletIdStr = typeof walletId === "string" ? walletId : String(walletId);
      setLocalSessionWalletId(walletIdStr);
      setSessionWalletId(walletIdStr);
      saveSessionWalletId(walletIdStr);

      // Step 3: Fund session wallet from MidenFi via wallet adapter
      setStep("funding");
      setSetupStep("funding");

      if (!requestSend) {
        throw new Error("Wallet adapter does not support requestSend.");
      }

      await requestSend({
        senderAddress: address,
        recipientAddress: walletIdStr,
        faucetId: MIDEN_FAUCET_ID,
        amount: Number(FUND_AMOUNT),
        noteType: "public",
      });

      // Step 4: Sync and consume the funding note
      setStep("consuming");
      setSetupStep("consuming");

      // Poll for the funding note to arrive
      await waitForFundingNote(walletIdStr, notes, syncHeight, isSyncing, consume);

      // Done
      setStep("done");
      setSetupStep("done");
    } catch (err) {
      const message = err instanceof Error
        ? err.message
        : typeof err === "string"
          ? err
          : JSON.stringify(err) ?? "Unknown error during wallet setup.";
      setError(message);
      setStep("idle");
      setSetupStep("idle");
    } finally {
      connectingRef.current = false;
    }
  }, [
    walletConnect,
    walletConnected,
    walletAddress,
    requestSend,
    createWallet,
    consume,
    notes,
    syncHeight,
    isSyncing,
    setSetupStep,
    setMidenFiAddress,
    setSessionWalletId,
  ]);

  return {
    connect,
    isExtensionDetected,
    isConnected: midenFiAddress !== null,
    isReady: step === "done",
    step,
    midenFiAddress,
    sessionWalletId,
    error,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Wait briefly for the wallet address to become available after connect().
 * The wallet adapter may update address asynchronously.
 */
async function waitForAddress(): Promise<string | null> {
  for (let i = 0; i < 20; i++) {
    await sleep(200);
    // Can't access React state here, but the caller should retry
  }
  return null;
}

/**
 * Poll until a note with the expected funding amount appears for the session wallet,
 * then consume it. Uses exponential backoff with a maximum number of retries.
 */
async function waitForFundingNote(
  _walletId: string,
  notes: { id: string; sender: string; assets: { faucetId: string; amount: bigint }[]; status: string }[],
  _syncHeight: number,
  _isSyncing: boolean,
  consume: (noteId: string) => Promise<void>,
): Promise<void> {
  const MAX_RETRIES = 30;
  const BASE_DELAY_MS = 2000;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    // Look for an unconsumed note carrying the fund amount from the faucet
    const fundingNote = notes.find(
      (n) =>
        n.status !== "consumed" &&
        n.assets.some(
          (a) => a.faucetId === MIDEN_FAUCET_ID && a.amount >= FUND_AMOUNT,
        ),
    );

    if (fundingNote) {
      await consume(fundingNote.id);
      return;
    }

    // Wait with exponential backoff (capped at 10 seconds)
    const delay = Math.min(BASE_DELAY_MS * Math.pow(1.3, attempt), 10_000);
    await sleep(delay);
  }

  throw new Error(
    "Timed out waiting for funding note. Please check your MidenFi wallet and try again.",
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
