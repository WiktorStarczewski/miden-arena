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
ReactDOM.createRoot(document.getElementById("root")!).render(<MidenApp />);
