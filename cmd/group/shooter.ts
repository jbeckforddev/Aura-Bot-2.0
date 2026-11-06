import { randomBytes } from "node:crypto";
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

function buildLoneWolfShooterHtml(playerName: string): string {
  const safePlayer = JSON.stringify(playerName || "Jugador");

  return `<style>
* { -webkit-tap-highlight-color: transparent; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: 100%; height: 100%; overflow: hidden; background: #04020a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #f5f3ff; touch-action: none; }
.viewport { position: fixed; inset: 0; display: flex; flex-direction: column; background: radial-gradient(circle at 50% 20%, #16092e 0%, #04020a 80%); overflow: hidden; }
.hud-top { height: 54px; padding: 6px 12px; background: rgba(10, 4, 22, 0.92); border-bottom: 1.5px solid #3b1d6e; display: flex; justify-content: space-between; align-items: center; z-index: 20; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.8); }
.p-card { display: flex; align-items: center; gap: 8px; width: 38%; max-width: 190px; }
.p-card.right { flex-direction: row-reverse; text-align: right; }
.ava-box { width: 34px; height: 34px; border-radius: 9px; background: linear-gradient(135deg, #7c3aed, #db2777); display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 900; border: 1.5px solid #e9d5ff; box-shadow: 0 0 12px rgba(168, 85, 247, 0.5); flex: none; }
.ava-box.ai { background: linear-gradient(135deg, #ff0055, #7f1d1d); border-color: #fda4af; box-shadow: 0 0 12px rgba(255, 0, 85, 0.5); }
.bars { flex: 1; min-width: 0; }
.p-name { font-size: 10.5px; font-weight: 900; color: #fff; text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 3px; display: flex; justify-content: space-between; }
.p-card.right .p-name { flex-direction: row-reverse; }
.hp-track { width: 100%; height: 8px; background: #1a0b2e; border-radius: 4px; overflow: hidden; border: 1px solid #3b1d6e; margin-bottom: 2px; }
.hp-fill { height: 100%; width: 100%; background: linear-gradient(90deg, #00ffcc, #10b981); transition: width 0.12s ease-out; }
.hp-fill.ai { background: linear-gradient(90deg, #ff0055, #f97316); }
.ap-track { width: 100%; height: 4px; background: #120721; border-radius: 2px; overflow: hidden; }
.ap-fill { height: 100%; width: 100%; background: #38bdf8; transition: width 0.12s ease-out; }
.score-center { display: flex; flex-direction: column; align-items: center; justify-content: center; min-width: 92px; }
.score-board { display: flex; align-items: center; gap: 8px; background: #090314; border: 1.5px solid #581c87; padding: 3px 10px; border-radius: 10px; box-shadow: 0 0 15px rgba(139, 92, 246, 0.35); }
.sc-num { font-size: 18px; font-weight: 900; font-family: 'Courier New', monospace; }
.sc-num.p { color: #00ffcc; text-shadow: 0 0 8px rgba(0, 255, 204, 0.6); }
.sc-num.e { color: #ff0055; text-shadow: 0 0 8px rgba(255, 0, 85, 0.6); }
.sc-sep { font-size: 10px; color: #a78bfa; font-weight: 900; }
.timer-txt { font-size: 9.5px; font-weight: 800; color: #c4b5fd; margin-top: 2px; letter-spacing: 0.8px; font-family: 'Courier New', monospace; }
.arena-wrap { position: relative; flex: 1; width: 100%; overflow: hidden; display: flex; align-items: center; justify-content: center; background: #05020c; }
canvas#arena { width: 100%; height: 100%; display: block; }
.top-tools { position: absolute; top: 8px; left: 10px; right: 10px; display: flex; justify-content: space-between; pointer-events: none; z-index: 15; }
.tool-grp { display: flex; gap: 6px; pointer-events: auto; }
.mini-btn { background: rgba(18, 8, 36, 0.85); border: 1px solid #4c1d95; color: #e9d5ff; padding: 5px 9px; border-radius: 8px; font-size: 10px; font-weight: 900; cursor: pointer; backdrop-filter: blur(6px); text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 4px; }
.mini-btn:active { transform: scale(0.92); }
.mini-btn.active { border-color: #00ffcc; color: #00ffcc; }
.kill-banner { position: absolute; top: 46px; left: 50%; transform: translateX(-50%) scale(0.8); background: linear-gradient(135deg, rgba(255, 0, 85, 0.92), rgba(124, 58, 237, 0.92)); border: 1.5px solid #fff; padding: 6px 18px; border-radius: 999px; font-size: 13px; font-weight: 900; color: #fff; letter-spacing: 1.5px; text-transform: uppercase; box-shadow: 0 0 25px rgba(255, 0, 85, 0.8); opacity: 0; pointer-events: none; transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1); z-index: 18; white-space: nowrap; }
.kill-banner.show { opacity: 1; transform: translateX(-50%) scale(1); }
.controls-layer { position: absolute; inset: 0; pointer-events: none; z-index: 16; display: flex; flex-direction: column; justify-content: flex-end; padding: 12px; }
.hud-bottom { display: flex; justify-content: space-between; align-items: flex-end; width: 100%; pointer-events: none; }
.stick-zone { width: 130px; height: 130px; position: relative; pointer-events: auto; touch-action: none; }
.stick-base { position: absolute; left: 50%; top: 50%; width: 104px; height: 104px; margin-left: -52px; margin-top: -52px; border-radius: 50%; background: rgba(15, 7, 30, 0.55); border: 2px solid rgba(168, 85, 247, 0.45); box-shadow: inset 0 0 18px rgba(139, 92, 246, 0.25); display: flex; align-items: center; justify-content: center; }
.stick-base.fire-base { border-color: rgba(255, 0, 85, 0.55); box-shadow: inset 0 0 18px rgba(255, 0, 85, 0.3); }
.stick-nub { width: 44px; height: 44px; border-radius: 50%; background: radial-gradient(circle at 30% 30%, #e9d5ff, #7c3aed); border: 2px solid #fff; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.8), 0 0 12px #a855f7; display: flex; align-items: center; justify-content: center; font-size: 16px; transition: transform 0.04s linear; }
.stick-base.fire-base .stick-nub { background: radial-gradient(circle at 30% 30%, #ffe4e6, #ff0055); box-shadow: 0 4px 14px rgba(0, 0, 0, 0.8), 0 0 14px #ff0055; }
.center-dock { display: flex; flex-direction: column; align-items: center; gap: 6px; pointer-events: auto; margin-bottom: 2px; }
.tactical-row { display: flex; gap: 7px; align-items: center; }
.tac-btn { width: 46px; height: 46px; border-radius: 13px; background: rgba(17, 8, 34, 0.9); border: 1.5px solid #581c87; color: #fff; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; position: relative; box-shadow: 0 6px 16px rgba(0, 0, 0, 0.75); transition: transform 0.1s; }
.tac-btn:active { transform: scale(0.9); }
.tac-btn.gloo { border-color: #00ffcc; box-shadow: 0 0 14px rgba(0, 255, 204, 0.3); }
.tac-btn.med { border-color: #4ade80; }
.tac-btn.dash { border-color: #f59e0b; }
.tac-btn.nade { border-color: #ff0055; }
.tac-ico { font-size: 17px; line-height: 1; }
.tac-lbl { font-size: 8px; font-weight: 900; color: #c4b5fd; text-transform: uppercase; margin-top: 2px; }
.tac-count { position: absolute; top: -5px; right: -5px; background: #7c3aed; color: #fff; font-size: 9.5px; font-weight: 900; width: 18px; height: 18px; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 1.5px solid #04020a; font-family: 'Courier New', monospace; }
.weapon-bar { display: flex; align-items: center; gap: 8px; background: rgba(12, 5, 26, 0.92); border: 1.5px solid #4c1d95; padding: 5px 12px; border-radius: 12px; box-shadow: 0 6px 20px rgba(0, 0, 0, 0.8); cursor: pointer; }
.weapon-bar:active { transform: scale(0.96); }
.w-name { font-size: 11px; font-weight: 900; color: #00ffcc; text-transform: uppercase; letter-spacing: 0.6px; }
.w-ammo { font-size: 12px; font-weight: 900; color: #fff; font-family: 'Courier New', monospace; }
.w-reload-btn { background: #2e1065; border: 1px solid #7c3aed; color: #e9d5ff; padding: 3px 7px; border-radius: 6px; font-size: 9.5px; font-weight: 900; cursor: pointer; text-transform: uppercase; }
.modal-backdrop { position: fixed; inset: 0; background: rgba(4, 2, 10, 0.88); backdrop-filter: blur(8px); z-index: 50; display: none; align-items: center; justify-content: center; padding: 14px; }
.modal-backdrop.open { display: flex; }
.shop-card { width: 100%; max-width: 400px; background: linear-gradient(180deg, #170a30 0%, #090314 100%); border: 2px solid #7c3aed; border-radius: 20px; padding: 16px; box-shadow: 0 25px 60px rgba(0, 0, 0, 0.95), 0 0 35px rgba(139, 92, 246, 0.35); text-align: center; }
.shop-tag { display: inline-block; background: rgba(0, 255, 204, 0.14); color: #00ffcc; border: 1px solid rgba(0, 255, 204, 0.45); font-size: 9.5px; font-weight: 900; padding: 3px 10px; border-radius: 999px; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 6px; }
.shop-title { font-size: 18px; font-weight: 900; color: #fff; text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 4px; }
.shop-sub { font-size: 11.5px; color: #c4b5fd; margin-bottom: 12px; }
.w-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px; }
.w-option { background: #0e051f; border: 1.5px solid #351a63; border-radius: 13px; padding: 10px; text-align: left; cursor: pointer; transition: all 0.15s; position: relative; }
.w-option:hover, .w-option.selected { border-color: #00ffcc; background: rgba(0, 255, 204, 0.08); box-shadow: 0 0 16px rgba(0, 255, 204, 0.25); }
.w-opt-top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
.w-opt-name { font-size: 12px; font-weight: 900; color: #fff; }
.w-opt-type { font-size: 9px; font-weight: 800; color: #f0abfc; background: rgba(240, 171, 252, 0.15); padding: 2px 6px; border-radius: 4px; text-transform: uppercase; }
.w-opt-stats { font-size: 10px; color: #9378bc; font-family: 'Courier New', monospace; line-height: 1.35; }
.diff-bar { display: flex; gap: 5px; margin-bottom: 12px; background: #080312; padding: 4px; border-radius: 10px; border: 1px solid #261247; }
.diff-btn { flex: 1; background: transparent; border: none; color: #8b74b0; padding: 6px 4px; border-radius: 7px; font-size: 10px; font-weight: 900; cursor: pointer; text-transform: uppercase; }
.diff-btn.active { background: linear-gradient(135deg, #8b5cf6, #db2777); color: #fff; }
.start-btn { width: 100%; background: linear-gradient(135deg, #00ffcc, #059669); color: #04020a; border: none; padding: 12px; border-radius: 12px; font-size: 13px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; cursor: pointer; box-shadow: 0 6px 20px rgba(0, 255, 204, 0.4); }
.start-btn:active { transform: scale(0.97); }
</style>

<div class="viewport">
  <div class="hud-top">
    <div class="p-card">
      <div class="ava-box">🐺</div>
      <div class="bars">
        <div class="p-name"><span id="hudPlayerName"></span><span id="hudPlayerHpTxt">200</span></div>
        <div class="hp-track"><div class="hp-fill" id="hudPlayerHp"></div></div>
        <div class="ap-track"><div class="ap-fill" id="hudPlayerAp"></div></div>
      </div>
    </div>

    <div class="score-center">
      <div class="score-board">
        <span class="sc-num p" id="scorePlayer">0</span>
        <span class="sc-sep">R<span id="roundNum">1</span></span>
        <span class="sc-num e" id="scoreAi">0</span>
      </div>
      <div class="timer-txt" id="roundTimer">00:45</div>
    </div>

    <div class="p-card right">
      <div class="ava-box ai">🤖</div>
      <div class="bars">
        <div class="p-name"><span id="hudAiName">LOBO IA</span><span id="hudAiHpTxt">200</span></div>
        <div class="hp-track"><div class="hp-fill ai" id="hudAiHp"></div></div>
        <div class="ap-track"><div class="ap-fill" id="hudAiAp"></div></div>
      </div>
    </div>
  </div>

  <div class="arena-wrap" id="arenaWrap">
    <canvas id="arena"></canvas>

    <div class="top-tools">
      <div class="tool-grp">
        <button class="mini-btn active" id="btnSound" onclick="toggleAudio()">🔊 Audio</button>
        <button class="mini-btn" onclick="openWeaponShop(true)">🛒 Armas</button>
      </div>
      <div class="tool-grp">
        <span class="mini-btn" id=" careerStatsBadge">🏆 0W • 💀 0K</span>
      </div>
    </div>

    <div class="kill-banner" id="killBanner">¡TODO ROJO! HEADSHOT</div>

    <div class="controls-layer">
      <div class="hud-bottom">
        <div class="stick-zone" id="moveZone">
          <div class="stick-base">
            <div class="stick-nub" id="moveNub">🕹️</div>
          </div>
        </div>

        <div class="center-dock">
          <div class="tactical-row">
            <button class="tac-btn gloo" onclick="deployGlooWall(player)">
              <span class="tac-ico">🧱</span>
              <span class="tac-lbl">Gloo</span>
              <span class="tac-count" id="glooCount">3</span>
            </button>
            <button class="tac-btn med" onclick="useMedkit(player)">
              <span class="tac-ico">💊</span>
              <span class="tac-lbl">Curar</span>
              <span class="tac-count" id="medCount">2</span>
            </button>
            <button class="tac-btn nade" onclick="throwGrenade(player)">
              <span class="tac-ico">💣</span>
              <span class="tac-lbl">Bomba</span>
              <span class="tac-count" id="nadeCount">1</span>
            </button>
            <button class="tac-btn dash" onclick="triggerDash(player)">
              <span class="tac-ico">⚡</span>
              <span class="tac-lbl">Dash</span>
            </button>
          </div>

          <div class="weapon-bar" onclick="switchWeapon(player)">
            <div>
              <div class="w-name" id="hudWeaponName">M1887 DOS TIROS</div>
              <div class="w-ammo" id="hudAmmoTxt">2 / ∞</div>
            </div>
            <button class="w-reload-btn" onclick="event.stopPropagation(); startReload(player)">🔄 R</button>
          </div>
        </div>

        <div class="stick-zone" id="aimZone">
          <div class="stick-base fire-base">
            <div class="stick-nub" id="aimNub">🔥</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>

<div class="modal-backdrop open" id="shopModal">
  <div class="shop-card">
    <span class="shop-tag" id="shopRoundTag">LOBO SOLITARIO • RONDA 1</span>
    <div class="shop-title" id="shopHeaderTitle">Arsenal de la Jaula</div>
    <div class="shop-sub" id="shopSubText">Elige el arma para ambos combatientes (Primero en ganar 5 rondas)</div>

    <div class="diff-bar">
      <button class="diff-btn" data-d="1" onclick="setAiDiff(1)">Novato</button>
      <button class="diff-btn" data-d="2" onclick="setAiDiff(2)">Cazador</button>
      <button class="diff-btn active" data-d="3" onclick="setAiDiff(3)">Heroico</button>
      <button class="diff-btn" data-d="4" onclick="setAiDiff(4)">Gran Maestro</button>
    </div>

    <div class="w-grid" id="weaponGrid"></div>

    <button class="start-btn" onclick="confirmShopAndStart()">⚡ ENTRAR AL COMBATE</button>
  </div>
</div>

<div class="modal-backdrop" id="matchEndModal">
  <div class="shop-card">
    <span class="shop-tag" id="endBadge">FIN DEL DUELO</span>
    <div class="shop-title" id="endTitle">¡BOOYAH! VICTORIA</div>
    <div class="shop-sub" id="endSub">Dominaste la jaula de Lobo Solitario</div>
    <button class="start-btn" onclick="restartFullMatch()">🔥 JUGAR REVANCHA</button>
  </div>
</div>

<script>
(function() {
  const PLAYER_NAME = ${safePlayer};
  document.getElementById('hudPlayerName').textContent = PLAYER_NAME;

  const canvas = document.getElementById('arena');
  const ctx = canvas.getContext('2d');
  const wrap = document.getElementById('arenaWrap');

  const WORLD_W = 1000;
  const WORLD_H = 660;
  let viewScale = 1;
  let offsetX = 0;
  let offsetY = 0;

  function resizeCanvas() {
    const rect = wrap.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
    const sx = rect.width / WORLD_W;
    const sy = rect.height / WORLD_H;
    viewScale = Math.min(sx, sy) * 0.96;
    offsetX = (rect.width - WORLD_W * viewScale) / 2;
    offsetY = (rect.height - WORLD_H * viewScale) / 2;
  }
  window.addEventListener('resize', resizeCanvas);
  setTimeout(resizeCanvas, 30);

  let audioCtx = null;
  let soundOn = true;

  function initAudio() {
    if (!soundOn) return null;
    if (!audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) audioCtx = new AC();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(function(){});
    }
    return audioCtx;
  }

  window.toggleAudio = function() {
    soundOn = !soundOn;
    const btn = document.getElementById('btnSound');
    btn.textContent = soundOn ? '🔊 Audio' : '🔇 Mute';
    btn.classList.toggle('active', soundOn);
  };

  function sfx(type) {
    const ac = initAudio();
    if (!ac) return;
    const now = ac.currentTime;
    try {
      if (type === 'shotgun' || type === 'sniper' || type === 'deagle') {
        const dur = type === 'sniper' ? 0.28 : 0.18;
        const buf = ac.createBuffer(1, ac.sampleRate * dur, ac.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
          data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ac.sampleRate * 0.04));
        }
        const noise = ac.createBufferSource();
        noise.buffer = buf;
        const filter = ac.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(type === 'sniper' ? 1200 : 900, now);
        const g = ac.createGain();
        g.gain.setValueAtTime(0.45, now);
        g.gain.exponentialRampToValueAtTime(0.01, now + dur);
        noise.connect(filter);
        filter.connect(g);
        g.connect(ac.destination);
        noise.start(now);
      } else if (type === 'smg' || type === 'ar') {
        const osc = ac.createOscillator();
        const g = ac.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(type === 'smg' ? 280 : 190, now);
        osc.frequency.exponentialRampToValueAtTime(55, now + 0.07);
        g.gain.setValueAtTime(0.22, now);
        g.gain.exponentialRampToValueAtTime(0.01, now + 0.07);
        osc.connect(g);
        g.connect(ac.destination);
        osc.start(now);
        osc.stop(now + 0.075);
      } else if (type === 'headshot') {
        const osc = ac.createOscillator();
        const g = ac.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1350, now);
        osc.frequency.setValueAtTime(1950, now + 0.045);
        g.gain.setValueAtTime(0.35, now);
        g.gain.exponentialRampToValueAtTime(0.008, now + 0.18);
        osc.connect(g);
        g.connect(ac.destination);
        osc.start(now);
        osc.stop(now + 0.19);
      } else if (type === 'gloo') {
        const osc = ac.createOscillator();
        const g = ac.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.14);
        g.gain.setValueAtTime(0.28, now);
        g.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
        osc.connect(g);
        g.connect(ac.destination);
        osc.start(now);
        osc.stop(now + 0.16);
      } else if (type === 'heal') {
        [523, 659, 784].forEach(function(f, idx) {
          const o = ac.createOscillator();
          const g = ac.createGain();
          o.type = 'sine';
          o.frequency.setValueAtTime(f, now + idx * 0.06);
          g.gain.setValueAtTime(0.18, now + idx * 0.06);
          g.gain.exponentialRampToValueAtTime(0.008, now + idx * 0.06 + 0.14);
          o.connect(g);
          g.connect(ac.destination);
          o.start(now + idx * 0.06);
          o.stop(now + idx * 0.06 + 0.15);
        });
      } else if (type === 'boom') {
        const dur = 0.45;
        const buf = ac.createBuffer(1, ac.sampleRate * dur, ac.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) {
          d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ac.sampleRate * 0.1));
        }
        const n = ac.createBufferSource();
        n.buffer = buf;
        const g = ac.createGain();
        g.gain.setValueAtTime(0.6, now);
        g.gain.exponentialRampToValueAtTime(0.01, now + dur);
        n.connect(g);
        g.connect(ac.destination);
        n.start(now);
      }
    } catch (e) {}
  }

  const WEAPONS = [
    {
      id: 'm1887',
      name: 'M1887 Dos Tiros',
      type: 'Escopeta',
      dmg: 22,
      pellets: 6,
      spread: 0.22,
      fireDelay: 420,
      mag: 2,
      reloadMs: 1150,
      speed: 17,
      range: 360,
      critChance: 0.26,
      critMult: 2.1,
      sound: 'shotgun',
      color: '#ff0055'
    },
    {
      id: 'mp40',
      name: 'MP40 Cobra Neón',
      type: 'Subfusil',
      dmg: 19,
      pellets: 1,
      spread: 0.09,
      fireDelay: 95,
      mag: 28,
      reloadMs: 1250,
      speed: 20,
      range: 520,
      critChance: 0.24,
      critMult: 2.3,
      sound: 'smg',
      color: '#00ffcc'
    },
    {
      id: 'deagle',
      name: 'Desert Eagle',
      type: 'Pistola Pesada',
      dmg: 58,
      pellets: 1,
      spread: 0.03,
      fireDelay: 380,
      mag: 7,
      reloadMs: 1100,
      speed: 24,
      range: 680,
      critChance: 0.35,
      critMult: 2.7,
      sound: 'deagle',
      color: '#f59e0b'
    },
    {
      id: 'ak47',
      name: 'AK47 Dragón',
      type: 'Rifle Asalto',
      dmg: 31,
      pellets: 1,
      spread: 0.055,
      fireDelay: 155,
      mag: 30,
      reloadMs: 1400,
      speed: 22,
      range: 660,
      critChance: 0.28,
      critMult: 2.4,
      sound: 'ar',
      color: '#a855f7'
    },
    {
      id: 'awm',
      name: 'AWM Francotirador',
      type: 'Sniper Élite',
      dmg: 115,
      pellets: 1,
      spread: 0.005,
      fireDelay: 950,
      mag: 5,
      reloadMs: 1650,
      speed: 30,
      range: 920,
      critChance: 0.42,
      critMult: 2.2,
      sound: 'sniper',
      color: '#38bdf8'
    },
    {
      id: 'ump',
      name: 'UMP Rubí',
      type: 'Subfusil AP',
      dmg: 24,
      pellets: 1,
      spread: 0.07,
      fireDelay: 120,
      mag: 25,
      reloadMs: 1200,
      speed: 21,
      range: 550,
      critChance: 0.27,
      critMult: 2.3,
      sound: 'smg',
      color: '#ec4899'
    }
  ];

  let selectedPrimaryIdx = 0;
  let selectedSecondaryIdx = 2;
  let aiDifficulty = 3;

  function renderWeaponShop() {
    const grid = document.getElementById('weaponGrid');
    grid.innerHTML = WEAPONS.map(function(w, idx) {
      const isSel = idx === selectedPrimaryIdx;
      const totalDmg = w.dmg * w.pellets;
      return '<div class="w-option ' + (isSel ? 'selected' : '') + '" onclick="pickShopWeapon(' + idx + ')">' +
        '<div class="w-opt-top">' +
          '<span class="w-opt-name">' + w.name + '</span>' +
          '<span class="w-opt-type">' + w.type + '</span>' +
        '</div>' +
        '<div class="w-opt-stats">' +
          'DAÑO: ' + totalDmg + ' • CARGADOR: ' + w.mag + '<br>' +
          'CRÍTICO ROJO: ' + Math.round(w.critChance * 100) + '%' +
        '</div>' +
      '</div>';
    }).join('');
  }

  window.pickShopWeapon = function(idx) {
    selectedPrimaryIdx = idx;
    selectedSecondaryIdx = idx === 2 ? 1 : 2;
    renderWeaponShop();
  };

  window.setAiDiff = function(d) {
    aiDifficulty = d;
    const names = { 1: 'IA NOVATO', 2: 'IA CAZADOR', 3: 'IA HEROICO', 4: 'GRAN MAESTRO' };
    document.getElementById('hudAiName').textContent = names[d];
    document.querySelectorAll('.diff-btn').forEach(function(b) {
      b.classList.toggle('active', Number(b.getAttribute('data-d')) === d);
    });
  };

  let careerWins = 0;
  let careerKills = 0;
  try {
    careerWins = parseInt(localStorage.getItem('lw_wins') || '0', 10) || 0;
    careerKills = parseInt(localStorage.getItem('lw_kills') || '0', 10) || 0;
  } catch (e) {}

  function updateCareerBadge() {
    document.getElementById(' careerStatsBadge').textContent = '🏆 ' + careerWins + 'W • 💀 ' + careerKills + 'K';
  }
  updateCareerBadge();

  let roundNumber = 1;
  let playerWins = 0;
  let aiWins = 0;
  let roundTimeLeft = 45;
  let freezeCountdown = 0;
  let roundActive = false;
  let zoneRadius = 620;
  let shakeAmount = 0;

  let walls = [];
  let glooWalls = [];
  let bullets = [];
  let grenades = [];
  let particles = [];
  let floatTexts = [];

  function createFighter(isAi, x, y, angle) {
    const w1 = Object.assign({}, WEAPONS[selectedPrimaryIdx]);
    const w2 = Object.assign({}, WEAPONS[selectedSecondaryIdx]);
    return {
      isAi: isAi,
      x: x,
      y: y,
      vx: 0,
      vy: 0,
      r: 20,
      angle: angle,
      hp: 200,
      maxHp: 200,
      ap: 100,
      maxAp: 100,
      weapons: [w1, w2],
      wIdx: 0,
      ammo: [w1.mag, w2.mag],
      reloading: false,
      reloadEnd: 0,
      lastShot: 0,
      glooCount: 3,
      medCount: 2,
      nadeCount: 1,
      dashUntil: 0,
      dashCooldown: 0,
      aiStrafeDir: 1,
      aiNextThink: 0,
      aiState: 'engage'
    };
  }

  let player = createFighter(false, 110, WORLD_H / 2, 0);
  let ai = createFighter(true, WORLD_W - 110, WORLD_H / 2, Math.PI);

  function buildArenaMap() {
    walls = [
      { x: 240, y: 130, w: 70, h: 130, color: '#3b1d6e', border: '#8b5cf6', solid: true },
      { x: 240, y: WORLD_H - 260, w: 70, h: 130, color: '#3b1d6e', border: '#8b5cf6', solid: true },
      { x: WORLD_W - 310, y: 130, w: 70, h: 130, color: '#3b1d6e', border: '#8b5cf6', solid: true },
      { x: WORLD_W - 310, y: WORLD_H - 260, w: 70, h: 130, color: '#3b1d6e', border: '#8b5cf6', solid: true },
      { x: WORLD_W / 2 - 45, y: WORLD_H / 2 - 45, w: 90, h: 90, color: '#1e1b4b', border: '#ec4899', solid: true },
      { x: WORLD_W / 2 - 30, y: 70, w: 60, h: 55, color: '#311042', border: '#f472b6', solid: true },
      { x: WORLD_W / 2 - 30, y: WORLD_H - 125, w: 60, h: 55, color: '#311042', border: '#f472b6', solid: true }
    ];
    glooWalls = [];
    bullets = [];
    grenades = [];
    particles = [];
    floatTexts = [];
  }

  function setupRound() {
    buildArenaMap();
    player = createFighter(false, 105, WORLD_H / 2, 0);
    ai = createFighter(true, WORLD_W - 105, WORLD_H / 2, Math.PI);
    roundTimeLeft = 45;
    freezeCountdown = 3;
    zoneRadius = 640;
    roundActive = true;
    updateHud();
  }

  window.openWeaponShop = function(manual) {
    document.getElementById('shopRoundTag').textContent = 'LOBO SOLITARIO • RONDA ' + roundNumber;
    document.getElementById('shopHeaderTitle').textContent = manual ? 'Cambiar Arsenal' : 'Ronda de Elección de Armas';
    renderWeaponShop();
    document.getElementById('shopModal').classList.add('open');
    roundActive = false;
  };

  window.confirmShopAndStart = function() {
    initAudio();
    document.getElementById('shopModal').classList.remove('open');
    setupRound();
  };

  window.restartFullMatch = function() {
    playerWins = 0;
    aiWins = 0;
    roundNumber = 1;
    document.getElementById('matchEndModal').classList.remove('open');
    openWeaponShop(false);
  };

  function showBanner(txt, color) {
    const b = document.getElementById('killBanner');
    b.textContent = txt;
    b.style.background = color || 'linear-gradient(135deg, #ff0055, #7c3aed)';
    b.classList.add('show');
    setTimeout(function() { b.classList.remove('show'); }, 1650);
  }

  function addParticles(x, y, color, count, maxSpd) {
    for (let i = 0; i < count; i++) {
      const ang = Math.random() * Math.PI * 2;
      const spd = (0.25 + Math.random() * 0.75) * maxSpd;
      particles.push({
        x: x,
        y: y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        life: 1,
        color: color,
        size: 2.5 + Math.random() * 3.5
      });
    }
  }

  function addFloatText(x, y, text, color, big) {
    floatTexts.push({
      x: x + (Math.random() * 20 - 10),
      y: y - 15,
      vy: -1.4,
      text: text,
      color: color,
      big: Boolean(big),
      life: 1
    });
  }

  function circleRectCollide(cx, cy, cr, rx, ry, rw, rh) {
    const closestX = Math.max(rx, Math.min(cx, rx + rw));
    const closestY = Math.max(ry, Math.min(cy, ry + rh));
    const dx = cx - closestX;
    const dy = cy - closestY;
    return (dx * dx + dy * dy) < (cr * cr);
  }

  function resolveFighterCollisions(f) {
    f.x = Math.max(f.r + 12, Math.min(WORLD_W - f.r - 12, f.x));
    f.y = Math.max(f.r + 12, Math.min(WORLD_H - f.r - 12, f.y));

    const allObs = walls.concat(glooWalls);
    for (let i = 0; i < allObs.length; i++) {
      const ob = allObs[i];
      const closestX = Math.max(ob.x, Math.min(f.x, ob.x + ob.w));
      const closestY = Math.max(ob.y, Math.min(f.y, ob.y + ob.h));
      const dx = f.x - closestX;
      const dy = f.y - closestY;
      const distSq = dx * dx + dy * dy;
      if (distSq < f.r * f.r) {
        const dist = Math.sqrt(distSq) || 0.001;
        const overlap = f.r - dist;
        f.x += (dx / dist) * overlap;
        f.y += (dy / dist) * overlap;
      }
    }
  }

  function hasLineOfSight(x1, y1, x2, y2) {
    const steps = 22;
    const allObs = walls.concat(glooWalls);
    for (let s = 1; s < steps; s++) {
      const px = x1 + (x2 - x1) * (s / steps);
      const py = y1 + (y2 - y1) * (s / steps);
      for (let i = 0; i < allObs.length; i++) {
        const ob = allObs[i];
        if (px >= ob.x && px <= ob.x + ob.w && py >= ob.y && py <= ob.y + ob.h) {
          return false;
        }
      }
    }
    return true;
  }

  window.switchWeapon = function(f) {
    if (f.reloading) return;
    f.wIdx = f.wIdx === 0 ? 1 : 0;
    updateHud();
  };

  window.startReload = function(f) {
    const w = f.weapons[f.wIdx];
    if (f.reloading || f.ammo[f.wIdx] >= w.mag) return;
    f.reloading = true;
    f.reloadEnd = performance.now() + w.reloadMs;
    if (!f.isAi) addFloatText(f.x, f.y, 'RECARGANDO...', '#c084fc', false);
  };

  window.deployGlooWall = function(f) {
    if (!roundActive || freezeCountdown > 0 || f.glooCount <= 0) return;
    const dist = 54;
    const gx = f.x + Math.cos(f.angle) * dist;
    const gy = f.y + Math.sin(f.angle) * dist;
    const isVertical = Math.abs(Math.cos(f.angle)) > Math.abs(Math.sin(f.angle));
    const gw = isVertical ? 22 : 84;
    const gh = isVertical ? 84 : 22;

    glooWalls.push({
      x: Math.max(16, Math.min(WORLD_W - gw - 16, gx - gw / 2)),
      y: Math.max(16, Math.min(WORLD_H - gh - 16, gy - gh / 2)),
      w: gw,
      h: gh,
      hp: 360,
      maxHp: 360,
      ownerAi: f.isAi,
      color: f.isAi ? '#ff0055' : '#00ffcc'
    });

    f.glooCount--;
    sfx('gloo');
    addParticles(gx, gy, f.isAi ? '#ff0055' : '#00ffcc', 14, 4);
    updateHud();
  };

  window.useMedkit = function(f) {
    if (!roundActive || f.medCount <= 0 || f.hp >= f.maxHp) return;
    f.medCount--;
    f.hp = Math.min(f.maxHp, f.hp + 85);
    f.ap = Math.min(f.maxAp, f.ap + 35);
    sfx('heal');
    addParticles(f.x, f.y, '#4ade80', 16, 3.5);
    addFloatText(f.x, f.y, '+85 HP BOTIQUÍN', '#4ade80', true);
    updateHud();
  };

  window.throwGrenade = function(f) {
    if (!roundActive || freezeCountdown > 0 || f.nadeCount <= 0) return;
    f.nadeCount--;
    grenades.push({
      x: f.x + Math.cos(f.angle) * 24,
      y: f.y + Math.sin(f.angle) * 24,
      vx: Math.cos(f.angle) * 9.5,
      vy: Math.sin(f.angle) * 9.5,
      fuse: 75,
      ownerAi: f.isAi
    });
    updateHud();
  };

  window.triggerDash = function(f) {
    const now = performance.now();
    if (!roundActive || freezeCountdown > 0 || now < f.dashCooldown) return;
    f.dashUntil = now + 180;
    f.dashCooldown = now + 2200;
    addParticles(f.x, f.y, '#f59e0b', 12, 4);
  };

  function fireWeapon(f) {
    const now = performance.now();
    if (!roundActive || freezeCountdown > 0) return;
    const w = f.weapons[f.wIdx];

    if (f.reloading) {
      if (now >= f.reloadEnd) {
        f.reloading = false;
        f.ammo[f.wIdx] = w.mag;
        updateHud();
      } else {
        return;
      }
    }

    if (f.ammo[f.wIdx] <= 0) {
      startReload(f);
      return;
    }

    if (now - f.lastShot < w.fireDelay) return;
    f.lastShot = now;
    f.ammo[f.wIdx]--;

    sfx(w.sound);

    const muzzleX = f.x + Math.cos(f.angle) * (f.r + 10);
    const muzzleY = f.y + Math.sin(f.angle) * (f.r + 10);
    addParticles(muzzleX, muzzleY, w.color, 5, 3);

    for (let i = 0; i < w.pellets; i++) {
      const spreadAngle = f.angle + (Math.random() - 0.5) * w.spread;
      bullets.push({
        x: muzzleX,
        y: muzzleY,
        vx: Math.cos(spreadAngle) * w.speed,
        vy: Math.sin(spreadAngle) * w.speed,
        dmg: w.dmg,
        critChance: w.critChance,
        critMult: w.critMult,
        range: w.range,
        traveled: 0,
        color: w.color,
        fromAi: f.isAi
      });
    }

    if (f.ammo[f.wIdx] <= 0) {
      startReload(f);
    }
    updateHud();
  }

  function applyDamage(target, rawDmg, isHeadshot, attacker) {
    let dmg = rawDmg;
    if (target.ap > 0) {
      const absorbed = Math.min(target.ap, Math.round(dmg * 0.45));
      target.ap -= absorbed;
      dmg -= Math.round(absorbed * 0.6);
    }
    target.hp = Math.max(0, target.hp - dmg);

    if (isHeadshot) {
      sfx('headshot');
      shakeAmount = 12;
      addParticles(target.x, target.y, '#ff0055', 18, 5.5);
      addFloatText(target.x, target.y, '¡ROJO! -' + dmg, '#ff0055', true);
      if (!attacker.isAi) showBanner('🎯 ¡TODO ROJO! -' + dmg + ' CRIT', 'linear-gradient(135deg,#ff0055,#991b1b)');
    } else {
      addParticles(target.x, target.y, '#fde047', 8, 3.5);
      addFloatText(target.x, target.y, '-' + dmg, '#fde047', false);
    }

    updateHud();

    if (target.hp <= 0 && roundActive) {
      endRound(!target.isAi);
    }
  }

  function endRound(aiWon) {
    roundActive = false;
    if (aiWon) {
      aiWins++;
      showBanner('💀 DERROTA EN ESTA RONDA', 'linear-gradient(135deg,#7f1d1d,#1e1b4b)');
    } else {
      playerWins++;
      careerKills++;
      try { localStorage.setItem('lw_kills', String(careerKills)); } catch (e) {}
      updateCareerBadge();
      showBanner('🔥 ¡RONDA GANADA! KO', 'linear-gradient(135deg,#00ffcc,#7c3aed)');
    }

    updateHud();

    setTimeout(function() {
      if (playerWins >= 5 || aiWins >= 5) {
        const playerVictory = playerWins >= 5;
        if (playerVictory) {
          careerWins++;
          try { localStorage.setItem('lw_wins', String(careerWins)); } catch (e) {}
          updateCareerBadge();
        }
        document.getElementById('endBadge').textContent = 'MARCADOR FINAL: ' + playerWins + ' - ' + aiWins;
        document.getElementById('endTitle').textContent = playerVictory ? '🏆 ¡BOOYAH! GANASTE' : '💀 DERROTA EN LA JAULA';
        document.getElementById('endSub').textContent = playerVictory
          ? 'Humillaste al Lobo IA en el duelo 1v1.'
          : 'El Lobo IA dominó el combate. ¡Ajusta tu táctica!';
        document.getElementById('matchEndModal').classList.add('open');
      } else {
        roundNumber++;
        if (roundNumber % 2 === 1) {
          openWeaponShop(false);
        } else {
          setupRound();
        }
      }
    }, 2200);
  }

  function updateAi(now) {
    if (!roundActive || freezeCountdown > 0) return;

    const dx = player.x - ai.x;
    const dy = player.y - ai.y;
    const dist = Math.hypot(dx, dy);
    const targetAngle = Math.atan2(dy, dx);

    const aimLerp = aiDifficulty === 1 ? 0.08 : aiDifficulty === 2 ? 0.14 : aiDifficulty === 3 ? 0.24 : 0.38;
    let diffAng = targetAngle - ai.angle;
    while (diffAng > Math.PI) diffAng -= Math.PI * 2;
    while (diffAng < -Math.PI) diffAng += Math.PI * 2;
    ai.angle += diffAng * aimLerp;

    const canSee = hasLineOfSight(ai.x, ai.y, player.x, player.y);

    if (ai.hp < 90 && ai.glooCount > 0 && canSee && dist < 440 && Math.random() < 0.03 * aiDifficulty) {
      deployGlooWall(ai);
    }

    if (ai.hp < 85 && ai.medCount > 0 && (!canSee || dist > 380)) {
      useMedkit(ai);
    }

    if (ai.nadeCount > 0 && dist > 220 && dist < 480 && !canSee && Math.random() < 0.012 * aiDifficulty) {
      throwGrenade(ai);
    }

    if (now > ai.aiNextThink) {
      ai.aiNextThink = now + (450 - aiDifficulty * 70);
      if (Math.random() < 0.45) ai.aiStrafeDir *= -1;
      if (aiDifficulty >= 3 && Math.random() < 0.22) triggerDash(ai);
    }

    const baseSpd = (2.7 + aiDifficulty * 0.38) * (now < ai.dashUntil ? 2.4 : 1);
    const idealDist = ai.weapons[ai.wIdx].id === 'm1887' ? 170 : ai.weapons[ai.wIdx].id === 'awm' ? 460 : 290;

    let moveForward = 0;
    if (!canSee || dist > idealDist + 50) moveForward = 1;
    else if (dist < idealDist - 50 || ai.reloading) moveForward = -0.85;

    const strafeAngle = targetAngle + (Math.PI / 2) * ai.aiStrafeDir;
    ai.vx = Math.cos(targetAngle) * moveForward * baseSpd + Math.cos(strafeAngle) * baseSpd * 0.75;
    ai.vy = Math.sin(targetAngle) * moveForward * baseSpd + Math.sin(strafeAngle) * baseSpd * 0.75;

    const centerDist = Math.hypot(ai.x - WORLD_W / 2, ai.y - WORLD_H / 2);
    if (centerDist > zoneRadius - 45) {
      const toCenter = Math.atan2(WORLD_H / 2 - ai.y, WORLD_W / 2 - ai.x);
      ai.vx = Math.cos(toCenter) * baseSpd * 1.2;
      ai.vy = Math.sin(toCenter) * baseSpd * 1.2;
    }

    ai.x += ai.vx;
    ai.y += ai.vy;
    resolveFighterCollisions(ai);

    if (canSee && dist <= ai.weapons[ai.wIdx].range) {
      fireWeapon(ai);
    } else if (ai.reloading && now >= ai.reloadEnd) {
      ai.reloading = false;
      ai.ammo[ai.wIdx] = ai.weapons[ai.wIdx].mag;
    }
  }

  const keys = {};
  let mouseAimActive = false;
  let mouseDown = false;

  window.addEventListener('keydown', function(e) {
    keys[e.code] = true;
    if (e.code === 'Space') { e.preventDefault(); triggerDash(player); }
    if (e.code === 'KeyE' || e.code === 'KeyQ') deployGlooWall(player);
    if (e.code === 'KeyH') useMedkit(player);
    if (e.code === 'KeyG') throwGrenade(player);
    if (e.code === 'KeyR') startReload(player);
    if (e.code === 'Digit1' || e.code === 'Digit2') switchWeapon(player);
  });
  window.addEventListener('keyup', function(e) { keys[e.code] = false; });

  canvas.addEventListener('pointermove', function(e) {
    if (e.pointerType === 'mouse') {
      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left - offsetX) / viewScale;
      const my = (e.clientY - rect.top - offsetY) / viewScale;
      player.angle = Math.atan2(my - player.y, mx - player.x);
      mouseAimActive = true;
    }
  });
  canvas.addEventListener('pointerdown', function(e) {
    if (e.pointerType === 'mouse') {
      initAudio();
      mouseDown = true;
    }
  });
  window.addEventListener('pointerup', function(e) {
    if (e.pointerType === 'mouse') mouseDown = false;
  });

  const moveStick = { active: false, id: null, dx: 0, dy: 0 };
  const aimStick = { active: false, id: null, dx: 0, dy: 0 };

  function bindJoystick(zoneEl, nubEl, stickObj, isAim) {
    zoneEl.addEventListener('pointerdown', function(e) {
      e.preventDefault();
      initAudio();
      stickObj.active = true;
      stickObj.id = e.pointerId;
      zoneEl.setPointerCapture(e.pointerId);
      updateStickPos(e, zoneEl, nubEl, stickObj, isAim);
    });
    zoneEl.addEventListener('pointermove', function(e) {
      if (!stickObj.active || e.pointerId !== stickObj.id) return;
      updateStickPos(e, zoneEl, nubEl, stickObj, isAim);
    });
    const endStick = function(e) {
      if (e.pointerId !== stickObj.id) return;
      stickObj.active = false;
      stickObj.dx = 0;
      stickObj.dy = 0;
      nubEl.style.transform = 'translate(0px, 0px)';
    };
    zoneEl.addEventListener('pointerup', endStick);
    zoneEl.addEventListener('pointercancel', endStick);
  }

  function updateStickPos(e, zoneEl, nubEl, stickObj, isAim) {
    const rect = zoneEl.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = e.clientX - cx;
    let dy = e.clientY - cy;
    const maxR = 40;
    const dist = Math.hypot(dx, dy);
    if (dist > maxR) {
      dx = (dx / dist) * maxR;
      dy = (dy / dist) * maxR;
    }
    nubEl.style.transform = 'translate(' + dx.toFixed(1) + 'px, ' + dy.toFixed(1) + 'px)';
    stickObj.dx = dx / maxR;
    stickObj.dy = dy / maxR;
    if (isAim && dist > 6) {
      player.angle = Math.atan2(dy, dx);
    }
  }

  bindJoystick(document.getElementById('moveZone'), document.getElementById('moveNub'), moveStick, false);
  bindJoystick(document.getElementById('aimZone'), document.getElementById('aimNub'), aimStick, true);

  function updateHud() {
    document.getElementById('hudPlayerHp').style.width = ((player.hp / player.maxHp) * 100) + '%';
    document.getElementById('hudPlayerAp').style.width = ((player.ap / player.maxAp) * 100) + '%';
    document.getElementById('hudPlayerHpTxt').textContent = Math.ceil(player.hp);

    document.getElementById('hudAiHp').style.width = ((ai.hp / ai.maxHp) * 100) + '%';
    document.getElementById('hudAiAp').style.width = ((ai.ap / ai.maxAp) * 100) + '%';
    document.getElementById('hudAiHpTxt').textContent = Math.ceil(ai.hp);

    document.getElementById('scorePlayer').textContent = playerWins;
    document.getElementById('scoreAi').textContent = aiWins;
    document.getElementById('roundNum').textContent = roundNumber;

    document.getElementById('glooCount').textContent = player.glooCount;
    document.getElementById('medCount').textContent = player.medCount;
    document.getElementById('nadeCount').textContent = player.nadeCount;

    const w = player.weapons[player.wIdx];
    document.getElementById('hudWeaponName').textContent = w.name;
    document.getElementById('hudAmmoTxt').textContent = player.reloading ? 'RECARGANDO...' : (player.ammo[player.wIdx] + ' / ∞');
  }

  setInterval(function() {
    if (!roundActive) return;
    if (freezeCountdown > 0) {
      freezeCountdown--;
      document.getElementById('roundTimer').textContent = 'LISTOS: ' + freezeCountdown + 's';
      return;
    }
    if (roundTimeLeft > 0) {
      roundTimeLeft--;
      const s = String(roundTimeLeft).padStart(2, '0');
      document.getElementById('roundTimer').textContent = '00:' + s;
    } else {
      document.getElementById('roundTimer').textContent = '⚠️ ZONA TÓXICA';
      zoneRadius = Math.max(95, zoneRadius - 22);
    }

    [player, ai].forEach(function(f) {
      const d = Math.hypot(f.x - WORLD_W / 2, f.y - WORLD_H / 2);
      if (d > zoneRadius) {
        f.hp = Math.max(0, f.hp - 12);
        addFloatText(f.x, f.y, '-12 ZONA', '#ff0055', false);
        updateHud();
        if (f.hp <= 0 && roundActive) endRound(!f.isAi);
      }
    });
  }, 1000);

  function updatePhysics(now) {
    if (shakeAmount > 0) shakeAmount *= 0.85;

    if (roundActive && freezeCountdown <= 0) {
      let mx = moveStick.dx;
      let my = moveStick.dy;
      if (keys['KeyW'] || keys['ArrowUp']) my -= 1;
      if (keys['KeyS'] || keys['ArrowDown']) my += 1;
      if (keys['KeyA'] || keys['ArrowLeft']) mx -= 1;
      if (keys['KeyD'] || keys['ArrowRight']) mx += 1;

      const mLen = Math.hypot(mx, my);
      if (mLen > 1) { mx /= mLen; my /= mLen; }

      const pSpd = 4.1 * (now < player.dashUntil ? 2.5 : 1);
      player.x += mx * pSpd;
      player.y += my * pSpd;
      resolveFighterCollisions(player);

      if (!aimStick.active && !mouseAimActive && mLen > 0.15) {
        const distAi = Math.hypot(ai.x - player.x, ai.y - player.y);
        if (distAi < 460 && hasLineOfSight(player.x, player.y, ai.x, ai.y)) {
          player.angle = Math.atan2(ai.y - player.y, ai.x - player.x);
        } else {
          player.angle = Math.atan2(my, mx);
        }
      }

      if (aimStick.active && Math.hypot(aimStick.dx, aimStick.dy) > 0.38) {
        fireWeapon(player);
      } else if (mouseDown) {
        fireWeapon(player);
      }

      if (player.reloading && now >= player.reloadEnd) {
        player.reloading = false;
        player.ammo[player.wIdx] = player.weapons[player.wIdx].mag;
        updateHud();
      }

      updateAi(now);
    }

    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.x += b.vx;
      b.y += b.vy;
      b.traveled += Math.hypot(b.vx, b.vy);

      if (b.x < 10 || b.x > WORLD_W - 10 || b.y < 10 || b.y > WORLD_H - 10 || b.traveled >= b.range) {
        bullets.splice(i, 1);
        continue;
      }

      let hitWall = false;
      for (let w = 0; w < walls.length; w++) {
        const ob = walls[w];
        if (b.x >= ob.x && b.x <= ob.x + ob.w && b.y >= ob.y && b.y <= ob.y + ob.h) {
          addParticles(b.x, b.y, '#c084fc', 4, 2.5);
          hitWall = true;
          break;
        }
      }
      if (hitWall) { bullets.splice(i, 1); continue; }

      for (let g = glooWalls.length - 1; g >= 0; g--) {
        const gw = glooWalls[g];
        if (b.x >= gw.x && b.x <= gw.x + gw.w && b.y >= gw.y && b.y <= gw.y + gw.h) {
          gw.hp -= b.dmg;
          addParticles(b.x, b.y, gw.color, 5, 3);
          if (gw.hp <= 0) {
            addParticles(gw.x + gw.w / 2, gw.y + gw.h / 2, gw.color, 20, 5);
            glooWalls.splice(g, 1);
          }
          hitWall = true;
          break;
        }
      }
      if (hitWall) { bullets.splice(i, 1); continue; }

      const target = b.fromAi ? player : ai;
      const attacker = b.fromAi ? ai : player;
      const d = Math.hypot(b.x - target.x, b.y - target.y);
      if (d <= target.r + 3) {
        const isCrit = Math.random() < b.critChance;
        const finalDmg = Math.round(b.dmg * (isCrit ? b.critMult : 1));
        applyDamage(target, finalDmg, isCrit, attacker);
        bullets.splice(i, 1);
      }
    }

    for (let i = grenades.length - 1; i >= 0; i--) {
      const n = grenades[i];
      n.x += n.vx;
      n.y += n.vy;
      n.vx *= 0.94;
      n.vy *= 0.94;
      n.fuse--;
      if (n.x < 25 || n.x > WORLD_W - 25) n.vx *= -0.7;
      if (n.y < 25 || n.y > WORLD_H - 25) n.vy *= -0.7;

      if (n.fuse <= 0) {
        sfx('boom');
        shakeAmount = 18;
        addParticles(n.x, n.y, '#ff0055', 32, 7);
        addParticles(n.x, n.y, '#fde047', 22, 5);
        [player, ai].forEach(function(f) {
          const dist = Math.hypot(f.x - n.x, f.y - n.y);
          if (dist < 135) {
            const dmg = Math.round((1 - dist / 135) * 115);
            applyDamage(f, dmg, dmg > 80, n.ownerAi ? ai : player);
          }
        });
        grenades.splice(i, 1);
      }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.04;
      if (p.life <= 0) particles.splice(i, 1);
    }

    for (let i = floatTexts.length - 1; i >= 0; i--) {
      const ft = floatTexts[i];
      ft.y += ft.vy;
      ft.life -= 0.028;
      if (ft.life <= 0) floatTexts.splice(i, 1);
    }
  }

  function drawFighter(f, label, mainColor) {
    ctx.save();
    ctx.translate(f.x, f.y);

    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.arc(0, 5, f.r, 0, Math.PI * 2);
    ctx.fill();

    if (!f.isAi || hasLineOfSight(player.x, player.y, ai.x, ai.y)) {
      ctx.save();
      ctx.rotate(f.angle);
      const laserGrad = ctx.createLinearGradient(f.r, 0, 260, 0);
      laserGrad.addColorStop(0, mainColor);
      laserGrad.addColorStop(1, 'transparent');
      ctx.strokeStyle = laserGrad;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.beginPath();
      ctx.moveTo(f.r, 0);
      ctx.lineTo(260, 0);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    ctx.rotate(f.angle);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(f.r - 4, 4, 18, 6);
    ctx.fillStyle = f.weapons[f.wIdx].color;
    ctx.fillRect(f.r + 6, 4, 8, 6);
    ctx.restore();

    ctx.shadowColor = mainColor;
    ctx.shadowBlur = 14;
    ctx.fillStyle = mainColor;
    ctx.beginPath();
    ctx.arc(0, 0, f.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#090314';
    ctx.beginPath();
    ctx.arc(0, 0, f.r - 5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#fff';
    ctx.font = '900 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, 0, -f.r - 8);

    ctx.restore();
  }

  function renderArena() {
    const rect = wrap.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);

    ctx.save();
    const sx = (Math.random() - 0.5) * shakeAmount;
    const sy = (Math.random() - 0.5) * shakeAmount;
    ctx.translate(offsetX + sx, offsetY + sy);
    ctx.scale(viewScale, viewScale);

    ctx.fillStyle = '#090414';
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);

    ctx.strokeStyle = 'rgba(139, 92, 246, 0.12)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= WORLD_W; x += 50) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, WORLD_H); ctx.stroke();
    }
    for (let y = 0; y <= WORLD_H; y += 50) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WORLD_W, y); ctx.stroke();
    }

    ctx.strokeStyle = '#7c3aed';
    ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, WORLD_W - 12, WORLD_H - 12);

    if (zoneRadius < 600) {
      ctx.save();
      ctx.strokeStyle = '#ff0055';
      ctx.lineWidth = 4;
      ctx.setLineDash([12, 8]);
      ctx.beginPath();
      ctx.arc(WORLD_W / 2, WORLD_H / 2, zoneRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    walls.forEach(function(ob) {
      ctx.fillStyle = ob.color;
      ctx.strokeStyle = ob.border;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(ob.x, ob.y, ob.w, ob.h, 8);
      ctx.fill();
      ctx.stroke();
    });

    glooWalls.forEach(function(gw) {
      ctx.save();
      ctx.shadowColor = gw.color;
      ctx.shadowBlur = 14;
      ctx.fillStyle = gw.ownerAi ? 'rgba(255, 0, 85, 0.45)' : 'rgba(0, 255, 204, 0.45)';
      ctx.strokeStyle = gw.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(gw.x, gw.y, gw.w, gw.h, 10);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    });

    grenades.forEach(function(n) {
      ctx.save();
      ctx.fillStyle = n.fuse % 8 < 4 ? '#ff0055' : '#fde047';
      ctx.beginPath();
      ctx.arc(n.x, n.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    bullets.forEach(function(b) {
      ctx.save();
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 8;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - b.vx * 0.85, b.y - b.vy * 0.85);
      ctx.stroke();
      ctx.restore();
    });

    drawFighter(player, PLAYER_NAME, '#00ffcc');
    drawFighter(ai, 'LOBO IA', '#ff0055');

    particles.forEach(function(p) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
      ctx.restore();
    });

    floatTexts.forEach(function(ft) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, ft.life);
      ctx.font = (ft.big ? '900 18px ' : '800 13px ') + 'sans-serif';
      ctx.fillStyle = ft.color;
      ctx.textAlign = 'center';
      ctx.shadowColor = '#000';
      ctx.shadowBlur = 6;
      ctx.fillText(ft.text, ft.x, ft.y);
      ctx.restore();
    });

    if (freezeCountdown > 0 && roundActive) {
      ctx.fillStyle = 'rgba(4, 2, 10, 0.55)';
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
      ctx.fillStyle = '#00ffcc';
      ctx.font = '900 54px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('RONDA ' + roundNumber + ' EN ' + freezeCountdown, WORLD_W / 2, WORLD_H / 2);
    }

    ctx.restore();
  }

  function loop(now) {
    updatePhysics(now);
    renderArena();
    requestAnimationFrame(loop);
  }

  renderWeaponShop();
  buildArenaMap();
  requestAnimationFrame(loop);
})();
</script>`;
}

export default {
  name: ["shooter", "lobosolitario", "lonewolf", "freefire", "ff"],
  category: "games",
  description: "Juega Lobo Solitario 1v1 en Pantalla Completa con Paredes Gloo, Dos Tiros M1887, Todo Rojo e IA táctica.",
  groupOnly: false,
  ownerOnly: false,

  async run(ctx: CommandContext) {
    const { sock, from, msg, reply, react } = ctx;
    const playerName = msg?.pushName || "Jugador";

    await react("🔫").catch(() => undefined);

    try {
      const HTML = buildLoneWolfShooterHtml(playerName);

      const data = {
        response_id: "AuraLoneWolfFullscreen_" + Date.now(),
        sections: [
          {
            __typename: "GenAIUnifiedResponseSection",
            view_model: {
              __typename: "GenAISingleLayoutViewModel",
              primitive: {
                __typename: "GenAIBotProgressStatusPrimitive",
                title: "🐺 JUGAR LOBO SOLITARIO (PANTALLA COMPLETA)",
                is_in_progress: true,
              },
            },
          },
        ],
        embedded_screens: [
          {
            title: "🐺 AURA LOBO SOLITARIO 1V1",
            content: [
              {
                __typename: "FOAIDNixelButtonSheets",
                tabs: [
                  {
                    id: "tab_0",
                    tab_header: "Arena 1v1",
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
        `${fytBold("Error")} al desplegar Lobo Solitario en pantalla completa: ${error instanceof Error ? error.message : String(error)}`,
      ).catch(() => undefined);
    }
  },
};
