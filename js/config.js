// Arkenfall: Emberlight — static game data.
// All content is original; no assets are loaded from the network.

export const TILE = 16;
export const MAP_W = 88;
export const MAP_H = 68;

export const T = {
  GRASS: 0, GRASS2: 1, DIRT: 2, COBBLE: 3, WATER: 4, SAND: 5,
  TREE: 6, ROCK: 7, WALL: 8, FLOOR: 9, CAVE: 10, CRYPT_WALL: 11,
  MUD: 12, BRIDGE: 13, FLOWERS: 14, BUSH: 15, MARSH: 16, CRYPT_FLOOR: 17,
  RUIN: 18, ASH: 19
};

export const TILE_DEFS = {
  [T.GRASS]:    { walk: true,  speed: 1.0,  base: '#2d4b34' },
  [T.GRASS2]:   { walk: true,  speed: 1.0,  base: '#31543a' },
  [T.DIRT]:     { walk: true,  speed: 0.95, base: '#4b3b2a' },
  [T.COBBLE]:   { walk: true,  speed: 1.0,  base: '#55575b' },
  [T.WATER]:    { walk: false, speed: 0,    base: '#194653' },
  [T.SAND]:     { walk: true,  speed: 0.92, base: '#b39a66' },
  [T.TREE]:     { walk: false, speed: 0,    base: '#2d4b34' },
  [T.ROCK]:     { walk: false, speed: 0,    base: '#3b403f' },
  [T.WALL]:     { walk: false, speed: 0,    base: '#55575b' },
  [T.FLOOR]:    { walk: true,  speed: 1.0,  base: '#4b3b2a' },
  [T.CAVE]:     { walk: true,  speed: 0.9,  base: '#34332f' },
  [T.CRYPT_WALL]: { walk: false, speed: 0,  base: '#292833' },
  [T.MUD]:      { walk: true,  speed: 0.72, base: '#3d3426' },
  [T.BRIDGE]:   { walk: true,  speed: 1.0,  base: '#6b4c2d' },
  [T.FLOWERS]:  { walk: true,  speed: 1.0,  base: '#31543a' },
  [T.BUSH]:     { walk: false, speed: 0,    base: '#2d4b34' },
  [T.MARSH]:    { walk: true,  speed: 0.6,  base: '#2d3b30' },
  [T.CRYPT_FLOOR]: { walk: true, speed: 1.0, base: '#3b3742' },
  [T.RUIN]:     { walk: true,  speed: 0.88, base: '#49443b' },
  [T.ASH]:      { walk: true,  speed: 1.0,  base: '#3d3a34' }
};

export const START = { x: 44.5, y: 41.5 };
export const TEMPLE = { x: 37.5, y: 35.0 };

export const BUILDINGS = [
  { id: 'temple',  x: 34, y: 27, w: 7, h: 6, roof: '#3c5872', roofHi: '#547797', wall: '#b3a17c', accent: '#e8c86a', door: [37, 32], sign: 'TEMPLE', label: 'Temple of the Ember' },
  { id: 'smith',   x: 47, y: 28, w: 6, h: 6, roof: '#783d2f', roofHi: '#98543d', wall: '#8d7b5f', accent: '#c2703e', door: [49, 33], sign: 'FORGE', label: 'Grimbald\'s Forge' },
  { id: 'warden',  x: 53, y: 40, w: 7, h: 6, roof: '#3c5a47', roofHi: '#527a60', wall: '#9a927a', accent: '#7cc9a3', door: [56, 45], sign: 'WARDEN', label: 'Warden Hall' },
  { id: 'tavern',  x: 32, y: 41, w: 7, h: 6, roof: '#6d4b2c', roofHi: '#8c6438', wall: '#a18a63', accent: '#f0b35a', door: [35, 46], sign: 'HEARTH', label: 'The Hearth & Hare' }
];

export const NPCS = [
  {
    id: 'warden', name: 'Warden Maren', title: 'Warden of Emberhold', x: 56.5, y: 47.4,
    look: 'warden',
    palette: { o: '#17151f', h: '#365c46', H: '#5b8d6c', f: '#e4bd93', e: '#241b1d', b: '#47694f', B: '#6d9673', l: '#2b3a2f', s: '#aab7b1', S: '#dbe3d9', g: '#f2c45c', d: '#26382c' },
    lines: ['The Lowlands have been restless since the crypt-light returned.', 'Emberhold is small, but it is ours.']
  },
  {
    id: 'smith', name: 'Grimbald', title: 'Master of the Forge', x: 49.5, y: 35.2,
    look: 'smith',
    palette: { o: '#17151f', h: '#4a2f22', H: '#714a33', f: '#d9a97e', e: '#241b1d', b: '#5c3926', B: '#7d4e31', l: '#352a24', s: '#aab7b1', S: '#dbe3d9', g: '#f2c45c', d: '#3c241b' },
    lines: ['Steel remembers every hand that held it.', 'Bring me coin, not excuses.']
  },
  {
    id: 'priest', name: 'Alaric', title: 'Keeper of the Ember', x: 37.5, y: 34.2,
    look: 'priest',
    palette: { o: '#17151f', h: '#d8d3c5', H: '#f4efe0', f: '#e4bd93', e: '#241b1d', b: '#5a6d7e', B: '#7f94a4', l: '#3a4048', s: '#aab7b1', S: '#dbe3d9', g: '#f2c45c', d: '#424b54' },
    lines: ['The ember does not judge. It only waits.', 'Rest here. The road is long.']
  },
  {
    id: 'cook', name: 'Bramble', title: 'Keeper of the Hearth', x: 35.5, y: 48.0,
    look: 'cook',
    palette: { o: '#17151f', h: '#e7dfcb', H: '#fff8e8', f: '#e0ae7e', e: '#241b1d', b: '#7c4b2c', B: '#a56b3e', l: '#3c2b22', s: '#aab7b1', S: '#dbe3d9', g: '#f2c45c', d: '#4b3021' },
    lines: ['Sit. Eat. The mire can wait an hour.', 'A full belly is a kind of armor.']
  }
];

export const MONSTER_TYPES = {
  rat: {
    id: 'rat', name: 'Mire Rat', hp: 24, dmg: 3, speed: 34, xp: 16,
    aggro: 86, range: 13, interval: 1.05, radius: 5.5, sprite: 'rat', scale: 1,
    gold: [1, 4], potion: 0.05, gear: 0.045, respawn: 20,
    flavor: 'quick, dirty, and always hungry'
  },
  slime: {
    id: 'slime', name: 'Bog Slime', hp: 42, dmg: 4, speed: 23, xp: 24,
    aggro: 76, range: 14, interval: 1.2, radius: 6, sprite: 'slime', scale: 1,
    gold: [2, 6], potion: 0.07, gear: 0.06, respawn: 24,
    flavor: 'a wet sound, then a burning cuff'
  },
  wolf: {
    id: 'wolf', name: 'Mire Wolf', hp: 68, dmg: 7, speed: 52, xp: 44,
    aggro: 120, range: 15, interval: 0.95, radius: 7, sprite: 'wolf', scale: 1.05,
    gold: [4, 10], potion: 0.09, gear: 0.09, respawn: 28,
    flavor: 'lean, grey, and faster than the wind'
  },
  skeleton: {
    id: 'skeleton', name: 'Crypt Husk', hp: 92, dmg: 10, speed: 38, xp: 62,
    aggro: 108, range: 15, interval: 1.15, radius: 6, sprite: 'skeleton', scale: 1,
    gold: [6, 14], potion: 0.1, gear: 0.12, respawn: 32,
    flavor: 'old bone held together by older spite'
  },
  boss: {
    id: 'boss', name: 'The Ember Warden', hp: 480, dmg: 16, speed: 31, xp: 420,
    aggro: 150, range: 20, interval: 1.35, radius: 11, sprite: 'boss', scale: 1.55,
    gold: [80, 140], potion: 0.5, gear: 1, respawn: 120, boss: true,
    flavor: 'the crypt-light took a shape and kept it'
  }
};

export const SPAWNS = [
  // Root cellar / east road
  ['rat', 66, 42], ['rat', 69, 42], ['rat', 72, 43], ['rat', 67, 46],
  ['rat', 71, 46], ['rat', 70, 40], ['rat', 64, 44], ['rat', 74, 44],
  // Stillwater lake
  ['slime', 22, 45], ['slime', 8, 55], ['slime', 24, 59], ['slime', 28, 58], ['slime', 26, 55],
  // The Mire
  ['wolf', 40, 56], ['wolf', 47, 59], ['wolf', 55, 55], ['wolf', 52, 63],
  ['wolf', 38, 62], ['wolf', 58, 60], ['wolf', 44, 60],
  // Sunken Crypt
  ['skeleton', 70, 13], ['skeleton', 76, 11], ['skeleton', 74, 19],
  ['skeleton', 79, 21], ['skeleton', 69, 21], ['skeleton', 80, 15],
  ['boss', 77, 14]
];

export const QUESTS = {
  rats: {
    id: 'rats', title: 'Root Cellar Rats', giver: 'warden', monster: 'rat', need: 6,
    target: { x: 69, y: 44 }, next: 'wolves',
    objective: 'Clear 6 mire rats from the root cellar, east of Emberhold.',
    intro: 'Mire rats have burrowed into the old root cellar east of the gate. Six of them, maybe more. Clear them out before they spoil the last of the winter stores.',
    active: 'The root cellar lies just south of the east road. Follow the gold arrow. Six rats, wanderer.',
    ready: 'The cellar is quiet again. You have Emberhold\'s thanks — and a blade to show for it.',
    done: 'The grain is safe. That is worth more than glory.',
    rewardGold: 60,
    rewardGear: { kind: 'weapon', name: 'Iron Fang', rarity: 'uncommon', atk: 6 }
  },
  wolves: {
    id: 'wolves', title: 'Wolves at the Mire', giver: 'warden', monster: 'wolf', need: 5,
    target: { x: 48, y: 59 }, next: 'boss',
    objective: 'Thin the mire wolf pack in the southern wetlands.',
    intro: 'The mire wolves have come north with the wet season. Five of them would break the herd. Five is enough. Go south, past the gate, into the reeds.',
    active: 'South, into the mire. The wolves run in the wet ground — keep your feet and your temper.',
    ready: 'Five wolves. The herders will sleep easier. Take this vest; the hide came from the last one you dropped.',
    done: 'The mire is quieter. Not silent — never silent — but quieter.',
    rewardGold: 120,
    rewardGear: { kind: 'armor', name: 'Wolfhide Vest', rarity: 'uncommon', def: 4 }
  },
  boss: {
    id: 'boss', title: 'The Ember Warden', giver: 'warden', monster: 'boss', need: 1,
    target: { x: 77, y: 14 }, next: null, final: true,
    objective: 'Enter the Sunken Crypt in the north-east and break the Ember Warden.',
    intro: 'The crypt-light has taken a shape. It calls itself the Ember Warden. It is old, and it is waking. I cannot order you into that dark, but I can ask. End it.',
    active: 'North-east, through the old gate and up the broken road. The Sunken Crypt waits. Bring potions.',
    ready: 'It is done. The crypt-light is out. Emberhold owes you a debt we cannot pay.',
    done: 'The crypt is silent. That is the best song it has ever sung.',
    rewardGold: 250,
    rewardGear: { kind: 'weapon', name: 'Emberheart Blade', rarity: 'epic', atk: 14 }
  }
};

export const QUEST_ORDER = ['rats', 'wolves', 'boss'];

export const RARITIES = [
  { id: 'common',    name: 'Common',    mult: 1.00, color: '#d4d8dc', weight: 62 },
  { id: 'uncommon',  name: 'Uncommon',  mult: 1.12, color: '#57e08a', weight: 22 },
  { id: 'rare',      name: 'Rare',      mult: 1.28, color: '#59a8ff', weight: 10 },
  { id: 'epic',      name: 'Epic',      mult: 1.55, color: '#c183ff', weight: 5 },
  { id: 'legendary', name: 'Legendary', mult: 2.00, color: '#ffa94d', weight: 1 }
];

export const WEAPON_NAMES = [
  'Rusty Shortsword', 'Mirefang', 'Ashen Blade', 'Thornwood Club',
  'Grave Iron', 'Warden\'s Cleaver', 'Tidecaller', 'Emberheart Blade'
];
export const ARMOR_NAMES = [
  'Traveler\'s Cloak', 'Mireguard', 'Wolfhide Vest', 'Crypt Mail',
  'Emberweave', 'Bramble Coat', 'Warden\'s Mantle'
];

export const SMITH = {
  potionCost: 20,
  weaponBase: 45,
  weaponStep: 30,
  armorBase: 40,
  armorStep: 25,
  maxUpgrades: 5
};

export const REGEN = { hp: 0.7, mana: 2.6, combatDelay: 5 };
export const PLAYER = {
  radius: 5.5, speed: 61, attackInterval: 0.7, attackRange: 25,
  baseHp: 100, baseMana: 60, hpPerLevel: 18, manaPerLevel: 8,
  crit: 0.12, critMult: 1.8
};
export const SPELLS = {
  ember: { name: 'Ember Bolt', mana: 10, cooldown: 2.0, range: 135, speed: 290, base: 12, perLevel: 2.8 },
  mend: { name: 'Mend', mana: 18, cooldown: 5.0, base: 34, perLevel: 3.2 }
};
export const POTION = { heal: 55, max: 9 };

export const XP_FOR_LEVEL = level => Math.floor(40 + level * 24 + level * level * 6);
export const SAVE_KEY = 'arkenfall-emberlight-v1';

export function rarityById(id) {
  return RARITIES.find(r => r.id === id) || RARITIES[0];
}

export function pickRarity(random = Math.random) {
  let roll = random() * 100;
  for (const r of RARITIES) {
    roll -= r.weight;
    if (roll <= 0) return r;
  }
  return RARITIES[0];
}

export function gearPower(gear) {
  if (!gear) return 0;
  return gear.kind === 'weapon' ? gear.atk * 2 : gear.def * 3;
}
