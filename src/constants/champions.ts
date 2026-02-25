import type { Champion } from "../types";

const BASE = import.meta.env.BASE_URL;

export const CHAMPIONS: Champion[] = [
  {
    id: 0,
    name: "Inferno",
    hp: 80,
    attack: 20,
    defense: 5,
    speed: 16,
    element: "fire",
    modelPath: `${BASE}models/inferno.glb`,
    abilities: [
      { name: "Eruption", power: 35, type: "damage", description: "Erupts with volcanic fury" },
      { name: "Scorch", power: 20, type: "damage", description: "Sears the target with intense heat" },
    ],
  },
  {
    id: 1,
    name: "Boulder",
    hp: 140,
    attack: 14,
    defense: 16,
    speed: 5,
    element: "earth",
    modelPath: `${BASE}models/boulder.glb`,
    abilities: [
      { name: "Rock Slam", power: 28, type: "damage", description: "Smashes with a massive boulder" },
      { name: "Fortify", power: 0, type: "stat_mod", stat: "defense", statValue: 6, duration: 2, isDebuff: false, description: "Hardens skin like stone (+6 DEF)" },
    ],
  },
  {
    id: 2,
    name: "Ember",
    hp: 90,
    attack: 16,
    defense: 8,
    speed: 14,
    element: "fire",
    modelPath: `${BASE}models/ember.glb`,
    abilities: [
      { name: "Fireball", power: 25, type: "damage", description: "Hurls a blazing fireball" },
      { name: "Flame Shield", power: 0, type: "stat_mod", stat: "defense", statValue: 5, duration: 2, isDebuff: false, description: "Wraps in protective flames (+5 DEF)" },
    ],
  },
  {
    id: 3,
    name: "Torrent",
    hp: 110,
    attack: 12,
    defense: 12,
    speed: 10,
    element: "water",
    modelPath: `${BASE}models/torrent.glb`,
    abilities: [
      { name: "Tidal Wave", power: 22, type: "damage", description: "Unleashes a crushing wave" },
      { name: "Heal", power: 0, type: "heal", healAmount: 25, description: "Restores 25 HP with healing waters" },
    ],
  },
  {
    id: 4,
    name: "Gale",
    hp: 75,
    attack: 15,
    defense: 6,
    speed: 18,
    element: "wind",
    modelPath: `${BASE}models/gale.glb`,
    abilities: [
      { name: "Wind Blade", power: 24, type: "damage", description: "Slices with razor-sharp wind" },
      { name: "Haste", power: 0, type: "stat_mod", stat: "speed", statValue: 5, duration: 2, isDebuff: false, description: "Accelerates to blinding speed (+5 SPD)" },
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
    modelPath: `${BASE}models/tide.glb`,
    abilities: [
      { name: "Whirlpool", power: 20, type: "damage", description: "Drags foe into a whirlpool" },
      { name: "Mist", power: 0, type: "stat_mod", stat: "attack", statValue: 4, duration: 2, isDebuff: true, description: "Shrouds enemy in mist (-4 ATK)" },
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
    modelPath: `${BASE}models/quake.glb`,
    abilities: [
      { name: "Earthquake", power: 26, type: "damage", description: "Shakes the earth violently" },
      { name: "Stone Wall", power: 0, type: "stat_mod", stat: "defense", statValue: 8, duration: 1, isDebuff: false, description: "Raises a stone barrier (+8 DEF)" },
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
    modelPath: `${BASE}models/storm.glb`,
    abilities: [
      { name: "Lightning", power: 30, type: "damage", description: "Strikes with lightning" },
      { name: "Dodge", power: 0, type: "stat_mod", stat: "speed", statValue: 6, duration: 2, isDebuff: false, description: "Enhances evasive reflexes (+6 SPD)" },
    ],
  },
];

export function getChampion(id: number): Champion {
  const champ = CHAMPIONS[id];
  if (!champ) throw new Error(`Unknown champion ID: ${id}`);
  return champ;
}
