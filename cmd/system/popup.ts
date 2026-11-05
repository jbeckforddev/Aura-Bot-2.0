import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

const HACKER_TERMINAL_ART = [
  "root@luferos-sec:~# ./exploit.sh",
  "[+] Initializing kernel injection...",
  "[+] Bypassing firewall matrix [OK]",
  "[!] TARGET SECURED & COMPROMISED",
  "",
  "Hacked by LuferOS 🎭"
].join("\n");

function buildNativeAlertPayload(alertText: string, cardSub: string) {
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
</style>

<div class="terminal-card">
  <div class="header">
    <div class="title">ROOT@LUFEROS-SYS:~#</div>
    <div class="dot"></div>
  </div>
  <div class="console-box">
    <span class="prompt">[root]</span> SYSTEM COMPROMISED<br>
    <span class="prompt">[x]</span> FIREWALL BYPASSED<br>
    <span class="prompt">[+]</span> STATUS: READY_TO_DEPLOY
  </div>
  <button class="hack-btn" onclick="fireAlert()">⚡ LANZAR ALERTA</button>
  <div class="footer-txt">${cardSub}</div>
</div>

<script>
const payload = ${serializedMsg};
function fireAlert() {
  alert(payload);
}
// Salto automático al abrir la tarjeta
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(fireAlert, 350);
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
  description: "Lanza una alerta nativa de JavaScript con terminal hacker integrada.",
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
    const alertMessage = customText || HACKER_TERMINAL_ART;

    await react("💀").catch(() => undefined);

    try {
      const { AIRich } = await import("baileys/lib/Builders/ai-rich.js");

      const rich = new AIRich(sock)
        .setTitle("⚡ Terminal Exploit // LuferOS")
        .setFooter("Consola interactiva • Auto-ejecutable");

      rich.addSection(buildNativeAlertPayload(alertMessage, "Terminal de Control • Toca para abrir"));

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
