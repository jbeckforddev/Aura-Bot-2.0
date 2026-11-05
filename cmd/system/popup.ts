import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

function buildImageModalPayload(cardTitle: string, cardSub: string, imageUrl: string) {
  const htmlContent = `<style>
*{box-sizing:border-box;margin:0;padding:0;user-select:none;-webkit-user-select:none;font-family:system-ui,-apple-system,sans-serif}
body{background:#030712;color:#f1f5f9;padding:10px;display:flex;justify-content:center;align-items:center}
.overlay{position:fixed;inset:0;background:rgba(0,0,0,0.82);display:flex;justify-content:center;align-items:center;padding:12px;z-index:99}
.modal{width:100%;max-width:320px;background:#1e222d;border:1px solid #374151;border-radius:14px;overflow:hidden;box-shadow:0 20px 40px rgba(0,0,0,0.8);animation:popIn 0.2s ease-out}
@keyframes popIn{0%{transform:scale(0.85);opacity:0}100%{transform:scale(1);opacity:1}}
.modal-header{padding:14px 16px 8px;font-size:16px;font-weight:700;color:#fff}
.modal-body{padding:0 16px 12px;text-align:center}
.modal-body img{width:100%;max-height:220px;object-fit:contain;border-radius:8px;background:#000;margin-bottom:10px}
.modal-footer{padding:10px 16px;border-top:1px solid #2d3748;display:flex;justify-content:flex-end}
.ok-btn{background:none;border:none;color:#ff3b30;font-size:14px;font-weight:700;cursor:pointer;text-transform:uppercase;padding:4px 8px}
.ok-btn:active{opacity:0.6}
</style>
<div class="overlay" id="modalOverlay">
  <div class="modal">
    <div class="modal-header">JavaScript</div>
    <div class="modal-body">
      <img src="${imageUrl}" alt="Prank Image" onerror="this.style.display='none'">
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
// Reproduce sonido opcional de alerta o vibración si el navegador lo permite
window.addEventListener('DOMContentLoaded', () => {
  if(navigator.vibrate) navigator.vibrate([100, 50, 100]);
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
  description: "Lanza una ventana modal simulada con la imagen .webp integrada.",
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

    let customImgUrl = "2025-09-30_70f885ec41c878.webp";
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "-img" && args[i + 1]) {
        customImgUrl = args[i + 1];
        i++;
      }
    }

    await react("💀").catch(() => undefined);

    try {
      const { AIRich } = await import("baileys/lib/Builders/ai-rich.js");

      const rich = new AIRich(sock)
        .setTitle("⚡ System Alert // LuferOS")
        .setFooter("Alerta del sistema • Toca para abrir");

      rich.addSection(
        buildImageModalPayload(
          "JavaScript",
          "Aviso importante del sistema",
          customImgUrl
        ),
      );

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
