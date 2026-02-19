import React from "react";
import type { Element } from "../../types/game";

interface ElementBadgeProps {
  element: Element;
  size?: "sm" | "md" | "lg";
}

const ELEMENT_CONFIG: Record<
  Element,
  { color: string; letter: string; label: string }
> = {
  fire: { color: "#ff6b35", letter: "F", label: "Fire" },
  water: { color: "#4fc3f7", letter: "W", label: "Water" },
  earth: { color: "#8d6e63", letter: "E", label: "Earth" },
  wind: { color: "#aed581", letter: "A", label: "Wind" },
};

const SIZE_CLASSES: Record<string, { outer: string; text: string }> = {
  sm: { outer: "h-5 px-1.5 gap-1", text: "text-[10px]" },
  md: { outer: "h-6 px-2 gap-1.5", text: "text-xs" },
  lg: { outer: "h-8 px-3 gap-2", text: "text-sm" },
};

export default function ElementBadge({
  element,
  size = "md",
}: ElementBadgeProps) {
  const config = ELEMENT_CONFIG[element];
  const sizeClass = SIZE_CLASSES[size];

  return (
    <div
      className={`
        inline-flex items-center rounded-full font-bold uppercase tracking-wider
        border
        ${sizeClass.outer}
      `}
      style={{
        backgroundColor: `${config.color}20`,
        borderColor: `${config.color}40`,
        color: config.color,
      }}
    >
      <span
        className={`
          flex items-center justify-center rounded-full font-black
          ${size === "sm" ? "w-3 h-3 text-[8px]" : size === "md" ? "w-4 h-4 text-[10px]" : "w-5 h-5 text-xs"}
        `}
        style={{ backgroundColor: `${config.color}30` }}
      >
        {config.letter}
      </span>
      <span className={sizeClass.text}>{config.label}</span>
    </div>
  );
}
