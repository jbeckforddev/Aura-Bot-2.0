import { getDevice } from "baileys";
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

function buildDeviceRichPayload(data: {
  targetName: string;
  targetJid: string;
  osName: string;
  osIcon: string;
  msgId: string;
  timestamp: string;
  deviceType: string;
}) {
  const serialized = JSON.stringify(data);

  const html = `<style>
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#05020c;color:#f5f3ff;padding:10px}
.card{max-width:420px;margin:0 auto;background:linear-gradient(180deg,#120726 0%,#070312 100%);border:1.5px solid #3b1d6e;border-radius:20px;overflow:hidden;box-shadow:0 20px 55px rgba(0,0,0,.85),0 0 30px rgba(139,92,246,.2);position:relative}
.card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#00ffcc,#7c3aed,#ff0055,#00ffcc);background-size:200% 100%;animation:flow 3s linear infinite;z-index:10}
@keyframes flow{0%{background-position:0% 0%}100%{background-position:200% 0%}}
.head{padding:14px 16px;background:radial-gradient(circle at 85% 15%,rgba(0,255,204,.15),transparent 65%);border-bottom:1px solid #2d144f;display:flex;justify-content:space-between;align-items:center;position:relative;overflow:hidden}
.head::after{content:'';position:absolute;top:0;left:0;width:100%;height:100%;background:linear-gradient(180deg,transparent,rgba(0,255,204,.1),transparent);transform:translateY(-100%);animation:scan 2.5s linear infinite}
@keyframes scan{0%{transform:translateY(-100%)}100%{transform:translateY(100%)}}
.brand{display:flex;align-items:center;gap:10px;z-index:2}
.orb{width:36px;height:36px;border-radius:11px;background:linear-gradient(135deg,#00ffcc,#3b1d6e);display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 0 16px rgba(0,255,204,.4)}
.brand-txt h1{font-size:13.5px;font-weight:900;letter-spacing:.9px;color:#fff;text-transform:uppercase}
.brand-txt p{font-size:10px;color:#00ffcc;font-weight:800;font-family:'Courier New',monospace}
.pill{font-size:9.5px;font-weight:900;padding:4px 9px;border-radius:999px;background:rgba(0,255,204,.12);color:#5eead4;border:1px solid rgba(0,255,204,.4);font-family:'Courier New',monospace;z-index:2}
.body{padding:14px 16px}
.hero-box{background:linear-gradient(135deg,rgba(46,16,101,.55),rgba(15,5,29,.9));border:1px solid #4c1d95;border-left:3.5px solid #00ffcc;border-radius:14px;padding:12px;display:flex;align-items:center;gap:12px;margin-bottom:12px}
.ava-wrap{width:48px;height:48px;border-radius:12px;background:linear-gradient(135deg,#7c3aed,#00ffcc);flex:none;display:flex;align-items:center;justify-content:center;font-size:24px;box-shadow:0 0 15px rgba(0,255,204,.3)}
.tgt-meta{min-width:0;flex:1}
.tgt-lbl{font-size:9px;font-weight:900;color:#5eead4;text-transform:uppercase;letter-spacing:1px}
.tgt-name{font-size:14.5px;font-weight:900;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px}
.tgt-sub{font-size:10.5px;color:#c4b5fd;font-family:'Courier New',monospace;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px}
.info-card{background:#0f061e;border:1px solid #251345;border-radius:11px;padding:8px 10px}
.info-card.wide{grid-column:span 2}
.k{font-size:9px;font-weight:800;color:#8b74b0;text-transform:uppercase;letter-spacing:.6px}
.v{font-size:12px;font-weight:900;color:#e9d5ff;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:'Courier New',monospace}
.v.hl{color:#00ffcc}
.v.warn{color:#ff0055}
.sec-lbl{font-size:9.5px;font-weight:900;text-transform:uppercase;letter-spacing:1px;color:#a78bfa;margin-bottom:6px;display:flex;justify-content:space-between}
.terminal{background:#070310;border:1px solid #2a144f;border-radius:11px;padding:10px;font-family:'Courier New',monospace;font-size:10.5px;color:#d8b4fe;line-height:1.5;margin-bottom:14px}
.term-line{display:flex;justify-content:space-between;border-bottom:1px dashed #1e0e38;padding-bottom:4px;margin-bottom:4px}
.term-line:last-child{border:none;margin:0;padding:0}
.actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.btn{border:none;border-radius:11px;padding:10px;font-size:11.5px;font-weight:900;cursor:pointer;text-transform:uppercase;letter-spacing:.7px;transition:transform .1s}
.btn:active{transform:scale(0.96)}
.btn-primary{background:linear-gradient(135deg,#00ffcc,#3b1d6e);color:#05020c;box-shadow:0 4px 15px rgba(0,255,204,.3)}
.btn-sec{background:#170d2b;border:1px solid #3b2166;color:#d8b4fe}
.toast{position:fixed;bottom:14px;left:50%;transform:translateX(-50%) translateY(20px);background:#00ffcc;color:#05020c;font-size:11.5px;font-weight:900;padding:7px 15px;border-radius:999px;opacity:0;pointer-events:none;transition:all .2s;z-index:99;box-shadow:0 6px 20px rgba(0,255,204,.4)}
.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
</style>

<div class="card">
  <div class="head">
    <div class="brand">
      <div class="orb">📡</div>
      <div class="brand-txt">
        <h1>Device Scanner</h1>
        <p>AURA TELEMETRY NODE</p>
      </div>
    </div>
    <span class="pill">E2EE ACTIVE</span>
  </div>

  <div class="body">
    <div class="hero-box">
      <div class="ava-wrap" id="osIcon"></div>
      <div class="tgt-meta">
        <div class="tgt-lbl">Objetivo Interceptado</div>
        <div class="tgt-name" id="tName"></div>
        <div class="tgt-sub" id="tJid"></div>
      </div>
    </div>

    <div class="grid">
      <div class="info-card">
        <div class="k">🖥️ Sistema / Marca</div>
        <div class="v hl" id="osName"></div>
      </div>
      <div class="info-card">
        <div class="k">📱 Tipo Entorno</div>
        <div class="v" id="devType"></div>
      </div>
      <div class="info-card wide">
        <div class="k">🔑 ID del Mensaje (Hash)</div>
        <div class="v" id="msgId" style="color:#f0abfc"></div>
      </div>
    </div>

    <div class="sec-lbl"><span>⚙️ METADATA OCULTA</span><span>SNIFFER</span></div>
    <div class="terminal">
      <div class="term-line"><span>Protocolo Cifrado:</span><span style="color:#00ffcc">Signal (E2EE)</span></div>
      <div class="term-line"><span>Nodo de Red:</span><span>s.whatsapp.net</span></div>
      <div class="term-line"><span>Timestamp Msg:</span><span id="tsVal"></span></div>
      <div class="term-line"><span>Firma de Cliente:</span><span style="color:#ff0055">Verificada</span></div>
      <div class="term-line"><span>Estado de Sesión:</span><span style="color:#4ade80">Activa / Vinculada</span></div>
    </div>

    <div class="actions">
      <button class="btn btn-primary" onclick="copyData()">📋 Copiar Info</button>
      <button class="btn btn-sec" onclick="triggerAlert()">🔍 Analizar</button>
    </div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
const D = ${serialized};
function $(id){ return document.getElementById(id); }

function init(){
  $("osIcon").textContent = D.osIcon;
  $("tName").textContent = D.targetName;
  $("tJid").textContent = D.targetJid;
  $("osName").textContent = D.osName;
  $("devType").textContent = D.deviceType;
  $("msgId").textContent = D.msgId;
  $("tsVal").textContent = D.timestamp;
}

function copyData(){
  const txt = "📱 DEVICE SCAN: " + D.targetName + "\\n" +
              "🆔 JID: " + D.targetJid + "\\n" +
              "💻 OS/Marca: " + D.osName + "\\n" +
              "⚙️ Entorno: " + D.deviceType + "\\n" +
              "🔑 Msg ID: " + D.msgId;
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
  el.textContent = "Datos copiados";
  el.classList.add("show");
  setTimeout(function(){ el.classList.remove("show"); }, 1600);
}

function triggerAlert(){
  alert("📡 ANÁLISIS DE TELEMETRÍA:\\n\\nUsuario: " + D.targetName + "\\nSistema detectado: " + D.osName + "\\n\\nEl motor interno de WhatsApp revela el OS basado en la longitud y estructura de los ID de mensaje.");
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
  name: ["tel", "telefono", "dispositivo", "device"],
  category: "system",
  description: "Extrae la marca o sistema operativo del usuario (Android, iPhone/iOS, PC) mediante telemetría del mensaje.",
  ownerOnly: false,

  async run(ctx: CommandContext) {
    const { sock, from, msg, sender, reply, react, db } = ctx;

    await react("📡").catch(() => undefined);

    const context = msg?.message?.extendedTextMessage?.contextInfo;
    const isQuoted = Boolean(context?.stanzaId);
    
    const targetMsgId = isQuoted ? context!.stanzaId! : msg.key.id!;
    const targetJid = isQuoted ? context!.participant! : sender;

    const cleanNum = targetJid.split("@")[0].split(":")[0];
    const dbAny = db as any;
    const userRec = dbAny?.getUser?.(`${cleanNum}@s.whatsapp.net`);

    const targetName = isQuoted 
      ? (userRec?.pushName || userRec?.username || `+${cleanNum}`)
      : (msg.pushName || userRec?.username || `+${cleanNum}`);

    const deviceRaw = getDevice(targetMsgId);
    let osName = "Desconocido / Oculto";
    let osIcon = "📱";
    let deviceType = "Móvil Estándar";

    if (deviceRaw === "android") {
      osName = "Android (Samsung, Xiaomi, etc)";
      osIcon = "🤖";
      deviceType = "App Nativa Android";
    } else if (deviceRaw === "ios") {
      osName = "Apple iPhone / iOS";
      osIcon = "🍏";
      deviceType = "App Nativa iOS";
    } else if (deviceRaw === "web") {
      osName = "Navegador / WhatsApp Web";
      osIcon = "💻";
      deviceType = "Cliente Proxy Web";
    } else if (deviceRaw === "desktop") {
      osName = "Windows / macOS";
      osIcon = "🖥️";
      deviceType = "App de Escritorio";
    }

    const timestamp = new Date().toLocaleString("es-CR", {
      hour12: true,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    try {
      const { AIRich } = await import("baileys/lib/Builders/ai-rich.js");
      const rich = new AIRich(sock)
        .setTitle(`📡 OS SCAN // ${osName.split(" ")[0].toUpperCase()}`)
        .setFooter(`Objetivo: +${cleanNum} • E2EE`);

      rich.addSection(
        buildDeviceRichPayload({
          targetName,
          targetJid,
          osName,
          osIcon,
          msgId: targetMsgId,
          timestamp,
          deviceType,
        })
      );

      await rich.send(from, { quoted: msg });
      await react("✅").catch(() => undefined);
    } catch (error) {
      const fallbackText = 
        `📡 *ANÁLISIS DE DISPOSITIVO*\n\n` +
        `👤 *Usuario:* ${targetName}\n` +
        `📱 *Sistema / Marca:* ${osName}\n` +
        `💻 *Entorno:* ${deviceType}\n` +
        `🔑 *Msg ID:* \`${targetMsgId}\``;
      
      await reply({ text: fallbackText }).catch(() => undefined);
      await react("✅").catch(() => undefined);
    }
  },
};
