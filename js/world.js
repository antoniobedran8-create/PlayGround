// Deterministic map generation + one-time static terrain bake.
// The whole overworld is rendered once into an offscreen canvas, so the
// per-frame cost is a single crop blit plus entities.

import { TILE, MAP_W, MAP_H, T, TILE_DEFS, BUILDINGS, NPCS, SPAWNS, START, TEMPLE } from './config.js';

const SIZE = MAP_W * MAP_H;
const idx = (x, y) => y * MAP_W + x;
const inMap = (x, y) => x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;

function hash(x, y, seed = 0) {
  let h = (x * 374761393 + y * 668265263 + seed * 69069) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return ((h >>> 0) / 4294967296);
}

function smooth(t) { return t * t * (3 - 2 * t); }

function noise(x, y, scale, seed) {
  const fx = x / scale;
  const fy = y / scale;
  const x0 = Math.floor(fx), y0 = Math.floor(fy);
  const tx = smooth(fx - x0), ty = smooth(fy - y0);
  const a = hash(x0, y0, seed);
  const b = hash(x0 + 1, y0, seed);
  const c = hash(x0, y0 + 1, seed);
  const d = hash(x0 + 1, y0 + 1, seed);
  return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * ty;
}

function inside(r, x, y) {
  return x >= r.x && y >= r.y && x < r.x + r.w && y < r.y + r.h;
}

const PROTECTED = [
  { x: 27, y: 23, w: 36, h: 28 },   // town + wall
  { x: 3, y: 35, w: 84, h: 5 },     // east-west road
  { x: 41, y: 49, w: 5, h: 19 },    // south road
  { x: 70, y: 7, w: 5, h: 32 },     // crypt approach
  { x: 19, y: 38, w: 4, h: 10 },    // lake path
  { x: 64, y: 38, w: 5, h: 11 },    // cellar path
  { x: 65, y: 40, w: 9, h: 9 },     // cellar yard
  { x: 66, y: 7, w: 18, h: 20 },    // crypt
  { x: 30, y: 52, w: 33, h: 15 }    // mire clearings
];

export class World {
  constructor() {
    this.tiles = new Uint8Array(SIZE);
    this.buildingMask = new Uint8Array(SIZE);
    this.wellTiles = new Set(['47,38', '48,38', '47,39', '48,39']);
    this.torches = [];
    this.campfires = [];
    this.signposts = [];
    this.deadTrees = [];
    this.reeds = [];
    this.cryptBones = [];
    this.bg = null;
    this.generate();
  }

  get(x, y) {
    return inMap(x, y) ? this.tiles[idx(x, y)] : T.ROCK;
  }

  set(x, y, tile) {
    if (inMap(x, y)) this.tiles[idx(x, y)] = tile;
  }

  fillRect(x, y, w, h, tile) {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) this.set(xx, yy, tile);
    }
  }

  isBuilding(x, y) {
    return inMap(x, y) && this.buildingMask[idx(x, y)] === 1;
  }

  isProtected(x, y) {
    for (const r of PROTECTED) if (inside(r, x, y)) return true;
    return false;
  }

  generate() {
    // 1. Meadow base.
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const n = noise(x, y, 9, 1);
        this.set(x, y, (n > 0.52 ? T.GRASS2 : T.GRASS));
      }
    }

    // 2. Hard border of old rock.
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        if (x < 2 || y < 2 || x > MAP_W - 3 || y > MAP_H - 3) this.set(x, y, T.ROCK);
      }
    }

    // 3. Stillwater lake (south-west).
    for (let y = 36; y < MAP_H - 2; y++) {
      for (let x = 3; x < 33; x++) {
        const dx = (x - 18) / 9.5;
        const dy = (y - 52) / 7.5;
        const d = dx * dx + dy * dy + (hash(x, y, 8) - 0.5) * 0.18;
        if (d < 1) this.set(x, y, T.WATER);
        else if (d < 1.32) this.set(x, y, T.SAND);
      }
    }

    // 4. The Mire (south).
    for (let y = 52; y < MAP_H - 2; y++) {
      for (let x = 30; x < 64; x++) {
        const n = noise(x, y, 5, 4);
        if (n > 0.61) this.set(x, y, T.MUD);
        else if (n > 0.55) this.set(x, y, T.MARSH);
        else if (n < 0.27 && hash(x, y, 9) > 0.6) this.set(x, y, T.WATER);
      }
    }

    // 5. Town floor and wall.
    this.fillRect(29, 25, 32, 24, T.COBBLE);
    for (let x = 28; x <= 61; x++) {
      this.set(x, 24, T.WALL);
      if (x >= 42 && x <= 44) continue;
      this.set(x, 49, T.WALL);
    }
    for (let y = 24; y <= 49; y++) {
      if (y >= 36 && y <= 38) continue;
      this.set(28, y, T.WALL);
      this.set(61, y, T.WALL);
    }

    // 6. Buildings block their footprints.
    for (const b of BUILDINGS) {
      for (let y = b.y; y < b.y + b.h; y++) {
        for (let x = b.x; x < b.x + b.w; x++) {
          this.set(x, y, T.WALL);
          if (inMap(x, y)) this.buildingMask[idx(x, y)] = 1;
        }
      }
    }

    // 7. Roads, paths, bridges.
    this.fillRect(3, 36, 25, 3, T.COBBLE);
    this.fillRect(62, 36, 22, 3, T.COBBLE);
    this.fillRect(42, 50, 3, 16, T.COBBLE);
    this.fillRect(20, 39, 2, 7, T.DIRT);
    this.fillRect(66, 39, 2, 3, T.DIRT);
    this.fillRect(71, 25, 3, 12, T.DIRT);
    // A small wooden crossing over the mire stream.
    this.fillRect(42, 56, 3, 2, T.BRIDGE);

    // 8. Cellar yard and ruin walls.
    this.fillRect(66, 40, 7, 8, T.RUIN);
    this.fillRect(66, 40, 7, 1, T.WALL);
    this.fillRect(72, 40, 1, 8, T.WALL);
    this.fillRect(66, 47, 7, 1, T.WALL);
    this.set(66, 43, T.RUIN); this.set(66, 44, T.RUIN); this.set(66, 45, T.RUIN);
    this.set(66, 40, T.WALL); this.set(72, 46, T.WALL);

    // 9. Sunken Crypt shell.
    for (let y = 8; y <= 25; y++) {
      for (let x = 67; x <= 82; x++) {
        const edge = x === 67 || x === 82 || y === 8 || y === 25;
        this.set(x, y, edge ? T.CRYPT_WALL : T.CRYPT_FLOOR);
      }
    }
    this.set(72, 25, T.CRYPT_FLOOR);
    this.set(73, 25, T.CRYPT_FLOOR);
    // pillars
    for (const [x, y] of [[70, 12], [75, 12], [70, 20], [79, 20]]) {
      this.set(x, y, T.CRYPT_WALL);
      this.set(x + 1, y, T.CRYPT_WALL);
    }
    // entrance corridor from the south path
    this.fillRect(71, 24, 3, 3, T.CRYPT_FLOOR);
    this.set(72, 26, T.DIRT); this.set(73, 26, T.DIRT);

    // 10. Town well (2x2 blocked).
    for (const key of this.wellTiles) {
      const [x, y] = key.split(',').map(Number);
      this.set(x, y, T.WALL);
    }

    // 11. Forest, rocks, flowers, bushes.
    for (let y = 2; y < MAP_H - 2; y++) {
      for (let x = 2; x < MAP_W - 2; x++) {
        const tile = this.get(x, y);
        if (tile !== T.GRASS && tile !== T.GRASS2) continue;
        if (this.isProtected(x, y) || this.nearSpawn(x, y)) continue;
        const forest = noise(x, y, 7, 2) * 0.64 + noise(x, y, 2.7, 3) * 0.36;
        const h = hash(x, y, 11);
        if (forest > 0.63 && h > 0.28) {
          this.set(x, y, T.TREE);
        } else if (forest > 0.74 && h > 0.44) {
          this.set(x, y, T.ROCK);
        } else if (h > 0.92) {
          this.set(x, y, T.BUSH);
        } else if (h > 0.8) {
          this.set(x, y, T.FLOWERS);
        }
      }
    }

    // 12. Guarantee walkable pockets around every spawn and NPC.
    for (const [type, x, y] of SPAWNS) this.clearCircle(x, y, type === 'boss' ? 2 : 1.5);
    for (const n of NPCS) this.clearCircle(Math.round(n.x), Math.round(n.y), 1.4);
    this.clearCircle(Math.round(START.x), Math.round(START.y), 2.2);
    this.clearCircle(Math.round(TEMPLE.x), Math.round(TEMPLE.y), 1.5);

    // 13. If randomness blocked an essential pocket, carve a corridor.
    this.ensureReachable();

    // 14. Register props on top of the bake.
    this.torches = [
      { x: 68.5, y: 9.5 }, { x: 80.5, y: 9.5 },
      { x: 68.5, y: 23.5 }, { x: 80.5, y: 23.5 },
      { x: 72.5, y: 9.5 }
    ];
    this.campfires = [
      { x: 46.5 * TILE, y: 45.5 * TILE },
      { x: 69.5 * TILE, y: 12.5 * TILE }
    ];
    this.signposts = [
      { x: 43.5 * TILE, y: 50.2 * TILE, text: 'SOUTH — THE MIRE' },
      { x: 65.4 * TILE, y: 39.3 * TILE, text: 'ROOT CELLAR' },
      { x: 71.4 * TILE, y: 27.2 * TILE, text: 'SUNKEN CRYPT' },
      { x: 27.2 * TILE, y: 39.2 * TILE, text: 'WEST — STILLWATER' }
    ];
    this.deadTrees = [];
    for (let i = 0; i < 18; i++) {
      const x = 31 + Math.floor(hash(i, 2, 21) * 31);
      const y = 53 + Math.floor(hash(i, 3, 22) * 13);
      if (this.get(x, y) === T.MUD || this.get(x, y) === T.MARSH) {
        this.deadTrees.push({ x: x * TILE + 8, y: y * TILE + 14 });
      }
    }
    this.reeds = [];
    for (let i = 0; i < 44; i++) {
      const x = 4 + Math.floor(hash(i, 5, 31) * 28);
      const y = 40 + Math.floor(hash(i, 6, 32) * 24);
      if (this.get(x, y) === T.SAND || this.get(x, y) === T.MARSH) {
        this.reeds.push({ x: x * TILE + 4 + hash(i, 7, 33) * 8, y: y * TILE + 10 });
      }
    }
    this.cryptBones = [];
    for (let i = 0; i < 14; i++) {
      const x = 68 + Math.floor(hash(i, 8, 41) * 14);
      const y = 9 + Math.floor(hash(i, 9, 42) * 15);
      if (this.get(x, y) === T.CRYPT_FLOOR) this.cryptBones.push({ x: x * TILE + 8, y: y * TILE + 8 });
    }
  }

  nearSpawn(x, y) {
    for (const [, sx, sy] of SPAWNS) {
      if (Math.abs(sx - x) <= 2 && Math.abs(sy - y) <= 2) return true;
    }
    return false;
  }

  clearCircle(cx, cy, r) {
    const r2 = r * r;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 > r2) continue;
        const t = this.get(x, y);
        if (t === T.TREE || t === T.ROCK || t === T.BUSH) this.set(x, y, T.GRASS);
      }
    }
  }

  ensureReachable() {
    const start = [Math.round(START.x), Math.round(START.y)];
    const points = [
      ...NPCS.map(n => [Math.round(n.x), Math.round(n.y)]),
      ...SPAWNS.map(([, x, y]) => [x, y]),
      [69, 44], [48, 59], [77, 14], [37, 35]
    ];
    let reach = this.reachableFrom(start);
    for (const [x, y] of points) {
      if (!inMap(x, y) || reach[y * MAP_W + x]) continue;
      this.carve(start[0], start[1], x, y);
      reach = this.reachableFrom(start);
    }
  }

  reachableFrom([sx, sy]) {
    const seen = new Uint8Array(SIZE);
    const q = [sy * MAP_W + sx];
    seen[q[0]] = 1;
    while (q.length) {
      const n = q.pop();
      const x = n % MAP_W, y = (n / MAP_W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (!inMap(nx, ny)) continue;
        const ni = ny * MAP_W + nx;
        if (seen[ni]) continue;
        const def = TILE_DEFS[this.tiles[ni]];
        if (!def || !def.walk) continue;
        seen[ni] = 1;
        q.push(ni);
      }
    }
    return seen;
  }

  carve(x0, y0, x1, y1) {
    let x = x0, y = y0;
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    while (true) {
      const t = this.get(x, y);
      if (t === T.WATER) this.set(x, y, T.BRIDGE);
      else if (t === T.CRYPT_WALL) this.set(x, y, T.CRYPT_FLOOR);
      else if (t === T.WALL) this.set(x, y, T.COBBLE);
      else if (t === T.TREE || t === T.ROCK || t === T.BUSH) this.set(x, y, T.GRASS);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
  }

  walkableAt(tx, ty) {
    const def = TILE_DEFS[this.get(tx, ty)];
    return Boolean(def && def.walk);
  }

  canStand(x, y, radius) {
    if (x - radius < TILE || y - radius < TILE || x + radius > MAP_W * TILE - TILE || y + radius > MAP_H * TILE - TILE) return false;
    const minX = Math.floor((x - radius) / TILE), maxX = Math.floor((x + radius) / TILE);
    const minY = Math.floor((y - radius) / TILE), maxY = Math.floor((y + radius) / TILE);
    for (let ty = minY; ty <= maxY; ty++) {
      for (let tx = minX; tx <= maxX; tx++) {
        if (!this.walkableAt(tx, ty)) return false;
      }
    }
    return true;
  }

  speedAt(x, y) {
    const def = TILE_DEFS[this.get(Math.floor(x / TILE), Math.floor(y / TILE))];
    return def && def.walk ? def.speed : 1;
  }

  zoneAt(x, y) {
    const tx = x / TILE, ty = y / TILE;
    if (tx >= 66 && ty <= 26) return 'Sunken Crypt';
    if (tx >= 28 && tx <= 61 && ty >= 24 && ty <= 50) return 'Emberhold';
    if (ty >= 51 && tx >= 30 && tx <= 64) return 'The Mire';
    if (tx <= 31 && ty >= 39) return 'Stillwater';
    return 'The Lowlands';
  }

  // ---------- static bake ----------
  bake(sprites) {
    const c = document.createElement('canvas');
    c.width = MAP_W * TILE;
    c.height = MAP_H * TILE;
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;

    // Ground pass.
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const t = this.get(x, y);
        if (t === T.TREE || t === T.BUSH || t === T.ROCK) {
          this.drawGround(g, x, y, T.GRASS2);
        } else {
          this.drawGround(g, x, y, t);
        }
      }
    }

    // Buildings.
    for (const b of BUILDINGS) this.drawBuilding(g, b);

    // Trees, rocks, bushes (sorted so canopies layer naturally).
    const props = [];
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const t = this.get(x, y);
        if (t === T.TREE || t === T.ROCK || t === T.BUSH) props.push({ x, y, t });
      }
    }
    props.sort((a, b) => a.y - b.y || a.x - b.x);
    for (const p of props) {
      const px = p.x * TILE + 8;
      const py = p.y * TILE + 14;
      g.fillStyle = 'rgba(3,8,6,.24)';
      g.beginPath();
      g.ellipse(px, p.y * TILE + 13, p.t === T.TREE ? 9 : 7, 2.6, 0, 0, Math.PI * 2);
      g.fill();
      if (p.t === T.TREE) {
        const spr = sprites.trees[(p.x * 7 + p.y * 13) % sprites.trees.length];
        g.drawImage(spr, px - spr.width / 2, py - spr.height + 2);
      } else if (p.t === T.ROCK) {
        const spr = sprites.rocks[(p.x + p.y) % sprites.rocks.length];
        g.drawImage(spr, px - spr.width / 2, py - spr.height + 3);
      } else {
        g.drawImage(sprites.bush, px - sprites.bush.width / 2, py - sprites.bush.height + 2);
      }
    }

    // Well.
    this.drawWell(g, 47.5 * TILE, 38.5 * TILE);

    // Signs.
    for (const s of this.signposts) this.drawSign(g, s);

    // Campfire bases.
    for (const f of this.campfires) this.drawCampfireBase(g, f);

    // Crypt torch brackets, bones, dead trees, reeds.
    for (const t of this.torches) this.drawTorchBracket(g, t);
    for (const b of this.cryptBones) this.drawBone(g, b);
    for (const d of this.deadTrees) this.drawDeadTree(g, d);
    for (const r of this.reeds) this.drawReed(g, r);

    // Town details: cobble edge outline, market cloth, flower boxes.
    this.drawTownTrim(g);
    this.bg = c;
    return c;
  }

  drawGround(g, x, y, t) {
    const px = x * TILE, py = y * TILE;
    const h = hash(x, y, 50);
    const def = TILE_DEFS[t] || TILE_DEFS[T.GRASS];
    const base = def.base;
    g.fillStyle = base;
    g.fillRect(px, py, TILE, TILE);
    const dark = 'rgba(0,0,0,.12)', light = 'rgba(255,255,255,.055)';

    if (t === T.GRASS || t === T.GRASS2 || t === T.FLOWERS) {
      if (h > 0.34) {
        g.fillStyle = h > 0.68 ? '#3a6242' : '#27442e';
        g.fillRect(px + 2 + (h * 7 | 0), py + 4 + (h * 8 | 0), 1, 3);
        g.fillRect(px + 11 - (h * 4 | 0), py + 2 + (h * 5 | 0), 1, 2);
      }
      if (t === T.FLOWERS) {
        const colors = ['#f2c45c', '#e88a8a', '#9fc8ff', '#f4efe0'];
        g.fillStyle = colors[(x + y) % colors.length];
        g.fillRect(px + 4, py + 5, 2, 2);
        g.fillRect(px + 10, py + 10, 2, 2);
        g.fillStyle = '#e8d48a';
        g.fillRect(px + 5, py + 6, 1, 1);
      }
    } else if (t === T.COBBLE) {
      g.fillStyle = dark;
      for (let i = 0; i < 3; i++) {
        const ox = (hash(x + i, y, 51) * 12) | 0;
        const oy = (hash(x, y + i, 52) * 12) | 0;
        g.fillRect(px + ox, py + oy, 4, 1);
        g.fillRect(px + oy, py + ox, 1, 4);
      }
      if (h > 0.8) { g.fillStyle = light; g.fillRect(px + 3, py + 3, 3, 1); }
    } else if (t === T.DIRT || t === T.RUIN) {
      g.fillStyle = dark;
      for (let i = 0; i < 4; i++) {
        g.fillRect(px + ((hash(x + i, y, 53) * 14) | 0), py + ((hash(x, y + i, 54) * 14) | 0), 2, 1);
      }
      if (h > 0.86) { g.fillStyle = '#6b5c45'; g.fillRect(px + 6, py + 9, 3, 2); }
    } else if (t === T.WATER) {
      g.fillStyle = '#1d5260';
      g.fillRect(px + 2, py + 4, 6, 1);
      g.fillRect(px + 9, py + 11, 4, 1);
      // shoreline
      g.fillStyle = 'rgba(179,154,102,.5)';
      if (this.get(x, y - 1) !== T.WATER) g.fillRect(px, py, TILE, 1);
      if (this.get(x, y + 1) !== T.WATER) g.fillRect(px, py + TILE - 1, TILE, 1);
      if (this.get(x - 1, y) !== T.WATER) g.fillRect(px, py, 1, TILE);
      if (this.get(x + 1, y) !== T.WATER) g.fillRect(px + TILE - 1, py, 1, TILE);
    } else if (t === T.SAND) {
      g.fillStyle = 'rgba(90,70,40,.28)';
      g.fillRect(px + 3, py + 5, 1, 1);
      g.fillRect(px + 11, py + 11, 1, 1);
      if (h > 0.9) { g.fillStyle = '#d0b97e'; g.fillRect(px + 7, py + 3, 2, 1); }
    } else if (t === T.MUD || t === T.MARSH) {
      g.fillStyle = 'rgba(20,35,28,.4)';
      g.fillRect(px + ((h * 9) | 0), py + 4, 5, 2);
      if (t === T.MARSH) {
        g.fillStyle = '#496b4a';
        g.fillRect(px + 3, py + 7, 1, 4);
        g.fillRect(px + 11, py + 4, 1, 5);
        g.fillStyle = '#6b8a5f';
        g.fillRect(px + 2, py + 6, 3, 1);
      }
    } else if (t === T.CRYPT_FLOOR) {
      g.fillStyle = '#332f3a';
      g.fillRect(px, py + 7, TILE, 1);
      g.fillRect(px + (h > 0.5 ? 7 : 11), py, 1, TILE);
      if (h > 0.82) {
        g.fillStyle = '#24212b';
        g.fillRect(px + 4, py + 11, 6, 1);
        g.fillRect(px + 10, py + 4, 1, 4);
      }
      if (h > 0.94) { g.fillStyle = '#4b4452'; g.fillRect(px + 8, py + 3, 2, 2); }
    } else if (t === T.CRYPT_WALL) {
      g.fillStyle = '#1d1b24';
      g.fillRect(px, py, TILE, TILE);
      g.fillStyle = '#35313e';
      g.fillRect(px + 1, py + 1, 6, 6);
      g.fillRect(px + 9, py + 1, 6, 6);
      g.fillRect(px + 1, py + 9, 6, 6);
      g.fillRect(px + 9, py + 9, 6, 6);
      g.fillStyle = '#474250';
      g.fillRect(px + 1, py + 1, 6, 1);
      g.fillRect(px + 9, py + 1, 6, 1);
      if (h > 0.8) { g.fillStyle = '#16141b'; g.fillRect(px + 4, py + 3, 3, 1); }
    } else if (t === T.WALL) {
      if (this.isBuilding(x, y) || this.wellTiles.has(`${x},${y}`)) {
        // Covered by the building/well art.
      } else {
        const top = this.get(x, y - 1) !== T.WALL;
        g.fillStyle = '#34383a';
        g.fillRect(px, py, TILE, TILE);
        g.fillStyle = '#5d6463';
        g.fillRect(px + 1, py + (top ? 2 : 0), TILE - 2, TILE - 3);
        g.fillStyle = '#7d8581';
        g.fillRect(px + 1, py + (top ? 2 : 0), TILE - 2, 2);
        g.fillStyle = '#454b4b';
        g.fillRect(px + 5, py + 5, 1, 8);
        g.fillRect(px + 11, py + 3, 1, 10);
        g.fillRect(px + 1, py + (top ? 9 : 7), 14, 1);
      }
    } else if (t === T.BRIDGE) {
      g.fillStyle = '#4a321e';
      g.fillRect(px, py, TILE, TILE);
      g.fillStyle = '#7a5330';
      for (let i = 0; i < 3; i++) g.fillRect(px + 1, py + i * 5 + 1, TILE - 2, 3);
      g.fillStyle = '#2c1d12';
      g.fillRect(px + 4, py, 1, TILE);
      g.fillRect(px + 11, py, 1, TILE);
    } else if (t === T.CAVE) {
      g.fillStyle = '#2d2b27';
      g.fillRect(px + 2, py + 4, 3, 1);
      g.fillRect(px + 10, py + 10, 4, 1);
      if (h > 0.85) { g.fillStyle = '#46423a'; g.fillRect(px + 6, py + 8, 2, 2); }
    } else if (t === T.ASH) {
      g.fillStyle = 'rgba(20,18,16,.4)';
      g.fillRect(px + 4, py + 6, 7, 2);
    } else if (t === T.ROCK) {
      g.fillStyle = '#3a3f3e';
      g.fillRect(px + 2, py + 3, 11, 9);
    }
  }

  drawBuilding(g, b) {
    const px = b.x * TILE, py = b.y * TILE, w = b.w * TILE, h = b.h * TILE;
    g.fillStyle = 'rgba(3,8,6,.35)';
    g.fillRect(px + 4, py + 6, w, h);

    const roofH = h - 14;
    const grad = g.createLinearGradient(px, py, px, py + roofH);
    grad.addColorStop(0, b.roofHi);
    grad.addColorStop(1, b.roof);
    g.fillStyle = grad;
    g.fillRect(px - 2, py - 3, w + 4, roofH + 3);
    g.strokeStyle = 'rgba(18,15,20,.65)';
    g.lineWidth = 2;
    g.strokeRect(px - 2, py - 3, w + 4, roofH + 3);

    // shingles
    g.fillStyle = 'rgba(255,255,255,.055)';
    for (let yy = py + 2; yy < py + roofH; yy += 5) g.fillRect(px, yy, w, 1);
    g.fillStyle = 'rgba(0,0,0,.13)';
    for (let yy = py + 5; yy < py + roofH; yy += 5) g.fillRect(px, yy, w, 1);
    g.fillStyle = 'rgba(0,0,0,.3)';
    g.fillRect(px + w / 2 - 1, py - 2, 2, roofH + 2);

    // chimney
    g.fillStyle = '#39322e';
    g.fillRect(px + w * 0.68, py - 8, 7, 12);
    g.fillStyle = '#5b5047';
    g.fillRect(px + w * 0.68, py - 8, 7, 3);

    // front wall and door
    const wallY = py + h - 14;
    g.fillStyle = b.wall;
    g.fillRect(px, wallY, w, 14);
    g.fillStyle = 'rgba(30,24,20,.35)';
    g.fillRect(px, wallY, w, 2);
    const doorX = px + (b.door[0] - b.x) * TILE + 4;
    g.fillStyle = '#2a1c14';
    g.fillRect(doorX, py + h - 15, 8, 15);
    g.fillStyle = b.accent;
    g.fillRect(doorX + 5, py + h - 8, 1, 1);
    // windows
    g.fillStyle = 'rgba(255,190,96,.65)';
    g.fillRect(px + 7, wallY + 4, 4, 4);
    g.fillRect(px + w - 11, wallY + 4, 4, 4);
    g.fillStyle = 'rgba(30,20,10,.6)';
    g.fillRect(px + 8, wallY + 4, 1, 4);
    g.fillRect(px + w - 10, wallY + 4, 1, 4);

    // sign board
    g.fillStyle = '#4a3422';
    g.fillRect(px + w / 2 - 13, py + h - 20, 26, 8);
    g.strokeStyle = '#2b1d13';
    g.strokeRect(px + w / 2 - 13, py + h - 20, 26, 8);
    g.fillStyle = b.accent;
    g.font = 'bold 5px monospace';
    g.textAlign = 'center';
    g.fillText(b.sign, px + w / 2, py + h - 14);

    // roof crest
    g.fillStyle = b.accent;
    g.beginPath();
    g.arc(px + w / 2, py + roofH * 0.48, 4, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(20,15,12,.55)';
    g.beginPath();
    g.arc(px + w / 2, py + roofH * 0.48, 2, 0, Math.PI * 2);
    g.fill();
  }

  drawWell(g, x, y) {
    g.fillStyle = 'rgba(0,0,0,.28)';
    g.beginPath(); g.ellipse(x, y + 7, 15, 6, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#4b4f50';
    g.beginPath(); g.ellipse(x, y, 13, 11, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#767d7b';
    g.beginPath(); g.ellipse(x, y - 1, 11, 9, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#163d46';
    g.beginPath(); g.ellipse(x, y - 1, 7, 5.5, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2b6a78';
    g.fillRect(x - 4, y - 3, 4, 1);
    g.fillStyle = '#5b3c24';
    g.fillRect(x - 13, y - 15, 3, 16);
    g.fillRect(x + 10, y - 15, 3, 16);
    g.fillStyle = '#7a5330';
    g.fillRect(x - 14, y - 17, 28, 4);
    g.fillStyle = '#3b2a1a';
    g.fillRect(x - 1, y - 13, 2, 10);
    g.fillStyle = '#c6a35c';
    g.fillRect(x - 3, y - 6, 6, 3);
  }

  drawSign(g, s) {
    g.fillStyle = 'rgba(0,0,0,.25)';
    g.beginPath(); g.ellipse(s.x, s.y + 3, 8, 2, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#4c3520';
    g.fillRect(s.x - 1, s.y - 14, 2, 17);
    g.fillStyle = '#7a5631';
    g.fillRect(s.x - 10, s.y - 17, 20, 9);
    g.strokeStyle = '#3a2716';
    g.strokeRect(s.x - 10, s.y - 17, 20, 9);
    g.fillStyle = '#d4b26a';
    g.font = '3.5px monospace';
    g.textAlign = 'center';
    g.fillText(s.text.length > 18 ? s.text.slice(0, 18) : s.text, s.x, s.y - 11);
    g.fillStyle = '#8a6a42';
    g.fillRect(s.x - 6, s.y - 18, 12, 1);
  }

  drawCampfireBase(g, f) {
    g.fillStyle = 'rgba(0,0,0,.28)';
    g.beginPath(); g.ellipse(f.x, f.y + 3, 13, 5, 0, 0, Math.PI * 2); g.fill();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.fillStyle = i % 2 ? '#5b5f5c' : '#424745';
      g.beginPath();
      g.ellipse(f.x + Math.cos(a) * 11, f.y + Math.sin(a) * 6, 3.4, 2.4, a, 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = '#4a2f1b';
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(f.x - 7, f.y + 2); g.lineTo(f.x + 7, f.y - 4); g.stroke();
    g.beginPath(); g.moveTo(f.x - 7, f.y - 4); g.lineTo(f.x + 7, f.y + 2); g.stroke();
    g.fillStyle = '#2b1b11';
    g.fillRect(f.x - 3, f.y - 2, 6, 3);
  }

  drawTorchBracket(g, t) {
    const x = t.x * TILE, y = t.y * TILE;
    g.fillStyle = '#2a2520';
    g.fillRect(x - 2, y + 4, 4, 9);
    g.fillStyle = '#6d5130';
    g.fillRect(x - 1, y + 2, 2, 4);
  }

  drawBone(g, b) {
    g.fillStyle = '#c9c0aa';
    g.fillRect(b.x - 4, b.y + 1, 5, 1);
    g.fillRect(b.x + 1, b.y - 2, 1, 5);
    g.fillStyle = '#8e8777';
    g.fillRect(b.x - 2, b.y + 3, 3, 1);
  }

  drawDeadTree(g, d) {
    g.strokeStyle = '#3a3028';
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(d.x, d.y); g.lineTo(d.x - 2, d.y - 18); g.stroke();
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(d.x - 2, d.y - 10); g.lineTo(d.x - 9, d.y - 16); g.stroke();
    g.beginPath(); g.moveTo(d.x - 2, d.y - 13); g.lineTo(d.x + 5, d.y - 20); g.stroke();
    g.beginPath(); g.moveTo(d.x - 2, d.y - 7); g.lineTo(d.x + 7, d.y - 10); g.stroke();
  }

  drawReed(g, r) {
    g.strokeStyle = '#5d7d4e';
    g.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.moveTo(r.x + i * 2, r.y + 4);
      g.lineTo(r.x + i * 2 - 2, r.y - 5 - i);
      g.stroke();
    }
    g.fillStyle = '#8b7a4a';
    g.fillRect(r.x + 3, r.y - 8, 2, 2);
  }

  drawTownTrim(g) {
    // Flower boxes by the temple and forge.
    for (const [x, y, color] of [
      [33.5, 33.5, '#e88a8a'], [40.5, 33.5, '#f2c45c'],
      [46.5, 34.5, '#9fc8ff'], [53.5, 35.5, '#e88a8a']
    ]) {
      g.fillStyle = '#5b3c24';
      g.fillRect(x * TILE, y * TILE, 16, 6);
      g.fillStyle = color;
      g.fillRect(x * TILE + 3, y * TILE - 2, 3, 3);
      g.fillRect(x * TILE + 9, y * TILE - 1, 3, 3);
      g.fillStyle = '#3f6b3c';
      g.fillRect(x * TILE + 4, y * TILE + 1, 1, 3);
      g.fillRect(x * TILE + 10, y * TILE + 1, 1, 2);
    }
    // banners on the warden hall
    g.fillStyle = '#2f4d3b';
    g.fillRect(54 * TILE + 3, 40 * TILE - 8, 5, 13);
    g.fillRect(57 * TILE + 8, 40 * TILE - 8, 5, 13);
    g.fillStyle = '#7cc9a3';
    g.fillRect(55 * TILE + 1, 40 * TILE - 6, 2, 4);
    g.fillRect(58 * TILE + 6, 40 * TILE - 6, 2, 4);
  }
}
