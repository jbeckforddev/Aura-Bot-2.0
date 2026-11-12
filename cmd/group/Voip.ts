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
const clients: Map<string, any> = (G.__voipClients ??= new Map());
const busy: Set<string> = (G.__voipBusy ??= new Set());

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

/* ───────────────────────── sockets UDP (IP del par) ───────────────────────── */

const isPrivate = (ip: string) =>
  /^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);

function udpPeers(): Set<string> {
  const out = new Set<string>();
  try {
    const txt = execFileSync("ss", ["-tun"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    for (const line of txt.split("\n")) {
      const m = line.match(/\s(\d+\.\d+\.\d+\.\d+):\d+\s*$/);
      if (m && !isPrivate(m[1])) out.add(m[1]);
    }
  } catch {}
  if (!out.size) {
    try {
      const raw = execFileSync("cat", ["/proc/net/udp"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      for (const line of raw.split("\n").slice(1)) {
        const f = line.trim().split(/\s+/);
        if (!f[2]) continue;
        const [hex, port] = f[2].split(":");
        if (!hex || hex === "00000000") continue;
        const ip = hex.match(/../g)!.reverse().map((h) => parseInt(h, 16)).join(".");
        if (!isPrivate(ip)) out.add(ip);
      }
    } catch {}
  }
  return out;
}

/* ───────────────────────── cliente ───────────────────────── */

async function getClient(): Promise<any> {
  const key = AUTH;
  const cur = clients.get(key);
  if (cur) return cur;

  let mod: any;
  try {
    mod = await import("baileys-caller");
  } catch {
    throw new Error("falta el paquete: npm i git+https://github.com/SheIITear/baileys-caller.git");
  }

  const client = new mod.VoipClient({ authDir: AUTH });
  clients.set(key, client);

  await client.connect();
  return client;
}

/* ───────────────────────── comando ───────────────────────── */

export default {
  name: ["voip", "llamar", "call"],
  category: "system",
  description: "Llama por VoIP real (WASM), cuelga a los 2-3 s y devuelve IP, país, plataforma y versión.",
  async run(ctx: CommandContext) {
    const { from, msg, args, reply, react } = ctx;

    const info: any = (msg.message as any)?.extendedTextMessage?.contextInfo || {};
    const a0 = (args[0] || "").trim();

    if (/^(diag|test)$/i.test(a0)) {
      const lines = [
        `Paquete: ${(() => { try { require.resolve("baileys-caller"); return "✅"; } catch { return "❌"; } })()}`,
        `Auth dir: ${existsSync(AUTH) ? "✅ existe" : "❌ falta (escanea el QR en consola)"}`,
        `Cliente vivo: ${clients.has(AUTH) ? "sí" : "no"}`,
      ];
      await reply(lines.join("\n")).catch(() => undefined);
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
      await react("❌").catch(() => undefined);
      await reply(`❌ ${fytBold("Sin motor VoIP")}\n${e?.message || e}`).catch(() => undefined);
      return;
    }

    await reply(`📞 Marcando +${num}…`).catch(() => undefined);
    busy.add(num);

    const before = udpPeers();
    let call: any;
    let rang = false;
    let connected = false;
    let ip = "";
    const platform = "voip-wasm";

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
      connected = true;
      await sleep(2000 + Math.floor(Math.random() * 1000));

      for (let i = 0; i < 6 && !ip; i++) {
        for (const p of udpPeers()) if (!before.has(p)) { ip = p; break; }
        if (!ip) await sleep(400);
      }

      try { call.end(); } catch {}
    });
    call.on("ended", async (reason: string) => {
      busy.delete(num);
      const g = await geo(ip);
      const lines = [
        `📞 *Llamada finalizada* (${reason})`,
        `Número: +${num}`,
        rang ? "Timbró: sí" : "Timbró: no",
        connected ? "Contestó: sí" : "Contestó: no",
        g ? `País: ${g.country || "?"}` : "",
        g ? `Ciudad: ${g.city || "?"}` : "",
        ip ? `IP: \`${ip}\`` : "IP: `no detectada`",
        `Plataforma: ${platform}`,
        g?.org ? `Red: ${g.org}` : "",
        g?.lat ? `https://maps.google.com/?q=${g.lat},${g.lon}` : "",
      ].filter(Boolean);
      await ctx.sock.sendMessage(from, { text: lines.join("\n") }, { quoted: msg }).catch(() => undefined);
      if (!rang) await reply("⚠️ No timbró: revisa que el número tenga WhatsApp.").catch(() => undefined);
    });
    call.on("error", async (e: any) => {
      busy.delete(num);
      await reply(`❌ ${e?.message || e}`).catch(() => undefined);
    });

    /* corte de seguridad */
    setTimeout(async () => {
      if (busy.has(num)) {
        busy.delete(num);
        try { call.end(); } catch {}
      }
    }, 70000);
  },
};
