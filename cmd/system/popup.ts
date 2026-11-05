import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import * as fs from "node:fs";
import * as path from "node:path";

function getBase64Image(): string {
  try {
    const imgPath = path.join(process.cwd(), "cmd", "system", "2025-09-30_70f885ec41c878.webp");
    if (fs.existsSync(imgPath)) {
      const bitmap = fs.readFileSync(imgPath);
      return `data:image/webp;base64,${bitmap.toString("base64")}`;
    }
  } catch {}
  return "";
}

function buildHackerModalPayload(imageBase64: string, customText: string) {
  const alertText = customText || "¡DISPOSITIVO HACKEADO!\nTus datos han sido comprometidos por LuferOS 🎭";
  const serializedMsg = JSON.stringify(alertText);

  const htmlContent = `<style>
*{box-sizing:border-box;margin:0;padding:0;user-select:none;-webkit-user-select:none;font-family:'Courier New',Courier,monospace}
body{background:#030712;color:#00ffcc;padding:10px;display:flex;justify-content:center;align-items:center;min-height:100vh}
.terminal-card{width:100%;max-width:380px;background:#050b14;border:2px solid #00ffcc;border-radius:14px;padding:16px;box-shadow:0 0 30px rgba(0,255,204,0.3);position:relative;overflow:hidden}
.terminal-card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,transparent,#00ffcc,transparent);animation:scan 2s linear infinite}
@keyframes scan{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}
.header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #1e293b;padding-bottom:10px;margin-bottom:12px}
.title{font-size:12px;font-weight:900;letter-spacing:1.5px;color:#00ffcc}
.dot{width:9px;height:9px;background:#ff0055;border-radius:50%;box-shadow:0 0 10px #ff0055}
.console-box{background:#02040a;border:1px solid #1e293b;border-radius:8px;padding:10px;font-size:11px;color:#38bdf8;margin-bottom:14px;line-height:1.4}
.prompt{color:#a855f7}
.hack-btn{width:100%;background:linear-gradient(135deg,#00ffcc,#0077ff);color:#030712;font-weight:900;border:none;padding:13px;border-radius:9px;cursor:pointer;font-size:12.5px;letter-spacing:1.5px;text-transform:uppercase;box-shadow:0 5px 20px rgba(0,255,204,0.4);transition:transform 0.1s ease}
.hack-btn:active{transform:scale(0.96)}
.footer-txt{font-size:9.5px;color:#64748b;text-align:center;margin-top:10px}

/* VENTANA MODAL HACKER CON IMAGEN GRANDE */
.overlay{position:fixed;inset:0;background:rgba(0,0,0,0.88);display:none;justify-content:center;align-items:center;padding:14px;z-index:999}
.modal{width:100%;max-width:330px;background:#0d111a;border:2px solid #ff3b30;border-radius:14px;overflow:hidden;box-shadow:0 25px 60px rgba(255,59,48,0.5);animation:popIn 0.25s cubic-bezier(0.16,1,0.3,1);text-align:center}
@keyframes popIn{0%{transform:scale(0.75);opacity:0}100%{transform:scale(1);opacity:1}}
.modal-top{background:#ff3b30;color:#fff;font-size:12.5px;font-weight:900;padding:10px;letter-spacing:1.5px}
.modal-body{padding:14px}
.modal-body img{width:100%;max-height:240px;object-fit:cover;border-radius:8px;background:#000;margin-bottom:12px;border:1px solid #374151;display:block}
.warn-txt{color:#f87171;font-size:12px;font-weight:700;line-height:1.4;white-space:pre-line}
.modal-foot{padding:10px 14px;border-top:1px solid #1f2937;display:flex;justify-content:center}
.accept-btn{background:#ff3b30;color:#fff;border:none;border-radius:6px;padding:8px 26px;font-size:12px;font-weight:900;cursor:pointer;text-transform:uppercase;letter-spacing:1px}
.accept-btn:active{opacity:0.7}
</style>

<div class="terminal-card">
  <div class="header">
    <div class="title">ROOT@LUFEROS-SYS:~#</div>
    <div class="dot"></div>
  </div>
  <div class="console-box">
    <span class="prompt">[root]</span> SYSTEM COMPROMISED<br>
    <span class="prompt">[x]</span> FIREWALL BYPASSED<br>
    <span class="prompt">[+]</span> STATUS: EXPLOIT_READY
  </div>
  <button class="hack-btn" onclick="triggerPrank()">⚡ INICIAR EXPLOIT</button>
  <div class="footer-txt">Terminal de Control V3.0 • Toca para abrir</div>
</div>

<div class="overlay" id="prankModal">
  <div class="modal">
    <div class="modal-top">⚠️ ADVERTENCIA DE SISTEMA ⚠️</div>
    <div class="modal-body">
      ${imageBase64 ? `<img src="${imageBase64}" alt="Hacked">` : ""}
      <div class="warn-txt">${alertText}</div>
    </div>
    <div class="modal-foot">
      <button class="accept-btn" onclick="closePrank()">Aceptar</button>
    </div>
  </div>
</div>

<script>
const prankMsg = ${serializedMsg};
function triggerPrank() {
  document.getElementById('prankModal').style.display = 'flex';
  if(navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 300]);
}
function closePrank() {
  document.getElementById('prankModal').style.display = 'none';
}
// SALTO AUTOMÁTICO INMEDIATO (PRANK / SUSTO)
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(triggerPrank, 350);
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
}

export default {
  name: ["popup", "jsalert", "ventana", "alertjs"],
  category: "system",
  description: "Lanza una terminal hacker interactiva con salto automático de ventana modal e imagen integrada.",
  groupOnly: false,
  ownerOnly: true,
  async run(ctx: CommandContext) {
    const { reply, react, sock, from, msg, args, sender, db, isOwner } = ctx;

    const rawSender = String(sender || msg.key?.participant || "");
    const cleanNum = rawSender.split("@")[0].split(":")[0].replace(/\D/g, "");
    const dbAny = db as any;
    const authorized =
      Boolean(isOwner) ||
      Boolean(msg.key?.fromMe) ||
      cleanNum === "573118353868" ||
      Boolean(dbAny?.hasRole?.(rawSender, "owner")) ||
      Boolean(cleanNum && dbAny?.hasRole?.(`${cleanNum}@s.whatsapp.net`, "owner"));

    if (!authorized) {
      await react("⛔").catch(() => undefined);
      return reply("⛔ *Acceso denegado:* Este comando es exclusivo para los propietarios del bot.");
    }

    const customText = args.join(" ").trim().replace(/\\n/g, "\n");

    await react("💀").catch(() => undefined);

    try {
      const base64Image = getBase64Image();
      const { AIRich } = await import("baileys/lib/Builders/ai-rich.js");

      const rich = new AIRich(sock)
        .setTitle("⚡ Terminal Exploit // LuferOS")
        .setFooter("Consola interactiva • Auto-ejecutable");

      rich.addSection(buildHackerModalPayload(base64Image, customText));

      await rich.send(from, { quoted: msg });
      await react("✅").catch(() => undefined);
    } catch (error) {
      await react("❌").catch(() => undefined);
      reply(
        `${fytBold("Error")} al desplegar la terminal: ${error instanceof Error ? error.message : String(error)}`,
      ).catch(() => undefined);
    }
  },
};
