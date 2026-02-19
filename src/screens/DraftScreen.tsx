import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useGameStore } from "../store/gameStore";
import { useDraft } from "../hooks/useDraft";
import { getChampion } from "../constants/champions";
import GameLayout from "../components/layout/GameLayout";
import DraftPool from "../components/draft/DraftPool";
import DraftTimeline from "../components/draft/DraftTimeline";
import ElementChart from "../components/draft/ElementChart";
import TeamPreview from "../components/draft/TeamPreview";
import DraftStage from "../scenes/DraftStage";
import GlassPanel from "../components/layout/GlassPanel";
import type { Element } from "../types/game";

const ELEMENT_COLORS: Record<Element, string> = {
  fire: "#ff6b35",
  water: "#4fc3f7",
  earth: "#8d6e63",
  wind: "#aed581",
};

export default function DraftScreen() {
  const draft = useGameStore((s) => s.draft);
  const role = useGameStore((s) => s.match.role);
  const setScreen = useGameStore((s) => s.setScreen);
  const { pickChampion, isMyTurn, isDone, isSending } = useDraft();

  // Preview state — local only, defaults to first available champion
  const [previewId, setPreviewId] = useState<number | null>(
    draft.pool[0] ?? null,
  );

  // Reset preview to first available when pool changes
  useEffect(() => {
    if (previewId === null || !draft.pool.includes(previewId)) {
      setPreviewId(draft.pool[0] ?? null);
    }
  }, [draft.pool, previewId]);

  const previewChampion = previewId !== null ? getChampion(previewId) : null;

  // Transition to battle when draft complete
  if (isDone) {
    setTimeout(() => setScreen("battle"), 2000);
  }

  const pickDisabled = !isMyTurn || isDone || previewId === null || isSending;

  return (
    <GameLayout title="Champion Draft">
      <div className="flex h-full flex-col">
        {/* 3D Champion Preview — bleed past GameLayout padding */}
        <div className="relative flex-shrink-0 h-[50vh] w-[calc(100%+1.5rem)] -mx-3 -mt-3 sm:h-[55vh]">
          <DraftStage
            championId={previewId}
            element={previewChampion?.element}
          />

          {/* Overlay: Draft timeline + Element chart */}
          <div className="absolute left-4 top-4">
            <DraftTimeline pickNumber={draft.pickNumber} role={role ?? "host"} />
          </div>
          <div className="absolute right-4 top-4">
            <ElementChart />
          </div>
        </div>

        {/* Draft UI */}
        <div className="flex-1 min-h-0 flex flex-col space-y-3 px-4 pb-4">
          {/* Turn indicator + Pick button */}
          <AnimatePresence mode="wait">
            <motion.div
              key={isMyTurn ? "my-turn" : "opp-turn"}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="text-center space-y-2"
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

              {/* Pick button — visible on your turn */}
              {isMyTurn && !isDone && (
                <button
                  disabled={pickDisabled}
                  onClick={() => previewId !== null && pickChampion(previewId)}
                  className="w-full rounded-xl px-4 py-2.5 text-sm font-bold text-white
                    transition-all duration-200 active:scale-[0.97]
                    disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    background: previewChampion
                      ? `linear-gradient(135deg, ${ELEMENT_COLORS[previewChampion.element]}cc, ${ELEMENT_COLORS[previewChampion.element]}66)`
                      : "linear-gradient(135deg, #888c, #8886)",
                  }}
                >
                  {isSending ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      Picking…
                    </span>
                  ) : previewChampion ? (
                    `Pick ${previewChampion.name}`
                  ) : (
                    "Select a Champion"
                  )}
                </button>
              )}
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
              <TeamPreview team={draft.opponentTeam} label="Their Team" />
            </div>
          </div>

          {/* Champion pool — scrollable */}
          <div className="flex min-h-0 flex-1 flex-col">
            <p className="mb-2 text-xs font-bold text-gray-400 uppercase flex-shrink-0">Available Champions</p>
            <div className="flex-1 overflow-y-auto min-h-0 -m-1 p-1">
              <DraftPool
                pool={draft.pool}
                selectedId={previewId}
                onSelect={(id) => setPreviewId(id)}
                disabled={!isMyTurn || isDone}
              />
            </div>
          </div>
        </div>
      </div>
    </GameLayout>
  );
}
