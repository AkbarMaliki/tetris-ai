(() => {
'use strict';

// =====================================================================
//  Konstanta & aturan
// =====================================================================
const COLS = 10, ROWS = 20, HIDDEN = 2, TOTAL = ROWS + HIDDEN;
const DAS = 160;          // delay sebelum auto-repeat geser (ms)
const ARR = 45;           // kecepatan auto-repeat (ms)
const LOCK_DELAY = 500;   // ms sebelum balok terkunci saat menyentuh dasar
const MAX_RESETS = 15;    // batas reset lock delay
const SOFT_MS = 30;       // interval soft drop (ms per sel)

const TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
const COLORS = {
  I: 0x28e8ff, O: 0xffd93a, T: 0xb04cff, S: 0x46f06a,
  Z: 0xff4060, J: 0x3f6dff, L: 0xff9430, X: 0x4a4b5e,
};
const SHAPES = {
  I: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]],
  O: [[1,1],[1,1]],
  T: [[0,1,0],[1,1,1],[0,0,0]],
  S: [[0,1,1],[1,1,0],[0,0,0]],
  Z: [[1,1,0],[0,1,1],[0,0,0]],
  J: [[1,0,0],[1,1,1],[0,0,0]],
  L: [[0,0,1],[1,1,1],[0,0,0]],
};

function rotCW(m) {
  const n = m.length;
  return m.map((row, y) => row.map((_, x) => m[n - 1 - x][y]));
}

// ROT[type][rot] = daftar sel [x, y] relatif terhadap kotak bentuk
const ROT = {};
for (const t of TYPES) {
  ROT[t] = [];
  let m = SHAPES[t];
  for (let r = 0; r < 4; r++) {
    const cells = [];
    m.forEach((row, y) => row.forEach((v, x) => { if (v) cells.push([x, y]); }));
    ROT[t].push(cells);
    m = rotCW(m);
  }
}

// Tabel wall kick SRS (y positif = ke atas)
const KICK_JLSTZ = {
  '01': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  '10': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
  '12': [[0,0],[1,0],[1,-1],[0,2],[1,2]],
  '21': [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
  '23': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
  '32': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  '30': [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  '03': [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
};
const KICK_I = {
  '01': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
  '10': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
  '12': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
  '21': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
  '23': [[0,0],[2,0],[-1,0],[2,1],[-1,-2]],
  '32': [[0,0],[-2,0],[1,0],[-2,-1],[1,2]],
  '30': [[0,0],[1,0],[-2,0],[1,-2],[-2,1]],
  '03': [[0,0],[-1,0],[2,0],[-1,2],[2,-1]],
};

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
};

const $ = id => document.getElementById(id);
const hex = c => '#' + c.toString(16).padStart(6, '0');

// =====================================================================
//  Audio (efek suara + musik Korobeiniki via WebAudio)
// =====================================================================
const Sound = (() => {
  let ctx = null, master, sfxBus, musicBus;
  let muted = store.get('t3d_muted', false);
  let musicOn = store.get('t3d_music', true);

  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8; master.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
    musicBus = ctx.createGain(); musicBus.gain.value = musicOn ? 0.3 : 0; musicBus.connect(master);
  }

  function tone(freq, dur, { type = 'square', vol = 0.1, slide = 0, delay = 0, at = 0, dest = null } = {}) {
    if (!ctx) return;
    const t = at || ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || sfxBus);
    o.start(t); o.stop(t + dur + 0.03);
  }

  function noise(dur, vol = 0.25, freq = 800) {
    if (!ctx) return;
    const len = Math.floor(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
    const g = ctx.createGain(); g.gain.value = vol;
    src.connect(f); f.connect(g); g.connect(sfxBus);
    src.start();
  }

  const sfx = {
    move:   () => tone(260, 0.035, { type: 'square', vol: 0.025 }),
    rotate: () => tone(520, 0.06, { type: 'triangle', vol: 0.07, slide: 780 }),
    hold:   () => { tone(330, 0.07, { type: 'triangle', vol: 0.07 }); tone(495, 0.08, { type: 'triangle', vol: 0.07, delay: 0.05 }); },
    lock:   () => tone(140, 0.09, { type: 'sine', vol: 0.18, slide: 70 }),
    hard:   () => { noise(0.18, 0.35, 600); tone(110, 0.16, { type: 'sine', vol: 0.3, slide: 40 }); },
    clear:  n => {
      const base = [523, 587, 659, 784];
      for (let i = 0; i < n; i++) tone(base[i], 0.14, { type: 'square', vol: 0.07, delay: i * 0.06 });
      noise(0.25, 0.15, 3000);
    },
    tetris: () => {
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.18, { type: 'square', vol: 0.08, delay: i * 0.06 }));
      tone(65, 0.5, { type: 'sine', vol: 0.35, slide: 40 });
      noise(0.4, 0.2, 4000);
    },
    tspin: () => [392, 523, 698, 932].forEach((f, i) => tone(f, 0.16, { type: 'sawtooth', vol: 0.05, delay: i * 0.05 })),
    level:  () => [440, 554, 659, 880].forEach((f, i) => tone(f, 0.2, { type: 'triangle', vol: 0.1, delay: i * 0.08 })),
    over:   () => [392, 330, 262, 196, 131].forEach((f, i) => tone(f, 0.3, { type: 'square', vol: 0.07, delay: i * 0.15 })),
    start:  () => [262, 330, 392, 523].forEach((f, i) => tone(f, 0.12, { type: 'square', vol: 0.06, delay: i * 0.07 })),
  };

  // --- Musik ---
  const NOTE = n => {
    const m = /^([A-G])(#?)(\d)$/.exec(n);
    const s = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] ? 1 : 0);
    return 440 * Math.pow(2, ((+m[3] + 1) * 12 + s - 69) / 12);
  };
  const MELODY = [
    ['E5',1],['B4',.5],['C5',.5],['D5',1],['C5',.5],['B4',.5],
    ['A4',1],['A4',.5],['C5',.5],['E5',1],['D5',.5],['C5',.5],
    ['B4',1.5],['C5',.5],['D5',1],['E5',1],
    ['C5',1],['A4',1],['A4',1],[null,1],
    [null,.5],['D5',1],['F5',.5],['A5',1],['G5',.5],['F5',.5],
    ['E5',1.5],['C5',.5],['E5',1],['D5',.5],['C5',.5],
    ['B4',1],['B4',.5],['C5',.5],['D5',1],['E5',1],
    ['C5',1],['A4',1],['A4',1],[null,1],
  ];
  const BASS = ['E2', 'A2', 'E2', 'A2', 'D2', 'C2', 'E2', 'A2'];
  const LOOP = 32;
  const EVENTS = [];
  { let b = 0; for (const [n, d] of MELODY) { if (n) EVENTS.push({ beat: b, note: n, dur: d, v: 'm' }); b += d; } }
  BASS.forEach((root, m) => {
    const up = root.replace(/\d/, d => +d + 1);
    for (let i = 0; i < 8; i++) EVENTS.push({ beat: m * 4 + i * 0.5, note: i % 2 ? up : root, dur: 0.5, v: 'b' });
  });
  EVENTS.sort((a, b) => a.beat - b.beat);

  let playing = false, timer = null, idx = 0, nextTime = 0, bpm = 140;
  function schedule() {
    if (!ctx || !playing) return;
    const bd = 60 / bpm;
    while (nextTime < ctx.currentTime + 0.2) {
      const ev = EVENTS[idx];
      tone(NOTE(ev.note), ev.dur * bd * 0.85, {
        type: ev.v === 'm' ? 'square' : 'triangle',
        vol: ev.v === 'm' ? 0.1 : 0.16, at: nextTime, dest: musicBus,
      });
      const ni = (idx + 1) % EVENTS.length;
      let gap = EVENTS[ni].beat - ev.beat;
      if (ni === 0) gap += LOOP;
      nextTime += gap * bd;
      idx = ni;
    }
  }
  function startMusic() {
    if (!ctx) return;
    stopMusic();
    playing = true; idx = 0; nextTime = ctx.currentTime + 0.1;
    timer = setInterval(schedule, 40);
    schedule();
  }
  function stopMusic() { playing = false; clearInterval(timer); timer = null; }
  function setLevel(lv) { bpm = Math.min(220, 132 + (lv - 1) * 6); }

  function toggleMute() {
    muted = !muted; store.set('t3d_muted', muted);
    if (master) master.gain.value = muted ? 0 : 0.8;
    return muted;
  }
  function toggleMusic() {
    musicOn = !musicOn; store.set('t3d_music', musicOn);
    if (musicBus) musicBus.gain.value = musicOn ? 0.3 : 0;
    return musicOn;
  }

  return {
    init, sfx, startMusic, stopMusic, setLevel, toggleMute, toggleMusic,
    get muted() { return muted; }, get musicOn() { return musicOn; },
  };
})();

// =====================================================================
//  Three.js: scene, kamera, material
// =====================================================================
const isTouch = ('ontouchstart' in window) || matchMedia('(pointer: coarse)').matches;
if (isTouch) { document.body.classList.add('touch'); $('touch').hidden = false; }

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(0x000000, 0);
$('scene').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 1000);

scene.add(new THREE.AmbientLight(0x8a86c0, 0.55));
const keyLight = new THREE.DirectionalLight(0xffffff, 0.85);
keyLight.position.set(6, 12, 16);
scene.add(keyLight);
const pinkLight = new THREE.PointLight(0xff4fa3, 1.1, 60);
pinkLight.position.set(-12, 8, 10);
scene.add(pinkLight);
const cyanLight = new THREE.PointLight(0x28e8ff, 1.0, 60);
cyanLight.position.set(12, -8, 10);
scene.add(cyanLight);

function makeBlockTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 128, 128);
  grd.addColorStop(0, '#ffffff'); grd.addColorStop(1, '#a4a4a4');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(255,255,255,0.6)';
  g.beginPath(); g.moveTo(0, 0); g.lineTo(128, 0); g.lineTo(110, 18); g.lineTo(18, 18); g.lineTo(18, 110); g.lineTo(0, 128); g.closePath(); g.fill();
  g.fillStyle = 'rgba(0,0,0,0.38)';
  g.beginPath(); g.moveTo(128, 128); g.lineTo(0, 128); g.lineTo(18, 110); g.lineTo(110, 110); g.lineTo(110, 18); g.lineTo(128, 0); g.closePath(); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fillRect(26, 26, 34, 10);
  g.fillRect(26, 26, 10, 26);
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  return t;
}

function makeGlowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.8)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

const blockTex = makeBlockTexture();
const glowTex = makeGlowTexture();
const blockGeo = new THREE.BoxGeometry(0.94, 0.94, 0.94);
const edgeGeo = new THREE.EdgesGeometry(blockGeo);

const mats = {};
const ghostMats = {};
for (const t of [...TYPES, 'X']) {
  mats[t] = new THREE.MeshStandardMaterial({
    map: blockTex, color: COLORS[t], emissive: COLORS[t],
    emissiveIntensity: t === 'X' ? 0.05 : 0.22, roughness: 0.35, metalness: 0.25,
  });
  ghostMats[t] = {
    fill: new THREE.MeshBasicMaterial({ color: COLORS[t], transparent: true, opacity: 0.12, depthWrite: false }),
    line: new THREE.LineBasicMaterial({ color: COLORS[t], transparent: true, opacity: 0.75 }),
  };
}
const flashMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1 });

const wx = x => x - COLS / 2 + 0.5;
const wy = y => (TOTAL - 1 - y) - ROWS / 2 + 0.5;

// ---------- Papan / frame ----------
const boardGroup = new THREE.Group();
scene.add(boardGroup);

const frameMat = new THREE.MeshStandardMaterial({
  color: 0x7c5cff, emissive: 0x7c5cff, emissiveIntensity: 0.9, metalness: 0.5, roughness: 0.3,
});
{
  const h = ROWS + 0.35;
  const left = new THREE.Mesh(new THREE.BoxGeometry(0.3, h, 1.2), frameMat);
  left.position.set(-COLS / 2 - 0.17, -0.17, 0);
  const right = left.clone(); right.position.x = COLS / 2 + 0.17;
  const bottom = new THREE.Mesh(new THREE.BoxGeometry(COLS + 0.64, 0.3, 1.2), frameMat);
  bottom.position.set(0, -ROWS / 2 - 0.17, 0);
  boardGroup.add(left, right, bottom);

  const back = new THREE.Mesh(
    new THREE.PlaneGeometry(COLS, ROWS),
    new THREE.MeshStandardMaterial({ color: 0x0d0a24, transparent: true, opacity: 0.82, roughness: 0.9 })
  );
  back.position.z = -0.5;
  boardGroup.add(back);

  const pts = [];
  for (let x = 1; x < COLS; x++) pts.push(x - COLS / 2, -ROWS / 2, -0.49, x - COLS / 2, ROWS / 2, -0.49);
  for (let y = 1; y < ROWS; y++) pts.push(-COLS / 2, y - ROWS / 2, -0.49, COLS / 2, y - ROWS / 2, -0.49);
  const gg = new THREE.BufferGeometry();
  gg.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  boardGroup.add(new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: 0x2c2560, transparent: true, opacity: 0.8 })));

  // garis batas atas (danger line)
  const dl = new THREE.Mesh(
    new THREE.PlaneGeometry(COLS, 0.05),
    new THREE.MeshBasicMaterial({ color: 0xff4060, transparent: true, opacity: 0.35 })
  );
  dl.position.set(0, ROWS / 2, -0.45);
  boardGroup.add(dl);
}

// Mesh untuk setiap sel papan (dipakai ulang)
const cellMeshes = [];
for (let y = 0; y < TOTAL; y++) {
  cellMeshes.push([]);
  for (let x = 0; x < COLS; x++) {
    const m = new THREE.Mesh(blockGeo, mats.I);
    m.visible = false;
    boardGroup.add(m);
    cellMeshes[y].push(m);
  }
}

const pieceMeshes = [], ghostMeshes = [];
for (let i = 0; i < 4; i++) {
  const m = new THREE.Mesh(blockGeo, mats.I);
  m.visible = false;
  boardGroup.add(m);
  pieceMeshes.push(m);
  const g = new THREE.Mesh(blockGeo, ghostMats.I.fill);
  g.add(new THREE.LineSegments(edgeGeo, ghostMats.I.line));
  g.visible = false;
  boardGroup.add(g);
  ghostMeshes.push(g);
}
const pieceLight = new THREE.PointLight(0xffffff, 0.9, 7);
boardGroup.add(pieceLight);

// ---------- Partikel ----------
const PMAX = 3000;
const pPos = new Float32Array(PMAX * 3), pCol = new Float32Array(PMAX * 3);
const pVel = new Float32Array(PMAX * 3), pBase = new Float32Array(PMAX * 3);
const pLife = new Float32Array(PMAX), pMaxLife = new Float32Array(PMAX);
let pNext = 0;
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
const particles = new THREE.Points(pGeo, new THREE.PointsMaterial({
  size: 0.38, map: glowTex, vertexColors: true, transparent: true,
  blending: THREE.AdditiveBlending, depthWrite: false,
}));
particles.frustumCulled = false;
boardGroup.add(particles);

function emit(x, y, z, color, count, speed = 6, life = 0.9) {
  const c = new THREE.Color(color);
  for (let n = 0; n < count; n++) {
    const i = pNext; pNext = (pNext + 1) % PMAX;
    pPos[i * 3] = x + (Math.random() - 0.5) * 0.8;
    pPos[i * 3 + 1] = y + (Math.random() - 0.5) * 0.8;
    pPos[i * 3 + 2] = z + (Math.random() - 0.5) * 0.8;
    const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 2 - 1);
    const s = speed * (0.3 + Math.random() * 0.7);
    pVel[i * 3] = Math.sin(ph) * Math.cos(th) * s;
    pVel[i * 3 + 1] = Math.sin(ph) * Math.sin(th) * s + speed * 0.3;
    pVel[i * 3 + 2] = Math.abs(Math.cos(ph)) * s;
    const l = life * (0.6 + Math.random() * 0.6);
    pLife[i] = pMaxLife[i] = l;
    const w = Math.random() * 0.4;
    pBase[i * 3] = c.r + (1 - c.r) * w;
    pBase[i * 3 + 1] = c.g + (1 - c.g) * w;
    pBase[i * 3 + 2] = c.b + (1 - c.b) * w;
  }
}

function updateParticles(dt) {
  for (let i = 0; i < PMAX; i++) {
    if (pLife[i] <= 0) continue;
    pLife[i] -= dt;
    const k = i * 3;
    if (pLife[i] <= 0) { pCol[k] = pCol[k + 1] = pCol[k + 2] = 0; continue; }
    pVel[k + 1] -= 9 * dt;
    const drag = Math.exp(-dt * 1.5);
    pVel[k] *= drag; pVel[k + 1] *= drag; pVel[k + 2] *= drag;
    pPos[k] += pVel[k] * dt; pPos[k + 1] += pVel[k + 1] * dt; pPos[k + 2] += pVel[k + 2] * dt;
    const f = pLife[i] / pMaxLife[i];
    pCol[k] = pBase[k] * f; pCol[k + 1] = pBase[k + 1] * f; pCol[k + 2] = pBase[k + 2] * f;
  }
  pGeo.attributes.position.needsUpdate = true;
  pGeo.attributes.color.needsUpdate = true;
}

// ---------- Efek sementara (debris, flash, trail) ----------
const fx = [];
function addFx(obj, life, update) {
  boardGroup.add(obj);
  fx.push({ obj, life, max: life, update });
}
function updateFx(dt) {
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i];
    f.life -= dt;
    if (f.life <= 0) {
      boardGroup.remove(f.obj);
      if (f.obj.material && f.obj.material.userData.temp) { f.obj.material.dispose(); f.obj.geometry.dispose(); }
      fx.splice(i, 1);
      continue;
    }
    f.update(f.obj, f.life / f.max, dt);
  }
}

function spawnDebris(x, y, type) {
  const m = new THREE.Mesh(blockGeo, mats[type]);
  m.position.set(x, y, 0);
  const v = new THREE.Vector3((x / COLS) * 10 + (Math.random() - 0.5) * 6, 4 + Math.random() * 7, 5 + Math.random() * 9);
  const r = new THREE.Vector3(Math.random() * 12 - 6, Math.random() * 12 - 6, Math.random() * 12 - 6);
  addFx(m, 1.1 + Math.random() * 0.4, (o, f, dt) => {
    v.y -= 22 * dt;
    o.position.addScaledVector(v, dt);
    o.rotation.x += r.x * dt; o.rotation.y += r.y * dt; o.rotation.z += r.z * dt;
    o.scale.setScalar(Math.max(0.01, f));
  });
}

function spawnRowFlash(y, color = 0xffffff) {
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
  mat.userData.temp = true;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(COLS, 1), mat);
  m.position.set(0, y, 0.55);
  addFx(m, 0.45, (o, f) => {
    o.material.opacity = f;
    o.scale.set(1 + (1 - f) * 0.3, 1 + (1 - f) * 1.8, 1);
  });
}

function spawnTrail(x, yTop, yBottom, color) {
  const h = yTop - yBottom;
  if (h <= 0.1) return;
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
  mat.userData.temp = true;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.8, h), mat);
  m.position.set(x, yBottom + h / 2, 0.1);
  addFx(m, 0.3, (o, f) => {
    o.material.opacity = 0.55 * f;
    o.scale.x = f;
  });
}

// ---------- Latar belakang: bintang + tetromino wireframe melayang ----------
const bgGroup = new THREE.Group();
scene.add(bgGroup);
{
  const N = 1400, pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
  const palette = [0xffffff, 0x9ff3ff, 0xd2b8ff, 0xffb3d9].map(c => new THREE.Color(c));
  for (let i = 0; i < N; i++) {
    const r = 70 + Math.random() * 150;
    const th = Math.random() * Math.PI * 2, ph = Math.acos(Math.random() * 2 - 1);
    pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th);
    pos[i * 3 + 2] = -Math.abs(r * Math.cos(ph)) - 10;
    const c = palette[i % palette.length], b = 0.4 + Math.random() * 0.6;
    col[i * 3] = c.r * b; col[i * 3 + 1] = c.g * b; col[i * 3 + 2] = c.b * b;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  bgGroup.add(new THREE.Points(g, new THREE.PointsMaterial({
    size: 1.1, map: glowTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  })));
}
const floaters = [];
for (let i = 0; i < 9; i++) {
  const t = TYPES[i % TYPES.length];
  const grp = new THREE.Group();
  const lm = new THREE.LineBasicMaterial({ color: COLORS[t], transparent: true, opacity: 0.35 });
  for (const [cx, cy] of ROT[t][0]) {
    const l = new THREE.LineSegments(edgeGeo, lm);
    l.position.set(cx - 1.5, -cy + 1, 0);
    grp.add(l);
  }
  const side = i % 2 ? 1 : -1;
  grp.position.set(side * (16 + Math.random() * 22), (Math.random() - 0.5) * 40, -18 - Math.random() * 40);
  grp.scale.setScalar(1.2 + Math.random() * 1.5);
  grp.userData = {
    rs: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.6),
    vy: 0.4 + Math.random() * 0.8,
  };
  bgGroup.add(grp);
  floaters.push(grp);
}

// =====================================================================
//  State permainan
// =====================================================================
let grid, rowOffset, flash;
let cur = null, bag = [], queue = [], hold = null, holdUsed = false;
let score = 0, lines = 0, level = 1, startLevel = 1, combo = -1, b2b = false;
let tetrisCount = 0, playTime = 0;
let best = store.get('t3d_best', 0);
let state = 'menu';            // menu | play | pause | over
let gravityTimer = 0, lockTimer = 0, lockResets = 0, lowestY = 0;
let lastRotate = false, lastKick = 0;
let softDrop = false, dasDir = 0, dasTimer = 0, arrTimer = 0;
const held = { left: false, right: false };
let showGhost = store.get('t3d_ghost', true);
let vibeOn = store.get('t3d_vibe', true);
const haptic = p => { if (vibeOn && isTouch && navigator.vibrate) { try { navigator.vibrate(p); } catch (e) {} } };
let displayScore = 0;
let deadRow = -1, deadTimer = 0;

// Efek visual
const vis = { x: 0, y: 0 };
let rotPop = 0, shake = 0, lean = 0, leanV = 0, bounce = 0, bounceV = 0, framePulse = 0;
let camMode = store.get('t3d_cam', 0);
const mouse = { x: 0, y: 0 };

const emptyRow = () => Array(COLS).fill(null);

function refillBag() {
  const b = TYPES.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  bag.push(...b);
}
function nextType() {
  while (queue.length < 6) { if (!bag.length) refillBag(); queue.push(bag.shift()); }
  const t = queue.shift();
  if (!bag.length) refillBag();
  queue.push(bag.shift());
  return t;
}

function collides(type, rot, px, py) {
  for (const [cx, cy] of ROT[type][rot]) {
    const x = px + cx, y = py + cy;
    if (x < 0 || x >= COLS || y >= TOTAL) return true;
    if (y >= 0 && grid[y][x]) return true;
  }
  return false;
}

function ghostY() {
  let y = cur.y;
  while (!collides(cur.type, cur.rot, cur.x, y + 1)) y++;
  return y;
}

const gravityMs = () => Math.pow(Math.max(0.05, 0.8 - (Math.min(level, 20) - 1) * 0.007), Math.min(level, 20) - 1) * 1000;

function spawn(type) {
  type = type || nextType();
  cur = { type, rot: 0, x: type === 'O' ? 4 : 3, y: 1 };
  if (collides(cur.type, 0, cur.x, cur.y)) {
    cur.y = 0;
    if (collides(cur.type, 0, cur.x, cur.y)) { gameOver(); return; }
  }
  vis.x = cur.x; vis.y = cur.y - 1.2;
  gravityTimer = 0; lockTimer = 0; lockResets = 0; lowestY = cur.y;
  lastRotate = false; lastKick = 0;
  drawPreviews();
}

function onManipulate() {
  if (lockTimer > 0 && lockResets < MAX_RESETS) { lockTimer = 0; lockResets++; }
}

function tryMove(dx, dy) {
  if (collides(cur.type, cur.rot, cur.x + dx, cur.y + dy)) return false;
  cur.x += dx; cur.y += dy;
  lastRotate = false;
  if (cur.y > lowestY) { lowestY = cur.y; lockResets = 0; lockTimer = 0; }
  else if (dx) onManipulate();
  return true;
}

function tryRotate(dir) {
  if (cur.type === 'O') { rotPop = 1; Sound.sfx.rotate(); return true; }
  const from = cur.rot, to = (from + dir + 4) % 4;
  const kicks = (cur.type === 'I' ? KICK_I : KICK_JLSTZ)['' + from + to];
  for (let i = 0; i < kicks.length; i++) {
    const nx = cur.x + kicks[i][0], ny = cur.y - kicks[i][1];
    if (!collides(cur.type, to, nx, ny)) {
      cur.x = nx; cur.y = ny; cur.rot = to;
      lastRotate = true; lastKick = i;
      if (cur.y > lowestY) { lowestY = cur.y; lockResets = 0; lockTimer = 0; }
      else onManipulate();
      rotPop = 1;
      Sound.sfx.rotate();
      return true;
    }
  }
  return false;
}

function hardDrop() {
  const gy = ghostY();
  const dist = gy - cur.y;
  // trail per kolom
  const tops = {};
  for (const [cx, cy] of ROT[cur.type][cur.rot]) {
    const x = cur.x + cx;
    if (tops[x] === undefined || cy < tops[x]) tops[x] = cy;
  }
  for (const x in tops) spawnTrail(wx(+x), wy(cur.y + tops[x]) + 0.5, wy(gy + tops[x]) + 0.5, COLORS[cur.type]);
  score += dist * 2;
  cur.y = gy;
  vis.y = gy; vis.x = cur.x;
  if (dist > 0) lastRotate = false;
  shake = Math.max(shake, 0.25);
  bounceV -= 4;
  for (const [cx, cy] of ROT[cur.type][cur.rot]) {
    if (collides(cur.type, cur.rot, cur.x, cur.y + 1)) emit(wx(cur.x + cx), wy(cur.y + cy) - 0.5, 0.3, COLORS[cur.type], 5, 3, 0.5);
  }
  Sound.sfx.hard();
  haptic(15);
  lock(true);
}

function doHold() {
  if (holdUsed || !cur) return;
  const t = cur.type;
  if (hold) { const h = hold; hold = t; spawn(h); }
  else { hold = t; spawn(); }
  holdUsed = true;
  Sound.sfx.hold();
  drawPreviews();
}

function detectTSpin() {
  if (cur.type !== 'T' || !lastRotate) return null;
  const occ = (x, y) => x < 0 || x >= COLS || y >= TOTAL || (y >= 0 && !!grid[y][x]);
  const { x, y, rot } = cur;
  const c = { tl: occ(x, y), tr: occ(x + 2, y), bl: occ(x, y + 2), br: occ(x + 2, y + 2) };
  const count = c.tl + c.tr + c.bl + c.br;
  if (count < 3) return null;
  const front = [['tl', 'tr'], ['tr', 'br'], ['bl', 'br'], ['tl', 'bl']][rot];
  if ((c[front[0]] && c[front[1]]) || lastKick === 4) return 'full';
  return 'mini';
}

function lock(fromHardDrop) {
  const cells = ROT[cur.type][cur.rot].map(([cx, cy]) => [cur.x + cx, cur.y + cy]);
  const tspin = detectTSpin();
  let allAbove = true;
  for (const [x, y] of cells) {
    grid[y][x] = cur.type;
    flash[y * COLS + x] = 0.09;
    if (y >= HIDDEN) allAbove = false;
  }
  if (!fromHardDrop) Sound.sfx.lock();

  const full = [];
  for (let y = 0; y < TOTAL; y++) if (grid[y].every(v => v)) full.push(y);
  const n = full.length;

  // ---- Skor ----
  let base = 0, label = '', difficult = false;
  if (tspin === 'full') {
    base = [400, 800, 1200, 1600][n];
    label = 'T-SPIN' + ['', ' SINGLE', ' DOUBLE', ' TRIPLE'][n];
    difficult = n > 0;
  } else if (tspin === 'mini') {
    base = [100, 200, 400, 400][n];
    label = 'MINI T-SPIN' + ['', ' SINGLE', ' DOUBLE', ''][n];
    difficult = n > 0;
  } else {
    base = [0, 100, 300, 500, 800][n];
    label = ['', 'SINGLE', 'DOUBLE', 'TRIPLE', 'TETRIS!'][n];
    difficult = n === 4;
  }
  let pts = base * level;
  let b2bBonus = false;
  if (n > 0) {
    if (difficult) {
      if (b2b) { pts = Math.floor(pts * 1.5); b2bBonus = true; }
      b2b = true;
    } else b2b = false;
    combo++;
    if (combo > 0) pts += 50 * combo * level;
  } else {
    combo = -1;
  }

  if (n > 0) {
    // efek clear: debris, partikel, flash
    for (const y of full) {
      const yy = wy(y);
      for (let x = 0; x < COLS; x++) {
        const t = grid[y][x];
        spawnDebris(wx(x), yy, t);
        emit(wx(x), yy, 0.3, COLORS[t], n === 4 ? 14 : 8, n === 4 ? 10 : 7, 1.0);
      }
      spawnRowFlash(yy, n === 4 ? 0xffe9a8 : 0xffffff);
    }
    // hapus baris & hitung offset jatuh (animasi)
    const newGrid = [], newOff = [];
    for (let i = 0; i < n; i++) { newGrid.push(emptyRow()); newOff.push(0); }
    for (let y = 0; y < TOTAL; y++) {
      if (full.includes(y)) continue;
      const below = full.filter(f => f > y).length;
      newGrid.push(grid[y]);
      newOff.push(rowOffset[y] + below);
    }
    grid = newGrid; rowOffset = newOff;
    flash.fill(0);

    const prevLevel = level;
    lines += n;
    level = Math.max(startLevel, Math.floor(lines / 10) + 1);
    if (n === 4) tetrisCount++;

    shake = Math.max(shake, n === 4 ? 0.7 : 0.12 + 0.08 * n);
    framePulse = n === 4 ? 1.5 : 0.6;

    haptic(n === 4 ? [40, 50, 60] : 20 + n * 8);
    if (n === 4) { Sound.sfx.tetris(); popup('TETRIS!', 'tetris'); }
    else if (tspin) { Sound.sfx.tspin(); popup(label, 'tspin'); }
    else { Sound.sfx.clear(n); popup(label); }
    if (b2bBonus) popup('BACK-TO-BACK ×1.5', 'small');
    if (combo > 0) popup('COMBO ×' + combo, 'small');

    if (grid.every(r => r.every(v => !v))) {
      pts += [0, 800, 1200, 1800, 2000][n] * level;
      popup('PERFECT CLEAR!', 'perfect');
      for (let i = 0; i < 6; i++) emit((Math.random() - 0.5) * COLS, (Math.random() - 0.5) * ROWS, 0, COLORS[TYPES[i]], 40, 12, 1.4);
    }
    if (level > prevLevel) {
      popup('LEVEL ' + level, 'level');
      Sound.sfx.level();
      Sound.setLevel(level);
      framePulse = 2;
    }
  } else if (tspin) {
    Sound.sfx.tspin();
    popup(label, 'tspin');
  }

  if (pts > 0) popup('+' + pts.toLocaleString('id-ID'), 'points');
  score += pts;
  updateHud();

  if (allAbove) { gameOver(); return; }
  holdUsed = false;
  spawn();
}

function newGame() {
  Sound.init();
  grid = Array.from({ length: TOTAL }, emptyRow);
  rowOffset = Array(TOTAL).fill(0);
  flash = new Float32Array(TOTAL * COLS);
  bag = []; queue = []; hold = null; holdUsed = false;
  score = 0; displayScore = 0; lines = 0; level = startLevel; combo = -1; b2b = false;
  tetrisCount = 0; playTime = 0; deadRow = -1;
  softDrop = false; dasDir = 0; held.left = held.right = false;
  for (const f of fx.splice(0)) boardGroup.remove(f.obj);
  state = 'play';
  spawn();
  updateHud();
  showOverlay(null);
  Sound.setLevel(level);
  Sound.sfx.start();
  Sound.startMusic();
}

function gameOver() {
  state = 'over';
  cur = null;
  Sound.stopMusic();
  Sound.sfx.over();
  haptic([80, 60, 120]);
  shake = 0.6;
  deadRow = TOTAL - 1; deadTimer = 0;
  const isBest = score > best;
  if (isBest) { best = score; store.set('t3d_best', best); }
  updateHud();
  $('finalScore').textContent = score.toLocaleString('id-ID');
  $('finalLevel').textContent = level;
  $('finalLines').textContent = lines;
  $('finalTetris').textContent = tetrisCount;
  $('finalTime').textContent = fmtTime(playTime);
  $('newBest').hidden = !isBest;
  setTimeout(() => { if (state === 'over') showOverlay('overCard'); }, 1300);
}

function setPaused(p) {
  if (p && state === 'play') {
    state = 'pause';
    Sound.stopMusic();
    showOverlay('pauseCard');
  } else if (!p && state === 'pause') {
    state = 'play';
    showOverlay(null);
    Sound.init();
    Sound.startMusic();
  }
}

function goMenu() {
  state = 'menu';
  cur = null;
  Sound.stopMusic();
  $('menuBest').textContent = best.toLocaleString('id-ID');
  showOverlay('menuCard');
}

// =====================================================================
//  Update logika per frame
// =====================================================================
function update(dt) {
  playTime += dt;

  if (dasDir) {
    dasTimer += dt;
    if (dasTimer >= DAS) {
      arrTimer += dt;
      while (arrTimer >= ARR) {
        arrTimer -= ARR;
        if (!tryMove(dasDir, 0)) { arrTimer = 0; break; }
      }
    }
  }

  const g = gravityMs();
  const iv = softDrop ? Math.min(g, SOFT_MS) : g;
  gravityTimer += dt;
  while (gravityTimer >= iv) {
    gravityTimer -= iv;
    if (tryMove(0, 1)) { if (softDrop) score += 1; }
    else { gravityTimer = 0; break; }
  }

  if (collides(cur.type, cur.rot, cur.x, cur.y + 1)) {
    lockTimer += dt;
    if (lockTimer >= LOCK_DELAY) lock(false);
  } else {
    lockTimer = 0;
  }
}

// =====================================================================
//  Input
// =====================================================================
function press(act) {
  if (act === 'pause') { if (state === 'play') setPaused(true); else if (state === 'pause') setPaused(false); return; }
  if (state !== 'play' || !cur) return;
  switch (act) {
    case 'left':
    case 'right': {
      const d = act === 'left' ? -1 : 1;
      held[act] = true;
      dasDir = d; dasTimer = 0; arrTimer = 0;
      if (tryMove(d, 0)) { Sound.sfx.move(); leanV += d * 0.6; }
      break;
    }
    case 'down': softDrop = true; gravityTimer = SOFT_MS; break;
    case 'cw': tryRotate(1); break;
    case 'ccw': tryRotate(-1); break;
    case 'hard': hardDrop(); break;
    case 'hold': doHold(); break;
  }
}
function release(act) {
  if (act === 'left' || act === 'right') {
    held[act] = false;
    const d = act === 'left' ? -1 : 1;
    if (dasDir === d) {
      const other = act === 'left' ? 'right' : 'left';
      dasDir = held[other] ? -d : 0;
      dasTimer = 0; arrTimer = 0;
    }
  } else if (act === 'down') softDrop = false;
}

const KEYMAP = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowDown: 'down',
  ArrowUp: 'cw', KeyX: 'cw', KeyZ: 'ccw', ControlLeft: 'ccw', ControlRight: 'ccw',
  Space: 'hard', KeyC: 'hold', ShiftLeft: 'hold', ShiftRight: 'hold',
  KeyP: 'pause', Escape: 'pause',
};

window.addEventListener('keydown', e => {
  const act = KEYMAP[e.code];
  if (act || e.code === 'Enter') e.preventDefault();
  Sound.init();
  if (e.code === 'Enter' && !e.repeat) {
    if (state === 'menu' || state === 'over') newGame();
    else if (state === 'pause') setPaused(false);
    return;
  }
  if (e.repeat) return;
  if (e.code === 'KeyM') { toggleSound(); return; }
  if (e.code === 'KeyN') { toggleMusic(); return; }
  if (e.code === 'KeyV') { cycleCam(); return; }
  if (e.code === 'KeyG') { toggleGhost(); return; }
  if (act) press(act);
});
window.addEventListener('keyup', e => {
  const act = KEYMAP[e.code];
  if (act) release(act);
});
const autoPause = () => { held.left = held.right = false; dasDir = 0; softDrop = false; setPaused(true); };
window.addEventListener('blur', autoPause);
document.addEventListener('visibilitychange', () => { if (document.hidden) autoPause(); });
window.addEventListener('mousemove', e => {
  mouse.x = (e.clientX / innerWidth) * 2 - 1;
  mouse.y = (e.clientY / innerHeight) * 2 - 1;
});

// Tombol sentuh
document.querySelectorAll('#touch button').forEach(btn => {
  const act = btn.dataset.act;
  btn.addEventListener('pointerdown', e => {
    e.preventDefault();
    Sound.init();
    btn.classList.add('pressed');
    try { btn.setPointerCapture(e.pointerId); } catch (_) {}
    haptic(6);
    press(act);
  });
  const up = () => { btn.classList.remove('pressed'); release(act); };
  btn.addEventListener('pointerup', up);
  btn.addEventListener('pointercancel', up);
});

// Gestur sentuh di area papan: geser = gerak, tap = putar,
// tarik ke bawah = soft drop, swipe cepat ke bawah = hard drop, swipe ke atas = hold
const gesture = { id: null };
const cvs = renderer.domElement;
cvs.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse' || state !== 'play' || !cur || gesture.id !== null) return;
  Sound.init();
  Object.assign(gesture, {
    id: e.pointerId, x0: e.clientX, y0: e.clientY, ax: e.clientX, ay: e.clientY,
    t0: performance.now(), moved: false, done: false, axis: null,
  });
  try { cvs.setPointerCapture(e.pointerId); } catch (_) {}
});
cvs.addEventListener('pointermove', e => {
  if (e.pointerId !== gesture.id || gesture.done || state !== 'play' || !cur) return;
  const step = Math.max(16, unitPx * 0.85);
  const dx = e.clientX - gesture.x0, dy = e.clientY - gesture.y0;
  const elapsed = Math.max(1, performance.now() - gesture.t0);
  if (!gesture.axis && Math.hypot(dx, dy) > 12) gesture.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';

  if (gesture.axis === 'y') {
    if (dy > step * 2 && dy / elapsed > 0.9) { hardDrop(); gesture.done = true; return; }
    if (-dy > step * 1.5 && -dy / elapsed > 0.5) { doHold(); haptic(10); gesture.done = true; return; }
    while (e.clientY - gesture.ay >= step) {
      gesture.ay += step; gesture.moved = true;
      if (tryMove(0, 1)) { score += 1; gravityTimer = 0; }
    }
    if (e.clientY < gesture.ay) gesture.ay = e.clientY;
  } else if (gesture.axis === 'x') {
    while (Math.abs(e.clientX - gesture.ax) >= step) {
      const d = e.clientX > gesture.ax ? 1 : -1;
      gesture.ax += d * step; gesture.moved = true;
      if (tryMove(d, 0)) { Sound.sfx.move(); leanV += d * 0.6; haptic(4); }
    }
  }
});
const endGesture = e => {
  if (e.pointerId !== gesture.id) return;
  const quick = performance.now() - gesture.t0 < 280;
  const dist = Math.hypot(e.clientX - gesture.x0, e.clientY - gesture.y0);
  if (e.type === 'pointerup' && !gesture.moved && !gesture.done && quick && dist < 14 && state === 'play' && cur) {
    tryRotate(1);
    haptic(6);
  }
  gesture.id = null;
};
cvs.addEventListener('pointerup', endGesture);
cvs.addEventListener('pointercancel', endGesture);

function toggleSound() { Sound.toggleMute(); refreshSettings(); }
function toggleMusic() { Sound.toggleMusic(); refreshSettings(); }
function cycleCam() { camMode = (camMode + 1) % 3; store.set('t3d_cam', camMode); refreshSettings(); }
function toggleGhost() { showGhost = !showGhost; store.set('t3d_ghost', showGhost); refreshSettings(); }
function toggleVibe() { vibeOn = !vibeOn; store.set('t3d_vibe', vibeOn); refreshSettings(); haptic(20); }

function refreshSettings() {
  $('btnSound').classList.toggle('off', Sound.muted);
  $('btnMusic').classList.toggle('off', !Sound.musicOn);
  $('setSound').classList.toggle('off', Sound.muted);
  $('setMusic').classList.toggle('off', !Sound.musicOn);
  $('setVibe').classList.toggle('off', !vibeOn);
  $('setGhost').classList.toggle('off', !showGhost);
  $('camLabel').textContent = camMode + 1;
}
refreshSettings();
if (!isTouch || !navigator.vibrate) $('setVibe').hidden = true;

$('btnSound').onclick = e => { e.currentTarget.blur(); Sound.init(); toggleSound(); };
$('btnMusic').onclick = e => { e.currentTarget.blur(); Sound.init(); toggleMusic(); };
$('btnCam').onclick = e => { e.currentTarget.blur(); cycleCam(); };
$('setSound').onclick = () => { Sound.init(); toggleSound(); };
$('setMusic').onclick = () => { Sound.init(); toggleMusic(); };
$('setVibe').onclick = toggleVibe;
$('setGhost').onclick = toggleGhost;
$('setCam').onclick = cycleCam;
$('btnPause').onclick = e => { e.currentTarget.blur(); press('pause'); };
$('playBtn').onclick = newGame;
$('againBtn').onclick = newGame;
$('resumeBtn').onclick = () => setPaused(false);
$('restartBtn').onclick = newGame;
$('menuBtn').onclick = goMenu;
$('overMenuBtn').onclick = goMenu;
$('startLevel').value = store.get('t3d_startLevel', 1);
startLevel = +$('startLevel').value;
$('startLevelVal').textContent = startLevel;
$('startLevel').oninput = e => {
  startLevel = +e.target.value;
  $('startLevelVal').textContent = startLevel;
  store.set('t3d_startLevel', startLevel);
};

// =====================================================================
//  HUD
// =====================================================================
const fmtTime = ms => {
  const s = Math.floor(ms / 1000);
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
};

function updateHud() {
  $('best').textContent = Math.max(best, score).toLocaleString('id-ID');
  $('level').textContent = level;
  $('lines').textContent = lines;
  $('levelbar').style.width = ((lines % 10) * 10) + '%';
  const c = $('combo');
  c.textContent = combo > 0 ? 'COMBO ×' + combo : '';
  c.classList.toggle('on', combo > 0);
  $('b2b').classList.toggle('on', b2b);
}

function popup(text, cls = '') {
  const d = document.createElement('div');
  d.className = 'popup ' + cls;
  d.textContent = text;
  $('popups').appendChild(d);
  setTimeout(() => d.remove(), 1400);
}

function showOverlay(id) {
  for (const c of ['menuCard', 'pauseCard', 'overCard']) $(c).hidden = c !== id;
  $('overlay').classList.toggle('hidden', !id);
}

function drawBlock2D(g, px, py, s, color, alpha = 1) {
  const c = hex(color);
  g.globalAlpha = alpha;
  g.fillStyle = c;
  g.fillRect(px, py, s, s);
  const b = s * 0.16;
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.beginPath(); g.moveTo(px, py); g.lineTo(px + s, py); g.lineTo(px + s - b, py + b); g.lineTo(px + b, py + b); g.lineTo(px + b, py + s - b); g.lineTo(px, py + s); g.fill();
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath(); g.moveTo(px + s, py + s); g.lineTo(px, py + s); g.lineTo(px + b, py + s - b); g.lineTo(px + s - b, py + s - b); g.lineTo(px + s - b, py + b); g.lineTo(px + s, py); g.fill();
  g.globalAlpha = 1;
}

function drawMini(cv, type, dim) {
  const g = cv.getContext('2d');
  g.clearRect(0, 0, cv.width, cv.height);
  if (!type) return;
  const cells = ROT[type][0];
  const xs = cells.map(c => c[0]), ys = cells.map(c => c[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const s = Math.min(cv.width / 5, cv.height / 3);
  const ox = (cv.width - (maxX - minX + 1) * s) / 2 - minX * s;
  const oy = (cv.height - (maxY - minY + 1) * s) / 2 - minY * s;
  g.shadowColor = hex(COLORS[type]);
  g.shadowBlur = dim ? 0 : 14;
  for (const [x, y] of cells) drawBlock2D(g, ox + x * s + 1, oy + y * s + 1, s - 2, dim ? COLORS.X : COLORS[type], dim ? 0.6 : 1);
  g.shadowBlur = 0;
}

function drawPreviews() {
  drawMini($('hold'), hold, holdUsed);
  for (let i = 0; i < 5; i++) drawMini($('next' + i), queue[i]);
}

// =====================================================================
//  Layout & kamera
// =====================================================================
let baseDist = 30, camTargetY = 0;
const rootStyle = document.documentElement.style;

let unitPx = 20;

function layout() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  const body = document.body;
  const portrait = h >= w && (isTouch || w < 820);
  const landscape = !portrait && isTouch;
  body.classList.toggle('portrait', portrait);
  body.classList.toggle('landscape', landscape);

  let side, top = 0, bottom = 0, pad, sidew;
  if (portrait) {
    // bar skor di atas, hold/next di samping papan, tombol di bawah
    side = Math.round(Math.min(96, Math.max(58, w * 0.17)));
    sidew = side - 12;
    top = $('statsPanel').getBoundingClientRect().bottom + 4;
    bottom = isTouch ? h - $('touch').getBoundingClientRect().top : 8;
    pad = 4;
  } else if (landscape) {
    // panel + tombol di kolom kiri/kanan
    sidew = Math.max(110, $('touchLeft').getBoundingClientRect().width);
    side = sidew + 28;
    pad = 8;
  } else {
    side = 250; sidew = side - 40; pad = 30;
  }
  rootStyle.setProperty('--sidew', sidew + 'px');

  const tanH = Math.tan((camera.fov * Math.PI) / 360);
  const fracW = Math.max(0.25, (w - 2 * side - pad) / w);
  const fracH = Math.max(0.25, (h - top - bottom - 2 * pad) / h);
  const dH = ((ROWS + 1) / 2) / (tanH * fracH);
  const dW = ((COLS + 1) / 2) / (tanH * camera.aspect * fracW);
  baseDist = Math.max(dH, dW);
  camera.updateProjectionMatrix();

  unitPx = (h / 2) / (baseDist * tanH);
  const midY = top + (h - top - bottom) / 2;
  camTargetY = (midY - h / 2) / unitPx;
  rootStyle.setProperty('--bw', ((COLS / 2 + 0.4) * unitPx) + 'px');
  rootStyle.setProperty('--top', Math.max(8, midY - (ROWS / 2) * unitPx) + 'px');
  rootStyle.setProperty('--mid', midY + 'px');
  rootStyle.setProperty('--side', side + 'px');
}
window.addEventListener('resize', layout);
window.addEventListener('orientationchange', () => setTimeout(layout, 250));
if (window.visualViewport) visualViewport.addEventListener('resize', layout);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
layout();

const camPos = new THREE.Vector3(0, camTargetY, baseDist);
function updateCamera(dt, t) {
  let tx, ty, tz = baseDist;
  const mx = isTouch ? 0 : mouse.x, my = isTouch ? 0 : mouse.y;
  if (camMode === 0) {        // dinamis: sedikit miring, ikut mouse
    tx = mx * 3 + Math.sin(t * 0.35) * 0.8;
    ty = camTargetY - my * 2 + Math.cos(t * 0.27) * 0.5 - 1.5;
  } else if (camMode === 1) { // sudut dramatis
    tx = 9 + mx * 2;
    ty = camTargetY - 6 - my * 1.5;
    tz = baseDist * 0.93;
  } else {                    // datar / klasik
    tx = 0; ty = camTargetY;
  }
  const k = 1 - Math.exp(-dt * 4);
  camPos.x += (tx - camPos.x) * k;
  camPos.y += (ty - camPos.y) * k;
  camPos.z += (tz - camPos.z) * k;
  const sx = (Math.random() - 0.5) * shake, sy = (Math.random() - 0.5) * shake;
  camera.position.set(camPos.x + sx, camPos.y + sy, camPos.z);
  camera.lookAt(sx * 0.3, camTargetY + sy * 0.3, 0);
  shake *= Math.exp(-dt * 7);
  if (shake < 0.005) shake = 0;
}

// =====================================================================
//  Render
// =====================================================================
const frameBase = new THREE.Color(0x7c5cff);
const tmpColor = new THREE.Color();

function renderBoard(dt) {
  if (!grid) return;
  for (let y = 0; y < TOTAL; y++) {
    if (rowOffset[y] > 0) {
      rowOffset[y] *= Math.exp(-dt * 13);
      if (rowOffset[y] < 0.01) rowOffset[y] = 0;
    }
    const py = wy(y - rowOffset[y]);
    for (let x = 0; x < COLS; x++) {
      const m = cellMeshes[y][x], t = grid[y][x];
      if (!t) { m.visible = false; continue; }
      m.visible = true;
      const fi = y * COLS + x;
      if (flash[fi] > 0) { flash[fi] -= dt; m.material = flashMat; }
      else m.material = mats[t];
      m.position.set(wx(x), py, 0);
    }
  }
}

function renderPiece(dt, t) {
  const show = cur && (state === 'play' || state === 'pause');
  if (!show) {
    for (let i = 0; i < 4; i++) { pieceMeshes[i].visible = false; ghostMeshes[i].visible = false; }
    pieceLight.intensity = 0;
    return;
  }
  const k = 1 - Math.exp(-dt * 30);
  vis.x += (cur.x - vis.x) * k;
  vis.y += (cur.y - vis.y) * k;
  rotPop = Math.max(0, rotPop - dt * 6);
  const scale = 1 + 0.14 * rotPop;
  const gy = ghostY();
  const grounded = lockTimer > 0;
  const cells = ROT[cur.type][cur.rot];
  let sx = 0, sy = 0;
  cells.forEach(([cx, cy], i) => {
    const m = pieceMeshes[i];
    m.visible = true;
    m.material = mats[cur.type];
    m.position.set(wx(vis.x + cx), wy(vis.y + cy), grounded ? Math.sin(t * 30) * 0.03 : 0.05);
    m.scale.setScalar(scale);
    sx += m.position.x; sy += m.position.y;
    const g = ghostMeshes[i];
    g.visible = showGhost && gy !== cur.y;
    g.material = ghostMats[cur.type].fill;
    g.children[0].material = ghostMats[cur.type].line;
    g.position.set(wx(cur.x + cx), wy(gy + cy), 0);
  });
  pieceLight.color.setHex(COLORS[cur.type]);
  pieceLight.intensity = 1.1;
  pieceLight.position.set(sx / 4, sy / 4, 2);
}

function renderGameOverSweep(dt) {
  if (state !== 'over' || deadRow < 0) return;
  deadTimer += dt;
  while (deadTimer > 0.03 && deadRow >= 0) {
    deadTimer -= 0.03;
    for (let x = 0; x < COLS; x++) {
      if (grid[deadRow][x]) {
        if (Math.random() < 0.3) emit(wx(x), wy(deadRow), 0.3, COLORS[grid[deadRow][x]], 2, 3, 0.6);
        grid[deadRow][x] = 'X';
      }
    }
    deadRow--;
  }
}

let last = performance.now();
function frame(now) {
  const dtMs = Math.min(50, now - last);
  last = now;
  const dt = dtMs / 1000, t = now / 1000;

  if (state === 'play' && cur) update(dtMs);
  renderGameOverSweep(dt);

  // animasi skor
  displayScore += (score - displayScore) * (1 - Math.exp(-dt * 10));
  if (Math.abs(score - displayScore) < 1) displayScore = score;
  $('score').textContent = Math.round(displayScore).toLocaleString('id-ID');
  if (state === 'play') $('time').textContent = fmtTime(playTime);

  // spring: miring saat geser, pantul saat hard drop
  leanV += (-lean * 90 - leanV * 12) * dt;
  lean += leanV * dt;
  bounceV += (-bounce * 160 - bounceV * 14) * dt;
  bounce += bounceV * dt;
  boardGroup.rotation.y = lean * 0.08;
  boardGroup.position.y = bounce * 0.12;

  // denyut warna frame berdasarkan level
  framePulse = Math.max(0, framePulse - dt * 1.5);
  tmpColor.copy(frameBase).offsetHSL(((level - 1) * 0.07) % 1, 0, 0);
  frameMat.color.copy(tmpColor);
  frameMat.emissive.copy(tmpColor);
  frameMat.emissiveIntensity = 0.7 + 0.25 * Math.sin(t * 2) + framePulse;

  // latar belakang
  bgGroup.rotation.z = t * 0.01;
  for (const f of floaters) {
    const u = f.userData;
    f.rotation.x += u.rs.x * dt; f.rotation.y += u.rs.y * dt; f.rotation.z += u.rs.z * dt;
    f.position.y += u.vy * dt;
    if (f.position.y > 30) f.position.y = -30;
  }
  pinkLight.position.x = -12 + Math.sin(t * 0.7) * 4;
  cyanLight.position.y = -8 + Math.cos(t * 0.6) * 5;

  renderBoard(dt);
  renderPiece(dt, t);
  updateParticles(dt);
  updateFx(dt);
  updateCamera(dt, t);
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}

// Papan demo di menu
grid = Array.from({ length: TOTAL }, emptyRow);
rowOffset = Array(TOTAL).fill(0);
flash = new Float32Array(TOTAL * COLS);
for (let y = TOTAL - 6; y < TOTAL; y++) {
  for (let x = 0; x < COLS; x++) if (Math.random() < 0.75 - (TOTAL - y) * 0.06) grid[y][x] = TYPES[(x + y) % 7];
}

$('menuBest').textContent = best.toLocaleString('id-ID');
updateHud();
drawPreviews();
showOverlay('menuCard');
requestAnimationFrame(frame);
})();
