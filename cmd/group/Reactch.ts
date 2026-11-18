import { randomUUID } from "node:crypto";
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

const AUTHORIZED_OWNERS = ["573118353868"];
const activeChannelJobs = new Map<string, { aborted: boolean; processed: number; total: number }>();

const CIRCLED_MAP: Record<string, string> = {
  a: "🅐", b: "🅑", c: "🅒", d: "🅓", e: "🅔", f: "🅕", g: "🅖",
  h: "🅗", i: "🅘", j: "🅙", k: "🅚", l: "🅛", m: "🅜", n: "🅝",
  o: "🅞", p: "🅟", q: "🅠", r: "🅡", s: "🅢", t: "🅣", u: "🅤",
  v: "🅥", w: "🅦", x: "🅧", y: "🅨", z: "🅩",
  "0": "⓿", "1": "➊", "2": "➋", "3": "➌", "4": "➍",
  "5": "➎", "6": "➏", "7": "➐", "8": "➑", "9": "➒",
};

const REGIONAL_MAP: Record<string, string> = {
  a: "🇦", b: "🇧", c: "🇨", d: "🇩", e: "🇪", f: "🇫", g: "🇬",
  h: "🇭", i: "🇮", j: "🇯", k: "🇰", l: "🇱", m: "🇲", n: "🇳",
  o: "🇴", p: "🇵", q: "🇶", r: "🇷", s: "🇸", t: "🇹", u: "🇺",
  v: "🇻", w: "🇼", x: "🇽", y: "🇾", z: "🇿",
  "0": "0️⃣", "1": "1️⃣", "2": "2️⃣", "3": "3️⃣", "4": "4️⃣",
  "5": "5️⃣", "6": "6️⃣", "7": "7️⃣", "8": "8️⃣", "9": "9️⃣",
};

const EMOJI_LETTER_FALLBACK: Record<string, string> = {
  a: "🅰️", b: "🅱️", c: "🌜", d: "↩️", e: "📧", f: "🎏", g: "🌀",
  h: "♓", i: "ℹ️", j: "🎷", k: "🎋", l: "👢", m: "Ⓜ️", n: "♑",
  o: "🅾️", p: "🅿️", q: "🔍", r: "®️", s: "💲", t: "✝️", u: "⛎",
  v: "✌️", w: "〰️", x: "❌", y: "💴", z: "💤",
  "0": "0️⃣", "1": "1️⃣", "2": "2️⃣", "3": "3️⃣", "4": "4️⃣",
  "5": "5️⃣", "6": "6️⃣", "7": "7️⃣", "8": "8️⃣", "9": "9️⃣",
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isOwnerAuthorized(ctx: CommandContext): boolean {
  const { msg, sender } = ctx;
  if (msg?.key?.fromMe) return true;

  const rawSender = String(sender || msg?.key?.participant || msg?.key?.remoteJid || "");
  const cleanSender = rawSender.replace(/[^0-9]/g, "");

  if (AUTHORIZED_OWNERS.some((num) => cleanSender.includes(num))) {
    return true;
  }

  const globalOwners = (global as any).owner || (global as any).config?.owner || [];
  if (Array.isArray(globalOwners)) {
    return globalOwners.some((o: any) => {
      const clean = String(Array.isArray(o) ? o[0] : o).replace(/[^0-9]/g, "");
      return clean.length > 5 && cleanSender.includes(clean);
    });
  }

  return false;
}

function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function buildCircledString(input: string, sep = ""): string {
  return normalizeText(input)
    .split("")
    .map((c) => {
      if (c === " ") return sep || "␣";
      return CIRCLED_MAP[c] || c;
    })
    .join(sep);
}

function buildRegionalString(input: string, sep = "\u200B"): string {
  return normalizeText(input)
    .split("")
    .map((c) => {
      if (c === " ") return "▪️";
      return REGIONAL_MAP[c] || c;
    })
    .join(sep);
}

function extractIndividualEmojiLetters(input: string): Array<{ primary: string; fallback?: string }> {
  const segmenter =
    typeof Intl !== "undefined" && (Intl as any).Segmenter
      ? new (Intl as any).Segmenter("es", { granularity: "grapheme" })
      : null;

  const rawGraphemes: string[] = segmenter
    ? Array.from(segmenter.segment(input.trim()), (s: any) => s.segment)
    : Array.from(input.trim());

  const out: Array<{ primary: string; fallback?: string }> = [];

  for (const g of rawGraphemes) {
    if (g.trim() === "") continue;
    const clean = normalizeText(g);
    if (REGIONAL_MAP[clean]) {
      out.push({
        primary: REGIONAL_MAP[clean],
        fallback: EMOJI_LETTER_FALLBACK[clean],
      });
    } else if (EMOJI_LETTER_FALLBACK[clean]) {
      out.push({ primary: EMOJI_LETTER_FALLBACK[clean] });
    } else if (/\p{Extended_Pictographic}/u.test(g)) {
      out.push({ primary: g });
    }
  }

  return out;
}

function extraerDatosEnlace(rawUrl: string): { idCanal: string; idMensaje: number } | null {
  const limpio = rawUrl.trim().split("?")[0].replace(/\/+$/, "");
  const match = limpio.match(
    /^https?:\/\/(?:www\.)?whatsapp\.com\/channel\/([A-Za-z0-9_-]+)\/(\d+)$/i,
  );
  if (!match) return null;
  const idMensaje = parseInt(match[2], 10);
  if (!Number.isFinite(idMensaje) || idMensaje <= 0) return null;
  return {
    idCanal: match[1],
    idMensaje,
  };
}

function parseReactArgs(args: string[]): {
  link: string;
  text: string;
  modeCount: number;
  isAll: boolean;
} {
  let link = "";
  let modeCount = 1;
  let isAll = false;
  const textTokens: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const token = args[i];
    const low = token.toLowerCase();

    if (!link && low.startsWith("http") && low.includes("whatsapp.com/channel/")) {
      link = token;
      continue;
    }

    if (low === "-m" || low === "--m" || low === "-msgs") {
      const next = String(args[i + 1] || "").toLowerCase();
      if (next === "all" || next === "todo" || next === "todos") {
        isAll = true;
        i++;
        continue;
      }
      if (/^\d+$/.test(next)) {
        modeCount = Math.max(1, parseInt(next, 10));
        i++;
        continue;
      }
    }

    const inlineMatch = low.match(/^-m(all|\d+)$/);
    if (inlineMatch) {
      if (inlineMatch[1] === "all") {
        isAll = true;
      } else {
        modeCount = Math.max(1, parseInt(inlineMatch[1], 10));
      }
      continue;
    }

    textTokens.push(token);
  }

  return {
    link,
    text: textTokens.join(" ").trim(),
    modeCount,
    isAll,
  };
}

function getAvailableSockets(mainSock: any): any[] {
  const list: any[] = [];
  if (mainSock && typeof mainSock.query === "function") {
    list.push(mainSock);
  }

  const globals = [
    (global as any).conns,
    (global as any).subbots,
    (global as any).clients,
    (global as any).jadibot,
    mainSock?.conns,
    mainSock?.subbots,
  ];

  for (const container of globals) {
    if (Array.isArray(container)) {
      for (const s of container) {
        if (s && typeof s.query === "function" && !list.includes(s)) {
          list.push(s);
        }
      }
    } else if (container && typeof container === "object") {
      for (const s of Object.values(container)) {
        if (s && typeof (s as any).query === "function" && !list.includes(s)) {
          list.push(s);
        }
      }
    }
  }

  return list;
}

async function sendVerifiedNewsletterReaction(
  targetSock: any,
  jidCanal: string,
  serverId: number,
  code: string,
): Promise<{ ok: boolean; errorCode?: string }> {
  try {
    const tagId =
      typeof targetSock.generateMessageTag === "function"
        ? targetSock.generateMessageTag()
        : randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase();

    const ack = await targetSock.query({
      tag: "message",
      attrs: {
        to: jidCanal,
        type: "reaction",
        server_id: String(serverId),
        id: String(tagId),
      },
      content: [
        {
          tag: "reaction",
          attrs: {
            code,
          },
        },
      ],
    });

    const errCode = ack?.attrs?.error ? String(ack.attrs.error) : undefined;
    if (errCode) {
      return { ok: false, errorCode: errCode };
    }
    return { ok: true };
  } catch (e: any) {
    return { ok: false, errorCode: e?.message || "QUERY_ERR" };
  }
}

export default {
  name: ["reach", "reactch", "react", "chreact", "reaccioncanal"],
  category: "owner",
  description: "Reacciona a uno o múltiples mensajes hacia arriba en un canal de WhatsApp (Exclusivo Dueño).",
  groupOnly: false,
  ownerOnly: true,

  async run(ctx: CommandContext) {
    const { sock, from, msg, args = [], usedPrefix, reply, react } = ctx;
    const prefix = usedPrefix || ".";

    if (!isOwnerAuthorized(ctx)) {
      return reply(`❌ Acceso denegado. Este comando es exclusivo para el dueño autorizado.`);
    }

    const sub = String(args[0] || "").toLowerCase();
    if (sub === "stop" || sub === "parar" || sub === "cancel") {
      const currentJob = activeChannelJobs.get(from);
      if (!currentJob) {
        return reply(`ℹ️ No hay ningún barrido de reacciones activo en este chat.`);
      }
      currentJob.aborted = true;
      activeChannelJobs.delete(from);
      await react("🛑").catch(() => undefined);
      return reply(
        `🛑 Barrido detenido. Mensajes procesados: \`${currentJob.processed}/${currentJob.total}\`.`,
      );
    }

    const { link, text: rawInput, modeCount, isAll } = parseReactArgs(args);

    if (!link || !rawInput) {
      return reply(
        `╭〔 📢 ${fytBold("LuferOS Reach Channel (Owner)")} 〕⬣\n` +
          `• *Reacción a 1 mensaje:*\n` +
          `  \`${prefix}reach https://whatsapp.com/channel/xxx/780 texto\`\n\n` +
          `• *Reaccionar N mensajes hacia arriba:*\n` +
          `  \`${prefix}reach https://whatsapp.com/channel/xxx/780 texto -m 60\`\n\n` +
          `• *Reaccionar a todos hacia arriba:*\n` +
          `  \`${prefix}reach https://whatsapp.com/channel/xxx/780 texto -m all\`\n\n` +
          `• *Detener barrido:*\n` +
          `  \`${prefix}reach stop\`\n` +
          `╰━━━━━━━━━━━━⬣`,
      );
    }

    if (activeChannelJobs.has(from)) {
      return reply(
        `⚠️ Ya hay un barrido de reacciones en curso en este chat. Usa \`${prefix}reach stop\` para detenerlo.`,
      );
    }

    const parsedLink = extraerDatosEnlace(link);
    if (!parsedLink) {
      return reply(
        `❌ Enlace inválido. Asegúrate de usar el formato:\n\`https://whatsapp.com/channel/ID_CANAL/ID_MENSAJE\``,
      );
    }

    await react("⏳").catch(() => undefined);

    try {
      const anySock = sock as any;
      if (typeof anySock.newsletterMetadata !== "function") {
        return reply(`❌ Tu versión de Baileys no soporta métodos de canales (newsletterMetadata).`);
      }

      const datosCanal = await anySock.newsletterMetadata("invite", parsedLink.idCanal);
      const rawId =
        datosCanal?.id ||
        datosCanal?.jid ||
        datosCanal?.thread_metadata?.id ||
        parsedLink.idCanal;

      const jidCanal = String(rawId).endsWith("@newsletter")
        ? String(rawId)
        : `${String(rawId)}@newsletter`;

      const nombreCanal =
        datosCanal?.name ||
        datosCanal?.thread_metadata?.name?.text ||
        parsedLink.idCanal;

      const sockets = getAvailableSockets(anySock);
      for (const s of sockets) {
        if (typeof s.newsletterFollow === "function") {
          await s.newsletterFollow(jidCanal).catch(() => undefined);
        }
      }
      if (typeof anySock.subscribeNewsletterUpdates === "function") {
        await anySock.subscribeNewsletterUpdates(jidCanal).catch(() => undefined);
      }

      const startId = parsedLink.idMensaje;
      const endId = isAll ? 1 : Math.max(1, startId - modeCount + 1);
      const totalMessages = startId - endId + 1;

      const candidates = Array.from(
        new Set(
          [
            buildCircledString(rawInput, ""),
            buildRegionalString(rawInput, "\u200B"),
            buildRegionalString(rawInput, " "),
            buildCircledString(rawInput, "\u200D"),
            rawInput,
          ].filter(Boolean),
        ),
      );

      const individualUnits = extractIndividualEmojiLetters(rawInput);

      const jobState = {
        aborted: false,
        processed: 0,
        total: totalMessages,
      };
      activeChannelJobs.set(from, jobState);

      let statusMsg: any = null;
      if (totalMessages > 1) {
        statusMsg = await sock
          .sendMessage(
            from,
            {
              text:
                `╭〔 🚀 ${fytBold("Barrido de Canal Iniciado")} 〕⬣\n` +
                `• *Canal:* ${nombreCanal}\n` +
                `• *Rango:* \`#${startId}\` → \`#${endId}\` (\`${totalMessages}\` msgs)\n` +
                `• *Sockets activos:* \`${sockets.length}\`\n` +
                `• *Progreso:* \`0/${totalMessages}\`\n` +
                `╰━━━━━━━━━━━━⬣`,
            },
            { quoted: msg },
          )
          .catch(() => null);
      }

      let lockedCandidate: string | null = null;
      let useMultiSocketUnits = false;
      let successCount = 0;
      let consecutiveFailures = 0;
      let lastErrorCode = "400";
      let displayReactionUsed = "";

      for (let currentMsgId = startId; currentMsgId >= endId; currentMsgId--) {
        if (jobState.aborted || !activeChannelJobs.has(from)) {
          break;
        }

        let msgSuccess = false;

        if (lockedCandidate) {
          const res = await sendVerifiedNewsletterReaction(
            anySock,
            jidCanal,
            currentMsgId,
            lockedCandidate,
          );
          if (res.ok) {
            msgSuccess = true;
          } else {
            lastErrorCode = res.errorCode || lastErrorCode;
          }
        } else if (useMultiSocketUnits) {
          const applied: string[] = [];
          for (let u = 0; u < individualUnits.length; u++) {
            const unitObj = individualUnits[u];
            const bot = sockets[u % sockets.length];
            let unitRes = await sendVerifiedNewsletterReaction(
              bot,
              jidCanal,
              currentMsgId,
              unitObj.primary,
            );
            if (!unitRes.ok && unitObj.fallback) {
              unitRes = await sendVerifiedNewsletterReaction(
                bot,
                jidCanal,
                currentMsgId,
                unitObj.fallback,
              );
              if (unitRes.ok) applied.push(unitObj.fallback);
            } else if (unitRes.ok) {
              applied.push(unitObj.primary);
            }
            if (sockets.length === 1) break;
          }
          if (applied.length > 0) {
            msgSuccess = true;
            if (!displayReactionUsed) displayReactionUsed = applied.join(" ");
          }
        } else {
          for (const candidateCode of candidates) {
            const res = await sendVerifiedNewsletterReaction(
              anySock,
              jidCanal,
              currentMsgId,
              candidateCode,
            );
            if (res.ok) {
              lockedCandidate = candidateCode;
              displayReactionUsed = candidateCode;
              msgSuccess = true;
              break;
            }
            lastErrorCode = res.errorCode || "400";
          }

          if (!msgSuccess && individualUnits.length > 0) {
            const applied: string[] = [];
            for (let u = 0; u < individualUnits.length; u++) {
              const unitObj = individualUnits[u];
              const bot = sockets[u % sockets.length];
              let unitRes = await sendVerifiedNewsletterReaction(
                bot,
                jidCanal,
                currentMsgId,
                unitObj.primary,
              );
              if (!unitRes.ok && unitObj.fallback) {
                unitRes = await sendVerifiedNewsletterReaction(
                  bot,
                  jidCanal,
                  currentMsgId,
                  unitObj.fallback,
                );
                if (unitRes.ok) applied.push(unitObj.fallback);
              } else if (unitRes.ok) {
                applied.push(unitObj.primary);
              }
              if (sockets.length === 1) break;
            }
            if (applied.length > 0) {
              useMultiSocketUnits = true;
              displayReactionUsed = applied.join(" ");
              msgSuccess = true;
            }
          }
        }

        jobState.processed++;

        if (msgSuccess) {
          successCount++;
          consecutiveFailures = 0;
        } else {
          consecutiveFailures++;
          if (isAll && consecutiveFailures >= 40 && successCount > 0) {
            break;
          }
        }

        if (statusMsg?.key && jobState.processed % 15 === 0 && currentMsgId > endId) {
          await sock
            .sendMessage(from, {
              edit: statusMsg.key,
              text:
                `╭〔 ⚡ ${fytBold("Barrido de Canal en Curso")} 〕⬣\n` +
                `• *Canal:* ${nombreCanal}\n` +
                `• *Mensaje actual:* \`#${currentMsgId}\`\n` +
                `• *Exitosos:* \`${successCount}\` / \`${jobState.processed}\`\n` +
                `• *Reacción:* ${displayReactionUsed || rawInput}\n` +
                `╰━━━━━━━━━━━━⬣`,
            })
            .catch(() => undefined);
        }

        if (currentMsgId > endId && !jobState.aborted) {
          await sleep(95);
        }
      }

      activeChannelJobs.delete(from);

      if (successCount > 0) {
        await react("✅").catch(() => undefined);
        const summaryText =
          totalMessages === 1
            ? `✅ Reacción *${displayReactionUsed}* aplicada al mensaje \`#${startId}\` del canal *${nombreCanal}*.`
            : `╭〔 ✅ ${fytBold("Barrido de Canal Completado")} 〕⬣\n` +
              `• *Canal:* ${nombreCanal}\n` +
              `• *Reacción:* ${displayReactionUsed}\n` +
              `• *Rango recorrido:* \`#${startId}\` → \`#${ endId }\`\n` +
              `• *Mensajes reaccionados:* \`${successCount}/${jobState.processed}\`\n` +
              `╰━━━━━━━━━━━━⬣`;

        if (statusMsg?.key) {
          await sock
            .sendMessage(from, {
              edit: statusMsg.key,
              text: summaryText,
            })
            .catch(() => reply(summaryText));
        } else {
          await reply(summaryText);
        }
        return;
      }

      await react("❌").catch(() => undefined);
      return reply(
        `❌ El servidor de WhatsApp rechazó la reacción en *${nombreCanal}* (\`ACK Error ${lastErrorCode}\`).\n` +
          `• Prueba con emojis estándar: \`${prefix}reach ${link} 🔥 -m ${isAll ? "all" : modeCount}\``,
      );
    } catch (e: any) {
      activeChannelJobs.delete(from);
      await react("❌").catch(() => undefined);
      return reply(
        `❌ ${fytBold("ReachChannel:")} ${e?.message || "No se pudo completar la operación en el canal."}`,
      );
    }
  },
};
