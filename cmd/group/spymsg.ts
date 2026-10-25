import { getActiveSubBots } from "../../core/subbotManager.ts";
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";

// Almacén global temporal para los últimos 50 mensajes por JID de bot
export const botMessageStore = new Map<string, Array<{
  remoteJid: string;
  pushName: string;
  text: string;
  time: string;
  fromMe: boolean;
}>>();

export function logBotMessage(botJid: string, data: { remoteJid: string; pushName: string; text: string; fromMe: boolean }) {
  if (!botMessageStore.has(botJid)) {
    botMessageStore.set(botJid, []);
  }
  const logs = botMessageStore.get(botJid)!;
  const time = new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  
  logs.push({ ...data, time });
  if (logs.length > 50) {
    logs.shift(); // Mantener solo los últimos 50
  }
}

export default {
  name: ["spymsg", "vermsgs", "chatlog"],
  category: "group",
  ownerOnly: true,
  description: "Genera un reporte HTML con los últimos 50 mensajes de un subbot o el bot principal.",
  async run(ctx: CommandContext) {
    const { args, reply, react, sock, botJid } = ctx;

    const allSockets = [sock, ...getActiveSubBots()].filter(Boolean);
    if (allSockets.length === 0) {
      return reply("❌ No hay instancias de bots activas.");
    }

    const indexArg = parseInt(args[0], 10);
    let targetSock = sock;
    let targetId = botJid || "MainBot";

    if (!isNaN(indexArg) && indexArg > 0 && indexArg <= allSockets.length) {
      targetSock = allSockets[indexArg - 1];
      targetId = targetSock.user?.id || `SubBot-${indexArg}`;
    }

    const messages = botMessageStore.get(targetId) || [];

    if (messages.length === 0) {
      return reply(`⚠️ No hay registros de mensajes en memoria todavía para la instancia seleccionada (${targetId}).`);
    }

    await react("⏳");

    const htmlContent = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Reporte de Mensajes - ${targetId}</title>
  <style>
    body { background-color: #0b0e14; color: #e1e4e8; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 20px; }
    h1 { color: #58a6ff; font-size: 20px; border-bottom: 1px solid #30363d; padding-bottom: 10px; }
    .meta { color: #8b949e; font-size: 13px; margin-bottom: 20px; }
    .chat-container { display: flex; flex-direction: column; gap: 10px; max-width: 800px; margin: 0 auto; }
    .msg { background: #161b22; border: 1px solid #30363d; border-radius: 8px; padding: 12px; position: relative; }
    .msg.outgoing { background: #1f382b; border-color: #2ea043; }
    .header { display: flex; justify-content: space-between; font-size: 12px; color: #8b949e; margin-bottom: 6px; }
    .sender { font-weight: bold; color: #79c0ff; }
    .text { font-size: 14px; word-break: break-word; white-space: pre-wrap; }
    .time { font-size: 11px; color: #8b949e; }
  </style>
</head>
<body>
  <h1>🔍 Reporte de Actividad (Últimos ${messages.length} Mensajes)</h1>
  <div class="meta">Instancia: <b>${targetId}</b> | Generado: ${new Date().toLocaleString()}</div>
  <div class="chat-container">
    ${messages.map(m => `
      <div class="msg ${m.fromMe ? 'outgoing' : ''}">
        <div class="header">
          <span class="sender">${m.pushName || 'Desconocido'} (${m.remoteJid})</span>
          <span class="time">${m.time}</span>
        </div>
        <div class="text">${escapeHtml(m.text)}</div>
      </div>
    `).join('')}
  </div>
</body>
</html>`;

    const fileName = `spy_${randomBytes(4).toString("hex")}.html`;
    const filePath = join(tmpdir(), fileName);
    writeFileSync(filePath, htmlContent, "utf8");

    await sock.sendMessage(ctx.from, {
      document: { url: filePath },
      mimetype: "text/html",
      fileName: `Reporte_${targetId.split("@")[0]}.html`,
      caption: fytBold("📊 Reporte HTML de mensajes generado con éxito."),
    }, { quoted: ctx.msg as any });

    await react("✅");
  },
};

function escapeHtml(str: string) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
