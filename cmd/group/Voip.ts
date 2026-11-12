import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

const AUTH = path.join(process.cwd(), ".voip-auth");
const log = (...a: any[]) => console.log("[voip]", ...a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const digits = (j: string) => String(j || "").split("@")[0].split(":")[0].replace(/\D/g, "");

const G = globalThis as any;
const clientRef: { cur: any } = (G.__voipClient ??= { cur: null });
const busy: Set<string> = (G.__voipBusy ??= new Set());
const connecting: { p: Promise<any> | null } = (G.__voipConnecting ??= { p: null });

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

const isPrivate = (ip: string) => /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);

function udpPeers(): Set<string> {
  const out = new Set<string>();
  try {
    const txt = execFileSync("ss", ["-tun"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    for (const line of txt.split("\n")) {
      const m = line.match(/(\d+\.\d+\.\d+\.\d+):\d+\s*$/);
      if (m && !isPrivate(m[1])) out.add(m[1]);
    }
  } catch {}
  return out;
}

/* ───────────────────────── vinculación ───────────────────────── */

async function pair(ctx: any, phone?: string) {
  const { reply, sock, from, msg } = ctx;

  let B: any;
  try {
    B = await import("@whiskeysockets/baileys");
  } catch (e: any) {
    await reply(`❌ falta @whiskeysockets/baileys: ${e?.message || e}`).catch(() => undefined);
    return;
  }

  const { useMultiFileAuthState, default: makeWASocket } = B;
  const { state, saveCreds } = await useMultiFileAuthState(AUTH);

  const s: any = makeWASocket({ auth: state, printQRInTerminal: false });
  s.ev.on("creds.update", saveCreds);

  let finished = false;
  const done = async (txt: string) => {
    if (finished) return;
    finished = true;
    clientRef.cur = null;
    await reply(txt).catch(() => undefined);
  };

  s.ev.on("connection.update", async (u: any) => {
    if (u.connection === "open") {
      await done(`✅ Vinculado como +${digits(s.user?.id || "")}. Ya puedes usar \`.voip <número>\`.`);
      setTimeout(() => { try { s.end(); } catch {} }, 1500);
    }
    if (u.connection === "close" && !finished) {
      const code = u.lastDisconnect?.error?.output?.statusCode;
      if (code && code !== 515 && code !== 428) await done(`❌ Se cerró (${code}). Reintenta.`);
    }
  });

  if (phone) {
    const num = digits(phone);
    if (num.length < 8) { await reply("Número inválido.").catch(() => undefined); return; }
    await sleep(1200);
    const code = await s.requestPairingCode(num);
    await reply(
      `🔗 *Código de vinculación*\n\n\`${code}\`\n\n` +
        `En el teléfono: WhatsApp → Dispositivos vinculados → *Vincular con número de teléfono* → escribe ese código.`,
    ).catch(() => undefined);
    return;
  }

  s.ev.on("connection.update", async (u: any) => {
    if (!u.qr) return;
    let img: Buffer | null = null;
    try {
      const qr: any = await import("qrcode");
      const url = await (qr.default ?? qr).toDataURL(u.qr, { margin: 1, width: 420 });
      img = Buffer.from(String(url).split(",")[1], "base64");
    } catch {}

    if (img) {
      await sock.sendMessage(from, { image: img, caption: "🔗 Escanea en Dispositivos vinculados" }, { quoted: msg }).catch(() => undefined);
    } else {
      await reply(`🔗 QR (texto):\n\`\`\`${u.qr}\`\`\``).catch(() => undefined);
    }
  });
}

/* ───────────────────────── cliente ───────────────────────── */

async function getClient(): Promise<any> {
  if (clientRef.cur) return clientRef.cur;
  if (connecting.p) return connecting.p;

  connecting.p = (async () => {
    let mod: any;
    try {
      mod = await import("baileys-caller");
    } catch (e: any) {
      throw new Error(`no se pudo cargar baileys-caller: ${e?.message || e}`);
    }
    if (!mod?.VoipClient) throw new Error("baileys-caller sin export VoipClient");

    const client = new mod.VoipClient({ authDir: AUTH });
    try {
      await client.connect();
    } catch (e: any) {
      try { client.disconnect?.(); } catch {}
      throw new Error(`connect() falló: ${e?.message || e}`);
    }
    clientRef.cur = client;
    return client;
  })();

  try { return await connecting.p; } finally { connecting.p = null; }
}

/* ───────────────────────── comando ───────────────────────── */

export default {
  name: ["voip", "llamar", "call"],
  category: "system",
  description: "Llama por VoIP real (WASM), cuelga a los 2-3 s y devuelve IP, país, plataforma y versión.",
  async run(ctx: CommandContext) {
    const { from, msg, args, reply, react, sock } = ctx;
    const info: any = (msg.message as any)?.extendedTextMessage?.contextInfo || {};
    const a0 = (args[0] || "").trim();

    if (/^(diag|test)$/i.test(a0)) {
      let pkg = "✅";
      try { const m: any = await import("baileys-caller"); if (!m?.VoipClient) pkg = "⚠️"; } catch { pkg = "❌"; }
      let peer = "✅";
      try { await import("@whiskeysockets/baileys"); } catch { peer = "❌ falta"; }
      await reply(
        `Paquete: ${pkg}\nPeer baileys: ${peer}\n` +
          `Sesión: ${existsSync(path.join(AUTH, "creds.json")) ? "✅" : "⚠️ falta vincular"}\n` +
          `Cliente: ${clientRef.cur ? "✅" : "—"}`,
      ).catch(() => undefined);
      return;
    }

    if (/^qr$/i.test(a0)) {
      await react("🔗").catch(() => undefined);
      await pair(ctx, args[1]);
      return;
    }

    const joined = args.join("").replace(/\D/g, "");
    const quoted: string | undefined = info.participant;

    let num = "";
    if (joined.length >= 8) num = joined;
    else if (quoted) num = digits(quoted);
    else if (info.mentionedJid?.length) num = digits(info.mentionedJid[0]);
    else {
      await reply("Uso: `.voip +573203995335` · vincular: `.voip qr <tu número>`").catch(() => undefined);
      return;
    }

    if (busy.has(num)) { await reply(`Ya hay llamada a +${num}.`).catch(() => undefined); return; }

    await react("📞").catch(() => undefined);

    let client: any;
    try {
      client = await getClient();
    } catch (e: any) {
      clientRef.cur = null;
      await react("❌").catch(() => undefined);
      await reply(`❌ ${fytBold("Sin motor VoIP")}\n${e?.message || e}\n\nVincula con \`.voip qr <tu número>\`.`).catch(() => undefined);
      return;
    }

    await reply(`📞 Marcando +${num}…`).catch(() => undefined);
    busy.add(num);

    const before = udpPeers();
    let rang = false;
    let ip = "";

    let call: any;
    try {
      call = await client.call(num, { audioSource: "silence", durationMs: 60000 });
    } catch (e: any) {
      busy.delete(num);
      await react("❌").catch(() => undefined);
      await reply(`❌ No se pudo marcar: ${e?.message || e}`).catch(() => undefined);
      return;
    }

    call.on("ringing", () => { rang = true; });

    call.on("connected", async () => {
      await sleep(2000 + Math.floor(Math.random() * 1000));
      for (let i = 0; i < 8 && !ip; i++) {
        for (const p of udpPeers()) if (!before.has(p)) { ip = p; break; }
        if (!ip) await sleep(350);
      }
      try { call.end(); } catch {}
    });

    call.on("ended", async (reason: string) => {
      busy.delete(num);
      const g = await geo(ip);
      const lines = [
        `📞 *Llamada finalizada* (${reason})`,
        `Número: +${num}`,
        `Timbró: ${rang ? "sí" : "no"}`,
        g ? `País: ${g.country || "?"}` : "",
        g ? `Ciudad: ${g.city || "?"}` : "",
        ip ? `IP: \`${ip}\`` : "IP: `no detectada`",
        g?.org ? `Red: ${g.org}` : "",
        g?.lat ? `https://maps.google.com/?q=${g.lat},${g.lon}` : "",
      ].filter(Boolean);
      await sock.sendMessage(from, { text: lines.join("\n") }, { quoted: msg }).catch(() => undefined);
    });

    call.on("error", async (e: any) => {
      busy.delete(num);
      await reply(`❌ ${e?.message || e}`).catch(() => undefined);
    });

    setTimeout(() => { if (busy.has(num)) { busy.delete(num); try { call.end(); } catch {} } }, 70000);
  },
};
