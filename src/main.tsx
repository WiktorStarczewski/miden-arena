import React from "react";
import ReactDOM from "react-dom/client";
import { MidenProvider } from "@miden-sdk/react";
import {
  MidenFiSignerProvider,
  WalletAdapterNetwork,
} from "@miden-sdk/miden-wallet-adapter";
import App from "./App";
import LoadingScreen from "./screens/LoadingScreen";
import ErrorScreen from "./screens/ErrorScreen";
import { useGameStore } from "./store/gameStore";
import "./index.css";

function MidenApp() {
  return (
    <MidenFiSignerProvider
      appName="Miden Arena"
      network={WalletAdapterNetwork.Testnet}
      autoConnect={false}
    >
      <MidenProvider
        config={{
          rpcUrl: "testnet",
          prover: "testnet",
          noteTransportUrl: "http://127.0.0.1:57292",
          autoSyncInterval: 1000,
        }}
        loadingComponent={<LoadingScreen />}
        errorComponent={(error: Error) => <ErrorScreen error={error} />}
      >
        <AppWithInit />
      </MidenProvider>
    </MidenFiSignerProvider>
  );
}

/** Once Miden SDK is loaded, transition from loading to title screen. */
function AppWithInit() {
  const screen = useGameStore((s) => s.screen);
  const setScreen = useGameStore((s) => s.setScreen);

  // Auto-transition from loading to title once MidenProvider resolves
  if (screen === "loading") {
    setScreen("title");
  }

  return <App />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MidenApp />
  </React.StrictMode>,
);
