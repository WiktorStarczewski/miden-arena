/**
 * useSessionWallet - Manages MidenFi wallet connection, session wallet creation, and funding.
 *
 * Architecture:
 * - useWallet() (from WalletProvider) for extension wallet detection/connection/funding
 * - useMiden() (from MidenProvider) for the local session client (auto-sync, prover, client)
 *
 * The MidenProvider initializes in local keystore mode (no SignerContext above it),
 * so the session wallet's keys are stored in IndexedDB and all transactions sign locally.
 *
 * Flow:
 *  1. connect() → select() + connect() via wallet adapter (1 popup)
 *  2. Effect detects walletConnected → creates session wallet via MidenProvider client
 *  3. Effect requests MidenFi to fund session wallet (1 popup)
 *  4. Effect polls for funding note → consumes via MidenProvider client → done
 */

import { useState, useEffect, useCallback } from "react";
import {
  AccountStorageMode,
  AuthScheme,
  AccountId,
  NetworkId,
  AccountInterface,
} from "@miden-sdk/miden-sdk";
import type { ConsumableNoteRecord } from "@miden-sdk/miden-sdk";
import {
  useWallet,
  WalletReadyState,
  PrivateDataPermission,
  WalletAdapterNetwork,
} from "@miden-sdk/miden-wallet-adapter";
import { useMiden } from "@miden-sdk/react";
import { MIDEN_FAUCET_ID, FUND_AMOUNT } from "../constants/miden";
import { useGameStore } from "../store/gameStore";
import {
  saveSessionWalletId,
  getSessionWalletId,
  saveMidenFiAddress,
  getMidenFiAddress,
  markSetupComplete,
  isSetupComplete,
  clearSessionData,
} from "../utils/persistence";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONSUME_POLL_MS = 3000;

// ---------------------------------------------------------------------------
// Hook return type
// ---------------------------------------------------------------------------

export interface UseSessionWalletReturn {
  connect: () => Promise<void>;
  isExtensionDetected: boolean;
  isConnected: boolean;
  isReady: boolean;
  isDetecting: boolean;
  step: "idle" | "connecting" | "creatingWallet" | "funding" | "consuming" | "done";
  midenFiAddress: string | null;
  sessionWalletId: string | null;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Helper: reset everything on error
// ---------------------------------------------------------------------------

function resetOnError(
  err: unknown,
  setError: (msg: string) => void,
  setSetupStep: (step: "idle") => void,
  label: string,
) {
  console.error(`[useSessionWallet] ${label} error:`, err);
  const message = err instanceof Error ? err.message : String(err);
  setError(message);
  clearSessionData();
  setSetupStep("idle");
}

// ---------------------------------------------------------------------------
// Hook implementation
// ---------------------------------------------------------------------------

export function useSessionWallet(): UseSessionWalletReturn {
  // Zustand store (persists across unmount/remount)
  const setupStep = useGameStore((s) => s.setup.step);
  const midenFiAddress = useGameStore((s) => s.setup.midenFiAddress);
  const sessionWalletId = useGameStore((s) => s.setup.sessionWalletId);
  const setSetupStep = useGameStore((s) => s.setSetupStep);
  const setMidenFiAddress = useGameStore((s) => s.setMidenFiAddress);
  const setSessionWalletId = useGameStore((s) => s.setSessionWalletId);

  const [error, setError] = useState<string | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);

  // MidenProvider — local session client
  const { client, isReady: clientReady, prover, runExclusive } = useMiden();

  // Wallet adapter — extension wallet
  const {
    select,
    connect: walletConnect,
    address: walletAddress,
    connected: walletConnected,
    requestSend,
    wallets,
  } = useWallet();

  // Extension detected when first wallet adapter is installed
  const isExtensionDetected =
    wallets.length > 0 && wallets[0].readyState === WalletReadyState.Installed;

  // -----------------------------------------------------------------------
  // Restore persisted session on fresh page load
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (setupStep !== "idle") return;
    if (!clientReady) return;

    if (isSetupComplete()) {
      const savedAddress = getMidenFiAddress();
      const savedWalletId = getSessionWalletId();
      if (savedAddress && savedWalletId) {
        // MidenProvider already initialized the client; just restore store state
        setMidenFiAddress(savedAddress);
        setSessionWalletId(savedWalletId);
        setSetupStep("done");
        return;
      }
    }
    clearSessionData();
  }, [setupStep, clientReady, setMidenFiAddress, setSessionWalletId, setSetupStep]);

  // -----------------------------------------------------------------------
  // "connecting" → detect wallet connected → advance to "creatingWallet"
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (setupStep !== "connecting") return;
    if (!walletConnected || !walletAddress) return;

    console.log("[useSessionWallet] Wallet connected:", walletAddress);
    saveMidenFiAddress(walletAddress);
    setMidenFiAddress(walletAddress);
    setSetupStep("creatingWallet");
  }, [setupStep, walletConnected, walletAddress, setMidenFiAddress, setSetupStep]);

  // -----------------------------------------------------------------------
  // "creatingWallet" → create wallet via MidenProvider client → "funding"
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (setupStep !== "creatingWallet") return;
    if (!client || !clientReady) return;

    // If we already have a session wallet (remount mid-flow), skip creation
    const existing = getSessionWalletId();
    if (existing) {
      setSessionWalletId(existing);
      setSetupStep("funding");
      return;
    }

    let cancelled = false;
    console.log("[useSessionWallet] Creating session wallet...");

    (async () => {
      try {
        const wallet = await client.newWallet(
          AccountStorageMode.public(),
          true,
          AuthScheme.AuthRpoFalcon512,
        );
        if (cancelled) return;

        const walletIdStr = wallet
          .id()
          .toBech32(NetworkId.testnet(), AccountInterface.BasicWallet);
        console.log("[useSessionWallet] Session wallet created:", walletIdStr);

        saveSessionWalletId(walletIdStr);
        setSessionWalletId(walletIdStr);
        setSetupStep("funding");
      } catch (err) {
        if (!cancelled) resetOnError(err, setError, setSetupStep, "createWallet");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [setupStep, client, clientReady, setSessionWalletId, setSetupStep]);

  // -----------------------------------------------------------------------
  // "funding" → request MidenFi to send funds → advance to "consuming"
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (setupStep !== "funding") return;
    if (!requestSend) return;

    const address = getMidenFiAddress() ?? walletAddress;
    const walletId = getSessionWalletId();
    if (!address || !walletId) {
      resetOnError(
        new Error(`Missing wallet address (${address}) or session wallet ID (${walletId}).`),
        setError,
        setSetupStep,
        "funding-precondition",
      );
      return;
    }

    let cancelled = false;
    console.log("[useSessionWallet] Requesting funding from MidenFi...");

    requestSend({
      senderAddress: address,
      recipientAddress: walletId,
      faucetId: MIDEN_FAUCET_ID,
      amount: Number(FUND_AMOUNT),
      noteType: "public",
    })
      .then(() => {
        if (cancelled) return;
        console.log("[useSessionWallet] Funding transaction submitted.");
        setSetupStep("consuming");
      })
      .catch((err) => {
        if (cancelled) return;
        resetOnError(err, setError, setSetupStep, "requestSend");
      });

    return () => {
      cancelled = true;
    };
  }, [setupStep, requestSend, walletAddress, setSetupStep]);

  // -----------------------------------------------------------------------
  // "consuming" → poll game client for funding note → consume → "done"
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (setupStep !== "consuming") return;
    if (!client || !prover) return;

    const walletId = getSessionWalletId();
    if (!walletId) return;

    let cancelled = false;
    console.log("[useSessionWallet] Polling for funding note...");

    const pollAndConsume = async () => {
      while (!cancelled) {
        try {
          // Run sync + check + consume inside a single runExclusive block so
          // we never race with MidenProvider's auto-sync timer.
          const found = await runExclusive(async () => {
            const summary = await client.syncState();
            console.log("[useSessionWallet] Synced to block", summary.blockNum());

            // Create fresh AccountId each iteration — WASM pointers are consumed
            // when serialized to the web worker, so they can't be reused.
            const accountId = AccountId.fromBech32(walletId);

            // Only get notes consumable by OUR session wallet (avoids P2ID mismatch
            // with stale notes from previous sessions targeting different account IDs)
            const consumable = await client.getConsumableNotes(accountId);

            if (consumable.length > 0) {
              console.log(
                "[useSessionWallet] Found",
                consumable.length,
                "consumable note(s) for account. Consuming...",
              );
              const notes = consumable.map((rec: ConsumableNoteRecord) => rec.inputNoteRecord().toNote());
              const txRequest = client.newConsumeTransactionRequest(notes);
              // Fresh accountId for the submit call (WASM pointer consumed above)
              const submitAccountId = AccountId.fromBech32(walletId);
              await client.submitNewTransactionWithProver(submitAccountId, txRequest, prover);
              return true;
            }
            return false;
          });

          if (found && !cancelled) {
            console.log("[useSessionWallet] Funding note consumed. Setup complete!");
            markSetupComplete();
            setSetupStep("done");
            return;
          }

          console.log("[useSessionWallet] No consumable notes yet, retrying...");
        } catch (err) {
          console.warn("[useSessionWallet] Poll/consume attempt failed:", err);
        }

        await new Promise((resolve) => setTimeout(resolve, CONSUME_POLL_MS));
      }
    };

    pollAndConsume();
    return () => {
      cancelled = true;
    };
  }, [setupStep, client, prover, runExclusive, setSetupStep]);

  // -----------------------------------------------------------------------
  // connect — button handler
  // -----------------------------------------------------------------------
  const connect = useCallback(async () => {
    setError(null);
    clearSessionData();
    try {
      if (wallets.length === 0) {
        setError("No wallet adapter found.");
        return;
      }

      const adapter = wallets[0].adapter;

      // If the extension hasn't been detected yet, wait for the polling to find it.
      if (adapter.readyState !== WalletReadyState.Installed) {
        setIsDetecting(true);
        try {
          await new Promise<void>((resolve, reject) => {
            const TIMEOUT_MS = 5000;
            const timer = setTimeout(() => {
              adapter.off("readyStateChange", onReady);
              reject(new Error("Wallet extension not detected. Is MidenFi installed?"));
            }, TIMEOUT_MS);

            const onReady = (state: WalletReadyState) => {
              if (state === WalletReadyState.Installed) {
                clearTimeout(timer);
                adapter.off("readyStateChange", onReady);
                resolve();
              }
            };
            adapter.on("readyStateChange", onReady);

            // Check once more in case it became ready between the if-check and now
            if (adapter.readyState === WalletReadyState.Installed) {
              clearTimeout(timer);
              adapter.off("readyStateChange", onReady);
              resolve();
            }
          });
        } finally {
          setIsDetecting(false);
        }
      }

      setSetupStep("connecting");
      select(adapter.name);
      await walletConnect(PrivateDataPermission.UponRequest, WalletAdapterNetwork.Testnet);
    } catch (err) {
      console.error("[useSessionWallet] walletConnect error:", err);
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Failed to connect wallet: ${msg}`);
      clearSessionData();
      setSetupStep("idle");
    }
  }, [walletConnect, select, wallets, setSetupStep]);

  return {
    connect,
    isExtensionDetected,
    isConnected: midenFiAddress !== null,
    isReady: setupStep === "done",
    isDetecting,
    step: setupStep,
    midenFiAddress,
    sessionWalletId,
    error,
  };
}
