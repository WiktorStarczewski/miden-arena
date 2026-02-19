import { motion } from "framer-motion";
import { useGameStore } from "../store/gameStore";
import { useSessionWallet } from "../hooks/useSessionWallet";
import GlassPanel from "../components/layout/GlassPanel";
import AccountBadge from "../components/ui/AccountBadge";
import TransactionProgress from "../components/ui/TransactionProgress";

const STEPS = [
  { key: "connecting", label: "Connect Wallet" },
  { key: "creatingWallet", label: "Create Session Wallet" },
  { key: "funding", label: "Fund Session (15 MIDEN)" },
  { key: "consuming", label: "Claiming Funds" },
  { key: "done", label: "Ready!" },
] as const;

export default function SetupScreen() {
  const { step, midenFiAddress, sessionWalletId } = useGameStore((s) => s.setup);
  const setScreen = useGameStore((s) => s.setScreen);
  const { connect, isReady, error, isExtensionDetected } = useSessionWallet();

  const currentStepIndex = STEPS.findIndex((s) => s.key === step);

  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-[#0a0a1a] px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        layout={false}
        className="w-full max-w-md"
        style={{ display: "flex", flexDirection: "column", gap: "2rem" }}
      >
        <h2 className="text-center text-2xl font-bold text-white">Game Setup</h2>
        <p className="text-center text-sm text-gray-400" style={{ marginBottom: "0.5rem" }}>
          Connect your MidenFi wallet to fund a session wallet.
          <br />
          Only 1 popup required!
        </p>

        {/* Progress steps */}
        <GlassPanel>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {STEPS.map((s, i) => (
              <div key={s.key} className="flex items-center gap-3">
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    i < currentStepIndex
                      ? "bg-green-500/20 text-green-400"
                      : i === currentStepIndex
                        ? "bg-amber-500/20 text-amber-400"
                        : "bg-white/5 text-gray-600"
                  }`}
                >
                  {i < currentStepIndex ? "\u2713" : i + 1}
                </div>
                <span
                  className={`text-sm ${
                    i <= currentStepIndex ? "text-white" : "text-gray-600"
                  }`}
                >
                  {s.label}
                </span>
                {i === currentStepIndex && step !== "done" && step !== "idle" && (
                  <motion.div
                    className="ml-auto h-2 w-2 rounded-full bg-amber-400"
                    animate={{ opacity: [1, 0.3, 1] }}
                    transition={{ duration: 1, repeat: Infinity }}
                  />
                )}
              </div>
            ))}
          </div>
        </GlassPanel>

        {/* Wallet info */}
        {midenFiAddress && (
          <GlassPanel compact>
            <div className="space-y-2">
              <AccountBadge address={midenFiAddress} label="MidenFi Wallet" />
              {sessionWalletId && (
                <AccountBadge address={sessionWalletId} label="Session Wallet" />
              )}
            </div>
          </GlassPanel>
        )}

        {/* TX progress for funding step */}
        {(step === "funding" || step === "consuming") && (
          <TransactionProgress
            stage={step === "funding" ? "executing" : "submitting"}
          />
        )}

        {/* Error message */}
        {error && (
          <div
            className="rounded-xl text-center text-sm text-red-300"
            style={{ backgroundColor: "rgba(220, 38, 38, 0.15)", padding: "1rem" }}
          >
            {error}
          </div>
        )}

        {/* Action button */}
        <div className="flex justify-center">
          {step === "idle" && (
            <motion.button
              onClick={connect}
              className="rounded-3xl bg-gradient-to-r from-amber-500 to-orange-600 text-xl font-bold tracking-wide text-white shadow-2xl shadow-amber-500/40 transition-all hover:shadow-amber-500/60 active:scale-95"
              style={{ marginTop: "1rem", marginBottom: "1rem", padding: "3rem 5rem" }}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              {isExtensionDetected ? "Connect MidenFi Wallet" : "Connect MidenFi Wallet"}
            </motion.button>
          )}

          {isReady && (
            <motion.button
              onClick={() => setScreen("lobby")}
              className="rounded-3xl bg-gradient-to-r from-green-500 to-emerald-600 text-xl font-bold tracking-wide text-white shadow-2xl shadow-green-500/40 transition-all hover:shadow-green-500/60 active:scale-95"
              style={{ marginTop: "1rem", marginBottom: "1rem", padding: "3rem 5rem" }}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              Enter Lobby
            </motion.button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
