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
const clientRef: { cur: any; err: string } = (G.__voipClient ??= { cur: null, err: "" });
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

/* ───────────────────────── pares UDP ───────────────────────── */

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

/* ───────────────────────── cliente ───────────────────────── */

async function getClient(): Promise<any> {
  if (clientRef.cur) return clientRef.cur;
  if (connecting.p) return connecting.p;

  connecting.p = (async () => {
    let mod: any;
    try {
      mod = await import("baileys-caller");
    } catch (e: any) {
      throw new Error(
        `no se pudo cargar baileys-caller (${e?.message || e}). ` +
          `Instala: npm i git+https://github.com/SheIITear/baileys-caller.git && npm i @whiskeysockets/baileys`,
      );
    }
    if (!mod?.VoipClient) throw new Error("baileys-caller no exporta VoipClient (¿build incompleto? corre npm run build dentro del paquete)");

    const client = new mod.VoipClient({ authDir: AUTH });
    try {
      await client.connect();
    } catch (e: any) {
      try { client.disconnect?.(); } catch {}
      throw new Error(`connect() falló: ${e?.message || e}`);
    }
    clientRef.cur = client;
    clientRef.err = "";
    return client;
  })();

  try {
    return await connecting.p;
  } finally {
    connecting.p = null;
  }
}

/* ───────────────────────── comando ───────────────────────── */

export default {
  name: ["voip", "llamar", "call"],
  category: "system",
  description: "Llama por VoIP real (WASM), cuelga a los 2-3 s y devuelve IP, país, plataforma y versión.",
  async run(ctx: CommandContext) {
    const { from, msg, args, reply, react, sock } = ctx;

    const info: any = (msg.message as any)?.extendedTextMessage?.contextInfo || {};

    if (/^(diag|test)$/i.test((args[0] || "").trim())) {
      let pkg = "✅";
      let detail = "";
      try {
        const m: any = await import("baileys-caller");
        if (!m?.VoipClient) { pkg = "⚠️"; detail = "sin export VoipClient"; }
      } catch (e: any) {
        pkg = "❌";
        detail = e?.message || String(e);
      }
      let peer = "❌";
      try { await import("@whiskeysockets/baileys"); peer = "✅"; } catch { peer = "❌ falta"; }

      await reply(
        `Paquete: ${pkg}${detail ? `\n  ↳ ${detail}` : ""}\n` +
          `Peer baileys: ${peer}\n` +
          `Auth dir: ${existsSync(path.join(AUTH, "creds.json")) ? "✅ con sesión" : "⚠️ sin sesión (escanea QR)"}\n` +
          `Cliente: ${clientRef.cur ? "✅ conectado" : "—"}`,
      ).catch(() => undefined);
      return;
    }

    const joined = args.join("").replace(/\D/g, "");
    const quoted: string | undefined = info.participant;

    let num = "";
    if (joined.length >= 8) num = joined;
    else if (quoted) num = digits(quoted);
    else if (info.mentionedJid?.length) num = digits(info.mentionedJid[0]);
    else {
      await reply("Uso: `.voip +573203995335` o responde a alguien.").catch(() => undefined);
      return;
    }

    if (busy.has(num)) {
      await reply(`Ya hay una llamada a +${num}.`).catch(() => undefined);
      return;
    }

    await react("📞").catch(() => undefined);

    let client: any;
    try {
      client = await getClient();
    } catch (e: any) {
      clientRef.cur = null;
      await react("❌").catch(() => undefined);
      await reply(`❌ ${fytBold("Sin motor VoIP")}\n${e?.message || e}`).catch(() => undefined);
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

    setTimeout(() => {
      if (busy.has(num)) { busy.delete(num); try { call.end(); } catch {} }
    }, 70000);
  },
};
