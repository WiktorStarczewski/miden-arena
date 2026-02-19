import { motion, AnimatePresence } from "framer-motion";
import { useGameStore } from "../store/gameStore";
import { useDraft } from "../hooks/useDraft";
import GameLayout from "../components/layout/GameLayout";
import DraftPool from "../components/draft/DraftPool";
import DraftTimeline from "../components/draft/DraftTimeline";
import TeamPreview from "../components/draft/TeamPreview";
import DraftStage from "../scenes/DraftStage";
import GlassPanel from "../components/layout/GlassPanel";

export default function DraftScreen() {
  const draft = useGameStore((s) => s.draft);
  const role = useGameStore((s) => s.match.role);
  const setScreen = useGameStore((s) => s.setScreen);
  const { pickChampion, isMyTurn, isDone } = useDraft();
  const selectedPreview = useGameStore((s) => s.battle.selectedChampion);

  // Transition to battle when draft complete
  if (isDone) {
    setTimeout(() => setScreen("battle"), 2000);
  }

  return (
    <GameLayout title="Champion Draft">
      <div className="flex h-full flex-col">
        {/* 3D Champion Preview - top 40% on mobile */}
        <div className="relative h-[35vh] w-full sm:h-[40vh]">
          <DraftStage championId={selectedPreview} />

          {/* Overlay: Draft timeline */}
          <div className="absolute left-0 right-0 top-2 flex justify-center px-4">
            <DraftTimeline pickNumber={draft.pickNumber} role={role ?? "host"} />
          </div>
        </div>

        {/* Draft UI - bottom 60% */}
        <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-4">
          {/* Turn indicator */}
          <AnimatePresence mode="wait">
            <motion.div
              key={isMyTurn ? "my-turn" : "opp-turn"}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="text-center"
            >
              <GlassPanel compact>
                <p
                  className={`text-sm font-bold ${
                    isDone
                      ? "text-green-400"
                      : isMyTurn
                        ? "text-amber-400"
                        : "text-gray-400"
                  }`}
                >
                  {isDone
                    ? "Draft Complete! Entering battle..."
                    : isMyTurn
                      ? "Your Pick!"
                      : "Opponent is choosing..."}
                </p>
              </GlassPanel>
            </motion.div>
          </AnimatePresence>

          {/* Teams preview */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="mb-1 text-xs font-bold text-amber-400 uppercase">Your Team</p>
              <TeamPreview team={draft.myTeam} />
            </div>
            <div>
              <p className="mb-1 text-xs font-bold text-red-400 uppercase">Opponent</p>
              <TeamPreview team={draft.opponentTeam} />
            </div>
          </div>

          {/* Champion pool */}
          <div>
            <p className="mb-2 text-xs font-bold text-gray-400 uppercase">Available Champions</p>
            <DraftPool
              pool={draft.pool}
              onPick={(id) => pickChampion(id)}
              disabled={!isMyTurn || isDone}
            />
          </div>
        </div>
      </div>
    </GameLayout>
  );
}
