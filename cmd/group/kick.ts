import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";

async function fetchAvatarDataUri(sock: any, jid: string): Promise<string> {
  try {
    const url = await Promise.race([
      sock.profilePictureUrl(jid, "image"),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error("timeout")), 2500)),
    ]);
    if (!url || typeof url !== "string") return "";
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) return "";
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length > 110_000) return "";
      const mime = res.headers.get("content-type") || "image/jpeg";
      return `data:${mime};base64,${buf.toString("base64")}`;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return "";
  }
}

function cleanId(jid: string): string {
  return String(jid || "")
    .split("@")[0]
    .split(":")[0]
    .replace(/\D/g, "");
}

function buildKickRichPayload(data: {
  caseId: string;
  groupName: string;
  targetDisplay: string;
  targetsDetail: Array<{ tag: string; jid: string; name: string }>;
  targetAvatar: string;
  adminTag: string;
  adminName: string;
  adminJid: string;
  reason: string;
  remainingMembers: number;
  kickedCount: number;
  dateStr: string;
  timeStr: string;
  rawSummary: string;
}) {
  const serialized = JSON.stringify(data);

  const html = `<style>
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#05020c;color:#f5f3ff;padding:10px;min-height:100vh}
.card{max-width:420px;margin:0 auto;background:linear-gradient(180deg,#140726 0%,#070210 100%);border:1.5px solid #4c1d95;border-radius:20px;overflow:hidden;box-shadow:0 20px 55px rgba(0,0,0,.9),0 0 30px rgba(255,0,85,.2);position:relative}
.card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#ff0055,#9333ea,#00ffcc,#ff0055);background-size:200% 100%;animation:flow 3s linear infinite;z-index:10}
@keyframes flow{0%{background-position:0% 0%}100%{background-position:200% 0%}}
.head{padding:14px 16px;background:radial-gradient(circle at 85% 15%,rgba(255,0,85,.25),transparent 65%);border-bottom:1px solid #2d144f;display:flex;justify-content:space-between;align-items:center}
.brand{display:flex;align-items:center;gap:10px}
.orb{width:36px;height:36px;border-radius:11px;background:linear-gradient(135deg,#ff0055,#7c3aed);display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 0 16px rgba(255,0,85,.55)}
.brand-txt h1{font-size:13.5px;font-weight:900;letter-spacing:.9px;color:#fff;text-transform:uppercase}
.brand-txt p{font-size:10px;color:#ff6b8b;font-weight:800;font-family:'Courier New',monospace}
.case-pill{font-size:9.5px;font-weight:900;padding:4px 9px;border-radius:999px;background:rgba(255,0,85,.18);color:#fda4af;border:1px solid rgba(255,0,85,.45);font-family:'Courier New',monospace}
.body{padding:14px 16px}
.hero-target{background:linear-gradient(135deg,rgba(46,16,101,.55),rgba(15,5,29,.9));border:1px solid #4c1d95;border-left:3.5px solid #ff0055;border-radius:14px;padding:12px;display:flex;align-items:center;gap:12px;margin-bottom:12px}
.ava-wrap{width:54px;height:54px;border-radius:50%;padding:2px;background:linear-gradient(135deg,#ff0055,#9333ea);flex:none;position:relative}
.ava-img,.ava-fb{width:100%;height:100%;border-radius:50%;object-fit:cover;background:#140826;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:900;color:#fda4af}
.ban-tag{position:absolute;bottom:-3px;right:-3px;background:#ff0055;color:#fff;font-size:8.5px;font-weight:900;padding:2px 5px;border-radius:999px;border:1.5px solid #070210}
.tgt-meta{min-width:0;flex:1}
.tgt-lbl{font-size:9px;font-weight:900;color:#f472b6;text-transform:uppercase;letter-spacing:1px}
.tgt-name{font-size:14.5px;font-weight:900;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px}
.tgt-sub{font-size:11px;color:#c4b5fd;font-family:'Courier New',monospace;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.reason-box{background:#0c041a;border:1px solid #2b154d;border-radius:12px;padding:10px 12px;margin-bottom:12px}
.sec-lbl{font-size:9.5px;font-weight:900;text-transform:uppercase;letter-spacing:1px;color:#a78bfa;margin-bottom:4px;display:flex;justify-content:space-between}
.reason-txt{font-size:12px;font-weight:700;color:#f3e8ff;line-height:1.4;word-break:break-word}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px}
.info-card{background:#0f061e;border:1px solid #251345;border-radius:11px;padding:8px 10px}
.info-card.wide{grid-column:span 2}
.k{font-size:9px;font-weight:800;color:#8b74b0;text-transform:uppercase;letter-spacing:.6px}
.v{font-size:12px;font-weight:900;color:#e9d5ff;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.v.hl{color:#00ffcc;font-family:'Courier New',monospace}
.v.admin{color:#f0abfc}
.list-wrap{background:#080312;border:1px solid #231142;border-radius:11px;padding:8px 10px;margin-bottom:12px;max-height:110px;overflow-y:auto}
.list-row{display:flex;justify-content:space-between;align-items:center;font-size:11px;padding:4px 0;border-bottom:1px solid #190b30;font-family:'Courier New',monospace}
.list-row:last-child{border-bottom:none}
.actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.btn{border:none;border-radius:11px;padding:10px;font-size:11.5px;font-weight:900;cursor:pointer;text-transform:uppercase;letter-spacing:.7px;transition:transform .1s}
.btn:active{transform:scale(0.96)}
.btn-primary{background:linear-gradient(135deg,#ff0055,#9333ea);color:#fff;box-shadow:0 4px 15px rgba(255,0,85,.35)}
.btn-sec{background:#170d2b;border:1px solid #3b2166;color:#d8b4fe}
.overlay-alert{position:fixed;inset:0;background:rgba(4,2,10,.86);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:16px;z-index:90;opacity:1;transition:opacity .2s}
.overlay-alert.hide{opacity:0;pointer-events:none}
.alert-modal{width:100%;max-width:340px;background:linear-gradient(180deg,#1c0836,#0a0316);border:2px solid #ff0055;border-radius:18px;padding:18px;text-align:center;box-shadow:0 20px 55px rgba(0,0,0,.95),0 0 35px rgba(255,0,85,.45);animation:popIn .22s cubic-bezier(.16,1,.3,1)}
@keyframes popIn{0%{transform:scale(.85);opacity:0}100%{transform:scale(1);opacity:1}}
.alert-ico{width:48px;height:48px;border-radius:50%;background:rgba(255,0,85,.18);border:1.5px solid #ff0055;display:flex;align-items:center;justify-content:center;font-size:22px;margin:0 auto 10px;box-shadow:0 0 18px rgba(255,0,85,.5)}
.alert-title{font-size:14px;font-weight:900;color:#fff;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}
.alert-desc{font-size:12.5px;color:#e9d5ff;line-height:1.45;margin-bottom:14px;word-break:break-word}
.alert-desc b{color:#00ffcc}
.alert-btn{width:100%;background:linear-gradient(135deg,#ff0055,#7c3aed);color:#fff;border:none;padding:10px;border-radius:10px;font-size:11.5px;font-weight:900;text-transform:uppercase;letter-spacing:.8px;cursor:pointer}
.toast{position:fixed;bottom:14px;left:50%;transform:translateX(-50%) translateY(20px);background:#8b5cf6;color:#fff;font-size:11.5px;font-weight:800;padding:7px 15px;border-radius:999px;opacity:0;pointer-events:none;transition:all .2s;z-index:99}
.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
</style>

<div class="overlay-alert" id="customOverlay">
  <div class="alert-modal">
    <div class="alert-ico">🚫</div>
    <div class="alert-title">Expulsión Ejecutada</div>
    <div class="alert-desc" id="overlayMsg"></div>
    <button class="alert-btn" onclick="closeOverlay()">Entendido</button>
  </div>
</div>

<div class="card">
  <div class="head">
    <div class="brand">
      <div class="orb">⚡</div>
      <div class="brand-txt">
        <h1>Aura Kick System</h1>
        <p>PERMANENT AUDIT LOG</p>
      </div>
    </div>
    <span class="case-pill" id="casePill"></span>
  </div>

  <div class="body">
    <div class="hero-target">
      <div class="ava-wrap">
        <img id="avaImg" class="ava-img" style="display:none" alt="Avatar">
        <div id="avaFb" class="ava-fb">🚫</div>
        <span class="ban-tag">KICK</span>
      </div>
      <div class="tgt-meta">
        <div class="tgt-lbl">Usuario(s) Expulsado(s)</div>
        <div class="tgt-name" id="tgtMainName"></div>
        <div class="tgt-sub" id="tgtSubJid"></div>
      </div>
    </div>

    <div class="reason-box">
      <div class="sec-lbl"><span>📋 MOTIVO DE LA EXPULSIÓN</span><span id="timeSpan"></span></div>
      <div class="reason-txt" id="reasonTxt"></div>
    </div>

    <div class="grid">
      <div class="info-card">
        <div class="k">🛡️ Ejecutado Por</div>
        <div class="v admin" id="adminVal"></div>
      </div>
      <div class="info-card">
        <div class="k">🏰 Grupo</div>
        <div class="v" id="groupVal"></div>
      </div>
      <div class="info-card">
        <div class="k">👥 Miembros Restantes</div>
        <div class="v hl" id="remVal"></div>
      </div>
      <div class="info-card">
        <div class="k">📅 Fecha / Estado</div>
        <div class="v hl" id="dateVal"></div>
      </div>
    </div>

    <div class="sec-lbl" style="margin-bottom:6px"><span>🗂️ REGISTRO DE JID AFECTADOS</span><span id="countSpan"></span></div>
    <div class="list-wrap" id="targetsList"></div>

    <div class="actions">
      <button class="btn btn-primary" onclick="triggerNativeAlert()">🔔 Ver Alerta</button>
      <button class="btn btn-sec" onclick="copyAudit()">📋 Copiar Acta</button>
    </div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
const D = ${serialized};
function $(id){ return document.getElementById(id); }

function escapeHtml(s){
  return String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function closeOverlay(){
  $("customOverlay").classList.add("hide");
}

function triggerNativeAlert(){
  $("customOverlay").classList.remove("hide");
  alert("El usuario " + D.targetDisplay + " fue expulsado con exito por " + D.adminTag);
}

function copyAudit(){
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(D.rawSummary).catch(function(){});
  } else {
    const t = document.createElement("textarea");
    t.value = D.rawSummary;
    document.body.appendChild(t);
    t.select();
    try { document.execCommand("copy"); } catch(e){}
    document.body.removeChild(t);
  }
  const el = $("toast");
  el.textContent = "Acta de expulsión copiada";
  el.classList.add("show");
  setTimeout(function(){ el.classList.remove("show"); }, 1600);
}

function init(){
  if (D.targetAvatar) {
    $("avaImg").src = D.targetAvatar;
    $("avaImg").style.display = "block";
    $("avaFb").style.display = "none";
  }
  $("casePill").textContent = "#" + D.caseId;
  $("tgtMainName").textContent = D.targetDisplay;
  $("tgtSubJid").textContent = D.targetsDetail.map(function(x){ return x.jid; }).join(", ");
  $("timeSpan").textContent = D.timeStr;
  $("reasonTxt").textContent = D.reason;
  $("adminVal").textContent = D.adminTag + " (" + D.adminName + ")";
  $("groupVal").textContent = D.groupName;
  $("remVal").textContent = D.remainingMembers + " miembros (-" + D.kickedCount + ")";
  $("dateVal").textContent = D.dateStr + " • PERMANENTE";
  $("countSpan").textContent = D.kickedCount + " expulsado(s)";

  $("overlayMsg").innerHTML = "El usuario <b>" + escapeHtml(D.targetDisplay) + "</b> fue expulsado con exito por <b>" + escapeHtml(D.adminTag) + "</b>";

  $("targetsList").innerHTML = D.targetsDetail.map(function(item){
    return '<div class="list-row"><span style="color:#f472b6;font-weight:800">' + escapeHtml(item.tag) + '</span><span style="color:#9378bc">' + escapeHtml(item.jid) + '</span></div>';
  }).join("");

  setTimeout(function(){
    alert("El usuario " + D.targetDisplay + " fue expulsado con exito por " + D.adminTag);
  }, 350);
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
  name: ["kick", "sacar", "quitar", "expulsar", "limpiar"],
  category: "group",
  description: t("cmd_expulsa_integrantes_del_grupo_e8f33eb5"),
  groupOnly: true,
  adminOnly: true,
  botAdmin: true,
  async run(ctx: CommandContext) {
    const { sock, from, msg, sender, args = [], usedPrefix, reply, react, db } = ctx;
    const context = msg?.message?.extendedTextMessage?.contextInfo;
    const rawTargets = context?.mentionedJid?.length
      ? context.mentionedJid
      : context?.participant
        ? [context.participant]
        : [];

    const targets = [...new Set(rawTargets.filter(Boolean))];

    if (!targets.length) {
      return reply({
        text: t("cmd_value0_value1_menciona_a_algui_7c0aca6b", {
          value0: fytBold(t("cmd_aura_reed_95dcfb15")),
          value1: fytBold(t("cmd_accion_invalida_a2487ad8")),
          value2: usedPrefix || ".",
          value3: fytBold(t("cmd_system_alert_780bb6b6")),
        }),
      });
    }

    const metadata = await sock.groupMetadata(from);
    const adminIds = new Set(
      (metadata?.participants ?? [])
        .filter((participant) => participant.admin === "admin" || participant.admin === "superadmin")
        .flatMap((participant) => [
          participant.id?.replace(/:\d+@/, "@"),
          (participant as any).lid?.replace(/:\d+@/, "@"),
        ])
        .filter(Boolean),
    );

    const includesAdmin = targets.some((target) =>
      adminIds.has(target.replace(/:\d+@/, "@")),
    );
    if (includesAdmin) {
      return reply({
        text: t("cmd_kick_admin_prohibited"),
      });
    }

    await react("🚫").catch(() => undefined);
    await sock.groupParticipantsUpdate(from, targets, "remove");

    const dbAny = db as any;
    const adminJid = String(sender || msg?.key?.participant || "");
    const adminNum = cleanId(adminJid) || String(adminJid).split("@")[0];
    const adminRec =
      dbAny?.getUser?.(adminJid) ||
      (adminNum ? dbAny?.getUser?.(`${adminNum}@s.whatsapp.net`) : null);
    const adminName = String(
      msg?.pushName || adminRec?.pushName || adminRec?.username || adminNum || "Admin",
    ).trim();
    const adminTag = `@${adminNum}`;

    const cleanReasonTokens = args.filter((arg) => !/^@\d+$/.test(String(arg).trim()));
    const reason =
      cleanReasonTokens.join(" ").trim() || "Incumplimiento de las normas del grupo.";

    const targetsDetail = targets.map((tJid) => {
      const num = cleanId(tJid) || String(tJid).split("@")[0];
      const rec =
        dbAny?.getUser?.(tJid) ||
        (num ? dbAny?.getUser?.(`${num}@s.whatsapp.net`) : null);
      const uName = String(rec?.pushName || rec?.username || num).trim();
      return {
        jid: tJid,
        tag: `@${num}`,
        name: uName,
      };
    });

    const targetDisplay = targetsDetail.map((x) => x.tag).join(", ");
    const groupName = metadata?.subject || "Grupo";
    const totalBefore = metadata?.participants?.length || targets.length;
    const remainingMembers = Math.max(0, totalBefore - targets.length);
    const now = new Date();
    const dateStr = now.toLocaleDateString("es-CR");
    const timeStr = now.toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit" });
    const caseId = `KICK-${Date.now().toString(36).toUpperCase().slice(-6)}`;

    const targetAvatar = await fetchAvatarDataUri(sock, targets[0]);

    const rawSummary = [
      `╭〔 🚫 ${fytBold("EXPULSIÓN EJECUTADA")} 〕⬣`,
      `┃ 🆔 Caso: #${caseId}`,
      `┃ 👤 Expulsado: ${targetDisplay}`,
      `┃ 🛡️ Por: ${adminTag} (${adminName})`,
      `┃ 📋 Razón: ${reason}`,
      `┃ 🏰 Grupo: ${groupName}`,
      `┃ 👥 Restantes: ${remainingMembers} miembros`,
      `┃ 🕒 Fecha: ${dateStr} ${timeStr}`,
      `╰━━〔 ⚡ ${fytBold("AURA REED")} 〕━━⬣`,
    ].join("\n");

    try {
      const { AIRich } = await import("baileys/lib/Builders/ai-rich.js");
      const rich = new AIRich(sock)
        .setTitle(`🚫 EXPULSIÓN // #${caseId}`)
        .setFooter(`${targetDisplay} expulsado por ${adminTag}`);

      rich.addSection(
        buildKickRichPayload({
          caseId,
          groupName,
          targetDisplay,
          targetsDetail,
          targetAvatar,
          adminTag,
          adminName,
          adminJid,
          reason,
          remainingMembers,
          kickedCount: targets.length,
          dateStr,
          timeStr,
          rawSummary,
        }),
      );

      await rich.send(from, { quoted: msg });
    } catch {}

    await react("✅").catch(() => undefined);
    return reply({
      text: rawSummary,
      mentions: [...targets, ...(adminJid ? [adminJid] : [])],
    });
  },
};
