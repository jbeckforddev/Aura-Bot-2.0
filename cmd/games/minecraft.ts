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
html,body{width:100%;min-height:100dvh;background:#05070b;color:#fff;font-family:'Courier New',monospace;overflow:hidden;touch-action:none}
#mc-shell{position:relative;width:100%;height:86dvh;min-height:680px;max-height:920px;background:#000;display:flex;flex-direction:column;justify-content:space-between;overflow:hidden}
#view{position:absolute;inset:0;width:100%;height:100%;image-rendering:pixelated;display:block;z-index:1}
#hud{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2}
.top-zone{position:relative;z-index:10;padding:8px 10px;display:flex;flex-direction:column;gap:6px;pointer-events:none}
.top-row{display:flex;justify-content:space-between;align-items:flex-start;gap:6px}
.mc-info{background:rgba(10,12,18,.76);border:1.5px solid rgba(255,255,255,.22);padding:6px 9px;font-size:10.5px;line-height:1.38;text-shadow:1px 1px 0 #000;border-radius:6px;backdrop-filter:blur(4px)}
.mc-ver{color:#55ff55;font-weight:900;font-size:11.5px;display:flex;align-items:center;gap:6px}
.mode-pill{font-size:9px;padding:1px 5px;border-radius:4px;background:#ffaa00;color:#000;font-weight:900;text-shadow:none}
.mode-pill.cre{background:#00e5ff}
.top-btns{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end;pointer-events:auto;max-width:240px}
.mc-btn{background:rgba(75,78,88,.88);border-top:2px solid #c2c2c2;border-left:2px solid #c2c2c2;border-right:2px solid #222;border-bottom:2px solid #222;color:#fff;font-family:'Courier New',monospace;font-size:10px;font-weight:900;padding:5px 7px;text-shadow:1px 1px 0 #111;cursor:pointer;border-radius:4px}
.mc-btn:active,.mc-btn.on{background:#3b4252;border-top-color:#222;border-left-color:#222;border-right-color:#c2c2c2;border-bottom-color:#c2c2c2;color:#ffff55}
#crosshair{position:absolute;top:44%;left:50%;width:16px;height:16px;transform:translate(-50%,-50%);z-index:5;pointer-events:none}
#crosshair::before,#crosshair::after{content:'';position:absolute;background:rgba(255,255,255,.92);box-shadow:0 0 2px #000}
#crosshair::before{top:7px;left:0;width:16px;height:2px}
#crosshair::after{top:0;left:7px;width:2px;height:16px}
#toast{position:absolute;top:88px;left:50%;transform:translateX(-50%);background:rgba(8,10,16,.88);border:1.5px solid #55ff55;color:#ffff55;padding:5px 12px;font-size:11px;font-weight:900;z-index:25;opacity:0;transition:opacity .2s;pointer-events:none;white-space:nowrap;border-radius:6px;box-shadow:0 4px 14px rgba(0,0,0,.6)}
#toast.show{opacity:1}
#dmg-flash{position:absolute;inset:0;background:rgba(255,0,40,.38);z-index:8;pointer-events:none;opacity:0;transition:opacity .12s}
.bottom-zone{position:relative;z-index:12;width:100%;padding:0 10px 10px;display:flex;flex-direction:column;gap:8px;pointer-events:none}
.controls-row{display:flex;justify-content:space-between;align-items:flex-end;width:100%}
#pad-zone{width:132px;height:132px;display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr);gap:4px;pointer-events:auto}
.d-btn{background:rgba(30,34,44,.75);border:2px solid rgba(200,205,215,.5);color:#fff;font-size:16px;font-weight:900;display:flex;align-items:center;justify-content:center;border-radius:8px;text-shadow:1px 1px 0 #000;backdrop-filter:blur(2px)}
.d-btn:active{background:rgba(85,255,85,.55);border-color:#55ff55}
#act-zone{display:flex;flex-direction:column;gap:6px;pointer-events:auto}
.act-row{display:flex;gap:6px;justify-content:flex-end}
.a-btn{width:60px;height:46px;background:rgba(40,44,55,.82);border-top:2px solid #bbb;border-left:2px solid #bbb;border-right:2px solid #1b1b1b;border-bottom:2px solid #1b1b1b;color:#fff;font-size:9.5px;font-weight:900;display:flex;flex-direction:column;align-items:center;justify-content:center;text-shadow:1px 1px 0 #000;border-radius:7px}
.a-btn span{font-size:15px;line-height:1;margin-bottom:2px}
.a-btn:active{background:rgba(255,255,85,.48)}
.a-btn.tnt{background:rgba(175,32,32,.86)}
.a-btn.atk{background:rgba(130,50,185,.86)}
#bottom-hud{width:100%;max-width:400px;margin:0 auto;display:flex;flex-direction:column;align-items:center;gap:4px;pointer-events:auto}
.status-bars{width:100%;display:flex;justify-content:space-between;align-items:center;padding:0 4px;font-size:11px;text-shadow:1px 1px 0 #000;pointer-events:none}
#hotbar{display:flex;background:#262626;border:2px solid #111;padding:3px;gap:3px;border-radius:5px;box-shadow:0 6px 18px rgba(0,0,0,.7)}
.slot{width:38px;height:38px;background:#7d7d7d;border-top:2px solid #333;border-left:2px solid #333;border-right:2px solid #e0e0e0;border-bottom:2px solid #e0e0e0;display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;cursor:pointer;border-radius:2px}
.slot.sel{outline:2.5px solid #ffff55;background:#a6a6a6;z-index:2}
.slot canvas{width:24px;height:24px;image-rendering:pixelated}
.slot-num{position:absolute;top:1px;left:2px;font-size:8px;color:#fff;text-shadow:1px 1px 0 #000}
.slot-cnt{position:absolute;bottom:1px;right:2px;font-size:8.5px;font-weight:900;color:#ffff55;text-shadow:1px 1px 0 #000}
#inv-modal{position:absolute;inset:0;background:rgba(5,8,14,.88);z-index:30;display:none;flex-direction:column;align-items:center;justify-content:center;padding:16px;pointer-events:auto}
#inv-modal.open{display:flex}
.inv-card{background:#3b3b3b;border:3px solid #ababab;border-radius:8px;padding:12px;width:100%;max-width:340px}
.inv-title{font-size:13px;font-weight:900;color:#ffff55;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center}
.inv-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.inv-item{background:#686868;border:2px solid #2b2b2b;padding:6px;border-radius:4px;display:flex;flex-direction:column;align-items:center;gap:4px;cursor:pointer;font-size:9px;text-align:center}
.inv-item:active{border-color:#ffff55;background:#888}
.inv-item canvas{width:28px;height:28px;image-rendering:pixelated}
</style>

<div id="mc-shell">
  <canvas id="view" width="176" height="144"></canvas>
  <canvas id="hud" width="352" height="288"></canvas>
  <div id="dmg-flash"></div>
  <div id="crosshair"></div>
  <div id="toast"></div>

  <div class="top-zone">
    <div class="top-row">
      <div class="mc-info">
        <div class="mc-ver">
          <span>Minecraft 1.0 HD</span>
          <span class="mode-pill" id="modePill">SURVIVAL</span>
        </div>
        <div id="posTxt">XYZ: 32, 14, 32 • Pradera</div>
        <div id="blkTxt">Mano: Pasto (32x32)</div>
        <div id="mobTxt" style="color:#55ffff">Mobs vivos: 0 | Kills: 0</div>
      </div>
      <div class="top-btns">
        <button class="mc-btn" id="btnMode" onclick="toggleGameMode()">⚔️ Modo</button>
        <button class="mc-btn" id="btnFly" onclick="toggleFly()">🕊️ Fly</button>
        <button class="mc-btn" id="btnTime" onclick="cycleTime()">☀️ Día</button>
        <button class="mc-btn" onclick="spawnRandomMob()">👾 +Mob</button>
        <button class="mc-btn" onclick="spawnStructureHere()">🏰 Estructura</button>
        <button class="mc-btn" onclick="toggleInvModal()">🎒 Bloques</button>
        <button class="mc-btn" onclick="regenWorld()">🌍 Mapa</button>
      </div>
    </div>
  </div>

  <div class="bottom-zone">
    <div class="controls-row">
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
          <div class="a-btn atk" onclick="attackOrEat()"><span>⚔️</span>Atacar</div>
          <div class="a-btn tnt" onclick="detonateAllTnt()"><span>🧨</span>BOOM</div>
          <div class="a-btn" data-k="down"><span>🔽</span>Bajar</div>
        </div>
        <div class="act-row">
          <div class="a-btn" onclick="eatFood()"><span>🍖</span>Comer</div>
          <div class="a-btn" onclick="doAction('break')"><span>⛏️</span>Picar</div>
          <div class="a-btn" onclick="doAction('place')"><span>🧱</span>Poner</div>
        </div>
      </div>
    </div>

    <div id="bottom-hud">
      <div class="status-bars">
        <div id="hearts">❤️❤️❤️❤️❤️❤️❤️❤️❤️❤️</div>
        <div id="hunger">🍖🍖🍖🍖🍖🍖🍖🍖</div>
        <div id="fpsTxt" style="color:#55ff55">60 FPS</div>
      </div>
      <div id="hotbar"></div>
    </div>
  </div>

  <div id="inv-modal">
    <div class="inv-card">
      <div class="inv-title">
        <span>🎒 CATÁLOGO DE BLOQUES (32x32)</span>
        <button class="mc-btn" onclick="toggleInvModal()">✖</button>
      </div>
      <div class="inv-grid" id="invGrid"></div>
    </div>
  </div>
</div>

<script>
const CFG = ${configJson};
const shellEl = document.getElementById("mc-shell");
const viewCv = document.getElementById("view");
const viewCtx = viewCv.getContext("2d", { alpha: false });
const hudCv = document.getElementById("hud");
const hudCtx = hudCv.getContext("2d");

function syncFullscreenHeight() {
  const vh = Math.max(window.innerHeight || 0, document.documentElement.clientHeight || 0, 680);
  shellEl.style.height = vh + "px";
}
window.addEventListener("resize", syncFullscreenHeight);
syncFullscreenHeight();

const RW = 176;
const RH = 144;
const imgData = viewCtx.createImageData(RW, RH);
const buf32 = new Uint32Array(imgData.data.buffer);
const zBuffer = new Float32Array(RW * RH);

const WX = 64;
const WY = 32;
const WZ = 64;
const world = new Uint8Array(WX * WY * WZ);

const TSIZE = 32;
const TPX = TSIZE * TSIZE;
const TEX_COUNT = 24;
const texData = new Uint32Array(TEX_COUNT * TPX);

const BLOCKS = [
  { id: 1, name: "Pasto", top: 1, side: 2, bot: 3, hard: 1, startCnt: 32 },
  { id: 2, name: "Tierra", top: 3, side: 3, bot: 3, hard: 1, startCnt: 32 },
  { id: 3, name: "Piedra", top: 4, side: 4, bot: 4, hard: 2, startCnt: 24 },
  { id: 4, name: "Madera Roble", top: 5, side: 5, bot: 5, hard: 2, startCnt: 24 },
  { id: 5, name: "Tronco", top: 6, side: 7, bot: 6, hard: 2, startCnt: 16 },
  { id: 6, name: "Ladrillos", top: 8, side: 8, bot: 8, hard: 3, startCnt: 20 },
  { id: 7, name: "Diamante", top: 9, side: 9, bot: 9, hard: 3, startCnt: 10 },
  { id: 8, name: "Piedra Luz", top: 10, side: 10, bot: 10, hard: 1, startCnt: 16 },
  { id: 9, name: "TNT Explosivo", top: 11, side: 12, bot: 11, hard: 1, startCnt: 12 },
  { id: 10, name: "Hojas", top: 13, side: 13, bot: 13, hard: 1, startCnt: 20 },
  { id: 11, name: "Arena", top: 14, side: 14, bot: 14, hard: 1, startCnt: 24 },
  { id: 12, name: "Arenisca", top: 15, side: 15, bot: 15, hard: 2, startCnt: 24 },
  { id: 13, name: "Nieve", top: 16, side: 16, bot: 3, hard: 1, startCnt: 20 },
  { id: 14, name: "Agua", top: 17, side: 17, bot: 17, hard: 1, startCnt: 16 },
  { id: 15, name: "Obsidiana", top: 18, side: 18, bot: 18, hard: 4, startCnt: 12 },
  { id: 16, name: "Librería", top: 5, side: 19, bot: 5, hard: 2, startCnt: 12 }
];

let hotbarIds = [1, 3, 4, 6, 7, 8, 9, 12, 16];
const invCounts = {};
BLOCKS.forEach((b) => { invCounts[b.id] = b.startCnt; });

let seedVal = CFG.seed || 1337;
function rnd() {
  seedVal = (seedVal * 1664525 + 1013904223) >>> 0;
  return (seedVal & 0xfffffff) / 0x10000000;
}

function packRGB(r, g, b) {
  return (255 << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255);
}

function buildTextures32() {
  for (let t = 1; t <= 19; t++) {
    const base = t * TPX;
    for (let y = 0; y < TSIZE; y++) {
      for (let x = 0; x < TSIZE; x++) {
        const n = (rnd() - 0.5) * 24;
        const fine = ((x * 13 + y * 29) & 7) - 3.5;
        let r = 128, g = 128, b = 128;

        if (t === 1) {
          const blade = ((x * 5 + y * 3) % 7 === 0) ? 14 : 0;
          r = 78 + n * 0.7 + blade; g = 166 + n + blade; b = 48 + n * 0.6;
        } else if (t === 2) {
          const grassDrop = 5 + ((x * 11) % 5) + ((x * 3) % 3);
          if (y < grassDrop) {
            r = 82 + n * 0.7; g = 168 + n; b = 50 + n * 0.6;
          } else {
            constpeb = ((x * 7 + y * 5) % 13 === 0) ? -18 : 0;
            r = 132 + n + peb; g = 94 + n * 0.8 + peb; b = 64 + n * 0.7 + peb;
          }
        } else if (t === 3) {
          const peb = ((x * 9 + y * 7) % 11 === 0) ? -20 : 0;
          r = 132 + n + peb; g = 94 + n * 0.8 + peb; b = 64 + n * 0.7 + peb;
        } else if (t === 4) {
          const crack = ((x * 3 + y * 7) % 11 === 0 || (x + y * 2) % 15 === 0) ? -32 : 0;
          r = 126 + n * 0.8 + crack + fine; g = 126 + n * 0.8 + crack + fine; b = 130 + n * 0.8 + crack + fine;
        } else if (t === 5) {
          const groove = (y % 8 === 0 || (x + (y >> 3) * 11) % 32 === 0) ? -26 : 0;
          const grain = Math.sin(x * 0.5 + y * 0.2) * 6;
          r = 166 + grain + groove + n * 0.4; g = 132 + grain + groove + n * 0.4; b = 78 + grain + groove + n * 0.4;
        } else if (t === 6) {
          const dx = x - 15.5, dy = y - 15.5;
          const dist = Math.round(Math.sqrt(dx * dx + dy * dy));
          const ring = (dist % 3 === 0) ? -18 : 8;
          r = 158 + ring; g = 126 + ring; b = 74 + ring;
        } else if (t === 7) {
          const bark = (x % 4 === 0 || x % 7 === 0) ? -22 : 8;
          r = 98 + bark + n * 0.4; g = 74 + bark + n * 0.4; b = 44 + bark + n * 0.4;
        } else if (t === 8) {
          const mortar = (y % 8 === 0 || ((x + (y >> 3) * 8) % 16 === 0));
          if (mortar) { r = 192; g = 186; b = 180; }
          else { r = 168 + n * 0.6 + fine; g = 68 + n * 0.5; b = 54 + n * 0.5; }
        } else if (t === 9) {
          const border = (x < 2 || x > 29 || y < 2 || y > 29) ? -25 : 0;
          const facet = ((x + y) % 9 < 2) ? 48 : 0;
          r = 65 + facet + border; g = 230 + facet + border; b = 245 + facet + border;
        } else if (t === 10) {
          const crystal = ((x * y) % 7 === 0) ? 60 : -15;
          r = 225 + crystal; g = 185 + crystal; b = 85 + n;
        } else if (t === 11) {
          const fuse = (x >= 13 && x <= 18 && y >= 13 && y <= 18);
          r = fuse ? 40 : 205 + n; g = fuse ? 40 : 44 + n * 0.4; b = fuse ? 40 : 34 + n * 0.4;
        } else if (t === 12) {
          if (y >= 10 && y <= 21) {
            const letter = (y >= 12 && y <= 19) && (
              (x >= 5 && x <= 10 && (y === 12 || x === 7)) ||
              (x >= 13 && x <= 19 && (x === 13 || x === 19 || x - 13 === y - 12)) ||
              (x >= 22 && x <= 27 && (y === 12 || x === 24))
            );
            r = letter ? 20 : 245; g = letter ? 20 : 245; b = letter ? 20 : 245;
          } else {
            const stripe = (x % 6 === 0) ? -28 : 0;
            r = 212 + stripe + n * 0.4; g = 42 + stripe; b = 32 + stripe;
          }
        } else if (t === 13) {
          const hole = ((x * 3 + y * 5) % 9 === 0) ? -32 : 12;
          r = 40 + hole; g = 136 + hole + n * 0.5; b = 32 + hole;
        } else if (t === 14) {
          const wave = Math.sin(x * 0.4 + y * 0.3) * 10;
          r = 228 + wave + n * 0.3; g = 212 + wave + n * 0.3; b = 152 + wave + n * 0.3;
        } else if (t === 15) {
          const band = (y === 4 || y === 12 || y === 22) ? -20 : 0;
          r = 218 + band + n * 0.3; g = 198 + band + n * 0.3; b = 138 + band + n * 0.3;
        } else if (t === 16) {
          r = 240 + n * 0.3; g = 248 + n * 0.3; b = 255;
        } else if (t === 17) {
          const ripple = Math.sin((x + y) * 0.45) * 18;
          r = 35 + ripple; g = 115 + ripple; b = 230 + ripple;
        } else if (t === 18) {
          const purp = ((x * 5 + y * 7) % 13 === 0) ? 35 : 0;
          r = 28 + purp; g = 18 + purp * 0.5; b = 48 + purp * 1.4;
        } else if (t === 19) {
          if (y < 4 || y > 27 || (y >= 14 && y <= 17)) {
            r = 158; g = 125; b = 72;
          } else {
            const bookCols = [[190,40,40],[40,150,70],[45,95,200],[210,175,45],[145,50,175]];
            const bc = bookCols[(x >> 2) % bookCols.length];
            const spine = (x % 4 === 0) ? -30 : 0;
            r = bc[0] + spine; g = bc[1] + spine; b = bc[2] + spine;
          }
        }

        r = Math.max(0, Math.min(255, r));
        g = Math.max(0, Math.min(255, g));
        b = Math.max(0, Math.min(255, b));
        texData[base + y * TSIZE + x] = packRGB(r, g, b);
      }
    }
  }
}

function wIdx(x, y, z) {
  return (y * WZ + z) * WX + x;
}

function getBlock(x, y, z) {
  if (x < 0 || x >= WX || y < 0 || y >= WY || z < 0 || z >= WZ) return 0;
  return world[wIdx(x | 0, y | 0, z | 0)];
}

function setBlock(x, y, z, val) {
  if (x < 0 || x >= WX || y < 0 || y >= WY || z < 0 || z >= WZ) return;
  world[wIdx(x | 0, y | 0, z | 0)] = val;
}

function getSurfaceY(x, z) {
  for (let y = WY - 1; y >= 1; y--) {
    const b = getBlock(x, y, z);
    if (b !== 0 && b !== 10) return y;
  }
  return 5;
}

function buildPyramidAt(cx, cz) {
  const baseY = getSurfaceY(cx, cz);
  for (let l = 0; l <= 5; l++) {
    const r = 5 - l;
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        setBlock(cx + dx, baseY + l, cz + dz, 12);
      }
    }
  }
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      setBlock(cx + dx, baseY + 1, cz + dz, 0);
      setBlock(cx + dx, baseY + 2, cz + dz, 0);
    }
  }
  setBlock(cx, baseY + 1, cz, 7);
  setBlock(cx, baseY + 2, cz, 8);
  setBlock(cx, baseY + 1, cz + 5, 0);
  setBlock(cx, baseY + 2, cz + 5, 0);
}

function buildCastleAt(cx, cz) {
  const baseY = getSurfaceY(cx, cz);
  for (let dx = -3; dx <= 3; dx++) {
    for (let dz = -3; dz <= 3; dz++) {
      for (let dy = 1; dy <= 6; dy++) {
        const isEdge = Math.abs(dx) === 3 || Math.abs(dz) === 3;
        if (dy === 1) setBlock(cx + dx, baseY + dy, cz + dz, 3);
        else if (dy === 6) {
          if (isEdge && ((dx + dz) & 1) === 0) setBlock(cx + dx, baseY + dy, cz + dz, 6);
          else setBlock(cx + dx, baseY + dy, cz + dz, 0);
        } else if (isEdge) {
          if (dx === 0 && dz === 3 && dy <= 3) setBlock(cx + dx, baseY + dy, cz + dz, 0);
          else setBlock(cx + dx, baseY + dy, cz + dz, 3);
        } else {
          setBlock(cx + dx, baseY + dy, cz + dz, 0);
        }
      }
    }
  }
  setBlock(cx, baseY + 2, cz, 8);
  setBlock(cx - 2, baseY + 2, cz - 2, 16);
  setBlock(cx + 2, baseY + 2, cz - 2, 7);
}

function buildHouseAt(cx, cz) {
  const baseY = getSurfaceY(cx, cz);
  for (let dx = -2; dx <= 2; dx++) {
    for (let dz = -2; dz <= 2; dz++) {
      for (let dy = 1; dy <= 4; dy++) {
        const isWall = Math.abs(dx) === 2 || Math.abs(dz) === 2;
        const isCorner = Math.abs(dx) === 2 && Math.abs(dz) === 2;
        if (dy === 1) setBlock(cx + dx, baseY + dy, cz + dz, 4);
        else if (dy === 4) setBlock(cx + dx, baseY + dy, cz + dz, 5);
        else if (isCorner) setBlock(cx + dx, baseY + dy, cz + dz, 5);
        else if (isWall) {
          if (dx === 0 && dz === 2 && dy <= 3) setBlock(cx + dx, baseY + dy, cz + dz, 0);
          else setBlock(cx + dx, baseY + dy, cz + dz, 4);
        } else {
          setBlock(cx + dx, baseY + dy, cz + dz, 0);
        }
      }
    }
  }
  setBlock(cx, baseY + 3, cz, 8);
  setBlock(cx - 1, baseY + 2, cz - 1, 16);
}

const mobs = [];
const MOB_TYPES = {
  creeper: { name: "Creeper", hostile: true, hp: 12, spd: 0.045, colTop: [55, 185, 50], colBot: [40, 140, 38], h: 1.7 },
  zombie:  { name: "Zombie",  hostile: true, hp: 16, spd: 0.042, colTop: [60, 145, 75], colBot: [45, 85, 165], h: 1.8 },
  skeleton:{ name: "Esqueleto",hostile: true, hp: 12, spd: 0.048, colTop: [220, 220, 220], colBot: [175, 175, 180], h: 1.8 },
  pig:     { name: "Cerdo",   hostile: false, hp: 8,  spd: 0.032, colTop: [245, 160, 175], colBot: [225, 130, 148], h: 1.0 },
  sheep:   { name: "Oveja",   hostile: false, hp: 8,  spd: 0.030, colTop: [245, 245, 245], colBot: [195, 170, 145], h: 1.1 },
  cow:     { name: "Vaca",    hostile: false, hp: 10, spd: 0.028, colTop: [92, 64, 45],    colBot: [220, 220, 220], h: 1.3 }
};

function spawnMob(typeKey, mx, mz) {
  const def = MOB_TYPES[typeKey] || MOB_TYPES.pig;
  const my = getSurfaceY(Math.floor(mx), Math.floor(mz)) + 1;
  mobs.push({
    type: typeKey,
    name: def.name,
    hostile: def.hostile,
    hp: def.hp,
    maxHp: def.hp,
    spd: def.spd,
    x: mx,
    y: my,
    z: mz,
    dir: rnd() * Math.PI * 2,
    moveTimer: 40,
    hurtTick: 0,
    fuse: 0,
    colTop: def.colTop,
    colBot: def.colBot,
    h: def.h
  });
}

function populateInitialMobs() {
  mobs.length = 0;
  const keys = ["pig", "sheep", "cow", "creeper", "zombie", "skeleton"];
  for (let i = 0; i < 18; i++) {
    const tk = keys[i % keys.length];
    const mx = 8 + rnd() * (WX - 16);
    const mz = 8 + rnd() * (WZ - 16);
    spawnMob(tk, mx, mz);
  }
}

function generateWorld(newSeed) {
  if (newSeed) seedVal = newSeed;
  world.fill(0);
  const offA = rnd() * 10;
  const offB = rnd() * 10;

  for (let x = 0; x < WX; x++) {
    for (let z = 0; z < WZ; z++) {
      const h = Math.floor(
        6 +
        Math.sin(x * 0.14 + offA) * 2.6 +
        Math.cos(z * 0.14 + offB) * 2.6
      );
      const isDesert = x > 38 && z > 34;
      const isSnow = x < 20 && z < 20;

      for (let y = 0; y <= h; y++) {
        if (y === 0) setBlock(x, y, z, 15);
        else if (y === h) {
          if (h <= 4) setBlock(x, y, z, 14);
          else if (isDesert) setBlock(x, y, z, 11);
          else if (isSnow) setBlock(x, y, z, 13);
          else setBlock(x, y, z, 1);
        } else if (y >= h - 2) {
          setBlock(x, y, z, isDesert ? 12 : 2);
        } else {
          setBlock(x, y, z, rnd() < 0.08 ? 7 : 3);
        }
      }

      if (!isDesert && h > 5 && x > 5 && x < WX - 6 && z > 5 && z < WZ - 6 && rnd() < 0.022) {
        for (let ty = 1; ty <= 4; ty++) setBlock(x, h + ty, z, 5);
        for (let lx = -2; lx <= 2; lx++) {
          for (let lz = -2; lz <= 2; lz++) {
            for (let ly = 3; ly <= 5; ly++) {
              if (Math.abs(lx) === 2 && Math.abs(lz) === 2 && ly === 5) continue;
              if (lx === 0 && lz === 0 && ly <= 4) continue;
              setBlock(x + lx, h + ly, z + lz, isSnow ? 13 : 10);
            }
          }
        }
      }
    }
  }

  buildHouseAt(26, 28);
  buildCastleAt(18, 44);
  buildPyramidAt(48, 46);
  populateInitialMobs();
}

let px = 32.5, py = 15.0, pz = 32.5;
let vy = 0;
let yaw = 0.5, pitch = -0.12;
let gameMode = "survival";
let flyMode = false;
let onGround = false;
let selectedSlot = 0;
let timeMode = 0;
let swingAnim = 0;
let walkBob = 0;
let shakeTime = 0;
let playerHp = 10;
let playerHunger = 8;
let killCount = 0;
let aimHit = null;
let breakProgress = { key: "", hits: 0 };
const activeTnts = [];
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
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(55, now + 0.11);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.11);
      osc.start(now);
      osc.stop(now + 0.11);
    } else if (type === "place") {
      osc.type = "square";
      osc.frequency.setValueAtTime(250, now);
      osc.frequency.exponentialRampToValueAtTime(380, now + 0.08);
      gain.gain.setValueAtTime(0.15, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.08);
      osc.start(now);
      osc.stop(now + 0.08);
    } else if (type === "hit") {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(45, now + 0.14);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.linearRampToValueAtTime(0.01, now + 0.14);
      osc.start(now);
      osc.stop(now + 0.14);
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

function showToast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove("show"), 1700);
}

function flashDamage() {
  const fl = document.getElementById("dmg-flash");
  fl.style.opacity = "1";
  setTimeout(() => { fl.style.opacity = "0"; }, 160);
}

function updateSurvivalBars() {
  if (gameMode === "creative") {
    document.getElementById("hearts").textContent = "💛💛💛💛💛💛💛💛💛💛";
    document.getElementById("hunger").textContent = "✨ CREATIVO ∞";
  } else {
    const fullH = Math.max(0, Math.min(10, Math.ceil(playerHp)));
    document.getElementById("hearts").textContent =
      "❤️".repeat(fullH) + "🖤".repeat(10 - fullH);
    const fullF = Math.max(0, Math.min(8, Math.ceil(playerHunger)));
    document.getElementById("hunger").textContent =
      "🍖".repeat(fullF) + "🦴".repeat(8 - fullF);
  }
  document.getElementById("mobTxt").textContent =
    "Mobs vivos: " + mobs.length + " | Kills: " + killCount;
}

function damagePlayer(amount, cause) {
  if (gameMode === "creative") return;
  playerHp -= amount;
  flashDamage();
  playSfx("hit");
  if (playerHp <= 0) {
    playerHp = 10;
    playerHunger = 8;
    px = 32.5;
    pz = 32.5;
    py = getSurfaceY(32, 32) + 3;
    vy = 0;
    showToast("💀 Moriste (" + cause + "). Reapareciendo...");
  }
  updateSurvivalBars();
}

function eatFood() {
  swingAnim = 1.0;
  if (gameMode === "creative") {
    showToast("✨ En modo Creativo no necesitas comer");
    return;
  }
  if (playerHp >= 10 && playerHunger >= 8) {
    showToast("🍖 Salud y hambre al máximo");
    return;
  }
  playerHp = Math.min(10, playerHp + 3);
  playerHunger = Math.min(8, playerHunger + 3);
  playSfx("place");
  updateSurvivalBars();
  showToast("🍖 Comiste chuleta asada (+3 ❤️)");
}

function getBlockDefById(id) {
  return BLOCKS.find((b) => b.id === id) || BLOCKS[0];
}

function drawTexToCanvas(texId, cv) {
  cv.width = TSIZE;
  cv.height = TSIZE;
  const c2 = cv.getContext("2d");
  const idat = c2.createImageData(TSIZE, TSIZE);
  const u32 = new Uint32Array(idat.data.buffer);
  const off = texId * TPX;
  for (let p = 0; p < TPX; p++) u32[p] = texData[off + p];
  c2.putImageData(idat, 0, 0);
}

function buildHotbarUI() {
  const hb = document.getElementById("hotbar");
  hb.innerHTML = "";
  for (let i = 0; i < 9; i++) {
    const b = getBlockDefById(hotbarIds[i]);
    const slot = document.createElement("div");
    slot.className = "slot" + (i === selectedSlot ? " sel" : "");
    slot.onclick = () => selectSlot(i);

    const num = document.createElement("span");
    num.className = "slot-num";
    num.textContent = String(i + 1);

    const cnt = document.createElement("span");
    cnt.className = "slot-cnt";
    cnt.textContent = gameMode === "creative" ? "∞" : String(invCounts[b.id] || 0);

    const cv = document.createElement("canvas");
    drawTexToCanvas(b.side, cv);

    slot.appendChild(num);
    slot.appendChild(cv);
    slot.appendChild(cnt);
    hb.appendChild(slot);
  }
  const curB = getBlockDefById(hotbarIds[selectedSlot]);
  document.getElementById("blkTxt").textContent =
    "Mano: " + curB.name + (gameMode === "creative" ? " (∞)" : " (x" + (invCounts[curB.id] || 0) + ")");
}

function buildInvCatalogUI() {
  const grid = document.getElementById("invGrid");
  grid.innerHTML = "";
  BLOCKS.forEach((b) => {
    const item = document.createElement("div");
    item.className = "inv-item";
    const cv = document.createElement("canvas");
    drawTexToCanvas(b.side, cv);
    const lbl = document.createElement("div");
    lbl.textContent = b.name;
    item.appendChild(cv);
    item.appendChild(lbl);
    item.onclick = () => {
      hotbarIds[selectedSlot] = b.id;
      if ((invCounts[b.id] || 0) < 16) invCounts[b.id] = 32;
      buildHotbarUI();
      toggleInvModal();
      showToast("🎒 Equipado: " + b.name);
    };
    grid.appendChild(item);
  });
}

function toggleInvModal() {
  document.getElementById("inv-modal").classList.toggle("open");
}

function selectSlot(idx) {
  selectedSlot = idx;
  buildHotbarUI();
}

function toggleGameMode() {
  if (gameMode === "survival") {
    gameMode = "creative";
    flyMode = true;
    document.getElementById("modePill").textContent = "CREATIVO";
    document.getElementById("modePill").classList.add("cre");
    document.getElementById("btnFly").classList.add("on");
    showToast("✨ Modo CREATIVO: Bloques ∞, Vuelo y 1-Click");
  } else {
    gameMode = "survival";
    flyMode = false;
    document.getElementById("modePill").textContent = "SURVIVAL";
    document.getElementById("modePill").classList.remove("cre");
    document.getElementById("btnFly").classList.remove("on");
    showToast("⚔️ Modo SUPERVIVENCIA: Cuidado con los monstruos");
  }
  updateSurvivalBars();
  buildHotbarUI();
}

function toggleFly() {
  flyMode = !flyMode;
  vy = 0;
  document.getElementById("btnFly").classList.toggle("on", flyMode);
  showToast(flyMode ? "🕊️ Vuelo Activado" : "🚶 Vuelo Desactivado");
}

function cycleTime() {
  timeMode = (timeMode + 1) % 3;
  const labels = ["☀️ Día", "🌅 Tarde", "🌙 Noche"];
  document.getElementById("btnTime").textContent = labels[timeMode];
  showToast("Horario: " + labels[timeMode]);
}

function spawnRandomMob() {
  const types = ["creeper", "zombie", "skeleton", "pig", "sheep", "cow"];
  const chosen = types[Math.floor(Math.random() * types.length)];
  const mx = Math.max(4, Math.min(WX - 4, px + Math.sin(yaw) * 4));
  const mz = Math.max(4, Math.min(WZ - 4, pz + Math.cos(yaw) * 4));
  spawnMob(chosen, mx, mz);
  updateSurvivalBars();
  showToast("👾 Invocado: " + MOB_TYPES[chosen].name);
}

let structCycle = 0;
function spawnStructureHere() {
  const sx = Math.max(7, Math.min(WX - 8, Math.floor(px + Math.sin(yaw) * 6)));
  const sz = Math.max(7, Math.min(WZ - 8, Math.floor(pz + Math.cos(yaw) * 6)));
  structCycle = (structCycle + 1) % 3;
  if (structCycle === 0) {
    buildHouseAt(sx, sz);
    showToast("🏠 Cabaña de Aldea construida");
  } else if (structCycle === 1) {
    buildCastleAt(sx, sz);
    showToast("🏰 Castillo Medieval construido");
  } else {
    buildPyramidAt(sx, sz);
    showToast("🏜️ Pirámide del Desierto construida");
  }
  playSfx("place");
}

function regenWorld() {
  activeTnts.length = 0;
  generateWorld(Math.floor(Math.random() * 999999));
  px = 32.5;
  pz = 32.5;
  py = getSurfaceY(32, 32) + 3;
  updateSurvivalBars();
  showToast("🌍 Nuevo Mapa 64x64 con Estructuras y Mobs");
}

function explodeAt(ex, ey, ez) {
  playSfx("boom");
  shakeTime = 16;
  const rad = 3.4;
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
  const distP = Math.hypot(px - ex, py - ey, pz - ez);
  if (distP < 4.8) {
    damagePlayer(4, "Explosión TNT/Creeper");
  }
  for (let i = mobs.length - 1; i >= 0; i--) {
    const m = mobs[i];
    if (Math.hypot(m.x - ex, m.y - ey, m.z - ez) < 4.5) {
      mobs.splice(i, 1);
      killCount++;
    }
  }
  updateSurvivalBars();
}

function detonateAllTnt() {
  let count = 0;
  for (let x = 0; x < WX; x++) {
    for (let y = 1; y < WY; y++) {
      for (let z = 0; z < WZ; z++) {
        if (getBlock(x, y, z) === 9) {
          explodeAt(x, y, z);
          count++;
        }
      }
    }
  }
  if (count === 0 && aimHit) {
    explodeAt(aimHit.x, aimHit.y, aimHit.z);
    showToast("🧨 ¡Impacto explosivo!");
  } else {
    showToast("🧨 ¡" + count + " TNT detonados!");
  }
}

function attackOrEat() {
  swingAnim = 1.0;
  const sinY = Math.sin(yaw), cosY = Math.cos(yaw);
  let hitAny = false;

  for (let i = mobs.length - 1; i >= 0; i--) {
    const m = mobs[i];
    const dx = m.x - px;
    const dz = m.z - pz;
    const dist = Math.hypot(dx, dz);
    if (dist < 4.2) {
      const dot = (dx / (dist || 1)) * sinY + (dz / (dist || 1)) * cosY;
      if (dot > 0.55) {
        m.hp -= gameMode === "creative" ? 99 : 5;
        m.hurtTick = 10;
        m.x += sinY * 0.65;
        m.z += cosY * 0.65;
        hitAny = true;
        playSfx("hit");
        if (m.hp <= 0) {
          const wasPassive = !m.hostile;
          const mName = m.name;
          mobs.splice(i, 1);
          killCount++;
          if (wasPassive) {
            playerHp = Math.min(10, playerHp + 2);
            playerHunger = Math.min(8, playerHunger + 2);
            showToast("🍖 Cazaste un " + mName + " (+2 ❤️)");
          } else {
            invCounts[9] = (invCounts[9] || 0) + 2;
            buildHotbarUI();
            showToast("⚔️ Eliminaste a " + mName + " (+2 TNT)");
          }
          updateSurvivalBars();
        } else {
          showToast("⚔️ Golpeaste a " + m.name + " (HP: " + m.hp + ")");
        }
        break;
      }
    }
  }
  if (!hitAny) {
    doAction("break");
  }
}

function doAction(mode) {
  swingAnim = 1.0;
  if (!aimHit) return;

  if (mode === "break") {
    const bId = getBlock(aimHit.x, aimHit.y, aimHit.z);
    if (bId === 0 || aimHit.y <= 0) return;

    if (bId === 9) {
      explodeAt(aimHit.x, aimHit.y, aimHit.z);
      return;
    }

    const bDef = getBlockDefById(bId);
    const key = aimHit.x + "," + aimHit.y + "," + aimHit.z;

    if (gameMode === "survival") {
      if (breakProgress.key !== key) {
        breakProgress = { key, hits: 1 };
      } else {
        breakProgress.hits++;
      }
      if (breakProgress.hits < bDef.hard) {
        playSfx("hit");
        return;
      }
      breakProgress = { key: "", hits: 0 };
      invCounts[bId] = (invCounts[bId] || 0) + 1;
    }

    setBlock(aimHit.x, aimHit.y, aimHit.z, 0);
    playSfx("break");
    buildHotbarUI();
  } else if (mode === "place") {
    const chosenId = hotbarIds[selectedSlot];
    if (gameMode === "survival" && (invCounts[chosenId] || 0) <= 0) {
      showToast("⚠️ Sin bloques de este tipo. Pica más o usa Modo Creativo");
      return;
    }
    const nx = aimHit.x + aimHit.nx;
    const ny = aimHit.y + aimHit.ny;
    const nz = aimHit.z + aimHit.nz;
    const distToPlayer =
      Math.abs(nx + 0.5 - px) < 0.65 &&
      Math.abs(nz + 0.5 - pz) < 0.65 &&
      ny >= Math.floor(py - 1.5) &&
      ny <= Math.floor(py + 0.2);
    if (!distToPlayer) {
      setBlock(nx, ny, nz, chosenId);
      if (gameMode === "survival") {
        invCounts[chosenId] = Math.max(0, (invCounts[chosenId] || 0) - 1);
      }
      playSfx("place");
      buildHotbarUI();
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
  const b = world[wIdx(x | 0, y | 0, z | 0)];
  return b !== 0 && b !== 14;
}

let hungerTick = 0;
function updatePhysicsAndMobs() {
  let moveF = (keys["w"] ? 1 : 0) - (keys["s"] ? 1 : 0);
  let moveS = (keys["d"] ? 1 : 0) - (keys["a"] ? 1 : 0);

  const spd = flyMode ? 0.18 : 0.115;
  const sinY = Math.sin(yaw);
  const cosY = Math.cos(yaw);

  const dx = (moveF * sinY + moveS * cosY) * spd;
  const dz = (moveF * cosY - moveS * sinY) * spd;

  if (Math.abs(dx) > 0.001 || Math.abs(dz) > 0.001) {
    walkBob += 0.22;
    hungerTick++;
    if (gameMode === "survival" && hungerTick > 450) {
      hungerTick = 0;
      playerHunger = Math.max(0, playerHunger - 1);
      updateSurvivalBars();
    }
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
    if (keys["jump"]) py = Math.min(WY - 1, py + 0.16);
    if (keys["down"]) py = Math.max(2.5, py - 0.16);
  } else {
    vy -= 0.017;
    if (keys["jump"] && onGround) {
      vy = 0.24;
      onGround = false;
    }
    const nextY = py + vy;
    if (vy < 0 && isSolid(px, nextY - 1.55, pz)) {
      if (vy < -0.42 && gameMode === "survival") {
        damagePlayer(2, "Caída alta");
      }
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

  for (let i = mobs.length - 1; i >= 0; i--) {
    const m = mobs[i];
    if (m.hurtTick > 0) m.hurtTick--;

    const distToP = Math.hypot(px - m.x, pz - m.z);
    if (m.hostile && gameMode === "survival" && distToP < 12) {
      m.dir = Math.atan2(px - m.x, pz - m.z);
      if (m.type === "creeper" && distToP < 2.2) {
        m.fuse++;
        if (m.fuse > 35) {
          explodeAt(Math.floor(m.x), Math.floor(m.y), Math.floor(m.z));
          mobs.splice(i, 1);
          continue;
        }
      } else {
        m.fuse = Math.max(0, m.fuse - 1);
        if (distToP < 1.35 && Math.random() < 0.04) {
          damagePlayer(1, m.name);
        }
      }
    } else {
      m.moveTimer--;
      if (m.moveTimer <= 0) {
        m.dir += (Math.random() - 0.5) * 2.2;
        m.moveTimer = 35 + Math.floor(Math.random() * 50);
      }
    }

    const nx = m.x + Math.sin(m.dir) * m.spd;
    const nz = m.z + Math.cos(m.dir) * m.spd;
    if (nx > 2 && nx < WX - 2 && nz > 2 && nz < WZ - 2) {
      m.x = nx;
      m.z = nz;
      m.y = getSurfaceY(Math.floor(m.x), Math.floor(m.z)) + 1;
    }
  }

  const biomeName =
    px > 38 && pz > 34 ? "Desierto" : px < 20 && pz < 20 ? "Nevada" : "Pradera";
  document.getElementById("posTxt").textContent =
    "XYZ: " + (px | 0) + ", " + (py | 0) + ", " + (pz | 0) + " • " + biomeName;
}

function renderScene() {
  const skyColors = [
    [115, 185, 255],
    [235, 118, 65],
    [10, 14, 30]
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
  const mask = TSIZE - 1;

  for (let y = 0; y < RH; y++) {
    const v = ((halfH - y) / halfH) * fov * (RH / RW);
    const rowOff = y * RW;

    for (let x = 0; x < RW; x++) {
      const u = ((x - halfW) / halfW) * fov;

      let rdx = fx + u * rx + v * ux;
      let rdy = fy + u * ry + v * uy;
      let rdz = fz + u * rz + v * uz;
      const invLen = 1 / Math.sqrt(rdx * rdx + rdy * rdy + rdz * rdz);
      rdx *= invLen; rdy *= invLen; rdz *= invLen;

      let mapX = px | 0;
      let mapY = eyeY | 0;
      let mapZ = pz | 0;

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
      const maxDist = 26;

      for (let step = 0; step < 34; step++) {
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
        zBuffer[rowOff + x] = 999;
        continue;
      }

      zBuffer[rowOff + x] = dist;

      const hx = px + rdx * dist;
      const hy = eyeY + rdy * dist;
      const hz = pz + rdz * dist;

      let tx = 0, ty = 0;
      if (side === 0) {
        tx = ((hz - Math.floor(hz)) * TSIZE) & mask;
        ty = ((1 - (hy - Math.floor(hy))) * TSIZE) & mask;
      } else if (side === 1) {
        tx = ((hx - Math.floor(hx)) * TSIZE) & mask;
        ty = ((hz - Math.floor(hz)) * TSIZE) & mask;
      } else {
        tx = ((hx - Math.floor(hx)) * TSIZE) & mask;
        ty = ((1 - (hy - Math.floor(hy))) * TSIZE) & mask;
      }

      const bDef = BLOCKS[hitBlock - 1] || BLOCKS[0];
      let texId = bDef.side;
      if (side === 1) texId = stepY < 0 ? bDef.top : bDef.bot;

      let col = texData[texId * TPX + ty * TSIZE + tx];

      if (x === (RW >> 1) && y === (RH >> 1) && dist <= 7.0) {
        aimHit = {
          x: mapX, y: mapY, z: mapZ,
          nx: side === 0 ? -stepX : 0,
          ny: side === 1 ? -stepY : 0,
          nz: side === 2 ? -stepZ : 0
        };
      }

      const isEdge = (tx === 0 || tx === mask || ty === 0 || ty === mask);
      if (aimHit && mapX === aimHit.x && mapY === aimHit.y && mapZ === aimHit.z && isEdge) {
        buf32[rowOff + x] = packRGB(255, 255, 255);
        continue;
      }

      let shade = side === 1 ? (stepY < 0 ? 1.0 : 0.52) : (side === 0 ? 0.74 : 0.86);
      if (timeMode === 1) shade *= 0.78;
      else if (timeMode === 2 && hitBlock !== 8) shade *= 0.42;

      let r = (col & 255) * shade;
      let g = ((col >> 8) & 255) * shade;
      let b = ((col >> 16) & 255) * shade;

      if (dist > 15) {
        const f = Math.min(1, (dist - 15) / 11);
        r = r * (1 - f) + sky[0] * f;
        g = g * (1 - f) + sky[1] * f;
        b = b * (1 - f) + sky[2] * f;
      }

      buf32[rowOff + x] = packRGB(r, g, b);
    }
  }

  for (let i = 0; i < mobs.length; i++) {
    const m = mobs[i];
    const dx = m.x - px;
    const dy = (m.y + m.h * 0.5) - eyeY;
    const dz = m.z - pz;

    const cz = dx * fx + dy * fy + dz * fz;
    if (cz <= 0.4 || cz > 22) continue;

    const cx = dx * rx + dy * ry + dz * rz;
    const cy = dx * ux + dy * uy + dz * uz;

    const sx = Math.floor(halfW + (cx / (cz * fov)) * halfW);
    const sy = Math.floor(halfH - (cy / (cz * fov * (RH / RW))) * halfH);

    const sprH = Math.min(RH, Math.max(6, Math.floor((m.h / cz) * halfH * 1.3)));
    const sprW = Math.max(4, Math.floor(sprH * 0.62));

    const x0 = Math.max(0, sx - (sprW >> 1));
    const x1 = Math.min(RW - 1, sx + (sprW >> 1));
    const y0 = Math.max(0, sy - (sprH >> 1));
    const y1 = Math.min(RH - 1, sy + (sprH >> 1));

    const flashHurt = m.hurtTick > 0 || (m.fuse > 0 && (m.fuse & 2) === 0);

    for (let pyY = y0; pyY <= y1; pyY++) {
      const vRel = (pyY - (sy - (sprH >> 1))) / (sprH || 1);
      const rowOff = pyY * RW;
      for (let pxX = x0; pxX <= x1; pxX++) {
        if (cz >= zBuffer[rowOff + pxX]) continue;
        const uRel = (pxX - (sx - (sprW >> 1))) / (sprW || 1);

        let rgb = vRel < 0.45 ? m.colTop : m.colBot;
        if (vRel < 0.35 && uRel > 0.2 && uRel < 0.8) {
          const isEye = (vRel > 0.16 && vRel < 0.26) && ((uRel > 0.25 && uRel < 0.4) || (uRel > 0.6 && uRel < 0.75));
          if (isEye) rgb = m.hostile ? [20, 20, 20] : [35, 35, 35];
        }
        if (flashHurt) {
          buf32[rowOff + pxX] = packRGB(255, 70, 70);
        } else {
          buf32[rowOff + pxX] = packRGB(rgb[0], rgb[1], rgb[2]);
        }
        zBuffer[rowOff + pxX] = cz;
      }
    }
  }

  viewCtx.putImageData(imgData, 0, 0);
}

function renderHandHUD() {
  hudCtx.clearRect(0, 0, hudCv.width, hudCv.height);
  if (swingAnim > 0) swingAnim = Math.max(0, swingAnim - 0.12);

  const bobX = Math.cos(walkBob * 0.5) * 6;
  const bobY = Math.abs(Math.sin(walkBob)) * 7;
  const swX = -Math.sin(swingAnim * Math.PI) * 34;
  const swY = Math.sin(swingAnim * Math.PI) * 22;

  const bx = 278 + bobX + swX;
  const by = 195 + bobY + swY;

  hudCtx.save();
  hudCtx.translate(bx, by);
  hudCtx.rotate(-0.22 - swingAnim * 0.5);

  const bDef = getBlockDefById(hotbarIds[selectedSlot]);
  const sampleCol = texData[bDef.side * TPX + 520];
  const r = sampleCol & 255, g = (sampleCol >> 8) & 255, b = (sampleCol >> 16) & 255;

  hudCtx.fillStyle = "rgb(" + r + "," + g + "," + b + ")";
  hudCtx.fillRect(0, 0, 48, 48);
  hudCtx.fillStyle = "rgb(" + ((r * 0.7) | 0) + "," + ((g * 0.7) | 0) + "," + ((b * 0.7) | 0) + ")";
  hudCtx.fillRect(48, 6, 16, 46);
  hudCtx.strokeStyle = "#111";
  hudCtx.lineWidth = 2;
  hudCtx.strokeRect(0, 0, 48, 48);
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
  updatePhysicsAndMobs();
  renderScene();
  renderHandHUD();
  requestAnimationFrame(loop);
}

buildTextures32();
generateWorld(CFG.seed);
py = getSurfaceY(32, 32) + 3;
buildHotbarUI();
buildInvCatalogUI();
updateSurvivalBars();
setupControls();
showToast("⛏️ Minecraft 1.0 HD (32x32) • " + CFG.player);
requestAnimationFrame(loop);
</script>`;
}

export default {
  name: ["mc", "minecraft", "mc1"],
  category: "group",
  description: "Juega Minecraft 1.0 HD (32x32) a pantalla completa con modos Survival/Creativo, Mobs y Estructuras.",
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
              title: "⛏️ ABRIR MINECRAFT 1.0 HD (SURVIVAL & CREATIVO)",
              is_in_progress: true,
            },
          },
        },
      ],
      embedded_screens: [
        {
          title: `Minecraft 1.0 HD • ${playerName}`,
          content: [
            {
              __typename: "FOAIDNixelButtonSheets",
              tabs: [
                {
                  id: "tab_0",
                  tab_header: "Minecraft 1.0 HD",
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
