import { randomUUID } from "node:crypto";
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

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

function extractIndividualEmojiLetters(input: string): string[] {
  const segmenter =
    typeof Intl !== "undefined" && (Intl as any).Segmenter
      ? new (Intl as any).Segmenter("es", { granularity: "grapheme" })
      : null;

  const rawGraphemes: string[] = segmenter
    ? Array.from(segmenter.segment(input.trim()), (s: any) => s.segment)
    : Array.from(input.trim());

  const out: string[] = [];

  for (const g of rawGraphemes) {
    if (g.trim() === "") continue;
    const clean = normalizeText(g);
    if (REGIONAL_MAP[clean]) {
      out.push(REGIONAL_MAP[clean]);
    } else if (EMOJI_LETTER_FALLBACK[clean]) {
      out.push(EMOJI_LETTER_FALLBACK[clean]);
    } else if (/\p{Extended_Pictographic}/u.test(g)) {
      out.push(g);
    }
  }

  return out;
}

function extraerDatosEnlace(rawUrl: string): { idCanal: string; idMensaje: string } | null {
  const limpio = rawUrl.trim().split("?")[0].replace(/\/+$/, "");
  const match = limpio.match(
    /^https?:\/\/(?:www\.)?whatsapp\.com\/channel\/([A-Za-z0-9_-]+)\/(\d+)$/i,
  );
  if (!match) return null;
  return {
    idCanal: match[1],
    idMensaje: match[2],
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
  serverId: string,
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
  name: ["reactch", "react", "chreact", "reaccioncanal"],
  category: "group",
  description: "Envía reacciones verificadas a un mensaje de un canal de WhatsApp con detección real de ACK.",
  groupOnly: false,

  async run(ctx: CommandContext) {
    const { sock, args = [], usedPrefix, reply, react } = ctx;
    const prefix = usedPrefix || ".";

    if (args.length < 2) {
      return reply(
        `╭〔 📢 ${fytBold("Reacción a Canal")} 〕⬣\n` +
          `• *Uso con texto o emojis:*\n` +
          `  \`${prefix}reactch https://whatsapp.com/channel/xxx/804 test\`\n` +
          `  \`${prefix}reactch https://whatsapp.com/channel/xxx/804 🔥 ⚡ ❤️\`\n` +
          `╰━━━━━━━━━━━━⬣`,
      );
    }

    const parsedLink = extraerDatosEnlace(args[0]);
    if (!parsedLink) {
      return reply(
        `❌ Enlace inválido. Usa el enlace directo a la publicación del canal:\n\`https://whatsapp.com/channel/ID_CANAL/ID_MENSAJE\``,
      );
    }

    const rawInput = args.slice(1).join(" ").trim();
    if (!rawInput) {
      return reply(`⚠️ Escribe el texto o los emojis con los que deseas reaccionar.`);
    }

    await react("⏳").catch(() => undefined);

    try {
      const anySock = sock as any;
      if (typeof anySock.newsletterMetadata !== "function") {
        return reply(`❌ Tu versión de Baileys no soporta metadatos de canales (newsletterMetadata).`);
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

      if (typeof anySock.newsletterFollow === "function") {
        await anySock.newsletterFollow(jidCanal).catch(() => undefined);
      }
      if (typeof anySock.subscribeNewsletterUpdates === "function") {
        await anySock.subscribeNewsletterUpdates(jidCanal).catch(() => undefined);
      }

      const candidates = [
        buildCircledString(rawInput, ""),
        buildRegionalString(rawInput, "\u200B"),
        buildRegionalString(rawInput, " "),
        buildCircledString(rawInput, "\u200D"),
        rawInput,
      ];

      const uniqueCandidates = Array.from(new Set(candidates.filter(Boolean)));
      let lastErrorCode = "";

      for (const candidateCode of uniqueCandidates) {
        const res = await sendVerifiedNewsletterReaction(
          anySock,
          jidCanal,
          parsedLink.idMensaje,
          candidateCode,
        );
        if (res.ok) {
          await react("✅").catch(() => undefined);
          return reply(
            `✅ Reacción aplicada con *${candidateCode}* en el mensaje \`#${parsedLink.idMensaje}\` del canal *${nombreCanal}*.`,
          );
        }
        lastErrorCode = res.errorCode || "400";
      }

      const individualUnits = extractIndividualEmojiLetters(rawInput);
      if (individualUnits.length === 0) {
        await react("❌").catch(() => undefined);
        return reply(
          `❌ El servidor de WhatsApp rechazó la reacción de texto (\`ACK Error ${lastErrorCode}\`).\n` +
            `• Prueba enviando emojis directos: \`${prefix}reactch ${args[0]} 🔥\``,
        );
      }

      const sockets = getAvailableSockets(anySock);
      const appliedReactions: string[] = [];

      for (let i = 0; i < individualUnits.length; i++) {
        const unit = individualUnits[i];
        const targetBot = sockets[i % sockets.length];

        if (typeof targetBot.newsletterFollow === "function") {
          await targetBot.newsletterFollow(jidCanal).catch(() => undefined);
        }

        let unitRes = await sendVerifiedNewsletterReaction(
          targetBot,
          jidCanal,
          parsedLink.idMensaje,
          unit,
        );

        if (!unitRes.ok && EMOJI_LETTER_FALLBACK[normalizeText(rawInput[i] || "")]) {
          const altEmoji = EMOJI_LETTER_FALLBACK[normalizeText(rawInput[i])];
          unitRes = await sendVerifiedNewsletterReaction(
            targetBot,
            jidCanal,
            parsedLink.idMensaje,
            altEmoji,
          );
          if (unitRes.ok) {
            appliedReactions.push(altEmoji);
          }
        } else if (unitRes.ok) {
          appliedReactions.push(unit);
        }

        if (sockets.length === 1) {
          break;
        }
        await sleep(180);
      }

      if (appliedReactions.length > 0) {
        await react("✅").catch(() => undefined);
        const note =
          sockets.length === 1 && individualUnits.length > 1
            ? `\n_ℹ️ WhatsApp bloqueó múltiples letras en un solo paquete (ACK ${lastErrorCode}), por lo que se aplicó la reacción individual permitida por socket._`
            : "";
        return reply(
          `✅ Reacción verificada enviada (${appliedReactions.join(" ")}) al mensaje \`#${parsedLink.idMensaje}\` del canal *${nombreCanal}*.${note}`,
        );
      }

      await react("❌").catch(() => undefined);
      return reply(
        `❌ El servidor de WhatsApp rechazó la reacción en el canal *${nombreCanal}* (\`ACK Error ${lastErrorCode}\`).\n` +
          `• Esto ocurre cuando WhatsApp bloquea caracteres no estándar en ese canal. Prueba con un emoji normal:\n` +
          `  \`${prefix}reactch ${args[0]} 🔥\``,
      );
    } catch (e: any) {
      await react("❌").catch(() => undefined);
      return reply(
        `❌ ${fytBold("ReactChannel:")} ${e?.message || "No se pudo enviar la reacción al canal."}`,
      );
    }
  },
};
