import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

function buildChessRichPayload(playerName: string) {
  const safeName = JSON.stringify(playerName || "Jugador");

  const html = `<style>
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#04020a;color:#f5f3ff;padding:8px;min-height:100vh;display:flex;justify-content:center;align-items:flex-start}
.app{width:100%;max-width:430px;background:radial-gradient(circle at 50% 0%,#1d0b38 0%,#080312 75%);border:1.5px solid #4c1d95;border-radius:22px;overflow:hidden;box-shadow:0 25px 65px rgba(0,0,0,.95),0 0 35px rgba(139,92,246,.25);position:relative}
.app::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#7c3aed,#ec4899,#00ffcc,#7c3aed);background-size:200% 100%;animation:glow 3s linear infinite;z-index:20}
@keyframes glow{0%{background-position:0% 0%}100%{background-position:200% 0%}}
.top-bar{padding:11px 14px;background:rgba(12,5,26,.88);border-bottom:1px solid #2e1559;display:flex;justify-content:space-between;align-items:center}
.brand{display:flex;align-items:center;gap:8px}
.logo-orb{width:30px;height:30px;border-radius:9px;background:linear-gradient(135deg,#9333ea,#db2777);display:flex;align-items:center;justify-content:center;font-size:16px;box-shadow:0 0 14px rgba(168,85,247,.6)}
.brand-txt h1{font-size:13px;font-weight:900;letter-spacing:.9px;color:#fff;text-transform:uppercase}
.brand-txt p{font-size:9.5px;color:#00ffcc;font-weight:800;font-family:'Courier New',monospace}
.top-Controls{display:flex;gap:6px}
.icon-btn{background:#180b30;border:1px solid #3b1d6e;color:#e9d5ff;width:30px;height:30px;border-radius:8px;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s}
.icon-btn:active{transform:scale(.92)}
.icon-btn.active{background:#7c3aed;border-color:#c084fc;color:#fff;box-shadow:0 0 10px rgba(168,85,247,.5)}
.setup-panel{padding:12px 14px;background:rgba(15,7,30,.92);border-bottom:1px solid #2a1452;display:flex;flex-direction:column;gap:8px}
.row-group{display:flex;gap:6px;align-items:center}
.seg-label{font-size:9.5px;font-weight:900;color:#a78bfa;text-transform:uppercase;letter-spacing:.7px;min-width:54px}
.seg-wrap{display:flex;flex:1;gap:4px;background:#090414;padding:3px;border-radius:10px;border:1px solid #251247}
.seg-btn{flex:1;background:transparent;border:none;color:#9378bc;padding:6px 4px;border-radius:7px;font-size:10.5px;font-weight:800;cursor:pointer;transition:all .15s;text-transform:uppercase}
.seg-btn.active{background:linear-gradient(135deg,#7c3aed,#5b21b6);color:#fff;box-shadow:0 2px 10px rgba(124,58,237,.45)}
.player-strip{padding:8px 14px;display:flex;justify-content:space-between;align-items:center;background:rgba(10,4,20,.75)}
.p-left{display:flex;align-items:center;gap:8px;min-width:0}
.p-ava{width:30px;height:30px;border-radius:8px;background:linear-gradient(145deg,#2a144d,#120724);border:1px solid #581c87;display:flex;align-items:center;justify-content:center;font-size:14px;position:relative}
.p-ava.turn-glow{border-color:#00ffcc;box-shadow:0 0 12px rgba(0,255,204,.55)}
.p-info{min-width:0}
.p-name{font-size:12px;font-weight:900;color:#fff;display:flex;align-items:center;gap:5px}
.cap-tray{font-size:11px;color:#c084fc;min-height:14px;display:flex;align-items:center;gap:1px;flex-wrap:wrap}
.adv-badge{font-size:9.5px;font-weight:900;color:#00ffcc;background:rgba(0,255,204,.12);padding:1px 5px;border-radius:4px;margin-left:4px;font-family:'Courier New',monospace}
.clock{background:#090314;border:1px solid #351a63;padding:5px 9px;border-radius:8px;font-family:'Courier New',monospace;font-size:13px;font-weight:900;color:#e9d5ff;letter-spacing:.5px;min-width:62px;text-align:center}
.clock.active-clock{border-color:#00ffcc;color:#00ffcc;box-shadow:0 0 10px rgba(0,255,204,.2)}
.board-stage{padding:8px 12px;display:flex;gap:8px;align-items:center;justify-content:center;position:relative}
.eval-bar{width:8px;height:348px;background:#1a0f2e;border-radius:999px;overflow:hidden;border:1px solid #3b1d6e;display:flex;flex-direction:column}
.eval-black{background:linear-gradient(180deg,#1f1235,#3b1d6e);width:100%;height:50%;transition:height .4s cubic-bezier(.22,1,.36,1)}
.eval-white{background:linear-gradient(180deg,#f5f3ff,#c084fc);width:100%;flex:1}
.board-frame{width:348px;height:348px;padding:8px;border-radius:16px;background:linear-gradient(145deg,#251147,#0b0418);border:2px solid #581c87;box-shadow:0 18px 40px rgba(0,0,0,.9),inset 0 0 18px rgba(168,85,247,.25);position:relative;transition:transform .4s ease}
.board-frame.view-3d{transform:perspective(750px) rotateX(14deg);box-shadow:0 26px 45px rgba(0,0,0,.95),0 10px 0 #1f0d3d,inset 0 0 20px rgba(168,85,247,.3)}
.board-grid{width:100%;height:100%;display:grid;grid-template-columns:repeat(8,1fr);grid-template-rows:repeat(8,1fr);border-radius:10px;overflow:hidden;border:1.5px solid #3b176b;position:relative}
.sq{position:relative;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:background-color .12s}
.sq.light{background:radial-gradient(circle at 30% 30%,#e9d5ff,#bda4e6 85%);box-shadow:inset 0 1px 2px rgba(255,255,255,.5)}
.sq.dark{background:radial-gradient(circle at 30% 30%,#3b196b,#1e0b3b 90%);box-shadow:inset 0 2px 5px rgba(0,0,0,.6)}
.theme-emerald .sq.light{background:radial-gradient(circle at 30% 30%,#d1fae5,#86efac 85%)}
.theme-emerald .sq.dark{background:radial-gradient(circle at 30% 30%,#065f46,#022c22 90%)}
.theme-gold .sq.light{background:radial-gradient(circle at 30% 30%,#fef3c7,#d97706 90%)}
.theme-gold .sq.dark{background:radial-gradient(circle at 30% 30%,#292524,#0c0a09 92%)}
.sq.selected{background:radial-gradient(circle,#00ffcc 0%,#059669 100%)!important;box-shadow:inset 0 0 12px rgba(0,0,0,.6)}
.sq.last-move::after{content:'';position:absolute;inset:0;background:rgba(192,132,252,.32);pointer-events:none}
.sq.in-check{background:radial-gradient(circle,#ff2a54 10%,#7f1d1d 95%)!important;animation:checkPulse .8s infinite alternate}
@keyframes checkPulse{0%{box-shadow:inset 0 0 6px #fff}100%{box-shadow:inset 0 0 20px #ff0040}}
.move-dot{width:13px;height:13px;border-radius:50%;background:radial-gradient(circle,#00ffcc 20%,rgba(0,255,204,.45) 100%);box-shadow:0 0 10px #00ffcc;pointer-events:none;z-index:4}
.capture-ring{position:absolute;inset:3px;border:3px solid #ff2a54;border-radius:50%;box-shadow:0 0 12px #ff2a54,inset 0 0 8px rgba(255,42,84,.4);pointer-events:none;z-index:4}
.coord-rank{position:absolute;top:2px;left:3px;font-size:8px;font-weight:900;opacity:.72;pointer-events:none}
.coord-file{position:absolute;bottom:1px;right:3px;font-size:8px;font-weight:900;opacity:.72;pointer-events:none}
.sq.light .coord-rank,.sq.light .coord-file{color:#2e1065}
.sq.dark .coord-rank,.sq.dark .coord-file{color:#e9d5ff}
.piece-wrap{width:86%;height:86%;display:flex;align-items:center;justify-content:center;z-index:3;pointer-events:none;transition:transform .18s cubic-bezier(.2,1,.3,1)}
.board-frame.view-3d .piece-wrap{transform:translateY(-3px) scale(1.04)}
.piece-svg{width:100%;height:100%;overflow:visible}
.piece-w{filter:drop-shadow(0 4px 4px rgba(0,0,0,.75)) drop-shadow(0 0 4px rgba(255,255,255,.35))}
.piece-b{filter:drop-shadow(0 4px 4px rgba(0,0,0,.85)) drop-shadow(0 0 5px rgba(168,85,247,.5))}
.status-banner{margin:2px 14px 8px;padding:8px 12px;background:#0e061d;border:1px solid #331861;border-radius:11px;display:flex;justify-content:space-between;align-items:center;font-size:11.5px;font-weight:800}
.status-txt{color:#e9d5ff;display:flex;align-items:center;gap:6px}
.status-dot{width:8px;height:8px;border-radius:50%;background:#00ffcc;box-shadow:0 0 8px #00ffcc}
.status-dot.warn{background:#ff2a54;box-shadow:0 0 10px #ff2a54}
.move-log{margin:0 14px 10px;background:#070310;border:1px solid #241145;border-radius:10px;padding:6px 10px;height:32px;display:flex;align-items:center;gap:8px;overflow-x:auto;scrollbar-width:none;font-family:'Courier New',monospace;font-size:11px;color:#a78bfa;white-space:nowrap}
.move-log::-webkit-scrollbar{display:none}
.mv-chip{background:#150a2a;border:1px solid #301759;padding:2px 6px;border-radius:5px;color:#e9d5ff}
.bottom-actions{padding:0 14px 14px;display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.act-btn{background:#160b2c;border:1px solid #381b69;color:#e9d5ff;padding:9px 4px;border-radius:10px;font-size:10.5px;font-weight:800;cursor:pointer;text-transform:uppercase;display:flex;align-items:center;justify-content:center;gap:4px;transition:all .15s}
.act-btn:active{transform:scale(.95)}
.act-btn.primary{background:linear-gradient(135deg,#8b5cf6,#6d28d9);color:#fff;border-color:#a855f7;box-shadow:0 4px 14px rgba(124,58,237,.35)}
.modal-overlay{position:fixed;inset:0;background:rgba(4,2,10,.88);backdrop-filter:blur(5px);display:none;align-items:center;justify-content:center;z-index:100;padding:16px}
.modal-overlay.show{display:flex}
.modal-card{background:linear-gradient(180deg,#190b33,#0b0418);border:2px solid #8b5cf6;border-radius:18px;padding:18px;width:100%;max-width:320px;text-align:center;box-shadow:0 20px 50px rgba(0,0,0,.95),0 0 30px rgba(139,92,246,.4)}
.modal-title{font-size:15px;font-weight:900;color:#fff;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}
.modal-sub{font-size:12px;color:#c4b5fd;margin-bottom:14px;line-height:1.4}
.promo-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.promo-item{background:#120726;border:1.5px solid #4c1d95;border-radius:12px;padding:10px 6px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:4px}
.promo-item:active{transform:scale(.94);border-color:#00ffcc}
.promo-icon{width:42px;height:42px}
.promo-lbl{font-size:9.5px;font-weight:800;color:#e9d5ff}
</style>

<svg style="display:none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="wg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="55%" stop-color="#ede9fe"/>
      <stop offset="100%" stop-color="#c4b5fd"/>
    </linearGradient>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#4c1d95"/>
      <stop offset="50%" stop-color="#1e0938"/>
      <stop offset="100%" stop-color="#090314"/>
    </linearGradient>
    <g id="svg-p">
      <path d="M22.5 9c-3.2 0-5.8 2.6-5.8 5.8 0 2.1 1.1 3.9 2.8 4.9-2.8 1.6-4.5 4.5-4.5 8.3 0 2.2 1.2 4.2 1.2 4.2H12c-1.1 0-2 .9-2 2v2.3h25v-2.3c0-1.1-.9-2-2-2h-4.2s1.2-2 1.2-4.2c0-3.8-1.7-6.7-4.5-8.3 1.7-1 2.8-2.8 2.8-4.9 0-3.2-2.6-5.8-5.8-5.8z"/>
    </g>
    <g id="svg-r">
      <path d="M11 36.5h23v-3H11v3zm2-5.5h19l-1.5-15H14.5L13 31zm-1-17.5h21V9h-3.5v2.5h-3V9h-8v2.5h-3V9H12v4.5z"/>
    </g>
    <g id="svg-n">
      <path d="M22 10c10.5 1 16.5 8 16 29H15c0-9 10-6.5 8-21-2 1-5 2.5-8 2-1.5-2 1.5-6 4-7.5L17.5 9c2 .5 3.5 1 4.5 1zM11.5 37h22v2.5h-22V37z"/>
    </g>
    <g id="svg-b">
      <path d="M22.5 7.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm0 4.5c-4.5 3-7 7.5-6 13.5.6 3.5 2.5 5.5 2.5 5.5h7s1.9-2 2.5-5.5c1-6-1.5-10.5-6-13.5zm-2 4.5h4v2h-4v-2zm1 2v5h2v-5h-2zM12 33.5h21v2.5H12v-2.5zm-1.5 3.5h24v2H10.5v-2z"/>
    </g>
    <g id="svg-q">
      <path d="M9 13a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm7-2.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6.5-1a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6.5 1a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm7 2.5a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM11 17l3 14.5h17L34 17l-5.5 6.5-6-8.5-6 8.5L11 17zm1.5 16.5h20v2.5h-20v-2.5zm-1.5 3.5h23v2.5H11V37z"/>
    </g>
    <g id="svg-k">
      <path d="M21.5 5.5v3h-3v2h3v3h2v-3h3v-2h-3v-3h-2zM22.5 13c-3 0-5.5 2.5-5.5 5.5 0 2-1.5 5-3.5 5-2.5 0-4.5-2.2-4.5-5 0-2.5 2-4.5 4.5-4.5 1.2 0 2.5.6 3.2 1.5C15 11.5 10.5 12 9 16.5c-1.5 4.5 1 11 4.5 15h18c3.5-4 6-10.5 4.5-15-1.5-4.5-6-5-7.7-1 .7-.9 2-1.5 3.2-1.5 2.5 0 4.5 2 4.5 4.5 0 2.8-2 5-4.5 5-2 0-3.5-3-3.5-5 0-3-2.5-5.5-5.5-5.5zm-10 20.5h20v2.5h-20v-2.5zm-1.5 3.5h23v2.5H11V37z"/>
    </g>
  </defs>
</svg>

<div class="app">
  <div class="top-bar">
    <div class="brand">
      <div class="logo-orb">♟️</div>
      <div class="brand-txt">
        <h1>Aura Grandmaster 3D</h1>
        <p id="modeSubLabel">IA NIVEL MAESTRO</p>
      </div>
    </div>
    <div class="top-Controls">
      <button class="icon-btn active" id="btn3D" onclick="toggle3D()" title="Vista 3D">🧊</button>
      <button class="icon-btn" id="btnTheme" onclick="cycleTheme()" title="Tema del Tablero">🎨</button>
      <button class="icon-btn active" id="btnSound" onclick="toggleSound()" title="Sonido Realista">🔊</button>
      <button class="icon-btn" onclick="flipBoard()" title="Girar Tablero">🔄</button>
    </div>
  </div>

  <div class="setup-panel">
    <div class="row-group">
      <span class="seg-label">Modo</span>
      <div class="seg-wrap">
        <button class="seg-btn active" id="modeAiBtn" onclick="setGameMode('ai')">🤖 vs IA</button>
        <button class="seg-btn" id="modePvpBtn" onclick="setGameMode('pvp')">⚔️ PvP 2J</button>
      </div>
      <span class="seg-label" style="min-width:36px;margin-left:4px" id="sideLbl">Color</span>
      <div class="seg-wrap" id="sideWrap" style="max-width:96px">
        <button class="seg-btn active" id="sideWBtn" onclick="setPlayerColor('w')">⚪</button>
        <button class="seg-btn" id="sideBBtn" onclick="setPlayerColor('b')">⚫</button>
      </div>
    </div>

    <div class="row-group" id="diffRow">
      <span class="seg-label">Nivel IA</span>
      <div class="seg-wrap">
        <button class="seg-btn" data-lv="1" onclick="setDifficulty(1)">Fácil</button>
        <button class="seg-btn" data-lv="2" onclick="setDifficulty(2)">Club</button>
        <button class="seg-btn active" data-lv="3" onclick="setDifficulty(3)">Maestro</button>
        <button class="seg-btn" data-lv="4" onclick="setDifficulty(4)">GM Élite</button>
      </div>
    </div>
  </div>

  <div class="player-strip">
    <div class="p-left">
      <div class="p-ava" id="topAva">🤖</div>
      <div class="p-info">
        <div class="p-name"><span id="topName">Aura Neural AI</span><span class="adv-badge" id="topAdv"></span></div>
        <div class="cap-tray" id="topTray"></div>
      </div>
    </div>
    <div class="clock" id="topClock">10:00</div>
  </div>

  <div class="board-stage">
    <div class="eval-bar" title="Evaluación de ventaja">
      <div class="eval-black" id="evalBlack" style="height:50%"></div>
      <div class="eval-white"></div>
    </div>
    <div class="board-frame view-3d" id="boardFrame">
      <div class="board-grid" id="boardGrid"></div>
    </div>
  </div>

  <div class="player-strip">
    <div class="p-left">
      <div class="p-ava turn-glow" id="botAva">👤</div>
      <div class="p-info">
        <div class="p-name"><span id="botName"></span><span class="adv-badge" id="botAdv"></span></div>
        <div class="cap-tray" id="botTray"></div>
      </div>
    </div>
    <div class="clock active-clock" id="botClock">10:00</div>
  </div>

  <div class="status-banner">
    <div class="status-txt">
      <div class="status-dot" id="statusDot"></div>
      <span id="statusText">Turno de las Blancas</span>
    </div>
    <span id="moveCounter" style="color:#a78bfa;font-family:'Courier New',monospace;font-size:10.5px">Jugada #1</span>
  </div>

  <div class="move-log" id="moveLog">
    <span>Historial de jugadas aparecerá aquí...</span>
  </div>

  <div class="bottom-actions">
    <button class="act-btn primary" onclick="resetGame()">⚡ Nueva</button>
    <button class="act-btn" onclick="undoMove()">↩️ Deshacer</button>
    <button class="act-btn" onclick="requestHint()">💡 Pista</button>
    <button class="act-btn" onclick="flipBoard()">🔄 Girar</button>
  </div>
</div>

<div class="modal-overlay" id="promoModal">
  <div class="modal-card">
    <div class="modal-title">👑 Coronación de Peón</div>
    <div class="modal-sub">Elige la pieza superior para promover tu peón:</div>
    <div class="promo-grid" id="promoGrid"></div>
  </div>
</div>

<div class="modal-overlay" id="gameOverModal">
  <div class="modal-card">
    <div class="modal-title" id="goTitle">🏆 Fin de la Partida</div>
    <div class="modal-sub" id="goSub"></div>
    <button class="act-btn primary" style="width:100%;padding:12px" onclick="closeGameOver()">⚡ Jugar Otra Vez</button>
  </div>
</div>

<script>
const USER_NAME = ${safeName};
let audioCtx = null;
let soundEnabled = true;
let is3D = true;
let themeIdx = 0;
const THEMES = ["", "theme-emerald", "theme-gold"];

let gameMode = "ai";
let aiLevel = 3;
let humanColor = "w";
let flipped = false;

let board = [];
let turn = "w";
let castling = { wK: true, wQ: true, bK: true, bQ: true };
let epSquare = null;
let selectedSq = null;
let legalMovesForSelected = [];
let lastMove = null;
let historyStack = [];
let moveNotationList = [];
let gameOver = false;
let pendingPromo = null;
let hintSquares = null;

let clocks = { w: 600, b: 600 };
let clockTimer = null;

const PIECE_VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
const UNICODE_MINI = {
  wp: "♙", wn: "♘", wb: "♗", wr: "♖", wq: "♕", wk: "♔",
  bp: "♟", bn: "♞", bb: "♝", br: "♜", bq: "♛", bk: "♚"
};

const PST_PAWN = [
  [0,0,0,0,0,0,0,0],
  [50,50,50,50,50,50,50,50],
  [10,10,20,30,30,20,10,10],
  [5,5,10,25,25,10,5,5],
  [0,0,0,20,20,0,0,0],
  [5,-5,-10,0,0,-10,-5,5],
  [5,10,10,-20,-20,10,10,5],
  [0,0,0,0,0,0,0,0]
];
const PST_KNIGHT = [
  [-50,-40,-30,-30,-30,-30,-40,-50],
  [-40,-20,0,0,0,0,-20,-40],
  [-30,0,10,15,15,10,0,-30],
  [-30,5,15,20,20,15,5,-30],
  [-30,0,15,20,20,15,0,-30],
  [-30,5,10,15,15,10,5,-30],
  [-40,-20,0,5,5,0,-20,-40],
  [-50,-40,-30,-30,-30,-30,-40,-50]
];
const PST_BISHOP = [
  [-20,-10,-10,-10,-10,-10,-10,-20],
  [-10,0,0,0,0,0,0,-10],
  [-10,0,5,10,10,5,0,-10],
  [-10,5,5,10,10,5,5,-10],
  [-10,0,10,10,10,10,0,-10],
  [-10,10,10,10,10,10,10,-10],
  [-10,5,0,0,0,0,5,-10],
  [-20,-10,-10,-10,-10,-10,-10,-20]
];
const PST_KING = [
  [-30,-40,-40,-50,-50,-40,-40,-30],
  [-30,-40,-40,-50,-50,-40,-40,-30],
  [-30,-40,-40,-50,-50,-40,-40,-30],
  [-30,-40,-40,-50,-50,-40,-40,-30],
  [-20,-30,-30,-40,-40,-30,-30,-20],
  [-10,-20,-20,-20,-20,-20,-20,-10],
  [20,20,0,0,0,0,20,20],
  [20,30,10,0,0,10,30,20]
];

function ensureAudio() {
  if (!soundEnabled) return null;
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume().catch(function(){});
  }
  return audioCtx;
}

function playSound(type) {
  const ctx = ensureAudio();
  if (!ctx) return;
  const now = ctx.currentTime;

  if (type === "move" || type === "capture") {
    const bufferSize = ctx.sampleRate * 0.045;
    const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.01));
    }
    const whiteNoise = ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(type === "capture" ? 420 : 850, now);
    filter.Q.setValueAtTime(2.5, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(type === "capture" ? 0.9 : 0.55, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.045);

    whiteNoise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);
    whiteNoise.start(now);

    const osc = ctx.createOscillator();
    const oGain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(type === "capture" ? 130 : 190, now);
    osc.frequency.exponentialRampToValueAtTime(45, now + 0.065);
    oGain.gain.setValueAtTime(type === "capture" ? 0.65 : 0.35, now);
    oGain.gain.exponentialRampToValueAtTime(0.005, now + 0.065);
    osc.connect(oGain);
    oGain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.07);
  } else if (type === "check") {
    [587.33, 880].forEach(function(freq, idx) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(freq, now + idx * 0.08);
      g.gain.setValueAtTime(0.22, now + idx * 0.08);
      g.gain.exponentialRampToValueAtTime(0.008, now + idx * 0.08 + 0.22);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.23);
    });
  } else if (type === "win") {
    [523.25, 659.25, 783.99, 1046.5].forEach(function(freq, idx) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, now + idx * 0.1);
      g.gain.setValueAtTime(0.28, now + idx * 0.1);
      g.gain.exponentialRampToValueAtTime(0.008, now + idx * 0.1 + 0.32);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(now + idx * 0.1);
      osc.stop(now + idx * 0.1 + 0.34);
    });
  }
}

function renderPieceSvg(color, type) {
  const isW = color === "w";
  const fillUrl = isW ? "url(#wg)" : "url(#bg)";
  const strokeCol = isW ? "#3b0764" : "#d8b4fe";
  const cls = isW ? "piece-svg piece-w" : "piece-svg piece-b";
  return '<svg class="' + cls + '" viewBox="0 0 45 45"><use href="#svg-' + type + '" fill="' + fillUrl + '" stroke="' + strokeCol + '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
}

function initBoardArray() {
  const layout = ["r","n","b","q","k","b","n","r"];
  board = Array.from({ length: 8 }, function() { return Array(8).fill(null); });
  for (let c = 0; c < 8; c++) {
    board[0][c] = { color: "b", type: layout[c] };
    board[1][c] = { color: "b", type: "p" };
    board[6][c] = { color: "w", type: "p" };
    board[7][c] = { color: "w", type: layout[c] };
  }
}

function cloneBoard(b) {
  return b.map(function(row) {
    return row.map(function(cell) {
      return cell ? { color: cell.color, type: cell.type } : null;
    });
  });
}

function inBounds(r, c) {
  return r >= 0 && r < 8 && c >= 0 && c < 8;
}

function findKing(b, color) {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = b[r][c];
      if (p && p.color === color && p.type === "k") return { r: r, c: c };
    }
  }
  return null;
}

function isSquareAttacked(b, targetR, targetC, attackerColor) {
  const pawnDir = attackerColor === "w" ? 1 : -1;
  const pr = targetR + pawnDir;
  for (const dc of [-1, 1]) {
    const pc = targetC + dc;
    if (inBounds(pr, pc)) {
      const p = b[pr][pc];
      if (p && p.color === attackerColor && p.type === "p") return true;
    }
  }
  const knightJumps = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
  for (const [dr, dc] of knightJumps) {
    const nr = targetR + dr, nc = targetC + dc;
    if (inBounds(nr, nc)) {
      const p = b[nr][nc];
      if (p && p.color === attackerColor && p.type === "n") return true;
    }
  }
  const kingSteps = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  for (const [dr, dc] of kingSteps) {
    const kr = targetR + dr, kc = targetC + dc;
    if (inBounds(kr, kc)) {
      const p = b[kr][kc];
      if (p && p.color === attackerColor && p.type === "k") return true;
    }
  }
  const ortho = [[-1,0],[1,0],[0,-1],[0,1]];
  for (const [dr, dc] of ortho) {
    let r = targetR + dr, c = targetC + dc;
    while (inBounds(r, c)) {
      const p = b[r][c];
      if (p) {
        if (p.color === attackerColor && (p.type === "r" || p.type === "q")) return true;
        break;
      }
      r += dr; c += dc;
    }
  }
  const diag = [[-1,-1],[-1,1],[1,-1],[1,1]];
  for (const [dr, dc] of diag) {
    let r = targetR + dr, c = targetC + dc;
    while (inBounds(r, c)) {
      const p = b[r][c];
      if (p) {
        if (p.color === attackerColor && (p.type === "b" || p.type === "q")) return true;
        break;
      }
      r += dr; c += dc;
    }
  }
  return false;
}

function isInCheck(b, color) {
  const k = findKing(b, color);
  if (!k) return false;
  return isSquareAttacked(b, k.r, k.c, color === "w" ? "b" : "w");
}

function applyMoveOnState(b, cast, ep, mv) {
  const nb = cloneBoard(b);
  const nCast = { wK: cast.wK, wQ: cast.wQ, bK: cast.bK, bQ: cast.bQ };
  let nEp = null;
  const piece = nb[mv.sr][mv.sc];
  nb[mv.sr][mv.sc] = null;

  if (mv.epCapture) {
    nb[mv.sr][mv.tc] = null;
  }
  if (mv.castle === "K") {
    nb[mv.sr][5] = nb[mv.sr][7];
    nb[mv.sr][7] = null;
  } else if (mv.castle === "Q") {
    nb[mv.sr][3] = nb[mv.sr][0];
    nb[mv.sr][0] = null;
  }

  const placedType = mv.promo || piece.type;
  nb[mv.tr][mv.tc] = { color: piece.color, type: placedType };

  if (piece.type === "p" && Math.abs(mv.tr - mv.sr) === 2) {
    nEp = { r: (mv.sr + mv.tr) >> 1, c: mv.sc };
  }
  if (piece.type === "k") {
    if (piece.color === "w") { nCast.wK = false; nCast.wQ = false; }
    else { nCast.bK = false; nCast.bQ = false; }
  }
  if (mv.sr === 7 && mv.sc === 0 || mv.tr === 7 && mv.tc === 0) nCast.wQ = false;
  if (mv.sr === 7 && mv.sc === 7 || mv.tr === 7 && mv.tc === 7) nCast.wK = false;
  if (mv.sr === 0 && mv.sc === 0 || mv.tr === 0 && mv.tc === 0) nCast.bQ = false;
  if (mv.sr === 0 && mv.sc === 7 || mv.tr === 0 && mv.tc === 7) nCast.bK = false;

  return { board: nb, castling: nCast, epSquare: nEp };
}

function generateLegalMoves(b, color, cast, ep) {
  const pseudo = [];
  const enemy = color === "w" ? "b" : "w";

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = b[r][c];
      if (!p || p.color !== color) continue;

      if (p.type === "p") {
        const dir = color === "w" ? -1 : 1;
        const startRow = color === "w" ? 6 : 1;
        const promoRow = color === "w" ? 0 : 7;
        const nr = r + dir;
        if (inBounds(nr, c) && !b[nr][c]) {
          if (nr === promoRow) {
            ["q","r","b","n"].forEach(function(pr) {
              pseudo.push({ sr: r, sc: c, tr: nr, tc: c, promo: pr });
            });
          } else {
            pseudo.push({ sr: r, sc: c, tr: nr, tc: c });
            const nr2 = r + dir * 2;
            if (r === startRow && !b[nr2][c]) {
              pseudo.push({ sr: r, sc: c, tr: nr2, tc: c });
            }
          }
        }
        for (const dc of [-1, 1]) {
          const nc = c + dc;
          if (!inBounds(nr, nc)) continue;
          const target = b[nr][nc];
          if (target && target.color === enemy) {
            if (nr === promoRow) {
              ["q","r","b","n"].forEach(function(pr) {
                pseudo.push({ sr: r, sc: c, tr: nr, tc: nc, promo: pr, capture: target });
              });
            } else {
              pseudo.push({ sr: r, sc: c, tr: nr, tc: nc, capture: target });
            }
          } else if (ep && ep.r === nr && ep.c === nc) {
            pseudo.push({ sr: r, sc: c, tr: nr, tc: nc, epCapture: true, capture: { color: enemy, type: "p" } });
          }
        }
      } else if (p.type === "n") {
        const jumps = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
        for (const [dr, dc] of jumps) {
          const nr = r + dr, nc = c + dc;
          if (!inBounds(nr, nc)) continue;
          const t = b[nr][nc];
          if (!t || t.color === enemy) pseudo.push({ sr: r, sc: c, tr: nr, tc: nc, capture: t || null });
        }
      } else if (p.type === "k") {
        const steps = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
        for (const [dr, dc] of steps) {
          const nr = r + dr, nc = c + dc;
          if (!inBounds(nr, nc)) continue;
          const t = b[nr][nc];
          if (!t || t.color === enemy) pseudo.push({ sr: r, sc: c, tr: nr, tc: nc, capture: t || null });
        }
        const homeRow = color === "w" ? 7 : 0;
        if (r === homeRow && c === 4 && !isSquareAttacked(b, homeRow, 4, enemy)) {
          const canK = color === "w" ? cast.wK : cast.bK;
          const canQ = color === "w" ? cast.wQ : cast.bQ;
          if (canK && !b[homeRow][5] && !b[homeRow][6] &&
              !isSquareAttacked(b, homeRow, 5, enemy) && !isSquareAttacked(b, homeRow, 6, enemy)) {
            pseudo.push({ sr: homeRow, sc: 4, tr: homeRow, tc: 6, castle: "K" });
          }
          if (canQ && !b[homeRow][3] && !b[homeRow][2] && !b[homeRow][1] &&
              !isSquareAttacked(b, homeRow, 3, enemy) && !isSquareAttacked(b, homeRow, 2, enemy)) {
            pseudo.push({ sr: homeRow, sc: 4, tr: homeRow, tc: 2, castle: "Q" });
          }
        }
      } else {
        const dirs = p.type === "r"
          ? [[-1,0],[1,0],[0,-1],[0,1]]
          : p.type === "b"
            ? [[-1,-1],[-1,1],[1,-1],[1,1]]
            : [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
        for (const [dr, dc] of dirs) {
          let nr = r + dr, nc = c + dc;
          while (inBounds(nr, nc)) {
            const t = b[nr][nc];
            if (!t) {
              pseudo.push({ sr: r, sc: c, tr: nr, tc: nc });
            } else {
              if (t.color === enemy) pseudo.push({ sr: r, sc: c, tr: nr, tc: nc, capture: t });
              break;
            }
            nr += dr; nc += dc;
          }
        }
      }
    }
  }

  const legal = [];
  for (const mv of pseudo) {
    const next = applyMoveOnState(b, cast, ep, mv);
    if (!isInCheck(next.board, color)) {
      legal.push(mv);
    }
  }
  return legal;
}

function evaluateBoard(b) {
  let score = 0;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = b[r][c];
      if (!p) continue;
      const base = PIECE_VALUES[p.type] || 0;
      const pr = p.color === "w" ? r : 7 - r;
      let pos = 0;
      if (p.type === "p") pos = PST_PAWN[pr][c];
      else if (p.type === "n") pos = PST_KNIGHT[pr][c];
      else if (p.type === "b") pos = PST_BISHOP[pr][c];
      else if (p.type === "k") pos = PST_KING[pr][c];
      else if (p.type === "q" || p.type === "r") pos = (3.5 - Math.abs(3.5 - pr)) * 4;
      score += p.color === "w" ? (base + pos) : -(base + pos);
    }
  }
  return score;
}

function orderMoves(moves) {
  return moves.sort(function(a, b) {
    const sa = (a.capture ? PIECE_VALUES[a.capture.type] * 10 : 0) + (a.promo ? 800 : 0);
    const sb = (b.capture ? PIECE_VALUES[b.capture.type] * 10 : 0) + (b.promo ? 800 : 0);
    return sb - sa;
  });
}

function minimax(b, depth, alpha, beta, maximizingColor, cast, ep) {
  const moves = generateLegalMoves(b, maximizingColor, cast, ep);
  if (depth === 0 || moves.length === 0) {
    if (moves.length === 0) {
      if (isInCheck(b, maximizingColor)) {
        return maximizingColor === "w" ? -99999 - depth : 99999 + depth;
      }
      return 0;
    }
    return evaluateBoard(b);
  }

  orderMoves(moves);
  const nextTurn = maximizingColor === "w" ? "b" : "w";

  if (maximizingColor === "w") {
    let maxEval = -Infinity;
    for (const mv of moves) {
      const st = applyMoveOnState(b, cast, ep, mv);
      const ev = minimax(st.board, depth - 1, alpha, beta, nextTurn, st.castling, st.epSquare);
      if (ev > maxEval) maxEval = ev;
      if (ev > alpha) alpha = ev;
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const mv of moves) {
      const st = applyMoveOnState(b, cast, ep, mv);
      const ev = minimax(st.board, depth - 1, alpha, beta, nextTurn, st.castling, st.epSquare);
      if (ev < minEval) minEval = ev;
      if (ev < beta) beta = ev;
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

function chooseAiMove(forColor, level) {
  const moves = generateLegalMoves(board, forColor, castling, epSquare);
  if (moves.length === 0) return null;
  if (level === 1 && Math.random() < 0.45) {
    return moves[Math.floor(Math.random() * moves.length)];
  }
  const depth = level === 1 ? 1 : level === 2 ? 2 : level === 3 ? 3 : 3;
  orderMoves(moves);
  let bestMove = moves[0];
  let bestScore = forColor === "w" ? -Infinity : Infinity;
  const nextColor = forColor === "w" ? "b" : "w";

  for (const mv of moves) {
    const st = applyMoveOnState(board, castling, epSquare, mv);
    const jitter = level < 4 ? (Math.random() * 16 - 8) : 0;
    const score = minimax(st.board, depth - 1, -Infinity, Infinity, nextColor, st.castling, st.epSquare) + jitter;
    if (forColor === "w") {
      if (score > bestScore) { bestScore = score; bestMove = mv; }
    } else {
      if (score < bestScore) { bestScore = score; bestMove = mv; }
    }
  }
  return bestMove;
}

function toAlgebraic(mv, piece) {
  if (mv.castle === "K") return "O-O";
  if (mv.castle === "Q") return "O-O-O";
  const files = "abcdefgh";
  const pChar = piece.type === "p" ? (mv.capture ? files[mv.sc] : "") : piece.type.toUpperCase();
  const cap = mv.capture ? "x" : "";
  const dest = files[mv.tc] + (8 - mv.tr);
  const pr = mv.promo ? "=" + mv.promo.toUpperCase() : "";
  return pChar + cap + dest + pr;
}

function executeMove(mv) {
  const movingPiece = board[mv.sr][mv.sc];
  historyStack.push({
    board: cloneBoard(board),
    turn: turn,
    castling: { wK: castling.wK, wQ: castling.wQ, bK: castling.bK, bQ: castling.bQ },
    epSquare: epSquare ? { r: epSquare.r, c: epSquare.c } : null,
    lastMove: lastMove ? { sr: lastMove.sr, sc: lastMove.sc, tr: lastMove.tr, tc: lastMove.tc } : null,
    notation: moveNotationList.slice()
  });

  const alg = toAlgebraic(mv, movingPiece);
  const next = applyMoveOnState(board, castling, epSquare, mv);
  board = next.board;
  castling = next.castling;
  epSquare = next.epSquare;
  lastMove = { sr: mv.sr, sc: mv.sc, tr: mv.tr, tc: mv.tc };
  selectedSq = null;
  legalMovesForSelected = [];
  hintSquares = null;

  turn = turn === "w" ? "b" : "w";
  const inChk = isInCheck(board, turn);
  const nextMoves = generateLegalMoves(board, turn, castling, epSquare);

  let suffix = "";
  if (nextMoves.length === 0) {
    suffix = inChk ? "#" : "";
  } else if (inChk) {
    suffix = "+";
  }
  moveNotationList.push(alg + suffix);

  if (nextMoves.length === 0) {
    gameOver = true;
    playSound("win");
    renderBoard();
    setTimeout(function() {
      const modal = document.getElementById("gameOverModal");
      const title = document.getElementById("goTitle");
      const sub = document.getElementById("goSub");
      if (inChk) {
        const winner = turn === "w" ? "Negras" : "Blancas";
        title.textContent = "👑 ¡JAQUE MATE!";
        sub.textContent = "Victoria magistral de las " + winner + " en " + Math.ceil(moveNotationList.length / 2) + " jugadas.";
      } else {
        title.textContent = "🤝 TABLAS POR AHOGADO";
        sub.textContent = "El rey no tiene movimientos legales disponibles.";
      }
      modal.classList.add("show");
    }, 350);
    return;
  }

  if (inChk) playSound("check");
  else if (mv.capture) playSound("capture");
  else playSound("move");

  renderBoard();

  if (!gameOver && gameMode === "ai" && turn !== humanColor) {
    setTimeout(function() {
      const aiMv = chooseAiMove(turn, aiLevel);
      if (aiMv) executeMove(aiMv);
    }, 260);
  }
}

function onSquareClick(r, c) {
  if (gameOver) return;
  if (gameMode === "ai" && turn !== humanColor) return;

  const existingMove = legalMovesForSelected.filter(function(m) {
    return m.tr === r && m.tc === c;
  });

  if (existingMove.length > 0) {
    if (existingMove.length > 1 && existingMove[0].promo) {
      openPromotionModal(existingMove);
      return;
    }
    executeMove(existingMove[0]);
    return;
  }

  const clickedPiece = board[r][c];
  if (clickedPiece && clickedPiece.color === turn) {
    selectedSq = { r: r, c: c };
    const allLegal = generateLegalMoves(board, turn, castling, epSquare);
    legalMovesForSelected = allLegal.filter(function(m) {
      return m.sr === r && m.sc === c;
    });
    renderBoard();
  } else {
    selectedSq = null;
    legalMovesForSelected = [];
    renderBoard();
  }
}

function openPromotionModal(promoMoves) {
  pendingPromo = promoMoves;
  const grid = document.getElementById("promoGrid");
  const labels = { q: "Reina", r: "Torre", b: "Alfil", n: "Caballo" };
  grid.innerHTML = promoMoves.map(function(mv, idx) {
    return '<div class="promo-item" onclick="confirmPromotion(' + idx + ')">' +
      '<div class="promo-icon">' + renderPieceSvg(turn, mv.promo) + '</div>' +
      '<span class="promo-lbl">' + labels[mv.promo] + '</span>' +
    '</div>';
  }).join("");
  document.getElementById("promoModal").classList.add("show");
}

function confirmPromotion(idx) {
  document.getElementById("promoModal").classList.remove("show");
  if (pendingPromo && pendingPromo[idx]) {
    const mv = pendingPromo[idx];
    pendingPromo = null;
    executeMove(mv);
  }
}

function updateMaterialAndTrays() {
  const startCounts = { wp:8, wn:2, wb:2, wr:2, wq:1, bp:8, bn:2, bb:2, br:2, bq:1 };
  const current = { wp:0, wn:0, wb:0, wr:0, wq:0, bp:0, bn:0, bb:0, br:0, bq:0 };
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p && p.type !== "k") {
        const k = p.color + p.type;
        current[k] = (current[k] || 0) + 1;
      }
    }
  }
  const capturedByWhite = [];
  const capturedByBlack = [];
  ["q","r","b","n","p"].forEach(function(t) {
    const missingB = Math.max(0, startCounts["b" + t] - current["b" + t]);
    for (let i = 0; i < missingB; i++) capturedByWhite.push(UNICODE_MINI["b" + t]);
    const missingW = Math.max(0, startCounts["w" + t] - current["w" + t]);
    for (let i = 0; i < missingW; i++) capturedByBlack.push(UNICODE_MINI["w" + t]);
  });

  const evalScore = evaluateBoard(board);
  const matDiff = Math.round(evalScore / 100);
  const whitePct = Math.min(94, Math.max(6, 50 + (evalScore / 18)));
  document.getElementById("evalBlack").style.height = (100 - whitePct) + "%";

  const topIsBlack = !flipped;
  document.getElementById("topTray").textContent = (topIsBlack ? capturedByBlack : capturedByWhite).join("");
  document.getElementById("botTray").textContent = (topIsBlack ? capturedByWhite : capturedByBlack).join("");

  const wAdv = matDiff > 0 ? "+" + matDiff : "";
  const bAdv = matDiff < 0 ? "+" + Math.abs(matDiff) : "";
  document.getElementById("topAdv").textContent = topIsBlack ? bAdv : wAdv;
  document.getElementById("botAdv").textContent = topIsBlack ? wAdv : bAdv;
}

function renderBoard() {
  const grid = document.getElementById("boardGrid");
  const files = "abcdefgh";
  const wKingCheck = isInCheck(board, "w") ? findKing(board, "w") : null;
  const bKingCheck = isInCheck(board, "b") ? findKing(board, "b") : null;

  let html = "";
  for (let dr = 0; dr < 8; dr++) {
    for (let dc = 0; dc < 8; dc++) {
      const r = flipped ? 7 - dr : dr;
      const c = flipped ? 7 - dc : dc;
      const isLight = (r + c) % 2 === 0;
      let cls = "sq " + (isLight ? "light" : "dark");

      if (selectedSq && selectedSq.r === r && selectedSq.c === c) cls += " selected";
      if (lastMove && ((lastMove.sr === r && lastMove.sc === c) || (lastMove.tr === r && lastMove.tc === c))) {
        cls += " last-move";
      }
      if (hintSquares && ((hintSquares.sr === r && hintSquares.sc === c) || (hintSquares.tr === r && hintSquares.tc === c))) {
        cls += " selected";
      }

      const p = board[r][c];
      if ((wKingCheck && wKingCheck.r === r && wKingCheck.c === c) ||
          (bKingCheck && bKingCheck.r === r && bKingCheck.c === c)) {
        cls += " in-check";
      }

      const isTarget = legalMovesForSelected.some(function(m) { return m.tr === r && m.tc === c; });
      let inner = "";
      if (dc === 0) inner += '<span class="coord-rank">' + (8 - r) + '</span>';
      if (dr === 7) inner += '<span class="coord-file">' + files[c] + '</span>';

      if (p) {
        inner += '<div class="piece-wrap">' + renderPieceSvg(p.color, p.type) + '</div>';
      }
      if (isTarget) {
        inner += p ? '<div class="capture-ring"></div>' : '<div class="move-dot"></div>';
      }

      html += '<div class="' + cls + '" onclick="onSquareClick(' + r + ',' + c + ')">' + inner + '</div>';
    }
  }
  grid.innerHTML = html;

  updateMaterialAndTrays();
  updateHeadersAndStatus(Boolean(wKingCheck || bKingCheck));
}

function updateHeadersAndStatus(anyCheck) {
  const topIsBlack = !flipped;
  const lvNames = { 1: "FÁCIL", 2: "CLUB", 3: "MAESTRO", 4: "GM ÉLITE" };
  document.getElementById("modeSubLabel").textContent =
    gameMode === "ai" ? ("IA NIVEL " + lvNames[aiLevel]) : "DUELO PVP LOCAL";

  const wLabel = gameMode === "ai" ? (humanColor === "w" ? USER_NAME : "Aura Neural AI") : (USER_NAME + " (Blancas)");
  const bLabel = gameMode === "ai" ? (humanColor === "b" ? USER_NAME : "Aura Neural AI") : "Jugador 2 (Negras)";

  document.getElementById("topName").textContent = topIsBlack ? bLabel : wLabel;
  document.getElementById("botName").textContent = topIsBlack ? wLabel : bLabel;
  document.getElementById("topAva").textContent = topIsBlack ? "⚫" : "⚪";
  document.getElementById("botAva").textContent = topIsBlack ? "⚪" : "⚫";

  const topTurn = (topIsBlack && turn === "b") || (!topIsBlack && turn === "w");
  document.getElementById("topAva").className = "p-ava" + (topTurn ? " turn-glow" : "");
  document.getElementById("botAva").className = "p-ava" + (!topTurn ? " turn-glow" : "");
  document.getElementById("topClock").className = "clock" + (topTurn ? " active-clock" : "");
  document.getElementById("botClock").className = "clock" + (!topTurn ? " active-clock" : "");

  const dot = document.getElementById("statusDot");
  const stTxt = document.getElementById("statusText");
  if (gameOver) {
    dot.className = "status-dot warn";
    stTxt.textContent = "Partida Finalizada";
  } else if (anyCheck) {
    dot.className = "status-dot warn";
    stTxt.textContent = "⚠️ ¡JAQUE AL REY " + (turn === "w" ? "BLANCO!" : "NEGRO!");
  } else {
    dot.className = "status-dot";
    stTxt.textContent = "Turno de las " + (turn === "w" ? "Blancas ⚪" : "Negras ⚫");
  }

  document.getElementById("moveCounter").textContent = "Jugada #" + (Math.floor(moveNotationList.length / 2) + 1);
  const logEl = document.getElementById("moveLog");
  if (moveNotationList.length === 0) {
    logEl.innerHTML = "<span>Selecciona una pieza para comenzar la partida...</span>";
  } else {
    let pairs = [];
    for (let i = 0; i < moveNotationList.length; i += 2) {
      const num = (i >> 1) + 1;
      const wMv = moveNotationList[i];
      const bMv = moveNotationList[i + 1] || "";
      pairs.push('<span class="mv-chip">' + num + ". " + wMv + (bMv ? " " + bMv : "") + '</span>');
    }
    logEl.innerHTML = pairs.join("");
    logEl.scrollLeft = logEl.scrollWidth;
  }
}

function formatClock(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
}

function renderClocks() {
  const topIsBlack = !flipped;
  document.getElementById("topClock").textContent = formatClock(topIsBlack ? clocks.b : clocks.w);
  document.getElementById("botClock").textContent = formatClock(topIsBlack ? clocks.w : clocks.b);
}

function startClockLoop() {
  if (clockTimer) clearInterval(clockTimer);
  clockTimer = setInterval(function() {
    if (gameOver) return;
    clocks[turn] = Math.max(0, clocks[turn] - 1);
    renderClocks();
    if (clocks[turn] === 0) {
      gameOver = true;
      playSound("win");
      const winner = turn === "w" ? "Negras" : "Blancas";
      document.getElementById("goTitle").textContent = "⏱️ TIEMPO AGOTADO";
      document.getElementById("goSub").textContent = "Victoria por tiempo para las " + winner + ".";
      document.getElementById("gameOverModal").classList.add("show");
    }
  }, 1000);
}

function toggle3D() {
  is3D = !is3D;
  const f = document.getElementById("boardFrame");
  const btn = document.getElementById("btn3D");
  if (is3D) { f.classList.add("view-3d"); btn.classList.add("active"); }
  else { f.classList.remove("view-3d"); btn.classList.remove("active"); }
}

function cycleTheme() {
  themeIdx = (themeIdx + 1) % THEMES.length;
  const grid = document.getElementById("boardGrid");
  grid.className = ("board-grid " + THEMES[themeIdx]).trim();
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  const btn = document.getElementById("btnSound");
  btn.textContent = soundEnabled ? "🔊" : "🔇";
  btn.classList.toggle("active", soundEnabled);
}

function flipBoard() {
  flipped = !flipped;
  renderBoard();
  renderClocks();
}

function setGameMode(m) {
  gameMode = m;
  document.getElementById("modeAiBtn").classList.toggle("active", m === "ai");
  document.getElementById("modePvpBtn").classList.toggle("active", m === "pvp");
  document.getElementById("diffRow").style.display = m === "ai" ? "flex" : "none";
  document.getElementById("sideWrap").style.display = m === "ai" ? "flex" : "none";
  document.getElementById("sideLbl").style.display = m === "ai" ? "inline" : "none";
  resetGame();
}

function setPlayerColor(c) {
  humanColor = c;
  flipped = c === "b";
  document.getElementById("sideWBtn").classList.toggle("active", c === "w");
  document.getElementById("sideBBtn").classList.toggle("active", c === "b");
  resetGame();
}

function setDifficulty(lv) {
  aiLevel = lv;
  document.querySelectorAll("#diffRow .seg-btn").forEach(function(b) {
    b.classList.toggle("active", Number(b.getAttribute("data-lv")) === lv);
  });
  updateHeadersAndStatus(isInCheck(board, turn));
}

function undoMove() {
  if (historyStack.length === 0 || gameOver) return;
  const steps = (gameMode === "ai" && historyStack.length >= 2) ? 2 : 1;
  let state = null;
  for (let i = 0; i < steps; i++) {
    state = historyStack.pop();
  }
  if (state) {
    board = state.board;
    turn = state.turn;
    castling = state.castling;
    epSquare = state.epSquare;
    lastMove = state.lastMove;
    moveNotationList = state.notation;
    selectedSq = null;
    legalMovesForSelected = [];
    hintSquares = null;
    renderBoard();
  }
}

function requestHint() {
  if (gameOver) return;
  const best = chooseAiMove(turn, 3);
  if (best) {
    hintSquares = { sr: best.sr, sc: best.sc, tr: best.tr, tc: best.tc };
    playSound("move");
    renderBoard();
  }
}

function closeGameOver() {
  document.getElementById("gameOverModal").classList.remove("show");
  resetGame();
}

function resetGame() {
  initBoardArray();
  turn = "w";
  castling = { wK: true, wQ: true, bK: true, bQ: true };
  epSquare = null;
  selectedSq = null;
  legalMovesForSelected = [];
  lastMove = null;
  historyStack = [];
  moveNotationList = [];
  gameOver = false;
  hintSquares = null;
  clocks = { w: 600, b: 600 };
  renderClocks();
  renderBoard();
  startClockLoop();

  if (gameMode === "ai" && humanColor === "b") {
    setTimeout(function() {
      const aiMv = chooseAiMove("w", aiLevel);
      if (aiMv) executeMove(aiMv);
    }, 350);
  }
}

resetGame();
</script>`;

  return {
    view_model: {
      __typename: "GenAISingleLayoutViewModel",
      primitive: {
        __typename: "FOAHtmlPrimitiveDemoDONOTUSE",
        trusted_sources: [],
        payload: html,
      },
    },
  };
}

export default {
  name: ["ajedrez", "ajd", "chess"],
  category: "games",
  description: "Juega Ajedrez 3D Hiperrealista con motor IA multinivel, modo PvP y efectos acústicos en vivo.",
  groupOnly: false,
  ownerOnly: false,

  async run(ctx: CommandContext) {
    const { sock, from, msg, reply, react } = ctx;
    const playerName = msg?.pushName || "Jugador";

    await react("♟️").catch(() => undefined);

    try {
      const { AIRich } = await import("baileys/lib/Builders/ai-rich.js");
      const rich = new AIRich(sock)
        .setTitle("♟️ AURA CHESS 3D // GRANDMASTER SUITE")
        .setFooter("IA Multinivel & PvP • Audio Realista • Toca para jugar");

      rich.addSection(buildChessRichPayload(playerName));

      await rich.send(from, { quoted: msg });
      await react("✅").catch(() => undefined);
    } catch (error) {
      await react("❌").catch(() => undefined);
      await reply(
        `${fytBold("Error")} al iniciar el motor de ajedrez: ${error instanceof Error ? error.message : String(error)}`,
      ).catch(() => undefined);
    }
  },
};
