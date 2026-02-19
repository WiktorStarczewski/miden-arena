import "./three-extend";
import { useEffect } from "react";
import ReactDOM from "react-dom/client";
import {
  WalletProvider,
  MidenWalletAdapter,
  WalletAdapterNetwork,
} from "@miden-sdk/miden-wallet-adapter";
import { MidenProvider, useMiden } from "@miden-sdk/react";
import App from "./App";
import { useGameStore } from "./store/gameStore";
import "./index.css";

// ---------------------------------------------------------------------------
// Storage migration — runs BEFORE React mounts
// ---------------------------------------------------------------------------
// Bump this when wallet creation params change (e.g. private → public storage).
// If a previous setup exists without a matching version, all local data
// (localStorage + Miden IndexedDB databases) is wiped and the page reloads
// so MidenProvider starts with a clean slate.
const SETUP_VERSION = "2";
const VERSION_KEY = "miden-arena:setupVersion";

async function migrateIfNeeded(): Promise<boolean> {
  const savedVersion = localStorage.getItem(VERSION_KEY);

  // Migration needed if:
  // 1. Version key exists but doesn't match current, OR
  // 2. No version key but a previous setup was completed (pre-version wallet)
  const needsMigration =
    (savedVersion !== null && savedVersion !== SETUP_VERSION) ||
    (savedVersion === null &&
      localStorage.getItem("miden-arena:setupComplete") === "true");

  if (needsMigration) {
    console.log("[migrate] Clearing stale wallet data (version mismatch)...");

    // Clear all our localStorage keys
    const keysToRemove = Object.keys(localStorage).filter((k) =>
      k.startsWith("miden-arena:"),
    );
    keysToRemove.forEach((k) => localStorage.removeItem(k));

    // Delete all Miden IndexedDB databases
    if (indexedDB.databases) {
      try {
        const dbs = await indexedDB.databases();
        const midenDbs = dbs.filter((db) => db.name?.includes("Miden"));
        await Promise.all(
          midenDbs.map(
            (db) =>
              new Promise<void>((resolve) => {
                const req = indexedDB.deleteDatabase(db.name!);
                req.onsuccess = () => resolve();
                req.onerror = () => resolve();
                req.onblocked = () => resolve();
              }),
          ),
        );
        console.log(
          "[migrate] Deleted IndexedDB databases:",
          midenDbs.map((d) => d.name),
        );
      } catch (err) {
        console.warn("[migrate] Failed to delete IndexedDB databases:", err);
      }
    }

    localStorage.setItem(VERSION_KEY, SETUP_VERSION);
    location.reload();
    return true;
  }

  // First install or matching version — just ensure the key exists
  localStorage.setItem(VERSION_KEY, SETUP_VERSION);
  return false;
}

// ---------------------------------------------------------------------------
// App bootstrap
// ---------------------------------------------------------------------------

const wallets = [new MidenWalletAdapter({ appName: "Miden Arena" })];

function MidenApp() {
  return (
    <WalletProvider
      wallets={wallets}
      network={WalletAdapterNetwork.Testnet}
      autoConnect={false}
    >
      <MidenProvider
        config={{
          rpcUrl: "testnet",
          noteTransportUrl: "https://transport.miden.io",
          prover: "testnet",
          autoSyncInterval: 2000,
        }}
      >
        <AppWithInit />
      </MidenProvider>
    </WalletProvider>
  );
}

/** Wait for MidenProvider to finish initializing before leaving the loading screen. */
function AppWithInit() {
  const screen = useGameStore((s) => s.screen);
  const setScreen = useGameStore((s) => s.setScreen);
  const { isReady, isInitializing, error } = useMiden();

  useEffect(() => {
    console.log("[AppWithInit] isReady:", isReady, "isInitializing:", isInitializing, "error:", error);
  }, [isReady, isInitializing, error]);

  useEffect(() => {
    if (screen === "loading" && isReady) {
      setScreen("title");
    }
  }, [screen, isReady, setScreen]);

  return <App />;
}

// Note: React.StrictMode is intentionally omitted. MidenProvider uses a ref-based
// init guard that doesn't survive StrictMode's double-mount (the second mount
// sees isInitializedRef=true and skips WASM init entirely).
migrateIfNeeded().then((reloading) => {
  if (!reloading) {
    ReactDOM.createRoot(document.getElementById("root")!).render(<MidenApp />);
  }
});
