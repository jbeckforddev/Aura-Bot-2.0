import type { CommandContext } from "../../types/index.d.ts";
import { db, lookupGroupLanguage } from "../../database/AuraDB.ts";
import { claimOnce, getAllSockets } from "../../core/broadcastUtils.ts";
import { fytBold } from "../../core/socketText.ts";
import { t, withLocale, type TranslationKey } from "../../src/langs/index.ts";
import type { ExtendedWASocket } from "../../types/index.d.ts";

const SEND_DELAY_MS = 2_000;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const numOf = (jid = "") => jid.split("@")[0].split(":")[0];

export default {
  name: ["bc", "difundir", "broadcast"],
  description: "Envía un mensaje a todos los grupos donde haya bots",
  category: "owner",
  ownerOnly: true,
  groupOnly: false,

  async run(ctx: CommandContext) {
    const { sock, from, msg, reply, text } = ctx;
    if (!text?.trim()) return reply({ text: "⚠️ Escribe el mensaje.\nEj: `.bc Hola a todos`" });
    const messageId = msg.key?.id;
    if (!messageId || !claimOnce(`bc:${from}:${messageId}`)) return;

    const progressLocale = lookupGroupLanguage(from);
    const renderStatus = (
      key: TranslationKey,
      values: Record<string, unknown> = {},
    ) =>
      withLocale(progressLocale, () => [
        `╭〔 📣 ${fytBold(t("cmd_anuncio_de_comunidad_cdde0c0c").toUpperCase())}〕━⬣`,
        `┃ ${fytBold(t(key, values))}`,
        "╰━━━━━━━━━━━━⬣",
      ].join("\n"));

    const sent = await reply({ text: renderStatus("bc_collecting") });
    if (!sent?.key) return;
    const edit = (t) => sock.sendMessage(from, { text: t, edit: sent.key });

    const bots = getAllSockets();

    // 1) Todos los bots listan sus grupos a la vez
    const listas = await Promise.allSettled(
      bots.map(async (bot) => ({
        bot,
        grupos: Object.values(await bot.groupFetchAllParticipating()),
      }))
    );

    const grupos = new Map<string, Map<string, ExtendedWASocket>>();
    for (const r of listas) {
      if (r.status !== "fulfilled") continue;
      const { bot, grupos: gs } = r.value;
      for (const g of gs) {
        if (!grupos.has(g.id)) grupos.set(g.id, new Map());
        grupos.get(g.id)!.set(numOf(bot.user?.id ?? ""), bot);
      }
    }

    // 2) Cada grupo usa su bot primario o el menos cargado disponible.
    const colas = new Map<ExtendedWASocket, string[]>();
    let skip = 0;
    const orden = [...grupos].sort((a, b) => a[1].size - b[1].size);

    for (const [gid, botsEnGrupo] of orden) {
      if (gid === from) { skip++; continue; }

      const primary = db.getPrimary(gid);
      let emisor: ExtendedWASocket | null = null;

      if (primary) {
        emisor = botsEnGrupo.get(numOf(primary)) ?? null;
      } else {
        let min = Infinity;
        for (const b of botsEnGrupo.values()) {
          const carga = colas.get(b)?.length ?? 0;
          if (carga < min) { min = carga; emisor = b; }
        }
      }

      if (!emisor) { skip++; continue; }
      if (!colas.has(emisor)) colas.set(emisor, []);
      colas.get(emisor).push(gid);
    }

    const total = [...colas.values()].reduce((a, q) => a + q.length, 0);
    let ok = 0;
    let fail = 0;
    let hechos = 0;
    await edit(renderStatus("bc_sending", { done: 0, total, bots: colas.size }));

    // 3) Mantiene una pausa global para no enviar a varios grupos a la vez.
    for (const [bot, cola] of colas) {
      for (const gid of cola) {
        try {
          const broadcastText = withLocale(lookupGroupLanguage(gid), () => [
            `╭〔 📣 ${fytBold(t("cmd_anuncio_de_comunidad_cdde0c0c").toUpperCase())}〕━⬣\n`,
            `\`${text}\`\n`,
            "╰━━━━━━━━━━━━⬣",
          ].join("\n"));
          await bot.sendMessage(gid, { text: broadcastText });
          ok++;
        } catch {
          fail++;
        }
        hechos++;
        if (hechos % 25 === 0) {
          await reply(renderStatus("bc_progress", { done: hechos, total })).catch(() => {});
        }
        if (hechos < total) await sleep(SEND_DELAY_MS);
      }
    }

    await reply(renderStatus("bc_finished", { sent: ok, failed: fail, skipped: skip }));
  },
};