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
  return "https://i.ibb.co/6R39z5g/default.png";
}

function buildImageModalPayload(imageBase64: string) {
  const htmlContent = `<style>
*{box-sizing:border-box;margin:0;padding:0;user-select:none;-webkit-user-select:none;font-family:system-ui,-apple-system,sans-serif}
body{background:#0b0f17;color:#f1f5f9;display:flex;justify-content:center;align-items:center;min-height:100vh;padding:10px}
.overlay{position:fixed;inset:0;background:rgba(0,0,0,0.85);display:flex;justify-content:center;align-items:center;padding:12px;z-index:99}
.modal{width:100%;max-width:320px;background:#1e222d;border:1px solid #374151;border-radius:14px;overflow:hidden;box-shadow:0 25px 50px rgba(0,0,0,0.9);animation:popIn 0.2s cubic-bezier(0.16,1,0.3,1)}
@keyframes popIn{0%{transform:scale(0.8);opacity:0}100%{transform:scale(1);opacity:1}}
.modal-header{padding:14px 16px 6px;font-size:16px;font-weight:700;color:#fff}
.modal-body{padding:0 16px 12px;text-align:center}
.modal-body img{width:100%;max-height:260px;object-fit:contain;border-radius:8px;background:#000;display:block;margin:0 auto}
.modal-footer{padding:10px 16px;border-top:1px solid #2d3748;display:flex;justify-content:flex-end}
.ok-btn{background:none;border:none;color:#ff3b30;font-size:14px;font-weight:700;cursor:pointer;text-transform:uppercase;padding:6px 12px}
.ok-btn:active{opacity:0.5}
</style>
<div class="overlay" id="modalOverlay">
  <div class="modal">
    <div class="modal-header">JavaScript</div>
    <div class="modal-body">
      <img src="${imageBase64}" alt="Alert Image">
    </div>
    <div class="modal-footer">
      <button class="ok-btn" onclick="closeModal()">Aceptar</button>
    </div>
  </div>
</div>
<script>
function closeModal() {
  document.getElementById('modalOverlay').style.display = 'none';
}
window.addEventListener('DOMContentLoaded', () => {
  if(navigator.vibrate) navigator.vibrate([120, 60, 120]);
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
  description: "Lanza una ventana modal simulada con la imagen .webp integrada en Base64.",
  groupOnly: false,
  ownerOnly: true,
  async run(ctx: CommandContext) {
    const { reply, react, sock, from, msg, sender, db, isOwner } = ctx;

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

    await react("💀").catch(() => undefined);

    try {
      const base64Image = getBase64Image();
      const { AIRich } = await import("baileys/lib/Builders/ai-rich.js");

      const rich = new AIRich(sock)
        .setTitle("⚡ System Alert // LuferOS")
        .setFooter("Alerta del sistema • Toca para abrir");

      rich.addSection(buildImageModalPayload(base64Image));

      await rich.send(from, { quoted: msg });
      await react("✅").catch(() => undefined);
    } catch (error) {
      await react("❌").catch(() => undefined);
      reply(
        `${fytBold("Error")} al desplegar la ventana: ${error instanceof Error ? error.message : String(error)}`,
      ).catch(() => undefined);
    }
  },
};
