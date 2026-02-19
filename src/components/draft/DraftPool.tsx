// react import removed — JSX transform handles it
import { motion } from "framer-motion";
import { getChampion } from "../../constants/champions";
import ChampionCard from "../ui/ChampionCard";

interface DraftPoolProps {
  pool: number[];
  onPick: (id: number) => void;
  disabled?: boolean;
}

export default function DraftPool({
  pool,
  onPick,
  disabled = false,
}: DraftPoolProps) {
  return (
    <div className="w-full">
      <div className="text-[10px] uppercase tracking-wider text-white/40 font-medium mb-3 px-1">
        Available Champions
      </div>

      {/* 2x5 responsive grid */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5 md:gap-4">
        {pool.map((championId, index) => {
          const champion = getChampion(championId);
          if (!champion) {
            // Champion already picked -- show grayed-out placeholder
            return (
              <motion.div
                key={`empty-${index}`}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: index * 0.04 }}
                className="
                  min-h-[120px] rounded-xl
                  border-2 border-dashed border-white/10
                  bg-white/[0.02]
                  flex items-center justify-center
                "
              >
                <span className="text-xs text-white/20 uppercase tracking-wider">
                  Picked
                </span>
              </motion.div>
            );
          }

          return (
            <motion.div
              key={championId}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                delay: index * 0.04,
                duration: 0.3,
                ease: "easeOut",
              }}
            >
              <ChampionCard
                champion={champion}
                disabled={disabled}
                onClick={() => onPick(championId)}
              />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
