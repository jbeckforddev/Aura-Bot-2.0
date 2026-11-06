import { randomBytes } from "node:crypto";
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

function buildVoxelShooterHtml(playerName: string): string {
  const safePlayer = JSON.stringify(playerName || "Steve");

  return `<style>
* { -webkit-tap-highlight-color: transparent; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; box-sizing: border-box; margin: 0; padding: 0; }
body { margin: 0; padding: 0; background: #05020a; font-family: 'Courier New', Courier, monospace, sans-serif; color: #f5f3ff; touch-action: none; overflow-x: hidden; }
.mc-root { width: 100%; max-width: 640px; height: 670px; margin: 0 auto; background: #070312; border: 2px solid #4c1d95; border-radius: 14px; overflow: hidden; display: flex; flex-direction: column; position: relative; box-shadow: 0 12px 40px rgba(0,0,0,0.95); }
.hud-top { height: 52px; background: linear-gradient(180deg, #16092c 0%, #0b0418 100%); border-bottom: 2px solid #3b1d6e; display: flex; justify-content: space-between; align-items: center; padding: 4px 10px; z-index: 20; flex-shrink: 0; }
.fighter-box { display: flex; align-items: center; gap: 6px; width: 37%; }
.fighter-box.right { flex-direction: row-reverse; text-align: right; }
.voxel-head { width: 32px; height: 32px; border: 2px solid #00ffcc; background: #1e1b4b; display: flex; align-items: center; justify-content: center; font-size: 16px; box-shadow: inset 0 0 8px rgba(0,255,204,0.4); flex-shrink: 0; }
.voxel-head.ai { border-color: #ff0055; background: #31102f; box-shadow: inset 0 0 8px rgba(255,0,85,0.4); }
.bars-col { flex: 1; min-width: 0; }
.f-name { font-size: 10px; font-weight: 900; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; justify-content: space-between; margin-bottom: 2px; }
.fighter-box.right .f-name { flex-direction: row-reverse; }
.bar-outer { width: 100%; height: 8px; background: #140824; border: 1px solid #4c1d95; margin-bottom: 2px; overflow: hidden; }
.bar-inner { height: 100%; width: 100%; background: linear-gradient(90deg, #00ffcc, #22c55e); transition: width 0.1s; }
.bar-inner.ai { background: linear-gradient(90deg, #ff0055, #f97316); }
.sh-outer { width: 100%; height: 4px; background: #0d0518; overflow: hidden; }
.sh-inner { height: 100%; width: 100%; background: #fbbf24; transition: width 0.1s; }
.score-pill { display: flex; flex-direction: column; align-items: center; justify-content: center; min-width: 86px; }
.score-row { display: flex; align-items: center; gap: 6px; background: #090314; border: 2px solid #6d28d9; padding: 2px 8px; border-radius: 6px; }
.s-val { font-size: 16px; font-weight: 900; }
.s-val.p { color: #00ffcc; }
.s-val.e { color: #ff0055; }
.s-mid { font-size: 10px; color: #c084fc; font-weight: 900; }
.r-clock { font-size: 9.5px; color: #e9d5ff; font-weight: 900; margin-top: 2px; }
.stage-wrap { position: relative; flex: 1; width: 100%; background: #000; overflow: hidden; }
canvas#view3d { width: 100%; height: 100%; display: block; image-rendering: pixelated; }
.top-overlay { position: absolute; top: 8px; left: 8px; right: 8px; display: flex; justify-content: space-between; align-items: flex-start; pointer-events: none; z-index: 12; }
.minimap-box { width: 78px; height: 78px; background: rgba(8, 3, 18, 0.85); border: 2px solid #7c3aed; border-radius: 6px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.8); pointer-events: auto; }
canvas#minimap { width: 100%; height: 100%; display: block; }
.quick-btns { display: flex; flex-direction: column; gap: 5px; pointer-events: auto; align-items: flex-end; }
.q-btn { background: rgba(16, 7, 32, 0.88); border: 1.5px solid #581c87; color: #e9d5ff; padding: 5px 9px; border-radius: 6px; font-size: 10px; font-weight: 900; cursor: pointer; text-transform: uppercase; }
.q-btn:active { transform: scale(0.93); }
.q-btn.on { border-color: #00ffcc; color: #00ffcc; }
.banner-pop { position: absolute; top: 92px; left: 50%; transform: translateX(-50%) scale(0.8); background: rgba(255, 0, 85, 0.92); border: 2px solid #fff; padding: 5px 14px; border-radius: 6px; font-size: 12px; font-weight: 900; color: #fff; text-transform: uppercase; letter-spacing: 1px; pointer-events: none; opacity: 0; transition: all 0.18s; z-index: 15; white-space: nowrap; box-shadow: 0 0 20px rgba(255,0,85,0.8); }
.banner-pop.show { opacity: 1; transform: translateX(-50%) scale(1); }
.dmg-flash { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(circle, transparent 45%, rgba(255, 0, 85, 0.55) 100%); opacity: 0; transition: opacity 0.12s; z-index: 11; }
.scope-mask { position: absolute; inset: 0; pointer-events: none; background: radial-gradient(circle, transparent 32%, rgba(0, 0, 0, 0.94) 36%); display: none; z-index: 10; }
.scope-mask.active { display: block; }
.scope-lines { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
.scope-lines::before { content: ''; position: absolute; width: 100%; height: 1px; background: rgba(0, 255, 204, 0.7); }
.scope-lines::after { content: ''; position: absolute; height: 100%; width: 1px; background: rgba(0, 255, 204, 0.7); }
.hud-controls { height: 168px; background: linear-gradient(180deg, #110622 0%, #070210 100%); border-top: 2px solid #3b1d6e; padding: 8px 10px; display: flex; justify-content: space-between; align-items: center; gap: 6px; z-index: 20; flex-shrink: 0; }
.joy-pad { width: 118px; height: 118px; position: relative; flex-shrink: 0; touch-action: none; }
.joy-ring { position: absolute; inset: 6px; border-radius: 50%; background: rgba(22, 10, 44, 0.9); border: 2px solid #6d28d9; box-shadow: inset 0 0 15px rgba(139, 92, 246, 0.35); display: flex; align-items: center; justify-content: center; }
.joy-ring.fire-ring { border-color: #ff0055; box-shadow: inset 0 0 15px rgba(255, 0, 85, 0.35); }
.joy-knob { width: 42px; height: 42px; border-radius: 10px; background: linear-gradient(135deg, #a855f7, #4c1d95); border: 2px solid #fff; display: flex; align-items: center; justify-content: center; font-size: 16px; box-shadow: 0 4px 12px rgba(0,0,0,0.8); }
.joy-ring.fire-ring .joy-knob { background: linear-gradient(135deg, #ff0055, #991b1b); }
.mid-deck { flex: 1; display: flex; flex-direction: column; justify-content: space-between; height: 100%; gap: 6px; min-width: 0; }
.hotbar-grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; }
.slot-btn { background: #190b30; border: 2px solid #4c1d95; border-radius: 7px; padding: 5px 2px; color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; position: relative; }
.slot-btn:active { transform: scale(0.92); border-color: #00ffcc; }
.slot-btn.gloo { border-color: #00ffcc; }
.slot-btn.tnt { border-color: #ff0055; }
.slot-btn.apple { border-color: #fbbf24; }
.slot-ico { font-size: 15px; line-height: 1; }
.slot-txt { font-size: 8px; font-weight: 900; color: #d8b4fe; margin-top: 2px; text-transform: uppercase; }
.slot-badge { position: absolute; top: -4px; right: -4px; background: #7c3aed; color: #fff; font-size: 9px; font-weight: 900; padding: 1px 4px; border-radius: 4px; border: 1px solid #000; }
.gun-dock { background: #0c041a; border: 2px solid #581c87; border-radius: 8px; padding: 6px 8px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; }
.gun-dock:active { border-color: #00ffcc; }
.gun-info { min-width: 0; }
.gun-title { font-size: 10.5px; font-weight: 900; color: #00ffcc; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gun-ammo { font-size: 12px; font-weight: 900; color: #fff; }
.reload-pill { background: #3b0764; border: 1.5px solid #a855f7; color: #fff; padding: 4px 8px; border-radius: 6px; font-size: 9.5px; font-weight: 900; cursor: pointer; }
.turn-row { display: flex; gap: 4px; }
.turn-btn { flex: 1; background: #150928; border: 1.5px solid #3b1d6e; color: #c4b5fd; padding: 4px; border-radius: 6px; font-size: 10px; font-weight: 900; cursor: pointer; text-align: center; }
.turn-btn:active { background: #4c1d95; color: #fff; }
.overlay-screen { position: absolute; inset: 0; background: rgba(5, 2, 12, 0.94); z-index: 40; display: none; flex-direction: column; justify-content: center; align-items: center; padding: 14px; }
.overlay-screen.open { display: flex; }
.modal-box { width: 100%; max-width: 390px; background: #110622; border: 2px solid #8b5cf6; border-radius: 14px; padding: 14px; box-shadow: 0 0 35px rgba(139, 92, 246, 0.4); text-align: center; }
.m-tag { display: inline-block; background: rgba(0, 255, 204, 0.15); color: #00ffcc; border: 1px solid #00ffcc; font-size: 9.5px; font-weight: 900; padding: 2px 8px; border-radius: 4px; margin-bottom: 6px; }
.m-title { font-size: 17px; font-weight: 900; color: #fff; text-transform: uppercase; margin-bottom: 4px; }
.m-sub { font-size: 11px; color: #c4b5fd; margin-bottom: 10px; }
.diff-row { display: flex; gap: 4px; margin-bottom: 10px; background: #070210; padding: 4px; border-radius: 8px; border: 1px solid #2e1065; }
.d-btn { flex: 1; background: transparent; border: none; color: #8b74b0; padding: 6px 2px; border-radius: 5px; font-size: 9.5px; font-weight: 900; cursor: pointer; text-transform: uppercase; }
.d-btn.active { background: linear-gradient(135deg, #7c3aed, #db2777); color: #fff; }
.weapons-list { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 12px; }
.w-card { background: #090314; border: 2px solid #351a63; border-radius: 8px; padding: 8px; text-align: left; cursor: pointer; }
.w-card.active { border-color: #00ffcc; background: rgba(0, 255, 204, 0.08); }
.w-c-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px; }
.w-c-name { font-size: 11px; font-weight: 900; color: #fff; }
.w-c-tag { font-size: 8.5px; background: #3b0764; color: #f0abfc; padding: 1px 5px; border-radius: 3px; font-weight: 900; }
.w-c-desc { font-size: 9.5px; color: #a78bfa; line-height: 1.3; }
.play-btn { width: 100%; background: linear-gradient(135deg, #00ffcc, #10b981); color: #05020a; border: none; padding: 11px; border-radius: 8px; font-size: 13px; font-weight: 900; text-transform: uppercase; cursor: pointer; box-shadow: 0 4px 15px rgba(0, 255, 204, 0.4); }
.play-btn:active { transform: scale(0.97); }
</style>

<div class="mc-root">
  <div class="hud-top">
    <div class="fighter-box">
      <div class="voxel-head">⛏️</div>
      <div class="bars-col">
        <div class="f-name"><span id="pNameTxt"></span><span id="pHpNum">200</span></div>
        <div class="bar-outer"><div class="bar-inner" id="pHpBar"></div></div>
        <div class="sh-outer"><div class="sh-inner" id="pShBar"></div></div>
      </div>
    </div>

    <div class="score-pill">
      <div class="score-row">
        <span class="s-val p" id="scP">0</span>
        <span class="s-mid">R<span id="rNum">1</span></span>
        <span class="s-val e" id="scE">0</span>
      </div>
      <div class="r-clock" id="rClock">00:60</div>
    </div>

    <div class="fighter-box right">
      <div class="voxel-head ai">💀</div>
      <div class="bars-col">
        <div class="f-name"><span id="eNameTxt">HEROBRINE IA</span><span id="eHpNum">200</span></div>
        <div class="bar-outer"><div class="bar-inner ai" id="eHpBar"></div></div>
        <div class="sh-outer"><div class="sh-inner" id="eShBar"></div></div>
      </div>
    </div>
  </div>

  <div class="stage-wrap" id="stageWrap">
    <canvas id="view3d" width="360" height="280"></canvas>
    <div class="dmg-flash" id="dmgFlash"></div>
    <div class="scope-mask" id="scopeMask"><div class="scope-lines"></div></div>

    <div class="top-overlay">
      <div class="minimap-box">
        <canvas id="minimap" width="78" height="78"></canvas>
      </div>
      <div class="quick-btns">
        <button class="q-btn on" id="btnAudio" onclick="toggleSound()">🔊 SFX</button>
        <button class="q-btn" onclick="openArmory()">🛒 Arsenal</button>
      </div>
    </div>

    <div class="banner-pop" id="bannerPop">¡TODO ROJO! HEADSHOT</div>
  </div>

  <div class="hud-controls">
    <div class="joy-pad" id="leftPad">
      <div class="joy-ring">
        <div class="joy-knob" id="leftKnob">🕹️</div>
      </div>
    </div>

    <div class="mid-deck">
      <div class="hotbar-grid">
        <button class="slot-btn gloo" onclick="placeVoxelBlock()">
          <span class="slot-ico">🧊</span>
          <span class="slot-txt">Gloo</span>
          <span class="slot-badge" id="cntGloo">4</span>
        </button>
        <button class="slot-btn apple" onclick="eatGoldenApple()">
          <span class="slot-ico">🍎</span>
          <span class="slot-txt">Curar</span>
          <span class="slot-badge" id="cntApple">2</span>
        </button>
        <button class="slot-btn tnt" onclick="throwTntBlock()">
          <span class="slot-ico">🧨</span>
          <span class="slot-txt">TNT</span>
          <span class="slot-badge" id="cntTnt">2</span>
        </button>
        <button class="slot-btn" id="btnScope" onclick="toggleScope()">
          <span class="slot-ico">🔭</span>
          <span class="slot-txt">Mira</span>
        </button>
        <button class="slot-btn" onclick="doJump()">
          <span class="slot-ico">⬆️</span>
          <span class="slot-txt">Saltar</span>
        </button>
      </div>

      <div class="gun-dock" onclick="swapWeapon()">
        <div class="gun-info">
          <div class="gun-title" id="gunTitle">M1887 VOXEL</div>
          <div class="gun-ammo" id="gunAmmo">2 / ∞</div>
        </div>
        <button class="reload-pill" onclick="event.stopPropagation(); triggerReload()">🔄 R</button>
      </div>

      <div class="turn-row">
        <button class="turn-btn" onpointerdown="setTurnKey(-1)" onpointerup="setTurnKey(0)" onpointerleave="setTurnKey(0)">◀ Girar Izq</button>
        <button class="turn-btn" onpointerdown="setTurnKey(1)" onpointerup="setTurnKey(0)" onpointerleave="setTurnKey(0)">Girar Der ▶</button>
      </div>
    </div>

    <div class="joy-pad" id="rightPad">
      <div class="joy-ring fire-ring">
        <div class="joy-knob" id="rightKnob">🔥</div>
      </div>
    </div>
  </div>

  <div class="overlay-screen open" id="shopOverlay">
    <div class="modal-box">
      <span class="m-tag" id="shopTag">MINECRAFT 3D • LOBO SOLITARIO</span>
      <div class="m-title">Arsenal Voxel 3D</div>
      <div class="m-sub">Arrastra la vista 3D o usa el botón derecho para apuntar y disparar</div>

      <div class="diff-row">
        <button class="d-btn" data-lv="1" onclick="setDiff(1)">Fácil</button>
        <button class="d-btn" data-lv="2" onclick="setDiff(2)">Normal</button>
        <button class="d-btn active" data-lv="3" onclick="setDiff(3)">Heroico</button>
        <button class="d-btn" data-lv="4" onclick="setDiff(4)">Leyenda</button>
      </div>

      <div class="weapons-list" id="weaponsList"></div>

      <button class="play-btn" onclick="startRoundFromShop()">⛏️ INICIAR COMBATE 3D</button>
    </div>
  </div>

  <div class="overlay-screen" id="endOverlay">
    <div class="modal-box">
      <span class="m-tag" id="endTag">FIN DE LA PARTIDA</span>
      <div class="m-title" id="endTitle">¡BOOYAH! VICTORIA</div>
      <div class="m-sub" id="endSub">Dominaste la arena Voxel 3D</div>
      <button class="play-btn" onclick="resetFullMatch()">🔥 JUGAR REVANCHA</button>
    </div>
  </div>
</div>

<script>
(function() {
  const P_NAME = ${safePlayer};
  document.getElementById('pNameTxt').textContent = P_NAME;

  const canvas = document.getElementById('view3d');
  const ctx = canvas.getContext('2d');
  const miniCanvas = document.getElementById('minimap');
  const mCtx = miniCanvas.getContext('2d');

  const W = canvas.width;
  const H = canvas.height;
  const zBuffer = new Float32Array(W);

  let audioCtx = null;
  let sfxEnabled = true;

  function ensureAudio() {
    if (!sfxEnabled) return null;
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(function(){});
    }
    return audioCtx;
  }

  window.toggleSound = function() {
    sfxEnabled = !sfxEnabled;
    const btn = document.getElementById('btnAudio');
    btn.textContent = sfxEnabled ? '🔊 SFX' : '🔇 MUTE';
    btn.classList.toggle('on', sfxEnabled);
  };

  function playSfx(kind) {
    const ac = ensureAudio();
    if (!ac) return;
    const now = ac.currentTime;
    try {
      if (kind === 'shot' || kind === 'heavy') {
        const dur = kind === 'heavy' ? 0.24 : 0.11;
        const buf = ac.createBuffer(1, ac.sampleRate * dur, ac.sampleRate);
        const ch = buf.getChannelData(0);
        for (let i = 0; i < ch.length; i++) {
          ch[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ac.sampleRate * 0.035));
        }
        const src = ac.createBufferSource();
        src.buffer = buf;
        const g = ac.createGain();
        g.gain.setValueAtTime(0.42, now);
        g.gain.exponentialRampToValueAtTime(0.01, now + dur);
        src.connect(g);
        g.connect(ac.destination);
        src.start(now);
      } else if (kind === 'headshot') {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = 'triangle';
        o.frequency.setValueAtTime(1400, now);
        o.frequency.setValueAtTime(2100, now + 0.04);
        g.gain.setValueAtTime(0.38, now);
        g.gain.exponentialRampToValueAtTime(0.008, now + 0.18);
        o.connect(g);
        g.connect(ac.destination);
        o.start(now);
        o.stop(now + 0.19);
      } else if (kind === 'block') {
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = 'square';
        o.frequency.setValueAtTime(260, now);
        o.frequency.exponentialRampToValueAtTime(520, now + 0.09);
        g.gain.setValueAtTime(0.24, now);
        g.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        o.connect(g);
        g.connect(ac.destination);
        o.start(now);
        o.stop(now + 0.11);
      } else if (kind === 'boom') {
        const dur = 0.45;
        const buf = ac.createBuffer(1, ac.sampleRate * dur, ac.sampleRate);
        const ch = buf.getChannelData(0);
        for (let i = 0; i < ch.length; i++) {
          ch[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ac.sampleRate * 0.1));
        }
        const src = ac.createBufferSource();
        src.buffer = buf;
        const g = ac.createGain();
        g.gain.setValueAtTime(0.65, now);
        g.gain.exponentialRampToValueAtTime(0.01, now + dur);
        src.connect(g);
        g.connect(ac.destination);
        src.start(now);
      }
    } catch (e) {}
  }

  const TEX_SIZE = 16;
  const textures = {};

  function buildTexture(id, painter) {
    const c = document.createElement('canvas');
    c.width = TEX_SIZE;
    c.height = TEX_SIZE;
    const x = c.getContext('2d');
    painter(x);
    textures[id] = c;
  }

  buildTexture(1, function(x) {
    x.fillStyle = '#3b1d6e';
    x.fillRect(0, 0, 16, 16);
    x.fillStyle = '#251047';
    x.fillRect(0, 7, 16, 2);
    x.fillRect(0, 15, 16, 1);
    x.fillRect(7, 0, 2, 7);
    x.fillRect(14, 8, 2, 7);
    x.fillStyle = '#5b21b6';
    x.fillRect(2, 2, 3, 3);
    x.fillRect(10, 10, 3, 3);
  });

  buildTexture(2, function(x) {
    x.fillStyle = '#854d0e';
    x.fillRect(0, 0, 16, 16);
    x.fillStyle = '#713f12';
    for (let y = 0; y < 16; y += 4) x.fillRect(0, y, 16, 1);
    x.strokeStyle = '#a16207';
    x.strokeRect(1, 1, 14, 14);
  });

  buildTexture(3, function(x) {
    x.fillStyle = '#090314';
    x.fillRect(0, 0, 16, 16);
    x.fillStyle = '#a855f7';
    x.fillRect(3, 2, 2, 5);
    x.fillRect(11, 8, 2, 6);
    x.fillStyle = '#00ffcc';
    x.fillRect(7, 5, 2, 4);
  });

  buildTexture(4, function(x) {
    x.fillStyle = '#06b6d4';
    x.fillRect(0, 0, 16, 16);
    x.fillStyle = '#67e8f9';
    x.fillRect(2, 2, 12, 12);
    x.fillStyle = '#cffafe';
    x.fillRect(4, 4, 5, 5);
    x.strokeStyle = '#0891b2';
    x.strokeRect(0.5, 0.5, 15, 15);
  });

  buildTexture(5, function(x) {
    x.fillStyle = '#dc2626';
    x.fillRect(0, 0, 16, 16);
    x.fillStyle = '#f8fafc';
    x.fillRect(0, 5, 16, 6);
    x.fillStyle = '#0f172a';
    x.fillRect(2, 6, 3, 4);
    x.fillRect(7, 6, 3, 4);
    x.fillRect(12, 6, 2, 4);
  });

  const WEAPONS = [
    { id: 'm1887', name: 'M1887 Voxel Dos Tiros', tag: 'ESCOPETA', dmg: 26, pellets: 6, spread: 0.11, delay: 440, mag: 2, reload: 1100, color: '#ff0055', heavy: true },
    { id: 'mp40', name: 'MP40 Cobra Voxel', tag: 'SUBFUSIL', dmg: 21, pellets: 1, spread: 0.045, delay: 95, mag: 28, reload: 1150, color: '#00ffcc', heavy: false },
    { id: 'deagle', name: 'Desert Eagle Oro', tag: 'PISTOLA', dmg: 64, pellets: 1, spread: 0.015, delay: 370, mag: 7, reload: 1050, color: '#fbbf24', heavy: true },
    { id: 'ak47', name: 'AK47 Bloque Dragón', tag: 'RIFLE', dmg: 34, pellets: 1, spread: 0.03, delay: 145, mag: 30, reload: 1300, color: '#a855f7', heavy: false },
    { id: 'awm', name: 'AWM Sniper Voxel', tag: 'FRANCOTIRADOR', dmg: 125, pellets: 1, spread: 0.003, delay: 920, mag: 5, reload: 1500, color: '#38bdf8', heavy: true },
    { id: 'ump', name: 'UMP Netherita', tag: 'SUBFUSIL AP', dmg: 25, pellets: 1, spread: 0.035, delay: 115, mag: 25, reload: 1100, color: '#ec4899', heavy: false }
  ];

  let primaryIdx = 0;
  let secondaryIdx = 2;
  let aiLevel = 3;

  function renderWeaponsShop() {
    const box = document.getElementById('weaponsList');
    box.innerHTML = WEAPONS.map(function(w, i) {
      const sel = i === primaryIdx ? 'active' : '';
      return '<div class="w-card ' + sel + '" onclick="selectGun(' + i + ')">' +
        '<div class="w-c-top"><span class="w-c-name">' + w.name + '</span><span class="w-c-tag">' + w.tag + '</span></div>' +
        '<div class="w-c-desc">DAÑO: ' + (w.dmg * w.pellets) + ' • BALAS: ' + w.mag + '</div>' +
      '</div>';
    }).join('');
  }

  window.selectGun = function(idx) {
    primaryIdx = idx;
    secondaryIdx = idx === 2 ? 1 : 2;
    renderWeaponsShop();
  };

  window.setDiff = function(lv) {
    aiLevel = lv;
    const labels = { 1: 'ZOMBIE IA', 2: 'ESQUELETO IA', 3: 'HEROBRINE IA', 4: 'WITHER BOSS IA' };
    document.getElementById('eNameTxt').textContent = labels[lv];
    document.querySelectorAll('.d-btn').forEach(function(b) {
      b.classList.toggle('active', Number(b.getAttribute('data-lv')) === lv);
    });
  };

  const MAP_SIZE = 16;
  let worldGrid = [];
  let blockHp = {};

  function initArenaGrid() {
    const template = [
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
      [1,0,0,0,0,0,0,3,3,0,0,0,0,0,0,1],
      [1,0,0,0,0,2,0,0,0,0,2,0,0,0,0,1],
      [1,0,0,2,2,0,0,0,0,0,0,2,2,0,0,1],
      [1,0,0,2,0,0,0,5,0,0,0,0,2,0,0,1],
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
      [1,0,0,0,0,0,3,0,0,3,0,0,0,0,0,1],
      [1,3,0,0,0,0,0,0,0,0,0,0,0,0,3,1],
      [1,3,0,0,0,0,0,0,0,0,0,0,0,0,3,1],
      [1,0,0,0,0,0,3,0,0,3,0,0,0,0,0,1],
      [1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
      [1,0,0,2,0,0,0,0,5,0,0,0,2,0,0,1],
      [1,0,0,2,2,0,0,0,0,0,0,2,2,0,0,1],
      [1,0,0,0,0,2,0,0,0,0,2,0,0,0,0,1],
      [1,0,0,0,0,0,0,3,3,0,0,0,0,0,0,1],
      [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
    ];
    worldGrid = template.map(function(r) { return r.slice(); });
    blockHp = {};
  }

  let round = 1;
  let pScore = 0;
  let eScore = 0;
  let roundSec = 60;
  let matchRunning = false;
  let scopeActive = false;
  let recoilOffset = 0;
  let muzzleFlashFrames = 0;
  let walkBob = 0;
  let turnKeyDir = 0;

  let player = null;
  let enemy = null;
  let tntList = [];
  let floatingHits = [];

  function resetFighters() {
    const w1 = Object.assign({}, WEAPONS[primaryIdx]);
    const w2 = Object.assign({}, WEAPONS[secondaryIdx]);
    player = {
      x: 2.5,
      y: 2.5,
      angle: 0.78,
      pitch: 0,
      zJump: 0,
      vz: 0,
      hp: 200,
      maxHp: 200,
      shield: 100,
      maxShield: 100,
      guns: [w1, w2],
      gIdx: 0,
      ammo: [w1.mag, w2.mag],
      reloading: false,
      reloadEnd: 0,
      lastShot: 0,
      gloo: 4,
      apples: 2,
      tnt: 2
    };
    enemy = {
      x: 13.5,
      y: 13.5,
      angle: -2.35,
      hp: 200,
      maxHp: 200,
      shield: 100,
      maxShield: 100,
      lastShot: 0,
      strafeDir: 1,
      nextThink: 0,
      gloo: 3,
      apples: 2,
      hitFlash: 0,
      muzzle: 0
    };
    tntList = [];
    floatingHits = [];
    scopeActive = false;
    document.getElementById('scopeMask').classList.remove('active');
    document.getElementById('btnScope').classList.remove('gloo');
    updateHud();
  }

  window.openArmory = function() {
    matchRunning = false;
    renderWeaponsShop();
    document.getElementById('shopOverlay').classList.add('open');
  };

  window.startRoundFromShop = function() {
    ensureAudio();
    document.getElementById('shopOverlay').classList.remove('open');
    initArenaGrid();
    resetFighters();
    roundSec = 60;
    matchRunning = true;
  };

  window.resetFullMatch = function() {
    pScore = 0;
    eScore = 0;
    round = 1;
    document.getElementById('endOverlay').classList.remove('open');
    openArmory();
  };

  function showPopupBanner(text, bg) {
    const el = document.getElementById('bannerPop');
    el.textContent = text;
    if (bg) el.style.background = bg;
    el.classList.add('show');
    setTimeout(function() { el.classList.remove('show'); }, 1500);
  }

  function updateHud() {
    if (!player || !enemy) return;
    document.getElementById('pHpBar').style.width = ((player.hp / player.maxHp) * 100) + '%';
    document.getElementById('pShBar').style.width = ((player.shield / player.maxShield) * 100) + '%';
    document.getElementById('pHpNum').textContent = Math.ceil(player.hp);

    document.getElementById('eHpBar').style.width = ((enemy.hp / enemy.maxHp) * 100) + '%';
    document.getElementById('eShBar').style.width = ((enemy.shield / enemy.maxShield) * 100) + '%';
    document.getElementById('eHpNum').textContent = Math.ceil(enemy.hp);

    document.getElementById('scP').textContent = pScore;
    document.getElementById('scE').textContent = eScore;
    document.getElementById('rNum').textContent = round;

    document.getElementById('cntGloo').textContent = player.gloo;
    document.getElementById('cntApple').textContent = player.apples;
    document.getElementById('cntTnt').textContent = player.tnt;

    const g = player.guns[player.gIdx];
    document.getElementById('gunTitle').textContent = g.name;
    document.getElementById('gunAmmo').textContent = player.reloading ? 'RECARGANDO...' : (player.ammo[player.gIdx] + ' / ∞');
  }

  function isWall(x, y) {
    const gx = Math.floor(x);
    const gy = Math.floor(y);
    if (gx < 0 || gx >= MAP_SIZE || gy < 0 || gy >= MAP_SIZE) return true;
    return worldGrid[gy][gx] !== 0;
  }

  function moveEntity(ent, dx, dy) {
    const pad = 0.28;
    const nx = ent.x + dx;
    const ny = ent.y + dy;
    if (!isWall(nx + (dx > 0 ? pad : -pad), ent.y)) ent.x = nx;
    if (!isWall(ent.x, ny + (dy > 0 ? pad : -pad))) ent.y = ny;
  }

  window.placeVoxelBlock = function() {
    if (!matchRunning || player.gloo <= 0) return;
    const tx = Math.floor(player.x + Math.cos(player.angle) * 1.45);
    const ty = Math.floor(player.y + Math.sin(player.angle) * 1.45);
    if (tx <= 0 || tx >= MAP_SIZE - 1 || ty <= 0 || ty >= MAP_SIZE - 1) return;
    if (Math.floor(enemy.x) === tx && Math.floor(enemy.y) === ty) return;
    if (worldGrid[ty][tx] === 0) {
      worldGrid[ty][tx] = 4;
      blockHp[ty + ',' + tx] = 140;
      player.gloo--;
      playSfx('block');
      updateHud();
    }
  };

  window.eatGoldenApple = function() {
    if (!matchRunning || player.apples <= 0 || player.hp >= player.maxHp) return;
    player.apples--;
    player.hp = Math.min(player.maxHp, player.hp + 85);
    player.shield = Math.min(player.maxShield, player.shield + 50);
    playSfx('block');
    showPopupBanner('🍎 +85 HP MANZANA DORADA', 'rgba(22, 163, 74, 0.92)');
    updateHud();
  };

  window.throwTntBlock = function() {
    if (!matchRunning || player.tnt <= 0) return;
    player.tnt--;
    tntList.push({
      x: player.x + Math.cos(player.angle) * 0.6,
      y: player.y + Math.sin(player.angle) * 0.6,
      vx: Math.cos(player.angle) * 0.14,
      vy: Math.sin(player.angle) * 0.14,
      timer: 55
    });
    playSfx('block');
    updateHud();
  };

  window.toggleScope = function() {
    scopeActive = !scopeActive;
    document.getElementById('scopeMask').classList.toggle('active', scopeActive);
    document.getElementById('btnScope').classList.toggle('gloo', scopeActive);
  };

  window.doJump = function() {
    if (!matchRunning || player.zJump > 0.01) return;
    player.vz = 0.12;
  };

  window.swapWeapon = function() {
    if (!matchRunning || player.reloading) return;
    player.gIdx = player.gIdx === 0 ? 1 : 0;
    updateHud();
  };

  window.triggerReload = function() {
    if (!matchRunning) return;
    const g = player.guns[player.gIdx];
    if (player.reloading || player.ammo[player.gIdx] >= g.mag) return;
    player.reloading = true;
    player.reloadEnd = performance.now() + g.reload;
    updateHud();
  };

  window.setTurnKey = function(dir) {
    turnKeyDir = dir;
  };

  function explodeBlockArea(cx, cy) {
    playSfx('boom');
    recoilOffset = 14;
    for (let y = Math.max(1, Math.floor(cy) - 2); y <= Math.min(MAP_SIZE - 2, Math.floor(cy) + 2); y++) {
      for (let x = Math.max(1, Math.floor(cx) - 2); x <= Math.min(MAP_SIZE - 2, Math.floor(cx) + 2); x++) {
        if (worldGrid[y][x] === 4 || worldGrid[y][x] === 2 || worldGrid[y][x] === 5) {
          worldGrid[y][x] = 0;
        }
      }
    }
    [player, enemy].forEach(function(ent, idx) {
      const d = Math.hypot(ent.x - cx, ent.y - cy);
      if (d < 2.8) {
        const dmg = Math.round((1 - d / 2.8) * 125);
        damageFighter(ent, dmg, dmg > 80, idx === 1);
      }
    });
  }

  function damageFighter(target, rawDmg, isHeadshot, isEnemyTarget) {
    let dmg = rawDmg;
    if (target.shield > 0) {
      const absorb = Math.min(target.shield, Math.round(dmg * 0.45));
      target.shield -= absorb;
      dmg -= Math.round(absorb * 0.6);
    }
    target.hp = Math.max(0, target.hp - dmg);

    if (isEnemyTarget) {
      enemy.hitFlash = 6;
      floatingHits.push({
        text: (isHeadshot ? '¡ROJO! -' : '-') + dmg,
        color: isHeadshot ? '#ff0055' : '#fde047',
        life: 24,
        yOff: 0
      });
      if (isHeadshot) {
        playSfx('headshot');
        showPopupBanner('🎯 ¡TODO ROJO! -' + dmg + ' HEADSHOT', 'rgba(255, 0, 85, 0.94)');
      }
    } else {
      const fl = document.getElementById('dmgFlash');
      fl.style.opacity = '1';
      setTimeout(function() { fl.style.opacity = '0'; }, 140);
    }

    updateHud();

    if (target.hp <= 0 && matchRunning) {
      finishRound(isEnemyTarget);
    }
  }

  function finishRound(playerWon) {
    matchRunning = false;
    if (playerWon) {
      pScore++;
      showPopupBanner('🏆 ¡RONDA GANADA! KO VOXEL', 'rgba(0, 255, 204, 0.9)');
    } else {
      eScore++;
      showPopupBanner('💀 CAÍSTE EN LA ARENA', 'rgba(185, 28, 28, 0.92)');
    }
    updateHud();

    setTimeout(function() {
      if (pScore >= 5 || eScore >= 5) {
        const wonMatch = pScore >= 5;
        document.getElementById('endTag').textContent = 'MARCADOR: ' + pScore + ' - ' + eScore;
        document.getElementById('endTitle').textContent = wonMatch ? '🏆 ¡BOOYAH! VICTORIA 3D' : '💀 DERROTA EN LA JAULA';
        document.getElementById('endSub').textContent = wonMatch
          ? 'Eliminaste a Herobrine IA en el duelo Voxel.'
          : 'Herobrine IA dominó la arena. ¡Inténtalo de nuevo!';
        document.getElementById('endOverlay').classList.add('open');
      } else {
        round++;
        if (round % 2 === 1) openArmory();
        else {
          initArenaGrid();
          resetFighters();
          roundSec = 60;
          matchRunning = true;
        }
      }
    }, 2000);
  }

  function firePlayerGun() {
    const now = performance.now();
    if (!matchRunning) return;
    const g = player.guns[player.gIdx];

    if (player.reloading) {
      if (now >= player.reloadEnd) {
        player.reloading = false;
        player.ammo[player.gIdx] = g.mag;
        updateHud();
      } else return;
    }

    if (player.ammo[player.gIdx] <= 0) {
      triggerReload();
      return;
    }

    if (now - player.lastShot < g.delay) return;
    player.lastShot = now;
    player.ammo[player.gIdx]--;
    recoilOffset = g.heavy ? 10 : 5;
    muzzleFlashFrames = 3;
    playSfx(g.heavy ? 'heavy' : 'shot');

    const effSpread = scopeActive ? g.spread * 0.35 : g.spread;

    for (let p = 0; p < g.pellets; p++) {
      const rayAng = player.angle + (Math.random() - 0.5) * effSpread;
      castBulletRay(player.x, player.y, rayAng, g.dmg);
    }

    if (player.ammo[player.gIdx] <= 0) triggerReload();
    updateHud();
  }

  function castBulletRay(ox, oy, ang, dmg) {
    const cos = Math.cos(ang);
    const sin = Math.sin(ang);
    const step = 0.05;
    let dist = 0;

    while (dist < 16) {
      dist += step;
      const rx = ox + cos * dist;
      const ry = oy + sin * dist;

      const dEnemy = Math.hypot(rx - enemy.x, ry - enemy.y);
      if (dEnemy < 0.36) {
        const isHead = player.pitch > -8 && player.pitch < 28 && (Math.random() < 0.38 || scopeActive);
        const finalDmg = Math.round(dmg * (isHead ? 2.2 : 1));
        damageFighter(enemy, finalDmg, isHead, true);
        return;
      }

      const gx = Math.floor(rx);
      const gy = Math.floor(ry);
      if (gx < 0 || gx >= MAP_SIZE || gy < 0 || gy >= MAP_SIZE) return;
      const cell = worldGrid[gy][gx];
      if (cell !== 0) {
        if (cell === 5) {
          worldGrid[gy][gx] = 0;
          explodeBlockArea(gx + 0.5, gy + 0.5);
        } else if (cell === 4) {
          const key = gy + ',' + gx;
          blockHp[key] = (blockHp[key] || 140) - dmg;
          if (blockHp[key] <= 0) worldGrid[gy][gx] = 0;
        }
        return;
      }
    }
  }

  function hasClearLine(x1, y1, x2, y2) {
    const steps = 28;
    for (let i = 1; i < steps; i++) {
      const tx = x1 + (x2 - x1) * (i / steps);
      const ty = y1 + (y2 - y1) * (i / steps);
      if (isWall(tx, ty)) return false;
    }
    return true;
  }

  function updateAiLogic(now) {
    if (!matchRunning) return;
    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const dist = Math.hypot(dx, dy);
    const toPlayer = Math.atan2(dy, dx);
    const canSee = hasClearLine(enemy.x, enemy.y, player.x, player.y);

    if (now > enemy.nextThink) {
      enemy.nextThink = now + (480 - aiLevel * 75);
      if (Math.random() < 0.45) enemy.strafeDir *= -1;

      if (enemy.hp < 85 && enemy.gloo > 0 && canSee && dist < 6) {
        const bx = Math.floor(enemy.x + Math.cos(toPlayer) * 1.2);
        const by = Math.floor(enemy.y + Math.sin(toPlayer) * 1.2);
        if (worldGrid[by] && worldGrid[by][bx] === 0) {
          worldGrid[by][bx] = 4;
          blockHp[by + ',' + bx] = 140;
          enemy.gloo--;
        }
      }
      if (enemy.hp < 75 && enemy.apples > 0 && !canSee) {
        enemy.apples--;
        enemy.hp = Math.min(enemy.maxHp, enemy.hp + 75);
        updateHud();
      }
    }

    const spd = 0.032 + aiLevel * 0.006;
    let forward = 0;
    if (!canSee || dist > 5.5) forward = 1;
    else if (dist < 2.6) forward = -0.8;

    const strafeAng = toPlayer + (Math.PI / 2) * enemy.strafeDir;
    const vx = Math.cos(toPlayer) * forward * spd + Math.cos(strafeAng) * spd * 0.8;
    const vy = Math.sin(toPlayer) * forward * spd + Math.sin(strafeAng) * spd * 0.8;
    moveEntity(enemy, vx, vy);

    const fireInterval = 680 - aiLevel * 110;
    if (canSee && now - enemy.lastShot > fireInterval) {
      enemy.lastShot = now;
      enemy.muzzle = 3;
      playSfx('shot');
      const hitProb = 0.22 + aiLevel * 0.12;
      if (Math.random() < hitProb) {
        const isCrit = Math.random() < 0.18;
        damageFighter(player, isCrit ? 34 : 18, isCrit, false);
      }
    }
  }

  const keys = {};
  window.addEventListener('keydown', function(e) {
    keys[e.code] = true;
    if (e.code === 'Space') doJump();
    if (e.code === 'KeyR') triggerReload();
    if (e.code === 'KeyE') placeVoxelBlock();
    if (e.code === 'KeyG') throwTntBlock();
    if (e.code === 'KeyH') eatGoldenApple();
    if (e.code === 'KeyQ') swapWeapon();
  });
  window.addEventListener('keyup', function(e) { keys[e.code] = false; });

  const leftStick = { active: false, id: null, dx: 0, dy: 0 };
  const rightStick = { active: false, id: null, dx: 0, dy: 0 };

  function setupStick(padEl, knobEl, stick) {
    padEl.addEventListener('pointerdown', function(e) {
      e.preventDefault();
      ensureAudio();
      stick.active = true;
      stick.id = e.pointerId;
      padEl.setPointerCapture(e.pointerId);
      moveStickKnob(e, padEl, knobEl, stick);
    });
    padEl.addEventListener('pointermove', function(e) {
      if (!stick.active || e.pointerId !== stick.id) return;
      moveStickKnob(e, padEl, knobEl, stick);
    });
    const end = function(e) {
      if (e.pointerId !== stick.id) return;
      stick.active = false;
      stick.dx = 0;
      stick.dy = 0;
      knobEl.style.transform = 'translate(0px,0px)';
    };
    padEl.addEventListener('pointerup', end);
    padEl.addEventListener('pointercancel', end);
  }

  function moveStickKnob(e, padEl, knobEl, stick) {
    const r = padEl.getBoundingClientRect();
    let dx = e.clientX - (r.left + r.width / 2);
    let dy = e.clientY - (r.top + r.height / 2);
    const max = 34;
    const d = Math.hypot(dx, dy);
    if (d > max) { dx = (dx / d) * max; dy = (dy / d) * max; }
    knobEl.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px)';
    stick.dx = dx / max;
    stick.dy = dy / max;
  }

  setupStick(document.getElementById('leftPad'), document.getElementById('leftKnob'), leftStick);
  setupStick(document.getElementById('rightPad'), document.getElementById('rightKnob'), rightStick);

  let lookTouchId = null;
  let lastLookX = 0;
  let lastLookY = 0;

  canvas.addEventListener('pointerdown', function(e) {
    e.preventDefault();
    ensureAudio();
    lookTouchId = e.pointerId;
    lastLookX = e.clientX;
    lastLookY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', function(e) {
    if (e.pointerId !== lookTouchId) return;
    const dx = e.clientX - lastLookX;
    const dy = e.clientY - lastLookY;
    lastLookX = e.clientX;
    lastLookY = e.clientY;
    const sens = scopeActive ? 0.0035 : 0.0075;
    player.angle += dx * sens;
    player.pitch = Math.max(-45, Math.min(45, player.pitch - dy * 0.45));
  });
  const endLook = function(e) {
    if (e.pointerId === lookTouchId) lookTouchId = null;
  };
  canvas.addEventListener('pointerup', endLook);
  canvas.addEventListener('pointercancel', endLook);

  setInterval(function() {
    if (!matchRunning) return;
    if (roundSec > 0) {
      roundSec--;
      document.getElementById('rClock').textContent = '00:' + String(roundSec).padStart(2, '0');
    } else {
      finishRound(player.hp >= enemy.hp);
    }
  }, 1000);

  function render3DScene() {
    const fov = scopeActive ? (Math.PI / 5.5) : (Math.PI / 3);
    const halfH = H / 2 + player.pitch + player.zJump * 45 + recoilOffset;

    const skyGrad = ctx.createLinearGradient(0, 0, 0, Math.max(10, halfH));
    skyGrad.addColorStop(0, '#05010d');
    skyGrad.addColorStop(1, '#1e0b3b');
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, Math.max(0, halfH));

    const floorGrad = ctx.createLinearGradient(0, Math.max(0, halfH), 0, H);
    floorGrad.addColorStop(0, '#120724');
    floorGrad.addColorStop(1, '#2e1065');
    ctx.fillStyle = floorGrad;
    ctx.fillRect(0, Math.max(0, halfH), W, H - Math.max(0, halfH));

    for (let col = 0; col < W; col++) {
      const cameraX = 2 * col / W - 1;
      const rayAngle = player.angle + Math.atan(cameraX * Math.tan(fov / 2));
      const rayDirX = Math.cos(rayAngle);
      const rayDirY = Math.sin(rayAngle);

      let mapX = Math.floor(player.x);
      let mapY = Math.floor(player.y);

      const deltaDistX = Math.abs(1 / (rayDirX || 0.00001));
      const deltaDistY = Math.abs(1 / (rayDirY || 0.00001));

      let stepX, sideDistX;
      let stepY, sideDistY;

      if (rayDirX < 0) {
        stepX = -1;
        sideDistX = (player.x - mapX) * deltaDistX;
      } else {
        stepX = 1;
        sideDistX = (mapX + 1.0 - player.x) * deltaDistX;
      }
      if (rayDirY < 0) {
        stepY = -1;
        sideDistY = (player.y - mapY) * deltaDistY;
      } else {
        stepY = 1;
        sideDistY = (mapY + 1.0 - player.y) * deltaDistY;
      }

      let hit = 0;
      let side = 0;
      let steps = 0;

      while (hit === 0 && steps < 32) {
        steps++;
        if (sideDistX < sideDistY) {
          sideDistX += deltaDistX;
          mapX += stepX;
          side = 0;
        } else {
          sideDistY += deltaDistY;
          mapY += stepY;
          side = 1;
        }
        if (mapX >= 0 && mapX < MAP_SIZE && mapY >= 0 && mapY < MAP_SIZE) {
          if (worldGrid[mapY][mapX] > 0) hit = worldGrid[mapY][mapX];
        } else {
          hit = 1;
        }
      }

      let perpWallDist = side === 0
        ? (mapX - player.x + (1 - stepX) / 2) / (rayDirX || 0.0001)
        : (mapY - player.y + (1 - stepY) / 2) / (rayDirY || 0.0001);
      perpWallDist = Math.max(0.15, perpWallDist * Math.cos(rayAngle - player.angle));
      zBuffer[col] = perpWallDist;

      const lineH = Math.floor((H / perpWallDist) * (scopeActive ? 1.55 : 1));
      const drawStart = Math.floor(halfH - lineH / 2);

      let wallX = side === 0 ? player.y + perpWallDist * rayDirY : player.x + perpWallDist * rayDirX;
      wallX -= Math.floor(wallX);
      let texX = Math.floor(wallX * TEX_SIZE);
      if (texX < 0) texX = 0;
      if (texX >= TEX_SIZE) texX = TEX_SIZE - 1;

      const tex = textures[hit] || textures[1];
      ctx.drawImage(tex, texX, 0, 1, TEX_SIZE, col, drawStart, 1, lineH);

      if (side === 1 || perpWallDist > 4) {
        const shade = Math.min(0.72, (side === 1 ? 0.22 : 0) + perpWallDist * 0.04);
        ctx.fillStyle = 'rgba(5, 2, 12, ' + shade.toFixed(2) + ')';
        ctx.fillRect(col, drawStart, 1, lineH);
      }
    }

    render3DSprite(enemy.x, enemy.y, 'enemy', halfH, fov);
    tntList.forEach(function(t) {
      render3DSprite(t.x, t.y, 'tnt', halfH, fov);
    });

    drawCrosshair();
    if (!scopeActive) drawVoxelWeaponViewmodel();
    drawFloatingHits();
    renderMinimap();
  }

  function render3DSprite(sx, sy, kind, halfH, fov) {
    const dx = sx - player.x;
    const dy = sy - player.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 0.25) return;

    let spriteAngle = Math.atan2(dy, dx) - player.angle;
    while (spriteAngle > Math.PI) spriteAngle -= Math.PI * 2;
    while (spriteAngle < -Math.PI) spriteAngle += Math.PI * 2;

    if (Math.abs(spriteAngle) > fov * 0.75) return;

    const screenX = Math.floor(W / 2 + Math.tan(spriteAngle) / Math.tan(fov / 2) * (W / 2));
    const spriteH = Math.floor((H / dist) * (scopeActive ? 1.35 : 0.88));
    const spriteW = Math.floor(spriteH * (kind === 'tnt' ? 0.55 : 0.58));
    const topY = Math.floor(halfH - spriteH / 2);
    const leftX = Math.floor(screenX - spriteW / 2);

    const centerCol = Math.max(0, Math.min(W - 1, screenX));
    if (dist >= zBuffer[centerCol] + 0.15) return;

    if (kind === 'tnt') {
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(leftX, topY + spriteH * 0.3, spriteW, spriteH * 0.5);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(leftX, topY + spriteH * 0.45, spriteW, spriteH * 0.18);
      return;
    }

    const headH = Math.floor(spriteH * 0.28);
    const headW = Math.floor(spriteW * 0.68);
    const headX = Math.floor(screenX - headW / 2);
    const bodyY = topY + headH;
    const bodyH = Math.floor(spriteH * 0.42);
    const legsY = bodyY + bodyH;
    const legsH = Math.floor(spriteH * 0.3);

    ctx.fillStyle = enemy.hitFlash > 0 ? '#ffffff' : '#1e1b4b';
    ctx.fillRect(leftX + spriteW * 0.18, legsY, spriteW * 0.28, legsH);
    ctx.fillRect(leftX + spriteW * 0.54, legsY, spriteW * 0.28, legsH);

    ctx.fillStyle = enemy.hitFlash > 0 ? '#ff0055' : '#7c3aed';
    ctx.fillRect(leftX + spriteW * 0.12, bodyY, spriteW * 0.76, bodyH);

    ctx.fillStyle = enemy.hitFlash > 0 ? '#ff0055' : '#311042';
    ctx.fillRect(headX, topY, headW, headH);
    ctx.strokeStyle = '#ff0055';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(headX, topY, headW, headH);

    ctx.fillStyle = '#00ffcc';
    const eyeY = topY + Math.floor(headH * 0.42);
    const eyeW = Math.max(2, Math.floor(headW * 0.22));
    ctx.fillRect(headX + Math.floor(headW * 0.18), eyeY, eyeW, Math.max(2, Math.floor(headH * 0.18)));
    ctx.fillRect(headX + Math.floor(headW * 0.6), eyeY, eyeW, Math.max(2, Math.floor(headH * 0.18)));

    if (enemy.muzzle > 0) {
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(leftX + spriteW * 0.85, bodyY + bodyH * 0.4, Math.max(4, spriteW * 0.22), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawCrosshair() {
    const cx = W / 2;
    const cy = H / 2;
    ctx.strokeStyle = '#00ffcc';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(cx - 10, cy); ctx.lineTo(cx - 4, cy);
    ctx.moveTo(cx + 4, cy); ctx.lineTo(cx + 10, cy);
    ctx.moveTo(cx, cy - 10); ctx.lineTo(cx, cy - 4);
    ctx.moveTo(cx, cy + 4); ctx.lineTo(cx, cy + 10);
    ctx.stroke();

    ctx.fillStyle = '#ff0055';
    ctx.fillRect(cx - 1, cy - 1, 2, 2);
  }

  function drawVoxelWeaponViewmodel() {
    const g = player.guns[player.gIdx];
    const bobX = Math.cos(walkBob) * 6;
    const bobY = Math.abs(Math.sin(walkBob)) * 5 + recoilOffset * 1.6 + (player.reloading ? 28 : 0);

    ctx.save();
    ctx.translate(W - 95 + bobX, H - 68 + bobY);

    if (muzzleFlashFrames > 0) {
      ctx.fillStyle = '#fde047';
      ctx.beginPath();
      ctx.arc(-18, -14, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ff0055';
      ctx.beginPath();
      ctx.arc(-18, -14, 10, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = '#1e1b4b';
    ctx.strokeStyle = g.color;
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(-22, -16);
    ctx.lineTo(55, 25);
    ctx.lineTo(55, 65);
    ctx.lineTo(-28, 12);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = g.color;
    ctx.fillRect(-16, -10, 36, 8);

    ctx.restore();
  }

  function drawFloatingHits() {
    for (let i = floatingHits.length - 1; i >= 0; i--) {
      const f = floatingHits[i];
      f.yOff -= 1.1;
      f.life--;
      ctx.save();
      ctx.font = '900 13px monospace';
      ctx.fillStyle = f.color;
      ctx.textAlign = 'center';
      ctx.fillText(f.text, W / 2, H / 2 - 22 + f.yOff);
      ctx.restore();
      if (f.life <= 0) floatingHits.splice(i, 1);
    }
  }

  function renderMinimap() {
    mCtx.fillStyle = '#070312';
    mCtx.fillRect(0, 0, 78, 78);
    const cellW = 78 / MAP_SIZE;

    for (let y = 0; y < MAP_SIZE; y++) {
      for (let x = 0; x < MAP_SIZE; x++) {
        const v = worldGrid[y][x];
        if (v !== 0) {
          mCtx.fillStyle = v === 4 ? '#00ffcc' : v === 5 ? '#ff0055' : '#581c87';
          mCtx.fillRect(x * cellW, y * cellW, cellW, cellW);
        }
      }
    }

    mCtx.fillStyle = '#00ffcc';
    mCtx.beginPath();
    mCtx.arc(player.x * cellW, player.y * cellW, 3, 0, Math.PI * 2);
    mCtx.fill();

    mCtx.strokeStyle = 'rgba(0,255,204,0.5)';
    mCtx.beginPath();
    mCtx.moveTo(player.x * cellW, player.y * cellW);
    mCtx.lineTo((player.x + Math.cos(player.angle) * 3) * cellW, (player.y + Math.sin(player.angle) * 3) * cellW);
    mCtx.stroke();

    mCtx.fillStyle = '#ff0055';
    mCtx.beginPath();
    mCtx.arc(enemy.x * cellW, enemy.y * cellW, 3, 0, Math.PI * 2);
    mCtx.fill();
  }

  function stepGame(now) {
    if (recoilOffset > 0) recoilOffset *= 0.78;
    if (muzzleFlashFrames > 0) muzzleFlashFrames--;
    if (enemy && enemy.hitFlash > 0) enemy.hitFlash--;
    if (enemy && enemy.muzzle > 0) enemy.muzzle--;

    if (matchRunning && player) {
      let forward = -leftStick.dy;
      let strafe = leftStick.dx;
      if (keys['KeyW'] || keys['ArrowUp']) forward += 1;
      if (keys['KeyS'] || keys['ArrowDown']) forward -= 1;
      if (keys['KeyA']) strafe -= 1;
      if (keys['KeyD']) strafe += 1;

      if (keys['ArrowLeft'] || turnKeyDir < 0) player.angle -= 0.048;
      if (keys['ArrowRight'] || turnKeyDir > 0) player.angle += 0.048;

      if (rightStick.active) {
        const rotSpd = scopeActive ? 0.032 : 0.062;
        player.angle += rightStick.dx * rotSpd;
        player.pitch = Math.max(-40, Math.min(40, player.pitch - rightStick.dy * 1.4));
        if (Math.hypot(rightStick.dx, rightStick.dy) > 0.25) {
          firePlayerGun();
        }
      }

      const spd = 0.055;
      const moveX = (Math.cos(player.angle) * forward + Math.cos(player.angle + Math.PI / 2) * strafe) * spd;
      const moveY = (Math.sin(player.angle) * forward + Math.sin(player.angle + Math.PI / 2) * strafe) * spd;
      if (Math.hypot(moveX, moveY) > 0.005) {
        moveEntity(player, moveX, moveY);
        walkBob += 0.22;
      }

      if (player.zJump > 0 || player.vz !== 0) {
        player.zJump += player.vz;
        player.vz -= 0.012;
        if (player.zJump <= 0) {
          player.zJump = 0;
          player.vz = 0;
        }
      }

      if (player.reloading && now >= player.reloadEnd) {
        player.reloading = false;
        player.ammo[player.gIdx] = player.guns[player.gIdx].mag;
        updateHud();
      }

      for (let i = tntList.length - 1; i >= 0; i--) {
        const t = tntList[i];
        if (!isWall(t.x + t.vx, t.y)) t.x += t.vx; else t.vx *= -0.6;
        if (!isWall(t.x, t.y + t.vy)) t.y += t.vy; else t.vy *= -0.6;
        t.vx *= 0.92;
        t.vy *= 0.92;
        t.timer--;
        if (t.timer <= 0) {
          explodeBlockArea(t.x, t.y);
          tntList.splice(i, 1);
        }
      }

      updateAiLogic(now);
    }

    if (player && enemy) {
      render3DScene();
    }
    requestAnimationFrame(stepGame);
  }

  initArenaGrid();
  resetFighters();
  renderWeaponsShop();
  requestAnimationFrame(stepGame);
})();
</script>`;
}

export default {
  name: ["shooter", "lobosolitario", "lonewolf", "freefire", "ff", "mineshooter"],
  category: "games",
  description: "Juega el Shooter 3D Voxel estilo Minecraft x Lobo Solitario en pantalla completa.",
  groupOnly: false,
  ownerOnly: false,

  async run(ctx: CommandContext) {
    const { sock, from, msg, reply, react } = ctx;
    const playerName = msg?.pushName || "Steve";

    await react("⛏️").catch(() => undefined);

    try {
      const HTML = buildVoxelShooterHtml(playerName);

      const data = {
        response_id: "AuraVoxelShooter3D_" + Date.now(),
        sections: [
          {
            __typename: "GenAIUnifiedResponseSection",
            view_model: {
              __typename: "GenAISingleLayoutViewModel",
              primitive: {
                __typename: "GenAIBotProgressStatusPrimitive",
                title: "⛏️ JUGAR MINECRAFT SHOOTER 3D (PANTALLA COMPLETA)",
                is_in_progress: true,
              },
            },
          },
        ],
        embedded_screens: [
          {
            title: "⛏️ MINE-SHOOTER 3D: LOBO SOLITARIO",
            content: [
              {
                __typename: "FOAIDNixelButtonSheets",
                tabs: [
                  {
                    id: "tab_0",
                    tab_header: "Arena 3D",
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

      const messageId =
        typeof (sock as any).generateMessageTag === "function"
          ? await (sock as any).generateMessageTag()
          : randomBytes(8).toString("hex").toUpperCase();

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
        { messageId },
      );

      await react("✅").catch(() => undefined);
    } catch (error) {
      await react("❌").catch(() => undefined);
      await reply(
        `${fytBold("Error")} al desplegar el Shooter 3D: ${error instanceof Error ? error.message : String(error)}`,
      ).catch(() => undefined);
    }
  },
};
