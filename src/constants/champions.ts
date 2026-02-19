import type { Champion } from "../types";

export const CHAMPIONS: Champion[] = [
  {
    id: 0,
    name: "Ember",
    hp: 90,
    attack: 16,
    defense: 8,
    speed: 14,
    element: "fire",
    modelPath: "/models/ember.glb",
    abilities: [
      { name: "Fireball", power: 25, type: "damage", description: "Hurls a blazing fireball" },
      { name: "Flame Shield", power: 0, type: "buff", stat: "defense", statValue: 5, duration: 2, description: "Wraps in protective flames (+5 DEF)" },
    ],
  },
  {
    id: 1,
    name: "Torrent",
    hp: 110,
    attack: 12,
    defense: 12,
    speed: 10,
    element: "water",
    modelPath: "/models/torrent.glb",
    abilities: [
      { name: "Tidal Wave", power: 22, type: "damage", description: "Unleashes a crushing wave" },
      { name: "Heal", power: 0, type: "heal", healAmount: 25, description: "Restores 25 HP with healing waters" },
    ],
  },
  {
    id: 2,
    name: "Boulder",
    hp: 140,
    attack: 14,
    defense: 16,
    speed: 5,
    element: "earth",
    modelPath: "/models/boulder.glb",
    abilities: [
      { name: "Rock Slam", power: 28, type: "damage", description: "Smashes with a massive boulder" },
      { name: "Fortify", power: 0, type: "buff", stat: "defense", statValue: 6, duration: 2, description: "Hardens skin like stone (+6 DEF)" },
    ],
  },
  {
    id: 3,
    name: "Gale",
    hp: 75,
    attack: 15,
    defense: 6,
    speed: 18,
    element: "wind",
    modelPath: "/models/gale.glb",
    abilities: [
      { name: "Wind Blade", power: 24, type: "damage", description: "Slices with razor-sharp wind" },
      { name: "Haste", power: 0, type: "buff", stat: "speed", statValue: 5, duration: 2, description: "Accelerates to blinding speed (+5 SPD)" },
    ],
  },
  {
    id: 4,
    name: "Inferno",
    hp: 80,
    attack: 20,
    defense: 5,
    speed: 16,
    element: "fire",
    modelPath: "/models/inferno.glb",
    abilities: [
      { name: "Eruption", power: 35, type: "damage", description: "Erupts with volcanic fury" },
      { name: "Scorch", power: 15, type: "damage_dot", appliesBurn: true, duration: 3, description: "Burns target for 3 turns" },
    ],
  },
  {
    id: 5,
    name: "Tide",
    hp: 100,
    attack: 11,
    defense: 14,
    speed: 9,
    element: "water",
    modelPath: "/models/tide.glb",
    abilities: [
      { name: "Whirlpool", power: 20, type: "damage", description: "Drags foe into a whirlpool" },
      { name: "Mist", power: 0, type: "debuff", stat: "attack", statValue: 4, duration: 2, description: "Shrouds enemy in mist (-4 ATK)" },
    ],
  },
  {
    id: 6,
    name: "Quake",
    hp: 130,
    attack: 13,
    defense: 15,
    speed: 7,
    element: "earth",
    modelPath: "/models/quake.glb",
    abilities: [
      { name: "Earthquake", power: 26, type: "damage", description: "Shakes the earth violently" },
      { name: "Stone Wall", power: 0, type: "buff", stat: "defense", statValue: 8, duration: 1, description: "Raises a stone barrier (+8 DEF)" },
    ],
  },
  {
    id: 7,
    name: "Storm",
    hp: 85,
    attack: 17,
    defense: 7,
    speed: 15,
    element: "wind",
    modelPath: "/models/storm.glb",
    abilities: [
      { name: "Lightning", power: 30, type: "damage", description: "Strikes with lightning" },
      { name: "Dodge", power: 0, type: "buff", stat: "speed", statValue: 6, duration: 2, description: "Enhances evasive reflexes (+6 SPD)" },
    ],
  },
  {
    id: 8,
    name: "Phoenix",
    hp: 65,
    attack: 22,
    defense: 4,
    speed: 17,
    element: "fire",
    modelPath: "/models/phoenix.glb",
    abilities: [
      { name: "Blaze", power: 38, type: "damage", description: "Engulfs in an inferno" },
      { name: "Rebirth", power: 0, type: "heal", healAmount: 30, description: "Rises from ashes (+30 HP)" },
    ],
  },
  {
    id: 9,
    name: "Kraken",
    hp: 120,
    attack: 10,
    defense: 16,
    speed: 6,
    element: "water",
    modelPath: "/models/kraken.glb",
    abilities: [
      { name: "Depth Charge", power: 24, type: "damage", description: "Launches a pressurized blast" },
      { name: "Shell", power: 0, type: "buff", stat: "defense", statValue: 7, duration: 2, description: "Retreats into armored shell (+7 DEF)" },
    ],
  },
];

export function getChampion(id: number): Champion {
  const champ = CHAMPIONS[id];
  if (!champ) throw new Error(`Unknown champion ID: ${id}`);
  return champ;
}
