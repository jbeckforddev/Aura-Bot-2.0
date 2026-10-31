import { getActiveSubBots } from "../../connection/subbotManager.ts";
import type { CommandContext } from "../../types/index";
import { parseType, runReportPlan } from "../../core/net/reportEngine.ts";
import { check, mark } from "../../core/data/reportCooldown.ts";

const COOLDOWN_MIN = 30;
const MAX_BOTS = 25;
const HARD_CAP_CYCLES = 6;

function normalize(raw?: string): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length < 8 || d.length > 15) return null;
  return d;
}

function collectSockets(main: any) {
  const raw = (getActiveSubBots?.() ?? []) as any[];
  const subs = raw.map((x) => x?.sock ?? x).filter(Boolean);
  const seen = new Set<string>();
  return [main, ...subs].filter((s) => {
    if (!s) return false;
    const id = s?.user?.id ?? s?.authState?.creds?.me?.id;
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export default {
  name: ["spam", "reportar", "atacar"],
  category: "system",
  ownerOnly: false,
  description: "Reporta y bloquea un número de forma masiva y escalonada usando los subbots activos.",
  cooldown: 8,

  async run(ctx: CommandContext) {
    const { args, reply, react, sock } = ctx;

    const target = normalize(args[0]);
    if (!target) {
      return reply(
        "⚠️ *Uso incorrecto*\n\n" +
          "Necesito un número válido (8–15 dígitos, con o sin código de país).\n\n" +
          "*Ejemplo:* `.spam 573001234567`\n\n" +
          "*Opciones:*\n" +
          "• `--tipo=spam|abuse|illegal|adult|false_positive`\n" +
          "• `--ciclos=1..6` (por defecto 2)\n" +
          "• `--bots=1..25`\n" +
          "• `--gap=1200` (ms entre operaciones, por defecto 1500)\n" +
          "• `--unblock` (desbloquear al final)\n" +
          "• `--forzar` (ignorar cooldown)\n" +
          "• `--dry` (simular)",
      );
    }

    const flags = new Set(
      args.filter((a) => a.startsWith("--") && !a.includes("=")).map((a) => a.slice(2)),
    );
    const getNum = (key: string, fallback: number) => {
      const hit = args.find((a) => a.startsWith(`--${key}=`));
      const n = hit ? Number(hit.split("=")[1]) : NaN;
      return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
    };

    const jid = `${target}@s.whatsapp.net`;
    const type = parseType(args.find((a) => a.startsWith("--tipo="))?.split("=")[1]);
    const cycles = Math.min(HARD_CAP_CYCLES, getNum("ciclos", 2));
    const botLimit = Math.min(MAX_BOTS, getNum("bots", 8));
    const minGap = Math.max(600, getNum("gap", 1500));
    const keepBlocked = !flags.has("unblock");
    const dry = flags.has("dry");

    // Cooldown: reportar el mismo número dos veces seguidas no suma casi nada.
    const cd = check(jid, COOLDOWN_MIN);
    if (cd.blocked && !flags.has("forzar")) {
      return reply(
        `⏸️ *Ya reportado hace poco*\n\n` +
          `🎯 +${target}\n` +
          `🕒 Visto ${cd.count} vez/veces · reintenta en *${cd.remainingMin} min*\n\n` +
          `Usa \`.spam ${target} --forzar\` para saltarte el cooldown.`,
      );
    }

    await react("🔎");
    const sockets = collectSockets(sock).slice(0, botLimit);
    if (!sockets.length) {
      await react("❌");
      return reply("❌ No hay ninguna sesión operativa (ni principal ni subbots).");
    }

    // Validación: 1 sola petición, en el socket principal. Ahorra cuota inútil.
    let registered = true;
    try {
      const [res] = (await sock.onWhatsApp(jid)) ?? [];
      registered = Boolean(res?.exists);
    } catch {
      registered = true; // si la validación falla, no bloquees la operación
    }
    if (!registered) {
      await react("❌");
      return reply(`❌ El número *+${target}* no está registrado en WhatsApp.`);
    }

    const concurrency = Math.max(2, Math.ceil(sockets.length / 3));
    const plan = { jid, type, cycles, keepBlocked };

    if (dry) {
      await react("🧪");
      return reply(
        `🧪 *Simulación*\n\n` +
          `🎯 +${target}\n` +
          `🏷️ Tipo: *${type}*\n` +
          `🤖 Bots: *${sockets.length}* (concurrencia ${concurrency})\n` +
          `🔁 Ciclos/bot: *${cycles}*\n` +
          `⏱️ Gap global: ${minGap} ms\n` +
          `🔒 Bloqueo: *${keepBlocked ? "se mantiene" : "se revierte al final"}*\n` +
          `📊 IQ totales aprox: *${sockets.length * cycles}*`,
      );
    }

    await react("⏳");
    await reply(
      `🚀 *Reporte masivo en curso*\n\n` +
        `🎯 *Objetivo:* +${target}\n` +
        `🏷️ *Motivo:* ${type}\n` +
        `🤖 *Instancias:* ${sockets.length} (${concurrency} simultáneas)\n` +
        `🔁 *Ciclos:* ${cycles} por bot\n` +
        `⏱️ *Ritmo:* 1 op cada ~${minGap} ms\n` +
        `🔒 *Bloqueo final:* ${keepBlocked ? "mantenido" : "revertido"}\n\n` +
        `_Tiempo estimado: ${Math.ceil((sockets.length * cycles * minGap * 3) / concurrency / 1000)} s_`,
    );

    const started = Date.now();
    const stats = await runReportPlan({
      sockets,
      plan,
      concurrency,
      minGap,
      abortAfterRateLimits: Math.max(8, Math.ceil(sockets.length * 1.5)),
      onBotDone: (i, ok) => {
        if (!ok) console.warn(`[spam] instancia #${i} sin éxito`);
      },
    });

    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    const ratio = stats.bots ? Math.round((stats.cyclesOk / (stats.bots * cycles)) * 100) : 0;
    const tries = mark(jid);

    await react(stats.cyclesOk > 0 ? "✅" : "⚠️");

    const lines = [
      stats.aborted ? "⚠️ *Operación cortada por rate-limit*" : "✅ *Operación finalizada*",
      "",
      `🎯 +${target} · motivo *${type}*`,
      `📤 Reportes enviados: *${stats.reports}*`,
      `🤖 Instancias útiles: *${stats.bots - stats.skipped}* / ${stats.bots}`,
      `🔁 Ciclos correctos: *${stats.cyclesOk}* · fallidos: *${stats.cyclesFail}*`,
      `📈 Efectividad: *${ratio}%* · ⏱️ ${elapsed}s`,
      `🕒 Veces reportado: *${tries}*`,
    ];

    if (stats.rateLimited > 0) lines.push(`🐢 Avisos de rate-limit: ${stats.rateLimited}`);
    if (stats.skipped > 0) lines.push(`💤 Sesiones caídas omitidas: ${stats.skipped}`);
    if (stats.aborted) lines.push("", "_Se frenó para no quemar las IP. Reintenta en unos minutos._");
    if (ratio >= 80) lines.push("", "_Señal sólida: el reporte debería pesar._");
    else if (ratio < 40) lines.push("", "_Señal débil. Repite con `--gap=2500 --ciclos=1` en 20–30 min._");

    await reply(lines.join("\n"));
  },
};