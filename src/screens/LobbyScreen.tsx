import { useState } from "react";
import { motion } from "framer-motion";
import { useGameStore } from "../store/gameStore";
import { useMatchmaking } from "../hooks/useMatchmaking";
import GlassPanel from "../components/layout/GlassPanel";
import AccountBadge from "../components/ui/AccountBadge";
import GameLayout from "../components/layout/GameLayout";

export default function LobbyScreen() {
  const { sessionWalletId } = useGameStore((s) => s.setup);
  const setScreen = useGameStore((s) => s.setScreen);
  const { host, join, isWaiting, opponentId, error } = useMatchmaking();
  const [joinInput, setJoinInput] = useState("");
  const [mode, setMode] = useState<"choose" | "host" | "join">("choose");

  // The matchmaking hooks (useMatchmaking) handle the screen transition
  // to "draft" once both sides have exchanged signals and initDraft() has
  // been called. The lobby just shows the "Match Found!" UI when
  // opponentId is set.

  return (
    <GameLayout title="Lobby" showBackButton onBack={() => setScreen("setup")}>
      <div className="flex flex-1 flex-col items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="w-full max-w-md space-y-8"
        >
          {opponentId ? (
            // Matched!
            <GlassPanel>
              <div className="space-y-4 text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="text-4xl"
                >
                  &#9876;
                </motion.div>
                <h3 className="text-xl font-bold text-green-400">Match Found!</h3>
                <AccountBadge address={opponentId} label="Opponent" />
                {error ? (
                  <p className="text-sm text-red-400">{error}</p>
                ) : (
                  <p className="text-sm text-gray-400">Entering draft phase...</p>
                )}
              </div>
            </GlassPanel>
          ) : mode === "choose" ? (
            // Choose host or join
            <>
              <GlassPanel>
                <div className="space-y-4 text-center">
                  <h3 className="text-lg font-bold text-white">Your Session Wallet</h3>
                  {sessionWalletId && (
                    <AccountBadge address={sessionWalletId} label="Share this ID" />
                  )}
                </div>
              </GlassPanel>

              <div className="grid grid-cols-2 gap-4">
                <motion.button
                  onClick={() => {
                    setMode("host");
                    host();
                  }}
                  className="rounded-xl bg-gradient-to-b from-purple-500/80 to-purple-700/80 p-6 text-center font-bold text-white shadow-lg active:scale-95"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                >
                  <div className="mb-2 text-3xl">&#9813;</div>
                  Host Game
                </motion.button>

                <motion.button
                  onClick={() => setMode("join")}
                  className="rounded-xl bg-gradient-to-b from-cyan-500/80 to-cyan-700/80 p-6 text-center font-bold text-white shadow-lg active:scale-95"
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                >
                  <div className="mb-2 text-3xl">&#9876;</div>
                  Join Game
                </motion.button>
              </div>
            </>
          ) : mode === "host" ? (
            // Hosting - waiting for opponent
            <GlassPanel>
              <div className="space-y-4 text-center">
                <h3 className="text-lg font-bold text-white">Hosting Game</h3>
                {sessionWalletId && (
                  <AccountBadge address={sessionWalletId} label="Share this ID with opponent" />
                )}
                <motion.div
                  className="text-sm text-amber-400"
                  animate={{ opacity: [1, 0.5, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  {isWaiting ? "Waiting for opponent to join..." : "Starting host..."}
                </motion.div>
                <button
                  onClick={() => setMode("choose")}
                  className="text-xs text-gray-500 underline"
                >
                  Cancel
                </button>
              </div>
            </GlassPanel>
          ) : (
            // Joining
            <GlassPanel>
              <div className="space-y-4">
                <h3 className="text-center text-lg font-bold text-white">Join Game</h3>
                <div>
                  <label className="mb-1 block text-xs text-gray-400">
                    Host&apos;s Session Wallet ID
                  </label>
                  <input
                    type="text"
                    value={joinInput}
                    onChange={(e) => setJoinInput(e.target.value)}
                    placeholder="mtst1..."
                    className="w-full rounded-lg border border-white/10 bg-black/30 px-4 py-3 text-sm text-white placeholder-gray-600 outline-none focus:border-amber-400/50"
                  />
                </div>
                <motion.button
                  onClick={() => join(joinInput)}
                  disabled={!joinInput || isWaiting}
                  className="w-full rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 py-3 font-bold text-white shadow-lg disabled:opacity-50 active:scale-95"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  {isWaiting ? "Joining..." : "Join Match"}
                </motion.button>
                {error && (
                  <p className="text-center text-sm text-red-400">{error}</p>
                )}
                <button
                  onClick={() => setMode("choose")}
                  className="block w-full text-center text-xs text-gray-500 underline"
                >
                  Cancel
                </button>
              </div>
            </GlassPanel>
          )}
        </motion.div>
      </div>
    </GameLayout>
  );
}
