// Shardfall - procedural pixel survival
const W = 1920;
const H = 1080;
const TILE = 64;
const WORLD = 320;
const DAY_LENGTH = 240;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const RESOLUTION_OPTIONS = new Set(['1920x1080', '1600x900', '1280x720', '960x540']);
const SETTINGS_KEY = 'shardfall_settings_v1';

function readSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
        const volume = (value, fallback) => Number.isFinite(Number(value)) ? Math.max(0, Math.min(1, Number(value))) : fallback;
        return {
            resolution: RESOLUTION_OPTIONS.has(saved.resolution) ? saved.resolution : '1920x1080',
            musicVolume: volume(saved.musicVolume, 0.4),
            sfxVolume: volume(saved.sfxVolume, 0.8),
            muted: !!saved.muted,
        };
    } catch {
        return { resolution: '1920x1080', musicVolume: 0.4, sfxVolume: 0.8, muted: false };
    }
}
const settings = readSettings();
let soundEffectsVolume = settings.sfxVolume;

function saveSettings() {
    try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch {}
}

const gameContainer = document.getElementById('game-container');
function resize() {
    const width = gameContainer.clientWidth || innerWidth;
    const height = gameContainer.clientHeight || innerHeight;
    const s = Math.min(width / W, height / H);
    canvas.style.width = `${W * s}px`;
    canvas.style.height = `${H * s}px`;
}

function applyRenderResolution() {
    const [renderWidth, renderHeight] = settings.resolution.split('x').map(Number);
    canvas.width = renderWidth;
    canvas.height = renderHeight;
    ctx.setTransform(renderWidth / W, 0, 0, renderHeight / H, 0, 0);
    ctx.imageSmoothingEnabled = false;
    resize();
}
addEventListener('resize', resize);
if ('ResizeObserver' in window) new ResizeObserver(resize).observe(gameContainer);
applyRenderResolution();

// ---------- Assets ----------
const IMG = {};
const imageNames = ['player', 'spider', 'slime', 'wolf', 'boss-treant', 'boss-golem', 'boss-wyrm',
    'tree', 'pine-tree', 'rock', 'berry-bush', 'gold-ore', 'lore-stone', 'altar', 'campfire', 'wood-wall', 'workbench', 'forge',
    'icon-wood', 'icon-stone', 'icon-berries', 'icon-meat', 'icon-gold', 'icon-axe', 'icon-pickaxe',
    'icon-sword', 'icon-shard', 'icon-torch', 'icon-armor', 'icon-spear',
    'shrine-forest', 'shrine-desert', 'shrine-snow'];
for (const n of imageNames) {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => { IMG[n] = img; };
    img.onerror = () => console.warn(`[Shardfall] Could not load image: assets/${n}.webp`);
    img.src = `assets/${n}.webp`;
    IMG[n] = img;
}

const music = new Audio('assets/audio/music.mp3');
music.loop = true;
music.volume = settings.musicVolume;
const sfxHit = new Audio('assets/audio/hit.mp3');
const sfxPickup = new Audio('assets/audio/pickup.mp3');
let muted = settings.muted;
music.muted = muted;
let audioCtx = null;

function setMuted(value) {
    muted = !!value;
    settings.muted = muted;
    music.muted = muted;
    const toggle = document.getElementById('muteSetting');
    if (toggle) toggle.checked = muted;
    saveSettings();
}

function playSfx(a, vol = 0.6) {
    if (muted || soundEffectsVolume <= 0) return;
    a.currentTime = 0;
    a.volume = Math.max(0, Math.min(1, vol * soundEffectsVolume));
    a.play().catch(() => {});
}

function beep(freq, dur = 0.12, type = 'square', vol = 0.08) {
    if (muted || !audioCtx) return;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol * soundEffectsVolume, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    o.connect(g).connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + dur);
}

// Draw a sprite anchored bottom-centre with squash/stretch & rotation support
function drawSprite(name, x, y, size, flip = false, alpha = 1, sx = 1, sy = 1, rot = 0) {
    const img = IMG[name];
    if (!img || !img.complete || !img.naturalWidth) return;
    const s = size / Math.max(img.naturalWidth, img.naturalHeight);
    const w = img.naturalWidth * s;
    const h = img.naturalHeight * s;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.translate(x, y);
    if (rot) ctx.rotate(rot);
    ctx.scale((flip ? -1 : 1) * sx, sy);
    ctx.drawImage(img, -w / 2, -h, w, h);
    ctx.restore();
}

// ---------- Story ----------
const LORE = [
    'Stone I: "When the Crown of Dawn shattered, the sun forgot its way home. Three guardians swallowed its shards and were sealed within shrines, sleeping."',
    'Stone II: "The Rootfather is bound beneath the Withered Shrine, deep in the forest. Return what was taken from the woods - 15 wood - and he will rise to reclaim it."',
    'Stone III: "The Sand Colossus hoards gold in its stone heart. Lay 8 gold in the bowl of the Sun Shrine among the dunes, and its greed will wake it."',
    'Stone IV: "The Frost Wyrm sleeps in the ice of the white wastes. Only fire breaks its seal - light the shrine\'s brazier with a torch and feed it 4 meat."',
    'Stone V: "The dark is alive. Never walk the night without flame, or the Gloom will feed."',
    'Stone VI: "Bring the three shards to the Altar where you woke. Dawn will answer."',
];

const BOSS_DEFS = [
    { kind: 'boss-treant', biome: 'forest', shrine: 'shrine-forest', name: 'The Rootfather', lore: 1,
        cost: { wood: 15 }, costText: '15 wood',
        intro: 'You lay the timber upon the roots. The ground splits... "THIEF OF MY BRANCHES!" The Rootfather tears free of the earth!' },
    { kind: 'boss-golem', biome: 'desert', shrine: 'shrine-desert', name: 'Sand Colossus', lore: 2,
        cost: { gold: 8 }, costText: '8 gold',
        intro: 'Gold clinks into the bowl. The dunes tremble as the Sand Colossus rises, eyes burning with greed: "MORE!"' },
    { kind: 'boss-wyrm', biome: 'snow', shrine: 'shrine-snow', name: 'Frost Wyrm', lore: 3,
        cost: { meat: 4 }, costText: '4 meat + a lit torch', torch: true,
        intro: 'Flame touches the brazier and the ice screams. Cracks race up the monolith... the Frost Wyrm bursts free in a storm of shards!' },
];

// ---------- RNG & noise ----------
function mulberry(seed) {
    return function () {
        seed |= 0;
        seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function hashStr(s) {
    let h = 2166136261;
    for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
    return h >>> 0;
}

function makeNoise(rand) {
    const size = 128;
    const grid = [];
    for (let i = 0; i < size * size; i++) grid.push(rand());
    const g = (x, y) => grid[((y % size + size) % size) * size + ((x % size + size) % size)];
    const smooth = t => t * t * (3 - 2 * t);
    function value(x, y) {
        const xi = Math.floor(x);
        const yi = Math.floor(y);
        const xf = smooth(x - xi);
        const yf = smooth(y - yi);
        const a = g(xi, yi) + (g(xi + 1, yi) - g(xi, yi)) * xf;
        const b = g(xi, yi + 1) + (g(xi + 1, yi + 1) - g(xi, yi + 1)) * xf;
        return a + (b - a) * yf;
    }
    return function fbm(x, y) {
        let v = 0;
        let amp = 0.5;
        let f = 1;
        for (let o = 0; o < 4; o++) {
            v += value(x * f, y * f) * amp;
            amp *= 0.5;
            f *= 2;
        }
        return v / 0.9375;
    };
}

// ---------- World ----------
const BIOME_COLORS = {
    water: ['#24507a', '#2a5a88', '#3a74a8'],
    grass: ['#5d8a3a', '#6a9844', '#7aaa50'],
    forest: ['#3c6b2c', '#457834', '#53883c'],
    desert: ['#cdb06a', '#d8bd78', '#e6cd8c'],
    snow: ['#dfe8ef', '#cfdbe5', '#f4f8fb'],
    swamp: ['#4a5a36', '#56653d', '#64744a'],
};
const MINI_COLORS = { water: '#2a5a88', grass: '#6a9844', forest: '#3c6b2c', desert: '#d8bd78', snow: '#e6eef4', swamp: '#56653d' };
const SOLID = new Set(['tree', 'pine-tree', 'rock', 'gold-ore', 'lore-stone', 'altar', 'wood-wall', 'workbench', 'forge', 'shrine']);
const OBJ_SIZE = { 'tree': 160, 'pine-tree': 160, 'rock': 72, 'berry-bush': 66, 'gold-ore': 74, 'lore-stone': 104, 'altar': 130, 'campfire': 72, 'wood-wall': 82, 'workbench': 92, 'forge': 112, 'shrine': 200 };
const OBJ_HP = { 'tree': 30, 'pine-tree': 30, 'rock': 40, 'gold-ore': 60, 'berry-bush': 1, 'wood-wall': 60, 'campfire': 20, 'workbench': 55, 'forge': 90 };

let world;
let state;
let partyRole = 'offline';
let partyName = 'Wanderer';
let partyRoomId = '';
let networkTimer = 0;
const partyPlayers = new Map();
const pendingWorldChanges = {};
let multiplayer = { peer: null, close() {}, send() {}, sendTo() {} };
let multiplayerPromise = null;
let multiplayerReady = false;
const miniBase = document.createElement('canvas');
miniBase.width = WORLD;
miniBase.height = WORLD;
const miniFog = document.createElement('canvas');
miniFog.width = WORLD;
miniFog.height = WORLD;

function generateWorld(seedStr) {
    const seed = hashStr(seedStr);
    const rand = mulberry(seed);
    const elev = makeNoise(rand);
    const moist = makeNoise(rand);
    const temp = makeNoise(rand);
    const biome = new Array(WORLD * WORLD);
    const objs = new Array(WORLD * WORLD).fill(null);
    for (let y = 0; y < WORLD; y++) {
        for (let x = 0; x < WORLD; x++) {
            const dx = x / WORLD - 0.5;
            const dy = y / WORLD - 0.5;
            const edge = Math.sqrt(dx * dx + dy * dy) * 1.4;
            const e = elev(x / 30, y / 30) - edge * edge * 0.9;
            const m = moist(x / 45, y / 45);
            const t = temp(x / 80, y / 80);
            let b;
            if (e < 0.2) b = 'water';
            else if (t < 0.38) b = 'snow';
            else if (t > 0.6 && m < 0.55) b = 'desert';
            else if (m > 0.62) b = 'swamp';
            else if (m > 0.47) b = 'forest';
            else b = 'grass';
            biome[y * WORLD + x] = b;
        }
    }
    for (let i = 0; i < WORLD * WORLD; i++) {
        const b = biome[i];
        const r = rand();
        let type = null;
        if (b === 'forest') type = r < 0.16 ? 'tree' : r < 0.185 ? 'berry-bush' : r < 0.2 ? 'rock' : null;
        else if (b === 'grass') type = r < 0.025 ? 'tree' : r < 0.045 ? 'berry-bush' : r < 0.06 ? 'rock' : null;
        else if (b === 'desert') type = r < 0.02 ? 'rock' : r < 0.035 ? 'gold-ore' : null;
        else if (b === 'snow') type = r < 0.06 ? 'pine-tree' : r < 0.08 ? 'rock' : r < 0.09 ? 'gold-ore' : null;
        else if (b === 'swamp') type = r < 0.05 ? 'tree' : r < 0.08 ? 'berry-bush' : null;
        if (type) objs[i] = { type, hp: OBJ_HP[type] || 10, regrow: 0, seed: rand() };
    }
    world = { biome, objs, rand, seedStr, shade: new Float32Array(WORLD * WORLD) };
    for (let i = 0; i < WORLD * WORLD; i++) world.shade[i] = rand();

    let spawn = null;
    for (let r = 0; r < 120 && !spawn; r++) {
        for (let a = 0; a < 40; a++) {
            const x = Math.round(WORLD / 2 + Math.cos(a) * r);
            const y = Math.round(WORLD / 2 + Math.sin(a) * r);
            const b = biome[y * WORLD + x];
            if (b === 'grass' || b === 'forest') {
                spawn = { x, y };
                break;
            }
        }
    }
    if (!spawn) spawn = { x: WORLD / 2, y: WORLD / 2 };
    clearArea(spawn.x, spawn.y, 4);
    setObj(spawn.x, spawn.y - 1, { type: 'altar' });
    world.spawn = spawn;

    world.bosses = [];
    for (let i = 0; i < BOSS_DEFS.length; i++) {
        const def = BOSS_DEFS[i];
        const p = findTile(t => t === def.biome, 70) || findTile(t => t !== 'water', 60) || { x: spawn.x + 40, y: spawn.y };
        clearArea(p.x, p.y, 5);
        setObj(p.x, p.y, { type: 'shrine', boss: i });
        world.bosses.push({ ...def, tx: p.x, ty: p.y, state: 'sealed' });
    }
    world.lore = [];
    for (let i = 0; i < LORE.length; i++) {
        const minD = i === 0 ? 5 : 14 + i * 10;
        let p = null;
        for (let tries = 0; tries < 600 && !p; tries++) {
            const ang = rand() * Math.PI * 2;
            const d = minD + rand() * 16;
            const x = Math.round(spawn.x + Math.cos(ang) * d);
            const y = Math.round(spawn.y + Math.sin(ang) * d);
            if (x > 1 && y > 1 && x < WORLD - 2 && y < WORLD - 2 && biome[y * WORLD + x] !== 'water') p = { x, y };
        }
        if (p) {
            setObj(p.x, p.y, { type: 'lore-stone', idx: i });
            world.lore.push(p);
        }
    }

    // minimap
    const mctx = miniBase.getContext('2d');
    const imgData = mctx.createImageData(WORLD, WORLD);
    for (let i = 0; i < WORLD * WORLD; i++) {
        const c = MINI_COLORS[biome[i]];
        const n = parseInt(c.slice(1), 16);
        const o = objs[i];
        const dark = o && (o.type === 'tree' || o.type === 'pine-tree') ? 0.75 : 1;
        imgData.data[i * 4] = ((n >> 16) & 255) * dark;
        imgData.data[i * 4 + 1] = ((n >> 8) & 255) * dark;
        imgData.data[i * 4 + 2] = (n & 255) * dark;
        imgData.data[i * 4 + 3] = 255;
    }
    mctx.putImageData(imgData, 0, 0);
    const fctx = miniFog.getContext('2d');
    fctx.globalCompositeOperation = 'source-over';
    fctx.fillStyle = '#0b0a10';
    fctx.fillRect(0, 0, WORLD, WORLD);
    world.changes = {};
}

function findTile(pred, minDist) {
    const s = world.spawn;
    for (let tries = 0; tries < 20000; tries++) {
        const x = 8 + Math.floor(world.rand() * (WORLD - 16));
        const y = 8 + Math.floor(world.rand() * (WORLD - 16));
        if (Math.hypot(x - s.x, y - s.y) < minDist) continue;
        if (world.bosses.some(b => Math.hypot(b.tx - x, b.ty - y) < 70)) continue;
        if (pred(world.biome[y * WORLD + x])) return { x, y };
    }
    return null;
}

function clearArea(cx, cy, r) {
    for (let y = cy - r; y <= cy + r; y++) {
        for (let x = cx - r; x <= cx + r; x++) {
            if (x < 0 || y < 0 || x >= WORLD || y >= WORLD) continue;
            world.objs[y * WORLD + x] = null;
            if (world.biome[y * WORLD + x] === 'water') world.biome[y * WORLD + x] = 'grass';
        }
    }
}

function getObj(x, y) {
    if (x < 0 || y < 0 || x >= WORLD || y >= WORLD) return null;
    return world.objs[y * WORLD + x];
}

function setObj(x, y, o) {
    const key = y * WORLD + x;
    const value = o ? { ...o } : null;
    world.objs[key] = value;
    if (world.changes) world.changes[key] = value;
    if (partyRole === 'client') pendingWorldChanges[key] = value;
}

function biomeAt(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= WORLD || ty >= WORLD) return 'water';
    return world.biome[ty * WORLD + tx];
}

function blocked(px, py) {
    const tx = Math.floor(px / TILE);
    const ty = Math.floor(py / TILE);
    if (biomeAt(tx, ty) === 'water') return true;
    const o = getObj(tx, ty);
    return !!(o && SOLID.has(o.type));
}

function canStand(px, py, r) {
    return !blocked(px - r, py - r / 2) && !blocked(px + r, py - r / 2) && !blocked(px - r, py + r / 2) && !blocked(px + r, py + r / 2);
}

function moveEntity(e, dx, dy, r) {
    if (canStand(e.x + dx, e.y, r)) e.x += dx;
    if (canStand(e.x, e.y + dy, r)) e.y += dy;
}

// ---------- Game state ----------
const ENEMY_DEFS = {
    spider: { hp: 30, dmg: 8, speed: 170, size: 72, meat: 1 },
    slime: { hp: 40, dmg: 10, speed: 110, size: 66, meat: 1 },
    wolf: { hp: 55, dmg: 12, speed: 210, size: 88, meat: 2 },
    'boss-treant': { hp: 600, dmg: 22, speed: 90, size: 240 },
    'boss-golem': { hp: 800, dmg: 28, speed: 80, size: 240 },
    'boss-wyrm': { hp: 1000, dmg: 25, speed: 120, size: 260 },
};

function newGame(seedStr) {
    generateWorld(seedStr);
    const s = world.spawn;
    state = {
        level: 1,
        xp: 0,
        pendingLevels: 0,
        perks: {},
        cycle: 0,
        kills: 0,
        menuOpen: false,
        inventoryOpen: false,
        hotbar: ['berries', 'wood', 'stone', 'meat', 'cooked', 'campfire', 'wall', 'workbench', 'shard'],
        selectedSlot: 0,
        saveT: 30,
        player: { x: s.x * TILE + TILE / 2, y: (s.y + 1) * TILE + TILE / 2, hp: 100, maxHp: 100, hunger: 100, face: 1, atkCd: 0, hurt: 0, swing: 0, walkT: 0, dustT: 0, lean: 0 },
        inv: { wood: 0, stone: 3, berries: 3, meat: 0, cooked: 0, gold: 0, shard: 0, campfire: 0, wall: 0, workbench: 0, forge: 0 },
        tools: { axe: false, pickaxe: false, spear: false, sword: false, armor: false, torch: 0, steelSpear: false, greatsword: false, plate: false },
        torchOn: false,
        time: DAY_LENGTH * 0.05,
        day: 1,
        enemies: [],
        projectiles: [],
        particles: [],
        ambient: [],
        fx: [],
        texts: [],
        cam: { x: 0, y: 0 },
        shake: 0,
        gloom: 0,
        spawnTimer: 2,
        fogT: 0,
        hpShown: 100,
        dialog: { text: 'You wake beside a cold Altar. A voice whispers: "Restore the Crown of Dawn..." Read the standing stones to learn more.', t: 9 },
        over: false,
    };
    state.cam.x = state.player.x - W / 2;
    state.cam.y = state.player.y - H / 2;
    window.ProgressLogger?.logProgress?.('new_world', { seed: seedStr });
}

// ---------- Input ----------
const keys = {};
const mouse = { x: 0, y: 0, down: false };
const touchControlsEl = document.getElementById('touchControls');
const touchEnabled = (navigator.maxTouchPoints || 0) > 0 || !!window.matchMedia?.('(pointer: coarse)').matches;
const touchKeys = new Set();
const touchMovePointers = new Map();
let touchActionHeld = false;

function touchInputAllowed() {
    return !!state && !state.over && !state.menuOpen && !state.inventoryOpen;
}
function clearTouchInput() {
    touchMovePointers.clear();
    touchKeys.clear();
    touchActionHeld = false;
    mouse.down = false;
    touchControlsEl.querySelectorAll('.held').forEach(button => button.classList.remove('held'));
}
function syncTouchControls() {
    const visible = touchEnabled && !!state && !state.over && !state.menuOpen && !state.inventoryOpen && menuEl.classList.contains('hidden');
    touchControlsEl.classList.toggle('hidden', !visible);
    if (!visible) clearTouchInput();
}
function toggleTorch() {
    if (!state || state.over || state.menuOpen || state.inventoryOpen) return;
    if (state.tools.torch > 0) state.torchOn = !state.torchOn;
    else floatText(state.player.x, state.player.y - 90, 'No torch!', '#f88');
}

for (const button of touchControlsEl.querySelectorAll('[data-touch-dir]')) {
    button.addEventListener('pointerdown', e => {
        e.preventDefault();
        if (!touchInputAllowed()) return;
        const key = button.dataset.touchDir;
        touchMovePointers.set(e.pointerId, key);
        touchKeys.add(key);
        button.classList.add('held');
        try { button.setPointerCapture(e.pointerId); } catch {}
    });
    const releaseDirection = e => {
        const key = touchMovePointers.get(e.pointerId);
        if (!key) return;
        touchMovePointers.delete(e.pointerId);
        if (![...touchMovePointers.values()].includes(key)) touchKeys.delete(key);
        if (![...touchMovePointers.values()].includes(button.dataset.touchDir)) button.classList.remove('held');
    };
    button.addEventListener('pointerup', releaseDirection);
    button.addEventListener('pointercancel', releaseDirection);
    button.addEventListener('lostpointercapture', releaseDirection);
}
const touchActionButton = document.getElementById('touchAction');
touchActionButton.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (!touchInputAllowed()) return;
    touchActionHeld = true;
    mouse.down = true;
    touchActionButton.classList.add('held');
    try { touchActionButton.setPointerCapture(e.pointerId); } catch {}
});
const releaseTouchAction = () => {
    touchActionHeld = false;
    mouse.down = false;
    touchActionButton.classList.remove('held');
};
touchActionButton.addEventListener('pointerup', releaseTouchAction);
touchActionButton.addEventListener('pointercancel', releaseTouchAction);
touchActionButton.addEventListener('lostpointercapture', releaseTouchAction);
touchActionButton.addEventListener('click', e => {
    if (e.detail !== 0 || !touchInputAllowed()) return;
    aimNearestTouchTarget();
    primaryAction();
});
const touchCommands = {
    touchInventory: () => toggleInventory(),
    touchEat: () => eat(),
    touchTorch: () => toggleTorch(),
    touchFire: () => placeBuildNearPlayer('campfire'),
    touchWall: () => placeBuildNearPlayer('wall'),
    touchWorkbench: () => placeBuildNearPlayer('workbench'),
    touchForge: () => placeBuildNearPlayer('forge'),
    touchMute: () => setMuted(!muted),
};
for (const [id, command] of Object.entries(touchCommands)) {
    document.getElementById(id).addEventListener('click', e => {
        e.preventDefault();
        if (touchInputAllowed()) command();
    });
}
addEventListener('blur', clearTouchInput);
addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    keys[k] = true;
    if (!state || state.over) return;
    if (k === 'e' || k === 'c') {
        toggleInventory();
        return;
    }
    if (state.inventoryOpen) {
        if (k === 'escape') toggleInventory(false);
        const slot = Number(k);
        if (slot >= 1 && slot <= 9) {
            state.selectedSlot = slot - 1;
            renderInventorySlots();
        }
        return;
    }
    if (state.menuOpen) return;
    if (k === 'f') eat();
    if (k === 't') toggleTorch();
    if (k === '1') placeBuild('campfire');
    if (k === '2') placeBuild('wall');
    if (k === '3') placeBuild('workbench');
    if (k === '4') placeBuild('forge');
    if (k === 'm') setMuted(!muted);
});
addEventListener('keyup', e => {
    keys[e.key.toLowerCase()] = false;
});
function updateMousePosition(e) {
    const r = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - r.left) / r.width * W;
    mouse.y = (e.clientY - r.top) / r.height * H;
}
function hotbarIndexAt(x, y) {
    const size = 72;
    const gap = 8;
    const total = size * 9 + gap * 8;
    const start = (W - total) / 2;
    const top = H - 100;
    if (y < top || y > top + size) return -1;
    const i = Math.floor((x - start) / (size + gap));
    if (i < 0 || i >= 9 || x > start + i * (size + gap) + size) return -1;
    return i;
}
canvas.addEventListener('pointermove', updateMousePosition);
canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    updateMousePosition(e);
    if (!state || state.inventoryOpen) {
        mouse.down = false;
        return;
    }
    const slot = hotbarIndexAt(mouse.x, mouse.y);
    if (slot >= 0) {
        state.selectedSlot = slot;
        mouse.down = false;
        return;
    }
    mouse.down = true;
});
addEventListener('pointerup', () => {
    if (!touchActionHeld) mouse.down = false;
});

function worldMouse() {
    return { x: mouse.x + state.cam.x, y: mouse.y + state.cam.y };
}
function aimNearestTouchTarget() {
    if (!state || !world) return;
    const p = state.player;
    let target = null;
    let nearest = Infinity;
    for (const enemy of state.enemies) {
        if (enemy.intro > 0) continue;
        const size = ENEMY_DEFS[enemy.kind].size;
        const distance = Math.hypot(enemy.x - p.x, enemy.y - p.y);
        if (distance < 130 + size * 0.35 && distance < nearest) {
            nearest = distance;
            target = { x: enemy.x, y: enemy.y - size * 0.35 };
        }
    }
    const tx = Math.floor(p.x / TILE);
    const ty = Math.floor(p.y / TILE);
    for (let y = ty - 3; y <= ty + 3; y++) {
        for (let x = tx - 3; x <= tx + 3; x++) {
            const object = getObj(x, y);
            if (!object) continue;
            const cx = x * TILE + 32;
            const cy = y * TILE + 32;
            const distance = Math.hypot(cx - p.x, cy - p.y);
            const reach = object.type === 'shrine' ? 200 : 150;
            if (distance <= reach && distance < nearest) {
                nearest = distance;
                target = { x: cx, y: cy };
            }
        }
    }
    if (!target) target = { x: p.x + (p.face || 1) * 110, y: p.y - 32 };
    mouse.x = target.x - state.cam.x;
    mouse.y = target.y - state.cam.y;
}

// ---------- Crafting ----------
const RECIPES = [
    { id: 'axe', name: 'Stone Axe', icon: 'icon-axe', cost: { wood: 3, stone: 2 }, desc: 'Chop faster', station: 0 },
    { id: 'pickaxe', name: 'Stone Pickaxe', icon: 'icon-pickaxe', cost: { wood: 3, stone: 3 }, desc: 'Mine rock & gold', station: 0 },
    { id: 'torch', name: 'Torch', icon: 'icon-torch', cost: { wood: 2 }, desc: 'Light for 90s (T)', station: 0 },
    { id: 'spear', name: 'Flint Spear', icon: 'icon-spear', cost: { wood: 4, stone: 4 }, desc: 'Damage 18', station: 0 },
    { id: 'campfire', name: 'Campfire', icon: 'campfire', cost: { wood: 6, stone: 3 }, desc: 'Place with 1', station: 0 },
    { id: 'wall', name: 'Wood Wall', icon: 'wood-wall', cost: { wood: 4 }, desc: 'Place with 2', station: 0 },
    { id: 'workbench', name: 'Workbench', icon: 'workbench', cost: { wood: 8, stone: 4 }, desc: 'Place with 3 · unlocks improved gear', station: 0 },
    { id: 'sword', name: 'Gold Sword', icon: 'icon-sword', cost: { wood: 2, gold: 5 }, desc: 'Damage 35 · workbench', station: 1 },
    { id: 'armor', name: 'Reinforced Armor', icon: 'icon-armor', cost: { stone: 10, gold: 3 }, desc: 'Take 45% less damage · workbench', station: 1 },
    { id: 'forge', name: 'Forge', icon: 'forge', cost: { wood: 8, stone: 18, gold: 4 }, desc: 'Place with 4 · unlocks masterwork gear', station: 1 },
    { id: 'steelSpear', name: 'Tempered Spear', icon: 'icon-spear', cost: { wood: 4, stone: 8, gold: 5 }, desc: 'Damage 42 · forge', station: 2 },
    { id: 'greatsword', name: 'Crown Greatsword', icon: 'icon-sword', cost: { wood: 6, stone: 12, gold: 12 }, desc: 'Damage 58 · forge', station: 2 },
    { id: 'plate', name: 'Warden Plate', icon: 'icon-armor', cost: { stone: 18, gold: 8 }, desc: 'Take 65% less damage · forge', station: 2 },
];
const craftEl = document.getElementById('craft');
const recipesEl = document.getElementById('recipes');
const inventoryGridEl = document.getElementById('inventoryGrid');
const inventoryHotbarEl = document.getElementById('inventoryHotbar');
const stationStatusEl = document.getElementById('stationStatus');
const ITEM_DEFS = [
    ['wood', 'Wood', 'icon-wood', 'inv'], ['stone', 'Stone', 'icon-stone', 'inv'], ['berries', 'Berries', 'icon-berries', 'inv'],
    ['meat', 'Raw Meat', 'icon-meat', 'inv'], ['cooked', 'Cooked Meat', 'icon-meat', 'inv'], ['gold', 'Gold', 'icon-gold', 'inv'],
    ['shard', 'Crown Shard', 'icon-shard', 'inv'], ['campfire', 'Campfire', 'campfire', 'inv'], ['wall', 'Wood Wall', 'wood-wall', 'inv'],
    ['workbench', 'Workbench', 'workbench', 'inv'], ['forge', 'Forge', 'forge', 'inv'], ['axe', 'Stone Axe', 'icon-axe', 'tool'],
    ['pickaxe', 'Stone Pickaxe', 'icon-pickaxe', 'tool'], ['torch', 'Torch', 'icon-torch', 'torch'], ['spear', 'Flint Spear', 'icon-spear', 'tool'],
    ['steelSpear', 'Tempered Spear', 'icon-spear', 'tool'], ['sword', 'Gold Sword', 'icon-sword', 'tool'], ['greatsword', 'Crown Greatsword', 'icon-sword', 'tool'],
    ['armor', 'Reinforced Armor', 'icon-armor', 'tool'], ['plate', 'Warden Plate', 'icon-armor', 'tool'],
].map(([key, name, icon, type]) => ({ key, name, icon, type }));
function itemCount(item) {
    if (item.type === 'inv') return state.inv[item.key] || 0;
    if (item.type === 'tool') return state.tools[item.key] ? 1 : 0;
    return state.tools.torch > 0 ? 1 : 0;
}
function getItem(key) {
    return ITEM_DEFS.find(item => item.key === key) || ITEM_DEFS[0];
}
function canAfford(r) {
    return Object.entries(r.cost).every(([k, v]) => (state.inv[k] || 0) >= v);
}
function owned(r) {
    return ['axe', 'pickaxe', 'spear', 'steelSpear', 'sword', 'greatsword', 'armor', 'plate'].includes(r.id) && state.tools[r.id];
}
function nearbyStation() {
    const p = state.player;
    let level = 0;
    const tx = Math.floor(p.x / TILE);
    const ty = Math.floor(p.y / TILE);
    for (let y = ty - 4; y <= ty + 4; y++) {
        for (let x = tx - 4; x <= tx + 4; x++) {
            const o = getObj(x, y);
            if (!o || !['workbench', 'forge'].includes(o.type)) continue;
            if (Math.hypot((x + 0.5) * TILE - p.x, (y + 0.5) * TILE - p.y) <= 260) {
                level = Math.max(level, o.type === 'forge' ? 2 : 1);
            }
        }
    }
    return level;
}
function buildRecipeUI() {
    recipesEl.innerHTML = '';
    for (const r of RECIPES) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'rec no';
        button.innerHTML = `<img src="assets/${r.icon}.webp" alt=""><span class="recipe-copy"><span class="recipe-name">${r.name}</span><br><span class="recipe-cost"></span><br><span class="recipe-desc">${r.desc}</span></span>`;
        button.onclick = () => craft(r);
        r.el = button;
        recipesEl.appendChild(button);
    }
    refreshRecipeUI();
}
function slotButton(item, count, index, isHotbar = false) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'inv-slot' + (isHotbar && index === state.selectedSlot ? ' selected' : '');
    button.title = item ? `${item.name}${count > 1 ? ` ×${count}` : ''}` : 'Empty slot';
    if (item && count > 0) {
        button.innerHTML = `<img src="assets/${item.icon}.webp" alt=""><span class="stack">${count > 1 ? count : ''}</span>`;
    }
    if (isHotbar) {
        const num = document.createElement('span');
        num.className = 'slot-num';
        num.textContent = String(index + 1);
        button.appendChild(num);
        button.onclick = () => {
            state.selectedSlot = index;
            renderInventorySlots();
        };
    } else if (item) {
        button.onclick = () => {
            state.hotbar[state.selectedSlot] = item.key;
            renderInventorySlots();
        };
    }
    return button;
}
function renderInventorySlots() {
    if (!state) return;
    inventoryGridEl.replaceChildren();
    const hot = new Set(state.hotbar);
    const stored = ITEM_DEFS.filter(item => itemCount(item) > 0 && !hot.has(item.key));
    for (let i = 0; i < 27; i++) {
        const item = stored[i];
        inventoryGridEl.appendChild(slotButton(item, item ? itemCount(item) : 0, i));
    }
    inventoryHotbarEl.replaceChildren();
    for (let i = 0; i < 9; i++) {
        const item = getItem(state.hotbar[i]);
        inventoryHotbarEl.appendChild(slotButton(item, itemCount(item), i, true));
    }
}
function refreshRecipeUI() {
    if (!state) return;
    const station = nearbyStation();
    stationStatusEl.textContent = station === 2 ? 'Forge nearby · hand, workbench & masterwork recipes available' : station === 1 ? 'Workbench nearby · hand & improved gear available' : 'Hand crafting · place a workbench (3) or forge (4) for advanced gear';
    for (const r of RECIPES) {
        const available = station >= r.station;
        const ok = canAfford(r) && !owned(r) && available;
        r.el.className = 'rec ' + (ok ? 'ok' : 'no');
        const cost = Object.entries(r.cost).map(([k, v]) => `${v} ${k}`).join(' · ');
        const requirement = r.station === 2 ? 'Forge required' : r.station === 1 ? 'Workbench required' : 'Hand craft';
        r.el.querySelector('.recipe-cost').textContent = `${cost}  |  ${requirement}${owned(r) ? '  |  Already crafted' : ''}`;
    }
    renderInventorySlots();
}
function toggleInventory(force) {
    if (!state || state.over || state.menuOpen) return;
    state.inventoryOpen = typeof force === 'boolean' ? force : !state.inventoryOpen;
    mouse.down = false;
    craftEl.style.display = state.inventoryOpen ? 'flex' : 'none';
    syncTouchControls();
    if (state.inventoryOpen) refreshRecipeUI();
}
function craft(r) {
    const station = nearbyStation();
    if (station < r.station) {
        floatText(state.player.x, state.player.y - 100, r.station === 2 ? 'Need to stand by a Forge' : 'Need to stand by a Workbench', '#f88');
        beep(120);
        return;
    }
    if (!canAfford(r) || owned(r)) {
        beep(120);
        return;
    }
    for (const [k, v] of Object.entries(r.cost)) state.inv[k] -= v;
    if (r.id === 'torch') state.tools.torch += 90 * (1 + 0.5 * perk('ember'));
    else if (['campfire', 'wall', 'workbench', 'forge'].includes(r.id)) state.inv[r.id]++;
    else state.tools[r.id] = true;
    playSfx(sfxPickup);
    beep(660, 0.15);
    floatText(state.player.x, state.player.y - 110, `Crafted ${r.name}!`, '#9f9');
    burst(state.player.x, state.player.y - 50, '#ffe08a', 14, true);
    state.fx.push({ type: 'pop', name: r.icon, x: state.player.x, y: state.player.y - 60, t: 0, max: 1 });
    refreshRecipeUI();
}

function placeBuild(kind) {
    if (state.inv[kind] <= 0) {
        floatText(state.player.x, state.player.y - 90, `Craft a ${kind} first (C)`, '#f88');
        return;
    }
    const m = worldMouse();
    const tx = Math.floor(m.x / TILE);
    const ty = Math.floor(m.y / TILE);
    const p = state.player;
    if (Math.hypot(m.x - p.x, m.y - p.y) > 260 || getObj(tx, ty) || biomeAt(tx, ty) === 'water') {
        floatText(p.x, p.y - 90, "Can't build there", '#f88');
        return;
    }
    if (tx === Math.floor(p.x / TILE) && ty === Math.floor(p.y / TILE)) return;
    state.inv[kind]--;
    const type = kind === 'wall' ? 'wood-wall' : kind;
    const obj = type === 'campfire'
        ? { type, hp: 20, fuel: 150 * (1 + 0.5 * perk('ember')), born: state.time }
        : { type, hp: OBJ_HP[type] || 60, born: state.time };
    setObj(tx, ty, obj);
    burst(tx * TILE + 32, ty * TILE + 50, '#b08a5a', 10);
    beep(300, 0.1, 'triangle');
}

function placeBuildNearPlayer(kind) {
    if (!state || !world) return;
    const p = state.player;
    const tx = Math.floor(p.x / TILE);
    const ty = Math.floor(p.y / TILE);
    const face = p.face || 1;
    const offsets = [[face, 0], [face, -1], [face, 1], [0, -1], [0, 1], [-face, 0], [face * 2, 0]];
    let tile = null;
    for (const [dx, dy] of offsets) {
        const x = tx + dx;
        const y = ty + dy;
        if (getObj(x, y) || biomeAt(x, y) === 'water') continue;
        if (Math.hypot((x + 0.5) * TILE - p.x, (y + 0.5) * TILE - p.y) > 260) continue;
        tile = { x, y };
        break;
    }
    if (!tile) {
        floatText(p.x, p.y - 90, "Can't build nearby", '#f88');
        return;
    }
    mouse.x = (tile.x + 0.5) * TILE - state.cam.x;
    mouse.y = (tile.y + 0.5) * TILE - state.cam.y;
    placeBuild(kind);
}

function eat() {
    const inv = state.inv;
    const pl = state.player;
    if (inv.cooked > 0) {
        inv.cooked--;
        pl.hunger = Math.min(100, pl.hunger + 45);
        pl.hp = Math.min(pl.maxHp, pl.hp + 20);
    } else if (inv.meat > 0) {
        inv.meat--;
        pl.hunger = Math.min(100, pl.hunger + 30);
        pl.hp = Math.min(pl.maxHp, pl.hp + 8);
    } else if (inv.berries > 0) {
        inv.berries--;
        pl.hunger = Math.min(100, pl.hunger + 15);
        pl.hp = Math.min(pl.maxHp, pl.hp + 3);
    } else {
        floatText(state.player.x, state.player.y - 90, 'Nothing to eat', '#f88');
        return;
    }
    burst(state.player.x, state.player.y - 60, '#e55', 6);
    beep(500, 0.08, 'triangle');
    beep(700, 0.08, 'triangle');
}

// ---------- FX helpers ----------
function burst(x, y, color, n = 8, sparkle = false) {
    for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const s = 60 + Math.random() * 200;
        state.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 80, life: 0.5 + Math.random() * 0.4, max: 0.9, color, size: 4 + Math.random() * 5, grav: sparkle ? 0 : 500 });
    }
}

function floatText(x, y, text, color = '#fff') {
    state.texts.push({ x, y, text, color, life: 1.3 });
}

// ---------- Actions ----------
function playerDamage() {
    const base = state.tools.greatsword ? 58 : state.tools.steelSpear ? 42 : state.tools.sword ? 35 : state.tools.spear ? 18 : 8;
    return Math.round(base * (1 + 0.15 * perk('might')));
}

// ---------- Progression ----------
const PERKS = [
    { id: 'vital', name: 'Vitality', desc: '+20 max health and a full heal' },
    { id: 'might', name: 'Might', desc: '+15% weapon damage' },
    { id: 'swift', name: 'Swiftness', desc: '+10% move speed' },
    { id: 'forager', name: 'Forager', desc: '+30% chance of an extra item from every gather and kill' },
    { id: 'iron', name: 'Iron Stomach', desc: 'Hunger drains 20% slower' },
    { id: 'hide', name: 'Thick Hide', desc: 'Take 10% less damage' },
    { id: 'leech', name: 'Bloodthirst', desc: 'Heal 4 HP for every kill' },
    { id: 'lumber', name: 'Strong Arms', desc: 'Chop and mine 40% faster' },
    { id: 'ember', name: 'Ember Soul', desc: 'Torches and campfires burn 50% longer' },
    { id: 'night', name: 'Night Eyes', desc: 'The Gloom waits 3s longer and hurts 30% less' },
];
function perk(id) {
    return (state && state.perks[id]) || 0;
}
function xpNeeded() {
    return 20 + state.level * 18;
}
function addXp(n) {
    state.xp += Math.round(n);
    while (state.xp >= xpNeeded()) {
        state.xp -= xpNeeded();
        state.level++;
        state.pendingLevels++;
        floatText(state.player.x, state.player.y - 140, `LEVEL ${state.level}!`, '#ffe08a');
        burst(state.player.x, state.player.y - 60, '#ffe08a', 30, true);
        beep(520, 0.12, 'square');
        beep(780, 0.25, 'square');
    }
}
const levelEl = document.getElementById('levelup');
function openPerkMenu() {
    state.menuOpen = true;
    mouse.down = false;
    syncTouchControls();
    const pool = [...PERKS].sort(() => Math.random() - 0.5).slice(0, 3);
    const box = document.getElementById('perks');
    box.innerHTML = '';
    document.getElementById('lvText').textContent = `Level ${state.level}. Choose a blessing.`;
    for (const pk of pool) {
        const b = document.createElement('button');
        b.className = 'btn perk';
        b.innerHTML = `<b>${pk.name}${perk(pk.id) ? ' ' + 'I'.repeat(Math.min(5, perk(pk.id) + 1)) : ''}</b>${pk.desc}`;
        b.onclick = () => {
            state.perks[pk.id] = perk(pk.id) + 1;
            if (pk.id === 'vital') {
                state.player.maxHp += 20;
                state.player.hp = state.player.maxHp;
            }
            state.pendingLevels--;
            state.menuOpen = false;
            levelEl.classList.add('hidden');
            syncTouchControls();
            beep(660, 0.15);
        };
        box.appendChild(b);
    }
    levelEl.classList.remove('hidden');
}

// ---------- Save / records ----------
const SAVE_KEY = 'shardfall_save_v1';
const REC_KEY = 'shardfall_records_v1';
function loadRecords() {
    try {
        return JSON.parse(localStorage.getItem(REC_KEY)) || {};
    } catch {
        return {};
    }
}
function updateRecords(extra = {}) {
    const r = loadRecords();
    r.bestDay = Math.max(r.bestDay || 0, state.day);
    r.bestLevel = Math.max(r.bestLevel || 0, state.level);
    r.bestCycle = Math.max(r.bestCycle || 0, state.cycle);
    r.kills = (r.kills || 0) + state.kills;
    state.kills = 0;
    r.wins = (r.wins || 0) + (extra.win ? 1 : 0);
    try {
        localStorage.setItem(REC_KEY, JSON.stringify(r));
    } catch {}
}
function saveGame() {
    if (!state || state.over || partyRole !== 'offline') return;
    const changes = {};
    for (const [k, o] of Object.entries(world.changes)) {
        if (o) {
            const c = { ...o };
            delete c.shake;
            changes[k] = c;
        } else changes[k] = null;
    }
    const st = {
        player: { ...state.player }, inv: state.inv, tools: state.tools, torchOn: false, time: state.time, day: state.day,
        level: state.level, xp: state.xp, pendingLevels: state.pendingLevels, perks: state.perks, cycle: state.cycle,
        hotbar: state.hotbar, selectedSlot: state.selectedSlot,
    };
    const data = { seed: world.seedStr, st, changes, bosses: world.bosses.map(b => (b.state === 'awake' ? 'sealed' : b.state)), fog: miniFog.toDataURL() };
    try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    } catch {}
}
function hasSave() {
    try {
        return !!localStorage.getItem(SAVE_KEY);
    } catch {
        return false;
    }
}
function clearSave() {
    try {
        localStorage.removeItem(SAVE_KEY);
    } catch {}
}
function loadGame() {
    const data = JSON.parse(localStorage.getItem(SAVE_KEY));
    newGame(data.seed);
    world.changes = {};
    for (const [k, o] of Object.entries(data.changes)) {
        world.objs[+k] = o;
        world.changes[k] = o;
    }
    data.bosses.forEach((s, i) => (world.bosses[i].state = s));
    const defaultInv = state.inv;
    const defaultTools = state.tools;
    Object.assign(state, data.st);
    state.inv = { ...defaultInv, ...(data.st.inv || {}) };
    state.tools = { ...defaultTools, ...(data.st.tools || {}) };
    if (!Array.isArray(state.hotbar) || state.hotbar.length !== 9) state.hotbar = ['berries', 'wood', 'stone', 'meat', 'cooked', 'campfire', 'wall', 'workbench', 'shard'];
    if (!Number.isInteger(state.selectedSlot)) state.selectedSlot = 0;
    state.player.maxHp ||= 100;
    state.player.hurt = 0;
    state.player.atkCd = 0;
    state.hpShown = state.player.hp;
    state.cam.x = state.player.x - W / 2;
    state.cam.y = state.player.y - H / 2;
    state.dialog = { text: `You return to the world of seed ${data.seed}. Day ${state.day}, level ${state.level}.`, t: 5 };
    const img = new Image();
    img.onload = () => {
        const f = miniFog.getContext('2d');
        f.globalCompositeOperation = 'copy';
        f.drawImage(img, 0, 0);
        f.globalCompositeOperation = 'source-over';
    };
    img.src = data.fog;
}

function primaryAction() {
    const p = state.player;
    if (p.atkCd > 0) return;
    const m = worldMouse();
    p.face = m.x < p.x ? -1 : 1;
    let target = null;
    let best = 1e9;
    for (const e of state.enemies) {
        if (e.intro > 0) continue;
        const size = ENEMY_DEFS[e.kind].size;
        const d = Math.hypot(e.x - m.x, e.y - size * 0.35 - m.y);
        const reach = Math.hypot(e.x - p.x, e.y - p.y);
        if (d < size * 0.6 && reach < 130 + size * 0.35 && d < best) {
            best = d;
            target = e;
        }
    }
    p.atkCd = 0.4;
    p.swing = 0.25;
    if (target) {
        const dmg = playerDamage();
        if (partyRole === 'client' && target.id) multiplayer.send({ type: 'hit', enemyId: target.id, damage: dmg });
        target.hp -= dmg;
        target.hurt = 0.18;
        target.squash = 1;
        const ang = Math.atan2(target.y - p.y, target.x - p.x);
        if (!target.boss) {
            target.x += Math.cos(ang) * 30;
            target.y += Math.sin(ang) * 30;
        }
        burst(target.x, target.y - 30, '#e33', 10);
        state.fx.push({ type: 'slash', x: target.x, y: target.y - ENEMY_DEFS[target.kind].size * 0.4, ang, t: 0, max: 0.25 });
        floatText(target.x, target.y - ENEMY_DEFS[target.kind].size, `-${dmg}`, '#ff6');
        playSfx(sfxHit);
        state.shake = 6;
        state.hitstop = 0.05;
        if (target.hp <= 0) killEnemy(target);
        return;
    }
    const tx = Math.floor(m.x / TILE);
    const ty = Math.floor(m.y / TILE);
    const o = getObj(tx, ty);
    const cx = tx * TILE + 32;
    const cy = ty * TILE + 32;
    if (!o || Math.hypot(cx - p.x, cy - p.y) > (o && o.type === 'shrine' ? 200 : 150)) {
        p.atkCd = 0.2;
        return;
    }
    harvest(o, tx, ty, cx, cy);
}

function activateShrine(o, cx, cy) {
    const b = world.bosses[o.boss];
    if (b.state === 'defeated') {
        state.dialog = { text: `The ${b.shrine.split('-')[1]} shrine lies silent. Its guardian is gone.`, t: 4 };
        return;
    }
    if (b.state === 'awake') return;
    const loreRead = getObj(world.lore[b.lore]?.x, world.lore[b.lore]?.y)?.read;
    if (!loreRead) {
        state.dialog = { text: 'Strange runes cover this shrine. Something sleeps within... Perhaps a lore stone explains it.', t: 5 };
        return;
    }
    const enough = Object.entries(b.cost).every(([k, v]) => state.inv[k] >= v);
    const torchOk = !b.torch || (state.torchOn && state.tools.torch > 0);
    if (!enough || !torchOk) {
        state.dialog = { text: `${b.name} sleeps here. Offering required: ${b.costText}. Prepare well - it will not sleep again.`, t: 5 };
        return;
    }
    for (const [k, v] of Object.entries(b.cost)) state.inv[k] -= v;
    b.state = 'awake';
    const def = ENEMY_DEFS[b.kind];
    const bhp = def.hp * (1 + state.cycle * 0.8);
    state.enemies.push({ id: `boss-${o.boss}`, kind: b.kind, boss: true, bossIdx: o.boss, name: state.cycle ? `${b.name} ${'+'.repeat(state.cycle)}` : b.name, x: cx, y: cy + 200, hx: cx, hy: cy + 200, hp: bhp, maxHp: bhp, cd: 1, special: 4, hurt: 0, intro: 2.5, squash: 0 });
    if (partyRole === 'client') multiplayer.send({ type: 'boss_wake', bossIdx: o.boss });
    state.dialog = { text: b.intro, t: 7 };
    state.shake = 30;
    burst(cx, cy + 180, '#c9f', 40, true);
    beep(70, 1, 'sawtooth', 0.15);
    beep(105, 1, 'sawtooth', 0.1);
    window.ProgressLogger?.logProgress?.('boss_summoned', { boss: b.name });
}

function harvest(o, tx, ty, cx, cy) {
    const t = o.type;
    if (t === 'workbench' || t === 'forge') {
        toggleInventory(true);
        floatText(cx, cy - 90, t === 'forge' ? 'Forge ready for masterwork gear' : 'Workbench ready for improved gear', '#ffe08a');
        return;
    }
    if (t === 'shrine') {
        activateShrine(o, cx, cy);
        return;
    }
    if (t === 'lore-stone') {
        state.dialog = { text: LORE[o.idx], t: 10 };
        if (!o.read) {
            o.read = true;
            world.changes[ty * WORLD + tx] = { ...o };
            if (partyRole === 'client') pendingWorldChanges[ty * WORLD + tx] = { ...o };
            addXp(10);
            burst(cx, cy - 40, '#c9f', 20, true);
            beep(440, 0.3, 'sine');
            beep(660, 0.4, 'sine');
            window.ProgressLogger?.logProgress?.('lore_read', { idx: o.idx });
        }
        return;
    }
    if (t === 'altar') {
        if (state.inv.shard >= 3) winGame();
        else state.dialog = { text: `The Altar hums. Shards restored: ${state.inv.shard}/3. Wake the guardians at their shrines, defeat them, and return.`, t: 6 };
        return;
    }
    if (t === 'berry-bush') {
        if (o.regrow > 0) {
            floatText(cx, cy - 60, 'Regrowing...', '#ccc');
            return;
        }
        o.regrow = 60;
        o.shake = 0.3;
        if (partyRole === 'client') pendingWorldChanges[ty * WORLD + tx] = { ...o };
        else world.changes[ty * WORLD + tx] = { ...o };
        gain('berries', 2, cx, cy, 'icon-berries');
        return;
    }
    if (t === 'campfire' && (state.inv.meat > 0)) {
        const n = Math.min(state.inv.meat, 3);
        state.inv.meat -= n;
        state.inv.cooked += n;
        floatText(cx, cy - 60, `Cooked ${n} meat!`, '#fc8');
        burst(cx, cy - 30, '#fa4', 10, true);
        beep(300, 0.2, 'triangle');
        addXp(n);
        return;
    }
    if ((t === 'rock' || t === 'gold-ore') && !state.tools.pickaxe) {
        floatText(cx, cy - 60, 'Need a Pickaxe', '#f88');
        playSfx(sfxHit, 0.3);
        return;
    }
    let power = 10;
    if (t === 'tree' || t === 'pine-tree') power = state.tools.axe ? 30 : 10;
    if (t === 'rock' || t === 'gold-ore') power = 20;
    if (t !== 'wood-wall' && t !== 'campfire') power *= 1 + 0.4 * perk('lumber');
    o.hp -= power;
    if (partyRole === 'client') pendingWorldChanges[ty * WORLD + tx] = { ...o };
    else world.changes[ty * WORLD + tx] = { ...o };
    playSfx(sfxHit, 0.4);
    const woody = t.includes('tree') || t === 'wood-wall';
    burst(cx, cy - 20, woody ? '#8b5a2b' : '#999', 7);
    if (t.includes('tree')) burst(cx, cy - 110, t === 'pine-tree' ? '#fff' : '#4c8a34', 6);
    o.shake = 0.25;
    if (o.hp <= 0) {
        setObj(tx, ty, null);
        if (t !== 'wood-wall' && t !== 'campfire') addXp(t === 'gold-ore' ? 6 : 3);
        if (t === 'tree' || t === 'pine-tree') {
            state.fx.push({ type: 'fall', name: t, x: cx, y: ty * TILE + 56, size: OBJ_SIZE[t], dir: state.player.x < cx ? 1 : -1, t: 0, max: 0.9 });
            gain('wood', 3, cx, cy, 'icon-wood');
        } else if (t === 'rock') {
            gain('stone', 3, cx, cy, 'icon-stone');
            burst(cx, cy, '#777', 16);
        } else if (t === 'gold-ore') {
            gain('gold', 2, cx, cy, 'icon-gold');
            gain('stone', 1, cx, cy, 'icon-stone');
            burst(cx, cy, '#fc4', 16, true);
        } else if (t === 'wood-wall') gain('wood', 2, cx, cy, 'icon-wood');
        else if (t === 'campfire') gain('stone', 1, cx, cy, 'icon-stone');
    }
}

function gain(item, n, x, y, icon) {
    if (Math.random() < 0.3 * perk('forager')) n++;
    state.inv[item] += n;
    floatText(x, y - 50, `+${n} ${item}`, '#9ef');
    playSfx(sfxPickup, 0.4);
    if (icon) state.fx.push({ type: 'fly', name: icon, x, y: y - 20, t: 0, max: 0.7 });
}

function killEnemy(e) {
    state.enemies.splice(state.enemies.indexOf(e), 1);
    burst(e.x, e.y - 30, '#a22', 18);
    state.fx.push({ type: 'die', name: e.kind, x: e.x, y: e.y, size: ENEMY_DEFS[e.kind].size, flip: e.face === -1, t: 0, max: e.boss ? 2 : 0.5 });
    state.kills++;
    if (perk('leech')) state.player.hp = Math.min(state.player.maxHp, state.player.hp + 4 * perk('leech'));
    addXp(e.boss ? 120 * (1 + state.cycle) : 5 + state.day + state.cycle * 5);
    if (e.boss) {
        world.bosses[e.bossIdx].state = 'defeated';
        state.inv.shard++;
        floatText(e.x, e.y - 280, 'CROWN SHARD OBTAINED!', '#d9b3ff');
        burst(e.x, e.y - 100, '#c9f', 60, true);
        state.fx.push({ type: 'pop', name: 'icon-shard', x: e.x, y: e.y - 120, t: 0, max: 2 });
        state.shake = 30;
        state.dialog = { text: `${e.name} has fallen, the shard torn from its heart. It pulses warm in your hand (${state.inv.shard}/3).${state.inv.shard >= 3 ? ' Return to the Altar!' : ''}`, t: 8 };
        beep(330, 0.3, 'sawtooth', 0.1);
        beep(495, 0.5, 'sawtooth', 0.1);
        window.ProgressLogger?.logProgress?.('boss_defeated', { boss: e.name });
    } else {
        gain('meat', ENEMY_DEFS[e.kind].meat, e.x, e.y, 'icon-meat');
    }
}

function hurtPlayer(dmg, srcX, srcY) {
    const p = state.player;
    if (p.hurt > 0) return;
    const armorScale = state.tools.plate ? 0.35 : state.tools.armor ? 0.55 : 1;
    const real = Math.round(dmg * armorScale * Math.pow(0.9, perk('hide')) * (1 + state.cycle * 0.35));
    p.hp -= real;
    p.hurt = 0.5;
    state.shake = 12;
    state.redFlash = 0.35;
    floatText(p.x, p.y - 110, `-${real}`, '#f44');
    burst(p.x, p.y - 40, '#f33', 10);
    beep(110, 0.2, 'sawtooth', 0.12);
    const a = Math.atan2(p.y - srcY, p.x - srcX);
    moveEntity(p, Math.cos(a) * 40, Math.sin(a) * 40, 18);
}

// ---------- Day / night ----------
function darkness() {
    const t = (state.time % DAY_LENGTH) / DAY_LENGTH;
    if (t < 0.55) return 0;
    if (t < 0.65) return (t - 0.55) / 0.1 * 0.93;
    if (t < 0.92) return 0.93;
    return 0.93 * (1 - (t - 0.92) / 0.08);
}

function lightSources() {
    const lights = [];
    const p = state.player;
    if (state.torchOn && state.tools.torch > 0) lights.push({ x: p.x, y: p.y - 30, r: 320 + Math.sin(state.time * 13) * 8 });
    else lights.push({ x: p.x, y: p.y - 30, r: 90 });
    const tx0 = Math.floor(state.cam.x / TILE) - 6;
    const ty0 = Math.floor(state.cam.y / TILE) - 6;
    for (let y = ty0; y < ty0 + 30; y++) {
        for (let x = tx0; x < tx0 + 42; x++) {
            const o = getObj(x, y);
            if (o && o.type === 'campfire') lights.push({ x: x * TILE + 32, y: y * TILE + 20, r: 360 + Math.sin(state.time * 9 + x) * 14 });
            else if (o && o.type === 'forge') lights.push({ x: x * TILE + 32, y: y * TILE + 20, r: 300 });
            else if (o && (o.type === 'shrine' || o.type === 'altar' || o.type === 'lore-stone')) lights.push({ x: x * TILE + 32, y: y * TILE, r: 130, cool: true });
        }
    }
    return lights;
}

// ---------- Update ----------
function update(dt) {
    const p = state.player;
    state.time += dt;
    const newDay = Math.floor(state.time / DAY_LENGTH) + 1;
    if (newDay !== state.day) {
        state.day = newDay;
        state.dialog = { text: `Dawn breaks. Day ${state.day}. You survived the night (+${10 + state.day * 4} XP).`, t: 4 };
        addXp(10 + state.day * 4);
        saveGame();
        window.ProgressLogger?.logProgress?.('day', { day: state.day });
    }

    const mx = (keys['d'] || keys['arrowright'] || touchKeys.has('d') ? 1 : 0) - (keys['a'] || keys['arrowleft'] || touchKeys.has('a') ? 1 : 0);
    const my = (keys['s'] || keys['arrowdown'] || touchKeys.has('s') ? 1 : 0) - (keys['w'] || keys['arrowup'] || touchKeys.has('w') ? 1 : 0);
    const len = Math.hypot(mx, my) || 1;
    if (mx) p.face = mx;
    p.moving = mx !== 0 || my !== 0;
    const ox = p.x;
    const spd = 260 * (1 + 0.1 * perk('swift'));
    moveEntity(p, mx / len * spd * dt, my / len * spd * dt, 18);
    p.lean += ((p.x - ox) / dt / 260 * 0.12 - p.lean) * Math.min(1, dt * 10);
    if (p.moving) {
        p.walkT += dt * 12;
        p.dustT -= dt;
        if (p.dustT <= 0) {
            p.dustT = 0.14;
            const b = biomeAt(Math.floor(p.x / TILE), Math.floor(p.y / TILE));
            const col = b === 'snow' ? '#fff' : b === 'desert' ? '#e8d39a' : b === 'swamp' ? '#6b7a4a' : '#9b8a60';
            state.particles.push({ x: p.x - p.face * 12, y: p.y - 4, vx: -p.face * 30 + (Math.random() - 0.5) * 40, vy: -30, life: 0.45, max: 0.45, color: col, size: 6, grav: 0, fade: true });
        }
    } else {
        p.walkT = 0;
    }
    p.atkCd -= dt;
    p.hurt -= dt;
    p.swing -= dt;
    state.redFlash = Math.max(0, (state.redFlash || 0) - dt);
    if (touchActionHeld) aimNearestTouchTarget();
    if (mouse.down) primaryAction();

    p.hunger -= dt * 0.5 * Math.pow(0.8, perk('iron'));
    if (p.hunger <= 0) {
        p.hunger = 0;
        p.hp -= dt * 2;
    } else if (p.hunger > 60) {
        p.hp = Math.min(p.maxHp, p.hp + dt * 0.4);
    }
    state.saveT -= dt;
    if (state.saveT <= 0) {
        state.saveT = 30;
        saveGame();
    }
    if (state.pendingLevels > 0 && !state.menuOpen) openPerkMenu();
    if (state.torchOn) {
        state.tools.torch -= dt;
        if (state.tools.torch <= 0) {
            state.tools.torch = 0;
            state.torchOn = false;
            floatText(p.x, p.y - 100, 'Torch burnt out!', '#fa6');
        }
    }
    state.hpShown += (p.hp - state.hpShown) * Math.min(1, dt * 3);

    const dark = darkness();
    const lights = lightSources();
    const lit = lights.some(l => l.r > 200 && Math.hypot(l.x - p.x, l.y - p.y) < l.r * 0.8);
    if (dark > 0.7 && !lit) {
        state.gloom += dt;
        if (state.gloom > 3 + 3 * Math.min(1, perk('night'))) {
            p.hp -= dt * 6 * Math.pow(0.7, perk('night'));
            if (Math.random() < dt * 2) state.shake = 5;
        }
    } else {
        state.gloom = Math.max(0, state.gloom - dt * 2);
    }

    const ptx = Math.floor(p.x / TILE);
    const pty = Math.floor(p.y / TILE);
    for (let y = pty - 20; y < pty + 20; y++) {
        for (let x = ptx - 25; x < ptx + 25; x++) {
            const o = getObj(x, y);
            if (!o) continue;
            if (o.regrow > 0) o.regrow -= dt;
            if (o.shake > 0) o.shake -= dt;
            if (o.type === 'campfire') {
                o.fuel -= dt;
                if (o.fuel <= 0) setObj(x, y, null);
            }
        }
    }

    // reveal minimap fog
    state.fogT -= dt;
    if (state.fogT <= 0) {
        state.fogT = 0.2;
        const fctx = miniFog.getContext('2d');
        fctx.globalCompositeOperation = 'destination-out';
        fctx.beginPath();
        fctx.arc(p.x / TILE, p.y / TILE, 18, 0, Math.PI * 2);
        fctx.fill();
    }

    if (partyRole !== 'client') {
        updateEnemies(dt, dark, lights);
        updateProjectiles(dt);
    }
    updateAmbient(dt, dark);

    for (const pt of state.particles) {
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.vy += (pt.grav ?? 500) * dt;
        pt.life -= dt;
    }
    state.particles = state.particles.filter(pt => pt.life > 0);
    for (const f of state.fx) f.t += dt;
    state.fx = state.fx.filter(f => f.t < f.max);
    for (const t of state.texts) {
        t.y -= 40 * dt;
        t.life -= dt;
    }
    state.texts = state.texts.filter(t => t.life > 0);
    if (state.dialog) {
        state.dialog.t -= dt;
        if (state.dialog.t <= 0) state.dialog = null;
    }

    state.cam.x += (p.x - W / 2 - state.cam.x) * Math.min(1, dt * 6);
    state.cam.y += (p.y - H / 2 - state.cam.y) * Math.min(1, dt * 6);
    state.shake = Math.max(0, state.shake - dt * 40);

    if (p.hp <= 0) loseGame();
}

function updateAmbient(dt, dark) {
    const p = state.player;
    const b = biomeAt(Math.floor(p.x / TILE), Math.floor(p.y / TILE));
    const rate = b === 'snow' ? 40 : dark > 0.5 ? 6 : b === 'forest' ? 4 : b === 'desert' ? 6 : b === 'swamp' ? 5 : 2;
    if (state.ambient.length < 120 && Math.random() < rate * dt) {
        let kind = 'leaf';
        if (b === 'snow') kind = 'snow';
        else if (dark > 0.5) kind = 'firefly';
        else if (b === 'desert') kind = 'dust';
        else if (b === 'swamp') kind = 'bubble';
        state.ambient.push({ kind, x: Math.random() * W, y: kind === 'snow' || kind === 'leaf' ? -20 : Math.random() * H, t: 0, life: 6 + Math.random() * 4, ph: Math.random() * 10 });
    }
    for (const a of state.ambient) {
        a.t += dt;
        if (a.kind === 'snow') {
            a.y += 80 * dt;
            a.x += Math.sin(a.t + a.ph) * 30 * dt - 20 * dt;
        } else if (a.kind === 'leaf') {
            a.y += 60 * dt;
            a.x += Math.sin(a.t * 2 + a.ph) * 60 * dt;
        } else if (a.kind === 'firefly') {
            a.x += Math.sin(a.t * 0.9 + a.ph) * 30 * dt;
            a.y += Math.cos(a.t * 1.3 + a.ph) * 30 * dt;
        } else if (a.kind === 'dust') {
            a.x += 160 * dt;
            a.y += Math.sin(a.t * 3) * 10 * dt;
        } else {
            a.y -= 20 * dt;
        }
    }
    state.ambient = state.ambient.filter(a => a.t < a.life && a.y < H + 30);
}

function spawnEnemies(dt, dark) {
    state.spawnTimer -= dt;
    const normals = state.enemies.filter(e => !e.boss).length;
    const cap = dark > 0.5 ? 12 + state.day * 2 : 4 + state.day;
    if (state.spawnTimer > 0 || normals >= cap) return;
    state.spawnTimer = dark > 0.5 ? 1.3 : 4.5;
    const p = state.player;
    const a = Math.random() * Math.PI * 2;
    const d = 900 + Math.random() * 300;
    const x = p.x + Math.cos(a) * d;
    const y = p.y + Math.sin(a) * d;
    if (!canStand(x, y, 20)) return;
    const b = biomeAt(Math.floor(x / TILE), Math.floor(y / TILE));
    let kind;
    if (b === 'swamp') kind = 'slime';
    else if (b === 'snow' || b === 'desert') kind = 'wolf';
    else if (dark < 0.5) kind = Math.random() < 0.5 ? 'slime' : 'spider';
    else kind = Math.random() < 0.3 ? 'wolf' : 'spider';
    const def = ENEMY_DEFS[kind];
    const hpScale = (1 + (state.day - 1) * 0.15) * (1 + state.cycle * 0.5);
    state.enemies.push({ id: `mob-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, kind, x, y, hp: def.hp * hpScale, maxHp: def.hp * hpScale, cd: 0, hurt: 0, wander: Math.random() * 6, ph: Math.random() * 10, squash: 0 });
}

function updateEnemies(dt, dark, lights) {
    spawnEnemies(dt, dark);
    const targets = [{ id: 'local', player: state.player, local: true }];
    for (const player of partyPlayers.values()) {
        if (player.hp > 0) targets.push({ id: player.id, player, local: false });
    }
    for (const e of [...state.enemies]) {
        const def = ENEMY_DEFS[e.kind];
        e.cd -= dt;
        e.hurt -= dt;
        e.squash = Math.max(0, (e.squash || 0) - dt * 4);
        let target = targets[0];
        let dist = Infinity;
        for (const candidate of targets) {
            const d = Math.hypot(candidate.player.x - e.x, candidate.player.y - e.y);
            if (d < dist) {
                target = candidate;
                dist = d;
            }
        }
        const dx = target.player.x - e.x;
        const dy = target.player.y - e.y;
        dist = dist || 1;
        if (e.boss) {
            updateBoss(e, def, dt, dist, dx, dy, target);
            continue;
        }
        if (dist > 2200) {
            state.enemies.splice(state.enemies.indexOf(e), 1);
            continue;
        }
        const aggro = dark > 0.5 ? 900 : (e.kind === 'wolf' ? 600 : 380);
        let vx = 0;
        let vy = 0;
        if (dist < aggro) {
            vx = dx / dist;
            vy = dy / dist;
            for (const l of lights) {
                if (l.r > 300 && Math.hypot(l.x - e.x, l.y - e.y) < 220) {
                    vx = (e.x - l.x) / 220;
                    vy = (e.y - l.y) / 220;
                }
            }
        } else {
            e.wander -= dt;
            if (e.wander < 0) {
                e.wander = 2 + Math.random() * 3;
                e.wa = Math.random() * Math.PI * 2;
            }
            vx = Math.cos(e.wa || 0) * 0.3;
            vy = Math.sin(e.wa || 0) * 0.3;
        }
        if (Math.abs(vx) > 0.05) e.face = vx < 0 ? -1 : 1;
        e.spd = Math.hypot(vx, vy);
        moveEntity(e, vx * def.speed * dt, vy * def.speed * dt, 16);
        if (dist < 60 && e.cd <= 0) {
            e.cd = 1;
            e.lunge = 0.25;
            damagePartyTarget(target, def.dmg, e.x, e.y);
        }
        e.lunge = Math.max(0, (e.lunge || 0) - dt);
        if (dist < aggro && e.cd <= 0) {
            const tx = Math.floor((e.x + vx * 50) / TILE);
            const ty = Math.floor((e.y + vy * 50) / TILE);
            const o = getObj(tx, ty);
            if (o && o.type === 'wood-wall') {
                o.hp -= def.dmg;
                world.changes[ty * WORLD + tx] = { ...o };
                e.cd = 1;
                e.lunge = 0.25;
                if (o.hp <= 0) setObj(tx, ty, null);
            }
        }
    }
}

function damagePartyTarget(target, damage, sourceX, sourceY) {
    if (target.local) {
        hurtPlayer(damage, sourceX, sourceY);
        return;
    }
    const player = target.player;
    const armorScale = player.tools?.plate ? 0.35 : player.tools?.armor ? 0.55 : 1;
    const real = Math.round(damage * armorScale);
    player.hp = Math.max(0, player.hp - real);
    multiplayer.sendTo(target.id, { type: 'damage', amount: real, x: sourceX, y: sourceY });
}

function updateBoss(e, def, dt, dist, dx, dy, target) {
    if (e.intro > 0) {
        e.intro -= dt;
        state.shake = Math.max(state.shake, 6);
        if (Math.random() < 0.5) burst(e.x + (Math.random() - 0.5) * 160, e.y, '#6b5a3a', 2);
        return;
    }
    const homeD = Math.hypot(e.x - e.hx, e.y - e.hy);
    if (dist > 1400 || homeD > 1000) {
        const hx = e.hx - e.x;
        const hy = e.hy - e.y;
        const hd = Math.hypot(hx, hy) || 1;
        if (hd > 10) moveEntity(e, hx / hd * def.speed * dt, hy / hd * def.speed * dt, 30);
        e.hp = Math.min(e.maxHp, e.hp + dt * 30);
        e.spd = hd > 10 ? 1 : 0;
        return;
    }
    e.face = dx < 0 ? -1 : 1;
    const enraged = e.hp < e.maxHp / 2;
    const spd = def.speed * (enraged ? 1.35 : 1);
    e.spd = dist > 80 ? 1 : 0;
    if (dist > 80) moveEntity(e, dx / dist * spd * dt, dy / dist * spd * dt, 30);
    e.lunge = Math.max(0, (e.lunge || 0) - dt);
    if (dist < 120 && e.cd <= 0) {
        e.cd = 1.3;
        e.lunge = 0.35;
        damagePartyTarget(target, def.dmg, e.x, e.y);
    }
    e.special -= dt;
    if (e.special < 0.8 && !e.charging) e.charging = true;
    if (e.special <= 0) {
        e.charging = false;
        e.special = enraged ? 2.5 : 4;
        e.squash = 1;
        const ang = Math.atan2(dy, dx);
        if (e.kind === 'boss-treant') {
            for (let i = 0; i < (enraged ? 3 : 2); i++) {
                state.enemies.push({ id: `mob-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, kind: 'spider', x: e.x + (Math.random() - 0.5) * 140, y: e.y + 40, hp: 25, maxHp: 25, cd: 1, hurt: 0, wander: 0, ph: Math.random() * 10, squash: 1 });
            }
            burst(e.x, e.y, '#5a3a1a', 20);
            floatText(e.x, e.y - 260, 'Roots stir!', '#8f8');
        } else if (e.kind === 'boss-golem') {
            for (let i = -1; i <= 1; i++) fire(e.x, e.y - 110, ang + i * 0.25, 420, 'rock', 18, 18);
        } else {
            const n = enraged ? 12 : 7;
            for (let i = 0; i < n; i++) fire(e.x, e.y - 110, ang + (i - (n - 1) / 2) * 0.18, 480, 'ice', 13, 14);
        }
        beep(150, 0.25, 'square', 0.1);
    }
}

function fire(x, y, ang, speed, kind, r, dmg) {
    state.projectiles.push({ x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, kind, r, dmg, life: 3, rot: 0 });
}

function updateProjectiles(dt) {
    const targets = [{ id: 'local', player: state.player, local: true }];
    for (const player of partyPlayers.values()) {
        if (player.hp > 0) targets.push({ id: player.id, player, local: false });
    }
    for (const pr of state.projectiles) {
        pr.x += pr.vx * dt;
        pr.y += pr.vy * dt;
        pr.rot += dt * 10;
        pr.life -= dt;
        if (Math.random() < 0.6) state.particles.push({ x: pr.x, y: pr.y, vx: 0, vy: 0, life: 0.3, max: 0.3, color: pr.kind === 'ice' ? '#bdf' : '#a87', size: 5, grav: 0, fade: true });
        for (const target of targets) {
            const p = target.player;
            if (Math.hypot(pr.x - p.x, pr.y - (p.y - 30)) < pr.r + 22) {
                damagePartyTarget(target, pr.dmg, pr.x - pr.vx, pr.y - pr.vy);
                pr.life = 0;
                break;
            }
        }
        const tx = Math.floor(pr.x / TILE);
        const ty = Math.floor((pr.y + 60) / TILE);
        const o = getObj(tx, ty);
        if (o && SOLID.has(o.type) && o.type !== 'shrine') {
            pr.life = 0;
            burst(pr.x, pr.y, pr.kind === 'ice' ? '#bdf' : '#a87', 6);
        }
    }
    state.projectiles = state.projectiles.filter(pr => pr.life > 0);
}

// ---------- Render ----------
const lightCanvas = document.createElement('canvas');
lightCanvas.width = W;
lightCanvas.height = H;
const lctx = lightCanvas.getContext('2d');
const vignette = document.createElement('canvas');
vignette.width = W;
vignette.height = H;
{
    const v = vignette.getContext('2d');
    const g = v.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    v.fillStyle = g;
    v.fillRect(0, 0, W, H);
}

function drawGround(camX, camY, tx0, ty0, tx1, ty1) {
    const T = state.time;
    for (let y = ty0; y < ty1; y++) {
        for (let x = tx0; x < tx1; x++) {
            const b = biomeAt(x, y);
            const inside = x >= 0 && y >= 0 && x < WORLD && y < WORLD;
            const sh = inside ? world.shade[y * WORLD + x] : 0.5;
            const cols = BIOME_COLORS[b];
            const sx = x * TILE - camX;
            const sy = y * TILE - camY;
            if (b === 'water') {
                ctx.fillStyle = cols[0];
                ctx.fillRect(sx, sy, TILE, TILE);
                ctx.fillStyle = cols[1];
                const wv = Math.sin(T * 1.5 + x * 0.7 + y * 0.4) * 8;
                ctx.fillRect(sx, sy + 20 + wv, TILE, 10);
                ctx.fillStyle = 'rgba(200,230,255,0.35)';
                const sp = Math.floor(T * 1.2 + sh * 10) % 4;
                if (sp === 0) ctx.fillRect(sx + sh * 40, sy + ((sh * 9) % 1) * 50, 12, 4);
                if (biomeAt(x, y - 1) !== 'water') {
                    ctx.fillStyle = 'rgba(230,245,255,0.7)';
                    ctx.fillRect(sx, sy + 4 + Math.sin(T * 2 + x) * 3, TILE, 6);
                    ctx.fillStyle = 'rgba(0,0,0,0.25)';
                    ctx.fillRect(sx, sy, TILE, 4);
                }
                continue;
            }
            ctx.fillStyle = cols[sh > 0.5 ? 1 : 0];
            ctx.fillRect(sx, sy, TILE, TILE);
            // pixel texture
            for (let k = 0; k < 4; k++) {
                const r1 = (sh * (7 + k * 13)) % 1;
                const r2 = (sh * (11 + k * 17)) % 1;
                ctx.fillStyle = k % 2 ? 'rgba(0,0,0,0.08)' : cols[2];
                ctx.globalAlpha = k % 2 ? 1 : 0.5;
                ctx.fillRect(sx + Math.floor(r1 * 56), sy + Math.floor(r2 * 56), 8, 8);
            }
            ctx.globalAlpha = 1;
            // decor
            if ((b === 'grass' || b === 'forest' || b === 'swamp') && sh > 0.6) {
                const sway = Math.sin(T * 2 + x * 0.5 + y * 0.3) * 3;
                ctx.fillStyle = b === 'swamp' ? '#3a4a28' : '#3f6a26';
                const gx = sx + 14 + (sh * 31 % 1) * 30;
                const gy = sy + 30 + (sh * 17 % 1) * 24;
                ctx.fillRect(gx + sway, gy - 12, 4, 12);
                ctx.fillRect(gx + 6 + sway * 1.3, gy - 16, 4, 16);
                ctx.fillRect(gx + 12 + sway, gy - 10, 4, 10);
                if (sh > 0.94 && b === 'grass') {
                    ctx.fillStyle = ['#f6e05a', '#f08ab0', '#fff', '#9cd0ff'][Math.floor(sh * 400) % 4];
                    ctx.fillRect(gx + 4 + sway * 1.3, gy - 22, 8, 8);
                    ctx.fillStyle = '#ffda44';
                    ctx.fillRect(gx + 6 + sway * 1.3, gy - 20, 4, 4);
                }
            } else if (b === 'desert' && sh > 0.85) {
                ctx.fillStyle = '#a88a4a';
                ctx.fillRect(sx + sh * 40, sy + 40, 10, 6);
                ctx.fillStyle = '#f2dea6';
                ctx.fillRect(sx + sh * 40, sy + 38, 6, 3);
            } else if (b === 'snow' && sh > 0.8) {
                const tw = Math.sin(T * 4 + sh * 50) > 0.7;
                if (tw) {
                    ctx.fillStyle = '#fff';
                    ctx.fillRect(sx + sh * 50, sy + 20, 4, 4);
                    ctx.fillRect(sx + sh * 50 - 4, sy + 24, 12, 2);
                }
            }
            // shore cliff
            if (biomeAt(x, y + 1) === 'water') {
                ctx.fillStyle = 'rgba(70,50,30,0.85)';
                ctx.fillRect(sx, sy + TILE - 12, TILE, 12);
                ctx.fillStyle = 'rgba(0,0,0,0.3)';
                ctx.fillRect(sx, sy + TILE - 4, TILE, 4);
            }
        }
    }
}

function render() {
    const camX = Math.round(state.cam.x + (Math.random() - 0.5) * state.shake);
    const camY = Math.round(state.cam.y + (Math.random() - 0.5) * state.shake);
    ctx.fillStyle = '#1b3a5a';
    ctx.fillRect(0, 0, W, H);
    const tx0 = Math.floor(camX / TILE) - 1;
    const ty0 = Math.floor(camY / TILE) - 1;
    const tx1 = tx0 + Math.ceil(W / TILE) + 2;
    const ty1 = ty0 + Math.ceil(H / TILE) + 4;
    drawGround(camX, camY, tx0, ty0, tx1, ty1);

    // shrine summoning circles under everything
    for (const b of world.bosses) {
        const cx = b.tx * TILE + 32 - camX;
        const cy = b.ty * TILE + 230 - camY;
        if (Math.abs(cx - W / 2) > W || Math.abs(cy - H / 2) > H || b.state === 'defeated') continue;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(1, 0.45);
        ctx.rotate(state.time * 0.3);
        ctx.strokeStyle = b.state === 'awake' ? 'rgba(255,80,80,0.5)' : 'rgba(190,140,255,0.35)';
        ctx.lineWidth = 6;
        ctx.setLineDash([24, 14]);
        ctx.beginPath();
        ctx.arc(0, 0, 240, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const a = i / 6 * Math.PI * 2;
            ctx.lineTo(Math.cos(a) * 200, Math.sin(a) * 200);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
    }

    const draws = [];
    for (let y = ty0; y < ty1; y++) {
        for (let x = tx0; x < tx1; x++) {
            const o = getObj(x, y);
            if (o) draws.push({ y: y * TILE + 56, kind: 'obj', o, x: x * TILE + 32, tx: x });
        }
    }
    for (const e of state.enemies) {
        if (Math.abs(e.x - camX - W / 2) < W && Math.abs(e.y - camY - H / 2) < H) draws.push({ y: e.y, kind: 'enemy', e });
    }
    for (const f of state.fx) if (f.type === 'fall' || f.type === 'die') draws.push({ y: f.y, kind: 'fx', f });
    for (const remote of partyPlayers.values()) {
        if (remote.hp > 0 && Math.abs(remote.x - camX - W / 2) < W && Math.abs(remote.y - camY - H / 2) < H) {
            draws.push({ y: remote.y, kind: 'remote', player: remote });
        }
    }
    draws.push({ y: state.player.y, kind: 'player' });
    draws.sort((a, b) => a.y - b.y);

    for (const d of draws) {
        if (d.kind === 'obj') drawObject(d.o, d.x - camX, d.y - camY, d.tx);
        else if (d.kind === 'enemy') drawEnemy(d.e, camX, camY);
        else if (d.kind === 'fx') drawWorldFx(d.f, camX, camY);
        else if (d.kind === 'remote') drawRemotePlayer(d.player, camX, camY);
        else drawPlayer(camX, camY);
    }

    for (const pr of state.projectiles) {
        ctx.save();
        ctx.translate(pr.x - camX, pr.y - camY);
        ctx.rotate(pr.rot);
        if (pr.kind === 'ice') {
            ctx.fillStyle = '#e6f6ff';
            ctx.beginPath();
            ctx.moveTo(0, -pr.r * 1.4);
            ctx.lineTo(pr.r * 0.7, 0);
            ctx.lineTo(0, pr.r * 1.4);
            ctx.lineTo(-pr.r * 0.7, 0);
            ctx.fill();
            ctx.strokeStyle = '#4aa0e0';
            ctx.lineWidth = 3;
            ctx.stroke();
        } else {
            ctx.fillStyle = '#8a6a44';
            ctx.fillRect(-pr.r, -pr.r, pr.r * 2, pr.r * 2);
            ctx.fillStyle = '#b8946a';
            ctx.fillRect(-pr.r, -pr.r, pr.r, pr.r);
            ctx.strokeStyle = '#2a1a0a';
            ctx.lineWidth = 3;
            ctx.strokeRect(-pr.r, -pr.r, pr.r * 2, pr.r * 2);
        }
        ctx.restore();
    }
    for (const pt of state.particles) {
        ctx.globalAlpha = pt.fade ? Math.max(0, pt.life / pt.max) : 1;
        ctx.fillStyle = pt.color;
        ctx.fillRect(pt.x - camX, pt.y - camY, pt.size, pt.size);
    }
    ctx.globalAlpha = 1;
    for (const f of state.fx) if (f.type === 'slash' || f.type === 'pop') drawWorldFx(f, camX, camY);

    // cursor highlight
    const m = worldMouse();
    const htx = Math.floor(m.x / TILE);
    const hty = Math.floor(m.y / TILE);
    const ho = getObj(htx, hty);
    const pulse = 0.35 + Math.sin(state.time * 6) * 0.15;
    ctx.strokeStyle = ho ? `rgba(255,230,140,${pulse + 0.2})` : `rgba(255,255,255,${pulse})`;
    ctx.lineWidth = 3;
    const hx = htx * TILE - camX;
    const hy = hty * TILE - camY;
    const c = 14;
    ctx.beginPath();
    ctx.moveTo(hx, hy + c); ctx.lineTo(hx, hy); ctx.lineTo(hx + c, hy);
    ctx.moveTo(hx + TILE - c, hy); ctx.lineTo(hx + TILE, hy); ctx.lineTo(hx + TILE, hy + c);
    ctx.moveTo(hx + TILE, hy + TILE - c); ctx.lineTo(hx + TILE, hy + TILE); ctx.lineTo(hx + TILE - c, hy + TILE);
    ctx.moveTo(hx + c, hy + TILE); ctx.lineTo(hx, hy + TILE); ctx.lineTo(hx, hy + TILE - c);
    ctx.stroke();

    const dark = darkness();
    const t = (state.time % DAY_LENGTH) / DAY_LENGTH;
    // dusk/dawn tint
    if (t > 0.45 && t < 0.62) {
        ctx.fillStyle = `rgba(255,120,40,${Math.sin((t - 0.45) / 0.17 * Math.PI) * 0.16})`;
        ctx.fillRect(0, 0, W, H);
    }
    if (dark > 0.01) {
        const lights = lightSources();
        lctx.globalCompositeOperation = 'source-over';
        lctx.clearRect(0, 0, W, H);
        lctx.fillStyle = `rgba(4,6,22,${dark})`;
        lctx.fillRect(0, 0, W, H);
        lctx.globalCompositeOperation = 'destination-out';
        for (const l of lights) {
            const g = lctx.createRadialGradient(l.x - camX, l.y - camY, 0, l.x - camX, l.y - camY, l.r);
            g.addColorStop(0, 'rgba(0,0,0,1)');
            g.addColorStop(0.6, 'rgba(0,0,0,0.8)');
            g.addColorStop(1, 'rgba(0,0,0,0)');
            lctx.fillStyle = g;
            lctx.beginPath();
            lctx.arc(l.x - camX, l.y - camY, l.r, 0, Math.PI * 2);
            lctx.fill();
        }
        ctx.drawImage(lightCanvas, 0, 0);
        ctx.globalCompositeOperation = 'lighter';
        for (const l of lights) {
            if (l.r < 100) continue;
            const g = ctx.createRadialGradient(l.x - camX, l.y - camY, 0, l.x - camX, l.y - camY, l.r * 0.7);
            const col = l.cool ? '170,110,255' : '255,140,40';
            g.addColorStop(0, `rgba(${col},${0.2 * dark})`);
            g.addColorStop(1, `rgba(${col},0)`);
            ctx.fillStyle = g;
            ctx.fillRect(l.x - camX - l.r, l.y - camY - l.r, l.r * 2, l.r * 2);
        }
        ctx.globalCompositeOperation = 'source-over';
    }
    // ambient screen particles
    for (const a of state.ambient) {
        const fade = Math.min(1, a.t, a.life - a.t);
        if (a.kind === 'snow') {
            ctx.fillStyle = `rgba(255,255,255,${0.8 * fade})`;
            ctx.fillRect(a.x, a.y, 5, 5);
        } else if (a.kind === 'leaf') {
            ctx.fillStyle = `rgba(110,160,60,${fade})`;
            ctx.save();
            ctx.translate(a.x, a.y);
            ctx.rotate(Math.sin(a.t * 3 + a.ph));
            ctx.fillRect(-5, -3, 10, 6);
            ctx.restore();
        } else if (a.kind === 'firefly') {
            const glow = 0.5 + Math.sin(a.t * 4 + a.ph) * 0.5;
            ctx.fillStyle = `rgba(220,255,120,${glow * fade * 0.25})`;
            ctx.fillRect(a.x - 8, a.y - 8, 20, 20);
            ctx.fillStyle = `rgba(240,255,160,${glow * fade})`;
            ctx.fillRect(a.x, a.y, 5, 5);
        } else if (a.kind === 'dust') {
            ctx.fillStyle = `rgba(240,220,160,${0.5 * fade})`;
            ctx.fillRect(a.x, a.y, 6, 3);
        } else {
            ctx.strokeStyle = `rgba(180,220,160,${0.6 * fade})`;
            ctx.lineWidth = 2;
            ctx.strokeRect(a.x, a.y, 7, 7);
        }
    }
    if (state.gloom > 1.5) {
        ctx.fillStyle = `rgba(60,0,40,${Math.min(0.45, (state.gloom - 1.5) * 0.15)})`;
        ctx.fillRect(0, 0, W, H);
        // gloom eyes in the dark
        for (let i = 0; i < 4; i++) {
            const ex = W / 2 + Math.cos(i * 1.7 + state.time * 0.2) * 600;
            const ey = H / 2 + Math.sin(i * 2.3 + state.time * 0.15) * 350;
            if (Math.sin(state.time * 2 + i * 3) > -0.6) {
                ctx.fillStyle = 'rgba(255,60,90,0.8)';
                ctx.fillRect(ex, ey, 10, 5);
                ctx.fillRect(ex + 22, ey, 10, 5);
            }
        }
    }
    ctx.drawImage(vignette, 0, 0);
    if (state.redFlash > 0) {
        ctx.fillStyle = `rgba(200,0,0,${state.redFlash * 0.6})`;
        ctx.fillRect(0, 0, W, H);
    }

    for (const tx of state.texts) {
        ctx.globalAlpha = Math.min(1, tx.life);
        const pop = 1 + Math.max(0, tx.life - 1.1) * 3;
        drawText(tx.text, tx.x - camX, tx.y - camY, Math.round(16 * pop), tx.color, 'center');
        ctx.globalAlpha = 1;
    }
    drawHUD(dark);
}

function drawShadow(x, y, rx, ry, a = 0.28) {
    ctx.fillStyle = `rgba(0,0,0,${a})`;
    ctx.beginPath();
    ctx.ellipse(x, y, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
    ctx.fill();
}

function drawObject(o, sx, sy, tx) {
    const name = o.type;
    const T = state.time;
    const wob = o.shake > 0 ? Math.sin(o.shake * 80) * 0.06 : 0;
    const born = o.born !== undefined ? Math.min(1, (T - o.born) * 4) : 1;
    const pop = born < 1 ? 1 + Math.sin(born * Math.PI) * 0.25 : 1;
    if (name === 'shrine') {
        const b = world.bosses[o.boss];
        drawShadow(sx, sy - 4, 90, 18);
        const glow = 0.5 + Math.sin(T * 2) * 0.3;
        const col = b.state === 'defeated' ? '120,120,120' : o.boss === 0 ? '120,255,120' : o.boss === 1 ? '255,180,60' : '120,200,255';
        const g = ctx.createRadialGradient(sx, sy - 90, 10, sx, sy - 90, 160);
        g.addColorStop(0, `rgba(${col},${0.35 * glow})`);
        g.addColorStop(1, `rgba(${col},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(sx - 160, sy - 250, 320, 320);
        drawSprite(b.shrine, sx, sy, OBJ_SIZE.shrine, false, b.state === 'defeated' ? 0.6 : 1, 1, 1 + Math.sin(T * 1.5) * 0.008);
        if (b.state === 'sealed') {
            for (let i = 0; i < 3; i++) {
                const a = T * 1.2 + i * 2.1;
                ctx.fillStyle = `rgba(${col},0.9)`;
                ctx.fillRect(sx + Math.cos(a) * 70 - 3, sy - 100 + Math.sin(a) * 25 - 3, 7, 7);
            }
        }
        return;
    }
    if (name === 'berry-bush' && o.regrow > 0) {
        drawShadow(sx, sy - 2, 22, 8);
        drawSprite(name, sx, sy, OBJ_SIZE[name] * 0.8, false, 0.55, 1, 1, wob);
        return;
    }
    drawShadow(sx, sy - 2, OBJ_SIZE[name] * 0.3, 10);
    let rot = wob;
    let sy2 = pop;
    if (name === 'tree' || name === 'pine-tree') rot += Math.sin(T * 1.3 + tx * 0.7 + (o.seed || 0) * 6) * 0.025;
    if (name === 'berry-bush') rot += Math.sin(T * 2 + tx) * 0.03;
    if (name === 'campfire') sy2 *= 1 + Math.sin(T * 14 + tx) * 0.04;
    const size = OBJ_SIZE[name] * (name.includes('tree') ? 0.9 + (o.seed || 0.5) * 0.2 : 1);
    drawSprite(name, sx, sy, size, (o.seed || 0) > 0.5 && name !== 'lore-stone', 1, pop, sy2, rot);
    if (name === 'lore-stone' && !o.read) {
        const by = sy - 120 + Math.sin(T * 4) * 6;
        ctx.fillStyle = 'rgba(200,150,255,0.25)';
        ctx.fillRect(sx - 18, by - 30, 36, 40);
        drawText('!', sx, by, 24, '#d9b3ff', 'center');
    }
    if (name === 'altar' && state.inv.shard > 0) {
        for (let i = 0; i < state.inv.shard; i++) {
            const a = T * 1.5 + i * Math.PI * 2 / 3;
            drawSprite('icon-shard', sx + Math.cos(a) * 60, sy - 80 + Math.sin(a) * 18 + Math.sin(T * 3 + i) * 5, 30);
        }
    }
    if (name === 'campfire' && Math.random() < 0.4) {
        state.particles.push({ x: sx + state.cam.x + (Math.random() - 0.5) * 24, y: sy + state.cam.y - 36, vx: (Math.random() - 0.5) * 30, vy: -70 - Math.random() * 40, life: 0.7, max: 0.7, color: Math.random() < 0.5 ? '#fc4' : '#f62', size: 5, grav: -20, fade: true });
    }
}

function drawEnemy(e, camX, camY) {
    const def = ENEMY_DEFS[e.kind];
    const sx = e.x - camX;
    const sy = e.y - camY;
    const T = state.time + (e.ph || 0);
    const moving = (e.spd || 0) > 0.1;
    let scx = 1;
    let scy = 1;
    let rot = 0;
    let off = 0;
    if (e.kind === 'slime') {
        const hop = Math.abs(Math.sin(T * 6));
        off = moving ? hop * 22 : 0;
        scy = moving ? 0.8 + hop * 0.35 : 1 + Math.sin(T * 3) * 0.06;
        scx = 2 - scy;
    } else if (e.kind === 'spider') {
        rot = moving ? Math.sin(T * 30) * 0.06 : 0;
        off = moving ? Math.abs(Math.sin(T * 20)) * 4 : 0;
        scy = 1 + Math.sin(T * 4) * 0.03;
    } else if (e.kind === 'wolf') {
        rot = moving ? Math.sin(T * 14) * 0.1 : 0;
        off = moving ? Math.abs(Math.sin(T * 14)) * 10 : 0;
        scy = 1 + Math.sin(T * 3) * 0.025;
    } else if (e.boss) {
        const step = moving ? Math.sin(T * 4) : 0;
        rot = step * 0.05;
        off = Math.abs(step) * 8;
        scy = 1 + Math.sin(T * 1.8) * 0.03;
        scx = 1 - Math.sin(T * 1.8) * 0.015;
        if (e.charging) {
            scy *= 1 - 0.1 * Math.abs(Math.sin(T * 20));
            scx *= 1.06;
        }
    }
    if (e.lunge > 0) {
        rot += (e.face || 1) * 0.2 * Math.sin(e.lunge * 12);
        scx *= 1.1;
    }
    if (e.squash > 0) {
        scy *= 1 - e.squash * 0.25;
        scx *= 1 + e.squash * 0.25;
    }
    let size = def.size;
    let alpha = 1;
    if (e.intro > 0) {
        const k = 1 - e.intro / 2.5;
        size *= Math.min(1, k * 1.3);
        alpha = Math.min(1, k * 2);
        off = -20 * (1 - k);
    }
    drawShadow(sx, sy, def.size * 0.3 * (1 - off / 80), def.size * 0.08, 0.3);
    if (e.boss && e.hp < e.maxHp / 2) {
        const g = ctx.createRadialGradient(sx, sy - size * 0.4, 10, sx, sy - size * 0.4, size * 0.7);
        g.addColorStop(0, `rgba(255,40,40,${0.25 + Math.sin(T * 8) * 0.1})`);
        g.addColorStop(1, 'rgba(255,40,40,0)');
        ctx.fillStyle = g;
        ctx.fillRect(sx - size, sy - size * 1.2, size * 2, size * 1.6);
    }
    drawSprite(e.kind, sx, sy - off, size, e.face === -1, alpha, scx, scy, rot);
    if (e.hurt > 0) {
        ctx.globalCompositeOperation = 'lighter';
        drawSprite(e.kind, sx, sy - off, size, e.face === -1, 0.7, scx, scy, rot);
        ctx.globalCompositeOperation = 'source-over';
    }
    if (!e.boss && e.hp < e.maxHp) {
        const bw = 64;
        const by = sy - def.size - 14;
        ctx.fillStyle = '#000';
        ctx.fillRect(sx - bw / 2 - 3, by - 3, bw + 6, 12);
        ctx.fillStyle = '#4a1010';
        ctx.fillRect(sx - bw / 2, by, bw, 6);
        ctx.fillStyle = '#e33';
        ctx.fillRect(sx - bw / 2, by, bw * e.hp / e.maxHp, 6);
        ctx.fillStyle = '#ff8a8a';
        ctx.fillRect(sx - bw / 2, by, bw * e.hp / e.maxHp, 2);
    }
}

function drawRemotePlayer(player, camX, camY) {
    const sx = player.x - camX;
    const sy = player.y - camY;
    drawShadow(sx, sy, 24, 8, 0.32);
    drawSprite('player', sx, sy, 100, player.face === -1);
    drawText(player.name || 'Wanderer', sx, sy - 122, 11, '#ffe08a', 'center');
}

function drawPlayer(camX, camY) {
    const p = state.player;
    const sx = p.x - camX;
    const sy = p.y - camY;
    const T = state.time;
    const step = Math.sin(p.walkT);
    const bob = p.moving ? Math.abs(step) * 9 : 0;
    const breathe = Math.sin(T * 3) * 0.025;
    let scy = p.moving ? 1 - Math.abs(Math.cos(p.walkT)) * 0.07 : 1 + breathe;
    let scx = p.moving ? 1 + Math.abs(Math.cos(p.walkT)) * 0.05 : 1 - breathe * 0.5;
    let rot = p.moving ? step * 0.07 + p.lean : 0;
    if (p.swing > 0) {
        const k = p.swing / 0.25;
        rot += p.face * Math.sin(k * Math.PI) * 0.18;
        scx *= 1 + Math.sin(k * Math.PI) * 0.08;
    }
    drawShadow(sx, sy, 24 - bob * 0.6, 8 - bob * 0.2, 0.32);
    // feet
    if (p.moving) {
        ctx.fillStyle = '#2a1f18';
        ctx.fillRect(sx - 16 + step * 8, sy - 8, 12, 8);
        ctx.fillRect(sx + 4 - step * 8, sy - 8, 12, 8);
    }
    const flicker = p.hurt > 0 && Math.floor(p.hurt * 20) % 2 === 0;
    if (!flicker) {
        drawSprite('player', sx, sy - bob, 100, p.face === -1, 1, scx, scy, rot);
        if (state.tools.armor) {
            ctx.globalCompositeOperation = 'lighter';
            drawSprite('player', sx, sy - bob, 100, p.face === -1, 0.12 + Math.sin(T * 3) * 0.05, scx, scy, rot);
            ctx.globalCompositeOperation = 'source-over';
        }
    }
    // held weapon / swing
    const icon = state.tools.sword ? 'icon-sword' : state.tools.spear ? 'icon-spear' : state.tools.axe ? 'icon-axe' : state.tools.pickaxe ? 'icon-pickaxe' : null;
    if (p.swing > 0) {
        const m = worldMouse();
        const k = p.swing / 0.25;
        const base = Math.atan2(m.y - p.y + 40, m.x - p.x);
        const ang = base + (k - 0.5) * 2.4 * p.face;
        // swing arc trail
        ctx.strokeStyle = `rgba(255,255,255,${0.5 * k})`;
        ctx.lineWidth = 10;
        ctx.beginPath();
        ctx.arc(sx, sy - 45, 62, base - 1.2, base + 1.2);
        ctx.stroke();
        ctx.save();
        ctx.translate(sx, sy - 45);
        ctx.rotate(ang + Math.PI / 2);
        if (icon) drawSprite(icon, 0, -26, 62, false, 1, 1, 1, -Math.PI / 4);
        else {
            ctx.fillStyle = '#e8c7a0';
            ctx.fillRect(-7, -48, 14, 14);
        }
        ctx.restore();
    } else if (icon) {
        drawSprite(icon, sx + 30 * p.face, sy - 26 - bob, 46, p.face === -1, 1, 1, 1, p.face * (0.4 + step * 0.15));
    }
    if (state.torchOn) {
        const tx2 = sx - 30 * p.face;
        const ty2 = sy - 30 - bob;
        drawSprite('icon-torch', tx2, ty2, 46, false, 1, 1, 1, -p.face * 0.25 + Math.sin(T * 5) * 0.05);
        if (Math.random() < 0.5) state.particles.push({ x: tx2 + camX + (Math.random() - 0.5) * 10, y: ty2 + camY - 40, vx: (Math.random() - 0.5) * 20, vy: -60, life: 0.4, max: 0.4, color: Math.random() < 0.5 ? '#fc4' : '#f73', size: 4, grav: 0, fade: true });
    }
}

function drawWorldFx(f, camX, camY) {
    const k = f.t / f.max;
    const sx = f.x - camX;
    const sy = f.y - camY;
    if (f.type === 'fall') {
        drawSprite(f.name, sx, sy, f.size, false, 1 - Math.max(0, k - 0.6) * 2.5, 1, 1, f.dir * Math.min(1.5, k * k * 3));
        if (k > 0.55 && k < 0.6) state.shake = 8;
    } else if (f.type === 'die') {
        drawSprite(f.name, sx, sy, f.size, f.flip, 1 - k, 1 + k * 0.5, 1 - k * 0.8, 0);
        ctx.globalCompositeOperation = 'lighter';
        drawSprite(f.name, sx, sy, f.size, f.flip, (1 - k) * 0.6, 1 + k * 0.5, 1 - k * 0.8, 0);
        ctx.globalCompositeOperation = 'source-over';
    } else if (f.type === 'slash') {
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(f.ang);
        ctx.strokeStyle = `rgba(255,255,220,${1 - k})`;
        ctx.lineWidth = 8 * (1 - k) + 2;
        ctx.beginPath();
        ctx.arc(0, 0, 30 + k * 30, -1, 1);
        ctx.stroke();
        ctx.restore();
    } else if (f.type === 'pop') {
        const y = sy - k * 80;
        const s = 1 + Math.sin(Math.min(1, k * 3) * Math.PI) * 0.4;
        drawSprite(f.name, sx, y, 64 * s, false, 1 - Math.max(0, k - 0.7) * 3);
    }
}

function drawText(text, x, y, size, color, align = 'left') {
    ctx.font = `${size}px 'Press Start 2P', monospace`;
    ctx.textAlign = align;
    ctx.fillStyle = '#000';
    ctx.fillText(text, x + 3, y + 3);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
}

// Ornate wooden HUD panel with gold corner rivets
function panel(x, y, w, h, accent = '#8a6a3a') {
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(x + 6, y + 6, w, h);
    ctx.fillStyle = '#1c140e';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#2a1e14';
    for (let i = 0; i < h; i += 12) ctx.fillRect(x + 4, y + i + 4, w - 8, 2);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 4;
    ctx.strokeRect(x, y, w, h);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 5, y + 5, w - 10, h - 10);
    ctx.fillStyle = '#e8c35a';
    for (const [cx, cy] of [[x + 2, y + 2], [x + w - 10, y + 2], [x + 2, y + h - 10], [x + w - 10, y + h - 10]]) {
        ctx.fillRect(cx, cy, 8, 8);
        ctx.fillStyle = '#fff3c0';
        ctx.fillRect(cx, cy, 3, 3);
        ctx.fillStyle = '#e8c35a';
    }
}

function fancyBar(x, y, w, h, frac, ghost, c1, c2, label) {
    ctx.fillStyle = '#000';
    ctx.fillRect(x - 3, y - 3, w + 6, h + 6);
    ctx.fillStyle = '#2a1a1a';
    ctx.fillRect(x, y, w, h);
    if (ghost > frac) {
        ctx.fillStyle = '#f5e6c0';
        ctx.fillRect(x, y, w * Math.max(0, ghost), h);
    }
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w * Math.max(0, frac), h);
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.fillRect(x, y + 3, w * Math.max(0, frac), 4);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    for (let i = 1; i < 10; i++) ctx.fillRect(x + w * i / 10 - 1, y, 2, h);
    if (frac < 0.25 && frac > 0) {
        ctx.fillStyle = `rgba(255,255,255,${0.2 + Math.sin(state.time * 10) * 0.2})`;
        ctx.fillRect(x, y, w * frac, h);
    }
    if (label) drawText(label, x + w - 10, y + h - 7, 13, '#fff', 'right');
}

const HEART = ['01100110', '11111111', '11111111', '11111111', '01111110', '00111100', '00011000'];
function drawHeart(x, y, s, beat) {
    const sc = s * (1 + beat);
    for (let r = 0; r < HEART.length; r++) {
        for (let c = 0; c < 8; c++) {
            if (HEART[r][c] === '1') {
                ctx.fillStyle = (r < 2 && c > 0 && c < 3) ? '#ffb0b0' : r > 4 ? '#a81818' : '#e43030';
                ctx.fillRect(x + (c - 4) * sc, y + (r - 3.5) * sc, sc, sc);
            }
        }
    }
}

function drawHUD(dark) {
    const p = state.player;
    const T = state.time;
    // compact vitals panel
    panel(20, 20, 470, 150);
    const beatSpeed = p.hp < 30 ? 9 : 4;
    drawHeart(64, 64, 5, Math.max(0, Math.sin(T * beatSpeed)) * 0.15);
    fancyBar(104, 46, 360, 34, p.hp / p.maxHp, state.hpShown / p.maxHp, '#ff5a5a', '#9a1414', `${Math.ceil(Math.max(0, p.hp))}/${p.maxHp}`);
    drawSprite('icon-meat', 64, 136, 44, false, 1, 1, 1, Math.sin(T * 2) * 0.1);
    fancyBar(104, 100, 360, 34, p.hunger / 100, 0, '#ffc14a', '#9a5a10', `${Math.ceil(p.hunger)}/100`);
    panel(20, 178, 470, 56, '#b08a2a');
    drawText(`LV ${state.level}`, 36, 216, 14, '#ffe08a');
    fancyBar(130, 192, 340, 28, state.xp / xpNeeded(), 0, '#ffe08a', '#8a6a10', `${state.xp}/${xpNeeded()} XP`);
    if (state.cycle) drawText(`Ascension ${state.cycle}`, 36, 258, 11, '#d9b3ff');

    // day dial
    const dcx = W - 400;
    const dcy = 100;
    const t = (T % DAY_LENGTH) / DAY_LENGTH;
    panel(dcx - 80, 20, 160, 210);
    ctx.save();
    ctx.beginPath();
    ctx.arc(dcx, dcy, 60, 0, Math.PI * 2);
    ctx.clip();
    const sky = ctx.createLinearGradient(0, dcy - 60, 0, dcy + 60);
    sky.addColorStop(0, dark > 0.5 ? '#0c1030' : '#6ab4ff');
    sky.addColorStop(1, dark > 0.5 ? '#2a2050' : '#ffd38a');
    ctx.fillStyle = sky;
    ctx.fillRect(dcx - 60, dcy - 60, 120, 120);
    const ang = t * Math.PI * 2 - Math.PI;
    const sunX = dcx + Math.cos(ang) * 40;
    const sunY = dcy + Math.sin(ang) * 40;
    ctx.fillStyle = '#ffe36a';
    ctx.beginPath();
    ctx.arc(sunX, sunY, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e6eaff';
    ctx.beginPath();
    ctx.arc(dcx - Math.cos(ang) * 40, dcy - Math.sin(ang) * 40, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = sky;
    ctx.beginPath();
    ctx.arc(dcx - Math.cos(ang) * 40 + 5, dcy - Math.sin(ang) * 40 - 3, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2f4a22';
    ctx.fillRect(dcx - 60, dcy + 10, 120, 60);
    ctx.restore();
    ctx.strokeStyle = '#e8c35a';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(dcx, dcy, 60, 0, Math.PI * 2);
    ctx.stroke();
    const phase = dark > 0.5 ? 'NIGHT' : t > 0.5 ? 'DUSK' : 'DAY';
    drawText(`DAY ${state.day}`, dcx, 190, 16, '#ffe08a', 'center');
    drawText(phase, dcx, 214, 11, dark > 0.5 ? '#9ab' : '#fff', 'center');

    // minimap
    const ms = 280;
    const mx = W - ms - 30;
    const my = 30;
    panel(mx - 14, my - 14, ms + 28, ms + 28);
    ctx.save();
    ctx.beginPath();
    ctx.rect(mx, my, ms, ms);
    ctx.clip();
    const view = 110;
    const ptx = p.x / TILE;
    const pty = p.y / TILE;
    const scale = ms / view;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(miniBase, ptx - view / 2, pty - view / 2, view, view, mx, my, ms, ms);
    ctx.drawImage(miniFog, ptx - view / 2, pty - view / 2, view, view, mx, my, ms, ms);
    const toMini = (wx, wy) => [mx + (wx - ptx + view / 2) * scale, my + (wy - pty + view / 2) * scale];
    for (const l of world.lore) {
        const o = getObj(l.x, l.y);
        const [ax, ay] = toMini(l.x, l.y);
        ctx.fillStyle = o?.read ? '#b48cff' : '#fff';
        if (o?.read || miniFogClear(l.x, l.y)) ctx.fillRect(ax - 3, ay - 3, 7, 7);
    }
    for (const b of world.bosses) {
        if (!loreKnown(b) && !miniFogClear(b.tx, b.ty)) continue;
        const [ax, ay] = toMini(b.tx, b.ty);
        ctx.fillStyle = b.state === 'defeated' ? '#777' : '#f44';
        ctx.fillRect(ax - 6, ay - 6, 13, 13);
        ctx.fillStyle = '#000';
        ctx.fillRect(ax - 2, ay - 2, 5, 5);
    }
    const [aax, aay] = toMini(world.spawn.x, world.spawn.y);
    ctx.fillStyle = '#d9b3ff';
    ctx.fillRect(aax - 5, aay - 5, 11, 11);
    ctx.restore();
    ctx.fillStyle = '#fff';
    ctx.fillRect(mx + ms / 2 - 4, my + ms / 2 - 4, 9, 9);
    ctx.fillStyle = '#e43030';
    ctx.fillRect(mx + ms / 2 - 2, my + ms / 2 - 2, 5, 5);
    drawText('N', mx + ms / 2, my + 20, 12, '#ffe08a', 'center');

    // Minecraft-style nine-slot quickbar; unfilled slots stay intentionally empty.
    const slot = 72;
    const gap = 8;
    const total = slot * 9 + gap * 8;
    const startX = (W - total) / 2;
    const top = H - 100;
    panel(startX - 12, top - 10, total + 24, 92, '#8a7354');
    for (let i = 0; i < 9; i++) {
        const x = startX + i * (slot + gap);
        const y = top;
        const item = getItem(state.hotbar[i]);
        const amount = itemCount(item);
        const selected = i === state.selectedSlot;
        const g = ctx.createLinearGradient(0, y, 0, y + slot);
        g.addColorStop(0, selected ? '#62503b' : '#38312a');
        g.addColorStop(1, selected ? '#382b20' : '#171412');
        ctx.fillStyle = g;
        ctx.fillRect(x, y, slot, slot);
        ctx.strokeStyle = selected ? '#ffe08a' : '#83705a';
        ctx.lineWidth = selected ? 4 : 2;
        ctx.strokeRect(x + 1, y + 1, slot - 2, slot - 2);
        drawText(String(i + 1), x + 7, y + 14, 9, selected ? '#ffe08a' : '#c4b8a8');
        if (amount > 0) {
            const bob = item.key === 'shard' ? Math.sin(T * 3) * 3 : 0;
            drawSprite(item.icon, x + slot / 2, y + 58 + bob, 52, false, 1);
            if (amount > 1) drawText(String(amount), x + slot - 6, y + slot - 5, 12, '#fff', 'right');
            if (item.key === 'torch') {
                ctx.fillStyle = '#000';
                ctx.fillRect(x + 7, y + slot - 8, slot - 14, 4);
                ctx.fillStyle = state.torchOn ? '#fc6' : '#887';
                ctx.fillRect(x + 7, y + slot - 8, (slot - 14) * Math.min(1, state.tools.torch / 90), 4);
            }
        }
    }

    // objective
    const read = world.lore.filter(l => getObj(l.x, l.y)?.read).length;
    let obj;
    if (state.inv.shard >= 3) obj = 'Return the Shards to the Altar!';
    else if (read === 0) obj = 'Read the lore stone near the Altar';
    else obj = `Shards ${state.inv.shard}/3  ·  Lore ${read}/${LORE.length}`;
    panel(W - 560, H - 104, 540, 84, '#6a4a8a');
    drawSprite('icon-shard', W - 520, H - 34, 44, false, 1, 1, 1, Math.sin(T * 2) * 0.1);
    drawText(obj, W - 40, H - 62, 13, '#d9b3ff', 'right');
    drawText(`Seed: ${world.seedStr}`, W - 40, H - 36, 10, '#998', 'right');
    drawText('[E] Inventory [F] Eat [T] Torch [1-4] Build', 30, H - 30, 11, '#bbb');

    // boss bar
    let nearBoss = null;
    for (const e of state.enemies) {
        if (e.boss && Math.hypot(e.x - p.x, e.y - p.y) < 1500) nearBoss = e;
    }
    if (nearBoss) {
        const bw = 860;
        const bx = W / 2 - bw / 2;
        panel(bx - 24, 24, bw + 48, 90, '#8a2be2');
        drawText(nearBoss.name.toUpperCase(), W / 2, 58, 18, nearBoss.hp < nearBoss.maxHp / 2 ? '#ff6a6a' : '#e6d0ff', 'center');
        fancyBar(bx, 72, bw, 24, nearBoss.hp / nearBoss.maxHp, 0, '#c070ff', '#4a0a8a', '');
        if (nearBoss.hp < nearBoss.maxHp / 2) drawText('ENRAGED', bx + bw - 10, 58, 11, '#f55', 'right');
    }

    // compass arrows
    const targets = [];
    if (state.inv.shard >= 3) targets.push({ x: world.spawn.x * TILE, y: world.spawn.y * TILE, c: '#fff', l: 'ALTAR' });
    for (const b of world.bosses) {
        if (b.state !== 'defeated' && loreKnown(b)) targets.push({ x: b.tx * TILE + 32, y: b.ty * TILE, c: '#c9f', l: b.state === 'sealed' ? `${b.name} shrine` : b.name });
    }
    for (const t2 of targets) {
        const dx = t2.x - p.x;
        const dy = t2.y - p.y;
        const d = Math.hypot(dx, dy);
        if (d < 600) continue;
        const pulse = 1 + Math.sin(T * 5) * 0.15;
        const ax = W / 2 + dx / d * 420;
        const ay = H / 2 + dy / d * 360;
        ctx.save();
        ctx.translate(ax, ay);
        ctx.rotate(Math.atan2(dy, dx));
        ctx.scale(pulse, pulse);
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.moveTo(22, 0); ctx.lineTo(-12, -15); ctx.lineTo(-12, 15);
        ctx.fill();
        ctx.fillStyle = t2.c;
        ctx.beginPath();
        ctx.moveTo(17, 0); ctx.lineTo(-8, -10); ctx.lineTo(-8, 10);
        ctx.fill();
        ctx.restore();
        drawText(`${t2.l} ${Math.round(d / TILE)}m`, ax, ay + 34, 10, t2.c, 'center');
    }

    if (state.gloom > 1) drawText('Something stirs in the dark... find light!', W / 2, 160, 18, '#f7a', 'center');

    // shrine hint when near
    for (const b of world.bosses) {
        const d = Math.hypot(b.tx * TILE + 32 - p.x, b.ty * TILE + 32 - p.y);
        if (d < 300 && b.state === 'sealed') drawText(loreKnown(b) ? `Offer ${b.costText} - click the shrine` : 'An ancient shrine... (read the lore stones)', W / 2, H - 290, 14, '#ffe08a', 'center');
    }

    if (state.dialog) {
        const appear = Math.min(1, (10 - Math.min(10, state.dialog.t)) * 6);
        const dw = 1240 * Math.min(1, appear + 0.3);
        panel(W / 2 - dw / 2, H - 270, dw, 124, '#b48cff');
        if (appear >= 1) wrapText(state.dialog.text, W / 2 - 590, H - 228, 1180, 30);
    }
}

function loreKnown(b) {
    const l = world.lore[b.lore];
    return !!(l && getObj(l.x, l.y)?.read);
}

function miniFogClear(x, y) {
    const d = miniFog.getContext('2d').getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
    return d[3] < 128;
}

function wrapText(text, x, y, maxW, lh) {
    ctx.font = "15px 'Press Start 2P', monospace";
    const words = text.split(' ');
    let line = '';
    for (const w of words) {
        const test = line + w + ' ';
        if (ctx.measureText(test).width > maxW && line) {
            drawText(line, x, y, 15, '#eee');
            line = w + ' ';
            y += lh;
        } else {
            line = test;
        }
    }
    drawText(line, x, y, 15, '#eee');
}

// ---------- Peer-to-peer co-op ----------
const multiplayerPanelEl = document.getElementById('multiplayerPanel');
const multiplayerStatusEl = document.getElementById('multiplayerStatus');
const roomCodeEl = document.getElementById('roomCode');
const onlineBadgeEl = document.getElementById('onlineBadge');
const playerNameEl = document.getElementById('playerName');

function safeName(value) {
    return String(value || '').replace(/[<>]/g, '').trim().slice(0, 18) || 'Wanderer';
}

function updatePartyUI() {
    const count = partyRole === 'host' ? 1 + partyPlayers.size : partyRole === 'client' ? partyPlayers.size + 1 : 0;
    if (partyRole === 'offline') {
        onlineBadgeEl.classList.remove('visible');
        roomCodeEl.style.display = 'none';
        return;
    }
    onlineBadgeEl.textContent = `ONLINE · ${count}/4 · ${partyRoomId}`;
    onlineBadgeEl.classList.add('visible');
    roomCodeEl.textContent = `INVITE CODE\n${partyRoomId}`;
    roomCodeEl.style.display = 'block';
}

function packWorldSnapshot() {
    return {
        time: state.time,
        day: state.day,
        cycle: state.cycle,
        worldChanges: { ...world.changes },
        bosses: world.bosses.map(b => b.state),
        enemies: state.enemies.map(e => ({ ...e })),
        projectiles: state.projectiles.map(p => ({ ...p })),
        players: [
            { id: multiplayer.peer?.id || 'host', name: partyName, x: state.player.x, y: state.player.y, hp: state.player.hp, face: state.player.face, tools: { ...state.tools }, local: true },
            ...[...partyPlayers.values()].map(p => ({ id: p.id, name: p.name, x: p.x, y: p.y, hp: p.hp, face: p.face, tools: p.tools || {} })),
        ],
    };
}

function applyWorldChanges(changes) {
    if (!changes || typeof changes !== 'object') return;
    for (const [key, object] of Object.entries(changes)) {
        const index = Number(key);
        if (!Number.isInteger(index) || index < 0 || index >= WORLD * WORLD) continue;
        const value = object && typeof object === 'object' ? { ...object } : null;
        world.objs[index] = value;
        world.changes[index] = value;
    }
}

function applyNetworkSnapshot(snapshot) {
    if (!snapshot || !state) return;
    state.time = Number.isFinite(snapshot.time) ? snapshot.time : state.time;
    state.day = Number.isFinite(snapshot.day) ? snapshot.day : state.day;
    state.cycle = Number.isFinite(snapshot.cycle) ? snapshot.cycle : state.cycle;
    applyWorldChanges(snapshot.worldChanges);
    if (Array.isArray(snapshot.bosses)) {
        snapshot.bosses.forEach((bossState, index) => {
            if (world.bosses[index] && ['sealed', 'awake', 'defeated'].includes(bossState)) world.bosses[index].state = bossState;
        });
    }
    if (Array.isArray(snapshot.enemies)) state.enemies = snapshot.enemies.map(e => ({ ...e }));
    if (Array.isArray(snapshot.projectiles)) state.projectiles = snapshot.projectiles.map(p => ({ ...p }));
    const activeIds = new Set();
    if (Array.isArray(snapshot.players)) {
        for (const player of snapshot.players) {
            if (!player || typeof player.id !== 'string' || player.id === multiplayer.peer?.id) continue;
            activeIds.add(player.id);
            partyPlayers.set(player.id, { ...player });
        }
    }
    for (const id of partyPlayers.keys()) if (!activeIds.has(id)) partyPlayers.delete(id);
    updatePartyUI();
}

function applyGuestChanges(changes) {
    if (!changes || typeof changes !== 'object') return;
    for (const [key, object] of Object.entries(changes)) {
        const index = Number(key);
        if (!Number.isInteger(index) || index < 0 || index >= WORLD * WORLD) continue;
        const value = object && typeof object === 'object' ? { ...object } : null;
        world.objs[index] = value;
        world.changes[index] = value;
    }
}

function wakeBossFromGuest(bossIndex) {
    const boss = world.bosses[bossIndex];
    if (!boss || boss.state !== 'sealed') return;
    const shrine = getObj(boss.tx, boss.ty);
    if (!shrine) return;
    boss.state = 'awake';
    const def = ENEMY_DEFS[boss.kind];
    const hp = def.hp * (1 + state.cycle * 0.8);
    if (!state.enemies.some(e => e.id === `boss-${bossIndex}`)) {
        const x = boss.tx * TILE + 32;
        const y = boss.ty * TILE + 232;
        state.enemies.push({ id: `boss-${bossIndex}`, kind: boss.kind, boss: true, bossIdx: bossIndex, name: boss.name, x, y, hx: x, hy: y, hp, maxHp: hp, cd: 1, special: 4, hurt: 0, intro: 2.5, squash: 0 });
    }
}

function handleNetworkMessage(peerId, message, connection) {
    if (message.type === 'hello' && partyRole === 'host') {
        if (!state || partyPlayers.size >= 3) {
            connection.send({ type: 'refuse', reason: 'This party is full or the host world is not ready.' });
            return;
        }
        const angle = partyPlayers.size * Math.PI / 2;
        const guest = {
            id: peerId,
            name: safeName(message.name),
            x: state.player.x + Math.cos(angle) * 100,
            y: state.player.y + Math.sin(angle) * 100,
            hp: 100,
            face: 1,
            tools: {},
        };
        partyPlayers.set(peerId, guest);
        connection.send({ type: 'welcome', hostId: partyRoomId, seed: world.seedStr, snapshot: packWorldSnapshot() });
        updatePartyUI();
        return;
    }
    if (message.type === 'refuse') {
        multiplayerStatusEl.textContent = message.reason || 'Could not join the party.';
        partyRole = 'offline';
        partyRoomId = '';
        partyPlayers.clear();
        multiplayer.close();
        updatePartyUI();
        return;
    }
    if (message.type === 'welcome' && partyRole === 'client') {
        partyRoomId = String(message.hostId || peerId);
        newGame(String(message.seed || 'SHARDFALL'));
        applyNetworkSnapshot(message.snapshot);
        state.player.x = world.spawn.x * TILE + TILE / 2 + 96;
        state.player.y = (world.spawn.y + 1) * TILE + TILE / 2;
        state.cam.x = state.player.x - W / 2;
        state.cam.y = state.player.y - H / 2;
        enterGame();
        multiplayerPanelEl.classList.add('hidden');
        multiplayerStatusEl.textContent = `Joined ${partyName}'s party.`;
        updatePartyUI();
        return;
    }
    if (message.type === 'snapshot' && partyRole === 'client') {
        applyNetworkSnapshot(message.snapshot);
        return;
    }
    if (message.type === 'presence' && partyRole === 'host') {
        const remote = partyPlayers.get(peerId);
        const p = message.player;
        if (!remote || !p) return;
        if (Number.isFinite(p.x) && Number.isFinite(p.y)) {
            remote.x = Math.max(0, Math.min(WORLD * TILE, p.x));
            remote.y = Math.max(0, Math.min(WORLD * TILE, p.y));
        }
        if (Number.isFinite(p.hp)) remote.hp = Math.max(0, Math.min(200, p.hp));
        remote.face = p.face === -1 ? -1 : 1;
        remote.tools = p.tools && typeof p.tools === 'object' ? p.tools : {};
        remote.name = safeName(p.name || remote.name);
        applyGuestChanges(message.changes);
        updatePartyUI();
        return;
    }
    if (message.type === 'hit' && partyRole === 'host') {
        const remote = partyPlayers.get(peerId);
        const enemy = state?.enemies.find(e => e.id === message.enemyId);
        if (!remote || !enemy || !Number.isFinite(message.damage)) return;
        const reach = 150 + ENEMY_DEFS[enemy.kind].size * 0.35;
        if (Math.hypot(enemy.x - remote.x, enemy.y - remote.y) > reach + 40) return;
        const damage = Math.max(1, Math.min(80, Math.round(message.damage)));
        enemy.hp -= damage;
        enemy.hurt = 0.18;
        if (enemy.hp <= 0) killEnemy(enemy);
        return;
    }
    if (message.type === 'boss_wake' && partyRole === 'host') {
        const index = Number(message.bossIdx);
        if (Number.isInteger(index) && index >= 0 && index < world.bosses.length) wakeBossFromGuest(index);
        return;
    }
    if (message.type === 'damage' && partyRole === 'client' && state) {
        const amount = Math.max(0, Math.min(200, Number(message.amount) || 0));
        state.player.hp -= amount;
        state.player.hurt = 0.5;
        state.shake = 12;
        state.redFlash = 0.35;
        floatText(state.player.x, state.player.y - 110, `-${amount}`, '#f44');
        return;
    }
}

function enablePartyNetwork() {
    multiplayer.onMessage = handleNetworkMessage;
    multiplayer.onPeerLeave = peerId => {
        partyPlayers.delete(peerId);
        updatePartyUI();
        multiplayerStatusEl.textContent = 'A wanderer left the party.';
    };
    multiplayer.onStatus = text => {
        multiplayerStatusEl.textContent = text;
        if (partyRole === 'client' && text === 'Connection to the host was lost.') {
            partyRole = 'offline';
            partyRoomId = '';
            partyPlayers.clear();
            for (const key of Object.keys(pendingWorldChanges)) delete pendingWorldChanges[key];
            multiplayer.close();
            updatePartyUI();
        }
    };
}

async function ensureMultiplayer() {
    if (multiplayerReady) return multiplayer;
    if (!multiplayerPromise) {
        multiplayerPromise = import('./multiplayer.js').then(({ Multiplayer }) => {
            multiplayer = new Multiplayer();
            multiplayerReady = true;
            enablePartyNetwork();
            return multiplayer;
        }).catch(error => {
            multiplayerPromise = null;
            throw new Error(`Could not load online co-op: ${error?.message || 'module unavailable'}`);
        });
    }
    return multiplayerPromise;
}

function shareLocalNetworkState() {
    if (!state || partyRole === 'offline') return;
    if (partyRole === 'host') {
        multiplayer.send({ type: 'snapshot', snapshot: packWorldSnapshot() });
    } else {
        const changes = { ...pendingWorldChanges };
        for (const key of Object.keys(pendingWorldChanges)) delete pendingWorldChanges[key];
        multiplayer.send({
            type: 'presence',
            player: { id: multiplayer.peer?.id, name: partyName, x: state.player.x, y: state.player.y, hp: state.player.hp, face: state.player.face, tools: { ...state.tools } },
            changes,
        });
    }
}

function leaveParty() {
    multiplayer.close();
    partyRole = 'offline';
    partyRoomId = '';
    partyPlayers.clear();
    for (const key of Object.keys(pendingWorldChanges)) delete pendingWorldChanges[key];
    updatePartyUI();
}

// ---------- Flow ----------
const menuEl = document.getElementById('menu');
const endEl = document.getElementById('end');
const settingsPanelEl = document.getElementById('settingsPanel');
const resolutionSettingEl = document.getElementById('resolutionSetting');
const musicVolumeEl = document.getElementById('musicVolume');
const sfxVolumeEl = document.getElementById('sfxVolume');
const settingsStatusEl = document.getElementById('settingsStatus');
const fullscreenButton = document.getElementById('fullscreenSetting');

function syncSettingsControls() {
    resolutionSettingEl.value = settings.resolution;
    document.getElementById('resolutionValue').textContent = settings.resolution.replace('x', ' × ');
    musicVolumeEl.value = String(settings.musicVolume);
    sfxVolumeEl.value = String(settings.sfxVolume);
    document.getElementById('musicVolumeValue').textContent = `${Math.round(settings.musicVolume * 100)}%`;
    document.getElementById('sfxVolumeValue').textContent = `${Math.round(settings.sfxVolume * 100)}%`;
    document.getElementById('muteSetting').checked = muted;
    fullscreenButton.textContent = document.fullscreenElement ? 'EXIT FULLSCREEN' : 'ENTER FULLSCREEN';
}

function showSettings(open) {
    settingsPanelEl.classList.toggle('hidden', !open);
    if (open) {
        syncSettingsControls();
        settingsStatusEl.textContent = '';
        resolutionSettingEl.focus();
    } else {
        document.getElementById('openSettings').focus();
    }
}

document.getElementById('openSettings').addEventListener('click', () => showSettings(true));
document.getElementById('closeSettings').addEventListener('click', () => showSettings(false));
settingsPanelEl.addEventListener('click', e => {
    if (e.target === settingsPanelEl) showSettings(false);
});
document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !multiplayerPanelEl.classList.contains('hidden')) {
        e.preventDefault();
        multiplayerPanelEl.classList.add('hidden');
        return;
    }
    if (e.key === 'Escape' && !settingsPanelEl.classList.contains('hidden')) {
        e.preventDefault();
        showSettings(false);
    }
});
resolutionSettingEl.addEventListener('change', () => {
    settings.resolution = resolutionSettingEl.value;
    applyRenderResolution();
    saveSettings();
    const label = settings.resolution.replace('x', ' × ');
    document.getElementById('resolutionValue').textContent = label;
    settingsStatusEl.textContent = `Render resolution set to ${label}.`;
});
musicVolumeEl.addEventListener('input', () => {
    settings.musicVolume = Math.max(0, Math.min(1, Number(musicVolumeEl.value)));
    music.volume = settings.musicVolume;
    document.getElementById('musicVolumeValue').textContent = `${Math.round(settings.musicVolume * 100)}%`;
    saveSettings();
});
sfxVolumeEl.addEventListener('input', () => {
    settings.sfxVolume = Math.max(0, Math.min(1, Number(sfxVolumeEl.value)));
    soundEffectsVolume = settings.sfxVolume;
    document.getElementById('sfxVolumeValue').textContent = `${Math.round(settings.sfxVolume * 100)}%`;
    saveSettings();
});
document.getElementById('muteSetting').addEventListener('change', e => setMuted(e.target.checked));
fullscreenButton.addEventListener('click', async () => {
    try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen();
    } catch {
        settingsStatusEl.textContent = 'Fullscreen is unavailable in this preview.';
    }
});
document.addEventListener('fullscreenchange', syncSettingsControls);
syncSettingsControls();

async function createParty() {
    partyName = safeName(playerNameEl.value);
    playerNameEl.value = partyName;
    multiplayerStatusEl.textContent = 'Opening a secure peer-to-peer room…';
    document.getElementById('hostRoom').disabled = true;
    try {
        const network = await ensureMultiplayer();
        const roomId = await network.createRoom();
        partyRole = 'host';
        partyRoomId = roomId;
        partyPlayers.clear();
        const seedValue = document.getElementById('seed').value.trim();
        const seed = seedValue || Math.random().toString(36).slice(2, 8).toUpperCase();
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        music.play().catch(() => {});
        newGame(seed);
        enterGame();
        multiplayerPanelEl.classList.add('hidden');
        multiplayerStatusEl.textContent = 'Party open. Click the ONLINE badge to copy its invite code.';
        updatePartyUI();
    } catch (error) {
        partyRole = 'offline';
        multiplayerStatusEl.textContent = `Could not create a party: ${error?.message || 'connection unavailable'}`;
        multiplayer.close();
    } finally {
        document.getElementById('hostRoom').disabled = false;
    }
}

async function joinParty() {
    const roomId = document.getElementById('joinCode').value.trim();
    if (!roomId) {
        multiplayerStatusEl.textContent = 'Enter your friend’s invite code first.';
        return;
    }
    partyName = safeName(playerNameEl.value);
    playerNameEl.value = partyName;
    partyRole = 'client';
    multiplayerStatusEl.textContent = 'Connecting to the host…';
    document.getElementById('joinRoom').disabled = true;
    try {
        const network = await ensureMultiplayer();
        const connection = await network.joinRoom(roomId);
        connection.send({ type: 'hello', name: partyName });
        multiplayerStatusEl.textContent = 'Connected. Waiting for the host world…';
    } catch (error) {
        partyRole = 'offline';
        multiplayerStatusEl.textContent = `Could not join: ${error?.message || 'check the invite code and try again'}`;
        multiplayer.close();
    } finally {
        document.getElementById('joinRoom').disabled = false;
    }
}

async function copyPartyCode() {
    if (!partyRoomId) {
        multiplayerStatusEl.textContent = 'Create a party first to get an invite code.';
        return;
    }
    try {
        await navigator.clipboard.writeText(partyRoomId);
        multiplayerStatusEl.textContent = 'Invite code copied. Send it to your friends.';
    } catch {
        multiplayerStatusEl.textContent = `Copy this invite code and send it to your friends: ${partyRoomId}`;
    }
}

document.getElementById('openMultiplayer').addEventListener('click', () => {
    multiplayerPanelEl.classList.remove('hidden');
    multiplayerStatusEl.textContent = partyRole === 'offline' ? 'Up to four players. Share the host’s invite code to join.' : 'Party is online. Share the code shown below.';
    updatePartyUI();
    playerNameEl.focus();
});
document.getElementById('closeMultiplayer').addEventListener('click', () => multiplayerPanelEl.classList.add('hidden'));
multiplayerPanelEl.addEventListener('click', event => {
    if (event.target === multiplayerPanelEl) multiplayerPanelEl.classList.add('hidden');
});
document.getElementById('hostRoom').addEventListener('click', createParty);
document.getElementById('joinRoom').addEventListener('click', joinParty);
document.getElementById('copyRoom').addEventListener('click', copyPartyCode);
onlineBadgeEl.addEventListener('click', copyPartyCode);

function startFromMenu() {
    leaveParty();
    const val = document.getElementById('seed').value.trim();
    const seed = val || Math.random().toString(36).slice(2, 8).toUpperCase();
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    music.play().catch(() => {});
    newGame(seed);
    enterGame();
}

function enterGame() {
    buildRecipeUI();
    menuEl.classList.add('hidden');
    endEl.classList.add('hidden');
    state.inventoryOpen = false;
    craftEl.style.display = 'none';
    syncTouchControls();
}

function continueGame() {
    leaveParty();
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    music.play().catch(() => {});
    try {
        loadGame();
    } catch {
        clearSave();
        showMenu();
        return;
    }
    enterGame();
}

function showMenu() {
    const r = loadRecords();
    const resumeAvailable = hasSave();
    document.getElementById('continue').classList.toggle('hidden', !resumeAvailable);
    document.getElementById('continue').classList.toggle('primary', resumeAvailable);
    document.getElementById('start').classList.toggle('primary', !resumeAvailable);
    document.getElementById('records').textContent = r.bestDay
        ? `RECORDS - Best day: ${r.bestDay} · Best level: ${r.bestLevel} · Ascensions: ${r.bestCycle || 0} · Crowns restored: ${r.wins || 0} · Creatures slain: ${r.kills || 0}`
        : '';
    menuEl.classList.remove('hidden');
    syncTouchControls();
}

function ascend() {
    state.cycle++;
    state.inv.shard = 0;
    for (const b of world.bosses) b.state = 'sealed';
    state.over = false;
    state.inventoryOpen = false;
    state.pendingLevels++;
    state.player.hp = state.player.maxHp;
    state.dialog = { text: `The Crown shatters again, and the guardians wake angrier than before (Ascension ${state.cycle}). Every creature is stronger now, and so are your rewards.`, t: 9 };
    endEl.classList.add('hidden');
    craftEl.style.display = 'none';
    syncTouchControls();
    saveGame();
}

function loseGame() {
    state.over = true;
    syncTouchControls();
    updateRecords();
    clearSave();
    document.getElementById('ascend').classList.add('hidden');
    state.inventoryOpen = false;
    document.getElementById('endTitle').textContent = 'YOU PERISHED';
    document.getElementById('endTitle').style.color = '#f55';
    document.getElementById('endText').textContent = `The night claimed you on day ${state.day}. Shards recovered: ${state.inv.shard}/3. Seed: ${world.seedStr}`;
    endEl.classList.remove('hidden');
    craftEl.style.display = 'none';
}

function winGame() {
    state.over = true;
    syncTouchControls();
    state.inventoryOpen = false;
    burst(state.player.x, state.player.y, '#ffd', 80);
    document.getElementById('endTitle').textContent = 'DAWN RETURNS';
    document.getElementById('endTitle').style.color = '#ffe08a';
    document.getElementById('endText').textContent = `The Crown of Dawn is whole again and the sun rises over the land. You restored it in ${state.day} days at level ${state.level}. Seed: ${world.seedStr}. Ascend to keep this world and your character, with stronger guardians and better rewards.`;
    updateRecords({ win: true });
    clearSave();
    document.getElementById('ascend').classList.remove('hidden');
    endEl.classList.remove('hidden');
    craftEl.style.display = 'none';
    window.ProgressLogger?.logProgress?.('victory', { day: state.day });
}

document.getElementById('start').onclick = startFromMenu;
document.getElementById('continue').onclick = continueGame;
document.getElementById('closeInventory').onclick = () => toggleInventory(false);
document.getElementById('ascend').onclick = ascend;
document.getElementById('again').onclick = () => {
    leaveParty();
    endEl.classList.add('hidden');
    document.getElementById('seed').value = '';
    showMenu();
};
addEventListener('beforeunload', () => {
    saveGame();
    multiplayer.close();
});
showMenu();

let last = performance.now();
let uiTimer = 0;
function loop(now) {
    let dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (state) {
        if (state.hitstop > 0) {
            state.hitstop -= dt;
            dt *= 0.1;
        }
        if (!state.over && !state.menuOpen && !state.inventoryOpen) update(dt);
        if (partyRole !== 'offline') {
            networkTimer += dt;
            if (networkTimer >= 0.14) {
                networkTimer = 0;
                shareLocalNetworkState();
            }
        }
        render();
        uiTimer -= dt;
        if (uiTimer <= 0) {
            uiTimer = 0.25;
            if (state.inventoryOpen) refreshRecipeUI();
        }
    } else {
        ctx.fillStyle = '#0a0812';
        ctx.fillRect(0, 0, W, H);
    }
    requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
