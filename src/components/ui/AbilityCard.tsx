import React from "react";
import type { Ability } from "../../types/game";
import GlassPanel from "../layout/GlassPanel";

interface AbilityCardProps {
  ability: Ability;
  index: number;
  selected?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}

const TYPE_ICONS: Record<Ability["type"], string> = {
  damage: "\u2694",       // crossed swords
  heal: "\u2661",         // heart
  buff: "\u2191",         // up arrow
  debuff: "\u2193",       // down arrow
  damage_dot: "\u2622",   // radioactive / burn
};

const TYPE_COLORS: Record<Ability["type"], string> = {
  damage: "text-red-400",
  heal: "text-emerald-400",
  buff: "text-sky-400",
  debuff: "text-purple-400",
  damage_dot: "text-orange-400",
};

export default function AbilityCard({
  ability,
  index,
  selected = false,
  disabled = false,
  onClick,
}: AbilityCardProps) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={`
        relative w-full text-left transition-all duration-200
        min-h-[60px] touch-manipulation
        ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer active:scale-[0.97]"}
        ${selected ? "ring-2 ring-amber-400 ring-offset-1 ring-offset-transparent" : ""}
        rounded-xl
        group
      `}
    >
      {/* Selected glow effect */}
      {selected && (
        <div className="absolute -inset-[1px] rounded-xl bg-amber-400/10 blur-sm pointer-events-none" />
      )}

      <GlassPanel
        compact
        className={`
          relative h-full flex flex-col gap-1.5
          ${!disabled ? "hover:bg-white/5 hover:border-white/20" : ""}
          ${selected ? "border-amber-400/50 bg-amber-400/5" : ""}
          transition-colors
        `}
      >
        {/* Header row */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className={`text-lg leading-none ${TYPE_COLORS[ability.type]}`}>
              {TYPE_ICONS[ability.type]}
            </span>
            <span className="font-bold text-sm text-white/90 truncate">
              {ability.name}
            </span>
          </div>

          {/* Power badge */}
          {ability.power > 0 && (
            <div className="flex-shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/10 border border-white/10">
              <span className="text-[10px] uppercase text-white/50">Pwr</span>
              <span className="text-xs font-bold text-white/90 tabular-nums">
                {ability.power}
              </span>
            </div>
          )}
        </div>

        {/* Description */}
        <p className="text-[11px] leading-snug text-white/50 line-clamp-2">
          {ability.description}
        </p>

        {/* Metadata tags */}
        <div className="flex items-center gap-1.5 flex-wrap mt-auto">
          <span
            className={`
              text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded
              ${TYPE_COLORS[ability.type]} bg-white/5
            `}
          >
            {ability.type.replace("_", " ")}
          </span>
          {ability.duration && ability.duration > 0 && (
            <span className="text-[9px] text-white/40 px-1.5 py-0.5 rounded bg-white/5">
              {ability.duration}T
            </span>
          )}
          {ability.healAmount && ability.healAmount > 0 && (
            <span className="text-[9px] text-emerald-400 px-1.5 py-0.5 rounded bg-emerald-400/10">
              +{ability.healAmount} HP
            </span>
          )}
          {ability.appliesBurn && (
            <span className="text-[9px] text-orange-400 px-1.5 py-0.5 rounded bg-orange-400/10">
              Burn
            </span>
          )}
        </div>

        {/* Keyboard shortcut hint */}
        <div
          className="
            absolute top-2 right-2 w-5 h-5 rounded flex items-center justify-center
            bg-white/5 text-[10px] text-white/30 font-mono
            opacity-0 group-hover:opacity-100 transition-opacity
          "
        >
          {index + 1}
        </div>
      </GlassPanel>
    </button>
  );
}
