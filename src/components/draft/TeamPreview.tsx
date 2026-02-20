// react import removed — JSX transform handles it
import { motion, AnimatePresence } from "framer-motion";
import { getChampion } from "../../constants/champions";
import GlassPanel from "../layout/GlassPanel";

interface TeamPreviewProps {
  team: number[];
  maxSize?: number;
  label?: string;
}

const ELEMENT_COLORS: Record<string, string> = {
  fire: "#ff6b35",
  water: "#4fc3f7",
  earth: "#8d6e63",
  wind: "#aed581",
};

export default function TeamPreview({
  team,
  maxSize = 3,
  label = "Your Team",
}: TeamPreviewProps) {
  const slots = Array.from({ length: maxSize }, (_, i) =>
    i < team.length ? team[i] : null
  );

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2 px-1">
        <span className="text-[10px] uppercase tracking-wider text-white/40 font-medium">
          {label}
        </span>
        <span className="text-[10px] text-white/30 tabular-nums">
          {team.length}/{maxSize}
        </span>
      </div>

      <div className="flex gap-2">
        <AnimatePresence mode="popLayout">
          {slots.map((championId, index) => {
            if (championId !== null) {
              const champion = getChampion(championId);
              if (!champion) return null;

              const color = ELEMENT_COLORS[champion.element] ?? "#888";

              return (
                <motion.div
                  key={`champ-${championId}`}
                  initial={{ opacity: 0, scale: 0.8, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.8, y: -8 }}
                  transition={{
                    type: "spring",
                    stiffness: 300,
                    damping: 25,
                  }}
                  layout
                  className="flex-1 min-w-0"
                >
                  <GlassPanel compact className="flex items-center gap-2 !py-2">
                    {/* Element accent bar */}
                    <div
                      className="w-1 h-6 rounded-full flex-shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <span className="font-display font-bold text-sm text-white/90 truncate">
                      {champion.name}
                    </span>
                  </GlassPanel>
                </motion.div>
              );
            }

            // Empty slot
            return (
              <motion.div
                key={`empty-${index}`}
                layout
                className="flex-1 min-w-0"
              >
                <GlassPanel
                  compact
                  className="
                    border-dashed border-white/10
                    bg-transparent
                    flex items-center gap-2 !py-2
                  "
                >
                  <div className="w-1 h-6 rounded-full flex-shrink-0 bg-white/10" />
                  <span className="text-xs text-white/15">
                    Slot {index + 1}
                  </span>
                </GlassPanel>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Team full indicator */}
      {team.length >= maxSize && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-2 text-center"
        >
          <span className="text-[10px] uppercase tracking-wider text-emerald-400/70 font-semibold">
            Team Complete
          </span>
        </motion.div>
      )}
    </div>
  );
}
