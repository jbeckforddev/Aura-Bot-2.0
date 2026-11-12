import { randomUUID } from "node:crypto";
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

function buildMario3Html(): string {
  return `<style>
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
html,body{width:100%;height:100%;background:#120b07;font-family:'Courier New',monospace;overflow:hidden;touch-action:none}
#console-wrap{position:fixed;inset:0;width:100vw;height:100dvh;display:flex;flex-direction:column;background:linear-gradient(180deg,#4a2611 0%,#2d1609 100%);overflow:hidden}
.top-banner{height:36px;background:linear-gradient(180deg,#8c4a20 0%,#5c2c0e 100%);border-bottom:2px solid #d49b35;display:flex;align-items:center;justify-content:center;color:#ffdf80;font-size:13px;font-weight:900;letter-spacing:1.5px;text-shadow:1px 2px 0 #2b1103;flex-shrink:0}
.bezel-outer{background:#4678b4;padding:8px 10px 10px;border-bottom:3px solid #1e3c64;display:flex;flex-direction:column;align-items:center;flex-shrink:0}
.bezel-header{width:100%;max-width:380px;display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:6px}
.gold-line{flex:1;height:3px;background:linear-gradient(90deg,#8a6421,#ffd86b,#8a6421);border-radius:2px}
.bezel-title{font-size:10px;font-weight:900;color:#fff2b2;letter-spacing:1px;text-shadow:1px 1px 0 #1b355a;white-space:nowrap}
.screen-frame{position:relative;width:100%;max-width:380px;aspect-ratio:256/224;background:#000;border:4px solid #141414;outline:2.5px solid #d4a238;border-radius:10px;overflow:hidden;box-shadow:0 8px 22px rgba(0,0,0,.75)}
canvas#nes{width:100%;height:100%;display:block;image-rendering:pixelated}
.active-led{position:absolute;top:33%;left:6px;display:flex;flex-direction:column;align-items:center;gap:2px;pointer-events:none;z-index:5}
.led-dot{width:8px;height:8px;border-radius:50%;background:#4dff4d;box-shadow:0 0 8px #4dff4d}
.led-txt{font-size:7px;font-weight:900;color:#2c3e50;letter-spacing:.5px;text-shadow:0 0 2px #fff}
.controls-body{flex:1;background:linear-gradient(180deg,#3e210e 0%,#261307 100%);display:flex;flex-direction:column;justify-content:space-between;align-items:center;padding:12px 16px 16px}
.meta-row{display:flex;gap:26px;justify-content:center;width:100%;margin-top:2px}
.pill-btn{min-width:96px;height:34px;background:linear-gradient(180deg,#e0af45 0%,#9e6f18 100%);border:none;border-bottom:4px solid #4a3006;border-radius:8px;color:#fff4c2;font-family:sans-serif;font-size:11px;font-weight:900;letter-spacing:1.2px;text-shadow:1px 1px 1px #4a3006;box-shadow:0 4px 10px rgba(0,0,0,.5);cursor:pointer}
.pill-btn:active{transform:translateY(2px);border-bottom-width:2px}
.main-pad-row{width:100%;max-width:390px;display:flex;justify-content:space-between;align-items:center;padding:4px 4px}
.dpad-circle{position:relative;width:154px;height:154px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#b84e24,#782b0d 75%);box-shadow:0 10px 22px rgba(0,0,0,.65),inset 0 2px 4px rgba(255,255,255,.22);border:2px solid #521c07}
.d-key{position:absolute;width:44px;height:44px;background:linear-gradient(180deg,#9c3b16,#6b2308);border:1.5px solid #4a1604;border-radius:8px;color:#ffeedb;font-size:16px;font-weight:900;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 6px rgba(0,0,0,.45);cursor:pointer}
.d-key:active,.d-key.pressed{background:#d45b2b;transform:scale(.94)}
.d-up{top:8px;left:53px}
.d-down{bottom:8px;left:53px}
.d-left{left:8px;top:53px}
.d-right{right:8px;top:53px}
.d-center{position:absolute;top:55px;left:55px;width:40px;height:40px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#ffe066,#c9971c);box-shadow:inset 0 2px 4px rgba(0,0,0,.4)}
.ab-dock{width:146px;height:78px;border-radius:42px;background:linear-gradient(180deg,#a6421a,#6e250a);border:2px solid #4d1805;box-shadow:0 10px 22px rgba(0,0,0,.65),inset 0 2px 3px rgba(255,255,255,.2);display:flex;align-items:center;justify-content:space-around;padding:0 10px}
.act-circle{width:54px;height:54px;border-radius:50%;border:3px solid #f4f4f6;font-family:sans-serif;font-size:20px;font-weight:900;color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 5px 10px rgba(0,0,0,.55);cursor:pointer;text-shadow:1px 1px 2px rgba(0,0,0,.6)}
.act-b{background:radial-gradient(circle at 35% 30%,#f5cb5c,#b58316)}
.act-a{background:radial-gradient(circle at 35% 30%,#ec382b,#99130b)}
.act-circle:active,.act-circle.pressed{transform:scale(.92);filter:brightness(1.15)}
.bottom-row{width:100%;display:flex;justify-content:center}
.reset-btn{min-width:118px;height:34px}
</style>

<div id="console-wrap">
  <div class="top-banner">★ SUPER MARIO BROS. 3 ★</div>

  <div class="bezel-outer">
    <div class="bezel-header">
      <div class="gold-line"></div>
      <div class="bezel-title">SUPER MARIO BROS</div>
      <div class="gold-line"></div>
    </div>

    <div class="screen-frame">
      <div class="active-led">
        <div class="led-dot"></div>
        <div class="led-txt">ACTIVE</div>
      </div>
      <canvas id="nes" width="256" height="224"></canvas>
    </div>
  </div>

  <div class="controls-body">
    <div class="meta-row">
      <button class="pill-btn" id="btnSelect">SELECT</button>
      <button class="pill-btn" id="btnStart">START</button>
    </div>

    <div class="main-pad-row">
      <div class="dpad-circle">
        <div class="d-key d-up" data-k="up">▲</div>
        <div class="d-key d-left" data-k="left">◀</div>
        <div class="d-center"></div>
        <div class="d-key d-right" data-k="right">▶</div>
        <div class="d-key d-down" data-k="down">▼</div>
      </div>

      <div class="ab-dock">
        <div class="act-circle act-b" data-k="b">B</div>
        <div class="act-circle act-a" data-k="a">A</div>
      </div>
    </div>

    <div class="bottom-row">
      <button class="pill-btn reset-btn" id="btnReset">REINICIAR</button>
    </div>
  </div>
</div>

<script>
(function(){
  const cv = document.getElementById("nes");
  const ctx = cv.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  const keys = { left: false, right: false, up: false, down: false, a: false, b: false };
  let prevA = false;
  let prevB = false;

  let audioCtx = null;
  function sfx(type) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      if (!audioCtx) audioCtx = new AC();
      if (audioCtx.state === "suspended") audioCtx.resume();
      const now = audioCtx.currentTime;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      if (type === "jump") {
        osc.type = "square";
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(520, now + 0.14);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.14);
        osc.start(now);
        osc.stop(now + 0.14);
      } else if (type === "coin") {
        osc.type = "square";
        osc.frequency.setValueAtTime(987.77, now);
        osc.frequency.setValueAtTime(1318.51, now + 0.06);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.22);
        osc.start(now);
        osc.stop(now + 0.22);
      } else if (type === "stomp") {
        osc.type = "triangle";
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(90, now + 0.1);
        gain.gain.setValueAtTime(0.16, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
      } else if (type === "powerup") {
        osc.type = "square";
        const notes = [330, 392, 659, 523, 587, 784];
        notes.forEach((n, i) => osc.frequency.setValueAtTime(n, now + i * 0.045));
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
      } else if (type === "bump") {
        osc.type = "square";
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(75, now + 0.08);
        gain.gain.setValueAtTime(0.14, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
      } else if (type === "die") {
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.linearRampToValueAtTime(110, now + 0.4);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);
      }
    } catch(e){}
  }

  let state = "title";
  let tick = 0;
  let score = 0;
  let coins = 0;
  let lives = 4;
  let timer = 299;
  let timerSub = 0;
  let cards = [0, 0, 0];
  let camX = 0;

  let mario = {
    x: 24,
    y: 144,
    vx: 0,
    vy: 0,
    w: 12,
    h: 16,
    dir: 1,
    ground: false,
    pMeter: 0,
    form: 1,
    invuln: 0,
    tailTimer: 0,
    dead: false,
    deadTimer: 0
  };

  let blocks = [];
  let pipes = [];
  let enemies = [];
  let items = [];
  let particles = [];
  const LEVEL_END_X = 1650;

  function buildWorld1_1() {
    blocks = [
      { x: 176, y: 112, t: "q", item: "coin", hit: 0 },
      { x: 192, y: 112, t: "q", item: "mushroom", hit: 0 },
      { x: 224, y: 72,  t: "q", item: "coin", hit: 0 },
      { x: 240, y: 72,  t: "q", item: "leaf", hit: 0 },

      { x: 352, y: 120, t: "b", item: null, hit: 0 },
      { x: 368, y: 120, t: "q", item: "coin", hit: 0 },
      { x: 384, y: 120, t: "b", item: null, hit: 0 },
      { x: 400, y: 120, t: "q", item: "leaf", hit: 0 },

      { x: 540, y: 128, t: "wood", w: 32, h: 32 },
      { x: 572, y: 112, t: "wood", w: 32, h: 48 },

      { x: 690, y: 112, t: "b", item: null, hit: 0 },
      { x: 706, y: 112, t: "q", item: "coin", hit: 0 },
      { x: 722, y: 112, t: "q", item: "coin", hit: 0 },
      { x: 738, y: 112, t: "b", item: null, hit: 0 },

      { x: 706, y: 64,  t: "q", item: "leaf", hit: 0 },
      { x: 722, y: 64,  t: "q", item: "coin", hit: 0 },

      { x: 960, y: 112, t: "b", item: null, hit: 0 },
      { x: 976, y: 112, t: "q", item: "mushroom", hit: 0 },
      { x: 992, y: 112, t: "b", item: null, hit: 0 },

      { x: 1140, y: 96, t: "q", item: "coin", hit: 0 },
      { x: 1156, y: 96, t: "q", item: "coin", hit: 0 },
      { x: 1172, y: 96, t: "q", item: "leaf", hit: 0 },

      { x: 1320, y: 128, t: "wood", w: 32, h: 32 },
      { x: 1352, y: 112, t: "wood", w: 32, h: 48 },
      { x: 1384, y: 96,  t: "wood", w: 32, h: 64 }
    ];

    pipes = [
      { x: 288, y: 128, w: 28, h: 32, color: "#de9c84", plant: true },
      { x: 464, y: 116, w: 28, h: 44, color: "#48d854", plant: true },
      { x: 832, y: 112, w: 28, h: 48, color: "#48d854", plant: true },
      { x: 1060, y: 124, w: 28, h: 36, color: "#de9c84", plant: false },
      { x: 1250, y: 116, w: 28, h: 44, color: "#48d854", plant: true }
    ];

    enemies = [
      { x: 200, y: 144, vx: -0.55, vy: 0, type: "goomba", state: "walk", deadTimer: 0 },
      { x: 330, y: 144, vx: -0.6,  vy: 0, type: "koopa",  state: "walk", deadTimer: 0 },
      { x: 425, y: 144, vx: -0.55, vy: 0, type: "goomba", state: "walk", deadTimer: 0 },
      { x: 640, y: 144, vx: -0.6,  vy: 0, type: "koopa",  state: "walk", deadTimer: 0 },
      { x: 760, y: 144, vx: -0.55, vy: 0, type: "goomba", state: "walk", deadTimer: 0 },
      { x: 785, y: 144, vx: -0.55, vy: 0, type: "goomba", state: "walk", deadTimer: 0 },
      { x: 920, y: 144, vx: -0.65, vy: 0, type: "koopa",  state: "walk", deadTimer: 0 },
      { x: 1120, y: 144, vx: -0.55, vy: 0, type: "goomba", state: "walk", deadTimer: 0 },
      { x: 1190, y: 144, vx: -0.6,  vy: 0, type: "koopa",  state: "walk", deadTimer: 0 },
      { x: 1450, y: 144, vx: -0.6,  vy: 0, type: "goomba", state: "walk", deadTimer: 0 }
    ];

    items = [];
    particles = [];
  }

  function resetLevel(fullReset) {
    if (fullReset) {
      score = 0;
      coins = 0;
      lives = 4;
      cards = [0, 0, 0];
      mario.form = 1;
    }
    timer = 299;
    timerSub = 0;
    camX = 0;
    mario.x = 24;
    mario.y = 140;
    mario.vx = 0;
    mario.vy = 0;
    mario.dir = 1;
    mario.ground = false;
    mario.pMeter = 0;
    mario.invuln = 0;
    mario.dead = false;
    mario.deadTimer = 0;
    buildWorld1_1();
  }

  function isGap(x) {
    return (x > 612 && x < 648) || (x > 1012 && x < 1044);
  }

  function spawnBlockItem(b) {
    if (b.item === "coin") {
      coins++;
      score += 200;
      sfx("coin");
      particles.push({ x: b.x + 4, y: b.y - 12, vy: -3.2, life: 22, type: "coin" });
    } else if (b.item === "mushroom" || b.item === "leaf") {
      sfx("bump");
      const kind = (mario.form >= 1 && b.item === "leaf") ? "leaf" : "mushroom";
      items.push({
        x: b.x,
        y: b.y - 14,
        vx: kind === "mushroom" ? 0.85 : 0,
        vy: kind === "leaf" ? -2.4 : -1.2,
        type: kind
      });
    }
  }

  function hurtMario() {
    if (mario.invuln > 0 || mario.dead) return;
    if (mario.form > 0) {
      mario.form--;
      mario.invuln = 70;
      sfx("bump");
    } else {
      mario.dead = true;
      mario.vy = -4.6;
      mario.deadTimer = 75;
      sfx("die");
    }
  }

  function updatePlay() {
    tick++;

    if (mario.dead) {
      mario.vy += 0.22;
      mario.y += mario.vy;
      mario.deadTimer--;
      if (mario.deadTimer <= 0) {
        lives--;
        if (lives < 0) {
          state = "title";
          resetLevel(true);
        } else {
          resetLevel(false);
        }
      }
      return;
    }

    timerSub++;
    if (timerSub >= 35) {
      timerSub = 0;
      if (timer > 0) timer--;
      else hurtMario();
    }

    if (mario.invuln > 0) mario.invuln--;
    if (mario.tailTimer > 0) mario.tailTimer--;

    const running = keys.b;
    const maxSpd = running ? 2.65 : 1.55;
    const accel = mario.ground ? 0.14 : 0.09;

    if (keys.left) {
      mario.vx = Math.max(-maxSpd, mario.vx - accel);
      mario.dir = -1;
    } else if (keys.right) {
      mario.vx = Math.min(maxSpd, mario.vx + accel);
      mario.dir = 1;
    } else {
      mario.vx *= 0.82;
      if (Math.abs(mario.vx) < 0.05) mario.vx = 0;
    }

    if (running && Math.abs(mario.vx) > 2.1 && mario.ground) {
      mario.pMeter = Math.min(100, mario.pMeter + 1.6);
    } else if (mario.ground) {
      mario.pMeter = Math.max(0, mario.pMeter - 0.8);
    }

    const aJustPressed = keys.a && !prevA;
    const bJustPressed = keys.b && !prevB;

    if (bJustPressed && mario.form === 2) {
      mario.tailTimer = 14;
      sfx("bump");
      enemies.forEach(en => {
        if (en.state !== "dead" && Math.abs(en.x - mario.x) < 24 && Math.abs(en.y - mario.y) < 20) {
          en.state = "dead";
          en.deadTimer = 15;
          score += 200;
          sfx("stomp");
        }
      });
    }

    if (aJustPressed) {
      if (mario.ground) {
        mario.vy = mario.pMeter >= 95 ? -5.3 : -4.65;
        mario.ground = false;
        sfx("jump");
      } else if (mario.form === 2) {
        if (mario.pMeter >= 95) {
          mario.vy = -3.2;
          sfx("jump");
        } else if (mario.vy > 0.5) {
          mario.vy = 0.4;
        }
      }
    }

    prevA = keys.a;
    prevB = keys.b;

    mario.vy = Math.min(4.5, mario.vy + (keys.a && mario.vy < 0 ? 0.17 : 0.25));
    mario.x = Math.max(camX + 4, mario.x + mario.vx);

    const mH = mario.form === 0 ? 14 : 18;
    mario.h = mH;

    pipes.forEach(p => {
      if (mario.x + 12 > p.x && mario.x < p.x + p.w && mario.y + mH > p.y + 2) {
        if (mario.vx > 0 && mario.x + 12 - mario.vx <= p.x + 4) {
          mario.x = p.x - 12;
          mario.vx = 0;
        } else if (mario.vx < 0 && mario.x - mario.vx >= p.x + p.w - 4) {
          mario.x = p.x + p.w;
          mario.vx = 0;
        }
      }
    });

    blocks.forEach(b => {
      if (b.t === "wood") {
        if (mario.x + 12 > b.x && mario.x < b.x + b.w && mario.y + mH > b.y + 2) {
          if (mario.vx > 0 && mario.x + 12 - mario.vx <= b.x + 4) {
            mario.x = b.x - 12;
            mario.vx = 0;
          } else if (mario.vx < 0 && mario.x - mario.vx >= b.x + b.w - 4) {
            mario.x = b.x + b.w;
            mario.vx = 0;
          }
        }
      }
    });

    mario.y += mario.vy;
    mario.ground = false;

    const floorY = 160;
    if (!isGap(mario.x + 6) && mario.y + mH >= floorY && mario.vy >= 0) {
      mario.y = floorY - mH;
      mario.vy = 0;
      mario.ground = true;
    }

    if (mario.y > 195) {
      hurtMario();
    }

    pipes.forEach(p => {
      if (mario.x + 11 > p.x && mario.x + 1 < p.x + p.w) {
        if (mario.vy >= 0 && mario.y + mH >= p.y && mario.y + mH - mario.vy <= p.y + 8) {
          mario.y = p.y - mH;
          mario.vy = 0;
          mario.ground = true;
        }
      }
    });

    blocks.forEach(b => {
      if (b.hit > 0) b.hit--;
      const bw = b.w || 16;
      const bh = b.h || 16;
      if (mario.x + 11 > b.x && mario.x + 1 < b.x + bw) {
        if (mario.vy >= 0 && mario.y + mH >= b.y && mario.y + mH - mario.vy <= b.y + 8) {
          mario.y = b.y - mH;
          mario.vy = 0;
          mario.ground = true;
        } else if (b.t !== "wood" && mario.vy < 0 && mario.y <= b.y + bh && mario.y - mario.vy >= b.y + bh - 8) {
          mario.y = b.y + bh;
          mario.vy = 1.2;
          if (b.t === "q") {
            b.t = "empty";
            b.hit = 6;
            spawnBlockItem(b);
          } else if (b.t === "b") {
            b.hit = 5;
            sfx("bump");
          }
        }
      }
    });

    if (mario.x - camX > 116) {
      camX = Math.min(LEVEL_END_X - 180, mario.x - 116);
    }

    if (mario.x >= LEVEL_END_X && mario.x <= LEVEL_END_X + 28 && mario.y <= 130) {
      sfx("powerup");
      score += 1000;
      const cardType = ((tick >> 3) % 3) + 1;
      const emptyIdx = cards.findIndex(c => c === 0);
      if (emptyIdx !== -1) cards[emptyIdx] = cardType;
      else cards = [cardType, 0, 0];
      resetLevel(false);
    }

    for (let i = items.length - 1; i >= 0; i--) {
      const it = items[i];
      if (it.type === "mushroom") {
        it.vy = Math.min(3, it.vy + 0.2);
        it.x += it.vx;
        it.y += it.vy;
        if (it.y + 14 >= floorY) {
          it.y = floorY - 14;
          it.vy = 0;
        }
      } else {
        it.vy = Math.min(0.8, it.vy + 0.08);
        it.y += it.vy;
        it.x += Math.sin(tick * 0.12) * 0.9;
        if (it.y + 14 >= floorY) it.y = floorY - 14;
      }

      if (Math.abs(mario.x - it.x) < 14 && Math.abs(mario.y - it.y) < 16) {
        sfx("powerup");
        score += 1000;
        if (it.type === "leaf") mario.form = 2;
        else if (mario.form === 0) mario.form = 1;
        items.splice(i, 1);
      }
    }

    for (let i = enemies.length - 1; i >= 0; i--) {
      const en = enemies[i];
      if (en.x - camX > 280 || en.x - camX < -60) continue;

      if (en.state === "dead") {
        en.deadTimer--;
        if (en.deadTimer <= 0) enemies.splice(i, 1);
        continue;
      }

      en.x += en.vx;
      pipes.forEach(p => {
        if (en.x + 14 > p.x && en.x < p.x + p.w && en.y + 16 > p.y) {
          en.vx = -en.vx;
          en.x += en.vx * 2;
        }
      });

      if (en.state === "shell_move") {
        enemies.forEach((other, j) => {
          if (i !== j && other.state !== "dead" && Math.abs(en.x - other.x) < 14) {
            other.state = "dead";
            other.deadTimer = 12;
            score += 100;
            sfx("stomp");
          }
        });
      }

      if (Math.abs(mario.x - en.x) < 13 && Math.abs((mario.y + mH - 8) - (en.y + 8)) < 14) {
        if (mario.vy > 0 && mario.y + mH - mario.vy <= en.y + 8) {
          mario.vy = -3.8;
          sfx("stomp");
          score += 100;
          if (en.type === "goomba") {
            en.state = "dead";
            en.deadTimer = 18;
          } else if (en.type === "koopa") {
            if (en.state === "walk") {
              en.state = "shell";
              en.vx = 0;
            } else if (en.state === "shell") {
              en.state = "shell_move";
              en.vx = mario.dir * 3.8;
            } else {
              en.state = "shell";
              en.vx = 0;
            }
          }
        } else if (en.state === "shell") {
          en.state = "shell_move";
          en.vx = (mario.x < en.x ? 1 : -1) * 3.8;
          sfx("stomp");
        } else {
          hurtMario();
        }
      }
    }

    for (let i = particles.length - 1; i >= 0; i--) {
      const pt = particles[i];
      pt.y += pt.vy;
      pt.vy += 0.25;
      pt.life--;
      if (pt.life <= 0) particles.splice(i, 1);
    }
  }

  function drawCloud(x, y) {
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(x + 10, y + 10, 9, 0, Math.PI * 2);
    ctx.arc(x + 22, y + 8, 11, 0, Math.PI * 2);
    ctx.arc(x + 34, y + 10, 9, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(x + 10, y + 10, 7.5, 0, Math.PI * 2);
    ctx.arc(x + 22, y + 8, 9.5, 0, Math.PI * 2);
    ctx.arc(x + 34, y + 10, 7.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#000";
    ctx.fillRect(x + 14, y + 6, 2, 4);
    ctx.fillRect(x + 18, y + 6, 2, 4);
    ctx.fillRect(x + 25, y + 6, 2, 4);
    ctx.fillRect(x + 29, y + 6, 2, 4);
  }

  function drawHill(x, y, w, h) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - h + w * 0.45);
    ctx.arc(x + w * 0.5, y - h + w * 0.45, w * 0.5, Math.PI, 0, false);
    ctx.lineTo(x + w, y);
    ctx.closePath();
    ctx.fillStyle = "#00a800";
    ctx.fill();
    ctx.clip();

    ctx.fillStyle = "#58f858";
    for (let py = y - h - 10; py < y; py += 8) {
      for (let px = x - 8; px < x + w + 8; px += 8) {
        ctx.beginPath();
        ctx.moveTo(px + 4, py);
        ctx.lineTo(px + 8, py + 4);
        ctx.lineTo(px + 4, py + 8);
        ctx.lineTo(px, py + 4);
        ctx.fill();
      }
    }
    ctx.restore();

    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - h + w * 0.45);
    ctx.arc(x + w * 0.5, y - h + w * 0.45, w * 0.5, Math.PI, 0, false);
    ctx.lineTo(x + w, y);
    ctx.stroke();
  }

  function drawBush(x, y) {
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(x + 7, y - 6, 7, 0, Math.PI * 2);
    ctx.arc(x + 18, y - 7, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#48d854";
    ctx.beginPath();
    ctx.arc(x + 7, y - 6, 5.5, 0, Math.PI * 2);
    ctx.arc(x + 18, y - 7, 6.5, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawGoomba(x, y, frame) {
    ctx.fillStyle = "#000";
    ctx.fillRect(x + 2, y + 1, 12, 10);
    ctx.fillStyle = "#c84c0c";
    ctx.fillRect(x + 3, y + 2, 10, 8);
    ctx.fillStyle = "#fcceb4";
    ctx.fillRect(x + 4, y + 9, 8, 4);
    ctx.fillStyle = "#000";
    ctx.fillRect(x + 4, y + 4, 2, 4);
    ctx.fillRect(x + 10, y + 4, 2, 4);
    if (frame % 2 === 0) {
      ctx.fillRect(x + 2, y + 13, 4, 3);
      ctx.fillRect(x + 10, y + 12, 4, 3);
    } else {
      ctx.fillRect(x + 2, y + 12, 4, 3);
      ctx.fillRect(x + 10, y + 13, 4, 3);
    }
  }

  function drawKoopa(x, y, state, frame) {
    if (state !== "walk") {
      ctx.fillStyle = "#000";
      ctx.fillRect(x + 2, y + 4, 12, 11);
      ctx.fillStyle = "#00a800";
      ctx.fillRect(x + 3, y + 5, 10, 9);
      ctx.fillStyle = "#fff";
      ctx.fillRect(x + 5, y + 6, 6, 2);
      return;
    }
    ctx.fillStyle = "#f8b800";
    ctx.fillRect(x + 1, y, 5, 6);
    ctx.fillStyle = "#000";
    ctx.fillRect(x + 2, y + 1, 2, 2);
    ctx.fillStyle = "#00a800";
    ctx.fillRect(x + 4, y + 5, 10, 8);
    ctx.fillStyle = "#f8b800";
    if (frame % 2 === 0) {
      ctx.fillRect(x + 3, y + 13, 3, 3);
      ctx.fillRect(x + 10, y + 13, 3, 3);
    } else {
      ctx.fillRect(x + 5, y + 13, 3, 3);
      ctx.fillRect(x + 9, y + 13, 3, 3);
    }
  }

  function drawMarioSprite(x, y, dir, form, walkFrame, hasTail, tailSwing) {
    ctx.save();
    const h = form === 0 ? 14 : 18;
    ctx.translate(x + 6, y);
    ctx.scale(dir, 1);

    if (hasTail) {
      ctx.fillStyle = "#c84c0c";
      const ty = h - 7;
      const tx = tailSwing > 0 ? 6 : -9;
      ctx.fillRect(tx, ty, 5, 4);
      ctx.fillStyle = "#fcceb4";
      ctx.fillRect(tx - 2, ty + 1, 2, 2);
    }

    ctx.fillStyle = "#d82800";
    ctx.fillRect(-5, 0, 9, 4);
    ctx.fillRect(-4, 0, 11, 2);

    ctx.fillStyle = "#fc9838";
    ctx.fillRect(-4, 3, 8, 5);

    ctx.fillStyle = "#000";
    ctx.fillRect(1, 4, 2, 2);
    ctx.fillRect(0, 6, 5, 2);

    if (hasTail) {
      ctx.fillStyle = "#c84c0c";
      ctx.fillRect(-4, -2, 3, 3);
      ctx.fillRect(1, -2, 3, 3);
    }

    ctx.fillStyle = "#d82800";
    ctx.fillRect(-5, 8, 10, h - 11);

    ctx.fillStyle = "#000";
    ctx.fillRect(-3, 9, 6, h - 12);

    ctx.fillStyle = "#fc9838";
    ctx.fillRect(-6, 9, 2, 3);
    ctx.fillRect(4, 9, 2, 3);

    ctx.fillStyle = "#885818";
    if (walkFrame === 1) {
      ctx.fillRect(-6, h - 3, 5, 3);
      ctx.fillRect(2, h - 4, 5, 3);
    } else {
      ctx.fillRect(-5, h - 3, 4, 3);
      ctx.fillRect(1, h - 3, 4, 3);
    }

    ctx.restore();
  }

  function drawBottomHud() {
    const hy = 174;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, hy, 256, 50);

    ctx.fillStyle = "#5ce4fc";
    ctx.fillRect(12, hy + 6, 152, 32);
    ctx.fillStyle = "#000";
    ctx.fillRect(14, hy + 8, 148, 28);
    ctx.fillStyle = "#fff";
    ctx.fillRect(15, hy + 9, 146, 26);

    ctx.fillStyle = "#000";
    ctx.font = "bold 8px 'Courier New', monospace";
    ctx.fillText("WORLD 1", 19, hy + 18);

    const arrowsLit = Math.floor((mario.pMeter / 100) * 6);
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = i < arrowsLit ? "#d82800" : "#000";
      ctx.fillText("▸", 62 + i * 7, hy + 18);
    }

    ctx.fillStyle = mario.pMeter >= 95 && (tick & 4) ? "#d82800" : "#000";
    ctx.fillRect(105, hy + 11, 13, 8);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 7px monospace";
    ctx.fillText("P", 109, hy + 17);

    ctx.fillStyle = "#000";
    ctx.font = "bold 8px 'Courier New', monospace";
    ctx.fillText("$" + String(coins).padStart(2, " "), 132, hy + 18);

    ctx.fillRect(19, hy + 23, 12, 8);
    ctx.fillStyle = "#fff";
    ctx.font = "bold 7px monospace";
    ctx.fillText("M", 22, hy + 29);

    ctx.fillStyle = "#000";
    ctx.font = "bold 8px 'Courier New', monospace";
    ctx.fillText("x" + String(Math.max(0, lives)).padStart(2, " "), 33, hy + 30);
    ctx.fillText(String(score).padStart(7, "0"), 58, hy + 30);
    ctx.fillText("◷" + String(timer).padStart(3, "0"), 122, hy + 30);

    for (let c = 0; c < 3; c++) {
      const cx = 172 + c * 24;
      ctx.fillStyle = "#5ce4fc";
      ctx.fillRect(cx, hy + 6, 22, 32);
      ctx.fillStyle = "#000";
      ctx.fillRect(cx + 2, hy + 8, 18, 28);
      ctx.fillStyle = "#fff";
      ctx.fillRect(cx + 3, hy + 9, 16, 26);

      if (cards[c] > 0) {
        ctx.fillStyle = cards[c] === 1 ? "#d82800" : cards[c] === 2 ? "#00a800" : "#f8b800";
        ctx.fillRect(cx + 6, hy + 16, 10, 10);
      }
    }
  }

  function drawTitleScreen() {
    tick++;
    ctx.fillStyle = "#ffdfb0";
    ctx.fillRect(0, 0, 256, 224);

    for (let i = 0; i < 16; i++) {
      const sx = i * 16;
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.arc(sx + 8, 8, 8, 0, Math.PI);
      ctx.fill();
      ctx.fillStyle = "#d82800";
      ctx.beginPath();
      ctx.arc(sx + 8, 5, 7, 0, Math.PI);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillRect(sx + 4, 7, 8, 2);
    }

    drawHill(-10, 174, 48, 68);
    drawHill(16, 174, 34, 34);
    drawHill(210, 174, 52, 86);
    drawHill(188, 174, 34, 24);

    drawCloud(12, 58);
    drawCloud(196, 46);

    ctx.textAlign = "center";
    ctx.font = "900 22px Impact, 'Arial Black', sans-serif";
    ctx.fillStyle = "#0018a8";
    ctx.fillText("SUPER", 132, 56);
    ctx.fillText("MARIO BROS.", 132, 84);

    ctx.fillStyle = "#4cb8fc";
    ctx.fillText("SUPER", 128, 52);
    ctx.fillText("MARIO BROS.", 128, 80);

    ctx.strokeStyle = "#000";
    ctx.lineWidth = 1.5;
    ctx.strokeText("SUPER", 128, 52);
    ctx.strokeText("MARIO BROS.", 128, 80);

    ctx.font = "900 36px Impact, 'Arial Black', sans-serif";
    ctx.fillStyle = "#000";
    ctx.fillText("3", 133, 122);
    ctx.fillStyle = "#f8b800";
    ctx.fillText("3", 128, 118);
    ctx.strokeText("3", 128, 118);

    ctx.font = "bold 7px monospace";
    ctx.fillStyle = "#000";
    ctx.fillText("TM", 154, 96);
    ctx.textAlign = "left";

    const animFrame = (tick >> 3) & 1;
    drawGoomba(62 + Math.sin(tick * 0.03) * 8, 158, animFrame);
    drawKoopa(84, 158, "shell", 0);
    drawMarioSprite(118, 152, 1, 1, animFrame, false, 0);

    ctx.fillStyle = "#000";
    ctx.fillRect(172, 160, 12, 12);
    ctx.fillStyle = "#fff";
    ctx.fillRect(174, 170, 3, 3);
    ctx.fillRect(180, 170, 3, 3);

    ctx.fillStyle = "#000";
    ctx.fillRect(0, 174, 256, 50);

    for (let row = 0; row < 3; row++) {
      const y = 176 + row * 10;
      const h = 9;
      for (let col = 0; col < 16; col++) {
        if ((row + col) % 2 === 0) {
          ctx.fillStyle = "#fff";
          ctx.fillRect(col * 16, y, 16, h);
        }
      }
    }
  }

  function drawPlayScreen() {
    ctx.fillStyle = "#9cfcf0";
    ctx.fillRect(0, 0, 256, 174);

    for (let i = 0; i < 10; i++) {
      const base = i * 240;
      drawCloud(base + 110 - camX * 0.4, 28);
      drawCloud(base + 210 - camX * 0.4, 42);

      drawHill(base + 22 - camX, 160, 34, 58);
      drawHill(base + 8 - camX, 160, 30, 38);
      drawHill(base + 50 - camX, 160, 36, 46);
      drawHill(base + 78 - camX, 160, 36, 46);
      drawHill(base + 66 - camX, 160, 30, 22);
      drawHill(base + 98 - camX, 160, 30, 22);

      drawBush(base + 158 - camX, 160);
    }

    for (let gx = Math.floor(camX / 16) * 16; gx < camX + 272; gx += 16) {
      if (isGap(gx + 8)) continue;
      const sx = Math.floor(gx - camX);
      ctx.fillStyle = "#fcceb4";
      ctx.fillRect(sx, 160, 16, 14);
      ctx.fillStyle = "#000";
      ctx.fillRect(sx, 160, 16, 2);
      ctx.fillStyle = "#c84c0c";
      ctx.fillRect(sx, 162, 16, 2);
      for (let s = 0; s < 16; s += 8) {
        ctx.fillStyle = "#000";
        ctx.beginPath();
        ctx.moveTo(sx + s, 164);
        ctx.lineTo(sx + s + 6, 174);
        ctx.lineTo(sx + s + 3, 174);
        ctx.lineTo(sx + s - 2, 164);
        ctx.fill();
      }
    }

    blocks.forEach(b => {
      const sx = Math.floor(b.x - camX);
      if (sx < -40 || sx > 260) return;
      const sy = b.y - (b.hit || 0);

      if (b.t === "wood") {
        ctx.fillStyle = "#000";
        ctx.fillRect(sx, sy, b.w, b.h);
        ctx.fillStyle = "#de9c84";
        ctx.fillRect(sx + 2, sy + 2, b.w - 4, b.h - 4);
        ctx.fillStyle = "#000";
        ctx.fillRect(sx + 4, sy + 4, 2, 2);
        ctx.fillRect(sx + b.w - 6, sy + 4, 2, 2);
        ctx.fillRect(sx + 4, sy + b.h - 6, 2, 2);
        ctx.fillRect(sx + b.w - 6, sy + b.h - 6, 2, 2);
        return;
      }

      ctx.fillStyle = "#000";
      ctx.fillRect(sx, sy, 16, 16);
      ctx.fillStyle = b.t === "empty" ? "#a87050" : "#fc9838";
      ctx.fillRect(sx + 1, sy + 1, 14, 14);

      ctx.fillStyle = "#000";
      ctx.fillRect(sx + 2, sy + 2, 1, 1);
      ctx.fillRect(sx + 13, sy + 2, 1, 1);
      ctx.fillRect(sx + 2, sy + 13, 1, 1);
      ctx.fillRect(sx + 13, sy + 13, 1, 1);

      if (b.t === "q") {
        ctx.fillStyle = "#000";
        ctx.font = "bold 10px monospace";
        ctx.fillText("?", sx + 5, sy + 12);
      } else if (b.t === "b") {
        ctx.fillStyle = "#000";
        ctx.fillRect(sx + 1, sy + 7, 14, 1);
        ctx.fillRect(sx + 7, sy + 1, 1, 6);
        ctx.fillRect(sx + 4, sy + 8, 1, 7);
        ctx.fillRect(sx + 11, sy + 8, 1, 7);
      }
    });

    pipes.forEach(p => {
      const sx = Math.floor(p.x - camX);
      if (sx < -40 || sx > 260) return;

      if (p.plant) {
        const pyOff = Math.sin(tick * 0.05) * 14;
        if (pyOff < 0) {
          ctx.fillStyle = "#00a800";
          ctx.fillRect(sx + 10, p.y + pyOff + 4, 8, 14);
          ctx.fillStyle = "#d82800";
          ctx.fillRect(sx + 7, p.y + pyOff - 4, 14, 10);
          ctx.fillStyle = "#fff";
          ctx.fillRect(sx + 9, p.y + pyOff - 2, 3, 3);
          ctx.fillRect(sx + 15, p.y + pyOff, 3, 3);
        }
      }

      ctx.fillStyle = "#000";
      ctx.fillRect(sx, p.y, p.w, p.h);
      ctx.fillStyle = p.color;
      ctx.fillRect(sx + 2, p.y + 2, p.w - 4, 10);
      ctx.fillRect(sx + 4, p.y + 14, p.w - 8, p.h - 14);
      ctx.fillStyle = "#fff";
      ctx.fillRect(sx + 5, p.y + 2, 3, 10);
      ctx.fillRect(sx + 7, p.y + 14, 3, p.h - 14);
    });

    const goalX = Math.floor(LEVEL_END_X - camX);
    if (goalX > -40 && goalX < 260) {
      ctx.fillStyle = "#000";
      ctx.fillRect(goalX, 96, 26, 26);
      ctx.strokeStyle = "#fc9838";
      ctx.lineWidth = 2;
      ctx.strokeRect(goalX + 2, 98, 22, 22);
      const cCol = ((tick >> 3) % 3);
      ctx.fillStyle = cCol === 0 ? "#d82800" : cCol === 1 ? "#48d854" : "#f8b800";
      ctx.fillRect(goalX + 8, 104, 10, 10);
    }

    items.forEach(it => {
      const sx = Math.floor(it.x - camX);
      if (it.type === "mushroom") {
        ctx.fillStyle = "#d82800";
        ctx.fillRect(sx + 1, it.y, 12, 8);
        ctx.fillStyle = "#fff";
        ctx.fillRect(sx + 3, it.y + 2, 3, 3);
        ctx.fillRect(sx + 8, it.y + 2, 3, 3);
        ctx.fillStyle = "#fcceb4";
        ctx.fillRect(sx + 3, it.y + 8, 8, 6);
      } else {
        ctx.fillStyle = "#c84c0c";
        ctx.fillRect(sx + 2, it.y + 2, 10, 8);
        ctx.fillStyle = "#fc9838";
        ctx.fillRect(sx + 4, it.y + 4, 6, 4);
      }
    });

    enemies.forEach(en => {
      const sx = Math.floor(en.x - camX);
      if (sx < -24 || sx > 260) return;
      const wf = (tick >> 3) & 1;
      if (en.type === "goomba") {
        if (en.state === "dead") {
          ctx.fillStyle = "#c84c0c";
          ctx.fillRect(sx + 2, en.y + 10, 12, 6);
        } else {
          drawGoomba(sx, en.y, wf);
        }
      } else {
        drawKoopa(sx, en.y, en.state, wf);
      }
    });

    particles.forEach(pt => {
      const sx = Math.floor(pt.x - camX);
      ctx.fillStyle = "#f8b800";
      ctx.fillRect(sx, pt.y, 6, 10);
      ctx.fillStyle = "#fff";
      ctx.fillRect(sx + 2, pt.y + 2, 2, 6);
    });

    if (mario.invuln % 2 === 0) {
      const walkF = Math.abs(mario.vx) > 0.2 ? ((tick >> 2) & 1) : 0;
      drawMarioSprite(
        Math.floor(mario.x - camX),
        Math.floor(mario.y),
        mario.dir,
        mario.form,
        walkF,
        mario.form === 2,
        mario.tailTimer
      );
    }

    drawBottomHud();
  }

  function startOrJump() {
    if (state === "title") {
      state = "play";
      sfx("powerup");
      resetLevel(true);
    }
  }

  function bindTouchControls() {
    document.querySelectorAll("[data-k]").forEach(el => {
      const k = el.getAttribute("data-k");
      const down = (e) => {
        e.preventDefault();
        keys[k] = true;
        el.classList.add("pressed");
        if (k === "a" && state === "title") startOrJump();
      };
      const up = (e) => {
        e.preventDefault();
        keys[k] = false;
        el.classList.remove("pressed");
      };
      el.addEventListener("touchstart", down, { passive: false });
      el.addEventListener("touchend", up, { passive: false });
      el.addEventListener("touchcancel", up, { passive: false });
      el.addEventListener("mousedown", down);
      el.addEventListener("mouseup", up);
      el.addEventListener("mouseleave", up);
    });

    document.getElementById("btnStart").addEventListener("click", () => {
      if (state === "title") {
        startOrJump();
      } else {
        mario.form = mario.form === 2 ? 1 : 2;
        sfx("powerup");
      }
    });

    document.getElementById("btnSelect").addEventListener("click", () => {
      if (state === "title") startOrJump();
      else {
        state = "title";
        sfx("bump");
      }
    });

    document.getElementById("btnReset").addEventListener("click", () => {
      sfx("bump");
      state = "play";
      resetLevel(true);
    });

    cv.addEventListener("pointerdown", () => {
      if (state === "title") startOrJump();
    });

    window.addEventListener("keydown", (e) => {
      const c = e.code;
      if (c === "ArrowLeft" || c === "KeyA") keys.left = true;
      if (c === "ArrowRight" || c === "KeyD") keys.right = true;
      if (c === "ArrowUp" || c === "KeyW") keys.up = true;
      if (c === "ArrowDown" || c === "KeyS") keys.down = true;
      if (c === "Space" || c === "KeyK" || c === "KeyZ") {
        if (state === "title") startOrJump();
        keys.a = true;
      }
      if (c === "ShiftLeft" || c === "KeyJ" || c === "KeyX") keys.b = true;
      if (c === "Enter" && state === "title") startOrJump();
    });

    window.addEventListener("keyup", (e) => {
      const c = e.code;
      if (c === "ArrowLeft" || c === "KeyA") keys.left = false;
      if (c === "ArrowRight" || c === "KeyD") keys.right = false;
      if (c === "ArrowUp" || c === "KeyW") keys.up = false;
      if (c === "ArrowDown" || c === "KeyS") keys.down = false;
      if (c === "Space" || c === "KeyK" || c === "KeyZ") keys.a = false;
      if (c === "ShiftLeft" || c === "KeyJ" || c === "KeyX") keys.b = false;
    });
  }

  function loop() {
    if (state === "title") {
      drawTitleScreen();
    } else {
      updatePlay();
      drawPlayScreen();
    }
    requestAnimationFrame(loop);
  }

  resetLevel(true);
  bindTouchControls();
  requestAnimationFrame(loop);
})();
</script>`;
}

export default {
  name: ["mario3", "smb3", "supermario3"],
  category: "group",
  description: "Juega Super Mario Bros. 3 en consola NES interactiva a pantalla completa.",
  groupOnly: false,

  async run(ctx: CommandContext) {
    const { sock, from, msg, reply, react } = ctx;

    await react("🍄").catch(() => undefined);

    const HTML = buildMario3Html();

    const data = {
      response_id: "PopiooNixelPopiooNixelPopiooNixel",
      sections: [
        {
          __typename: "GenAIUnifiedResponseSection",
          view_model: {
            __typename: "GenAISingleLayoutViewModel",
            primitive: {
              __typename: "GenAIBotProgressStatusPrimitive",
              title: "🍄 JUGAR SUPER MARIO BROS. 3",
              is_in_progress: true,
            },
          },
        },
      ],
      embedded_screens: [
        {
          title: "🍄 Super Mario Bros. 3",
          content: [
            {
              __typename: "FOAIDNixelButtonSheets",
              tabs: [
                {
                  id: "tab_0",
                  tab_header: "Super Mario Bros. 3",
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
        `❌ ${fytBold("Error al iniciar Super Mario Bros. 3:")} ${e?.message || String(e)}`,
      ).catch(() => undefined);
    }
  },
};
