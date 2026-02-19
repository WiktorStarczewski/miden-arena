import React from "react";
import { useSpring, animated } from "@react-spring/web";

interface HealthBarProps {
  current: number;
  max: number;
  showLabel?: boolean;
  className?: string;
}

function getHealthColor(ratio: number): string {
  if (ratio > 0.5) return "#4ade80";   // green
  if (ratio > 0.25) return "#facc15";  // yellow
  return "#ef4444";                     // red
}

function getHealthGlow(ratio: number): string {
  if (ratio > 0.5) return "rgba(74, 222, 128, 0.4)";
  if (ratio > 0.25) return "rgba(250, 204, 21, 0.4)";
  return "rgba(239, 68, 68, 0.4)";
}

export default function HealthBar({
  current,
  max,
  showLabel = true,
  className = "",
}: HealthBarProps) {
  const ratio = Math.max(0, Math.min(1, current / max));
  const color = getHealthColor(ratio);
  const glow = getHealthGlow(ratio);

  const spring = useSpring({
    width: `${ratio * 100}%`,
    backgroundColor: color,
    boxShadow: `0 0 8px ${glow}, inset 0 1px 0 rgba(255,255,255,0.2)`,
    config: { tension: 120, friction: 14 },
  });

  return (
    <div className={`w-full ${className}`}>
      {showLabel && (
        <div className="flex justify-between items-center mb-1">
          <span className="text-[10px] uppercase tracking-wider text-white/50 font-medium">
            HP
          </span>
          <span className="text-xs font-bold tabular-nums text-white/80">
            {current} / {max}
          </span>
        </div>
      )}
      <div className="relative w-full h-3 rounded-full bg-black/60 border border-white/10 overflow-hidden">
        {/* Background tick marks for visual flair */}
        <div className="absolute inset-0 flex">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="flex-1 border-r border-white/5 last:border-r-0"
            />
          ))}
        </div>

        {/* Animated fill */}
        <animated.div
          style={spring}
          className="absolute inset-y-0 left-0 rounded-full"
        />
      </div>
    </div>
  );
}
