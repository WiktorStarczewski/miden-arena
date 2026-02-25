export type Element = "fire" | "water" | "earth" | "wind";

export interface Ability {
  name: string;
  power: number;
  type: "damage" | "heal" | "stat_mod";
  description: string;
  /** For stat_mod: stat affected */
  stat?: "defense" | "speed" | "attack";
  /** For stat_mod: value added/subtracted */
  statValue?: number;
  /** Duration in turns (for stat_mod) */
  duration?: number;
  /** For heals: amount restored */
  healAmount?: number;
  /** For stat_mod: true = debuff opponent, false = buff self */
  isDebuff?: boolean;
}

export interface Champion {
  id: number;
  name: string;
  hp: number;
  attack: number;
  defense: number;
  speed: number;
  element: Element;
  abilities: [Ability, Ability];
  modelPath: string;
}

export interface Buff {
  type: "defense" | "speed" | "attack";
  value: number;
  turnsRemaining: number;
  isDebuff: boolean;
}

export interface ChampionState {
  id: number;
  currentHp: number;
  maxHp: number;
  buffs: Buff[];
  isKO: boolean;
  totalDamageDealt: number;
}

export interface TurnAction {
  championId: number;
  abilityIndex: number;
}

export interface TurnRecord {
  round: number;
  myAction: TurnAction;
  opponentAction: TurnAction;
  events: TurnEvent[];
}

export type TurnEvent =
  | { type: "attack"; attackerId: number; defenderId: number; damage: number; effective: number; isSuperEffective: boolean; isResisted: boolean }
  | { type: "heal"; championId: number; amount: number; newHp: number }
  | { type: "buff"; championId: number; stat: string; value: number; duration: number }
  | { type: "debuff"; targetId: number; stat: string; value: number; duration: number }
  | { type: "ko"; championId: number };
