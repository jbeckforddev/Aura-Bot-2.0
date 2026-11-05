import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";

const buildGeometryDashPayload = () => {
  const htmlContent = `<style>
*{box-sizing:border-box;margin:0;padding:0;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;font-family:'Arial Black',Impact,sans-serif}
body{background:#000;color:#fff;overflow:hidden;display:flex;justify-content:center;align-items:center}
#gd-root{position:relative;width:100%;max-width:460px;height:270px;background:#0022aa;overflow:hidden;border:2px solid #1a1a1a;border-radius:10px;box-shadow:0 8px 25px rgba(0,0,0,0.9)}
canvas{position:absolute;top:0;left:0;width:100%;height:100%;display:block;z-index:1}
.layer{position:absolute;top:0;left:0;width:100%;height:100%;z-index:10;display:none;flex-direction:column;justify-content:space-between;pointer-events:none}
.layer.active{display:flex}
.interactive{pointer-events:auto;cursor:pointer;transition:transform 0.08s ease}
.interactive:active{transform:scale(0.92)}
.stroke-txt{color:#fff;text-shadow:-2px -2px 0 #000,2px -2px 0 #000,-2px 2px 0 #000,2px 2px 0 #000,0 3px 0 #000}
.gd-title{text-align:center;margin-top:12px;font-size:27px;letter-spacing:1px;color:#7cff00;text-shadow:-2px -2px 0 #000,2px -2px 0 #000,-2px 2px 0 #000,2px 2px 0 #000,0 4px 0 #000,0 0 12px rgba(124,255,0,0.5);font-weight:900}
.menu-center{display:flex;justify-content:center;align-items:center;gap:18px;margin-top:-6px}
.gd-box-btn{position:relative;background:linear-gradient(180deg,#9dff00 0%,#4cbb00 100%);border:3px solid #000;box-shadow:inset 0 3px 0 rgba(255,255,255,0.6),0 4px 0 #000;border-radius:8px;display:flex;justify-content:center;align-items:center}
.gd-box-btn::before{content:'';position:absolute;inset:-6px;background:linear-gradient(180deg,#00ffff,#0099cc);z-index:-1;border:3px solid #000;border-radius:10px}
.btn-side{width:54px;height:54px}
.btn-play{width:78px;height:78px}
.play-tri{width:0;height:0;border-top:20px solid transparent;border-bottom:20px solid transparent;border-left:32px solid #ffcc00;filter:drop-shadow(0 2px 0 #000);margin-left:6px}
.profile-zone{position:absolute;left:10px;bottom:48px;display:flex;flex-direction:column;align-items:center}
.prof-name{font-size:11px;color:#ffd700;margin-bottom:3px;letter-spacing:0.5px}
.prof-row{display:flex;align-items:center;gap:5px}
.prof-circle{width:38px;height:38px;border-radius:50%;background:radial-gradient(circle,#00e5ff,#0055aa);border:2.5px solid #fff;box-shadow:0 0 0 2px #000;display:flex;justify-content:center;align-items:center;font-size:18px}
.prof-hint{font-size:10px;color:#fff;font-family:'Comic Sans MS',cursive,sans-serif;text-shadow:1px 1px 0 #000}
.daily-zone{position:absolute;right:10px;top:98px;display:flex;flex-direction:column;align-items:center}
.daily-lbl{font-size:10px;color:#ffd700;margin-top:-4px}
.menu-bottom{display:flex;justify-content:space-between;align-items:flex-end;padding:6px 10px;width:100%}
.socials{display:flex;flex-direction:column;gap:3px}
.soc-row{display:flex;gap:3px}
.soc-ico{width:18px;height:18px;border-radius:4px;border:1.5px solid #000;display:flex;justify-content:center;align-items:center;font-size:10px;font-weight:900;color:#fff}
.robtop-badge{background:linear-gradient(180deg,#ffcc00,#ff8800);border:2px solid #000;border-radius:5px;padding:1px 6px;font-size:10px;color:#000;font-weight:900;box-shadow:inset 0 1px 0 #fff}
.circle-nav{display:flex;gap:8px}
.c-btn{width:34px;height:34px;border-radius:50%;background:linear-gradient(180deg,#88ff00,#229900);border:2px solid #fff;box-shadow:0 0 0 2px #000,inset 0 2px 0 rgba(255,255,255,0.6);display:flex;justify-content:center;align-items:center;font-size:15px}
.more-games{background:linear-gradient(180deg,#88ff00,#33aa00);border:2.5px solid #000;border-radius:6px;padding:3px 6px;font-size:10px;line-height:1.05;text-align:center;color:#ffd700;box-shadow:inset 0 2px 0 rgba(255,255,255,0.5)}
.sel-top{display:flex;justify-content:space-between;align-items:flex-start;padding:8px 10px}
.back-arrow{width:0;height:0;border-top:14px solid transparent;border-bottom:14px solid transparent;border-right:22px solid #55ff00;filter:drop-shadow(0 0 2px #000)}
.top-bar-geo{width:170px;height:20px;background:linear-gradient(180deg,#77ff00,#339900);border:2.5px solid #000;border-top:none;border-radius:0 0 8px 8px;display:flex;justify-content:center;align-items:center}
.top-bar-geo span{width:34px;height:24px;background:linear-gradient(180deg,#00ffff,#0099bb);border:2.5px solid #000;display:block}
.info-ico{width:24px;height:24px;border-radius:50%;background:linear-gradient(180deg,#00e5ff,#0077cc);border:2px solid #000;display:flex;justify-content:center;align-items:center;font-size:13px;color:#fff}
.sel-mid{display:flex;justify-content:space-between;align-items:center;padding:0 10px;margin-top:-6px}
.nav-arrow{font-size:34px;color:#fff;text-shadow:-2px -2px 0 #000,2px -2px 0 #000,-2px 2px 0 #000,2px 2px 0 #000;padding:4px 8px}
.lvl-card{flex:1;max-width:300px;background:rgba(0,0,0,0.45);border:2.5px solid rgba(0,0,0,0.7);border-radius:10px;padding:10px 14px;position:relative;box-shadow:inset 0 0 15px rgba(0,0,0,0.6)}
.lvl-stars{position:absolute;top:5px;right:10px;font-size:12px;color:#fff;display:flex;align-items:center;gap:3px}
.lvl-main{display:flex;align-items:center;justify-content:center;gap:10px;margin:6px 0 12px}
.diff-face{width:32px;height:32px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#00e5ff,#0066cc);border:2.5px solid #000;display:flex;flex-direction:column;justify-content:center;align-items:center;position:relative;box-shadow:inset 0 2px 3px rgba(255,255,255,0.6)}
.diff-eyes{display:flex;gap:7px;margin-top:2px}
.diff-eyes i{width:5px;height:5px;background:#000;border-radius:50%;display:block}
.diff-mouth{width:14px;height:7px;background:#000;border-radius:0 0 10px 10px;margin-top:2px;overflow:hidden;position:relative}
.diff-mouth::after{content:'';position:absolute;bottom:0;left:3px;width:8px;height:4px;background:#ff3355;border-radius:50%}
.lvl-title{font-size:19px;letter-spacing:0.8px}
.lvl-meta{display:flex;justify-content:space-between;align-items:center;font-size:11px}
.orbs-txt{display:flex;align-items:center;gap:4px}
.orb-dot{color:#00ffff;font-size:13px}
.coins-row{display:flex;gap:4px}
.coin-ico{width:16px;height:16px;border-radius:50%;background:radial-gradient(circle,#ffe600,#cc8800);border:1.5px solid #000;display:flex;justify-content:center;align-items:center;font-size:9px;color:#fff}
.bars-zone{display:flex;flex-direction:column;align-items:center;gap:5px;margin-top:-2px}
.bar-lbl{font-size:11px;letter-spacing:0.5px;margin-bottom:-2px}
.prog-outer{width:255px;height:17px;background:rgba(0,0,0,0.65);border:2px solid #000;border-radius:9px;overflow:hidden;position:relative;display:flex;align-items:center;justify-content:center}
.prog-fill{position:absolute;top:0;left:0;height:100%;width:100%;border-radius:7px}
.prog-fill.norm{background:linear-gradient(180deg,#55ff00,#11aa00)}
.prog-fill.prac{background:linear-gradient(180deg,#00ffff,#0099cc)}
.prog-val{position:relative;z-index:2;font-size:11px}
.sel-bot{display:flex;flex-direction:column;align-items:center;padding-bottom:6px;gap:4px}
.ost-txt{font-size:10px;letter-spacing:0.5px}
.dots-row{display:flex;gap:5px}
.dot{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,0.35)}
.dot.on{background:#fff;transform:scale(1.2)}
.hud-top{display:flex;justify-content:center;align-items:center;padding:8px 12px;position:relative;width:100%}
.hud-bar-wrap{display:flex;align-items:center;gap:6px}
.hud-bar{width:180px;height:10px;background:rgba(0,0,0,0.6);border:1.5px solid #fff;border-radius:6px;overflow:hidden}
.hud-fill{height:100%;width:0%;background:linear-gradient(90deg,#ff3300,#ffcc00,#44ff00)}
.hud-pct{font-size:12px}
.hud-pause{position:absolute;right:10px;top:6px;width:26px;height:26px;border-radius:50%;background:rgba(255,255,255,0.18);border:1.5px solid rgba(255,255,255,0.6);display:flex;justify-content:center;align-items:center;font-size:11px;color:#fff}
.hud-Sound{position:absolute;left:10px;top:6px;width:26px;height:26px;border-radius:50%;background:rgba(255,255,255,0.18);border:1.5px solid rgba(255,255,255,0.6);display:flex;justify-content:center;align-items:center;font-size:12px;color:#fff}
</style>
<div id="gd-root">
  <canvas id="gdCanvas" width="460" height="270"></canvas>

  <div id="scrMenu" class="layer active">
    <div class="gd-title">GEOMETRY DASH</div>
    <div class="menu-center">
      <div class="gd-box-btn btn-side interactive" onclick="cycleSkin()" title="Cambiar Icono">
        <div id="skinPreview" style="width:28px;height:28px;background:linear-gradient(180deg,#00aaff,#ff2200);border:2.5px solid #000;display:flex;justify-content:space-around;align-items:center;padding:2px">
          <i style="width:5px;height:5px;background:#000;border-radius:50%;border:1px solid #fff"></i>
          <i style="width:5px;height:5px;background:#000;border-radius:50%;border:1px solid #fff"></i>
        </div>
      </div>
      <div class="gd-box-btn btn-play interactive" onclick="openSelect()">
        <div class="play-tri"></div>
      </div>
      <div class="gd-box-btn btn-side interactive" onclick="openSelect()">
        <span style="font-size:24px;filter:drop-shadow(0 2px 0 #000)">🛠️</span>
      </div>
    </div>

    <div class="profile-zone interactive" onclick="cycleSkin()">
      <div class="prof-name stroke-txt">LUFERALAI</div>
      <div class="prof-row">
        <div class="prof-circle">👤</div>
        <div class="prof-hint">← View Profile</div>
      </div>
    </div>

    <div class="daily-zone interactive" onclick="openSelect()">
      <span style="font-size:26px;filter:drop-shadow(0 2px 0 #000)">🧰</span>
      <span class="daily-lbl stroke-txt">DAILY</span>
    </div>

    <div class="menu-bottom">
      <div class="socials">
        <div class="soc-row">
          <div class="soc-ico" style="background:#1877f2">f</div>
          <div class="soc-ico" style="background:#1da1f2">𝕏</div>
          <div class="soc-ico" style="background:#ff0000">▶</div>
          <div class="soc-ico" style="background:#9146ff">👾</div>
        </div>
        <div class="soc-row" style="align-items:center">
          <div class="robtop-badge">ROBTOP</div>
          <div class="soc-ico" style="background:#5865f2">🎮</div>
        </div>
      </div>
      <div class="circle-nav">
        <div class="c-btn interactive" onclick="openSelect()">🏆</div>
        <div class="c-btn interactive" onclick="toggleAudio()">⚙️</div>
        <div class="c-btn interactive" onclick="openSelect()">📊</div>
        <div class="c-btn interactive" onclick="toggleAudio()">🎵</div>
      </div>
      <div class="more-games stroke-txt interactive" onclick="openSelect()">MORE<br>GAMES</div>
    </div>
  </div>

  <div id="scrSelect" class="layer">
    <div class="sel-top">
      <div class="back-arrow interactive" onclick="openMenu()"></div>
      <div class="top-bar-geo"><span></span></div>
      <div class="info-ico stroke-txt interactive" onclick="startLevel(false)">i</div>
    </div>

    <div class="sel-mid">
      <div class="nav-arrow interactive" onclick="changeLevel(-1)">◀</div>
      <div class="lvl-card interactive" onclick="startLevel(false)">
        <div class="lvl-stars stroke-txt"><span id="lvStars">1</span> ⭐</div>
        <div class="lvl-main">
          <div class="diff-face" id="lvFace">
            <div class="diff-eyes"><i></i><i></i></div>
            <div class="diff-mouth"></div>
          </div>
          <div class="lvl-title stroke-txt" id="lvName">STEREO MADNESS</div>
        </div>
        <div class="lvl-meta">
          <div class="orbs-txt stroke-txt"><span id="lvOrbs">50/50</span> <span class="orb-dot">🫧</span></div>
          <div class="coins-row">
            <div class="coin-ico">★</div>
            <div class="coin-ico">★</div>
            <div class="coin-ico">★</div>
          </div>
        </div>
      </div>
      <div class="nav-arrow interactive" onclick="changeLevel(1)">▶</div>
    </div>

    <div class="bars-zone">
      <div class="bar-lbl stroke-txt">NORMAL MODE</div>
      <div class="prog-outer interactive" onclick="startLevel(false)">
        <div class="prog-fill norm" id="normBarFill"></div>
        <span class="prog-val stroke-txt" id="normBarTxt">100%</span>
      </div>
      <div class="bar-lbl stroke-txt">PRACTICE MODE</div>
      <div class="prog-outer interactive" onclick="startLevel(true)">
        <div class="prog-fill prac" id="pracBarFill"></div>
        <span class="prog-val stroke-txt" id="pracBarTxt">100%</span>
      </div>
    </div>

    <div class="sel-bot">
      <div class="ost-txt stroke-txt interactive" onclick="toggleAudio()">DOWNLOAD THE SOUNDTRACK</div>
      <div class="dots-row" id="lvlDots"></div>
    </div>
  </div>

  <div id="scrPlay" class="layer">
    <div class="hud-top">
      <div class="hud-Sound interactive" id="btnMute" onclick="toggleAudio()">🔊</div>
      <div class="hud-bar-wrap">
        <div class="hud-bar"><div class="hud-fill" id="playFill"></div></div>
        <div class="hud-pct stroke-txt" id="playPct">0%</div>
      </div>
      <div class="hud-pause interactive" onclick="openSelect()">||</div>
    </div>
  </div>
</div>

<script>
const canvas = document.getElementById('gdCanvas');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height, FLOOR_Y = 212;

const LEVELS = [
  {
    name: 'STEREO MADNESS',
    stars: 1,
    orbs: '50/50',
    bgTop: '#0033cc',
    bgBot: '#001a66',
    floor: '#001155',
    speed: 4.3,
    bpm: 160,
    notes: [261.6,293.6,329.6,392.0,329.6,293.6,261.6,196.0,220.0,261.6,293.6,349.2,329.6,293.6,261.6,246.9],
    length: 3400,
    map: [
      {x:420,t:'s'},{x:650,t:'s'},{x:676,t:'s'},
      {x:920,t:'b',y:0},{x:952,t:'b',y:0},{x:984,t:'b',y:1},{x:1016,t:'b',y:1},{x:1048,t:'b',y:2},
      {x:1200,t:'p'},{x:1290,t:'s'},{x:1316,t:'s'},{x:1342,t:'s'},
      {x:1560,t:'b',y:0},{x:1592,t:'s'},{x:1624,t:'b',y:1},{x:1656,t:'s'},{x:1688,t:'b',y:2},
      {x:1920,t:'s'},{x:1946,t:'s'},{x:2160,t:'p'},{x:2260,t:'b',y:2},{x:2292,t:'b',y:2},{x:2324,t:'b',y:2},
      {x:2540,t:'s'},{x:2720,t:'s'},{x:2746,t:'s'},{x:2980,t:'p'},{x:3080,t:'s'},{x:3106,t:'s'}
    ]
  },
  {
    name: 'BACK ON TRACK',
    stars: 2,
    orbs: '75/75',
    bgTop: '#d400a8',
    bgBot: '#6e0058',
    floor: '#4d003d',
    speed: 4.65,
    bpm: 172,
    notes: [329.6,392.0,440.0,493.8,440.0,392.0,329.6,293.6,349.2,440.0,523.2,493.8,440.0,392.0,349.2,329.6],
    length: 3600,
    map: [
      {x:400,t:'p'},{x:490,t:'b',y:2},{x:522,t:'b',y:2},{x:554,t:'b',y:2},
      {x:750,t:'s'},{x:776,t:'s'},{x:980,t:'p'},{x:1070,t:'s'},{x:1096,t:'s'},{x:1122,t:'s'},
      {x:1340,t:'b',y:0},{x:1372,t:'b',y:1},{x:1404,t:'b',y:2},{x:1436,t:'p',y:3},
      {x:1700,t:'s'},{x:1726,t:'s'},{x:1940,t:'b',y:0},{x:1972,t:'s'},{x:2004,t:'b',y:1},
      {x:2240,t:'p'},{x:2340,t:'s'},{x:2366,t:'s'},{x:2392,t:'s'},
      {x:2650,t:'b',y:0},{x:2682,t:'b',y:1},{x:2714,t:'b',y:2},{x:2950,t:'s'},{x:2976,t:'s'},{x:3200,t:'s'}
    ]
  },
  {
    name: 'POLARGEIST',
    stars: 3,
    orbs: '100/100',
    bgTop: '#009977',
    bgBot: '#003d30',
    floor: '#00261e',
    speed: 4.9,
    bpm: 180,
    notes: [293.6,349.2,440.0,587.3,523.2,440.0,349.2,329.6,261.6,329.6,392.0,523.2,493.8,392.0,329.6,293.6],
    length: 3700,
    map: [
      {x:420,t:'s'},{x:446,t:'s'},{x:660,t:'p'},{x:760,t:'b',y:2},{x:792,t:'b',y:2},
      {x:1020,t:'s'},{x:1046,t:'s'},{x:1250,t:'b',y:0},{x:1282,t:'p',y:1},{x:1420,t:'b',y:3},{x:1452,t:'b',y:3},
      {x:1720,t:'s'},{x:1746,t:'s'},{x:1980,t:'p'},{x:2080,t:'s'},{x:2106,t:'s'},{x:2132,t:'s'},
      {x:2400,t:'b',y:0},{x:2432,t:'b',y:1},{x:2464,t:'b',y:2},{x:2720,t:'s'},{x:2746,t:'s'},{x:3050,t:'s'},{x:3076,t:'s'}
    ]
  }
];

const SKINS = [
  {top:'#00aaff',bot:'#ff2200'},
  {top:'#7cff00',bot:'#00e5ff'},
  {top:'#ffcc00',bot:'#9900ff'},
  {top:'#ff0066',bot:'#00ffcc'}
];

let screen = 'MENU';
let curLvl = 0;
let skinIdx = 0;
let attempt = 1;
let cameraX = 0;
let bgOffset = 0;
let pointerHeld = false;
let practiceMode = false;
let audioEnabled = true;
let audioCtx = null;
let noteTimer = null;
let noteStep = 0;

let player = {
  x: 105,
  y: FLOOR_Y - 26,
  size: 26,
  vy: 0,
  rot: 0,
  onGround: true,
  dead: false,
  won: false
};

let particles = [];

function initDots() {
  const wrap = document.getElementById('lvlDots');
  wrap.innerHTML = '';
  for(let i=0;i<18;i++){
    const d = document.createElement('div');
    d.className = 'dot' + (i === curLvl ? ' on' : '');
    wrap.appendChild(d);
  }
}

function updateSelectCard() {
  const lv = LEVELS[curLvl];
  document.getElementById('lvName').textContent = lv.name;
  document.getElementById('lvStars').textContent = lv.stars;
  document.getElementById('lvOrbs').textContent = lv.orbs;
  initDots();
}

function cycleSkin() {
  skinIdx = (skinIdx + 1) % SKINS.length;
  const s = SKINS[skinIdx];
  document.getElementById('skinPreview').style.background = 'linear-gradient(180deg,' + s.top + ',' + s.bot + ')';
  playSfx(520, 0.06, 'square');
}

function showLayer(id) {
  document.querySelectorAll('.layer').forEach(el => el.classList.remove('active'));
  if(id) document.getElementById(id).classList.add('active');
}

function openMenu() {
  screen = 'MENU';
  stopMusic();
  showLayer('scrMenu');
}

function openSelect() {
  screen = 'SELECT';
  stopMusic();
  updateSelectCard();
  showLayer('scrSelect');
  playSfx(440, 0.05, 'sine');
}

function changeLevel(dir) {
  curLvl = (curLvl + dir + LEVELS.length) % LEVELS.length;
  updateSelectCard();
  playSfx(600, 0.05, 'triangle');
}

function startLevel(isPrac) {
  practiceMode = !!isPrac;
  screen = 'PLAY';
  attempt = 1;
  resetAttempt();
  showLayer('scrPlay');
  startMusic();
}

function resetAttempt() {
  cameraX = 0;
  player.y = FLOOR_Y - player.size;
  player.vy = 0;
  player.rot = 0;
  player.onGround = true;
  player.dead = false;
  player.won = false;
  particles = [];
}

function ensureAudio() {
  if(!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if(AC) audioCtx = new AC();
  }
  if(audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}

function playSfx(freq, dur, type) {
  if(!audioEnabled) return;
  try {
    ensureAudio();
    if(!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.07, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + dur);
  } catch(e) {}
}

function startMusic() {
  stopMusic();
  if(!audioEnabled) return;
  const lv = LEVELS[curLvl];
  const stepMs = (60 / lv.bpm) * 500;
  noteStep = 0;
  noteTimer = setInterval(() => {
    if(screen !== 'PLAY' || player.dead || !audioEnabled) return;
    const f = lv.notes[noteStep % lv.notes.length];
    playSfx(f, 0.14, 'sawtooth');
    if(noteStep % 2 === 0) playSfx(f * 0.5, 0.1, 'triangle');
    noteStep++;
  }, stepMs);
}

function stopMusic() {
  if(noteTimer) {
    clearInterval(noteTimer);
    noteTimer = null;
  }
}

function toggleAudio() {
  audioEnabled = !audioEnabled;
  const btn = document.getElementById('btnMute');
  if(btn) btn.textContent = audioEnabled ? '🔊' : '🔇';
  if(audioEnabled && screen === 'PLAY') startMusic();
  else stopMusic();
}

function spawnParticles(x, y, color, count, speedMul) {
  for(let i=0;i<count;i++){
    const ang = Math.random() * Math.PI * 2;
    const spd = (1 + Math.random() * 4) * (speedMul || 1);
    particles.push({
      x, y,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd - 1,
      size: 2 + Math.random() * 4,
      color,
      life: 1
    });
  }
}

function triggerJump(force) {
  player.vy = force || -9.6;
  player.onGround = false;
  spawnParticles(player.x, player.y + player.size, '#00ffff', 7, 0.7);
  playSfx(380, 0.07, 'square');
}

function crashPlayer() {
  if(player.dead) return;
  player.dead = true;
  spawnParticles(player.x + 13, player.y + 13, SKINS[skinIdx].top, 26, 1.5);
  spawnParticles(player.x + 13, player.y + 13, '#ffffff', 14, 1.2);
  playSfx(110, 0.28, 'sawtooth');
  setTimeout(() => {
    if(screen === 'PLAY') {
      attempt++;
      resetAttempt();
    }
  }, 850);
}

function updatePhysics() {
  const lv = LEVELS[curLvl];

  if(screen === 'MENU' || screen === 'SELECT') {
    bgOffset = (bgOffset + 1.8) % 64;
    player.y += player.vy;
    player.vy += 0.62;
    if(player.y >= FLOOR_Y - player.size) {
      player.y = FLOOR_Y - player.size;
      player.vy = 0;
      player.rot = 0;
      if(screen === 'MENU' && Math.random() < 0.03) {
        player.vy = -8.5;
      }
    } else {
      player.rot += 0.11;
    }
    return;
  }

  if(player.dead || player.won) return;

  cameraX += lv.speed;
  bgOffset = (cameraX * 0.35) % 64;

  if(pointerHeld && player.onGround) {
    triggerJump(-9.6);
  }

  player.y += player.vy;
  player.vy += 0.64;
  player.onGround = false;

  if(player.y >= FLOOR_Y - player.size) {
    player.y = FLOOR_Y - player.size;
    player.vy = 0;
    player.onGround = true;
    player.rot = Math.round(player.rot / (Math.PI / 2)) * (Math.PI / 2);
    if(Math.random() < 0.45) {
      particles.push({
        x: player.x + 2,
        y: FLOOR_Y - 2,
        vx: -2 - Math.random() * 2,
        vy: -Math.random() * 1.5,
        size: 3,
        color: '#00ffff',
        life: 0.7
      });
    }
  } else {
    player.rot += 0.125;
  }

  const px = player.x + cameraX;
  const py = player.y;
  const ps = player.size;

  for(let i=0;i<lv.map.length;i++){
    const obj = lv.map[i];
    const ox = obj.x;
    if(ox < px - 60 || ox > px + 80) continue;

    if(obj.t === 's') {
      const sy = FLOOR_Y - 28;
      if(px + ps - 6 > ox + 5 && px + 6 < ox + 23 && py + ps - 4 > sy + 6) {
        crashPlayer();
        return;
      }
    } else if(obj.t === 'b') {
      const by = FLOOR_Y - ((obj.y || 0) + 1) * 30;
      if(px + ps - 3 > ox && px + 3 < ox + 30 && py + ps > by && py < by + 30) {
        if(player.vy >= 0 && py + ps - player.vy <= by + 9) {
          player.y = by - ps;
          player.vy = 0;
          player.onGround = true;
          player.rot = Math.round(player.rot / (Math.PI / 2)) * (Math.PI / 2);
        } else {
          crashPlayer();
          return;
        }
      }
    } else if(obj.t === 'p') {
      const pyPad = FLOOR_Y - (obj.y || 0) * 30 - 8;
      if(px + ps > ox && px < ox + 28 && py + ps >= pyPad && py <= pyPad + 10) {
        triggerJump(-12.6);
      }
    }
  }

  const pct = Math.min(100, Math.floor((cameraX / lv.length) * 100));
  document.getElementById('playFill').style.width = pct + '%';
  document.getElementById('playPct').textContent = pct + '%';

  if(cameraX >= lv.length) {
    player.won = true;
    spawnParticles(player.x + 13, player.y + 13, '#7cff00', 35, 1.6);
    playSfx(880, 0.35, 'triangle');
    setTimeout(() => openSelect(), 1600);
  }
}

function drawBackground() {
  const lv = LEVELS[curLvl];
  const topCol = screen === 'MENU' ? '#0033cc' : lv.bgTop;
  const botCol = screen === 'MENU' ? '#001a66' : lv.bgBot;
  const flrCol = screen === 'MENU' ? '#001155' : lv.floor;

  const grad = ctx.createLinearGradient(0, 0, 0, FLOOR_Y);
  grad.addColorStop(0, topCol);
  grad.addColorStop(1, botCol);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, FLOOR_Y);

  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = 2;
  const sz = 64;
  for(let x = -bgOffset; x < W; x += sz) {
    for(let y = 10; y < FLOOR_Y; y += sz) {
      ctx.strokeRect(x, y, sz - 6, sz - 6);
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      ctx.fillRect(x, y, sz - 6, sz - 6);
    }
  }

  ctx.fillStyle = flrCol;
  ctx.fillRect(0, FLOOR_Y, W, H - FLOOR_Y);

  const flrOff = (screen === 'PLAY' ? cameraX : bgOffset * 2) % 44;
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  for(let x = -flrOff; x < W; x += 44) {
    ctx.strokeRect(x, FLOOR_Y, 44, H - FLOOR_Y);
  }

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#00ffff';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.moveTo(0, FLOOR_Y);
  ctx.lineTo(W, FLOOR_Y);
  ctx.stroke();
  ctx.shadowBlur = 0;

  if(screen === 'SELECT') {
    const blocks = [[0,FLOOR_Y-18],[0,FLOOR_Y-36],[18,FLOOR_Y-18],[W-18,FLOOR_Y-18],[W-18,FLOOR_Y-36],[W-36,FLOOR_Y-18]];
    blocks.forEach(b => {
      ctx.fillStyle = '#55ff00';
      ctx.fillRect(b[0], b[1], 18, 18);
      ctx.strokeStyle = '#000';
      ctx.strokeRect(b[0], b[1], 18, 18);
    });
  }
}

function drawPlayerCube(x, y, size, rot) {
  const s = SKINS[skinIdx];
  ctx.save();
  ctx.translate(x + size / 2, y + size / 2);
  ctx.rotate(rot);

  const g = ctx.createLinearGradient(0, -size/2, 0, size/2);
  g.addColorStop(0, s.top);
  g.addColorStop(1, s.bot);
  ctx.fillStyle = g;
  ctx.fillRect(-size/2, -size/2, size, size);

  ctx.lineWidth = 2.2;
  ctx.strokeStyle = '#000000';
  ctx.strokeRect(-size/2, -size/2, size, size);

  ctx.fillStyle = '#000000';
  ctx.beginPath();
  ctx.arc(-5, 2, 3.3, 0, Math.PI * 2);
  ctx.arc(5, 2, 3.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(-5.6, 1.3, 1.2, 0, Math.PI * 2);
  ctx.arc(4.4, 1.3, 1.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(0, 3.5, 2.2, Math.PI, 0, false);
  ctx.stroke();

  ctx.restore();
}

function drawWorld() {
  if(screen === 'MENU') {
    drawPlayerCube(265, player.y, player.size, player.rot);
    return;
  }
  if(screen !== 'PLAY') return;

  const lv = LEVELS[curLvl];

  const attX = 35 - cameraX * 0.85;
  if(attX > -240) {
    ctx.save();
    ctx.font = '900 22px "Arial Black", Impact, sans-serif';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#000000';
    ctx.fillStyle = '#ffffff';
    ctx.strokeText('ATTEMPT  ' + attempt, attX, 74);
    ctx.fillText('ATTEMPT  ' + attempt, attX, 74);
    ctx.restore();
  }

  for(let i=0;i<lv.map.length;i++){
    const obj = lv.map[i];
    const sx = obj.x - cameraX + player.x;
    if(sx < -50 || sx > W + 50) continue;

    if(obj.t === 's') {
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(sx, FLOOR_Y);
      ctx.lineTo(sx + 14, FLOOR_Y - 28);
      ctx.lineTo(sx + 28, FLOOR_Y);
      ctx.closePath();
      ctx.fillStyle = '#05050a';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.shadowColor = '#00e5ff';
      ctx.shadowBlur = 6;
      ctx.stroke();
      ctx.restore();
    } else if(obj.t === 'b') {
      const by = FLOOR_Y - ((obj.y || 0) + 1) * 30;
      ctx.save();
      ctx.fillStyle = '#070b19';
      ctx.fillRect(sx, by, 30, 30);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#00e5ff';
      ctx.strokeRect(sx, by, 30, 30);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.strokeRect(sx + 5, by + 5, 20, 20);
      ctx.restore();
    } else if(obj.t === 'p') {
      const pyPad = FLOOR_Y - (obj.y || 0) * 30 - 6;
      ctx.save();
      ctx.fillStyle = '#ffe600';
      ctx.shadowColor = '#ffe600';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(sx + 14, pyPad + 6, 12, Math.PI, 0, false);
      ctx.fill();
      ctx.restore();
    }
  }

  for(let i=particles.length-1;i>=0;i--){
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.life -= 0.035;
    if(p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }
    ctx.fillStyle = p.color;
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillRect(p.x, p.y, p.size, p.size);
    ctx.globalAlpha = 1;
  }

  if(!player.dead) {
    drawPlayerCube(player.x, player.y, player.size, player.rot);
  }

  if(player.won) {
    ctx.save();
    ctx.font = '900 26px "Arial Black", Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#000';
    ctx.fillStyle = '#7cff00';
    ctx.strokeText('LEVEL COMPLETE!', W / 2, H / 2);
    ctx.fillText('LEVEL COMPLETE!', W / 2, H / 2);
    ctx.restore();
  }
}

function loop() {
  updatePhysics();
  drawBackground();
  drawWorld();
  requestAnimationFrame(loop);
}

const rootEl = document.getElementById('gd-root');
rootEl.addEventListener('pointerdown', (e) => {
  if(screen === 'PLAY' && !e.target.classList.contains('interactive')) {
    pointerHeld = true;
    if(player.onGround && !player.dead) triggerJump(-9.6);
  }
});
window.addEventListener('pointerup', () => { pointerHeld = false; });
window.addEventListener('keydown', (e) => {
  if((e.code === 'Space' || e.code === 'ArrowUp') && screen === 'PLAY') {
    pointerHeld = true;
    if(player.onGround && !player.dead) triggerJump(-9.6);
  }
});
window.addEventListener('keyup', () => { pointerHeld = false; });

initDots();
loop();
</script>`;

  return {
    view_model: {
      __typename: "GenAISingleLayoutViewModel",
      primitive: {
        __typename: "FOAHtmlPrimitiveDemoDONOTUSE",
        trusted_sources: [],
        payload: htmlContent,
      },
    },
  };
};

export default {
  name: ["geometrydash", "gd", "geometry"],
  category: "group",
  description: "Abre el videojuego interactivo Geometry Dash con menú oficial, selector de niveles, sonido y físicas reales.",
  async run(ctx: CommandContext) {
    const { reply, react, sock, from, msg } = ctx;

    await react("🟦").catch(() => undefined);

    try {
      const { AIRich } = await import("baileys/lib/Builders/ai-rich.js");

      const rich = new AIRich(sock)
        .setTitle("🟦 Geometry Dash // LuferOS")
        .setFooter("Toca la pantalla para saltar obstáculos al ritmo de la música");

      rich.addSection(buildGeometryDashPayload());

      await rich.send(from, { quoted: msg });
    } catch {
      await react("❌").catch(() => undefined);
      await reply(
        t("cmd_value0_value1_no_se_pudo_carga_608c226d", {
          value0: fytBold(t("cmd_aura_reed_95dcfb15")),
          value1: fytBold(t("cmd_error_de_renderizado_eb73af7e")),
          value2: fytBold(t("cmd_system_29d43743")),
        }),
      ).catch(() => undefined);
    }
  },
};
