import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";

const buildGeometryDashPayload = () => {
  const htmlContent = `<style>
*{box-sizing:border-box;margin:0;padding:0;user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent;font-family:'Arial Black',Impact,system-ui,sans-serif}
html,body{width:100%;background:#000;color:#fff;overflow:hidden;display:flex;justify-content:center;align-items:center}
#gd-root{position:relative;width:100%;max-width:420px;height:256px;background:#0022aa;overflow:hidden;border:2px solid #1e293b;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.95);touch-action:none}
canvas{position:absolute;top:0;left:0;width:100%;height:100%;display:block;z-index:1}
.layer{position:absolute;inset:0;z-index:10;display:none;flex-direction:column;justify-content:space-between;pointer-events:none}
.layer.active{display:flex}
.ui-btn{pointer-events:auto;cursor:pointer;transition:transform 0.07s ease,filter 0.07s ease}
.ui-btn:active{transform:scale(0.91);filter:brightness(1.15)}
.stroke{color:#fff;text-shadow:-1.5px -1.5px 0 #000,1.5px -1.5px 0 #000,-1.5px 1.5px 0 #000,1.5px 1.5px 0 #000,0 2.5px 0 #000}
.menu-top{padding-top:10px;text-align:center;position:relative}
.gd-logo{font-size:21px;font-weight:900;letter-spacing:1px;color:#7cff00;text-shadow:-2px -2px 0 #000,2px -2px 0 #000,-2px 2px 0 #000,2px 2px 0 #000,0 3.5px 0 #000,0 0 10px rgba(124,255,0,0.45)}
.daily-box{position:absolute;right:8px;top:36px;display:flex;flex-direction:column;align-items:center;z-index:12}
.daily-box span{font-size:8.5px;color:#ffd700;margin-top:-3px}
.menu-mid{display:flex;justify-content:center;align-items:center;gap:14px;margin-top:-12px}
.gd-frame{position:relative;background:linear-gradient(180deg,#9dff00 0%,#4cbb00 100%);border:2.5px solid #000;box-shadow:inset 0 2.5px 0 rgba(255,255,255,0.65),0 3px 0 #000;border-radius:7px;display:flex;justify-content:center;align-items:center}
.gd-frame::before{content:'';position:absolute;inset:-5px;background:linear-gradient(180deg,#00ffff,#0088bb);z-index:-1;border:2.5px solid #000;border-radius:9px}
.b-sm{width:44px;height:44px}
.b-lg{width:64px;height:64px}
.play-icon{width:0;height:0;border-top:16px solid transparent;border-bottom:16px solid transparent;border-left:26px solid #ffcc00;filter:drop-shadow(0 2px 0 #000);margin-left:5px}
.prof-box{position:absolute;left:8px;bottom:48px;display:flex;flex-direction:column;align-items:flex-start;z-index:12}
.prof-user{font-size:9.5px;color:#ffd700;margin-bottom:2px;letter-spacing:0.4px}
.prof-line{display:flex;align-items:center;gap:4px}
.prof-ava{width:28px;height:28px;border-radius:50%;background:radial-gradient(circle,#00e5ff,#0044aa);border:2px solid #fff;box-shadow:0 0 0 1.5px #000;display:flex;justify-content:center;align-items:center;font-size:13px}
.prof-lbl{font-size:8.5px;color:#fff;font-family:'Comic Sans MS',cursive,sans-serif;text-shadow:1px 1px 0 #000}
.menu-bot{display:flex;justify-content:space-between;align-items:flex-end;padding:5px 7px;width:100%}
.soc-wrap{display:flex;flex-direction:column;gap:2px}
.soc-line{display:flex;gap:2.5px;align-items:center}
.s-ico{width:15px;height:15px;border-radius:3.5px;border:1.2px solid #000;display:flex;justify-content:center;align-items:center;font-size:8.5px;font-weight:900;color:#fff}
.rob-tag{background:linear-gradient(180deg,#ffcc00,#ff7700);border:1.5px solid #000;border-radius:4px;padding:0.5px 4px;font-size:8.5px;color:#000;font-weight:900}
.bot-circles{display:flex;gap:5px}
.c-ico{width:27px;height:27px;border-radius:50%;background:linear-gradient(180deg,#88ff00,#228800);border:1.8px solid #fff;box-shadow:0 0 0 1.5px #000,inset 0 1.5px 0 rgba(255,255,255,0.6);display:flex;justify-content:center;align-items:center;font-size:12px}
.more-btn{background:linear-gradient(180deg,#88ff00,#2d9900);border:2px solid #000;border-radius:5px;padding:2px 4px;font-size:8px;line-height:1.05;text-align:center;color:#ffd700;box-shadow:inset 0 1.5px 0 rgba(255,255,255,0.5)}
.sel-head{display:flex;justify-content:space-between;align-items:flex-start;padding:6px 8px;width:100%}
.arr-back{width:0;height:0;border-top:11px solid transparent;border-bottom:11px solid transparent;border-right:18px solid #55ff00;filter:drop-shadow(0 0 2px #000)}
.top- Molding{width:130px;height:16px;background:linear-gradient(180deg,#77ff00,#339900);border:2px solid #000;border-top:none;border-radius:0 0 6px 6px;display:flex;justify-content:center;align-items:center}
.top-Molding span{width:26px;height:19px;background:linear-gradient(180deg,#00ffff,#0088bb);border:2px solid #000;display:block}
.info-btn{width:21px;height:21px;border-radius:50%;background:linear-gradient(180deg,#00e5ff,#0066bb);border:1.8px solid #000;display:flex;justify-content:center;align-items:center;font-size:11px;color:#fff}
.sel-body{display:flex;justify-content:space-between;align-items:center;padding:0 6px;width:100%;gap:4px}
.nav-tri{width:22px;height:36px;display:flex;justify-content:center;align-items:center;font-size:24px;color:#fff;text-shadow:-2px -2px 0 #000,2px -2px 0 #000,-2px 2px 0 #000,2px 2px 0 #000;flex-shrink:0}
.lvl-box{flex:1;min-width:0;background:rgba(0,0,0,0.48);border:2px solid rgba(0,0,0,0.75);border-radius:9px;padding:8px 10px;position:relative;box-shadow:inset 0 0 12px rgba(0,0,0,0.65)}
.star-badge{position:absolute;top:4px;right:8px;font-size:10.5px;display:flex;align-items:center;gap:2px}
.lvl-center{display:flex;align-items:center;justify-content:center;gap:8px;margin:6px 0 10px}
.face-ico{width:28px;height:28px;border-radius:50%;border:2px solid #000;display:flex;flex-direction:column;justify-content:center;align-items:center;position:relative;flex-shrink:0;box-shadow:inset 0 2px 3px rgba(255,255,255,0.55)}
.f-eyes{display:flex;gap:6px;margin-top:1px}
.f-eyes i{width:4.5px;height:4.5px;background:#000;border-radius:50%;display:block}
.f-mouth{width:12px;height:6px;background:#000;border-radius:0 0 8px 8px;margin-top:2px;position:relative;overflow:hidden}
.f-mouth::after{content:'';position:absolute;bottom:0;left:2px;width:8px;height:3.5px;background:#ff3355;border-radius:50%}
.lvl-name{font-size:14px;letter-spacing:0.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lvl-foot{display:flex;justify-content:space-between;align-items:center;font-size:10px}
.orb-count{display:flex;align-items:center;gap:3px}
.coin-list{display:flex;gap:3px}
.c-star{width:14px;height:14px;border-radius:50%;background:radial-gradient(circle,#ffe600,#bb7700);border:1.5px solid #000;display:flex;justify-content:center;align-items:center;font-size:8px;color:#fff}
.sel-bars{display:flex;flex-direction:column;align-items:center;gap:3px;width:100%;padding:0 16px}
.b-title{font-size:9.5px;letter-spacing:0.4px}
.p-track{width:100%;max-width:230px;height:15px;background:rgba(0,0,0,0.68);border:1.8px solid #000;border-radius:8px;overflow:hidden;position:relative;display:flex;align-items:center;justify-content:center}
.p-bar{position:absolute;top:0;left:0;height:100%;width:100%;border-radius:6px;transition:width 0.2s}
.p-bar.n-col{background:linear-gradient(180deg,#55ff00,#119900)}
.p-bar.p-col{background:linear-gradient(180deg,#00ffff,#0088bb)}
.p-txt{position:relative;z-index:2;font-size:9.5px}
.sel-foot{display:flex;flex-direction:column;align-items:center;padding-bottom:5px;gap:3px}
.dl-ost{font-size:8.5px;letter-spacing:0.4px}
.dots-wrap{display:flex;gap:4px}
.d-item{width:5.5px;height:5.5px;border-radius:50%;background:rgba(255,255,255,0.35)}
.d-item.active{background:#fff;transform:scale(1.25)}
.hud-bar-top{display:flex;justify-content:center;align-items:center;padding:6px 10px;position:relative;width:100%}
.hud-left-tools{position:absolute;left:7px;top:5px;display:flex;gap:5px}
.hud-ico{width:24px;height:24px;border-radius:50%;background:rgba(0,0,0,0.45);border:1.5px solid rgba(255,255,255,0.75);display:flex;justify-content:center;align-items:center;font-size:10.5px;color:#fff}
.hud-ico.on{background:rgba(0,229,255,0.4);border-color:#00ffff}
.hud-prog-box{display:flex;align-items:center;gap:5px}
.hud-track{width:135px;height:9px;background:rgba(0,0,0,0.65);border:1.5px solid #fff;border-radius:5px;overflow:hidden}
.hud-fill{height:100%;width:0%;background:linear-gradient(90deg,#00ff44,#aaff00)}
.hud-pct-txt{font-size:10.5px}
.hud-pause-btn{position:absolute;right:7px;top:5px;width:24px;height:24px;border-radius:50%;background:rgba(0,0,0,0.45);border:1.5px solid rgba(255,255,255,0.75);display:flex;justify-content:center;align-items:center;font-size:10px;color:#fff}
.prac-controls{position:absolute;bottom:6px;left:50%;transform:translateX(-50%);display:none;gap:12px;z-index:15}
.prac-controls.show{display:flex}
.prac-btn{background:rgba(0,0,0,0.65);border:1.8px solid #00ffff;color:#fff;border-radius:6px;padding:3px 9px;font-size:10px;display:flex;align-items:center;gap:4px}
</style>
<div id="gd-root">
  <canvas id="gdCanvas" width="360" height="256"></canvas>

  <div id="scrMenu" class="layer active">
    <div class="menu-top">
      <div class="gd-logo">GEOMETRY DASH</div>
      <div class="daily-box ui-btn" onclick="openSelect()">
        <span style="font-size:21px;filter:drop-shadow(0 2px 0 #000)">🧰</span>
        <span class="stroke">DAILY</span>
      </div>
    </div>

    <div class="menu-mid">
      <div class="gd-frame b-sm ui-btn" onclick="cycleSkin()">
        <div id="skinBox" style="width:24px;height:24px;background:linear-gradient(180deg,#00aaff,#ff2200);border:2px solid #000;display:flex;justify-content:space-around;align-items:center;padding:2px">
          <i style="width:4px;height:4px;background:#000;border-radius:50%;border:1px solid #fff"></i>
          <i style="width:4px;height:4px;background:#000;border-radius:50%;border:1px solid #fff"></i>
        </div>
      </div>
      <div class="gd-frame b-lg ui-btn" onclick="openSelect()">
        <div class="play-icon"></div>
      </div>
      <div class="gd-frame b-sm ui-btn" onclick="openSelect()">
        <span style="font-size:20px;filter:drop-shadow(0 2px 0 #000)">🛠️</span>
      </div>
    </div>

    <div class="prof-box ui-btn" onclick="cycleSkin()">
      <div class="prof-user stroke">LUFERALAI</div>
      <div class="prof-line">
        <div class="prof-ava">👤</div>
        <div class="prof-lbl">← View Profile</div>
      </div>
    </div>

    <div class="menu-bot">
      <div class="soc-wrap">
        <div class="soc-line">
          <div class="s-ico" style="background:#1877f2">f</div>
          <div class="s-ico" style="background:#1da1f2">𝕏</div>
          <div class="s-ico" style="background:#ff0000">▶</div>
          <div class="s-ico" style="background:#9146ff">👾</div>
        </div>
        <div class="soc-line">
          <div class="rob-tag">ROBTOP</div>
          <div class="s-ico" style="background:#5865f2">🎮</div>
        </div>
      </div>
      <div class="bot-circles">
        <div class="c-ico ui-btn" onclick="openSelect()">🏆</div>
        <div class="c-ico ui-btn" onclick="toggleHitboxDebug()">🎯</div>
        <div class="c-ico ui-btn" onclick="openSelect()">📊</div>
        <div class="c-ico ui-btn" onclick="toggleAudio()">🎵</div>
      </div>
      <div class="more-btn stroke ui-btn" onclick="openSelect()">MORE<br>GAMES</div>
    </div>
  </div>

  <div id="scrSelect" class="layer">
    <div class="sel-head">
      <div class="arr-back ui-btn" onclick="openMenu()"></div>
      <div class="top-Molding"><span></span></div>
      <div class="info-btn stroke ui-btn" onclick="startLevel(false)">i</div>
    </div>

    <div class="sel-body">
      <div class="nav-tri ui-btn" onclick="changeLevel(-1)">◀</div>
      <div class="lvl-box ui-btn" onclick="startLevel(false)">
        <div class="star-badge stroke"><span id="lvStars">1</span> ⭐</div>
        <div class="lvl-center">
          <div class="face-ico" id="lvFace">
            <div class="f-eyes"><i></i><i></i></div>
            <div class="f-mouth"></div>
          </div>
          <div class="lvl-name stroke" id="lvName">STEREO MADNESS</div>
        </div>
        <div class="lvl-foot">
          <div class="orb-count stroke"><span id="lvOrbs">50/50</span> <span style="color:#00ffff">🫧</span></div>
          <div class="coin-list">
            <div class="c-star">★</div>
            <div class="c-star">★</div>
            <div class="c-star">★</div>
          </div>
        </div>
      </div>
      <div class="nav-tri ui-btn" onclick="changeLevel(1)">▶</div>
    </div>

    <div class="sel-bars">
      <div class="b-title stroke">NORMAL MODE</div>
      <div class="p-track ui-btn" onclick="startLevel(false)">
        <div class="p-bar n-col" id="normFill"></div>
        <span class="p-txt stroke" id="normTxt">100%</span>
      </div>
      <div class="b-title stroke">PRACTICE MODE</div>
      <div class="p-track ui-btn" onclick="startLevel(true)">
        <div class="p-bar p-col" id="pracFill"></div>
        <span class="p-txt stroke" id="pracTxt">100%</span>
      </div>
    </div>

    <div class="sel-foot">
      <div class="dl-ost stroke ui-btn" onclick="toggleAudio()">DOWNLOAD THE SOUNDTRACK</div>
      <div class="dots-wrap" id="lvlDots"></div>
    </div>
  </div>

  <div id="scrPlay" class="layer">
    <div class="hud-bar-top">
      <div class="hud-left-tools">
        <div class="hud-ico ui-btn" id="btnMute" onclick="toggleAudio()">🔊</div>
        <div class="hud-ico ui-btn" id="btnHb" onclick="toggleHitboxDebug()" title="Ver Hitboxes">🎯</div>
      </div>
      <div class="hud-prog-box">
        <div class="hud-track"><div class="hud-fill" id="playFill"></div></div>
        <div class="hud-pct-txt stroke" id="playPct">0%</div>
      </div>
      <div class="hud-pause-btn ui-btn" onclick="openSelect()">||</div>
    </div>
    <div class="prac-controls" id="pracHud">
      <div class="prac-btn ui-btn stroke" onclick="placeManualCheckpoint()">💎 +Checkpoint</div>
      <div class="prac-btn ui-btn stroke" onclick="removeLastCheckpoint()">🗑️ -Borrar</div>
    </div>
  </div>
</div>

<script>
const canvas = document.getElementById('gdCanvas');
const ctx = canvas.getContext('2d');
const W = 360, H = 256, FLOOR_Y = 204, CEIL_Y = 38, PLAYER_X = 68;

const LEVELS = [
  {
    name: 'STEREO MADNESS',
    stars: 1,
    orbs: '50/50',
    faceCol: 'radial-gradient(circle at 35% 35%,#00e5ff,#0055cc)',
    bgTop: '#0033cc',
    bgBot: '#001566',
    floor: '#000d44',
    speed: 3.9,
    bpm: 160,
    notes: [261.6,293.6,329.6,392.0,329.6,293.6,261.6,196.0,220.0,261.6,293.6,349.2,329.6,293.6,261.6,246.9],
    bestNorm: 100,
    bestPrac: 100,
    length: 3450,
    map: [
      {x:380,t:'s'},
      {x:590,t:'s'},{x:614,t:'s'},
      {x:830,t:'b',y:0},{x:856,t:'b',y:0},{x:882,t:'b',y:0},
      {x:985,t:'b',y:1},{x:1011,t:'b',y:1},{x:1037,t:'b',y:1},
      {x:1140,t:'b',y:2},{x:1166,t:'b',y:2},{x:1192,t:'b',y:2},
      {x:1330,t:'p'},{x:1430,t:'s'},{x:1454,t:'s'},{x:1478,t:'s'},
      {x:1670,t:'b',y:0},{x:1696,t:'b',y:0},{x:1745,t:'o',y:1.5},{x:1735,t:'s'},{x:1759,t:'s'},{x:1783,t:'s'},
      {x:1960,t:'ship'},
      {x:2120,t:'b',y:0},{x:2146,t:'b',y:0},{x:2172,t:'b',y:0},
      {x:2320,t:'b',y:4},{x:2346,t:'b',y:4},{x:2372,t:'b',y:4},
      {x:2520,t:'b',y:1},{x:2546,t:'b',y:1},{x:2680,t:'b',y:3.5},{x:2706,t:'b',y:3.5},
      {x:2860,t:'cube'},
      {x:3030,t:'p'},{x:3125,t:'s'},{x:3149,t:'s'},{x:3290,t:'s'}
    ]
  },
  {
    name: 'BACK ON TRACK',
    stars: 2,
    orbs: '75/75',
    faceCol: 'radial-gradient(circle at 35% 35%,#00e5ff,#0055cc)',
    bgTop: '#d400a8',
    bgBot: '#61004d',
    floor: '#420034',
    speed: 4.15,
    bpm: 170,
    notes: [329.6,392.0,440.0,493.8,440.0,392.0,329.6,293.6,349.2,440.0,523.2,493.8,440.0,392.0,349.2,329.6],
    bestNorm: 100,
    bestPrac: 100,
    length: 3550,
    map: [
      {x:360,t:'p'},
      {x:475,t:'b',y:2},{x:501,t:'b',y:2},{x:527,t:'b',y:2},{x:553,t:'b',y:2},
      {x:730,t:'s'},{x:754,t:'s'},
      {x:940,t:'p'},{x:1035,t:'s'},{x:1059,t:'s'},{x:1083,t:'s'},
      {x:1260,t:'b',y:0},{x:1286,t:'b',y:0},
      {x:1390,t:'b',y:1},{x:1416,t:'b',y:1},
      {x:1520,t:'b',y:2},{x:1546,t:'p',y:3},
      {x:1665,t:'b',y:4},{x:1691,t:'b',y:4},{x:1717,t:'b',y:4},
      {x:1920,t:'o',y:1.3},{x:1900,t:'s'},{x:1924,t:'s'},{x:1948,t:'s'},
      {x:2140,t:'ship'},
      {x:2300,t:'b',y:0},{x:2326,t:'b',y:1},{x:2500,t:'b',y:4},{x:2526,t:'b',y:3},
      {x:2740,t:'cube'},
      {x:2920,t:'p'},{x:3015,t:'s'},{x:3039,t:'s'},{x:3063,t:'s'},
      {x:3270,t:'s'},{x:3294,t:'s'}
    ]
  },
  {
    name: 'POLARGEIST',
    stars: 3,
    orbs: '100/100',
    faceCol: 'radial-gradient(circle at 35% 35%,#55ff00,#008800)',
    bgTop: '#009977',
    bgBot: '#00382b',
    floor: '#00221a',
    speed: 4.3,
    bpm: 178,
    notes: [293.6,349.2,440.0,587.3,523.2,440.0,349.2,329.6,261.6,329.6,392.0,523.2,493.8,392.0,329.6,293.6],
    bestNorm: 100,
    bestPrac: 100,
    length: 3650,
    map: [
      {x:370,t:'s'},{x:394,t:'s'},
      {x:580,t:'o',y:1.3},{x:560,t:'s'},{x:584,t:'s'},{x:608,t:'s'},
      {x:770,t:'o',y:1.5},{x:865,t:'b',y:2},{x:891,t:'b',y:2},{x:917,t:'b',y:2},
      {x:1120,t:'s'},{x:1144,t:'s'},
      {x:1320,t:'b',y:0},{x:1346,t:'p',y:1},
      {x:1465,t:'b',y:3},{x:1491,t:'b',y:3},{x:1517,t:'b',y:3},
      {x:1720,t:'o',y:1.2},{x:1810,t:'o',y:2.2},{x:1750,t:'s'},{x:1774,t:'s'},{x:1798,t:'s'},{x:1822,t:'s'},
      {x:2040,t:'ship'},
      {x:2200,t:'b',y:0},{x:2226,t:'b',y:0},{x:2200,t:'b',y:4.5},{x:2226,t:'b',y:4.5},
      {x:2440,t:'b',y:1.5},{x:2466,t:'b',y:1.5},{x:2660,t:'b',y:3.5},{x:2686,t:'b',y:3.5},
      {x:2880,t:'cube'},
      {x:3050,t:'p'},{x:3145,t:'s'},{x:3169,t:'s'},{x:3360,t:'s'},{x:3384,t:'s'}
    ]
  },
  {
    name: 'DRY OUT',
    stars: 4,
    orbs: '125/125',
    faceCol: 'radial-gradient(circle at 35% 35%,#55ff00,#008800)',
    bgTop: '#cc2200',
    bgBot: '#4d0900',
    floor: '#330600',
    speed: 4.45,
    bpm: 184,
    notes: [220.0,261.6,329.6,440.0,392.0,329.6,261.6,246.9,196.0,246.9,293.6,392.0,349.2,293.6,246.9,220.0],
    bestNorm: 100,
    bestPrac: 100,
    length: 3650,
    map: [
      {x:380,t:'b',y:0},{x:406,t:'b',y:0},{x:510,t:'b',y:1},{x:536,t:'b',y:1},{x:640,t:'b',y:2},{x:666,t:'b',y:2},
      {x:850,t:'o',y:1.4},{x:830,t:'s'},{x:854,t:'s'},{x:878,t:'s'},
      {x:1060,t:'p'},{x:1155,t:'s'},{x:1179,t:'s'},{x:1203,t:'s'},
      {x:1400,t:'b',y:0},{x:1426,t:'b',y:0},{x:1495,t:'o',y:1.8},{x:1600,t:'b',y:2},{x:1626,t:'b',y:2},
      {x:1840,t:'ship'},
      {x:2020,t:'b',y:0},{x:2046,t:'b',y:1},{x:2240,t:'b',y:4.2},{x:2266,t:'b',y:3.2},
      {x:2480,t:'b',y:1},{x:2506,t:'b',y:1},{x:2720,t:'cube'},
      {x:2900,t:'o',y:1.4},{x:2880,t:'s'},{x:2904,t:'s'},
      {x:3120,t:'p'},{x:3215,t:'s'},{x:3239,t:'s'},{x:3390,t:'s'}
    ]
  },
  {
    name: 'CANNOT LET GO',
    stars: 6,
    orbs: '175/175',
    faceCol: 'radial-gradient(circle at 35% 35%,#ffe600,#cc7700)',
    bgTop: '#7700cc',
    bgBot: '#29004d',
    floor: '#1a0033',
    speed: 4.6,
    bpm: 190,
    notes: [329.6,369.9,440.0,554.3,493.8,440.0,369.9,329.6,293.6,369.9,440.0,587.3,554.3,493.8,440.0,369.9],
    bestNorm: 100,
    bestPrac: 100,
    length: 3750,
    map: [
      {x:360,t:'s'},{x:384,t:'s'},
      {x:550,t:'b',y:0},{x:576,t:'b',y:0},{x:680,t:'b',y:1},{x:706,t:'b',y:1},{x:810,t:'b',y:2},{x:836,t:'p',y:3},
      {x:970,t:'b',y:4},{x:996,t:'b',y:4},{x:1022,t:'b',y:4},
      {x:1240,t:'o',y:1.3},{x:1330,t:'o',y:2.1},{x:1220,t:'s'},{x:1244,t:'s'},{x:1268,t:'s'},{x:1292,t:'s'},{x:1316,t:'s'},
      {x:1540,t:'s'},{x:1564,t:'s'},
      {x:1760,t:'ship'},
      {x:1940,t:'b',y:0},{x:1966,t:'b',y:0},{x:1940,t:'b',y:4.2},{x:1966,t:'b',y:4.2},
      {x:2180,t:'b',y:1.2},{x:2206,t:'b',y:1.2},{x:2400,t:'b',y:3.2},{x:2426,t:'b',y:3.2},
      {x:2640,t:'cube'},
      {x:2820,t:'p'},{x:2915,t:'s'},{x:2939,t:'s'},{x:2963,t:'s'},
      {x:3160,t:'o',y:1.4},{x:3140,t:'s'},{x:3164,t:'s'},{x:3420,t:'s'},{x:3444,t:'s'}
    ]
  },
  {
    name: 'CLUBSTEP',
    stars: 14,
    orbs: '500/500',
    faceCol: 'radial-gradient(circle at 35% 35%,#ff1133,#660011)',
    bgTop: '#1a0033',
    bgBot: '#05000d',
    floor: '#000000',
    speed: 4.75,
    bpm: 198,
    notes: [196.0,233.0,293.6,392.0,370.0,293.6,233.0,196.0,207.6,246.9,311.1,415.3,392.0,311.1,246.9,196.0],
    bestNorm: 100,
    bestPrac: 100,
    length: 3850,
    map: [
      {x:360,t:'s'},{x:384,t:'s'},
      {x:550,t:'o',y:1.3},{x:645,t:'o',y:2.2},{x:535,t:'s'},{x:559,t:'s'},{x:583,t:'s'},{x:607,t:'s'},{x:631,t:'s'},
      {x:770,t:'b',y:2},{x:796,t:'b',y:2},{x:900,t:'b',y:3},{x:926,t:'p',y:4},
      {x:1150,t:'s'},{x:1174,t:'s'},
      {x:1350,t:'b',y:0},{x:1376,t:'b',y:0},{x:1480,t:'b',y:1},{x:1506,t:'b',y:1},
      {x:1610,t:'o',y:2.2},{x:1720,t:'b',y:2.5},{x:1746,t:'b',y:2.5},
      {x:1940,t:'ship'},
      {x:2100,t:'b',y:0.5},{x:2126,t:'b',y:0.5},{x:2100,t:'b',y:4.2},{x:2126,t:'b',y:4.2},
      {x:2320,t:'b',y:1.5},{x:2346,t:'b',y:1.5},{x:2520,t:'b',y:3.2},{x:2546,t:'b',y:3.2},
      {x:2740,t:'cube'},
      {x:2920,t:'p'},{x:3015,t:'s'},{x:3039,t:'s'},{x:3063,t:'s'},
      {x:3260,t:'o',y:1.4},{x:3240,t:'s'},{x:3264,t:'s'},{x:3510,t:'s'},{x:3534,t:'s'}
    ]
  }
];

const SKINS = [
  {top:'#00aaff',bot:'#ff2200',eye:'#ffffff'},
  {top:'#7cff00',bot:'#00e5ff',eye:'#ffffff'},
  {top:'#ffcc00',bot:'#9900ff',eye:'#00ffff'},
  {top:'#ff0055',bot:'#00ffcc',eye:'#ffff00'},
  {top:'#ffffff',bot:'#222222',eye:'#ff0044'}
];

let screen = 'MENU';
let curLvl = 0;
let skinIdx = 0;
let attempt = 1;
let cameraX = 0;
let bgOffset = 0;
let pointerHeld = false;
let jumpBufferFrames = 0;
let coyoteFrames = 0;
let practiceMode = false;
let showHitboxes = false;
let audioEnabled = true;
let audioCtx = null;
let noteTimer = null;
let noteStep = 0;
let lastFrameTime = performance.now();

let checkpoints = [];
let lastAutoCpX = 0;

let player = {
  y: FLOOR_Y - 24,
  prevY: FLOOR_Y - 24,
  size: 24,
  vy: 0,
  rot: 0,
  mode: 'CUBE',
  onGround: true,
  dead: false,
  won: false
};

let particles = [];
let shockwaves = [];
let usedOrbs = new Set();

function renderDots() {
  const wrap = document.getElementById('lvlDots');
  wrap.innerHTML = '';
  for(let i=0;i<LEVELS.length;i++){
    const d = document.createElement('div');
    d.className = 'd-item' + (i === curLvl ? ' active' : '');
    wrap.appendChild(d);
  }
}

function updateSelectUI() {
  const lv = LEVELS[curLvl];
  document.getElementById('lvName').textContent = lv.name;
  document.getElementById('lvStars').textContent = lv.stars;
  document.getElementById('lvOrbs').textContent = lv.orbs;
  document.getElementById('lvFace').style.background = lv.faceCol;
  document.getElementById('normFill').style.width = lv.bestNorm + '%';
  document.getElementById('normTxt').textContent = lv.bestNorm + '%';
  document.getElementById('pracFill').style.width = lv.bestPrac + '%';
  document.getElementById('pracTxt').textContent = lv.bestPrac + '%';
  renderDots();
}

function cycleSkin() {
  skinIdx = (skinIdx + 1) % SKINS.length;
  const s = SKINS[skinIdx];
  document.getElementById('skinBox').style.background = 'linear-gradient(180deg,' + s.top + ',' + s.bot + ')';
  playTone(540, 0.06, 'square');
}

function toggleHitboxDebug() {
  showHitboxes = !showHitboxes;
  const btn = document.getElementById('btnHb');
  if(btn) btn.classList.toggle('on', showHitboxes);
  playTone(660, 0.05, 'sine');
}

function setLayer(id) {
  document.querySelectorAll('.layer').forEach(el => el.classList.remove('active'));
  if(id) document.getElementById(id).classList.add('active');
}

function openMenu() {
  screen = 'MENU';
  stopMusic();
  setLayer('scrMenu');
}

function openSelect() {
  screen = 'SELECT';
  stopMusic();
  updateSelectUI();
  setLayer('scrSelect');
  playTone(440, 0.05, 'sine');
}

function changeLevel(dir) {
  curLvl = (curLvl + dir + LEVELS.length) % LEVELS.length;
  updateSelectUI();
  playTone(580, 0.05, 'triangle');
}

function startLevel(isPrac) {
  practiceMode = !!isPrac;
  screen = 'PLAY';
  attempt = 1;
  checkpoints = [];
  lastAutoCpX = 0;
  document.getElementById('pracHud').classList.toggle('show', practiceMode);
  resetAttempt();
  setLayer('scrPlay');
  startMusic();
}

function placeManualCheckpoint() {
  if(!practiceMode || screen !== 'PLAY' || player.dead) return;
  checkpoints.push({
    cameraX: cameraX,
    y: player.y,
    vy: player.vy,
    rot: player.rot,
    mode: player.mode
  });
  lastAutoCpX = cameraX;
  spawnShockwave(PLAYER_X + 12, player.y + 12, '#00ff66');
  playTone(740, 0.07, 'sine');
}

function removeLastCheckpoint() {
  if(!practiceMode || checkpoints.length === 0) return;
  checkpoints.pop();
  playTone(300, 0.07, 'sawtooth');
}

function resetAttempt() {
  particles = [];
  shockwaves = [];
  usedOrbs.clear();
  jumpBufferFrames = 0;
  coyoteFrames = 0;

  if(practiceMode && checkpoints.length > 0) {
    const cp = checkpoints[checkpoints.length - 1];
    cameraX = cp.cameraX;
    player.y = cp.y;
    player.prevY = cp.y;
    player.vy = cp.vy;
    player.rot = cp.rot;
    player.mode = cp.mode;
    player.onGround = (player.y >= FLOOR_Y - player.size - 1);
  } else {
    cameraX = 0;
    lastAutoCpX = 0;
    player.y = FLOOR_Y - player.size;
    player.prevY = player.y;
    player.vy = 0;
    player.rot = 0;
    player.mode = 'CUBE';
    player.onGround = true;
  }
  player.dead = false;
  player.won = false;
}

function ensureAudio() {
  if(!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if(AC) audioCtx = new AC();
  }
  if(audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
}

function playTone(freq, dur, type) {
  if(!audioEnabled) return;
  try {
    ensureAudio();
    if(!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.06, audioCtx.currentTime);
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
    playTone(f, 0.13, 'sawtooth');
    if(noteStep % 2 === 0) playTone(f * 0.5, 0.09, 'triangle');
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

function spawnParticles(x, y, color, count, spdMul) {
  for(let i=0;i<count;i++){
    const ang = Math.random() * Math.PI * 2;
    const spd = (0.8 + Math.random() * 3.8) * (spdMul || 1);
    particles.push({
      x: x,
      y: y,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd - 0.6,
      size: 2 + Math.random() * 3.5,
      color: color,
      life: 1
    });
  }
}

function spawnShockwave(x, y, color) {
  shockwaves.push({x: x, y: y, r: 4, maxR: 30, color: color, life: 1});
}

function doJump(vyForce, orbColor) {
  player.vy = vyForce || -8.9;
  player.onGround = false;
  coyoteFrames = 0;
  jumpBufferFrames = 0;
  spawnParticles(PLAYER_X + 12, player.y + player.size, orbColor || '#00ffff', 8, 0.75);
  if(orbColor) spawnShockwave(PLAYER_X + 12, player.y + 12, orbColor);
  playTone(orbColor ? 520 : 390, 0.07, 'square');
}

function killPlayer() {
  if(player.dead || player.won) return;
  player.dead = true;
  spawnParticles(PLAYER_X + 12, player.y + 12, SKINS[skinIdx].top, 24, 1.45);
  spawnParticles(PLAYER_X + 12, player.y + 12, '#ffffff', 12, 1.15);
  spawnShockwave(PLAYER_X + 12, player.y + 12, '#ff3300');
  playTone(105, 0.26, 'sawtooth');
  setTimeout(() => {
    if(screen === 'PLAY') {
      attempt++;
      resetAttempt();
    }
  }, 750);
}

function boxesOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function stepPhysics(dt) {
  const lv = LEVELS[curLvl];

  if(screen === 'MENU' || screen === 'SELECT') {
    bgOffset = (bgOffset + 1.5 * dt) % 56;
    player.y += player.vy * dt;
    player.vy += 0.56 * dt;
    if(player.y >= FLOOR_Y - player.size) {
      player.y = FLOOR_Y - player.size;
      player.vy = 0;
      player.rot = 0;
      if(screen === 'MENU' && Math.random() < 0.025) player.vy = -8.2;
    } else {
      player.rot += 0.11 * dt;
    }
    return;
  }

  if(player.dead || player.won) return;

  if(jumpBufferFrames > 0) jumpBufferFrames -= dt;
  if(coyoteFrames > 0) coyoteFrames -= dt;

  const subSteps = 2;
  const subDt = dt / subSteps;

  for(let s = 0; s < subSteps; s++) {
    player.prevY = player.y;
    cameraX += lv.speed * subDt;
    bgOffset = (cameraX * 0.35) % 56;

    if(player.mode === 'SHIP') {
      const thrust = pointerHeld ? -0.44 : 0.36;
      player.vy = Math.max(-5.2, Math.min(5.2, player.vy + thrust * subDt));
      player.y += player.vy * subDt;
      player.onGround = false;

      if(player.y >= FLOOR_Y - player.size) {
        player.y = FLOOR_Y - player.size;
        player.vy = 0;
        player.onGround = true;
      }
      if(player.y <= CEIL_Y) {
        player.y = CEIL_Y;
        player.vy = 0;
      }
      player.rot = player.vy * 0.09;
    } else {
      if((pointerHeld || jumpBufferFrames > 0) && (player.onGround || coyoteFrames > 0)) {
        doJump(-8.9);
      }
      player.y += player.vy * subDt;
      player.vy = Math.min(12.5, player.vy + 0.56 * subDt);

      const wasOnGround = player.onGround;
      player.onGround = false;

      if(player.y >= FLOOR_Y - player.size) {
        player.y = FLOOR_Y - player.size;
        player.vy = 0;
        player.onGround = true;
        coyoteFrames = 5;
        player.rot = Math.round(player.rot / (Math.PI / 2)) * (Math.PI / 2);
      } else {
        if(wasOnGround) coyoteFrames = 5;
        player.rot += 0.125 * subDt;
      }
    }

    const pWorldX = cameraX + PLAYER_X;
    const py = player.y;
    const ps = player.size;

    const coreX = pWorldX + 5;
    const coreY = py + 5;
    const coreW = ps - 10;
    const coreH = ps - 8;

    const footX = pWorldX + 3;
    const footW = ps - 6;

    for(let i = 0; i < lv.map.length; i++) {
      const obj = lv.map[i];
      const ox = obj.x;
      if(ox < pWorldX - 45 || ox > pWorldX + 55) continue;

      if(obj.t === 's') {
        const sy = FLOOR_Y - 24;
        const spkX = ox + 8;
        const spkY = sy + 9;
        const spkW = 8;
        const spkH = 13;
        if(boxesOverlap(coreX, coreY, coreW, coreH, spkX, spkY, spkW, spkH)) {
          killPlayer();
          return;
        }
      } else if(obj.t === 'b') {
        const by = FLOOR_Y - ((obj.y || 0) + 1) * 26;
        const bw = 26, bh = 26;

        if(boxesOverlap(footX, py, footW, ps, ox, by, bw, bh)) {
          const prevBottom = player.prevY + ps;
          if(player.vy >= -0.5 && prevBottom <= by + 9) {
            player.y = by - ps;
            player.vy = 0;
            player.onGround = true;
            coyoteFrames = 5;
            if(player.mode === 'CUBE') {
              player.rot = Math.round(player.rot / (Math.PI / 2)) * (Math.PI / 2);
            }
          } else if(player.mode === 'SHIP' && player.vy < 0 && player.prevY >= by + bh - 8) {
            player.y = by + bh;
            player.vy = 0;
          } else if(boxesOverlap(coreX, coreY, coreW, coreH, ox + 3, by + 4, bw - 6, bh - 8)) {
            killPlayer();
            return;
          }
        }
      } else if(obj.t === 'p') {
        const padY = FLOOR_Y - (obj.y || 0) * 26 - 7;
        if(boxesOverlap(footX, py, footW, ps, ox + 2, padY, 22, 7)) {
          doJump(-11.4, '#ffe600');
        }
      } else if(obj.t === 'o') {
        const orbY = FLOOR_Y - ((obj.y || 1) + 0.5) * 26;
        if(!usedOrbs.has(i) && (jumpBufferFrames > 0 || pointerHeld)) {
          if(boxesOverlap(pWorldX - 4, py - 4, ps + 8, ps + 8, ox - 4, orbY - 14, 32, 32)) {
            usedOrbs.add(i);
            pointerHeld = false;
            doJump(-10.2, '#ffe600');
          }
        }
      } else if(obj.t === 'ship' || obj.t === 'cube') {
        const targetMode = obj.t === 'ship' ? 'SHIP' : 'CUBE';
        if(player.mode !== targetMode && boxesOverlap(pWorldX, py, ps, ps, ox, CEIL_Y, 24, FLOOR_Y - CEIL_Y)) {
          player.mode = targetMode;
          spawnShockwave(PLAYER_X + 12, player.y + 12, targetMode === 'SHIP' ? '#ff00ff' : '#00ff66');
          playTone(targetMode === 'SHIP' ? 680 : 520, 0.12, 'triangle');
        }
      }
    }
  }

  if(practiceMode && player.onGround && cameraX - lastAutoCpX > 340) {
    let safeSpot = true;
    const pWorldX = cameraX + PLAYER_X;
    for(let i = 0; i < lv.map.length; i++) {
      const d = lv.map[i].x - pWorldX;
      if(d > -30 && d < 85 && lv.map[i].t === 's') {
        safeSpot = false;
        break;
      }
    }
    if(safeSpot) {
      checkpoints.push({
        cameraX: cameraX,
        y: player.y,
        vy: player.vy,
        rot: player.rot,
        mode: player.mode
      });
      lastAutoCpX = cameraX;
    }
  }

  if(player.onGround && Math.random() < 0.45) {
    particles.push({
      x: PLAYER_X + 2,
      y: player.y + player.size - 2,
      vx: -1.8 - Math.random() * 1.8,
      vy: -Math.random() * 1.2,
      size: 2.5,
      color: player.mode === 'SHIP' ? '#ff7700' : '#00ffff',
      life: 0.65
    });
  } else if(player.mode === 'SHIP') {
    particles.push({
      x: PLAYER_X - 2,
      y: player.y + 14,
      vx: -2.5 - Math.random() * 1.5,
      vy: (Math.random() - 0.5) * 1.5,
      size: 3,
      color: pointerHeld ? '#ffaa00' : '#00e5ff',
      life: 0.7
    });
  }

  const pct = Math.min(100, Math.floor((cameraX / lv.length) * 100));
  document.getElementById('playFill').style.width = pct + '%';
  document.getElementById('playPct').textContent = pct + '%';

  if(cameraX >= lv.length) {
    player.won = true;
    if(practiceMode) lv.bestPrac = 100;
    else lv.bestNorm = 100;
    spawnParticles(PLAYER_X + 12, player.y + 12, '#7cff00', 36, 1.6);
    spawnShockwave(PLAYER_X + 12, player.y + 12, '#7cff00');
    playTone(880, 0.35, 'triangle');
    setTimeout(() => openSelect(), 1500);
  }
}

function drawBackground() {
  const lv = LEVELS[curLvl];
  const topCol = screen === 'MENU' ? '#0033cc' : lv.bgTop;
  const botCol = screen === 'MENU' ? '#001566' : lv.bgBot;
  const flrCol = screen === 'MENU' ? '#000d44' : lv.floor;

  const grad = ctx.createLinearGradient(0, 0, 0, FLOOR_Y);
  grad.addColorStop(0, topCol);
  grad.addColorStop(1, botCol);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, FLOOR_Y);

  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.lineWidth = 1.8;
  const sz = 56;
  for(let x = -bgOffset; x < W; x += sz) {
    for(let y = 8; y < FLOOR_Y; y += sz) {
      ctx.strokeRect(x, y, sz - 5, sz - 5);
      ctx.fillStyle = 'rgba(255,255,255,0.025)';
      ctx.fillRect(x, y, sz - 5, sz - 5);
    }
  }

  ctx.fillStyle = flrCol;
  ctx.fillRect(0, FLOOR_Y, W, H - FLOOR_Y);

  const flrOff = (screen === 'PLAY' ? cameraX : bgOffset * 2) % 40;
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  for(let x = -flrOff; x < W; x += 40) {
    ctx.strokeRect(x, FLOOR_Y, 40, H - FLOOR_Y);
  }

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#00ffff';
  ctx.shadowBlur = 7;
  ctx.beginPath();
  ctx.moveTo(0, FLOOR_Y);
  ctx.lineTo(W, FLOOR_Y);
  ctx.stroke();

  if(screen === 'PLAY' && player.mode === 'SHIP') {
    ctx.fillStyle = flrCol;
    ctx.fillRect(0, 0, W, CEIL_Y);
    ctx.beginPath();
    ctx.moveTo(0, CEIL_Y);
    ctx.lineTo(W, CEIL_Y);
    ctx.stroke();
  }
  ctx.shadowBlur = 0;

  if(screen === 'SELECT') {
    const cornerBlocks = [
      [0, H - 15], [0, H - 30], [15, H - 15],
      [W - 15, H - 15], [W - 15, H - 30], [W - 30, H - 15]
    ];
    cornerBlocks.forEach(b => {
      ctx.fillStyle = '#55ff00';
      ctx.fillRect(b[0], b[1], 15, 15);
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(b[0], b[1], 15, 15);
    });
  }
}

function drawPlayer(x, y, size, rot) {
  const s = SKINS[skinIdx];
  ctx.save();
  ctx.translate(x + size / 2, y + size / 2);
  ctx.rotate(rot);

  if(player.mode === 'SHIP') {
    ctx.fillStyle = s.bot;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-14, 4);
    ctx.lineTo(10, 4);
    ctx.lineTo(15, 9);
    ctx.lineTo(-10, 11);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = s.top;
    ctx.fillRect(-5, -8, 11, 11);
    ctx.strokeRect(-5, -8, 11, 11);

    ctx.fillStyle = s.eye;
    ctx.fillRect(-2, -5, 3, 3);
    ctx.fillRect(2, -5, 3, 3);
  } else {
    const g = ctx.createLinearGradient(0, -size/2, 0, size/2);
    g.addColorStop(0, s.top);
    g.addColorStop(1, s.bot);
    ctx.fillStyle = g;
    ctx.fillRect(-size/2, -size/2, size, size);

    ctx.lineWidth = 2;
    ctx.strokeStyle = '#000000';
    ctx.strokeRect(-size/2, -size/2, size, size);

    ctx.fillStyle = '#000000';
    ctx.beginPath();
    ctx.arc(-4.5, 1.5, 3, 0, Math.PI * 2);
    ctx.arc(4.5, 1.5, 3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = s.eye;
    ctx.beginPath();
    ctx.arc(-5, 1, 1.1, 0, Math.PI * 2);
    ctx.arc(4, 1, 1.1, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(0, 3, 2, Math.PI, 0, false);
    ctx.stroke();
  }

  ctx.restore();

  if(showHitboxes && screen === 'PLAY') {
    ctx.save();
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 3, y, size - 6, size);
    ctx.strokeStyle = '#ffff00';
    ctx.strokeRect(x + 5, y + 5, size - 10, size - 8);
    ctx.restore();
  }
}

function drawWorld() {
  if(screen === 'MENU') {
    drawPlayer(218, player.y, player.size, player.rot);
    return;
  }
  if(screen !== 'PLAY') return;

  const lv = LEVELS[curLvl];

  const attX = 28 - cameraX * 0.85;
  if(attX > -220) {
    ctx.save();
    ctx.font = '900 19px "Arial Black", Impact, sans-serif';
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = '#000000';
    ctx.fillStyle = '#ffffff';
    ctx.strokeText('ATTEMPT  ' + attempt, attX, 72);
    ctx.fillText('ATTEMPT  ' + attempt, attX, 72);
    ctx.restore();
  }

  if(practiceMode) {
    for(let c = 0; c < checkpoints.length; c++) {
      const cp = checkpoints[c];
      const cpx = cp.cameraX - cameraX + PLAYER_X + 12;
      if(cpx < -20 || cpx > W + 20) continue;
      const cpy = cp.y + 12;
      ctx.save();
      ctx.fillStyle = '#00ff66';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cpx, cpy - 8);
      ctx.lineTo(cpx + 6, cpy);
      ctx.lineTo(cpx, cpy + 8);
      ctx.lineTo(cpx - 6, cpy);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }
  }

  for(let i = 0; i < lv.map.length; i++) {
    const obj = lv.map[i];
    const sx = obj.x - cameraX;
    if(sx < -45 || sx > W + 45) continue;

    if(obj.t === 's') {
      const sy = FLOOR_Y - 24;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(sx, FLOOR_Y);
      ctx.lineTo(sx + 12, sy);
      ctx.lineTo(sx + 24, FLOOR_Y);
      ctx.closePath();
      ctx.fillStyle = '#05050a';
      ctx.fill();
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = '#ffffff';
      ctx.shadowColor = '#00e5ff';
      ctx.shadowBlur = 5;
      ctx.stroke();
      ctx.restore();

      if(showHitboxes) {
        ctx.strokeStyle = '#ff0033';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(sx + 8, sy + 9, 8, 13);
      }
    } else if(obj.t === 'b') {
      const by = FLOOR_Y - ((obj.y || 0) + 1) * 26;
      ctx.save();
      ctx.fillStyle = '#060a17';
      ctx.fillRect(sx, by, 26, 26);
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = '#00e5ff';
      ctx.strokeRect(sx, by, 26, 26);
      ctx.strokeStyle = 'rgba(255,255,255,0.32)';
      ctx.strokeRect(sx + 4, by + 4, 18, 18);
      ctx.restore();

      if(showHitboxes) {
        ctx.strokeStyle = '#00ff44';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(sx, by, 26, 5);
        ctx.strokeStyle = '#ff0033';
        ctx.strokeRect(sx + 3, by + 4, 20, 18);
      }
    } else if(obj.t === 'p') {
      const padY = FLOOR_Y - (obj.y || 0) * 26 - 5;
      ctx.save();
      ctx.fillStyle = '#ffe600';
      ctx.shadowColor = '#ffe600';
      ctx.shadowBlur = 7;
      ctx.beginPath();
      ctx.arc(sx + 13, padY + 5, 10, Math.PI, 0, false);
      ctx.fill();
      ctx.restore();

      if(showHitboxes) {
        ctx.strokeStyle = '#00ff44';
        ctx.strokeRect(sx + 2, padY - 2, 22, 7);
      }
    } else if(obj.t === 'o') {
      const orbY = FLOOR_Y - ((obj.y || 1) + 0.5) * 26;
      const pulse = 1 + Math.sin(performance.now() * 0.01) * 0.12;
      ctx.save();
      ctx.translate(sx + 12, orbY);
      ctx.scale(pulse, pulse);
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, Math.PI * 2);
      ctx.fillStyle = '#ffe600';
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = '#ffffff';
      ctx.shadowColor = '#ffe600';
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.restore();

      if(showHitboxes) {
        ctx.strokeStyle = '#00ff44';
        ctx.strokeRect(sx - 4, orbY - 14, 32, 32);
      }
    } else if(obj.t === 'ship' || obj.t === 'cube') {
      const pCol = obj.t === 'ship' ? '#ff00ff' : '#00ff44';
      ctx.save();
      ctx.strokeStyle = pCol;
      ctx.lineWidth = 3.5;
      ctx.shadowColor = pCol;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.ellipse(sx + 10, (FLOOR_Y + CEIL_Y) / 2, 9, (FLOOR_Y - CEIL_Y) / 2.3, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  for(let i = shockwaves.length - 1; i >= 0; i--) {
    const sw = shockwaves[i];
    sw.r += (sw.maxR - sw.r) * 0.18;
    sw.life -= 0.055;
    if(sw.life <= 0) {
      shockwaves.splice(i, 1);
      continue;
    }
    ctx.save();
    ctx.strokeStyle = sw.color;
    ctx.globalAlpha = Math.max(0, sw.life);
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(sw.x, sw.y, sw.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  for(let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.life -= 0.04;
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
    drawPlayer(PLAYER_X, player.y, player.size, player.rot);
  }

  if(player.won) {
    ctx.save();
    ctx.font = '900 23px "Arial Black", Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 4.5;
    ctx.strokeStyle = '#000';
    ctx.fillStyle = '#7cff00';
    ctx.strokeText('LEVEL COMPLETE!', W / 2, H / 2);
    ctx.fillText('LEVEL COMPLETE!', W / 2, H / 2);
    ctx.restore();
  }
}

function loop(now) {
  const elapsed = now - lastFrameTime;
  lastFrameTime = now;
  const dt = Math.max(0.2, Math.min(2.2, elapsed / 16.6667));

  stepPhysics(dt);
  drawBackground();
  drawWorld();
  requestAnimationFrame(loop);
}

const rootEl = document.getElementById('gd-root');
rootEl.addEventListener('pointerdown', (e) => {
  if(screen === 'PLAY' && !e.target.closest('.ui-btn')) {
    pointerHeld = true;
    jumpBufferFrames = 9;
  }
});
window.addEventListener('pointerup', () => { pointerHeld = false; });
window.addEventListener('pointercancel', () => { pointerHeld = false; });
window.addEventListener('keydown', (e) => {
  if((e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') && screen === 'PLAY') {
    pointerHeld = true;
    jumpBufferFrames = 9;
  }
});
window.addEventListener('keyup', () => { pointerHeld = false; });

renderDots();
requestAnimationFrame((t) => {
  lastFrameTime = t;
  requestAnimationFrame(loop);
});
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
  description: "Abre el videojuego interactivo Geometry Dash con físicas sub-pixel, orbes, modo nave y visor de hitboxes.",
  async run(ctx: CommandContext) {
    const { reply, react, sock, from, msg } = ctx;

    await react("🟦").catch(() => undefined);

    try {
      const { AIRich } = await import("baileys/lib/Builders/ai-rich.js");

      const rich = new AIRich(sock)
        .setTitle("🟦 Geometry Dash // LuferOS")
        .setFooter("Toca para saltar • Pulsa 🎯 en partida para ver las Hitboxes");

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
