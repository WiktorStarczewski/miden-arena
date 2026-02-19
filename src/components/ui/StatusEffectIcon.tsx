// react import removed — JSX transform handles it
import type { Buff } from "../../types/game";

interface StatusEffectIconProps {
  buff?: Buff;
  isBurn?: boolean;
  burnTurns?: number;
}

const BUFF_CONFIG: Record<
  Buff["type"],
  { icon: string; label: string }
> = {
  defense: { icon: "\u26E8", label: "DEF" },
  speed: { icon: "\u26A1", label: "SPD" },
  attack: { icon: "\u2694", label: "ATK" },
};

export default function StatusEffectIcon({
  buff,
  isBurn = false,
  burnTurns = 0,
}: StatusEffectIconProps) {
  if (isBurn && burnTurns > 0) {
    return (
      <div
        className="
          inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md
          bg-orange-500/15 border border-orange-500/30
          text-orange-400
        "
        title={`Burn: ${burnTurns} turns remaining`}
      >
        <span className="text-xs leading-none">{"\u2622"}</span>
        <span className="text-[10px] font-bold tabular-nums">{burnTurns}</span>
      </div>
    );
  }

  if (!buff) return null;

  const config = BUFF_CONFIG[buff.type];
  const isDebuff = buff.isDebuff;

  return (
    <div
      className={`
        inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border
        ${
          isDebuff
            ? "bg-red-500/15 border-red-500/30 text-red-400"
            : "bg-emerald-500/15 border-emerald-500/30 text-emerald-400"
        }
      `}
      title={`${isDebuff ? "Debuff" : "Buff"}: ${config.label} ${isDebuff ? "-" : "+"}${buff.value} (${buff.turnsRemaining}T)`}
    >
      <span className="text-xs leading-none">
        {isDebuff ? "\u2193" : "\u2191"}
      </span>
      <span className="text-[10px] font-bold">
        {config.label}
      </span>
      <span className="text-[9px] tabular-nums opacity-70">
        {buff.turnsRemaining}
      </span>
    </div>
  );
}
