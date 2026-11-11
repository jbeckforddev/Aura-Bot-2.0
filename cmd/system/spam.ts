import { getActiveSubBots } from "../../connection/subbotManager.ts";
import type { CommandContext } from "../../types/index";
import { parseType, runReportPlan } from "../../core/net/reportEngine.ts";
import { check, mark } from "../../core/data/reportCooldown.ts";
import { fytBold } from "../../core/socketText.ts";

const COOLDOWN_MIN = 30;
const MAX_BOTS = 25;
const HARD_CAP_CYCLES = 6;

function normalize(raw?: string): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length < 8 || d.length > 15) return null;
  return d;
}

function collectSockets(main: any) {
  const raw = (getActiveSubBots?.() ?? []) as any[];
  const subs = raw.map((x) => x?.sock ?? x).filter(Boolean);
  const seen = new Set<string>();
  return [main, ...subs].filter((s) => {
    if (!s) return false;
    const id = s?.user?.id ?? s?.authState?.creds?.me?.id;
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function buildSpamRichPayload(data: {
  stateMode: "DRY" | "RUNNING" | "DONE" | "ABORTED";
  targetNumber: string;
  reason: string;
  botsAvailable: number;
  botsUsed: number;
  botsSkipped: number;
  cyclesTarget: number;
  cyclesOk: number;
  cyclesFail: number;
  reportsSent: number;
  concurrency: number;
  rateLimits: number;
  gapMs: number;
  elapsedSec: string;
  keepBlocked: boolean;
  historyCount: number;
  ratio: number;
  rawText: string;
}) {
  const serialized = JSON.stringify(data);

  const html = `<style>
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#05020c;color:#f5f3ff;padding:10px}
.card{max-width:420px;margin:0 auto;background:linear-gradient(180deg,#130826 0%,#070312 100%);border:1.5px solid #3b1d6e;border-radius:20px;overflow:hidden;box-shadow:0 20px 55px rgba(0,0,0,.85),0 0 30px rgba(139,92,246,.2);position:relative}
.card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#7c3aed,#ec4899,#00ffcc,#7c3aed);background-size:200% 100%;animation:flow 3s linear infinite;z-index:10}
@keyframes flow{0%{background-position:0% 0%}100%{background-position:200% 0%}}
.head{padding:14px 16px;background:radial-gradient(circle at 85% 15%,rgba(236,72,153,.25),transparent 60%);border-bottom:1px solid #261447;display:flex;justify-content:space-between;align-items:center}
.brand{display:flex;align-items:center;gap:10px}
.orb{width:36px;height:36px;border-radius:11px;background:linear-gradient(135deg,#db2777,#9333ea);display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 0 15px rgba(219,39,119,.5)}
.brand-txt h1{font-size:13.5px;font-weight:900;letter-spacing:.8px;color:#fff;text-transform:uppercase}
.brand-txt p{font-size:10.5px;color:#f472b6;font-weight:800;font-family:'Courier New',monospace}
.pill{font-size:9.5px;font-weight:900;padding:4px 9px;border-radius:999px;font-family:'Courier New',monospace;text-transform:uppercase}
.pill.run{background:rgba(0,255,204,.14);color:#00ffcc;border:1px solid rgba(0,255,204,.4);animation:pulse 1.5s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}
.pill.dry{background:rgba(139,92,246,.22);color:#e9d5ff;border:1px solid rgba(168,85,247,.5)}
.pill.done{background:rgba(74,222,128,.18);color:#4ade80;border:1px solid rgba(74,222,128,.45)}
.pill.abort{background:rgba(255,42,84,.18);color:#ff6b8b;border:1px solid rgba(255,42,84,.45)}
.body{padding:14px 16px}
.target-box{background:#0d051c;border:1px solid #28154a;border-left:3px solid #db2777;border-radius:12px;padding:10px 12px;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center}
.tgt-info{display:flex;flex-direction:column;gap:3px}
.tgt-k{font-size:9px;font-weight:800;color:#a78bfa;text-transform:uppercase;letter-spacing:1px}
.tgt-v{font-size:16px;font-weight:900;color:#fff;font-family:'Courier New',monospace;letter-spacing:1px}
.reason-pill{background:#1f113a;color:#d8b4fe;border:1px solid #4c1d95;font-size:10px;font-weight:800;padding:3px 8px;border-radius:6px;text-transform:uppercase}
.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:12px}
.stat{background:#0f061e;border:1px solid #251345;border-radius:10px;padding:7px 5px;text-align:center}
.stat-v{font-size:12.5px;font-weight:900;color:#f3e8ff;font-family:'Courier New',monospace}
.stat-v.ok{color:#4ade80}
.stat-v.err{color:#f87171}
.stat-k{font-size:8.5px;font-weight:800;color:#8b74b0;text-transform:uppercase;margin-top:2px}
.detail-box{background:#040208;border:1px solid #301957;border-radius:12px;padding:10px;margin-bottom:12px;font-size:10.5px;color:#d8b4fe;font-family:'Courier New',monospace;line-height:1.4}
.detail-row{display:flex;justify-content:space-between;border-bottom:1px solid #1a0d33;padding-bottom:4px;margin-bottom:4px}
.detail-row:last-child{border-bottom:none;padding-bottom:0;margin-bottom:0}
.detail-hl{color:#00ffcc;font-weight:800}
.actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.btn{border:none;border-radius:11px;padding:10px;font-size:11.5px;font-weight:900;cursor:pointer;text-transform:uppercase;letter-spacing:.7px;transition:transform .1s}
.btn:active{transform:scale(0.96)}
.btn-primary{background:linear-gradient(135deg,#8b5cf6,#6d28d9);color:#fff;box-shadow:0 4px 15px rgba(139,92,246,.35)}
.btn-sec{background:#170d2b;border:1px solid #3b2166;color:#d8b4fe}
.toast{position:fixed;bottom:14px;left:50%;transform:translateX(-50%) translateY(20px);background:#8b5cf6;color:#fff;font-size:11.5px;font-weight:800;padding:7px 15px;border-radius:999px;opacity:0;pointer-events:none;transition:all .2s;z-index:99;box-shadow:0 6px 20px rgba(0,0,0,.6)}
.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
</style>

<div class="card">
  <div class="head">
    <div class="brand">
      <div class="orb" id="orbIcon">🚨</div>
      <div class="brand-txt">
        <h1 id="statusTitle"></h1>
        <p id="timeSub"></p>
      </div>
    </div>
    <span class="pill" id="statePill"></span>
  </div>

  <div class="body">
    <div class="target-box">
      <div class="tgt-info">
        <div class="tgt-k">Objetivo</div>
        <div class="tgt-v" id="tgtNum"></div>
      </div>
      <div class="reason-pill" id="reasonPill"></div>
    </div>

    <div class="grid">
      <div class="stat">
        <div class="stat-v" id="stSent"></div>
        <div class="stat-k">Enviados</div>
      </div>
      <div class="stat">
        <div class="stat-v ok" id="stOk"></div>
        <div class="stat-k">Ciclos OK</div>
      </div>
      <div class="stat">
        <div class="stat-v err" id="stFail"></div>
        <div class="stat-k">Fallos</div>
      </div>
      <div class="stat">
        <div class="stat-v" id="stBots"></div>
        <div class="stat-k">Bots Usados</div>
      </div>
    </div>

    <div class="detail-box">
      <div class="detail-row"><span>Efectividad de Nodos</span><span class="detail-hl" id="dRatio"></span></div>
      <div class="detail-row"><span>Concurrencia Activa</span><span class="detail-hl" id="dConc"></span></div>
      <div class="detail-row"><span>Intervalo Global (Gap)</span><span class="detail-hl" id="dGap"></span></div>
      <div class="detail-row"><span>Bloqueo Mantenido</span><span class="detail-hl" id="dBlock"></span></div>
      <div class="detail-row"><span>Límites de Red (RL)</span><span class="detail-hl" id="dRL" style="color:#f87171"></span></div>
      <div class="detail-row"><span>Historial de Atq.</span><span class="detail-hl" id="dHist"></span></div>
    </div>

    <div class="actions">
      <button class="btn btn-primary" onclick="copyText(D.rawText, 'Reporte copiado')">📋 Copiar Reporte</button>
      <button class="btn btn-sec" onclick="showAlert()">🔍 Ver Detalles</button>
    </div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
const D = ${serialized};
function $(id){ return document.getElementById(id); }

function init(){
  const pill = $("statePill");
  if (D.stateMode === "DRY") {
    $("statusTitle").textContent = "Simulación Spam";
    $("orbIcon").textContent = "🧪";
    pill.textContent = "SIMULACIÓN";
    pill.className = "pill dry";
  } else if (D.stateMode === "RUNNING") {
    $("statusTitle").textContent = "Ataque en Curso";
    $("orbIcon").textContent = "🚀";
    pill.textContent = "EJECUTANDO";
    pill.className = "pill run";
  } else if (D.stateMode === "DONE") {
    $("statusTitle").textContent = "Ataque Finalizado";
    $("orbIcon").textContent = "✅";
    pill.textContent = "COMPLETADO";
    pill.className = "pill done";
  } else {
    $("statusTitle").textContent = "Ataque Abortado";
    $("orbIcon").textContent = "⚠️";
    pill.textContent = "RATE LIMIT";
    pill.className = "pill abort";
  }

  $("timeSub").textContent = "⏱️ " + D.elapsedSec + "s";
  $("tgtNum").textContent = "+" + D.targetNumber;
  $("reasonPill").textContent = D.reason;

  $("stSent").textContent = D.reportsSent;
  $("stOk").textContent = D.cyclesOk;
  $("stFail").textContent = D.cyclesFail;
  $("stBots").textContent = D.botsUsed + "/" + D.botsAvailable;

  $("dRatio").textContent = D.ratio + "%";
  $("dConc").textContent = D.concurrency + " hilos";
  $("dGap").textContent = D.gapMs + " ms";
  $("dBlock").textContent = D.keepBlocked ? "SÍ" : "NO";
  $("dRL").textContent = D.rateLimits + " hits";
  $("dHist").textContent = D.historyCount + " veces";
}

function copyText(txt, msg){
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt).catch(function(){});
  } else {
    const t = document.createElement("textarea");
    t.value = txt;
    document.body.appendChild(t);
    t.select();
    try { document.execCommand("copy"); } catch(e){}
    document.body.removeChild(t);
  }
  const el = $("toast");
  el.textContent = msg || "Copiado";
  el.classList.add("show");
  setTimeout(function(){ el.classList.remove("show"); }, 1600);
}

function showAlert(){
  alert(D.rawText);
}

init();
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
  name: ["spam" , "atacar"],
  category: "system",
  ownerOnly: false,
  description: "Reporta y bloquea un número de forma masiva y escalonada usando los subbots activos.",
  cooldown: 8,
  modOnly: true,

  async run(ctx: CommandContext) {
    const { args, reply, react, sock, from, msg } = ctx;

    const target = normalize(args[0]);
    if (!target) {
      return reply(
        `⚠️ *${fytBold("Uso incorrecto")}*\n\n` +
          `Necesito un número válido (8–15 dígitos, con o sin código de país).\n\n` +
          `*Ejemplo:* \`.spam 573001234567\`\n\n` +
          `*Opciones:*\n` +
          `• \`--tipo=spam|abuse|illegal|adult|false_positive\`\n` +
          `• \`--ciclos=1..6\` (por defecto 2)\n` +
          `• \`--bots=1..25\`\n` +
          `• \`--gap=1200\` (ms entre operaciones, por defecto 1500)\n` +
          `• \`--unblock\` (desbloquear al final)\n` +
          `• \`--forzar\` (ignorar cooldown)\n` +
          `• \`--dry\` (simular)`,
      );
    }

    const flags = new Set(
      args.filter((a) => a.startsWith("--") && !a.includes("=")).map((a) => a.slice(2)),
    );
    const getNum = (key: string, fallback: number) => {
      const hit = args.find((a) => a.startsWith(`--${key}=`));
      const n = hit ? Number(hit.split("=")[1]) : NaN;
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
    };

    const jid = `${target}@s.whatsapp.net`;
    const type = parseType(args.find((a) => a.startsWith("--tipo="))?.split("=")[1]);
    const cycles = Math.min(HARD_CAP_CYCLES, getNum("ciclos", 2));
    const botLimit = Math.min(MAX_BOTS, getNum("bots", 8));
    const minGap = Math.max(600, getNum("gap", 1500));
    const keepBlocked = !flags.has("unblock");
    const dry = flags.has("dry");

    const cd = check(jid, COOLDOWN_MIN);
    if (cd.blocked && !flags.has("forzar")) {
      return reply(
        `⏸️ *Ya reportado hace poco*\n\n` +
          `🎯 +${target}\n` +
          `🕒 Visto ${cd.count} vez/veces · reintenta en *${cd.remainingMin} min*\n\n` +
          `Usa \`.spam ${target} --forzar\` para saltarte el cooldown.`,
      );
    }

    await react("🔎").catch(() => undefined);
    const sockets = collectSockets(sock).slice(0, botLimit);
    if (!sockets.length) {
      await react("❌").catch(() => undefined);
      return reply("❌ No hay ninguna sesión operativa (ni principal ni subbots).");
    }

    let registered = true;
    try {
      const [res] = (await sock.onWhatsApp(jid)) ?? [];
      registered = Boolean(res?.exists);
    } catch {
      registered = true;
    }

    if (!registered) {
      await react("❌").catch(() => undefined);
      return reply(`❌ El número *+${target}* no está registrado en WhatsApp.`);
    }

    const concurrency = Math.max(2, Math.ceil(sockets.length / 3));
    const plan = { jid, type, cycles, keepBlocked };
    const estimatedSec = Math.ceil((sockets.length * cycles * minGap * 3) / concurrency / 1000);
    const tries = mark(jid);

    if (dry) {
      await react("🧪").catch(() => undefined);
      const text = 
        `🧪 *Simulación*\n\n` +
        `🎯 +${target}\n` +
        `🏷️ Tipo: *${type}*\n` +
        `🤖 Bots: *${sockets.length}* (concurrencia ${concurrency})\n` +
        `🔁 Ciclos/bot: *${cycles}*\n` +
        `⏱️ Gap global: ${minGap} ms\n` +
        `🔒 Bloqueo: *${keepBlocked ? "se mantiene" : "se revierte al final"}*\n` +
        `📊 IQ totales aprox: *${sockets.length * cycles}*`;
        
      try {
        const { AIRich } = await import("baileys/lib/Builders/ai-rich.js");
        const rich = new AIRich(sock).setTitle("🧪 AURA SPAM // SIMULATION").setFooter(`Estimado: ${estimatedSec}s`);
        rich.addSection(buildSpamRichPayload({
          stateMode: "DRY",
          targetNumber: target,
          reason: type,
          botsAvailable: sockets.length,
          botsUsed: sockets.length,
          botsSkipped: 0,
          cyclesTarget: cycles,
          cyclesOk: sockets.length * cycles,
          cyclesFail: 0,
          reportsSent: sockets.length * cycles,
          concurrency,
          rateLimits: 0,
          gapMs: minGap,
          elapsedSec: "0.0",
          keepBlocked,
          historyCount: tries,
          ratio: 100,
          rawText: text
        }));
        await rich.send(from, { quoted: msg });
      } catch {
        await reply(text).catch(() => undefined);
      }
      return;
    }

    await react("⏳").catch(() => undefined);
    
    const startText = 
      `🚀 *Reporte masivo en curso*\n\n` +
      `🎯 *Objetivo:* +${target}\n` +
      `🏷️ *Motivo:* ${type}\n` +
      `🤖 *Instancias:* ${sockets.length} (${concurrency} simultáneas)\n` +
      `🔁 *Ciclos:* ${cycles} por bot\n` +
      `⏱️ *Ritmo:* 1 op cada ~${minGap} ms\n` +
      `🔒 *Bloqueo final:* ${keepBlocked ? "mantenido" : "revertido"}\n\n` +
      `_Tiempo estimado: ${estimatedSec} s_`;

    let runningMsgSent: any;
    try {
      const { AIRich } = await import("baileys/lib/Builders/ai-rich.js");
      const rich = new AIRich(sock).setTitle("🚀 AURA SPAM // RUNNING").setFooter(`Calculando impacto...`);
      rich.addSection(buildSpamRichPayload({
        stateMode: "RUNNING",
        targetNumber: target,
        reason: type,
        botsAvailable: sockets.length,
        botsUsed: 0,
        botsSkipped: 0,
        cyclesTarget: cycles,
        cyclesOk: 0,
        cyclesFail: 0,
        reportsSent: 0,
        concurrency,
        rateLimits: 0,
        gapMs: minGap,
        elapsedSec: "0.0",
        keepBlocked,
        historyCount: tries,
        ratio: 0,
        rawText: startText
      }));
      runningMsgSent = await rich.send(from, { quoted: msg });
    } catch {
      runningMsgSent = await sock.sendMessage(from, { text: startText }, { quoted: msg as any }).catch(() => undefined);
    }

    const started = Date.now();
    const stats = await runReportPlan({
      sockets,
      plan,
      concurrency,
      minGap,
      abortAfterRateLimits: Math.max(8, Math.ceil(sockets.length * 1.5)),
      onBotDone: (i, ok) => {
        if (!ok) console.warn(`[spam] instancia #${i} sin éxito`);
      },
    });

    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    const ratio = stats.bots ? Math.round((stats.cyclesOk / (stats.bots * cycles)) * 100) : 0;

    await react(stats.cyclesOk > 0 ? "✅" : "⚠️").catch(() => undefined);

    const lines = [
      stats.aborted ? "⚠️ *Operación cortada por rate-limit*" : "✅ *Operación finalizada*",
      "",
      `🎯 +${target} · motivo *${type}*`,
      `📤 Reportes enviados: *${stats.reports}*`,
      `🤖 Instancias útiles: *${stats.bots - stats.skipped}* / ${stats.bots}`,
      `🔁 Ciclos correctos: *${stats.cyclesOk}* · fallidos: *${stats.cyclesFail}*`,
      `📈 Efectividad: *${ratio}%* · ⏱️ ${elapsed}s`,
      `🕒 Veces reportado: *${tries}*`,
    ];

    if (stats.rateLimited > 0) lines.push(`🐢 Avisos de rate-limit: ${stats.rateLimited}`);
    if (stats.skipped > 0) lines.push(`💤 Sesiones caídas omitidas: ${stats.skipped}`);
    if (stats.aborted) lines.push("", "_Se frenó para no quemar las IP. Reintenta en unos minutos._");
    if (ratio >= 80) lines.push("", "_Señal sólida: el reporte debería pesar._");
    else if (ratio < 40) lines.push("", "_Señal débil. Repite con `--gap=2500 --ciclos=1` en 20–30 min._");

    const endText = lines.join("\n");

    try {
      const { AIRich } = await import("baileys/lib/Builders/ai-rich.js");
      const rich = new AIRich(sock).setTitle(stats.aborted ? "⚠️ AURA SPAM // RATE LIMIT" : "✅ AURA SPAM // DONE").setFooter(`Impacto del ${ratio}% en ${elapsed}s`);
      rich.addSection(buildSpamRichPayload({
        stateMode: stats.aborted ? "ABORTED" : "DONE",
        targetNumber: target,
        reason: type,
        botsAvailable: sockets.length,
        botsUsed: stats.bots - stats.skipped,
        botsSkipped: stats.skipped,
        cyclesTarget: cycles,
        cyclesOk: stats.cyclesOk,
        cyclesFail: stats.cyclesFail,
        reportsSent: stats.reports,
        concurrency,
        rateLimits: stats.rateLimited,
        gapMs: minGap,
        elapsedSec: elapsed,
        keepBlocked,
        historyCount: tries,
        ratio,
        rawText: endText
      }));

      if (runningMsgSent?.key) {
        await sock.relayMessage(from, rich.build().message, { messageId: runningMsgSent.key.id }).catch(() => undefined);
      } else {
        await rich.send(from, { quoted: msg });
      }
    } catch {
      if (runningMsgSent?.key) {
        await sock.sendMessage(from, { text: endText, edit: runningMsgSent.key }).catch(() => undefined);
      } else {
        await reply(endText).catch(() => undefined);
      }
    }
  },
};
