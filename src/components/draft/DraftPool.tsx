// react import removed — JSX transform handles it
import { motion } from "framer-motion";
import { getChampion } from "../../constants/champions";
import ChampionCard from "../ui/ChampionCard";

interface DraftPoolProps {
  pool: number[];
  selectedId?: number | null;
  onSelect: (id: number) => void;
  disabled?: boolean;
}

export default function DraftPool({
  pool,
  selectedId,
  onSelect,
  disabled = false,
}: DraftPoolProps) {
  return (
    <div className="w-full">
      {/* Compact single-column list */}
      <div className="grid grid-cols-1 gap-2">
        {pool.map((championId, index) => {
          const champion = getChampion(championId);

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
                compact
                selected={championId === selectedId}
                disabled={disabled}
                onClick={() => onSelect(championId)}
              />
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
