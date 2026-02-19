/**
 * useSessionWallet - Manages MidenFi wallet connection, session wallet creation, and funding.
 *
 * Architecture:
 * - useMidenFiWallet() for wallet detection/connection/funding (1 extension popup)
 * - Standalone WebClient.createClient() for session wallet operations (0 popups)
 *
 * The standalone client uses local keystore mode so the session wallet's keys
 * are stored in IndexedDB and all transactions sign locally. This avoids the
 * external-keystore conflict where MidenProvider routes ALL signing through the
 * MidenFi extension (which doesn't have the session wallet's keys).
 *
 * Flow:
 *  1. connect() → walletConnect() via MidenFi extension (1 popup)
 *  2. Effect detects walletConnected → creates standalone WebClient + wallet
 *  3. Effect requests MidenFi to fund session wallet (1 popup)
 *  4. Effect polls for funding note → consumes via local client → done
 */

import { useState, useEffect, useCallback } from "react";
import {
  WebClient,
  AccountStorageMode,
  AuthScheme,
  TransactionProver,
  AccountId,
  AccountInterface,
  NetworkId,
} from "@miden-sdk/miden-sdk";
import { useMidenFiWallet } from "@miden-sdk/miden-wallet-adapter";
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

// RPC goes through Vite proxy (same-origin) to avoid CORS on SubmitProvenTransaction.
// The WASM client constructs gRPC-web paths like /rpc.Api/SyncState under this base URL.
const RPC_URL = "http://localhost:5173";
// Prover has proper CORS headers, so direct is fine.
const PROVER_URL = "https://tx-prover.testnet.miden.io";
const CLIENT_STORE_NAME = "miden-arena-session";
const SYNC_INTERVAL_MS = 2000;
const CONSUME_POLL_MS = 3000;

// ---------------------------------------------------------------------------
// Game client singleton — shared with other hooks via getGameClient()
// ---------------------------------------------------------------------------

let gameClient: WebClient | null = null;
let syncIntervalId: ReturnType<typeof setInterval> | null = null;

/** Get the standalone game client for use in other hooks. */
export function getGameClient(): WebClient | null {
  return gameClient;
}

function startSyncInterval(client: WebClient) {
  if (syncIntervalId) clearInterval(syncIntervalId);
  syncIntervalId = setInterval(async () => {
    try {
      await client.syncState();
    } catch {
      /* non-fatal */
    }
  }, SYNC_INTERVAL_MS);
}

/** Delete the IndexedDB databases used by the WASM client to clear stale data. */
async function deleteStaleStores(): Promise<void> {
  const dbs = await indexedDB.databases();
  for (const db of dbs) {
    if (db.name && db.name.includes(CLIENT_STORE_NAME)) {
      console.log("[useSessionWallet] Deleting stale IndexedDB:", db.name);
      indexedDB.deleteDatabase(db.name);
    }
  }
}

async function createGameClient(fresh = false): Promise<WebClient> {
  if (gameClient && !fresh) return gameClient;
  if (fresh) {
    gameClient = null;
    await deleteStaleStores();
  }
  console.log("[useSessionWallet] Creating standalone game client...");
  const client = await WebClient.createClient(
    RPC_URL,
    undefined, // noteTransportUrl — not needed for public notes
    undefined, // seed
    CLIENT_STORE_NAME,
  );
  gameClient = client;
  return client;
}

// ---------------------------------------------------------------------------
// Hook return type
// ---------------------------------------------------------------------------

export interface UseSessionWalletReturn {
  connect: () => Promise<void>;
  isExtensionDetected: boolean;
  isConnected: boolean;
  isReady: boolean;
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

  // MidenFi wallet adapter — only for connection + funding (extension popups)
  const {
    connect: walletConnect,
    address: walletAddress,
    connected: walletConnected,
    requestSend,
    wallets,
  } = useMidenFiWallet();

  // -----------------------------------------------------------------------
  // Restore persisted session on fresh page load
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (setupStep !== "idle") return;

    if (isSetupComplete()) {
      const savedAddress = getMidenFiAddress();
      const savedWalletId = getSessionWalletId();
      if (savedAddress && savedWalletId) {
        let cancelled = false;
        // Recreate game client — IndexedDB still has the wallet + keys
        createGameClient()
          .then(async (client) => {
            if (cancelled) return;
            await client.syncState();
            if (cancelled) return;
            startSyncInterval(client);
            setMidenFiAddress(savedAddress);
            setSessionWalletId(savedWalletId);
            setSetupStep("done");
          })
          .catch((err) => {
            if (cancelled) return;
            console.error("[useSessionWallet] Restore failed:", err);
            clearSessionData();
          });
        return () => {
          cancelled = true;
        };
      }
    }
    clearSessionData();
  }, [setupStep, setMidenFiAddress, setSessionWalletId, setSetupStep]);

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
  // "creatingWallet" → create standalone game client + wallet → "funding"
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (setupStep !== "creatingWallet") return;

    // If we already have a session wallet (remount mid-flow), skip creation
    const existing = getSessionWalletId();
    if (existing) {
      let cancelled = false;
      createGameClient()
        .then(async (client) => {
          if (cancelled) return;
          await client.syncState();
          startSyncInterval(client);
          setSessionWalletId(existing);
          setSetupStep("funding");
        })
        .catch((err) => {
          if (!cancelled) resetOnError(err, setError, setSetupStep, "restoreClient");
        });
      return () => {
        cancelled = true;
      };
    }

    let cancelled = false;
    console.log("[useSessionWallet] Creating session wallet...");

    (async () => {
      try {
        // fresh=true: wipe stale IndexedDB from previous sessions
        const client = await createGameClient(true);
        if (cancelled) return;

        await client.syncState();
        if (cancelled) return;

        const wallet = await client.newWallet(
          AccountStorageMode.private(),
          true,
          AuthScheme.AuthRpoFalcon512,
        );
        if (cancelled) return;

        const walletIdStr = wallet
          .id()
          .toBech32(NetworkId.testnet(), AccountInterface.BasicWallet);
        console.log("[useSessionWallet] Session wallet created:", walletIdStr);

        startSyncInterval(client);
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
  }, [setupStep, setSessionWalletId, setSetupStep]);

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
    if (!gameClient) return;

    const walletId = getSessionWalletId();
    if (!walletId) return;

    let cancelled = false;
    const client = gameClient;
    console.log("[useSessionWallet] Polling for funding note...");

    const pollAndConsume = async () => {
      while (!cancelled) {
        try {
          await client.syncState();

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
            const notes = consumable.map((r) => r.inputNoteRecord().toNote());
            const txRequest = client.newConsumeTransactionRequest(notes);
            // Fresh accountId + prover for the submit call (WASM pointer consumed above)
            const submitAccountId = AccountId.fromBech32(walletId);
            const prover = TransactionProver.newRemoteProver(PROVER_URL);
            await client.submitNewTransactionWithProver(submitAccountId, txRequest, prover);

            if (!cancelled) {
              console.log("[useSessionWallet] Funding note consumed. Setup complete!");
              markSetupComplete();
              setSetupStep("done");
            }
            return;
          }

          console.log("[useSessionWallet] No consumable notes yet, retrying...");
        } catch (err) {
          console.warn("[useSessionWallet] Poll/consume attempt failed:", err);
        }

        await new Promise((r) => setTimeout(r, CONSUME_POLL_MS));
      }
    };

    pollAndConsume();
    return () => {
      cancelled = true;
    };
  }, [setupStep, setSetupStep]);

  // -----------------------------------------------------------------------
  // connect — button handler
  // -----------------------------------------------------------------------
  const connect = useCallback(async () => {
    setError(null);
    clearSessionData();
    try {
      setSetupStep("connecting");
      await walletConnect();
    } catch (err) {
      console.error("[useSessionWallet] walletConnect error:", err);
      const msg = err instanceof Error ? err.message : String(err);
      setError(`Failed to connect wallet: ${msg}`);
      clearSessionData();
      setSetupStep("idle");
    }
  }, [walletConnect, setSetupStep]);

  return {
    connect,
    isExtensionDetected: wallets.length > 0,
    isConnected: midenFiAddress !== null,
    isReady: setupStep === "done",
    step: setupStep,
    midenFiAddress,
    sessionWalletId,
    error,
  };
}
