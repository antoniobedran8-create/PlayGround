// Arkenfall: Emberlight — game loop, combat, quests, UI.
// No frameworks, no network, no external assets.

import {
  TILE, MAP_W, MAP_H, START, TEMPLE as TEMPLE_POS, NPCS, MONSTER_TYPES, SPAWNS,
  QUESTS, QUEST_ORDER, RARITIES, WEAPON_NAMES, ARMOR_NAMES, SMITH,
  REGEN, PLAYER, SPELLS, POTION, XP_FOR_LEVEL, SAVE_KEY,
  rarityById, pickRarity, gearPower
} from './config.js';
import { createSprites, npcSprite } from './sprites.js';
import { World } from './world.js';
import { Sfx } from './audio.js';

const $ = id => document.getElementById(id);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const qs = new URLSearchParams(location.search);
const DEBUG = qs.has('debug') || qs.has('selftest');
const SETTINGS_KEY = `${SAVE_KEY}-settings`;

const dom = {
  game: $('game'), hud: $('hud'), levelButton: $('level-button'),
  hpFill: $('hp-fill'), hpText: $('hp-text'), mpFill: $('mp-fill'), mpText: $('mp-text'),
  xpFill: $('xp-fill'), xpText: $('xp-text'), goldText: $('gold-text'),
  questTitle: $('quest-title'), questArrow: $('quest-arrow'), questDist: $('quest-dist'),
  questObjective: $('quest-objective'), bossBar: $('boss-bar'), bossFill: $('boss-fill'),
  regionBanner: $('region-banner'), toasts: $('toasts'), levelBanner: $('level-banner'),
  interactPrompt: $('interact-prompt'), interactLabel: $('interact-label'),
  joystick: $('joystick'), joystickKnob: $('joystick-knob'),
  potionCount: $('potion-count'), fps: $('fps'),
  startScreen: $('start-screen'), play: $('btn-play'), saveSummary: $('save-summary'),
  startSettings: $('btn-start-settings'), newJourney: $('btn-new'),
  dialogue: $('dialogue'), dialogPortrait: $('dialog-portrait'), dialogTitle: $('dialog-title'),
  dialogName: $('dialog-name'), dialogText: $('dialog-text'), dialogChoices: $('dialog-choices'),
  dialogGold: $('dialog-gold'), dialogClose: $('btn-dialog-close'),
  settings: $('settings'), settingsClose: $('btn-settings-close'),
  setQuality: $('set-quality'), setFps: $('set-fps'), setSound: $('set-sound'),
  setHaptics: $('set-haptics'), setAutoattack: $('set-autoattack'), setShowfps: $('set-showfps'),
  lowend: $('btn-lowend'), reset: $('btn-reset'),
  stats: $('stats'), statsBody: $('stats-body'), statsClose: $('btn-stats-close'),
  death: $('death'), deathText: $('death-text'), respawn: $('btn-respawn'),
  victory: $('victory'), victoryStats: $('victory-stats'), victoryContinue: $('btn-victory-continue'),
  loading: $('loading'), btnSound: $('btn-sound')
};

const canvas = dom.game;
const ctx = canvas.getContext('2d', { alpha: false });
const sprites = createSprites();
const world = new World();
world.bake(sprites);
const sfx = new Sfx();

const view = { w: 1, h: 1, dpr: 1, zoom: 2, camX: 0, camY: 0 };
const QUALITY = {
  low: { scale: 0.72, particles: 14, shadows: false, extras: false, label: 'Low' },
  medium: { scale: 0.88, particles: 34, shadows: true, extras: true, label: 'Medium' },
  high: { scale: 1.0, particles: 64, shadows: true, extras: true, label: 'High' }
};

let quality = { ...QUALITY.medium };
let autoScale = 1;
const settings = Object.assign({
  quality: 'auto', fps: 30, sound: true, haptics: true,
  autoAttack: true, showFps: false, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches
}, readJSON(SETTINGS_KEY) || {});

const game = {
  scene: 'title',
  started: false,
  paused: false,
  time: 0,
  player: null,
  npcs: [],
  monsters: [],
  spawns: [],
  projectiles: [],
  particles: [],
  texts: [],
  effects: [],
  target: null,
  quests: {},
  kills: 0,
  killsByType: {},
  zone: '',
  zoneTimer: 0,
  camera: { x: 0, y: 0 },
  shake: 0,
  uiTimer: 0,
  saveTimer: 0,
  toastTimer: 0,
  dialogNpc: null,
  settingsReturn: 'title',
  bossDefeated: false,
  victoryShown: false,
  deathShown: false,
  interactNpc: null,
  targetId: null,
  monsterId: 1,
  lastCombat: -99
};

let fps = { value: 30, acc: 0, frames: 0, tick: 0 };
let perf = { avg: 16, slowFor: 0, fastFor: 0, lastAdjust: 0 };

function readJSON(key) {
  try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch { return null; }
}
function writeJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
}

function setText(el, text) {
  if (el && el.textContent !== text) el.textContent = text;
}
function setBar(el, value, max) {
  if (!el) return;
  const f = max > 0 ? clamp(value / max, 0, 1) : 0;
  el.style.transform = `scaleX(${f.toFixed(4)})`;
}

function toast(text, kind = '', ms = 2600) {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = text;
  dom.toasts.appendChild(el);
  while (dom.toasts.children.length > 4) dom.toasts.firstChild.remove();
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 240);
  }, ms);
}

function haptic(ms = 10) {
  if (settings.haptics && navigator.vibrate) {
    try { navigator.vibrate(ms); } catch { /* noop */ }
  }
}

function banner(text) {
  dom.regionBanner.textContent = text;
  dom.regionBanner.classList.add('show');
  game.zoneTimer = 1.7;
}

function playerName() {
  return game.player ? game.player.name : 'Wanderer';
}

function newPlayer() {
  return {
    name: 'Wanderer',
    x: START.x * TILE, y: START.y * TILE,
    dir: 'down', moving: false, walkTime: 0,
    hp: PLAYER.baseHp, maxHp: PLAYER.baseHp,
    mana: PLAYER.baseMana, maxMana: PLAYER.baseMana,
    level: 1, xp: 0, xpNext: XP_FOR_LEVEL(1),
    gold: 30, potions: 2, kills: 0,
    weapon: { kind: 'weapon', name: 'Rusty Shortsword', rarity: 'common', atk: 3 },
    armor: { kind: 'armor', name: "Traveler's Cloak", rarity: 'common', def: 1 },
    upgrades: { weapon: 0, armor: 0 },
    atkCd: 0, emberCd: 0, mendCd: 0,
    lunge: 0, lungeDir: { x: 0, y: 1 },
    flash: 0, invuln: 0, lastHit: -99, playTime: 0
  };
}

function newQuests() {
  const q = {};
  for (const id of QUEST_ORDER) q[id] = { state: id === 'rats' ? 'available' : 'locked', have: 0 };
  return q;
}

function resetGame() {
  game.player = newPlayer();
  game.quests = newQuests();
  game.kills = 0;
  game.killsByType = {};
  game.bossDefeated = false;
  game.victoryShown = false;
  game.deathShown = false;
  game.paused = false;
  game.projectiles.length = 0;
  game.particles.length = 0;
  game.texts.length = 0;
  game.effects.length = 0;
  game.target = null;
  game.targetId = null;
  game.lastCombat = -99;
  buildSpawns();
  game.camera.x = game.player.x;
  game.camera.y = game.player.y;
  game.zone = '';
  hideOverlays();
}

function buildSpawns() {
  game.monsters.length = 0;
  game.spawns = SPAWNS.map(([type, tx, ty]) => {
    const def = MONSTER_TYPES[type];
    const m = {
      id: game.monsterId++,
      type, def,
      x: tx * TILE + 8, y: ty * TILE + 12,
      homeX: tx * TILE + 8, homeY: ty * TILE + 12,
      hp: def.hp, maxHp: def.hp,
      dead: false, respawn: 0,
      atkCd: rand(0, 0.8), wanderT: rand(1, 4),
      wx: tx * TILE + 8, wy: ty * TILE + 12,
      hitT: 0, lunge: 0, dir: 1,
      specialCd: 3 + Math.random() * 2, telegraph: null,
      state: 'idle', boss: Boolean(def.boss)
    };
    game.monsters.push(m);
    return { type, tx, ty, monster: m };
  });
  game.target = null;
  game.targetId = null;
}

function spawnMonstersFromSave() {
  buildSpawns();
}

function currentQuestId() {
  for (const id of QUEST_ORDER) {
    const q = game.quests[id];
    if (q && (q.state === 'active' || q.state === 'ready')) return id;
  }
  for (const id of QUEST_ORDER) {
    const q = game.quests[id];
    if (q && q.state === 'available') return id;
  }
  return null;
}

function questTargetPoint(id) {
  if (!id) return null;
  const q = QUESTS[id];
  const st = game.quests[id];
  if (!q || !st) return null;
  const warden = NPCS.find(n => n.id === 'warden');
  if (st.state === 'ready' || (st.state === 'available' && q.giver === 'warden')) {
    return { x: warden.x * TILE, y: warden.y * TILE };
  }
  return { x: q.target.x * TILE + 8, y: q.target.y * TILE + 8 };
}

// ---------- persistence ----------
function serializeGame() {
  const p = game.player;
  return {
    v: 1,
    savedAt: Date.now(),
    player: {
      x: p.x, y: p.y, dir: p.dir, level: p.level, xp: p.xp, xpNext: p.xpNext,
      hp: p.hp, maxHp: p.maxHp, mana: p.mana, maxMana: p.maxMana,
      gold: p.gold, potions: p.potions, kills: p.kills,
      weapon: p.weapon, armor: p.armor, upgrades: p.upgrades,
      playTime: p.playTime
    },
    quests: game.quests,
    kills: game.kills,
    killsByType: game.killsByType,
    bossDefeated: game.bossDefeated,
    victoryShown: game.victoryShown
  };
}

function saveGame() {
  if (!game.started || !game.player) return;
  writeJSON(SAVE_KEY, serializeGame());
}

function loadSavedGame() {
  const data = readJSON(SAVE_KEY);
  if (!data || !data.player) return false;
  resetGame();
  const p = game.player;
  Object.assign(p, data.player);
  p.x = clamp(Number(p.x) || START.x * TILE, TILE, (MAP_W - 1) * TILE);
  p.y = clamp(Number(p.y) || START.y * TILE, TILE, (MAP_H - 1) * TILE);
  p.level = clamp(p.level || 1, 1, 60);
  p.maxHp = p.maxHp || PLAYER.baseHp;
  p.hp = clamp(p.hp || p.maxHp, 1, p.maxHp);
  p.mana = clamp(p.mana || p.maxMana, 0, p.maxMana);
  p.xpNext = p.xpNext || XP_FOR_LEVEL(p.level);
  p.weapon = p.weapon || { kind: 'weapon', name: 'Rusty Shortsword', rarity: 'common', atk: 3 };
  p.armor = p.armor || { kind: 'armor', name: "Traveler's Cloak", rarity: 'common', def: 1 };
  for (const id of QUEST_ORDER) {
    if (!game.quests[id]) game.quests[id] = { state: 'locked', have: 0 };
    game.quests[id].state = game.quests[id].state || 'locked';
    game.quests[id].have = Number(game.quests[id].have) || 0;
  }
  game.quests = Object.assign(newQuests(), data.quests || {});
  game.kills = data.kills || p.kills || 0;
  game.killsByType = data.killsByType || {};
  game.bossDefeated = Boolean(data.bossDefeated);
  game.victoryShown = Boolean(data.victoryShown);
  game.camera.x = p.x;
  game.camera.y = p.y;
  return true;
}

function hasSave() {
  const d = readJSON(SAVE_KEY);
  return Boolean(d && d.player);
}

function updateSaveSummary() {
  const d = readJSON(SAVE_KEY);
  if (!d || !d.player) {
    dom.saveSummary.hidden = true;
    return;
  }
  const p = d.player;
  const done = Object.values(d.quests || {}).filter(q => q.state === 'done').length;
  const mins = Math.round((p.playTime || 0) / 60);
  const time = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
  dom.saveSummary.hidden = false;
  dom.saveSummary.textContent = `Continue · Lv ${p.level || 1} ${p.name || 'Wanderer'} · ${time} · ${done}/3 quests`;
}

// ---------- input ----------
const input = {
  keys: new Set(),
  joy: { active: false, pointerId: null, dx: 0, dy: 0, mag: 0 },
  attackHeld: false,
  attackPointer: null
};

function inputVector() {
  let x = 0, y = 0;
  if (input.keys.has('ArrowLeft') || input.keys.has('KeyA')) x -= 1;
  if (input.keys.has('ArrowRight') || input.keys.has('KeyD')) x += 1;
  if (input.keys.has('ArrowUp') || input.keys.has('KeyW')) y -= 1;
  if (input.keys.has('ArrowDown') || input.keys.has('KeyS')) y += 1;
  if (input.joy.active) { x += input.joy.dx; y += input.joy.dy; }
  const mag = Math.hypot(x, y);
  if (mag > 1) { x /= mag; y /= mag; }
  return { x, y, mag: Math.min(1, mag) };
}

function setJoystick(cx, cy) {
  const rect = dom.joystick.getBoundingClientRect();
  const ox = rect.left + rect.width / 2;
  const oy = rect.top + rect.height / 2;
  let dx = (cx - ox) / (rect.width * 0.32);
  let dy = (cy - oy) / (rect.height * 0.32);
  const mag = Math.hypot(dx, dy);
  if (mag > 1) { dx /= mag; dy /= mag; }
  const dead = 0.16;
  if (Math.hypot(dx, dy) < dead) { dx = 0; dy = 0; }
  input.joy.dx = dx;
  input.joy.dy = dy;
  input.joy.mag = Math.min(1, Math.hypot(dx, dy));
  dom.joystickKnob.style.transform = `translate(${dx * rect.width * 0.3}px, ${dy * rect.height * 0.3}px)`;
}

function releaseJoystick() {
  input.joy.active = false;
  input.joy.pointerId = null;
  input.joy.dx = 0; input.joy.dy = 0; input.joy.mag = 0;
  dom.joystickKnob.style.transform = 'translate(0,0)';
}

dom.joystick.addEventListener('pointerdown', e => {
  e.preventDefault();
  input.joy.active = true;
  input.joy.pointerId = e.pointerId;
  dom.joystick.setPointerCapture(e.pointerId);
  setJoystick(e.clientX, e.clientY);
  haptic(4);
});
dom.joystick.addEventListener('pointermove', e => {
  if (!input.joy.active || e.pointerId !== input.joy.pointerId) return;
  e.preventDefault();
  setJoystick(e.clientX, e.clientY);
});
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  dom.joystick.addEventListener(ev, e => {
    if (e.pointerId === input.joy.pointerId) releaseJoystick();
  });
}

function bindHold(el, onDown, onUp) {
  el.addEventListener('pointerdown', e => {
    e.preventDefault();
    el.classList.add('down');
    try { el.setPointerCapture(e.pointerId); } catch { /* noop */ }
    onDown?.(e);
  });
  const up = e => {
    el.classList.remove('down');
    try { el.releasePointerCapture(e.pointerId); } catch { /* noop */ }
    onUp?.(e);
  };
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('lostpointercapture', up);
}

bindHold($('btn-attack'), () => {
  input.attackHeld = true;
  if (game.scene === 'play' && !game.paused) playerAttack(true);
}, () => { input.attackHeld = false; });
$('btn-ember').addEventListener('pointerdown', e => { e.preventDefault(); castEmber(); });
$('btn-mend').addEventListener('pointerdown', e => { e.preventDefault(); castMend(); });
$('btn-potion').addEventListener('pointerdown', e => { e.preventDefault(); drinkPotion(); });
dom.interactPrompt.addEventListener('pointerdown', e => e.stopPropagation());
$('btn-interact').addEventListener('click', () => { if (game.interactNpc) openDialogue(game.interactNpc.id); });

canvas.addEventListener('pointerdown', e => {
  if (game.scene !== 'play' || game.paused) return;
  const rect = canvas.getBoundingClientRect();
  const wx = view.camX + (e.clientX - rect.left) / view.zoom;
  const wy = view.camY + (e.clientY - rect.top) / view.zoom;
  const npc = nearestNpc(2.8 * TILE, wx, wy);
  if (npc) { openDialogue(npc.id); return; }
  const m = nearestMonsterAt(wx, wy, 2.2 * TILE);
  if (m) { game.target = m; game.targetId = m.id; }
});
canvas.addEventListener('contextmenu', e => e.preventDefault());

window.addEventListener('keydown', e => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
  const code = e.code;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code)) e.preventDefault();
  if (game.scene === 'title') {
    if (code === 'Enter' || code === 'Space') { e.preventDefault(); beginPlay(); }
    return;
  }
  if (game.paused) {
    if (code === 'Escape') {
      if (!dom.dialogue.hidden) closeDialogue();
      else if (!dom.settings.hidden) closeSettings();
      else if (!dom.stats.hidden) closeStats();
      else if (!dom.death.hidden) respawn();
      else if (!dom.victory.hidden) closeVictory();
    }
    if (!dom.dialogue.hidden && /^Digit[1-4]$/.test(code)) {
      const i = Number(code.slice(5)) - 1;
      dom.dialogChoices.children[i]?.click();
    }
    return;
  }
  input.keys.add(code);
  if (code === 'Space') { input.attackHeld = true; playerAttack(true); }
  if (code === 'KeyE') castEmber();
  if (code === 'KeyQ') castMend();
  if (code === 'KeyR') drinkPotion();
  if (code === 'KeyF') { if (game.interactNpc) openDialogue(game.interactNpc.id); }
  if (code === 'Escape') openSettings();
  if (code === 'KeyC') openStats();
});
window.addEventListener('keyup', e => {
  input.keys.delete(e.code);
  if (e.code === 'Space') input.attackHeld = false;
});
window.addEventListener('blur', () => {
  input.keys.clear();
  input.attackHeld = false;
  releaseJoystick();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    saveGame();
    input.keys.clear();
    input.attackHeld = false;
    releaseJoystick();
  }
});

// ---------- canvas sizing / quality ----------
function resizeCanvas() {
  view.w = Math.max(240, window.innerWidth);
  view.h = Math.max(240, window.innerHeight);
  const dprCap = settings.quality === 'low' ? 1 : 1.5;
  view.dpr = Math.min(window.devicePixelRatio || 1, dprCap) * quality.scale;
  canvas.width = Math.max(1, Math.round(view.w * view.dpr));
  canvas.height = Math.max(1, Math.round(view.h * view.dpr));
  view.zoom = clamp(view.w / (13 * TILE), 1.45, 2.35);
  canvas.style.width = `${view.w}px`;
  canvas.style.height = `${view.h}px`;
  ctx.imageSmoothingEnabled = false;
  if (game.player) updateCamera(1, true);
  if (game.scene !== 'play' || game.paused) render();
}

function applyQuality() {
  const baseName = settings.quality === 'auto' ? 'medium' : settings.quality;
  const base = QUALITY[baseName] || QUALITY.medium;
  quality = {
    ...base,
    scale: base.scale * (settings.quality === 'auto' ? autoScale : 1),
    particles: Math.max(10, Math.round(base.particles * (settings.quality === 'auto' ? autoScale : 1)))
  };
  resizeCanvas();
}

function perfAdapt(rawDt) {
  if (settings.quality !== 'auto' || settings.reducedMotion) return;
  const ms = rawDt * 1000;
  perf.avg = lerp(perf.avg, ms, 0.04);
  const target = 1000 / settings.fps;
  if (perf.avg > target * 1.32) { perf.slowFor += rawDt; perf.fastFor = 0; }
  else if (perf.avg < target * 0.82) { perf.fastFor += rawDt; perf.slowFor = 0; }
  else { perf.slowFor = Math.max(0, perf.slowFor - rawDt * 0.5); perf.fastFor = Math.max(0, perf.fastFor - rawDt * 0.5); }

  if (game.time - perf.lastAdjust < 2.4) return;
  if (perf.slowFor > 2.2 && autoScale > 0.64) {
    autoScale = Math.max(0.64, autoScale - 0.08);
    perf.lastAdjust = game.time; perf.slowFor = 0;
    applyQuality();
    if (!game.autoNoteShown) {
      game.autoNoteShown = true;
      toast('Auto quality: lowering render scale to protect frame rate.', '', 3200);
    }
  } else if (perf.fastFor > 6 && autoScale < 1) {
    autoScale = Math.min(1, autoScale + 0.05);
    perf.lastAdjust = game.time; perf.fastFor = 0;
    applyQuality();
  }
}

window.addEventListener('resize', () => resizeCanvas());
window.addEventListener('orientationchange', () => setTimeout(resizeCanvas, 150));

// ---------- loop ----------
let lastFrame = performance.now();
let frameAcc = 0;
let rafId = 0;

function loop(now) {
  rafId = requestAnimationFrame(loop);
  if (document.hidden) { lastFrame = now; return; }
  const raw = (now - lastFrame) / 1000;
  lastFrame = now;
  frameAcc += Math.min(0.1, raw);
  const interval = 1 / settings.fps;
  if (frameAcc < interval) return;
  const dt = Math.min(0.05, frameAcc);
  frameAcc %= interval;

  if (game.paused) {
    // Keep one static frame on screen; skip updates and drawing to save battery.
    return;
  }
  if (game.scene === 'title') {
    game.time += dt;
    updateAmbient(dt);
    updateCamera(dt, false);
    render();
  } else if (game.scene === 'play') {
    update(dt);
    render();
  }
  fps.acc += raw; fps.frames++;
  if (fps.acc >= 0.75) {
    fps.value = fps.frames / fps.acc;
    fps.acc = 0; fps.frames = 0;
  }
  perfAdapt(raw);
}

// ---------- gameplay update ----------
function update(dt) {
  const p = game.player;
  if (!p) return;
  game.time += dt;
  p.playTime += dt;
  p.atkCd = Math.max(0, p.atkCd - dt);
  p.emberCd = Math.max(0, p.emberCd - dt);
  p.mendCd = Math.max(0, p.mendCd - dt);
  p.invuln = Math.max(0, p.invuln - dt);
  p.flash = Math.max(0, p.flash - dt);
  p.lunge = Math.max(0, p.lunge - dt);
  game.shake = Math.max(0, game.shake - dt * 22);
  if (game.zoneTimer > 0) {
    game.zoneTimer -= dt;
    if (game.zoneTimer <= 0) dom.regionBanner.classList.remove('show');
  }

  updatePlayer(dt);
  updateMonsters(dt);
  updateProjectiles(dt);
  updateParticles(dt);
  updateTexts(dt);
  updateEffects(dt);
  updateCamera(dt, false);
  updateInteract();
  updateZone();
  regenPlayer(dt);

  game.uiTimer += dt;
  if (game.uiTimer >= 0.1) {
    game.uiTimer = 0;
    updateHud();
  }
  game.saveTimer += dt;
  if (game.saveTimer >= 15) { game.saveTimer = 0; saveGame(); }
}

function updatePlayer(dt) {
  const p = game.player;
  const v = inputVector();
  p.moving = v.mag > 0.08;
  if (p.moving) {
    const speed = PLAYER.speed * world.speedAt(p.x, p.y) * (1 + Math.min(0.12, p.level * 0.008));
    const dx = v.x * speed * dt;
    const dy = v.y * speed * dt;
    tryMove(p, dx, dy, PLAYER.radius);
    if (Math.abs(v.x) > Math.abs(v.y) + 0.1) p.dir = v.x < 0 ? 'left' : 'right';
    else if (Math.abs(v.y) > 0.1) p.dir = v.y < 0 ? 'up' : 'down';
    p.walkTime += dt;
  } else {
    p.walkTime = 0;
  }

  // Target selection: keep a live target, otherwise take the nearest one.
  let target = game.target;
  if (!target || target.dead || dist(p.x, p.y, target.x, target.y) > 8 * TILE) {
    target = findNearestMonster(7 * TILE);
  }
  game.target = target;
  game.targetId = target ? target.id : null;

  if (target && !p.moving) {
    const a = Math.atan2(target.y - p.y, target.x - p.x);
    if (Math.abs(Math.cos(a)) > Math.abs(Math.sin(a))) p.dir = Math.cos(a) < 0 ? 'left' : 'right';
    else p.dir = Math.sin(a) < 0 ? 'up' : 'down';
  }

  const inRange = target && !target.dead && dist(p.x, p.y, target.x, target.y) <= PLAYER.attackRange + target.def.radius * 0.5;
  if (p.atkCd <= 0 && (input.attackHeld || settings.autoAttack) && inRange) {
    playerAttack(false);
  } else if (p.atkCd <= 0 && input.attackHeld && !inRange) {
    // A harmless whiff gives feedback without hidden auto-chase.
    playerAttack(false);
  }
}

function tryMove(entity, dx, dy, radius) {
  const nx = entity.x + dx;
  if (world.canStand(nx, entity.y, radius)) entity.x = nx;
  const ny = entity.y + dy;
  if (world.canStand(entity.x, ny, radius)) entity.y = ny;
}

function findNearestMonster(maxDist) {
  const p = game.player;
  let best = null, bestD = maxDist * maxDist;
  for (const m of game.monsters) {
    if (m.dead) continue;
    const d = (m.x - p.x) ** 2 + (m.y - p.y) ** 2;
    if (d < bestD) { bestD = d; best = m; }
  }
  return best;
}

function nearestMonsterAt(x, y, maxDist) {
  let best = null, bestD = maxDist * maxDist;
  for (const m of game.monsters) {
    if (m.dead) continue;
    const d = (m.x - x) ** 2 + (m.y - y) ** 2;
    if (d < bestD) { bestD = d; best = m; }
  }
  return best;
}

function nearestNpc(range, x = game.player.x, y = game.player.y) {
  let best = null, bestD = range;
  for (const n of game.npcs) {
    const d = dist(x, y, n.x, n.y);
    if (d < bestD) { bestD = d; best = n; }
  }
  return best;
}

function playerAttack() {
  const p = game.player;
  if (!p || p.atkCd > 0) return;
  p.atkCd = PLAYER.attackInterval;
  const target = game.target;
  const facing = target && !target.dead
    ? { x: target.x - p.x, y: target.y - p.y }
    : dirVector(p.dir);
  const len = Math.hypot(facing.x, facing.y) || 1;
  p.lungeDir = { x: facing.x / len, y: facing.y / len };
  p.lunge = 0.11;
  sfx.play('swing');
  haptic(5);
  addEffect({ type: 'slash', x: p.x + p.lungeDir.x * 12, y: p.y - 6 + p.lungeDir.y * 12, dir: p.lungeDir, life: 0.16, maxLife: 0.16 });
  if (!target || target.dead) return;
  if (dist(p.x, p.y, target.x, target.y) > PLAYER.attackRange + target.def.radius * 0.55) return;

  let dmg = 4 + p.weapon.atk + p.level * 1.0;
  dmg *= rand(0.88, 1.12);
  const crit = Math.random() < PLAYER.crit;
  if (crit) dmg *= PLAYER.critMult;
  const armor = target.type === 'boss' ? 3 : target.type === 'skeleton' ? 1 : 0;
  dmg = Math.max(1, Math.round(dmg - armor));
  damageMonster(target, dmg, crit);
}

function dirVector(dir) {
  return dir === 'left' ? { x: -1, y: 0 } : dir === 'right' ? { x: 1, y: 0 } : dir === 'up' ? { x: 0, y: -1 } : { x: 0, y: 1 };
}

function damageMonster(m, dmg, crit = false) {
  if (m.dead) return;
  m.hp -= dmg;
  m.hitT = 0.14;
  m.lunge = 0.1;
  addText(m.x, m.y - 22, crit ? `${dmg}!` : `${dmg}`, crit ? '#ffd27a' : '#ffb0a8', crit ? 12 : 10);
  burst(m.x, m.y - 8, crit ? '#ffd27a' : '#d35c52', crit ? 10 : 6, 50, 2.2);
  game.shake = crit ? 3.5 : 2;
  sfx.play(crit ? 'crit' : 'hit');
  haptic(crit ? 18 : 9);
  if (m.hp <= 0) killMonster(m);
}

function killMonster(m) {
  if (m.dead) return;
  m.dead = true;
  m.hp = 0;
  m.respawn = m.def.respawn;
  m.telegraph = null;
  if (game.target === m) game.target = null;
  burst(m.x, m.y - 8, '#8d6b3f', 14, 70, 2.6);
  addText(m.x, m.y - 26, `+${m.def.xp} xp`, '#9ce6c9', 9);
  game.player.kills++;
  game.kills++;
  game.killsByType[m.type] = (game.killsByType[m.type] || 0) + 1;
  awardXP(m.def.xp);
  rollLoot(m);
  sfx.play('pickup');

  const qid = currentQuestId();
  const q = qid && game.quests[qid];
  if (q && q.state === 'active' && QUESTS[qid].monster === m.type) {
    q.have = Math.min(QUESTS[qid].need, q.have + 1);
    if (qid === 'boss') {
      q.state = 'done';
      game.bossDefeated = true;
      grantQuestReward(qid, true);
      setTimeout(showVictory, 900);
    } else if (q.have >= QUESTS[qid].need) {
      q.state = 'ready';
      toast(`Objective complete — return to Warden Maren.`, 'quest', 3600);
      sfx.play('quest');
      saveGame();
    } else {
      toast(`${QUESTS[qid].title}: ${q.have}/${QUESTS[qid].need}`, '', 1800);
    }
  }
  saveGame();
}

function awardXP(amount) {
  const p = game.player;
  p.xp += amount;
  let leveled = false;
  while (p.xp >= p.xpNext) {
    p.xp -= p.xpNext;
    p.level++;
    p.maxHp += PLAYER.hpPerLevel;
    p.maxMana += PLAYER.manaPerLevel;
    p.hp = p.maxHp;
    p.mana = p.maxMana;
    p.xpNext = XP_FOR_LEVEL(p.level);
    leveled = true;
    addEffect({ type: 'level', x: p.x, y: p.y - 8, life: 0.9, maxLife: 0.9 });
    burst(p.x, p.y - 10, '#ffd27a', 24, 80, 3);
  }
  if (leveled) {
    dom.levelBanner.hidden = false;
    dom.levelBanner.style.animation = 'none';
    void dom.levelBanner.offsetWidth;
    dom.levelBanner.style.animation = '';
    setTimeout(() => { dom.levelBanner.hidden = true; }, 1800);
    sfx.play('level');
    haptic(30);
    toast(`Level ${p.level} — strength rises, wounds close.`, 'good', 3200);
    saveGame();
  }
}

function makeGear(kind, level, rarity, boss = false) {
  const base = kind === 'weapon'
    ? 2 + Math.floor(level * 0.85)
    : 1 + Math.floor(level * 0.4);
  const stat = Math.max(1, Math.round(base * rarity.mult + rand(0, 1.4)));
  const name = boss && kind === 'weapon'
    ? 'Emberheart Blade'
    : kind === 'weapon'
      ? WEAPON_NAMES[randInt(0, WEAPON_NAMES.length - 1)]
      : ARMOR_NAMES[randInt(0, ARMOR_NAMES.length - 1)];
  return kind === 'weapon'
    ? { kind, name, rarity: rarity.id, atk: stat }
    : { kind, name, rarity: rarity.id, def: stat };
}

function rollLoot(m) {
  const p = game.player;
  const def = m.def;
  const gold = randInt(def.gold[0], def.gold[1]);
  if (gold > 0) {
    p.gold += gold;
    addText(m.x, m.y - 18, `+${gold}g`, '#f2c45c', 8);
    if (gold >= 8) sfx.play('coin');
  }
  if (Math.random() < def.potion && p.potions < POTION.max) {
    p.potions++;
    toast('Found an Ember Tonic. +1 potion.', 'gold', 2000);
    sfx.play('pickup');
  }
  if (Math.random() < def.gear) {
    const kind = Math.random() < 0.56 ? 'weapon' : 'armor';
    const rarity = m.boss ? rarityById('epic') : pickRarity();
    const gear = makeGear(kind, p.level, rarity, m.boss);
    const current = kind === 'weapon' ? p.weapon : p.armor;
    if (gearPower(gear) > gearPower(current)) {
      if (kind === 'weapon') p.weapon = gear; else p.armor = gear;
      toast(`${rarity.name} ${gear.name} equipped — ${kind === 'weapon' ? `ATK ${gear.atk}` : `DEF ${gear.def}`}.`, 'good', 3600);
      sfx.play('quest');
      burst(p.x, p.y - 12, rarity.color, 16, 55, 2.3);
    } else {
      const sell = 8 + Math.round(p.level * 3 + rarity.mult * 6);
      p.gold += sell;
      toast(`${rarity.name} ${gear.name} sold to Grimbald for ${sell}g.`, 'gold', 2600);
    }
  }
  if (m.boss) {
    const epic = { kind: 'weapon', name: 'Emberheart Blade', rarity: 'epic', atk: 16 + Math.floor(p.level * 0.6) };
    if (gearPower(epic) > gearPower(p.weapon)) {
      p.weapon = epic;
      toast('Emberheart Blade claimed — the crypt-light goes dark.', 'quest', 4200);
    }
  }
}

function grantQuestReward(id, silent = false) {
  const q = QUESTS[id];
  const st = game.quests[id];
  const p = game.player;
  if (!q || !st || st.rewarded) return;
  st.rewarded = true;
  p.gold += q.rewardGold;
  const rg = q.rewardGear;
  if (rg) {
    const gear = { kind: rg.kind, name: rg.name, rarity: rg.rarity, [rg.kind === 'weapon' ? 'atk' : 'def']: rg.kind === 'weapon' ? rg.atk : rg.def };
    const current = rg.kind === 'weapon' ? p.weapon : p.armor;
    if (gearPower(gear) > gearPower(current)) {
      if (rg.kind === 'weapon') p.weapon = gear; else p.armor = gear;
    } else {
      p.gold += 18;
    }
  }
  if (!silent) {
    toast(`${q.title} complete — ${q.rewardGold}g and ${q.rewardGear?.name || 'a reward'}.`, 'quest', 4200);
  } else {
    toast(`${q.title} complete — ${q.rewardGold}g and ${q.rewardGear?.name || 'a reward'}.`, 'quest', 4200);
  }
  sfx.play('quest');
  burst(p.x, p.y - 12, '#ffd27a', 22, 70, 2.8);
  saveGame();
  updateSaveSummary();
}

// ---------- spells / items ----------
function castEmber() {
  if (game.scene !== 'play' || game.paused) return;
  const p = game.player;
  const sp = SPELLS.ember;
  if (p.emberCd > 0) return;
  if (p.mana < sp.mana) { toast('Not enough mana.', 'bad', 1600); return; }
  const target = findNearestMonster(sp.range);
  if (!target) { toast('No target in range.', '', 1400); return; }
  const a = Math.atan2(target.y - p.y, target.x - p.x);
  p.dir = Math.abs(Math.cos(a)) > Math.abs(Math.sin(a)) ? (Math.cos(a) < 0 ? 'left' : 'right') : (Math.sin(a) < 0 ? 'up' : 'down');
  p.mana -= sp.mana;
  p.emberCd = sp.cooldown;
  const dmg = Math.round(sp.base + p.level * sp.perLevel + rand(0, 4));
  game.projectiles.push({
    x: p.x, y: p.y - 8, vx: Math.cos(a) * sp.speed, vy: Math.sin(a) * sp.speed,
    life: 1.2, dmg, targetId: target.id, color: '#ff9f43'
  });
  burst(p.x, p.y - 9, '#ff9f43', 6, 30, 1.8);
  sfx.play('ember');
  haptic(8);
}

function castMend() {
  if (game.scene !== 'play' || game.paused) return;
  const p = game.player;
  const sp = SPELLS.mend;
  if (p.mendCd > 0) return;
  if (p.mana < sp.mana) { toast('Not enough mana.', 'bad', 1600); return; }
  if (p.hp >= p.maxHp) { toast('Already at full health.', '', 1400); return; }
  p.mana -= sp.mana;
  p.mendCd = sp.cooldown;
  const heal = Math.round(sp.base + p.level * sp.perLevel);
  p.hp = Math.min(p.maxHp, p.hp + heal);
  addText(p.x, p.y - 28, `+${heal}`, '#9ce6c9', 11);
  addEffect({ type: 'heal', x: p.x, y: p.y - 8, life: 0.6, maxLife: 0.6 });
  burst(p.x, p.y - 10, '#9ce6c9', 12, 35, 2);
  sfx.play('mend');
  haptic(10);
}

function drinkPotion() {
  if (game.scene !== 'play' || game.paused) return;
  const p = game.player;
  if (p.potions <= 0) { toast('No tonics left. Grimbald sells more.', 'bad', 1800); return; }
  if (p.hp >= p.maxHp) { toast('Already at full health.', '', 1400); return; }
  p.potions--;
  p.hp = Math.min(p.maxHp, p.hp + POTION.heal);
  addText(p.x, p.y - 28, `+${POTION.heal}`, '#ffb0a8', 10);
  burst(p.x, p.y - 10, '#ff8b80', 10, 30, 2);
  sfx.play('potion');
  haptic(8);
}

// ---------- monsters ----------
function updateMonsters(dt) {
  const p = game.player;
  for (const m of game.monsters) {
    if (m.dead) {
      m.respawn -= dt;
      if (m.respawn <= 0) respawnMonster(m);
      continue;
    }
    m.hitT = Math.max(0, m.hitT - dt);
    m.lunge = Math.max(0, m.lunge - dt);
    m.atkCd = Math.max(0, m.atkCd - dt);
    if (p.hp <= 0) continue;

    const d = dist(m.x, m.y, p.x, p.y);
    const aggro = m.def.aggro;
    if (m.boss) updateBossSpecial(m, dt, d);

    if (d < aggro || m.state === 'chase') {
      if (d > aggro * 1.7) { m.state = 'idle'; }
      else {
        m.state = 'chase';
        if (m.telegraph) continue;
        if (d > m.def.range) {
          const a = Math.atan2(p.y - m.y, p.x - m.x);
          const speed = m.def.speed * (world.speedAt(m.x, m.y));
          tryMove(m, Math.cos(a) * speed * dt, Math.sin(a) * speed * dt, m.def.radius);
          m.dir = Math.cos(a) >= 0 ? 1 : -1;
        } else if (m.atkCd <= 0) {
          m.atkCd = m.def.interval;
          m.lunge = 0.13;
          m.dir = p.x >= m.x ? 1 : -1;
          monsterAttack(m);
        }
      }
    } else {
      m.wanderT -= dt;
      if (m.wanderT <= 0) {
        m.wanderT = rand(2.2, 5.5);
        m.wx = m.homeX + rand(-28, 28);
        m.wy = m.homeY + rand(-28, 28);
      }
      const wd = dist(m.x, m.y, m.wx, m.wy);
      if (wd > 3) {
        const a = Math.atan2(m.wy - m.y, m.wx - m.x);
        const speed = m.def.speed * 0.3 * world.speedAt(m.x, m.y);
        tryMove(m, Math.cos(a) * speed * dt, Math.sin(a) * speed * dt, m.def.radius);
        m.dir = Math.cos(a) >= 0 ? 1 : -1;
      }
    }
  }
  separateMonsters();
}

function separateMonsters() {
  const list = game.monsters;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.dead) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (b.dead) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const min = (a.def.radius + b.def.radius) * 0.82;
      const d2 = dx * dx + dy * dy;
      if (d2 > 0 && d2 < min * min) {
        const d = Math.sqrt(d2);
        const push = (min - d) * 0.5;
        const nx = dx / d * push, ny = dy / d * push;
        if (world.canStand(a.x - nx, a.y - ny, a.def.radius)) { a.x -= nx; a.y -= ny; }
        if (world.canStand(b.x + nx, b.y + ny, b.def.radius)) { b.x += nx; b.y += ny; }
      }
    }
  }
}

function monsterAttack(m) {
  const p = game.player;
  const raw = m.def.dmg + rand(-1, 2);
  const dmg = Math.max(1, Math.round(raw - p.armor.def * 0.55));
  damagePlayer(dmg, m);
}

function updateBossSpecial(m, dt, d) {
  if (m.telegraph) {
    m.telegraph.t -= dt;
    if (m.telegraph.t <= 0) {
      const p = game.player;
      const td = dist(p.x, p.y, m.telegraph.x, m.telegraph.y);
      burst(m.telegraph.x, m.telegraph.y, '#ff6b3d', 28, 110, 3.4);
      addEffect({ type: 'ring', x: m.telegraph.x, y: m.telegraph.y, life: 0.45, maxLife: 0.45, color: '#ff9f43' });
      game.shake = 7;
      if (td < 34) damagePlayer(22, m, true);
      m.telegraph = null;
      sfx.play('hit');
    }
    return;
  }
  m.specialCd -= dt;
  if (m.specialCd <= 0 && d < 96) {
    m.specialCd = rand(4.6, 6.2);
    m.telegraph = { x: game.player.x, y: game.player.y, t: 0.92 };
    toast('The Ember Warden gathers the crypt-light — move!', 'bad', 1800);
    sfx.play('boss');
    haptic(35);
  }
}

function respawnMonster(m) {
  m.dead = false;
  m.hp = m.maxHp;
  m.x = m.homeX;
  m.y = m.homeY;
  m.atkCd = rand(0.4, 1.2);
  m.state = 'idle';
  m.telegraph = null;
  m.specialCd = 3 + Math.random() * 2;
}

function resetMonsters() {
  for (const m of game.monsters) {
    m.dead = false;
    m.hp = m.maxHp;
    m.x = m.homeX;
    m.y = m.homeY;
    m.state = 'idle';
    m.telegraph = null;
    m.atkCd = rand(0.5, 1.4);
    m.specialCd = 3 + Math.random() * 2;
  }
  game.target = null;
}

function damagePlayer(dmg, source, special = false) {
  const p = game.player;
  if (!p || p.hp <= 0 || (p.invuln > 0 && !special)) return;
  p.hp -= dmg;
  p.invuln = special ? 0.6 : 0.36;
  p.flash = 0.18;
  p.lastHit = game.time;
  game.lastCombat = game.time;
  game.shake = special ? 6 : 3;
  addText(p.x, p.y - 28, `-${dmg}`, '#ff8b80', 11);
  burst(p.x, p.y - 9, '#e05d5d', 8, 45, 2.3);
  sfx.play('hurt');
  haptic(special ? 28 : 14);
  if (p.hp <= 0) playerDied();
}

function playerDied() {
  if (game.deathShown) return;
  const p = game.player;
  const lost = Math.floor(p.gold * 0.1);
  p.gold = Math.max(0, p.gold - lost);
  p.hp = 0;
  game.deathShown = true;
  game.paused = true;
  game.shake = 8;
  dom.deathText.textContent = `The temple hearth pulls you back. You lose ${lost}g, but your gear and your quest remain.`;
  dom.death.hidden = false;
  sfx.play('death');
  haptic(60);
  saveGame();
}

function respawn() {
  const p = game.player;
  p.x = TEMPLE_POS.x * TILE;
  p.y = (TEMPLE_POS.y + 1) * TILE;
  p.hp = p.maxHp;
  p.mana = p.maxMana;
  p.invuln = 2.5;
  p.gold = p.gold;
  game.deathShown = false;
  game.paused = false;
  dom.death.hidden = true;
  resetMonsters();
  updateCamera(1, true);
  banner('Emberhold');
  saveGame();
  toast('You wake by the temple hearth.', 'good', 2600);
}

// ---------- projectiles / effects ----------
function updateProjectiles(dt) {
  for (let i = game.projectiles.length - 1; i >= 0; i--) {
    const pr = game.projectiles[i];
    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;
    pr.life -= dt;
    if (Math.random() < 0.4) {
      addParticle({ x: pr.x, y: pr.y, vx: rand(-8, 8), vy: rand(-16, -2), life: 0.25, maxLife: 0.25, color: '#ff9f43', size: 2 });
    }
    let hit = null;
    for (const m of game.monsters) {
      if (m.dead) continue;
      if (dist(pr.x, pr.y, m.x, m.y - 6) < m.def.radius + 4) { hit = m; break; }
    }
    if (hit) {
      damageMonster(hit, pr.dmg, false);
      burst(pr.x, pr.y, '#ffb469', 12, 55, 2.5);
      game.projectiles.splice(i, 1);
      continue;
    }
    if (pr.life <= 0 || !world.canStand(pr.x, pr.y, 1.5)) {
      burst(pr.x, pr.y, '#ff9f43', 6, 30, 1.6);
      game.projectiles.splice(i, 1);
    }
  }
}

function addParticle(part) {
  if (game.particles.length >= quality.particles) game.particles.shift();
  game.particles.push(part);
}
function burst(x, y, color, count, speed, size = 2) {
  const n = quality.particles <= 14 ? Math.min(count, 5) : count;
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = rand(speed * 0.3, speed);
    addParticle({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 12,
      life: rand(0.3, 0.75), maxLife: 0.75, color, size: rand(1, size)
    });
  }
}
function updateParticles(dt) {
  for (let i = game.particles.length - 1; i >= 0; i--) {
    const p = game.particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 55 * dt;
    p.life -= dt;
    if (p.life <= 0) game.particles.splice(i, 1);
  }
}
function addText(x, y, text, color, size = 9) {
  if (game.texts.length > 28) game.texts.shift();
  game.texts.push({ x, y, text, color, size, life: 0.9, maxLife: 0.9, vy: -26 });
}
function updateTexts(dt) {
  for (let i = game.texts.length - 1; i >= 0; i--) {
    const t = game.texts[i];
    t.y += t.vy * dt;
    t.vy *= 0.94;
    t.life -= dt;
    if (t.life <= 0) game.texts.splice(i, 1);
  }
}
function addEffect(effect) { game.effects.push(effect); }
function updateEffects(dt) {
  for (let i = game.effects.length - 1; i >= 0; i--) {
    const e = game.effects[i];
    e.life -= dt;
    if (e.life <= 0) game.effects.splice(i, 1);
  }
}

function regenPlayer(dt) {
  const p = game.player;
  const since = game.time - game.lastCombat;
  if (since > REGEN.combatDelay && p.hp > 0) p.hp = Math.min(p.maxHp, p.hp + REGEN.hp * dt);
  if (p.hp > 0) p.mana = Math.min(p.maxMana, p.mana + REGEN.mana * dt);
}

function updateCamera(dt, snap) {
  const p = game.player;
  if (!p) return;
  if (snap) {
    game.camera.x = p.x;
    game.camera.y = p.y;
  } else {
    const t = 1 - Math.pow(0.001, dt);
    game.camera.x = lerp(game.camera.x, p.x, t);
    game.camera.y = lerp(game.camera.y, p.y, t);
  }
  const halfW = view.w / (2 * view.zoom);
  const halfH = view.h / (2 * view.zoom);
  const maxX = MAP_W * TILE;
  const maxY = MAP_H * TILE;
  game.camera.x = maxX > halfW * 2 ? clamp(game.camera.x, halfW, maxX - halfW) : maxX / 2;
  game.camera.y = maxY > halfH * 2 ? clamp(game.camera.y, halfH, maxY - halfH) : maxY / 2;
  view.camX = game.camera.x - halfW;
  view.camY = game.camera.y - halfH;
}

function updateInteract() {
  if (game.scene !== 'play' || game.paused) { dom.interactPrompt.hidden = true; return; }
  const npc = nearestNpc(2.3 * TILE);
  game.interactNpc = npc;
  if (npc) {
    dom.interactPrompt.hidden = false;
    setText(dom.interactLabel, `Talk to ${npc.name}`);
  } else {
    dom.interactPrompt.hidden = true;
  }
}

function updateZone() {
  const z = world.zoneAt(game.player.x, game.player.y);
  if (z !== game.zone) {
    game.zone = z;
    banner(z);
  }
}

function updateAmbient(dt) {
  // Title-screen ambience only: fireflies over the plaza.
  if (Math.random() < dt * 2 && game.particles.length < 10) {
    addParticle({
      x: game.player.x + rand(-70, 70), y: game.player.y + rand(-45, 45),
      vx: rand(-5, 5), vy: rand(-9, -2), life: rand(1.2, 2.4), maxLife: 2.4,
      color: '#ffd27a', size: 1.4
    });
  }
  updateParticles(dt);
  updateEffects(dt);
  if (game.zoneTimer > 0) {
    game.zoneTimer -= dt;
    if (game.zoneTimer <= 0) dom.regionBanner.classList.remove('show');
  }
}

// ---------- render ----------
function render() {
  if (!game.player || !world.bg) return;
  const p = game.player;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#0b1114';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);

  let shakeX = 0, shakeY = 0;
  if (game.shake > 0.1 && quality.shadows && !settings.reducedMotion) {
    shakeX = rand(-game.shake, game.shake);
    shakeY = rand(-game.shake, game.shake);
  }
  ctx.translate(shakeX, shakeY);
  ctx.scale(view.zoom, view.zoom);
  ctx.translate(-view.camX, -view.camY);

  const vw = view.w / view.zoom;
  const vh = view.h / view.zoom;
  const sx = clamp(view.camX, 0, Math.max(0, MAP_W * TILE - vw));
  const sy = clamp(view.camY, 0, Math.max(0, MAP_H * TILE - vh));
  const sw = Math.min(vw, MAP_W * TILE);
  const sh = Math.min(vh, MAP_H * TILE);
  ctx.drawImage(world.bg, sx, sy, sw, sh, sx, sy, sw, sh);

  drawGroundEffects();

  // Dynamic props that live under entities.
  for (const f of world.campfires) drawCampfire(f);
  for (const t of world.torches) drawTorchFlame(t);

  const list = [];
  for (const n of game.npcs) list.push({ y: n.y, kind: 'npc', obj: n });
  for (const m of game.monsters) if (!m.dead) list.push({ y: m.y, kind: 'monster', obj: m });
  if (game.scene === 'play') list.push({ y: p.y, kind: 'player', obj: p });
  list.sort((a, b) => a.y - b.y);

  for (const item of list) {
    if (item.kind === 'player') drawPlayer(p);
    else if (item.kind === 'npc') drawNpc(item.obj);
    else drawMonster(item.obj);
  }

  drawProjectiles();
  drawEffects();
  drawParticles();
  drawTexts();

  // Slight zone tint for the crypt.
  if (game.zone === 'Sunken Crypt') {
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = 'rgba(8, 10, 22, 0.16)';
    ctx.fillRect(0, 0, view.w, view.h);
  }
}

function drawGroundEffects() {
  const p = game.player;
  // Boss telegraph.
  for (const m of game.monsters) {
    if (!m.telegraph) continue;
    const t = m.telegraph;
    const pulse = 1 + Math.sin(game.time * 18) * 0.08;
    ctx.strokeStyle = 'rgba(255, 107, 61, .85)';
    ctx.fillStyle = 'rgba(255, 80, 40, .16)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(t.x, t.y, 32 * pulse, 18 * pulse, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 210, 122, .8)';
    ctx.beginPath();
    ctx.ellipse(t.x, t.y, 20 * pulse, 11 * pulse, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Quest marker at the current objective.
  const qid = currentQuestId();
  if (qid) {
    const pt = questTargetPoint(qid);
    if (pt) {
      const distPx = Math.hypot(pt.x - p.x, pt.y - p.y);
      if (distPx < 12 * TILE) {
        const bob = Math.sin(game.time * 3) * 2;
        ctx.save();
        ctx.translate(pt.x, pt.y - 30 + bob);
        ctx.rotate(Math.PI / 4);
        ctx.fillStyle = 'rgba(255, 159, 67, .95)';
        ctx.fillRect(-3.5, -3.5, 7, 7);
        ctx.strokeStyle = 'rgba(20, 14, 10, .7)';
        ctx.lineWidth = 1;
        ctx.strokeRect(-3.5, -3.5, 7, 7);
        ctx.restore();
      }
    }
  }

  // Target ring.
  const target = game.target;
  if (target && !target.dead) {
    const r = 11 + target.def.radius + Math.sin(game.time * 5) * 1.5;
    ctx.strokeStyle = 'rgba(255, 210, 122, .85)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([3.5, 3]);
    ctx.beginPath();
    ctx.ellipse(target.x, target.y - 4, r, r * 0.58, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Firefly ambience in town / title.
  if (quality.extras && (game.scene === 'title' || game.zone === 'Emberhold' || game.zone === 'Stillwater')) {
    for (let i = 0; i < 4; i++) {
      const a = game.time * 0.35 + i * 1.6;
      const x = p.x + Math.cos(a) * (30 + i * 12);
      const y = p.y - 18 + Math.sin(a * 1.4 + i) * (12 + i * 4);
      ctx.fillStyle = `rgba(255, 210, 122, ${0.22 + Math.sin(a * 3) * 0.18})`;
      ctx.fillRect(x, y, 1.4, 1.4);
    }
  }
}

function drawShadow(x, y, w, h) {
  if (!quality.shadows) return;
  ctx.fillStyle = 'rgba(3,8,6,.3)';
  ctx.beginPath();
  ctx.ellipse(x, y - 1, w, h, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawPlayer(p) {
  const spriteSet = sprites.hero[p.dir] || sprites.hero.down;
  const frame = p.moving ? Math.floor(p.walkTime * 8) % 2 : 0;
  const spr = spriteSet[frame] || spriteSet[0];
  const bob = p.moving ? Math.abs(Math.sin(p.walkTime * 16)) * 1.2 : Math.sin(game.time * 2.2) * 0.35;
  const lunge = p.lunge > 0 ? (p.lunge / 0.11) : 0;
  const lx = p.lungeDir.x * lunge * 3.5;
  const ly = p.lungeDir.y * lunge * 2.5;
  drawShadow(p.x, p.y, 5.5, 2.1);
  if (p.flash > 0) {
    ctx.fillStyle = 'rgba(224, 93, 93, .2)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y - 8, 10, 12, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.drawImage(spr, Math.round(p.x - spr.width / 2 + lx), Math.round(p.y - spr.height + 1 - bob + ly));
}

function drawNpc(n) {
  const spr = npcSprite(sprites, n);
  const bob = Math.sin(game.time * 1.7 + n.x * 0.05) * 0.35;
  drawShadow(n.x, n.y, 5, 1.8);
  ctx.drawImage(spr, Math.round(n.x - spr.width / 2), Math.round(n.y - spr.height + 1 - bob));
  // name tag
  ctx.font = 'bold 4.2px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(8,12,13,.72)';
  const w = ctx.measureText(n.name).width + 6;
  ctx.fillRect(n.x - w / 2, n.y - spr.height - 10, w, 7);
  ctx.fillStyle = '#f2e4c4';
  ctx.fillText(n.name, n.x, n.y - spr.height - 5);
  const marker = npcMarker(n);
  if (marker) {
    const mb = Math.sin(game.time * 4) * 1.1;
    ctx.font = 'bold 9px monospace';
    ctx.fillStyle = '#ffd27a';
    ctx.fillText(marker, n.x, n.y - spr.height - 13 + mb);
  }
}

function npcMarker(n) {
  if (n.id !== 'warden') return '';
  const qid = currentQuestId();
  if (!qid) return '';
  const st = game.quests[qid];
  if (!st) return '';
  if (st.state === 'available' || st.state === 'ready') return '!';
  return '';
}

function drawMonster(m) {
  const spr = sprites.monsters[m.def.sprite];
  if (!spr) return;
  const scale = m.def.scale;
  const w = spr.width * scale;
  const h = spr.height * scale;
  const bob = m.type === 'slime' ? Math.sin(game.time * 4 + m.id) * 1.2 : m.def.boss ? Math.sin(game.time * 2) * 1 : 0;
  const lunge = m.lunge > 0 ? (m.lunge / 0.13) : 0;
  const dx = m.lunge > 0 ? (game.player.x >= m.x ? 2 : -2) * lunge : 0;
  drawShadow(m.x, m.y, w * 0.35, 2.2);

  if (m.boss) {
    ctx.fillStyle = 'rgba(255, 120, 50, .1)';
    ctx.beginPath();
    ctx.ellipse(m.x, m.y - 12, 24, 18, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.save();
  ctx.translate(Math.round(m.x + dx), Math.round(m.y + 1 - bob));
  if (m.dir < 0) ctx.scale(-1, 1);
  ctx.drawImage(spr, -w / 2, -h, w, h);
  if (m.hitT > 0) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.42;
    ctx.drawImage(spr, -w / 2, -h, w, h);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();

  if (m.boss) {
    ctx.font = 'bold 5px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffc1a1';
    ctx.fillText(m.def.name, m.x, m.y - h - 10);
  }
  if (m.hp < m.maxHp || game.target === m) {
    const bw = m.boss ? 34 : Math.max(18, w * 0.72);
    const bx = m.x - bw / 2;
    const by = m.y - h - (m.boss ? 21 : 7);
    ctx.fillStyle = 'rgba(8,12,13,.75)';
    ctx.fillRect(bx - 1, by - 1, bw + 2, 4);
    ctx.fillStyle = m.boss ? '#ff9f43' : '#e05d5d';
    ctx.fillRect(bx, by, bw * clamp(m.hp / m.maxHp, 0, 1), 2);
  }
}

function drawProjectiles() {
  for (const pr of game.projectiles) {
    ctx.fillStyle = 'rgba(255, 159, 67, .18)';
    ctx.beginPath(); ctx.arc(pr.x, pr.y, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffd27a';
    ctx.beginPath(); ctx.arc(pr.x, pr.y, 2.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff4d8';
    ctx.fillRect(pr.x - 1, pr.y - 1, 2, 2);
  }
}

function drawEffects() {
  for (const e of game.effects) {
    const k = 1 - e.life / e.maxLife;
    if (e.type === 'slash') {
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.rotate(Math.atan2(e.dir.y, e.dir.x));
      ctx.strokeStyle = `rgba(255, 228, 174, ${1 - k})`;
      ctx.lineWidth = 2.3;
      ctx.beginPath();
      ctx.arc(0, 0, 13, -0.9, 0.9);
      ctx.stroke();
      ctx.restore();
    } else if (e.type === 'heal' || e.type === 'level' || e.type === 'ring') {
      const color = e.type === 'heal' ? '156,230,201' : e.type === 'level' ? '255,210,122' : '255,159,67';
      ctx.strokeStyle = `rgba(${color},${(1 - k) * 0.85})`;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.ellipse(e.x, e.y, 8 + k * 26, (8 + k * 26) * 0.55, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (e.type === 'level') {
        ctx.fillStyle = `rgba(255,210,122,${(1 - k) * 0.18})`;
        ctx.beginPath(); ctx.ellipse(e.x, e.y, 10 + k * 20, (10 + k * 20) * 0.6, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
}

function drawParticles() {
  for (const p of game.particles) {
    const a = clamp(p.life / p.maxLife, 0, 1);
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

function drawTexts() {
  ctx.textAlign = 'center';
  for (const t of game.texts) {
    const a = clamp(t.life / t.maxLife, 0, 1);
    ctx.font = `bold ${Math.max(4.2, t.size * 0.58)}px monospace`;
    ctx.fillStyle = `rgba(8,10,12,${a * 0.8})`;
    ctx.fillText(t.text, t.x + 0.6, t.y + 0.6);
    ctx.fillStyle = t.color;
    ctx.globalAlpha = a;
    ctx.fillText(t.text, t.x, t.y);
    ctx.globalAlpha = 1;
  }
}

function drawCampfire(f) {
  const t = game.time;
  const flick = 1 + Math.sin(t * 13 + f.x) * 0.12 + Math.sin(t * 21) * 0.08;
  const h = 7 * flick;
  ctx.fillStyle = 'rgba(255, 120, 40, .16)';
  ctx.beginPath(); ctx.arc(f.x, f.y - 4, 12 * flick, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ff6b3d';
  ctx.beginPath();
  ctx.moveTo(f.x - 4, f.y);
  ctx.quadraticCurveTo(f.x - 2, f.y - h, f.x, f.y - h * 1.35);
  ctx.quadraticCurveTo(f.x + 3, f.y - h * 0.7, f.x + 4, f.y);
  ctx.fill();
  ctx.fillStyle = '#ffd27a';
  ctx.beginPath();
  ctx.moveTo(f.x - 2, f.y);
  ctx.quadraticCurveTo(f.x - 0.5, f.y - h * 0.55, f.x + 0.5, f.y - h * 0.8);
  ctx.quadraticCurveTo(f.x + 2, f.y - h * 0.4, f.x + 2, f.y);
  ctx.fill();
  if (Math.random() < 0.08 && quality.extras) {
    addParticle({ x: f.x + rand(-2, 2), y: f.y - h, vx: rand(-3, 3), vy: rand(-18, -8), life: 0.8, maxLife: 0.8, color: '#ffb469', size: 1.2 });
  }
}

function drawTorchFlame(t) {
  const x = t.x * TILE, y = t.y * TILE;
  const flick = 1 + Math.sin(game.time * 15 + x) * 0.15;
  ctx.fillStyle = 'rgba(255, 150, 60, .12)';
  ctx.beginPath(); ctx.arc(x, y + 2, 9 * flick, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ff8a3d';
  ctx.beginPath();
  ctx.moveTo(x - 2, y + 2);
  ctx.quadraticCurveTo(x - 1, y - 5 * flick, x, y - 7 * flick);
  ctx.quadraticCurveTo(x + 2, y - 3 * flick, x + 2, y + 2);
  ctx.fill();
  ctx.fillStyle = '#ffd27a';
  ctx.fillRect(x - 0.5, y - 2, 1, 3);
}

// ---------- HUD ----------
function updateHud() {
  const p = game.player;
  if (!p) return;
  setBar(dom.hpFill, p.hp, p.maxHp);
  setBar(dom.mpFill, p.mana, p.maxMana);
  setBar(dom.xpFill, p.xp, p.xpNext);
  setText(dom.hpText, `${Math.ceil(p.hp)} / ${Math.round(p.maxHp)}`);
  setText(dom.mpText, `${Math.ceil(p.mana)} / ${Math.round(p.maxMana)}`);
  setText(dom.xpText, `${Math.floor(p.xp)} / ${p.xpNext} XP`);
  setText(dom.goldText, String(Math.floor(p.gold)));
  setText(dom.potionCount, String(p.potions));
  setText(dom.levelButton, String(p.level));

  const qid = currentQuestId();
  if (qid) {
    const q = QUESTS[qid];
    const st = game.quests[qid];
    setText(dom.questTitle, q.title);
    if (st.state === 'ready') {
      setText(dom.questObjective, 'Return to Warden Maren for your reward.');
    } else if (st.state === 'available') {
      setText(dom.questObjective, 'Speak with Warden Maren in Emberhold.');
    } else {
      setText(dom.questObjective, `${q.objective} (${st.have}/${q.need})`);
    }
    const pt = questTargetPoint(qid);
    if (pt) {
      const dx = pt.x - p.x, dy = pt.y - p.y;
      const a = Math.atan2(dy, dx) * 180 / Math.PI + 90;
      dom.questArrow.style.transform = `rotate(${a.toFixed(0)}deg)`;
      setText(dom.questDist, `${Math.max(1, Math.round(Math.hypot(dx, dy) / TILE))}m`);
    } else {
      setText(dom.questDist, '—');
    }
  } else {
    setText(dom.questTitle, 'The Lowlands Are Quiet');
    setText(dom.questObjective, 'All three trials are complete. Explore, hunt, and grow stronger.');
    dom.questArrow.style.transform = 'rotate(0deg)';
    setText(dom.questDist, '—');
  }

  const boss = game.monsters.find(m => m.boss && !m.dead);
  const bossRelevant = boss && (dist(p.x, p.y, boss.x, boss.y) < 13 * TILE || game.target === boss);
  if (bossRelevant) {
    dom.bossBar.hidden = false;
    setBar(dom.bossFill, boss.hp, boss.maxHp);
  } else {
    dom.bossBar.hidden = true;
  }

  if (settings.showFps) {
    dom.fps.hidden = false;
    setText(dom.fps, `${Math.round(fps.value)} FPS · ${quality.label}${settings.quality === 'auto' ? ` · ${Math.round(autoScale * 100)}%` : ''}`);
  } else {
    dom.fps.hidden = true;
  }
}

// ---------- start / overlays / dialogue ----------
function initNpcs() {
  game.npcs = NPCS.map(n => ({ ...n, x: n.x * TILE, y: n.y * TILE }));
}

function anyOverlayOpen() {
  return !dom.dialogue.hidden || !dom.settings.hidden || !dom.stats.hidden || !dom.death.hidden || !dom.victory.hidden;
}

function hideOverlays() {
  dom.dialogue.hidden = true;
  dom.settings.hidden = true;
  dom.stats.hidden = true;
  dom.death.hidden = true;
  dom.victory.hidden = true;
  dom.interactPrompt.hidden = true;
  game.dialogNpc = null;
}

function beginPlay() {
  sfx.init();
  sfx.setEnabled(settings.sound);
  if (!game.started) {
    const loaded = loadSavedGame();
    if (!loaded) resetGame();
    game.started = true;
  }
  game.scene = 'play';
  game.paused = false;
  hideOverlays();
  dom.startScreen.hidden = true;
  dom.hud.hidden = false;
  dom.loading.classList.add('done');
  resizeCanvas();
  updateCamera(1, true);
  updateHud();
  game.zone = '';
  updateZone();
  saveGame();
  updateSaveSummary();
  if (game.quests.rats?.state === 'available') {
    toast('Find Warden Maren by the southern hall. He has work for you.', 'quest', 4200);
  }
  sfx.play('ui');
}

function startNewJourney() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* noop */ }
  game.started = false;
  resetGame();
  beginPlay();
  toast('A new journey begins in Emberhold.', 'quest', 2600);
}

let newArmed = false;
let newArmedTimer = 0;
function armNewJourney() {
  if (!hasSave()) { startNewJourney(); return; }
  if (!newArmed) {
    newArmed = true;
    dom.newJourney.textContent = 'Tap again to erase';
    toast('This will erase the saved journey. Tap again to confirm.', 'bad', 3000);
    newArmedTimer = setTimeout(() => {
      newArmed = false;
      dom.newJourney.textContent = 'New journey';
    }, 3200);
  } else {
    clearTimeout(newArmedTimer);
    newArmed = false;
    dom.newJourney.textContent = 'New journey';
    startNewJourney();
  }
}

function openSettings() {
  if (!dom.settings.hidden) return;
  game.settingsReturn = game.scene === 'play' ? 'play' : 'title';
  game.paused = true;
  syncSettingsUI();
  dom.settings.hidden = false;
  sfx.play('ui');
}

function closeSettings() {
  dom.settings.hidden = true;
  writeJSON(SETTINGS_KEY, settings);
  resizeCanvas();
  if (game.settingsReturn === 'play' && !anyOverlayOpen()) game.paused = false;
  else if (game.settingsReturn === 'title') game.paused = false;
  sfx.play('ui');
}

function syncSettingsUI() {
  dom.setQuality.value = settings.quality;
  dom.setFps.value = String(settings.fps);
  dom.setSound.checked = settings.sound;
  dom.setHaptics.checked = settings.haptics;
  dom.setAutoattack.checked = settings.autoAttack;
  dom.setShowfps.checked = settings.showFps;
  updateSoundIcon();
  dom.fps.hidden = !settings.showFps;
}

function updateSoundIcon() {
  const use = dom.btnSound.querySelector('use');
  if (use) use.setAttribute('href', settings.sound ? '#i-sound' : '#i-mute');
  dom.btnSound.setAttribute('aria-label', settings.sound ? 'Mute sound' : 'Enable sound');
}

function openStats() {
  if (game.scene !== 'play' || !dom.stats.hidden) return;
  game.paused = true;
  const p = game.player;
  const wr = rarityById(p.weapon.rarity);
  const ar = rarityById(p.armor.rarity);
  const mins = Math.round(p.playTime / 60);
  const time = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
  const questRows = QUEST_ORDER.map(id => {
    const q = QUESTS[id];
    const st = game.quests[id];
    const state = st.state === 'done' ? 'Complete' : st.state === 'ready' ? 'Turn in' : st.state === 'active' ? `${st.have}/${q.need}` : st.state === 'available' ? 'Available' : 'Locked';
    return `<div class="gear-row"><div class="gear-icon"><svg><use href="#i-book"></use></svg></div><div><b>${q.title}</b><span>${state}</span></div></div>`;
  }).join('');
  dom.statsBody.innerHTML = `
    <div class="stat-grid">
      <div class="stat-box"><span>Level</span><b>${p.level}</b></div>
      <div class="stat-box"><span>Health</span><b>${Math.ceil(p.hp)} <small>/ ${Math.round(p.maxHp)}</small></b></div>
      <div class="stat-box"><span>Damage</span><b>${Math.round(4 + p.weapon.atk + p.level)}</b></div>
      <div class="stat-box"><span>Defense</span><b>${p.armor.def}</b></div>
      <div class="stat-box"><span>Gold</span><b>${Math.floor(p.gold)}</b></div>
      <div class="stat-box"><span>Kills</span><b>${p.kills}</b></div>
      <div class="stat-box"><span>Time</span><b>${time}</b></div>
      <div class="stat-box"><span>Tonics</span><b>${p.potions}</b></div>
    </div>
    <div class="stats-sub">Gear</div>
    <div class="gear-row">
      <div class="gear-icon"><svg><use href="#i-sword"></use></svg></div>
      <div><b style="color:${wr.color}">${p.weapon.name}</b><span>${wr.name} · ATK ${p.weapon.atk} · +${p.upgrades.weapon} tempered</span></div>
    </div>
    <div class="gear-row">
      <div class="gear-icon"><svg><use href="#i-heart"></use></svg></div>
      <div><b style="color:${ar.color}">${p.armor.name}</b><span>${ar.name} · DEF ${p.armor.def} · +${p.upgrades.armor} fitted</span></div>
    </div>
    <div class="stats-sub">Journal</div>
    ${questRows}
  `;
  dom.stats.hidden = false;
}

function closeStats() {
  dom.stats.hidden = true;
  if (!anyOverlayOpen()) game.paused = false;
}

function openDialogue(id) {
  const npc = game.npcs.find(n => n.id === id);
  if (!npc) return;
  game.dialogNpc = npc;
  game.paused = true;
  dom.dialogue.hidden = false;
  drawPortrait(npc);
  renderDialogue(npc);
  sfx.play('ui');
  haptic(5);
}

function closeDialogue() {
  dom.dialogue.hidden = true;
  game.dialogNpc = null;
  if (!anyOverlayOpen()) game.paused = false;
  sfx.play('ui');
}

function drawPortrait(npc) {
  const c = dom.dialogPortrait;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, c.width, c.height);
  const spr = npcSprite(sprites, npc);
  const scale = 2.35;
  g.drawImage(spr, (c.width - spr.width * scale) / 2, c.height - spr.height * scale + 4, spr.width * scale, spr.height * scale);
}

function renderDialogue(npc) {
  const data = dialogueFor(npc);
  dom.dialogTitle.textContent = npc.title;
  dom.dialogName.textContent = npc.name;
  dom.dialogText.textContent = data.text;
  dom.dialogGold.textContent = String(Math.floor(game.player.gold));
  dom.dialogChoices.replaceChildren();
  data.choices.forEach((choice, i) => {
    const btn = document.createElement('button');
    btn.className = 'dialog-choice';
    btn.disabled = Boolean(choice.disabled);
    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = String(i + 1);
    btn.appendChild(num);
    const label = document.createElement('span');
    label.textContent = choice.label;
    btn.appendChild(label);
    if (choice.cost) {
      const cost = document.createElement('span');
      cost.className = 'cost';
      cost.textContent = choice.cost;
      btn.appendChild(cost);
    }
    btn.addEventListener('click', () => {
      choice.action?.();
    });
    dom.dialogChoices.appendChild(btn);
  });
}

function dialogueFor(npc) {
  const p = game.player;
  if (npc.id === 'warden') {
    const qid = QUEST_ORDER.find(id => ['available', 'active', 'ready'].includes(game.quests[id]?.state));
    if (!qid) {
      return {
        text: 'It is quiet. Not peaceful — the Lowlands are never peaceful — but quiet. You gave Emberhold its dawn back. Walk where you like, wanderer. The gate is always open.',
        choices: [{ label: 'Leave', action: closeDialogue }]
      };
    }
    const q = QUESTS[qid];
    const st = game.quests[qid];
    if (st.state === 'available') {
      return {
        text: q.intro,
        choices: [
          { label: `Accept: ${q.title}`, action: () => { st.state = 'active'; st.have = 0; toast(`Quest accepted — ${q.title}.`, 'quest', 2600); saveGame(); renderDialogue(npc); } },
          { label: 'Not now', action: closeDialogue }
        ]
      };
    }
    if (st.state === 'active') {
      return {
        text: `${q.active} (${st.have}/${q.need})`,
        choices: [
          { label: 'I will return when it is done.', action: closeDialogue },
          { label: 'Tell me about Emberhold.', action: () => { dom.dialogText.textContent = 'A town of three streets and one stubborn hearth. We were a waystation once, then a refuge, now a home. The crypt-light remembers when we were less.'; } }
        ]
      };
    }
    return {
      text: q.ready,
      choices: [
        {
          label: `Claim reward — ${q.rewardGold}g + ${q.rewardGear?.name || 'token'}`,
          action: () => {
            st.state = 'done';
            grantQuestReward(qid);
            if (q.next && game.quests[q.next]) game.quests[q.next].state = 'available';
            updateSaveSummary();
            renderDialogue(npc);
          }
        },
        { label: 'Later', action: closeDialogue }
      ]
    };
  }

  if (npc.id === 'smith') {
    const wCost = SMITH.weaponBase + p.upgrades.weapon * SMITH.weaponStep;
    const aCost = SMITH.armorBase + p.upgrades.armor * SMITH.armorStep;
    const wMax = p.upgrades.weapon >= SMITH.maxUpgrades;
    const aMax = p.upgrades.armor >= SMITH.maxUpgrades;
    return {
      text: `Coin first, stories later. I can temper what you carry, or sell you something that burns going down. You have ${Math.floor(p.gold)} gold.`,
      choices: [
        {
          label: wMax ? 'Weapon is already at its limit.' : `Temper weapon (+2 ATK)`,
          cost: wMax ? '' : `${wCost}g`,
          disabled: wMax || p.gold < wCost,
          action: () => {
            p.gold -= wCost; p.weapon.atk += 2; p.upgrades.weapon++;
            toast(`${p.weapon.name} tempered — ATK ${p.weapon.atk}.`, 'good', 2600);
            sfx.play('quest'); saveGame(); renderDialogue(npc);
          }
        },
        {
          label: aMax ? 'Armor is already at its limit.' : `Fit armor (+1 DEF)`,
          cost: aMax ? '' : `${aCost}g`,
          disabled: aMax || p.gold < aCost,
          action: () => {
            p.gold -= aCost; p.armor.def += 1; p.upgrades.armor++;
            toast(`${p.armor.name} fitted — DEF ${p.armor.def}.`, 'good', 2600);
            sfx.play('quest'); saveGame(); renderDialogue(npc);
          }
        },
        {
          label: p.potions >= POTION.max ? 'Your belt is full of tonics.' : 'Buy an Ember Tonic',
          cost: p.potions >= POTION.max ? '' : `${SMITH.potionCost}g`,
          disabled: p.potions >= POTION.max || p.gold < SMITH.potionCost,
          action: () => {
            p.gold -= SMITH.potionCost; p.potions++;
            toast('Ember Tonic purchased.', 'gold', 1800);
            sfx.play('potion'); saveGame(); renderDialogue(npc);
          }
        },
        { label: 'Leave the forge', action: closeDialogue }
      ]
    };
  }

  if (npc.id === 'priest') {
    return {
      text: p.hp < p.maxHp || p.mana < p.maxMana
        ? 'The ember does not judge. It only waits. Stand in the warmth and let it mend what the road took.'
        : 'You are whole, wanderer. That is rare enough. Rest a moment anyway; the hearth does not charge.',
      choices: [
        {
          label: 'Restore health and mana',
          action: () => {
            p.hp = p.maxHp; p.mana = p.maxMana;
            addEffect({ type: 'heal', x: p.x, y: p.y - 8, life: 0.8, maxLife: 0.8 });
            burst(p.x, p.y - 10, '#9ce6c9', 18, 50, 2.4);
            toast('The ember mends you. Health and mana restored.', 'good', 2200);
            sfx.play('mend'); renderDialogue(npc);
          }
        },
        { label: 'Leave', action: closeDialogue }
      ]
    };
  }

  if (npc.id === 'cook') {
    const ready = game.time >= (game.stewReadyAt || 0);
    return {
      text: ready
        ? 'Sit. Eat. The mire can wait an hour. There is stew, there is bread, and there is a fire that has not gone out in nine years.'
        : 'The pot is still working. Give it a minute, and keep your boots off my clean floor.',
      choices: [
        {
          label: ready ? 'Share the hearth (restore all)' : 'The stew is not ready yet.',
          disabled: !ready,
          action: () => {
            p.hp = p.maxHp; p.mana = p.maxMana;
            game.stewReadyAt = game.time + 75;
            addEffect({ type: 'heal', x: p.x, y: p.y - 8, life: 0.7, maxLife: 0.7 });
            toast('Bramble\'s stew: health and mana restored.', 'good', 2400);
            sfx.play('potion'); renderDialogue(npc);
          }
        },
        { label: 'What is in the crypt?', action: () => { dom.dialogText.textContent = 'Old light. Old oath. The Warden was a person once, or something that wore one. Now it sits on a throne of crypt-stone and waits for someone foolish enough to knock.'; } },
        { label: 'Leave', action: closeDialogue }
      ]
    };
  }

  return {
    text: npc.lines?.[0] || 'The road is long.',
    choices: [{ label: 'Leave', action: closeDialogue }]
  };
}

function showVictory() {
  if (!game.started) return;
  game.victoryShown = true;
  game.paused = true;
  const p = game.player;
  const mins = Math.round(p.playTime / 60);
  dom.victoryStats.innerHTML = `
    <div><b>${p.level}</b>Level</div>
    <div><b>${p.kills}</b>Kills</div>
    <div><b>${mins}m</b>Played</div>
  `;
  dom.victory.hidden = false;
  sfx.play('level');
  saveGame();
  updateSaveSummary();
}

function closeVictory() {
  dom.victory.hidden = true;
  game.victoryShown = true;
  if (!anyOverlayOpen()) game.paused = false;
  saveGame();
}

function respawnFromOverlay() {
  respawn();
}

// ---------- settings wiring ----------
dom.play.addEventListener('click', beginPlay);
dom.startSettings.addEventListener('click', openSettings);
dom.newJourney.addEventListener('click', armNewJourney);
dom.settingsClose.addEventListener('click', closeSettings);
dom.statsClose.addEventListener('click', closeStats);
dom.dialogClose.addEventListener('click', closeDialogue);
dom.respawn.addEventListener('click', respawnFromOverlay);
dom.victoryContinue.addEventListener('click', closeVictory);
$('btn-menu').addEventListener('click', openSettings);
dom.levelButton.addEventListener('click', openStats);
dom.btnSound.addEventListener('click', () => {
  settings.sound = !settings.sound;
  sfx.setEnabled(settings.sound);
  updateSoundIcon();
  writeJSON(SETTINGS_KEY, settings);
  if (settings.sound) { sfx.init(); sfx.play('ui'); }
});
dom.setQuality.addEventListener('change', () => {
  settings.quality = dom.setQuality.value;
  autoScale = 1;
  applyQuality();
  writeJSON(SETTINGS_KEY, settings);
});
dom.setFps.addEventListener('change', () => {
  settings.fps = Number(dom.setFps.value);
  writeJSON(SETTINGS_KEY, settings);
});
dom.setSound.addEventListener('change', () => {
  settings.sound = dom.setSound.checked;
  sfx.setEnabled(settings.sound);
  updateSoundIcon();
  writeJSON(SETTINGS_KEY, settings);
});
dom.setHaptics.addEventListener('change', () => {
  settings.haptics = dom.setHaptics.checked;
  writeJSON(SETTINGS_KEY, settings);
});
dom.setAutoattack.addEventListener('change', () => {
  settings.autoAttack = dom.setAutoattack.checked;
  writeJSON(SETTINGS_KEY, settings);
});
dom.setShowfps.addEventListener('change', () => {
  settings.showFps = dom.setShowfps.checked;
  dom.fps.hidden = !settings.showFps;
  writeJSON(SETTINGS_KEY, settings);
});
dom.lowend.addEventListener('click', () => {
  settings.quality = 'low';
  settings.fps = 24;
  settings.haptics = false;
  settings.autoAttack = true;
  settings.showFps = false;
  autoScale = 1;
  applyQuality();
  syncSettingsUI();
  writeJSON(SETTINGS_KEY, settings);
  toast('Low-end preset: 24 FPS, low effects, small render buffer.', 'good', 3200);
});
dom.reset.addEventListener('click', () => {
  if (window.confirm('Erase the saved journey and start fresh?')) {
    startNewJourney();
    closeSettings();
  }
});
window.addEventListener('pagehide', saveGame);
window.addEventListener('beforeunload', saveGame);

// ---------- boot ----------
function boot() {
  initNpcs();
  const loaded = loadSavedGame();
  if (!loaded) resetGame();
  game.scene = 'title';
  game.paused = false;
  game.started = false;
  dom.hud.hidden = true;
  dom.startScreen.hidden = false;
  resizeCanvas();
  updateSaveSummary();
  syncSettingsUI();
  updateCamera(1, true);
  render();
  setTimeout(() => {
    dom.loading.classList.add('done');
    setTimeout(() => dom.loading.remove(), 450);
  }, 80);
  requestAnimationFrame(loop);
  if (qs.has('selftest')) runSelfTest();
  installDebugApi();
}

// ---------- debug / self-test ----------
function installDebugApi() {
  if (!DEBUG) return;
  window.__ark = {
    state: () => ({
      scene: game.scene, started: game.started, paused: game.paused,
      player: game.player && {
        x: game.player.x, y: game.player.y, hp: game.player.hp, maxHp: game.player.maxHp,
        mana: game.player.mana, level: game.player.level, xp: game.player.xp,
        gold: game.player.gold, potions: game.player.potions,
        weapon: game.player.weapon, armor: game.player.armor
      },
      quests: game.quests, target: game.target && { id: game.target.id, type: game.target.type, hp: game.target.hp },
      monsters: game.monsters.filter(m => !m.dead).length,
      zone: game.zone, fps: fps.value, quality: quality.label, autoScale,
      view: { w: view.w, h: view.h, zoom: view.zoom, camX: view.camX, camY: view.camY },
      settings: { ...settings }
    }),
    start: beginPlay,
    teleport: (tx, ty) => {
      game.player.x = tx * TILE + 8;
      game.player.y = ty * TILE + 12;
      game.camera.x = game.player.x;
      game.camera.y = game.player.y;
      updateCamera(1, true);
    },
    spawn: (type, tx, ty) => {
      const def = MONSTER_TYPES[type];
      if (!def) return false;
      const m = {
        id: game.monsterId++, type, def,
        x: tx * TILE + 8, y: ty * TILE + 12, homeX: tx * TILE + 8, homeY: ty * TILE + 12,
        hp: def.hp, maxHp: def.hp, dead: false, respawn: 0, atkCd: 1,
        wanderT: 2, wx: tx * TILE + 8, wy: ty * TILE + 12, hitT: 0, lunge: 0, dir: 1,
        specialCd: 4, telegraph: null, state: 'idle', boss: Boolean(def.boss)
      };
      game.monsters.push(m);
      return m.id;
    },
    damageNearest: n => { const m = findNearestMonster(500); if (m) damageMonster(m, n, false); return Boolean(m); },
    killNearest: () => { const m = findNearestMonster(500); if (m) damageMonster(m, 99999, false); return Boolean(m); },
    heal: () => { game.player.hp = game.player.maxHp; game.player.mana = game.player.maxMana; },
    addGold: n => { game.player.gold += n; },
    setQuest: (id, state, have = 0) => { if (game.quests[id]) game.quests[id] = { ...game.quests[id], state, have }; },
    openDialogue: id => openDialogue(id),
    castEmber, castMend, drinkPotion, save: saveGame,
    selftest: runSelfTest,
    monstersAt: () => game.monsters.filter(m => !m.dead).map(m => ({ type: m.type, x: m.x, y: m.y, hp: m.hp })),
    walkableAt: (tx, ty) => world.walkableAt(tx, ty),
    reachable: (tx, ty) => {
      const reach = world.reachableFrom([Math.round(START.x), Math.round(START.y)]);
      return Boolean(reach[ty * MAP_W + tx]);
    }
  };
  window.__arkSelfTest = runSelfTest;
}

function runSelfTest() {
  const results = [];
  const check = (name, fn) => {
    try {
      const r = fn();
      results.push({ name, pass: r !== false, detail: typeof r === 'string' ? r : '' });
    } catch (err) {
      results.push({ name, pass: false, detail: err.message });
    }
  };

  check('map size', () => world.tiles.length === MAP_W * MAP_H && world.bg.width === MAP_W * TILE && world.bg.height === MAP_H * TILE);
  check('start is walkable', () => world.walkableAt(Math.round(START.x), Math.round(START.y)));
  check('temple is walkable', () => world.walkableAt(Math.round(TEMPLE_POS.x), Math.round(TEMPLE_POS.y)));
  check('all NPCs reachable', () => {
    const reach = world.reachableFrom([Math.round(START.x), Math.round(START.y)]);
    const blocked = NPCS.filter(n => !reach[Math.round(n.y) * MAP_W + Math.round(n.x)]);
    if (blocked.length) throw new Error(`blocked: ${blocked.map(n => n.id).join(',')}`);
    return true;
  });
  check('all monster spawns reachable', () => {
    const reach = world.reachableFrom([Math.round(START.x), Math.round(START.y)]);
    const blocked = SPAWNS.filter(([, x, y]) => !reach[y * MAP_W + x]);
    if (blocked.length) throw new Error(`blocked: ${blocked.map(s => `${s[0]}@${s[1]},${s[2]}`).join(',')}`);
    return true;
  });
  check('xp curve is monotonic', () => {
    for (let l = 1; l < 20; l++) if (XP_FOR_LEVEL(l + 1) <= XP_FOR_LEVEL(l)) throw new Error(`level ${l}`);
    return true;
  });
  check('rarity weights sum to 100', () => RARITIES.reduce((a, r) => a + r.weight, 0) === 100);
  check('quest chain is ordered', () => QUEST_ORDER.every((id, i) => i === QUEST_ORDER.length - 1 || QUESTS[id].next === QUEST_ORDER[i + 1]));
  check('save round-trip', () => {
    const raw = JSON.stringify(serializeGame());
    const back = JSON.parse(raw);
    if (!back.player || !back.quests) throw new Error('missing fields');
    return true;
  });
  const pass = results.every(r => r.pass);
  window.__ARK_SELFTEST__ = { pass, results };
  document.title = pass ? 'SELFTEST PASS — Arkenfall: Emberlight' : 'SELFTEST FAIL — Arkenfall: Emberlight';
  if (qs.has('selftest') || DEBUG) {
    console.table(results);
    const pre = document.createElement('pre');
    pre.id = 'selftest-output';
    pre.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:9999;font:10px monospace;color:#9ce6c9;background:#071010;padding:8px;max-width:90vw;white-space:pre-wrap;border:1px solid #355';
    pre.textContent = results.map(r => `${r.pass ? 'PASS' : 'FAIL'} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`).join('\n');
    document.body.appendChild(pre);
  }
  return window.__ARK_SELFTEST__;
}

try {
  boot();
} catch (err) {
  console.error(err);
  if (dom.loading) dom.loading.textContent = `Could not kindle the ember: ${err.message}`;
}



