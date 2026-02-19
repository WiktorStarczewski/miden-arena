import React from "react";
import ReactDOM from "react-dom/client";
import {
  MidenFiSignerProvider,
  WalletAdapterNetwork,
} from "@miden-sdk/miden-wallet-adapter";
import App from "./App";
import { useGameStore } from "./store/gameStore";
import "./index.css";

function MidenApp() {
  return (
    <MidenFiSignerProvider
      appName="Miden Arena"
      network={WalletAdapterNetwork.Testnet}
      autoConnect={false}
    >
      <AppWithInit />
    </MidenFiSignerProvider>
  );
}

/** Go straight to title — no WASM init needed at startup. */
function AppWithInit() {
  const screen = useGameStore((s) => s.screen);
  const setScreen = useGameStore((s) => s.setScreen);

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
