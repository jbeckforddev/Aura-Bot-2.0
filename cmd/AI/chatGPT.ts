import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { aiError, askAlya, getPrompt } from "../../src/api/aiUtils.ts";
import { t } from "../../src/langs/index.ts";

function buildAiRichPayload(data: {
  userName: string;
  prompt: string;
  response: string;
  latency: string;
  words: number;
  chars: number;
  timeStr: string;
}) {
  const serialized = JSON.stringify(data);

  const html = `<style>
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#05020c;color:#f5f3ff;padding:10px}
.card{max-width:420px;margin:0 auto;background:linear-gradient(180deg,#120726 0%,#070312 100%);border:1.5px solid #3b1d6e;border-radius:20px;overflow:hidden;box-shadow:0 20px 55px rgba(0,0,0,.85),0 0 30px rgba(139,92,246,.2);position:relative}
.card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#7c3aed,#ec4899,#00ffcc,#7c3aed);background-size:200% 100%;animation:flow 3s linear infinite;z-index:10}
@keyframes flow{0%{background-position:0% 0%}100%{background-position:200% 0%}}
.head{padding:14px 16px;background:radial-gradient(circle at 85% 15%,rgba(168,85,247,.25),transparent 60%);border-bottom:1px solid #261447;display:flex;justify-content:space-between;align-items:center}
.brand{display:flex;align-items:center;gap:10px}
.orb{width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,#9333ea,#db2777);display:flex;align-items:center;justify-content:center;font-size:17px;box-shadow:0 0 15px rgba(147,51,234,.5)}
.brand-txt h1{font-size:14px;font-weight:900;letter-spacing:.8px;color:#fff;text-transform:uppercase}
.brand-txt p{font-size:10.5px;color:#c084fc;font-weight:700}
.badges{display:flex;gap:6px;align-items:center}
.pill{font-size:9.5px;font-weight:900;padding:4px 8px;border-radius:999px;background:rgba(139,92,246,.18);color:#e9d5ff;border:1px solid rgba(168,85,247,.4);font-family:'Courier New',monospace}
.body{padding:14px 16px}
.prompt-box{background:#0d051c;border:1px solid #28154a;border-left:3px solid #ec4899;border-radius:11px;padding:9px 12px;margin-bottom:12px}
.lbl{font-size:9.5px;font-weight:900;text-transform:uppercase;letter-spacing:1px;color:#a78bfa;margin-bottom:4px;display:flex;justify-content:space-between}
.prompt-txt{font-size:12px;color:#e9d5ff;line-height:1.4;word-break:break-word}
.resp-wrap{background:#090414;border:1px solid #2d1754;border-radius:13px;padding:12px;margin-bottom:12px;max-height:340px;overflow-y:auto;user-select:text;-webkit-user-select:text}
.resp-txt{font-size:12.5px;color:#f3e8ff;line-height:1.55;white-space:pre-wrap;word-break:break-word}
.resp-txt strong{color:#f0abfc;font-weight:800}
.inline-code{background:#1e0f38;color:#00ffcc;padding:1px 5px;border-radius:5px;font-family:'Courier New',monospace;font-size:11.5px;border:1px solid #3b2069}
.code-block{background:#040208;border:1px solid #351c61;border-radius:9px;margin:8px 0;overflow:hidden}
.code-top{background:#160a2c;padding:5px 10px;display:flex;justify-content:space-between;align-items:center;font-size:10px;color:#c084fc;font-family:'Courier New',monospace;font-weight:800;border-bottom:1px solid #28144f}
.code-copy{background:#2e1065;border:1px solid #7c3aed;color:#e9d5ff;font-size:9.5px;font-weight:800;padding:2px 7px;border-radius:5px;cursor:pointer}
.code-pre{padding:9px 10px;font-family:'Courier New',monospace;font-size:11.5px;color:#38bdf8;overflow-x:auto;white-space:pre;line-height:1.4}
.meta-bar{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:12px}
.meta-item{background:#0e061d;border:1px solid #221140;border-radius:9px;padding:6px;text-align:center}
.meta-v{font-size:11.5px;font-weight:900;color:#e9d5ff}
.meta-k{font-size:9px;color:#8b74b0;text-transform:uppercase;margin-top:1px;font-weight:800}
.actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.btn{border:none;border-radius:11px;padding:10px;font-size:11.5px;font-weight:900;cursor:pointer;text-transform:uppercase;letter-spacing:.7px;transition:transform .1s}
.btn:active{transform:scale(0.96)}
.btn-primary{background:linear-gradient(135deg,#8b5cf6,#6d28d9);color:#fff;box-shadow:0 4px 15px rgba(139,92,246,.35)}
.btn-sec{background:#170d2b;border:1px solid #3b2166;color:#d8b4fe}
.toast{position:fixed;bottom:14px;left:50%;transform:translateX(-50%) translateY(20px);background:#8b5cf6;color:#fff;font-size:11.5px;font-weight:800;padding:7px 15px;border-radius:999px;opacity:0;pointer-events:none;transition:all .2s;z-index:99;box-shadow:0 6px 20px rgba(0,0,0,.6)}
.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
</style>

<div class="card">
  <div class="head">
    <div class="brand">
      <div class="orb">🤖</div>
      <div class="brand-txt">
        <h1>ChatGPT // Neural</h1>
        <p id="userSub"></p>
      </div>
    </div>
    <div class="badges">
      <span class="pill" id="latPill"></span>
    </div>
  </div>

  <div class="body">
    <div class="prompt-box">
      <div class="lbl"><span>💬 CONSULTA</span><span id="timeLbl"></span></div>
      <div class="prompt-txt" id="promptTxt"></div>
    </div>

    <div class="lbl" style="margin-bottom:6px"><span>⚡ RESPUESTA DE LA IA</span><span>GPT-4o CORE</span></div>
    <div class="resp-wrap">
      <div class="resp-txt" id="respBox"></div>
    </div>

    <div class="meta-bar">
      <div class="meta-item">
        <div class="meta-v" id="mWords"></div>
        <div class="meta-k">Palabras</div>
      </div>
      <div class="meta-item">
        <div class="meta-v" id="mChars"></div>
        <div class="meta-k">Caracteres</div>
      </div>
      <div class="meta-item">
        <div class="meta-v" id="mLat"></div>
        <div class="meta-k">Latencia</div>
      </div>
    </div>

    <div class="actions">
      <button class="btn btn-primary" onclick="copyRaw(D.response, 'Respuesta copiada')">📋 Copiar Todo</button>
      <button class="btn btn-sec" onclick="openModalView()">🔍 Ver en Ventana</button>
    </div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
const D = ${serialized};
const CODE_STORE = [];
function $(id){ return document.getElementById(id); }

function escapeHtml(str){
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatMarkdown(raw){
  let safe = escapeHtml(raw);
  safe = safe.replace(/\`\`\`([a-zA-Z0-9_-]*)\\n([\\s\\S]*?)\`\`\`/g, function(_, lang, code){
    const idx = CODE_STORE.push(code) - 1;
    const tag = (lang || "code").toUpperCase();
    return '<div class="code-block"><div class="code-top"><span>' + tag + '</span><button class="code-copy" onclick="copyCodeBlock(' + idx + ')">Copiar</button></div><div class="code-pre">' + code + '</div></div>';
  });
  safe = safe.replace(/\`([^\`\\n]+)\`/g, '<span class="inline-code">$1</span>');
  safe = safe.replace(/\\*\\*([^\\*\\n]+)\\*\\*/g, '<strong>$1</strong>');
  return safe;
}

function copyRaw(txt, msg){
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt).catch(function(){});
  } else {
    const t = document.createElement("textarea");
    t.value = txt;
    document.body.appendChild(t);
    t.select();
    try { document.execCommand("copy"); } catch(e){}
    document.body.removeChild(t);
  }
  const el = $("toast");
  el.textContent = msg || "Copiado";
  el.classList.add("show");
  setTimeout(function(){ el.classList.remove("show"); }, 1600);
}

function copyCodeBlock(idx){
  const el = document.createElement("textarea");
  el.innerHTML = CODE_STORE[idx] || "";
  copyRaw(el.value, "Código copiado");
}

function openModalView(){
  alert("🤖 CHATGPT // AURA AI\\n\\n" + D.response);
}

function init(){
  $("userSub").textContent = "Solicitado por " + D.userName;
  $("latPill").textContent = "⚡ " + D.latency;
  $("timeLbl").textContent = D.timeStr;
  $("promptTxt").textContent = D.prompt;
  $("respBox").innerHTML = formatMarkdown(D.response);
  $("mWords").textContent = D.words;
  $("mChars").textContent = D.chars;
  $("mLat").textContent = D.latency;
}

init();
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

export default {
  name: ["chatgpt", "ia", "gpt"],
  category: "AI",
  description: t("cmd_habla_con_chatgpt_db96214b"),

  async run(ctx: CommandContext) {
    const { args, reply, react, sock, from, msg } = ctx;
    const prompt = getPrompt(args);
    if (!prompt) {
      return reply({
        text: t("cmd_value0_value1_debes_escribir_u_8abd32e0", {
          value0: fytBold(t("cmd_aura_reed_95dcfb15")),
          value1: fytBold(t("cmd_falta_mensaje_dba5d803")),
          value2: fytBold(t("cmd_system_info_1a78a0cb")),
        }),
      });
    }

    await react("🤖").catch(() => undefined);
    const startTs = Date.now();

    try {
      const response = String(await askAlya("/ai/chatgpt", prompt)).trim();
      const latency = `${((Date.now() - startTs) / 1000).toFixed(2)}s`;
      const words = response ? response.split(/\s+/).filter(Boolean).length : 0;
      const chars = response.length;
      const userName = msg?.pushName || "Usuario";
      const timeStr = new Date().toLocaleTimeString("es-CR", {
        hour: "2-digit",
        minute: "2-digit",
      });

      try {
        const { AIRich } = await import("baileys/lib/Builders/ai-rich.js");
        const rich = new AIRich(sock)
          .setTitle("🟣 CHATGPT // AURA AI")
          .setFooter(`Respuesta generada en ${latency}`);

        rich.addSection(
          buildAiRichPayload({
            userName,
            prompt,
            response,
            latency,
            words,
            chars,
            timeStr,
          }),
        );

        await rich.send(from, { quoted: msg });
      } catch {
        await reply({
          text: t("cmd_value0_value1_value2_7769dc65", {
            value0: fytBold(t("cmd_chatgpt_ai_b2c2b3b0")),
            value1: response,
            value2: fytBold(t("cmd_system_ai_8c7b0f70")),
          }),
        });
      }

      await react("✅").catch(() => undefined);
    } catch (error) {
      await react("❌").catch(() => undefined);
      return reply({
        text: t("cmd_value0_value1_5109efcd", {
          value0: fytBold(t("cmd_error_al_obtener_respuesta_36b0a55f")),
          value1: aiError(error),
        }),
      });
    }
  },
};
