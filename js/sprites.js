// Pixel-art caches. Everything is drawn into tiny offscreen canvases once,
// then blitted with drawImage — cheap on weak mobile GPUs.

import { NPCS } from './config.js';

const CHAR_PALETTE = {
  o: '#120f17', h: '#a55226', H: '#e08a45', f: '#e8c39e', e: '#241a1d',
  b: '#355b4c', B: '#4f8069', l: '#26352e', s: '#b9c2c7', S: '#e2e8e8',
  g: '#f2c45c', d: '#234034', w: '#f4efe0', W: '#fffaf0', r: '#d35c52'
};

const HERO_DOWN = [
  '......oooo......',
  '.....ohhhho.....',
  '....ohHHHHho....',
  '....ohffffho....',
  '....ohfeefho....',
  '....ohffffho....',
  '.....offffo.....',
  '....oobbbboo....',
  '...obbbbbbbbo...',
  '..obBbbbbbbBbo..',
  '..obbbbbbbbbbo..',
  '..obbbbbbbbbbo..',
  '..obbbbbbbbbbo..',
  '...obbbbbbbbo...',
  '....obbbbbbo....',
  '....oll..llo....',
  '....oll..llo....',
  '....oll..llo....',
  '....oo....oo....',
  '................'
];

const HERO_UP = [
  '......oooo......',
  '.....ohhhho.....',
  '....ohHHHHho....',
  '....ohhhhhho....',
  '....ohhHhhho....',
  '....ohhhhhho....',
  '.....ohhhho.....',
  '....oobbbboo....',
  '...obbbbbbbbo...',
  '..obBbbbbbbBbo..',
  '..obbbbbbbbbbo..',
  '..obbbbbbbbbbo..',
  '..obbbbbbbbbbo..',
  '...obbbbbbbbo...',
  '....obbbbbbo....',
  '....oll..llo....',
  '....oll..llo....',
  '....oll..llo....',
  '....oo....oo....',
  '................'
];

const HERO_RIGHT = [
  '......oooo......',
  '.....ohhhho.....',
  '....ohHHHHho....',
  '....ohffffho....',
  '....ohffefho....',
  '....ohffffho....',
  '.....offffo.....',
  '.....obbbbo.....',
  '....obbbbbbo....',
  '...obBbbbbbbo...',
  '...obbbbbbbbo...',
  '...obbbbbbbbo...',
  '...obbbbbbbbo...',
  '....obbbbbbo....',
  '.....obbbbo.....',
  '.....oll.lo.....',
  '.....oll.lo.....',
  '.....oll.lo.....',
  '....oo...oo.....',
  '................'
];

function legs(frame) {
  return frame === 0
    ? ['....oll..llo....', '....oll..llo....', '....oll..llo....', '....oo....oo....']
    : ['....ollo..llo...', '.....ollo.llo...', '......oo..oo....', '................'];
}

function frameOf(rows, frame) {
  return rows.slice(0, 16).concat(legs(frame));
}

const NPC_ROWS = {
  warden: HERO_DOWN,
  smith: HERO_DOWN,
  priest: HERO_DOWN,
  cook: HERO_DOWN
};

const RAT = [
  '..............',
  '.....oooo.....',
  '....orrrro....',
  '...orrrrrro...',
  '..orrrrrrrro..',
  '..oreorrrrro..',
  '..orrrrrrrro..',
  '..oRrrrrrrRo..',
  '...ooRRRRoo...',
  '....oo..oo....',
  '..............'
];

const SLIME = [
  '....oooooo....',
  '..ooggggggoo..',
  '.oggggggggggo.',
  '.oggwggwgggwo.',
  '.oggwggwgggwo.',
  '.oggggggggggo.',
  '.oggggggggggo.',
  '..oggggggggo..',
  '...ooggggoo...',
  '.....oooo.....'
];

const WOLF = [
  '..................',
  '....oooo..........',
  '...owwwwwoo.......',
  '..owwwwwwwwo......',
  '..owweowweewo.....',
  '..owwwwwwwwwwo....',
  '..owwwwwwwwwwwo...',
  '...owwwwwwwwwwo...',
  '....owwwwwwwwo....',
  '.....oww..wwo.....',
  '.....oww..wwo.....',
  '.....oo....oo.....',
  '..................'
];

const SKELETON = [
  '.....oooo.....',
  '....obbbbo....',
  '...obwbbwbo...',
  '...obbbbbbo...',
  '....obbbbo....',
  '...obbwbbbo...',
  '..obbwbbbbbo..',
  '..obbbbbbbbo..',
  '...obbbbbbo...',
  '...obbbbbbo...',
  '....obbbbo....',
  '...obbbbbbo...',
  '...ob..obbo...',
  '...ob..obbo...',
  '...ob..obbo...',
  '...oo..oo.....'
];

const BOSS = [
  '........oooooooo........',
  '......oohhhhhhhhoo......',
  '.....ohhhHHHHHHhhho.....',
  '....ohhhhssssssshhhho...',
  '....ohhssSSSSSSSsshho...',
  '....ohhsSeeesssSeeesho..',
  '....ohhsssssssssssshho..',
  '.....ohhsssssssssshho...',
  '......ohhssssssshho.....',
  '.....ooobbbbbbbbooo.....',
  '....obbbbbbbbbbbbbbo....',
  '...obBbbbbggggbbbbBbo...',
  '...obbbbbggggggbbbbbo...',
  '...obbbbggggggggbbbbo...',
  '...obbbbgggGGgggbbbbo...',
  '...obbbbggggggggbbbbo...',
  '....obbbbggggggbbbbo....',
  '.....obbbbbbbbbbbbo.....',
  '......obbbbbbbbbbo......',
  '.......obbbbbbbbo.......',
  '......oolloooollo.......',
  '......oolloooollo.......',
  '......oolloooollo.......',
  '.....oolloo.oollo.......',
  '.....ooooo..ooooo.......',
  '........................'
];

const TREE_ROWS = [
  '........oooooo..........',
  '......ooggggggoo........',
  '.....oggggggggggo.......',
  '....oggggggggggggo......',
  '...oggggggggggggggo.....',
  '...oggggggggggggggo.....',
  '...oggggggggggggggo.....',
  '....oggggggggggggo......',
  '.....oggggggggggo.......',
  '......ooggggggoo........',
  '........ooggoo..........',
  '.........oooo...........',
  '.........ottto..........',
  '.........ottto..........',
  '.........ottto..........',
  '.........ottto..........',
  '.........ottto..........',
  '..........oo............'
];

const ROCK_ROWS = [
  '.......oooooo.......',
  '.....ooggggggoo.....',
  '....oggggggggggo....',
  '...oggggggggggggo...',
  '..oggggggggggggggo..',
  '..oggggggggggggggo..',
  '..oggggggggggggggo..',
  '...oggggggggggggo...',
  '....ooggggggggoo....',
  '.......oooooo.......'
];

const BUSH_ROWS = [
  '......oooooo......',
  '....ooggggggoo....',
  '...oggggggggggo...',
  '..oggggggggggggo..',
  '..oggggggggggggo..',
  '.oggggggggggggggo.',
  '.oggggggggggggggo.',
  '..oggggggggggggo..',
  '...ooggggggggoo...',
  '.....oooooooo.....'
];

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function makeSprite(rows, palette, scale = 1) {
  const width = Math.max(...rows.map(r => r.length));
  const height = rows.length;
  const c = makeCanvas(width * scale, height * scale);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  for (let y = 0; y < height; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      const color = palette[ch];
      if (!color) continue;
      g.fillStyle = color;
      g.fillRect(x * scale, y * scale, scale, scale);
    }
  }
  return c;
}

function flip(source) {
  const c = makeCanvas(source.width, source.height);
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.translate(source.width, 0);
  g.scale(-1, 1);
  g.drawImage(source, 0, 0);
  return c;
}

function paletteFor(base, overrides) {
  return { ...CHAR_PALETTE, ...base, ...overrides };
}

const TREE_PALETTES = [
  { g: '#2f6339', G: '#3d7a45', o: '#14261a', t: '#5b3a22' },
  { g: '#2a5834', G: '#397041', o: '#122219', t: '#4d301e' },
  { g: '#356b3c', G: '#47864b', o: '#172a1c', t: '#674326' }
];

const ROCK_PALETTE = { g: '#5a5f5c', G: '#777c76', o: '#242725', t: '#4b4035' };
const BUSH_PALETTE = { g: '#315f3b', G: '#427a48', o: '#14271a' };

export function createSprites() {
  const heroPalette = paletteFor({ h: '#a55226', H: '#e08a45', b: '#355b4c', B: '#4f8069', l: '#26352e' });
  const hero = {
    down: [0, 1].map(f => makeSprite(frameOf(HERO_DOWN, f), heroPalette)),
    up: [0, 1].map(f => makeSprite(frameOf(HERO_UP, f), heroPalette)),
    right: [0, 1].map(f => makeSprite(frameOf(HERO_RIGHT, f), heroPalette))
  };
  hero.left = hero.right.map(flip);

  const npcs = {};
  for (const npc of NPCS) {
    npcs[npc.look] = makeSprite(NPC_ROWS[npc.look] || HERO_DOWN, paletteFor(npc.palette || {}));
  }

  const monsters = {
    rat: makeSprite(RAT, { o: '#1b1517', r: '#7a5a3e', R: '#4f3828', e: '#e05d5d' }),
    slime: makeSprite(SLIME, { o: '#16251f', g: '#4d8f62', G: '#75bb82', w: '#e8f7bf' }),
    wolf: makeSprite(WOLF, { o: '#1a1a20', w: '#9aa2a4', W: '#d1d6d4', e: '#ff9f43' }),
    skeleton: makeSprite(SKELETON, { o: '#19171c', b: '#b9b4a6', w: '#f1e8d0' }),
    boss: makeSprite(BOSS, { o: '#160f17', h: '#5d2c2c', H: '#8f453a', s: '#6d6b73', S: '#b7b4bd', e: '#ffb347', b: '#352c3a', B: '#4d4058', g: '#d66b2d', G: '#ffd27a', l: '#24202b' })
  };

  const trees = TREE_PALETTES.map(p => makeSprite(TREE_ROWS, p));
  const rocks = [makeSprite(ROCK_ROWS, ROCK_PALETTE), makeSprite(ROCK_ROWS, { ...ROCK_PALETTE, g: '#4d5250', G: '#686d68' })];
  const bush = makeSprite(BUSH_ROWS, BUSH_PALETTE);

  return { hero, npcs, monsters, trees, rocks, bush };
}

// Look up an NPC sprite by id, falling back to the player's silhouette.
export function npcSprite(sprites, npc) {
  return sprites.npcs[npc.look] || sprites.hero.down[0];
}
