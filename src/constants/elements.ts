import type { Element } from "../types";

/**
 * Element advantage cycle: Fire → Earth → Wind → Water → Fire
 * Advantage: 1.5x damage, Disadvantage: 0.67x, Neutral: 1.0x
 */
const ADVANTAGE_MAP: Record<Element, Element> = {
  fire: "earth",
  earth: "wind",
  wind: "water",
  water: "fire",
};

export function getTypeMultiplier(attacker: Element, defender: Element): number {
  if (attacker === defender) return 1.0;
  if (ADVANTAGE_MAP[attacker] === defender) return 1.5;
  if (ADVANTAGE_MAP[defender] === attacker) return 0.67;
  return 1.0;
}

export const ELEMENT_COLORS: Record<Element, string> = {
  fire: "#ff6b35",
  water: "#4fc3f7",
  earth: "#8d6e63",
  wind: "#aed581",
};

export const ELEMENT_LABELS: Record<Element, string> = {
  fire: "Fire",
  water: "Water",
  earth: "Earth",
  wind: "Wind",
};
