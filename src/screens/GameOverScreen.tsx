import { useEffect } from "react";
import { motion } from "framer-motion";
import { useGameStore } from "../store/gameStore";
import { useStaking } from "../hooks/useStaking";
import { getChampion } from "../constants/champions";
import { stopMusic, playSfx } from "../audio/audioManager";
import { ELEMENT_COLORS } from "../constants/elements";
import GlassPanel from "../components/layout/GlassPanel";
import GameLayout from "../components/layout/GameLayout";

export default function GameOverScreen() {
  const result = useGameStore((s) => s.result);
  const battle = useGameStore((s) => s.battle);
  const resetGame = useGameStore((s) => s.resetGame);
  const { withdraw, isWithdrawing } = useStaking();

  const isWinner = result.winner === "me";
  const mvpChampion = result.mvp !== null ? getChampion(result.mvp) : null;

  // Fade out battle music and play result SFX
  useEffect(() => {
    stopMusic(2.0);
    playSfx(isWinner ? "victory" : "defeat");
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-withdraw on game end
  useEffect(() => {
    withdraw();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <GameLayout title="Game Over">
      <div className="flex h-full flex-col items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: "backOut" }}
          className="w-full max-w-md space-y-6"
        >
          {/* Victory/Defeat banner */}
          <div className="text-center">
            <motion.h1
              className={`text-5xl font-black tracking-tight ${
                isWinner ? "text-amber-400" : "text-red-400"
              }`}
              initial={{ y: -50 }}
              animate={{ y: 0 }}
              transition={{ delay: 0.2, type: "spring" }}
            >
              {isWinner ? "VICTORY" : result.winner === "draw" ? "DRAW" : "DEFEAT"}
            </motion.h1>
            <motion.p
              className="mt-2 text-sm text-gray-400"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              {isWinner
                ? "You claimed 20 MIDEN!"
                : result.winner === "draw"
                  ? "Stakes returned"
                  : "Better luck next time"}
            </motion.p>
          </div>

          {/* Stats */}
          <GlassPanel>
            <div className="grid grid-cols-2 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-white">{result.totalRounds}</p>
                <p className="text-xs text-gray-400">Rounds</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-white">
                  {battle.myChampions.filter((c) => !c.isKO).length}/3
                </p>
                <p className="text-xs text-gray-400">Survivors</p>
              </div>
            </div>
          </GlassPanel>

          {/* MVP */}
          {mvpChampion && (
            <GlassPanel>
              <div className="text-center">
                <p className="mb-1 text-xs text-gray-400 uppercase">Most Valuable Champion</p>
                <p
                  className="font-display text-xl font-bold"
                  style={{ color: ELEMENT_COLORS[mvpChampion.element] }}
                >
                  {mvpChampion.name}
                </p>
                <p className="text-sm text-gray-400">
                  {[...battle.myChampions, ...battle.opponentChampions]
                    .find((c) => c.id === mvpChampion.id)
                    ?.totalDamageDealt ?? 0}{" "}
                  total damage dealt
                </p>
              </div>
            </GlassPanel>
          )}

          {/* Withdrawal status */}
          {isWithdrawing && (
            <GlassPanel compact>
              <motion.p
                className="text-center text-sm text-amber-400"
                animate={{ opacity: [1, 0.5, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              >
                Withdrawing to MidenFi wallet...
              </motion.p>
            </GlassPanel>
          )}

          {/* Actions */}
          <div className="flex gap-4">
            <motion.button
              onClick={resetGame}
              className="flex-1 rounded-xl bg-gradient-to-r from-amber-500 to-orange-600 py-3 font-bold text-white shadow-lg active:scale-95"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              Play Again
            </motion.button>
            <motion.button
              onClick={resetGame}
              className="flex-1 rounded-xl border border-white/10 bg-black/40 py-3 font-bold text-gray-300 active:scale-95"
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              Lobby
            </motion.button>
          </div>
        </motion.div>
      </div>
    </GameLayout>
  );
}
