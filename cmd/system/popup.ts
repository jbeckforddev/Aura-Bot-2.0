import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

const REALISTIC_HACK_SEQUENCE = [
  `[!] ADVERTENCIA: Intrusión detectada en el Kernel.\n[+] UID: 0 (ROOT) | SHELL: /bin/ash\n[+] Iniciando volcado de memoria RAM... [OK]`,
  `[+] Conectando al nodo remoto de LuferOS...\n[+] Extrayendo tokens de sesión de WhatsApp...\n[!] ¡ALERTA! Base de datos msgstore.db copiada.`,
  `[+] Bypass de seguridad biométrica completado.\n[+] Acceso concedido a cámara frontal y micrófono.\n[!] El dispositivo ha sido completamente comprometido.`,
  `████████████████████████████████\n   ¡DISPOSITIVO TOTALMENTE HACKEADO!\n████████████████████████████████\n\nControl total adquirido por LuferOS 🎭\nTus datos ya están en nuestra red.`
];

function buildRealAlertPayload(alertSteps: string[], cardSub: string) {
  const serializedSteps = JSON.stringify(alertSteps);

  const htmlContent = `<style>
*{box-sizing:border-box;margin:0;padding:0;user-select:none;-webkit-user-select:none;font-family:'Courier New',Courier,monospace}
body{background:#030712;color:#00ffcc;padding:10px;display:flex;justify-content:center;align-items:center;min-height:100vh}
.terminal-card{width:100%;max-width:380px;background:#050b14;border:2px solid #ff3b30;border-radius:14px;padding:16px;box-shadow:0 0 35px rgba(255,59,48,0.35);position:relative;overflow:hidden}
.terminal-card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,transparent,#ff3b30,transparent);animation:scan 2s linear infinite}
@keyframes scan{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}
.header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #1e293b;padding-bottom:10px;margin-bottom:12px}
.title{font-size:12px;font-weight:900;letter-spacing:1.5px;color:#ff3b30}
.dot{width:9px;height:9px;background:#ff3b30;border-radius:50%;box-shadow:0 0 10px #ff3b30;animation:blink 1s infinite}
@keyframes blink{0%,100%{opacity:1}50%{opacity:0.3}}
.console-box{background:#02040a;border:1px solid #1e293b;border-radius:8px;padding:10px;font-size:11px;color:#38bdf8;margin-bottom:14px;line-height:1.4}
.prompt{color:#f87171}
.hack-btn{width:100%;background:linear-gradient(135deg,#ff3b30,#b91c1c);color:#fff;font-weight:900;border:none;padding:13px;border-radius:9px;cursor:pointer;font-size:12.5px;letter-spacing:1.5px;text-transform:uppercase;box-shadow:0 5px 20px rgba(255,59,48,0.4);transition:transform 0.1s ease}
.hack-btn:active{transform:scale(0.96)}
.footer-txt{font-size:9.5px;color:#64748b;text-align:center;margin-top:10px}
</style>

<div class="terminal-card">
  <div class="header">
    <div class="title">CRITICAL_EXPLOIT_V4.2</div>
    <div class="dot"></div>
  </div>
  <div class="console-box">
    <span class="prompt">[root@system]#</span> ./exec_payload.sh --force<br>
    <span class="prompt">[sys]</span> Memory address: 0x7ffe8f<br>
    <span class="prompt">[+]</span> STATUS: READY_FOR_EXECUTION
  </div>
  <button class="hack-btn" onclick="runSequence()">⚡ INICIAR SECUENCIA</button>
  <div class="footer-txt">${cardSub}</div>
</div>

<script>
const steps = ${serializedSteps};
function runSequence() {
  let i = 0;
  function nextAlert() {
    if (i < steps.length) {
      alert(steps[i]);
      i++;
      setTimeout(nextAlert, 100); // Salto en cadena automático al cerrar cada alerta
    }
  }
  nextAlert();
}
// Salto automático inmediato al abrir la tarjeta
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(runSequence, 400);
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
  description: "Lanza una secuencia de alertas nativas encadenadas y realistas con diseño de terminal.",
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
    const sequence = customText ? [customText] : REALISTIC_HACK_SEQUENCE;

    await react("💀").catch(() => undefined);

    try {
      const { AIRich } = await import("baileys/lib/Builders/ai-rich.js");

      const rich = new AIRich(sock)
        .setTitle("⚡ Root Exploit // LuferOS")
        .setFooter("Secuencia de Kernel • Auto-ejecutable");

      rich.addSection(buildRealAlertPayload(sequence, "Consola de Invasión • Toca para abrir"));

      await rich.send(from, { quoted: msg });
      await react("✅").catch(() => undefined);
    } catch (error) {
      await react("❌").catch(() => undefined);
      reply(
        `${fytBold("Error")} al desplegar la secuencia: ${error instanceof Error ? error.message : String(error)}`,
      ).catch(() => undefined);
    }
  },
};
