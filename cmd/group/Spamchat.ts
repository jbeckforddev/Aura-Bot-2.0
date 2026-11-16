import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

const G = globalThis as any;
const jobs: Map<string, { stop: boolean }> = (G.__spamChatJobs ??= new Map());
const dead: Map<any, number> = (G.__spamDead ??= new Map());

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const digits = (j: string) => String(j || "").split("@")[0].split(":")[0].replace(/\D/g, "");
const bare = (j: string) => `${digits(j)}@s.whatsapp.net`;

/* ───────────────────────── subbots ───────────────────────── */

const isSock = (v: any) =>
  v && typeof v.sendMessage === "function" && v.ws && v.authState?.creds?.me?.id;

const isLive = (s: any) => {
  if (!s?.ws) return false;
  if (typeof s.ws.readyState === "number") return s.ws.readyState === 1;
  if (typeof s.ws.isOpen === "boolean") return s.ws.isOpen;
  return true;
};

function fromAny(x: any): any[] {
  if (!x) return [];
  if (isSock(x)) return [x];
  let arr: any[] = [];
  if (typeof x.values === "function") { try { arr = [...x.values()]; } catch {} }
  else if (Array.isArray(x)) arr = x;
  else if (typeof x === "object") arr = Object.values(x);
  return arr.map((v: any) => v?.sock ?? v?.client ?? v?.conn ?? v).filter(isSock);
}

function pool(ctx: any): any[] {
  const found: any[] = [];
  for (const k of Object.keys(G)) {
    if (k.startsWith("__spam")) continue;
    if (!/sub|bot|conn|sock|client|instance/i.test(k)) continue;
    let v: any;
    try { v = G[k]; } catch { continue; }
    found.push(...fromAny(v));
  }
  for (const c of [G.subbots, G.__subbots, ctx.subbots]) found.push(...fromAny(c));
  return [...new Set(found)];
}

/* ───────────────────────── texto ───────────────────────── */

function armar(plantilla: string, i: number, total: number): string {
  return plantilla
    .replace(/\{n\}/gi, String(i + 1))
    .replace(/\{total\}/gi, String(total))
    .replace(/\{i\}/gi, String(i + 1));
}

function textoCitado(msg: any): string {
  const q: any = (msg.message as any)?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (!q) return "";
  return String(q.conversation || q.extendedTextMessage?.text || q.imageMessage?.caption || q.videoMessage?.caption || "").trim();
}

/* ───────────────────────── comando ───────────────────────── */

export default {
  name: ["spamchat", "spam"],
  category: "group",
  description: "Manda el texto que pidas a un número con N subbots, M veces cada uno.",
  async run(ctx: CommandContext) {
    const { sock, from, msg, args, reply, react } = ctx;
    const a0 = (args[0] || "").toLowerCase().trim();

    if (a0 === "stop" || a0 === "parar") {
      const j = jobs.get(from);
      if (!j) { await reply("No hay spam corriendo aquí.").catch(() => undefined); return; }
      j.stop = true;
      await react("⏹️").catch(() => undefined);
      await reply("⏹️ Detenido.").catch(() => undefined);
      return;
    }

    if (jobs.get(from)) {
      await reply("Ya hay un spam corriendo. Usa `.spamchat stop`.").catch(() => undefined);
      return;
    }

    const info: any = (msg.message as any)?.extendedTextMessage?.contextInfo || {};
    const rawNum = (args[0] || "").replace(/\D/g, "");
    const citado = info.participant ? digits(info.participant) : "";

    const num = rawNum.length >= 8 ? rawNum : citado;

    if (!num) {
      await reply(
        `Uso: \`.spamchat <número> [mensajes] [subbots] <texto>\`\n\n` +
          `Ej: \`.spamchat 573118353868 10 5 hola, revisa esto\`\n\n` +
          `· mensajes por subbot: 1–40 (def. 10)\n` +
          `· subbots: 1–30 (def. 5)\n` +
          `· en el texto puedes usar \`{n}\` y \`{total}\`\n` +
          `· si no escribes texto, toma el del mensaje citado\n` +
          `Cortar: \`.spamchat stop\``,
      ).catch(() => undefined);
      return;
    }

    let i = 1;
    let porSub = 10;
    let cuantos = 5;

    if (/^\d+$/.test(args[i] || "")) {
      porSub = Number(args[i]); i++;
      if (/^\d+$/.test(args[i] || "")) { cuantos = Number(args[i]); i++; }
    }

    porSub = Math.min(40, Math.max(1, porSub));
    cuantos = Math.min(30, Math.max(1, cuantos));

    let texto = args.slice(i).join(" ").trim();
    if (!texto) texto = textoCitado(msg);

    if (!texto) {
      await reply("Falta el texto. Escríbelo al final o responde a un mensaje con `.spamchat <número>`.").catch(() => undefined);
      return;
    }

    if (texto.length > 4000) texto = texto.slice(0, 4000);

    const todos = pool(ctx);
    const vivos = todos.filter((s) => isLive(s) && !(dead.get(s) && Date.now() - dead.get(s)! < 60000));

    const lista = [...vivos].sort(() => Math.random() - 0.5).slice(0, cuantos);
    if (lista.length < cuantos) lista.push(sock);

    const destino = bare(num);
    const total = lista.length * porSub;

    const job = { stop: false };
    jobs.set(from, job);

    await react("📨").catch(() => undefined);
    await reply(
      `📨 ${fytBold("Spam distribuido")} → +${num}\n` +
        `Subbots: ${fytBold(String(lista.length))}\n` +
        `${porSub} por subbot · ${fytBold(String(total))} en total\n\n` +
        `Texto: ${texto.length > 90 ? texto.slice(0, 90) + "…" : texto}\n\n` +
        `Cortar: \`.spamchat stop\``,
    ).catch(() => undefined);

    let enviados = 0;
    let fallos = 0;

    const trabajo = async (s: any, idx: number) => {
      await sleep(idx * 180);
      for (let k = 0; k < porSub; k++) {
        if (job.stop) return;
        try {
          await s.sendMessage(destino, { text: armar(texto, k, porSub) });
          enviados++;
          await sleep(260 + Math.random() * 220);
        } catch {
          fallos++;
          dead.set(s, Date.now());
          await sleep(700);
          if (fallos >= 25) return;
        }
      }
    };

    await Promise.all(lista.map((s, i2) => trabajo(s, i2)));

    jobs.delete(from);
    await react(job.stop ? "⏹️" : "✅").catch(() => undefined);

    await reply(
      `${job.stop ? "⏹️ Cortado" : "✅ Terminado"} · ${fytBold(String(enviados))} enviados de ${total}` +
        (fallos ? ` · ${fallos} fallos` : "") +
        (fallos >= 25 ? "\n⚠️ Muchos fallos, corté por rate limit." : ""),
    ).catch(() => undefined);
  },
};
