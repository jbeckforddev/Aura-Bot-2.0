import { randomUUID } from "node:crypto";
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

function buildFullscreenMinecraftHtml(playerName: string, seedArg: number): string {
  const configJson = JSON.stringify({
    player: playerName || "Steve",
    seed: seedArg || Math.floor(Math.random() * 99999),
  });

  return `<style>
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
html,body{width:100%;height:100%;background:#05070b;color:#fff;font-family:'Courier New',monospace;overflow:hidden;touch-action:none}
#mc-root{position:fixed;inset:0;width:100vw;height:100vh;background:#000; display:flex;flex-direction:column;overflow:hidden}
#view{position:absolute;inset:0;width:100%;height:100%;image-rendering:pixelated;display:block;z-index:1}
#hud{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2}
.top-bar{position:absolute;top:10px;left:10px;right:10px;display:flex;justify-content:space-between;align-items:flex-start;z-index:10;pointer-events:none}
.mc-info{background:rgba(0,0,0,.65);border:2px solid #4a4a4a;padding:6px 10px;font-size:11px;line-height:1.4;text-shadow:1px 1px 0 #000;border-radius:4px}
.mc-ver{color:#55ff55;font-weight:900;font-size:12px}
.top-btns{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;pointer-events:auto;max-width:230px}
.mc-btn{background:#727272;border-top:2px solid #b8b8b8;border-left:2px solid #b8b8b8;border-right:2px solid #282828;border-bottom:2px solid #282828;color:#fff;font-family:'Courier New',monospace;font-size:10.5px;font-weight:900;padding:6px 8px;text-shadow:1px 1px 0 #222;cursor:pointer;border-radius:2px}
.mc-btn:active,.mc-btn.on{background:#4a4a4a;border-top-color:#282828;border-left-color:#282828;border-right-color:#b8b8b8;border-bottom-color:#b8b8b8;color:#ffff55}
#crosshair{position:absolute;top:50%;left:50%;width:16px;height:16px;transform:translate(-50%,-50%);z-index:5;pointer-events:none}
#crosshair::before,#crosshair::after{content:'';position:absolute;background:rgba(255,255,255,.9);box-shadow:0 0 2px #000}
#crosshair::before{top:7px;left:0;width:16px;height:2px}
#crosshair::after{top:0;left:7px;width:2px;height:16px}
#pad-zone{position:absolute;bottom:78px;left:14px;width:132px;height:132px;z-index:12;display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr);gap:4px}
.d-btn{background:rgba(45,45,45,.72);border:2px solid rgba(190,190,190,.55);color:#fff;font-size:16px;font-weight:900;display:flex;align-items:center;justify-content:center;border-radius:6px;text-shadow:1px 1px 0 #000}
.d-btn:active{background:rgba(85,255,85,.55);border-color:#55ff55}
#act-zone{position:absolute;bottom:78px;right:14px;display:flex;flex-direction:column;gap:8px;z-index:12}
.act-row{display:flex;gap:8px;justify-content:flex-end}
.a-btn{width:62px;height:50px;background:rgba(55,55,55,.78);border-top:2px solid #bbb;border-left:2px solid #bbb;border-right:2px solid #222;border-bottom:2px solid #222;color:#fff;font-size:10.5px;font-weight:900;display:flex;flex-direction:column;align-items:center;justify-content:center;text-shadow:1px 1px 0 #000;border-radius:6px}
.a-btn span{font-size:17px;line-height:1;margin-bottom:2px}
.a-btn:active{background:rgba(255,255,85,.45)}
.a-btn.tnt{background:rgba(175,30,30,.85)}
#bottom-hud{position:absolute;bottom:10px;left:50%;transform:translateX(-50%);z-index:12;display:flex;flex-direction:column;align-items:center;gap:4px;width:96%;max-width:390px}
.status-bars{width:100%;display:flex;justify-content:space-between;padding:0 6px;font-size:12px;letter-spacing:1px;text-shadow:1px 1px 0 #000;pointer-events:none}
#hotbar{display:flex;background:#333;border:2px solid #1a1a1a;padding:3px;gap:3px;border-radius:3px}
.slot{width:37px;height:37px;background:#8b8b8b;border-top:2px solid #373737;border-left:2px solid #373737;border-right:2px solid #fff;border-bottom:2px solid #fff;display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;cursor:pointer}
.slot.sel{outline:2.5px solid #ffff55;background:#ababab;z-index:2}
.slot canvas{width:24px;height:24px;image-rendering:pixelated}
.slot-num{position:absolute;top:1px;left:2px;font-size:8.5px;color:#fff;text-shadow:1px 1px 0 #000}
#toast{position:absolute;top:68px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.82);border:1.5px solid #55ff55;color:#ffff55;padding:5px 12px;font-size:11.5px;font-weight:900;z-index:20;opacity:0;transition:opacity .2s;pointer-events:none;white-space:nowrap;border-radius:4px}
#toast.show{opacity:1}
</style>

<div id="mc-root">
  <canvas id="view" width="176" height="132"></canvas>
  <canvas id="hud" width="352" height="264"></canvas>
  <div id="crosshair"></div>
  <div id="toast"></div>

  <div class="top-bar">
    <div class="mc-info">
      <div class="mc-ver">Minecraft 1.0 Classic</div>
      <div id="posTxt">XYZ: 16, 12, 16</div>
      <div id="blkTxt">Bloque: Pasto</div>
      <div id="scoreTxt" style="color:#55ffff">Minados: 0 | Puestos: 0</div>
    </div>
    <div class="top-btns">
      <button class="mc-btn" id="btnFly" onclick="toggleFly()">🕊️ Fly</button>
      <button class="mc-btn" id="btnTime" onclick="cycleTime()">🌗 Día</button>
      <button class="mc-btn" onclick="spawnCreeper()">👾 Creeper</button>
      <button class="mc-btn" onclick="buildHouse()">🏠 Casa</button>
      <button class="mc-btn" onclick="regenWorld()">🌍 Mundo</button>
    </div>
  </div>

  <div id="pad-zone">
    <div></div>
    <div class="d-btn" data-k="w">▲</div>
    <div></div>
    <div class="d-btn" data-k="a">◀</div>
    <div class="d-btn" data-k="jump">🦘</div>
    <div class="d-btn" data-k="d">▶</div>
    <div></div>
    <div class="d-btn" data-k="s">▼</div>
    <div></div>
  </div>

  <div id="act-zone">
    <div class="act-row">
      <div class="a-btn tnt" onclick="detonateAllTnt()"><span>🧨</span>BOOM</div>
      <div class="a-btn" data-k="down"><span>🔽</span>Bajar</div>
    </div>
    <div class="act-row">
      <div class="a-btn" onclick="doAction('break')"><span>⛏️</span>Romper</div>
      <div class="a-btn" onclick="doAction('place')"><span>🧱</span>Poner</div>
    </div>
  </div>

  <div id="bottom-hud">
    <div class="status-bars">
      <div id="hearts">❤️❤️❤️❤️❤️❤️❤️❤️❤️❤️</div>
      <div id="fpsTxt" style="color:#55ff55">60 FPS</div>
    </div>
    <div id="hotbar"></div>
  </div>
</div>

<script>
const CFG = ${configJson};
const viewCv = document.getElementById("view");
const viewCtx = viewCv.getContext("2d", { alpha: false });
const hudCv = document.getElementById("hud");
const hudCtx = hudCv.getContext("2d");

const RW = 176;
const RH = 132;
const imgData = viewCtx.createImageData(RW, RH);
const buf32 = new Uint32Array(imgData.data.buffer);

const WX = 36;
const WY = 24;
const WZ = 36;
const world = new Uint8Array(WX * WY * WZ);

const BLOCKS = [
  { id: 1, name: "Pasto", top: 1, side: 2, bot: 3 },
  { id: 2, name: "Tierra", top: 3, side: 3, bot: 3 },
  { id: 3, name: "Piedra", top: 4, side: 4, bot: 4 },
  { id: 4, name: "Madera", top: 5, side: 5, bot: 5 },
  { id: 5, name: "Tronco", top: 6, side: 7, bot: 6 },
  { id: 6, name: "Ladrillo", top: 8, side: 8, bot: 8 },
  { id: 7, name: "Diamante", top: 9, side: 9, bot: 9 },
  { id: 8, name: "Piedra Luz", top: 10, side: 10, bot: 10 },
  { id: 9, name: "TNT Explosivo", top: 11, side: 12, bot: 11 },
  { id: 10, name: "Hojas", top: 13, side: 13, bot: 13 },
  { id: 11, name: "Creeper", top: 14, side: 14, bot: 14 }
];

const TEX_COUNT = 16;
const texData = new Uint32Array(TEX_COUNT * 256);

let seedVal = CFG.seed || 1337;
let minedCount = 0;
let placedCount = 0;

function rnd() {
  seedVal = (seedVal * 1664525 + 1013904223) >>> 0;
  return (seedVal & 0xfffffff) / 0x10000000;
}

function packRGB(r, g, b) {
  return (255 << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255);
}

function buildTextures() {
  for (let t = 1; t <= 14; t++) {
    const base = t * 256;
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const n = (rnd() - 0.5) * 26;
        let r = 128, g = 128, b = 128;
        if (t === 1) {
          r = 88 + n; g = 168 + n; b = 52 + n;
        } else if (t === 2) {
          if (y < 3 + ((x * 7) % 3)) {
            r = 88 + n; g = 168 + n; b = 52 + n;
          } else {
            r = 134 + n; g = 96 + n; b = 67 + n;
          }
        } else if (t === 3) {
          r = 134 + n; g = 96 + n; b = 67 + n;
        } else if (t === 4) {
          const cob = ((x * 3 + y * 5) % 7 === 0) ? -28 : 0;
          r = 125 + n + cob; g = 125 + n + cob; b = 125 + n + cob;
        } else if (t === 5) {
          const plank = (y % 4 === 0 || (x + (y >> 2) * 7) % 16 === 0) ? -22 : 0;
          r = 162 + n * 0.5 + plank; g = 130 + n * 0.5 + plank; b = 78 + n * 0.5 + plank;
        } else if (t === 6) {
          const dx = x - 7.5, dy = y - 7.5;
          const dist = Math.round(Math.sqrt(dx * dx + dy * dy));
          const ring = (dist % 2 === 0) ? -16 : 10;
          r = 155 + ring; g = 125 + ring; b = 74 + ring;
        } else if (t === 7) {
          const stripe = (x % 3 === 0) ? -18 : 6;
          r = 102 + stripe + n * 0.4; g = 80 + stripe + n * 0.4; b = 48 + stripe + n * 0.4;
        } else if (t === 8) {
          const mortar = (y % 4 === 0 || ((x + (y >> 2) * 4) % 8 === 0)) ? 1 : 0;
          if (mortar) { r = 185; g = 180; b = 175; }
          else { r = 160 + n * 0.6; g = 70 + n * 0.5; b = 55 + n * 0.5; }
        } else if (t === 9) {
          const shine = ((x + y) % 6 === 0) ? 45 : 0;
          r = 65 + shine; g = 225 + shine + n * 0.3; b = 240 + shine;
        } else if (t === 10) {
          const glow = ((x * y) % 5 === 0) ? 55 : 0;
          r = 215 + glow; g = 180 + glow; b = 90 + n;
        } else if (t === 11) {
          r = 195 + n; g = 45 + n * 0.5; b = 35 + n * 0.5;
        } else if (t === 12) {
          if (y >= 5 && y <= 10) {
            const isTxt = (x % 2 === 0 && y >= 6 && y <= 9);
            r = isTxt ? 25 : 245; g = isTxt ? 25 : 245; b = isTxt ? 25 : 245;
          } else {
            const st = (x % 4 === 0) ? -25 : 0;
            r = 205 + st + n * 0.4; g = 42 + st; b = 32 + st;
          }
        } else if (t === 13) {
          const leaf = ((x + y * 3) % 4 === 0) ? -26 : 12;
          r = 46 + leaf; g = 132 + leaf + n * 0.5; b = 36 + leaf;
        } else if (t === 14) {
          const eye = ((y >= 4 && y <= 6) && ((x >= 3 && x <= 5) || (x >= 10 && x <= 12)));
          const mouth = ((y >= 7 && y <= 11 && x >= 6 && x <= 9) || (y >= 9 && y <= 12 && (x === 5 || x === 10)));
          if (eye || mouth) { r = 18; g = 22; b = 18; }
          else { r = 60 + n; g = 180 + n; b = 50 + n; }
        }
        r = Math.max(0, Math.min(255, r));
        g = Math.max(0, Math.min(255, g));
        b = Math.max(0, Math.min(255, b));
        texData[base + y * 16 + x] = packRGB(r, g, b);
      }
    }
  }
}

function wIdx(x, y, z) {
  return (y * WZ + z) * WX + x;
}

function getBlock(x, y, z) {
  if (x < 0 || x >= WX || y < 0 || y >= WY || z < 0 || z >= WZ) return 0;
  return world[wIdx(x, y, z)];
}

function setBlock(x, y, z, val) {
  if (x < 0 || x >= WX || y < 0 || y >= WY || z < 0 || z >= WZ) return;
  world[wIdx(x, y, z)] = val;
}

function generateWorld(newSeed) {
  if (newSeed) seedVal = newSeed;
  world.fill(0);
  const offsetA = rnd() * 10;
  const offsetB = rnd() * 10;

  for (let x = 0; x < WX; x++) {
    for (let z = 0; z < WZ; z++) {
      const h = Math.floor(
        5 +
        Math.sin(x * 0.2 + offsetA) * 2.3 +
        Math.cos(z * 0.2 + offsetB) * 2.3
      );
      for (let y = 0; y <= h; y++) {
        if (y === 0) setBlock(x, y, z, 3);
        else if (y === h) setBlock(x, y, z, 1);
        else if (y >= h - 2) setBlock(x, y, z, 2);
        else setBlock(x, y, z, rnd() < 0.09 ? 7 : 3);
      }

      if (x > 4 && x < WX - 5 && z > 4 && z < WZ - 5 && rnd() < 0.03) {
        for (let ty = 1; ty <= 4; ty++) setBlock(x, h + ty, z, 5);
        for (let lx = -2; lx <= 2; lx++) {
          for (let lz = -2; lz <= 2; lz++) {
            for (let ly = 3; ly <= 5; ly++) {
              if (Math.abs(lx) === 2 && Math.abs(lz) === 2 && ly === 5) continue;
              if (lx === 0 && lz === 0 && ly <= 4) continue;
              setBlock(x + lx, h + ly, z + lz, 10);
            }
          }
        }
      }
    }
  }
}

let px = 18.5, py = 13.0, pz = 18.5;
let vy = 0;
let yaw = 0.6, pitch = -0.15;
let flyMode = false;
let onGround = false;
let selectedSlot = 0;
let timeMode = 0;
let swingAnim = 0;
let walkBob = 0;
let shakeTime = 0;
let aimHit = null;
const activeTnts = [];
const creepers = [];
const keys = {};

let audioCtx = null;
function playSfx(type) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state !== "running") audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    const now = audioCtx.currentTime;
    if (type === "break") {
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(175, now);
      osc.frequency.exponentialRampToValueAtTime(55, now + 0.11);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.11);
      osc.start(now);
      osc.stop(now + 0.11);
    } else if (type === "place") {
      osc.type = "square";
      osc.frequency.setValueAtTime(240, now);
      osc.frequency.exponentialRampToValueAtTime(370, now + 0.08);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (type === "boom") {
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(95, now);
      osc.frequency.exponentialRampToValueAtTime(20, now + 0.45);
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.45);
      osc.start(now);
      osc.stop(now + 0.45);
    }
  } catch (e) {}
}

function updateStatsUI() {
  document.getElementById("scoreTxt").textContent =
    "Minados: " + minedCount + " | Puestos: " + placedCount;
}

function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 1600);
}

function buildHotbarUI() {
  const hb = document.getElementById("hotbar");
  hb.innerHTML = "";
  for (let i = 0; i < 9; i++) {
    const b = BLOCKS[i];
    const slot = document.createElement("div");
    slot.className = "slot" + (i === selectedSlot ? " sel" : "");
    slot.onclick = () => selectSlot(i);

    const num = document.createElement("span");
    num.className = "slot-num";
    num.textContent = String(i + 1);

    const cv = document.createElement("canvas");
    cv.width = 16;
    cv.height = 16;
    const c2 = cv.getContext("2d");
    const idat = c2.createImageData(16, 16);
    const u32 = new Uint32Array(idat.data.buffer);
    const texOff = b.side * 256;
    for (let p = 0; p < 256; p++) u32[p] = texData[texOff + p];
    c2.putImageData(idat, 0, 0);

    slot.appendChild(num);
    slot.appendChild(cv);
    hb.appendChild(slot);
  }
}

function selectSlot(idx) {
  selectedSlot = idx;
  const slots = document.querySelectorAll(".slot");
  slots.forEach((s, i) => s.classList.toggle("sel", i === idx));
  document.getElementById("blkTxt").textContent = "Bloque: " + BLOCKS[idx].name;
  showToast("🧱 " + BLOCKS[idx].name);
}

function toggleFly() {
  flyMode = !flyMode;
  vy = 0;
  document.getElementById("btnFly").classList.toggle("on", flyMode);
  showToast(flyMode ? "🕊️ Modo Vuelo: ON" : "🚶 Modo Supervivencia");
}

function cycleTime() {
  timeMode = (timeMode + 1) % 3;
  const labels = ["🌗 Día", "🌅 Tarde", "🌙 Noche"];
  document.getElementById("btnTime").textContent = labels[timeMode];
  showToast("Clima: " + labels[timeMode]);
}

function spawnCreeper() {
  if (!aimHit) {
    showToast("Mira hacia el suelo para invocar");
    return;
  }
  const cx = aimHit.x + aimHit.nx;
  const cy = aimHit.y + aimHit.ny;
  const cz = aimHit.z + aimHit.nz;
  setBlock(cx, cy, cz, 11);
  setBlock(cx, cy + 1, cz, 11);
  creepers.push({ x: cx, y: cy, z: cz, tick: 0 });
  playSfx("place");
  showToast("👾 ¡Creeper invocado!");
}

function buildHouse() {
  const bx = Math.floor(px);
  const by = Math.floor(py - 1);
  const bz = Math.floor(pz);
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      for (let dy = 0; dy <= 3; dy++) {
        const wx = bx + dx, wy = by + dy, wz = bz + dz;
        if (dy === 0) setBlock(wx, wy, wz, 4);
        else if (dy === 3) setBlock(wx, wy, wz, 8);
        else if (Math.abs(dx) === 2 || Math.abs(dz) === 2) {
          if (dx === 0 && dz === 2 && dy <= 2) setBlock(wx, wy, wz, 0);
          else setBlock(wx, wy, wz, 6);
        } else {
          setBlock(wx, wy, wz, 0);
        }
      }
    }
  }
  placedCount += 35;
  updateStatsUI();
  playSfx("place");
  showToast("🏠 ¡Refugio construido a tu alrededor!");
}

function regenWorld() {
  creepers.length = 0;
  activeTnts.length = 0;
  generateWorld(Math.floor(Math.random() * 999999));
  px = 18.5; py = 14; pz = 18.5;
  showToast("🌍 Nuevo mundo 1.0 generado");
}

function explodeAt(ex, ey, ez) {
  playSfx("boom");
  shakeTime = 16;
  const rad = 3.3;
  for (let dx = -3; dx <= 3; dx++) {
    for (let dy = -3; dy <= 3; dy++) {
      for (let dz = -3; dz <= 3; dz++) {
        if (dx * dx + dy * dy + dz * dz <= rad * rad) {
          const bx = ex + dx, by = ey + dy, bz = ez + dz;
          if (by > 0) setBlock(bx, by, bz, 0);
        }
      }
    }
  }
}

function detonateAllTnt() {
  let count = 0;
  for (let x = 0; x < WX; x++) {
    for (let y = 1; y < WY; y++) {
      for (let z = 0; z < WZ; z++) {
        if (getBlock(x, y, z) === 9 || getBlock(x, y, z) === 11) {
          explodeAt(x, y, z);
          count++;
        }
      }
    }
  }
  if (count === 0 && aimHit) {
    explodeAt(aimHit.x, aimHit.y, aimHit.z);
    showToast("🧨 ¡Explosión directa!");
  } else {
    showToast("🧨 ¡" + count + " cargas detonadas!");
  }
}

function doAction(mode) {
  swingAnim = 1.0;
  if (!aimHit) return;
  if (mode === "break") {
    const bId = getBlock(aimHit.x, aimHit.y, aimHit.z);
    if (bId === 9 || bId === 11) {
      explodeAt(aimHit.x, aimHit.y, aimHit.z);
      return;
    }
    if (aimHit.y > 0) {
      setBlock(aimHit.x, aimHit.y, aimHit.z, 0);
      minedCount++;
      updateStatsUI();
      playSfx("break");
    }
  } else if (mode === "place") {
    const nx = aimHit.x + aimHit.nx;
    const ny = aimHit.y + aimHit.ny;
    const nz = aimHit.z + aimHit.nz;
    const distToPlayer =
      Math.abs(nx + 0.5 - px) < 0.7 &&
      Math.abs(nz + 0.5 - pz) < 0.7 &&
      ny >= Math.floor(py - 1.5) &&
      ny <= Math.floor(py + 0.2);
    if (!distToPlayer) {
      const chosenId = BLOCKS[selectedSlot].id;
      setBlock(nx, ny, nz, chosenId);
      placedCount++;
      updateStatsUI();
      playSfx("place");
      if (chosenId === 9) {
        showToast("🧨 ¡TNT activado! Explota en 2s...");
        activeTnts.push({ x: nx, y: ny, z: nz, timer: 55 });
      }
    }
  }
}

function isSolid(x, y, z) {
  if (x < 0 || x >= WX || z < 0 || z >= WZ) return true;
  if (y < 0) return true;
  if (y >= WY) return false;
  return world[wIdx(Math.floor(x), Math.floor(y), Math.floor(z))] !== 0;
}

function updatePhysics() {
  let moveF = (keys["w"] ? 1 : 0) - (keys["s"] ? 1 : 0);
  let moveS = (keys["d"] ? 1 : 0) - (keys["a"] ? 1 : 0);

  const spd = flyMode ? 0.16 : 0.105;
  const sinY = Math.sin(yaw);
  const cosY = Math.cos(yaw);

  const dx = (moveF * sinY + moveS * cosY) * spd;
  const dz = (moveF * cosY - moveS * sinY) * spd;

  if (Math.abs(dx) > 0.001 || Math.abs(dz) > 0.001) {
    walkBob += 0.22;
  }

  const rad = 0.3;
  if (!isSolid(px + dx + (dx > 0 ? rad : -rad), py - 1.3, pz) &&
      !isSolid(px + dx + (dx > 0 ? rad : -rad), py - 0.2, pz)) {
    px += dx;
  }
  if (!isSolid(px, py - 1.3, pz + dz + (dz > 0 ? rad : -rad)) &&
      !isSolid(px, py - 0.2, pz + dz + (dz > 0 ? rad : -rad))) {
    pz += dz;
  }

  if (flyMode) {
    if (keys["jump"]) py = Math.min(WY - 1, py + 0.14);
    if (keys["down"]) py = Math.max(2.5, py - 0.14);
  } else {
    vy -= 0.016;
    if (keys["jump"] && onGround) {
      vy = 0.23;
      onGround = false;
    }
    const nextY = py + vy;
    if (vy < 0 && isSolid(px, nextY - 1.55, pz)) {
      py = Math.floor(nextY - 1.55) + 1 + 1.55;
      vy = 0;
      onGround = true;
    } else if (vy > 0 && isSolid(px, nextY + 0.15, pz)) {
      vy = 0;
    } else {
      py = nextY;
      onGround = false;
    }
  }

  for (let i = activeTnts.length - 1; i >= 0; i--) {
    const t = activeTnts[i];
    t.timer--;
    if (t.timer <= 0) {
      activeTnts.splice(i, 1);
      if (getBlock(t.x, t.y, t.z) === 9) {
        explodeAt(t.x, t.y, t.z);
      }
    }
  }

  document.getElementById("posTxt").textContent =
    "XYZ: " + Math.floor(px) + ", " + Math.floor(py) + ", " + Math.floor(pz);
}

function renderScene() {
  const skyColors = [
    [118, 182, 255],
    [235, 115, 65],
    [10, 14, 32]
  ];
  const sky = skyColors[timeMode];
  const skyPacked = packRGB(sky[0], sky[1], sky[2]);

  const camShakeX = shakeTime > 0 ? (Math.random() - 0.5) * 0.08 : 0;
  const camShakeY = shakeTime > 0 ? (Math.random() - 0.5) * 0.08 : 0;
  if (shakeTime > 0) shakeTime--;

  const curYaw = yaw + camShakeX;
  const curPitch = pitch + camShakeY;

  const sinY = Math.sin(curYaw), cosY = Math.cos(curYaw);
  const sinP = Math.sin(curPitch), cosP = Math.cos(curPitch);

  const fx = sinY * cosP, fy = sinP, fz = cosY * cosP;
  const rx = cosY, ry = 0, rz = -sinY;
  const ux = -sinY * sinP, uy = cosP, uz = -cosY * sinP;

  const eyeY = py + Math.sin(walkBob) * 0.05;
  aimHit = null;

  const halfW = RW * 0.5;
  const halfH = RH * 0.5;
  const fov = 0.85;

  for (let y = 0; y < RH; y++) {
    const v = (halfH - y) / halfH * fov * (RH / RW);
    const rowOff = y * RW;

    for (let x = 0; x < RW; x++) {
      const u = (x - halfW) / halfW * fov;

      let rdx = fx + u * rx + v * ux;
      let rdy = fy + u * ry + v * uy;
      let rdz = fz + u * rz + v * uz;
      const invLen = 1 / Math.sqrt(rdx * rdx + rdy * rdy + rdz * rdz);
      rdx *= invLen; rdy *= invLen; rdz *= invLen;

      let mapX = Math.floor(px);
      let mapY = Math.floor(eyeY);
      let mapZ = Math.floor(pz);

      const ddx = Math.abs(1 / (rdx || 1e-7));
      const ddy = Math.abs(1 / (rdy || 1e-7));
      const ddz = Math.abs(1 / (rdz || 1e-7));

      let stepX, sideX, stepY, sideY, stepZ, sideZ;
      if (rdx < 0) { stepX = -1; sideX = (px - mapX) * ddx; }
      else { stepX = 1; sideX = (mapX + 1 - px) * ddx; }
      if (rdy < 0) { stepY = -1; sideY = (eyeY - mapY) * ddy; }
      else { stepY = 1; sideY = (mapY + 1 - eyeY) * ddy; }
      if (rdz < 0) { stepZ = -1; sideZ = (pz - mapZ) * ddz; }
      else { stepZ = 1; sideZ = (mapZ + 1 - pz) * ddz; }

      let hitBlock = 0;
      let side = 0;
      let dist = 0;
      const maxDist = 22;

      for (let step = 0; step < 28; step++) {
        if (sideX < sideY) {
          if (sideX < sideZ) {
            dist = sideX; sideX += ddx; mapX += stepX; side = 0;
          } else {
            dist = sideZ; sideZ += ddz; mapZ += stepZ; side = 2;
          }
        } else {
          if (sideY < sideZ) {
            dist = sideY; sideY += ddy; mapY += stepY; side = 1;
          } else {
            dist = sideZ; sideZ += ddz; mapZ += stepZ; side = 2;
          }
        }

        if (dist > maxDist) break;
        if (mapX >= 0 && mapX < WX && mapY >= 0 && mapY < WY && mapZ >= 0 && mapZ < WZ) {
          const b = world[wIdx(mapX, mapY, mapZ)];
          if (b !== 0) {
            hitBlock = b;
            break;
          }
        }
      }

      if (hitBlock === 0) {
        buf32[rowOff + x] = skyPacked;
        continue;
      }

      const hx = px + rdx * dist;
      const hy = eyeY + rdy * dist;
      const hz = pz + rdz * dist;

      let tx = 0, ty = 0;
      if (side === 0) {
        tx = Math.floor((hz - Math.floor(hz)) * 16) & 15;
        ty = Math.floor((1 - (hy - Math.floor(hy))) * 16) & 15;
      } else if (side === 1) {
        tx = Math.floor((hx - Math.floor(hx)) * 16) & 15;
        ty = Math.floor((hz - Math.floor(hz)) * 16) & 15;
      } else {
        tx = Math.floor((hx - Math.floor(hx)) * 16) & 15;
        ty = Math.floor((1 - (hy - Math.floor(hy))) * 16) & 15;
      }

      const bDef = BLOCKS[hitBlock - 1] || BLOCKS[0];
      let texId = bDef.side;
      if (side === 1) texId = stepY < 0 ? bDef.top : bDef.bot;

      let col = texData[texId * 256 + ty * 16 + tx];

      if (x === (RW >> 1) && y === (RH >> 1) && dist <= 7.0) {
        aimHit = {
          x: mapX, y: mapY, z: mapZ,
          nx: side === 0 ? -stepX : 0,
          ny: side === 1 ? -stepY : 0,
          nz: side === 2 ? -stepZ : 0
        };
      }

      const isEdge = (tx === 0 || tx === 15 || ty === 0 || ty === 15);
      if (aimHit && mapX === aimHit.x && mapY === aimHit.y && mapZ === aimHit.z && isEdge) {
        buf32[rowOff + x] = packRGB(255, 255, 255);
        continue;
      }

      let shade = side === 1 ? (stepY < 0 ? 1.0 : 0.52) : (side === 0 ? 0.72 : 0.84);
      if (timeMode === 1) shade *= 0.78;
      else if (timeMode === 2 && hitBlock !== 8) shade *= 0.42;

      let r = (col & 255) * shade;
      let g = ((col >> 8) & 255) * shade;
      let b = ((col >> 16) & 255) * shade;

      if (dist > 13) {
        const f = Math.min(1, (dist - 13) / 9);
        r = r * (1 - f) + sky[0] * f;
        g = g * (1 - f) + sky[1] * f;
        b = b * (1 - f) + sky[2] * f;
      }

      buf32[rowOff + x] = packRGB(r, g, b);
    }
  }

  viewCtx.putImageData(imgData, 0, 0);
}

function renderHandHUD() {
  hudCtx.clearRect(0, 0, hudCv.width, hudCv.height);
  if (swingAnim > 0) swingAnim = Math.max(0, swingAnim - 0.12);

  const bobX = Math.cos(walkBob * 0.5) * 6;
  const bobY = Math.abs(Math.sin(walkBob)) * 7;
  const swX = -Math.sin(swingAnim * Math.PI) * 32;
  const swY = Math.sin(swingAnim * Math.PI) * 20;

  const bx = 275 + bobX + swX;
  const by = 185 + bobY + swY;

  hudCtx.save();
  hudCtx.translate(bx, by);
  hudCtx.rotate(-0.22 - swingAnim * 0.5);

  const bDef = BLOCKS[selectedSlot];
  const sampleCol = texData[bDef.side * 256 + 120];
  const r = sampleCol & 255, g = (sampleCol >> 8) & 255, b = (sampleCol >> 16) & 255;

  hudCtx.fillStyle = "rgb(" + r + "," + g + "," + b + ")";
  hudCtx.fillRect(0, 0, 50, 50);
  hudCtx.fillStyle = "rgb(" + Math.floor(r * 0.7) + "," + Math.floor(g * 0.7) + "," + Math.floor(b * 0.7) + ")";
  hudCtx.fillRect(50, 6, 18, 48);
  hudCtx.strokeStyle = "#111";
  hudCtx.lineWidth = 2;
  hudCtx.strokeRect(0, 0, 50, 50);
  hudCtx.restore();
}

function setupControls() {
  document.querySelectorAll("[data-k]").forEach((btn) => {
    const k = btn.getAttribute("data-k").trim();
    const start = (e) => { e.preventDefault(); keys[k] = true; };
    const end = (e) => { e.preventDefault(); keys[k] = false; };
    btn.addEventListener("touchstart", start, { passive: false });
    btn.addEventListener("touchend", end, { passive: false });
    btn.addEventListener("mousedown", start);
    btn.addEventListener("mouseup", end);
    btn.addEventListener("mouseleave", end);
  });

  let lookTouchId = null;
  let lastLX = 0, lastLY = 0;

  viewCv.addEventListener("touchstart", (e) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (lookTouchId === null) {
        lookTouchId = t.identifier;
        lastLX = t.clientX;
        lastLY = t.clientY;
      }
    }
  }, { passive: true });

  viewCv.addEventListener("touchmove", (e) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === lookTouchId) {
        const dx = t.clientX - lastLX;
        const dy = t.clientY - lastLY;
        lastLX = t.clientX;
        lastLY = t.clientY;
        yaw += dx * 0.0085;
        pitch = Math.max(-1.35, Math.min(1.35, pitch - dy * 0.0085));
      }
    }
  }, { passive: true });

  const endLook = (e) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === lookTouchId) lookTouchId = null;
    }
  };
  viewCv.addEventListener("touchend", endLook, { passive: true });
  viewCv.addEventListener("touchcancel", endLook, { passive: true });

  let mouseDrag = false;
  viewCv.addEventListener("mousedown", (e) => {
    mouseDrag = true;
    lastLX = e.clientX;
    lastLY = e.clientY;
  });
  window.addEventListener("mousemove", (e) => {
    if (!mouseDrag) return;
    yaw += (e.clientX - lastLX) * 0.007;
    pitch = Math.max(-1.35, Math.min(1.35, pitch - (e.clientY - lastLY) * 0.007));
    lastLX = e.clientX;
    lastLY = e.clientY;
  });
  window.addEventListener("mouseup", () => { mouseDrag = false; });

  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (k === " ") keys["jump"] = true;
    else if (k === "shift") keys["down"] = true;
    else keys[k] = true;
    if (k >= "1" && k <= "9") selectSlot(parseInt(k, 10) - 1);
  });
  window.addEventListener("keyup", (e) => {
    const k = e.key.toLowerCase();
    if (k === " ") keys["jump"] = false;
    else if (k === "shift") keys["down"] = false;
    else keys[k] = false;
  });
}

let frames = 0, lastFpsTime = performance.now();
function loop(now) {
  frames++;
  if (now - lastFpsTime >= 1000) {
    document.getElementById("fpsTxt").textContent = frames + " FPS";
    frames = 0;
    lastFpsTime = now;
  }
  updatePhysics();
  renderScene();
  renderHandHUD();
  requestAnimationFrame(loop);
}

buildTextures();
generateWorld(CFG.seed);
buildHotbarUI();
setupControls();
showToast("⛏️ Bienvenido a Minecraft 1.0, " + CFG.player);
requestAnimationFrame(loop);
</script>`;
}

export default {
  name: ["mc", "minecraft", "mc1"],
  category: "group",
  description: "Juega Minecraft 1.0 Classic en 3D a pantalla completa con TNT, Creepers, Casa instantánea y modo vuelo.",
  groupOnly: false,

  async run(ctx: CommandContext) {
    const { sock, from, msg, args = [], reply, react } = ctx;

    await react("⛏️").catch(() => undefined);

    const playerName = String(msg?.pushName || "Steve").trim();
    const customSeed = Number(args[0]?.replace(/\D/g, "")) || Math.floor(Math.random() * 89999 + 10000);
    const HTML = buildFullscreenMinecraftHtml(playerName, customSeed);

    const data = {
      response_id: "PopiooNixelPopiooNixelPopiooNixel",
      sections: [
        {
          __typename: "GenAIUnifiedResponseSection",
          view_model: {
            __typename: "GenAISingleLayoutViewModel",
            primitive: {
              __typename: "GenAIBotProgressStatusPrimitive",
              title: "⛏️ JUGAR MINECRAFT 1.0 (PANTALLA COMPLETA)",
              is_in_progress: true,
            },
          },
        },
      ],
      embedded_screens: [
        {
          title: `Minecraft 1.0 • ${playerName}`,
          content: [
            {
              __typename: "FOAIDNixelButtonSheets",
              tabs: [
                {
                  id: "tab_0",
                  tab_header: "Minecraft 1.0",
                  sections: [
                    {
                      __typename: "GenAIUnifiedResponseSection",
                      view_model: {
                        __typename: "GenAISingleLayoutViewModel",
                        primitive: {
                          __typename: "GenAIaeacdsnwHtmlPrimitive",
                          payload: HTML,
                          url: "https://whatsapp.com",
                          trusted_sources: ["example.com"],
                        },
                      },
                    },
                  ],
                  step_entries: [],
                },
              ],
            },
          ],
        },
      ],
    };

    try {
      const msgId =
        typeof (sock as any).generateMessageTag === "function"
          ? await (sock as any).generateMessageTag()
          : randomUUID();

      await sock.relayMessage(
        from,
        {
          messageContextInfo: {
            deviceListMetadata: {},
            deviceListMetadataVersion: 2,
            botMetadata: {
              messageDisclaimerText: "",
              richResponseSourcesMetadata: {},
            },
          },
          botForwardedMessage: {
            message: {
              richResponseMessage: {
                messageType: 1,
                unifiedResponse: {
                  data: Buffer.from(JSON.stringify(data)).toString("base64"),
                },
                contextInfo: {
                  forwardingScore: 1,
                  isForwarded: true,
                  forwardedAiBotMessageInfo: { botJid: "0@bot" },
                  forwardOrigin: 4,
                },
              },
            },
          },
        } as any,
        {
          messageId: msgId,
        },
      );

      await react("✅").catch(() => undefined);
    } catch (e: any) {
      await react("❌").catch(() => undefined);
      await reply(
        `❌ ${fytBold("Error al enviar Minecraft 1.0:")} ${e?.message || String(e)}`,
      ).catch(() => undefined);
    }
  },
};
