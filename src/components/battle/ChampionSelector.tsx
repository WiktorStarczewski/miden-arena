import { useRef } from "react";
import { motion } from "framer-motion";
import { getChampion } from "../../constants/champions";
import GlassPanel from "../layout/GlassPanel";
import ElementBadge from "../ui/ElementBadge";
import HealthBar from "../ui/HealthBar";
import type { ChampionState, Element } from "../../types/game";

interface ChampionSelectorProps {
  champions: ChampionState[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}

const ELEMENT_COLORS: Record<Element, string> = {
  fire: "#ff6b35",
  water: "#4fc3f7",
  earth: "#8d6e63",
  wind: "#aed581",
};

export default function ChampionSelector({
  champions,
  selectedId,
  onSelect,
}: ChampionSelectorProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  return (
    <div className="w-full">
      <div className="text-[10px] uppercase tracking-wider text-white/40 font-medium mb-2 px-1">
        Select Champion
      </div>

      {/* Horizontal scroll container with snap */}
      <div
        ref={scrollRef}
        className="
          flex gap-3 overflow-x-auto py-1 px-1
          snap-x snap-mandatory
          scrollbar-none
        "
        style={{
          scrollbarWidth: "none",
          msOverflowStyle: "none",
          WebkitOverflowScrolling: "touch",
        }}
      >
        {champions.map((champState) => {
          const champion = getChampion(champState.id);
          if (!champion) return null;

          const isSelected = selectedId === champState.id;
          const isKO = champState.isKO;
          const elementColor = ELEMENT_COLORS[champion.element];

          return (
            <motion.button
              key={champState.id}
              onClick={() => !isKO && onSelect(champState.id)}
              disabled={isKO}
              whileTap={!isKO ? { scale: 0.95 } : undefined}
              className={`
                flex-shrink-0 snap-center w-[140px]
                touch-manipulation rounded-xl
                border-2 transition-colors
                ${isKO ? "opacity-40 cursor-not-allowed" : "cursor-pointer"}
                ${isSelected ? "border-amber-400" : "border-transparent"}
              `}
            >
              <GlassPanel
                compact
                className={`
                  relative overflow-hidden h-full
                  ${isSelected ? "bg-amber-400/5 border-amber-400/30" : ""}
                  ${!isKO && !isSelected ? "hover:bg-white/5" : ""}
                  transition-colors
                `}
              >
                {/* Element left accent */}
                <div
                  className="absolute left-0 top-0 bottom-0 w-0.5"
                  style={{ backgroundColor: elementColor }}
                />

                {/* KO overlay */}
                {isKO && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-xl z-10">
                    <span className="text-xs font-bold uppercase tracking-wider text-red-400 px-2 py-0.5 rounded bg-red-500/20 border border-red-500/30">
                      KO
                    </span>
                  </div>
                )}

                {/* Content */}
                <div className="relative pl-2">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="font-bold text-xs text-white/90 truncate">
                      {champion.name}
                    </span>
                    <ElementBadge element={champion.element} size="sm" />
                  </div>

                  <HealthBar
                    current={champState.currentHp}
                    max={champState.maxHp}
                    showLabel={false}
                    className="mb-1"
                  />
                  <div className="text-[10px] text-white/50 tabular-nums">
                    {champState.currentHp}/{champState.maxHp} HP
                  </div>
                </div>
              </GlassPanel>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
