// react import removed — JSX transform handles it
import type { Champion, Element } from "../../types/game";
import GlassPanel from "../layout/GlassPanel";
import ElementBadge from "./ElementBadge";

interface ChampionCardProps {
  champion: Champion;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  compact?: boolean;
}

const ELEMENT_COLORS: Record<Element, string> = {
  fire: "#ff6b35",
  water: "#4fc3f7",
  earth: "#8d6e63",
  wind: "#aed581",
};

interface StatDisplayProps {
  label: string;
  value: number;
  color: string;
}

function StatDisplay({ label, value, color }: StatDisplayProps) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[9px] uppercase tracking-wider text-white/40 font-medium">
        {label}
      </span>
      <span className="text-sm font-bold tabular-nums" style={{ color }}>
        {value}
      </span>
    </div>
  );
}

export default function ChampionCard({
  champion,
  selected = false,
  disabled = false,
  onClick,
  compact = false,
}: ChampionCardProps) {
  const elementColor = ELEMENT_COLORS[champion.element];

  if (compact) {
    return (
      <button
        onClick={disabled ? undefined : onClick}
        disabled={disabled}
        className={`
          w-full text-left transition-all duration-200 touch-manipulation
          ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer active:scale-[0.97]"}
          ${selected ? "ring-2 ring-amber-400" : ""}
          rounded-xl
        `}
      >
        <GlassPanel compact className="flex items-center gap-3">
          {/* Element accent bar */}
          <div
            className="w-1 h-8 rounded-full flex-shrink-0"
            style={{ backgroundColor: elementColor }}
          />
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <span className="font-bold text-sm text-white/90 truncate">
              {champion.name}
            </span>
            <ElementBadge element={champion.element} size="sm" />
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 text-[11px] tabular-nums">
            <span className="text-green-400/70">{champion.hp}<span className="text-white/30 ml-0.5">HP</span></span>
            <span className="text-red-400/70">{champion.attack}<span className="text-white/30 ml-0.5">ATK</span></span>
            <span className="text-blue-400/70">{champion.defense}<span className="text-white/30 ml-0.5">DEF</span></span>
            <span className="text-yellow-400/70">{champion.speed}<span className="text-white/30 ml-0.5">SPD</span></span>
          </div>
        </GlassPanel>
      </button>
    );
  }

  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`
        relative w-full text-left transition-all duration-200 touch-manipulation
        ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer active:scale-[0.97]"}
        ${selected ? "ring-2 ring-amber-400 ring-offset-1 ring-offset-transparent" : ""}
        rounded-xl group
      `}
    >
      {/* Selected glow */}
      {selected && (
        <div
          className="absolute -inset-[2px] rounded-xl blur-md pointer-events-none opacity-30"
          style={{ backgroundColor: elementColor }}
        />
      )}

      <GlassPanel
        className={`
          relative overflow-hidden
          ${!disabled ? "hover:bg-white/5 hover:border-white/20" : ""}
          ${selected ? "bg-white/5" : ""}
          transition-colors
        `}
      >
        {/* Element-colored left border */}
        <div
          className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
          style={{ backgroundColor: elementColor }}
        />

        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-3 pl-2">
          <div className="min-w-0">
            <h3 className="font-bold text-base text-white/95 truncate">
              {champion.name}
            </h3>
            <div className="mt-1">
              <ElementBadge element={champion.element} size="sm" />
            </div>
          </div>
          <div className="flex-shrink-0 text-right">
            <div className="text-[10px] uppercase tracking-wider text-white/40">
              ID #{champion.id}
            </div>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-4 gap-1 pl-2">
          <StatDisplay label="HP" value={champion.hp} color="#4ade80" />
          <StatDisplay label="ATK" value={champion.attack} color="#f87171" />
          <StatDisplay label="DEF" value={champion.defense} color="#60a5fa" />
          <StatDisplay label="SPD" value={champion.speed} color="#fbbf24" />
        </div>

        {/* Abilities preview */}
        <div className="mt-3 pt-3 border-t border-white/5 pl-2">
          <div className="text-[9px] uppercase tracking-wider text-white/30 mb-1.5">
            Abilities
          </div>
          <div className="flex gap-2">
            {champion.abilities.map((ability, i) => (
              <div
                key={i}
                className="flex-1 px-2 py-1 rounded bg-white/5 border border-white/5"
              >
                <span className="text-[11px] font-medium text-white/70 truncate block">
                  {ability.name}
                </span>
                <span className="text-[9px] text-white/40">
                  Pwr {ability.power}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Hover shimmer */}
        <div
          className="
            absolute inset-0 opacity-0 group-hover:opacity-100
            bg-gradient-to-r from-transparent via-white/3 to-transparent
            pointer-events-none transition-opacity duration-500
          "
        />
      </GlassPanel>
    </button>
  );
}
