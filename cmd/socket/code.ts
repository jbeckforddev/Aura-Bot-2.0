import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { requestSubBotLink } from "../../connection/subbotManager.ts";
import { t } from "../../src/langs/index.ts";
import type { CommandContext } from "../../types/index.d.ts";

type PairingSession = {
  id: string;
  code: string | null;
  status: "waiting" | "generating" | "ready" | "connected" | "expired" | "error";
  error?: string;
  createdAt: number;
  timer?: NodeJS.Timeout;
};

const G = globalThis as any;
const pairingSessions: Map<string, PairingSession> = (G.__pairingSessions ??= new Map());
const PORT = Number(process.env.PAIRING_PORT || 8788);
let serverStarted = false;

function sweepSessions() {
  const now = Date.now();
  const TTL = 3 * 60 * 1000; // 3 minutos de expiración (desechable)
  for (const [id, s] of pairingSessions) {
    if (now - s.createdAt > TTL) {
      if (s.timer) clearTimeout(s.timer);
      pairingSessions.delete(id);
    }
  }
}

function startPairingServer() {
  if (serverStarted) return;
  serverStarted = true;

  const server: Server = createServer(async (req, res) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = url.pathname;

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    // API de Estado
    const statusMatch = pathname.match(/^\/api\/status\/([A-Za-z0-9]{20,40})$/);
    if (statusMatch) {
      const sessionId = statusMatch[1];
      const session = pairingSessions.get(sessionId);
      if (!session) {
        res.writeHead(410, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Enlace expirado o quemado." }));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        ok: true,
        status: session.status,
        code: session.code,
        error: session.error,
      }));
      return;
    }

    // API para solicitar código
    const requestMatch = pathname.match(/^\/api\/request\/([A-Za-z0-9]{20,40})$/);
    if (requestMatch && req.method === "POST") {
      const sessionId = requestMatch[1];
      const session = pairingSessions.get(sessionId);
      if (!session) {
        res.writeHead(410, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Enlace expirado." }));
        return;
      }

      let body = "";
      for await (const chunk of req) body += chunk;
      let phone = "";
      try {
        const parsed = JSON.parse(body);
        phone = String(parsed.phone || "").replace(/\D/g, "");
      } catch {}

      if (!phone || phone.length < 8) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Número inválido." }));
        return;
      }

      session.status = "generating";

      void requestSubBotLink({
        requester: `web-${phone}@s.whatsapp.net`,
        method: "code",
        phoneNumber: phone,
        onPairingCode: (code) => {
          session.code = code;
          session.status = "ready";
        },
        onConnected: () => {
          session.status = "connected";
          setTimeout(() => {
            if (session.timer) clearTimeout(session.timer);
            pairingSessions.delete(sessionId);
          }, 15000);
        },
        onPairingError: (err) => {
          session.status = "error";
          session.error = err.message;
        },
        onPairingExpired: () => {
          session.status = "expired";
        },
      }).catch((err) => {
        session.status = "error";
        session.error = err?.message || "Error desconocido";
      });

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, status: "generating" }));
      return;
    }

    // Interfaz Web Estética (Morados Neón Profundo / Estilo IDKBOT)
    const pageMatch = pathname.match(/^\/pair\/([A-Za-z0-9]{20,40})$/);
    if (pageMatch) {
      const sessionId = pageMatch[1];
      const session = pairingSessions.get(sessionId);
      if (!session) {
        res.writeHead(410, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Expirado</title><style>body{background:#04020a;color:#f3e8ff;font-family:sans-serif;text-align:center;padding-top:60px}</style></head><body><h1>❌ Enlace Desechable Expirado</h1><p>Este enlace ya fue quemado o superó su tiempo de vida.</p></body></html>`);
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Vinculación // Subbot Neón</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
body{background:#04020a;color:#f3e8ff;padding:16px;display:flex;justify-content:center;align-items:center;min-height:100vh}
.wrapper{width:100%;max-width:400px;border:1px solid #2a124f;background:#090414;border-radius:18px;padding:24px;box-shadow:0 0 40px rgba(139,92,246,0.18),inset 0 0 25px rgba(88,28,135,0.1);position:relative;overflow:hidden}
.wrapper::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,#c084fc,transparent)}
.step-tag{display:inline-block;background:#2e1065;color:#e9d5ff;font-size:10px;font-weight:900;padding:3px 10px;border-radius:6px;letter-spacing:1px;text-transform:uppercase;margin-bottom:12px;border:1px solid #7c3aed}
h1{font-size:22px;font-weight:900;color:#fff;margin-bottom:6px;letter-spacing:.5px}
p.sub{font-size:12px;color:#a78bfa;margin-bottom:20px;line-height:1.4}

.form-group{margin-bottom:16px}
.label{font-size:11px;font-weight:800;color:#c084fc;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px}
.input-row{display:flex;gap:8px}
input{flex:1;background:#05020a;border:1.5px solid #581c87;color:#fff;padding:12px 14px;border-radius:12px;font-size:15px;outline:none;transition:all .2s}
input:focus{border-color:#c084fc;box-shadow:0 0 15px rgba(192,132,252,0.35)}

.action-btn{width:100%;background:linear-gradient(135deg,#7c3aed,#9333ea);color:#fff;border:none;padding:13px;border-radius:12px;font-weight:900;cursor:pointer;font-size:13px;letter-spacing:1px;text-transform:uppercase;box-shadow:0 5px 20px rgba(124,58,237,0.4);transition:transform .1s}
.action-btn:active{transform:scale(0.97)}

.code-container{border:2px dashed #7c3aed;background:#06020f;border-radius:14px;padding:22px;text-align:center;margin-top:16px;display:none;box-shadow:inset 0 0 20px rgba(124,58,237,0.15)}
.code-value{font-size:28px;font-weight:900;color:#f3e8ff;letter-spacing:4px;font-family:'Courier New',monospace;text-shadow:0 0 15px rgba(239,246,255,0.6)}
.copy-whatsapp-btn{display:block;width:100%;background:#1b0c36;border:1.5px solid #7c3aed;color:#e9d5ff;text-align:center;padding:11px;border-radius:10px;font-weight:800;font-size:12px;text-decoration:none;margin-top:12px;text-transform:uppercase;letter-spacing:.5px}

.steps-list{margin-top:18px;border-top:1px solid #1e1035;padding-top:14px}
.step-item{display:flex;align-items:flex-start;gap:10px;margin-bottom:10px;font-size:11.5px;color:#cbd5e1;line-height:1.4}
.step-num{background:#2e1065;color:#c084fc;width:20px;height:20px;border-radius:5px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:10px;flex:none;border:1px solid #7c3aed}

.status-box{text-align:center;font-size:11.5px;font-weight:700;color:#c084fc;margin-top:14px}
.spinner{display:inline-block;width:12px;height:12px;border:2px solid #c084fc;border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite;margin-right:6px;vertical-align:middle}
@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
</style>
</head>
<body>
<div class="wrapper">
  <div class="step-tag" id="stepTag">Paso 01</div>
  <h1 id="mainTitle">Vincula tu subbot</h1>
  <p class="sub" id="mainSub">Ingresa tu número para generar el código de emparejamiento temporal.</p>

  <div id="inputView">
    <div class="form-group">
      <div class="label">Número de WhatsApp</div>
      <div class="input-row">
        <input type="tel" id="phoneInput" placeholder="Ej: 573118353868">
      </div>
    </div>
    <button class="action-btn" onclick="requestCode()">Solicitar Código</button>
  </div>

  <div id="codeView" style="display:none">
    <div class="code-container" id="codeBox" style="display:block">
      <div class="code-value" id="codeDisplay">----</div>
    </div>
    <a id="waLink" href="#" class="copy-whatsapp-btn" target="_blank">Copiar y abrir WhatsApp</a>

    <div class="steps-list">
      <div class="step-item"><div class="step-num">1</div><div>Abre WhatsApp en tu teléfono.</div></div>
      <div class="step-item"><div class="step-num">2</div><div>Entra en <b>Dispositivos vinculados</b>.</div></div>
      <div class="step-item"><div class="step-num">3</div><div>Toca vincular con número de teléfono e ingresa el código.</div></div>
    </div>
  </div>

  <div class="status-box" id="statusText" style="display:none"><span class="spinner"></span> Esperando confirmación de WhatsApp...</div>
</div>

<script>
const SID = "${sessionId}";
let pollTimer = null;

async function requestCode() {
  const phone = document.getElementById('phoneInput').value.trim();
  if(!phone || phone.length < 8) {
    alert("Ingresa un número válido.");
    return;
  }
  
  const btn = document.querySelector('.action-btn');
  btn.disabled = true;
  btn.textContent = "Preparando...";

  try {
    const res = await fetch('/api/request/' + SID, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone })
    });
    const json = await res.json();
    if(json.ok) {
      document.getElementById('stepTag').textContent = "Paso 02";
      document.getElementById('mainTitle').textContent = "Tu Código Temporal";
      document.getElementById('mainSub').textContent = "Copia el código e ingrésalo en WhatsApp.";
      document.getElementById('inputView').style.display = 'none';
      document.getElementById('codeView').style.display = 'block';
      document.getElementById('statusText').style.display = 'block';
      startPolling();
    } else {
      alert(json.error || "Error al solicitar.");
      btn.disabled = false;
      btn.textContent = "Solicitar Código";
    }
  } catch(e) {
    alert("Error de conexión con el servidor.");
    btn.disabled = false;
    btn.textContent = "Solicitar Código";
  }
}

function startPolling() {
  pollTimer = setInterval(async () => {
    try {
      const res = await fetch('/api/status/' + SID);
      const json = await res.json();
      if(!json.ok) {
        clearInterval(pollTimer);
        document.getElementById('statusText').innerHTML = "❌ " + (json.error || "Enlace expirado.");
        return;
      }
      if(json.status === 'ready' && json.code) {
        document.getElementById('codeDisplay').textContent = json.code;
        document.getElementById('waLink').href = "https://wa.me/?text=" + encodeURIComponent(json.code);
      }
      if(json.status === 'connected') {
        clearInterval(pollTimer);
        document.getElementById('statusText').innerHTML = "✅ ¡Vinculado con éxito! Ya puedes cerrar esta página.";
        document.getElementById('codeDisplay').style.color = "#4ade80";
      }
      if(json.status === 'error') {
        clearInterval(pollTimer);
        document.getElementById('statusText').innerHTML = "❌ Error: " + (json.error || "Desconocido");
      }
    } catch(e) {}
  }, 2000);
}
</script>
</body>
</html>`);
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not Found");
  });

  server.listen(PORT, () => {
    console.log(`[pairing-web] Servidor de vinculación activo en puerto ${PORT}`);
  });
  setInterval(sweepSessions, 60 * 1000).unref?.();
}

export default {
  name: ["code", "pairingcode", "vincularcode"],
  description: "Genera un enlace web desechable neón para vincular tu subbot.",
  category: "socket",
  cooldown: 15000,
  ownerOnly: false,

  async run({ reply }: CommandContext) {
    startPairingServer();

    const sessionId = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "").slice(0, 16);
    const createdAt = Date.now();
    const TTL = 3 * 60 * 1000;

    const session: PairingSession = {
      id: sessionId,
      code: null,
      status: "waiting",
      createdAt,
      timer: setTimeout(() => {
        pairingSessions.delete(sessionId);
      }, TTL),
    };
    pairingSessions.set(sessionId, session);

    // Extracción inteligente del dominio público activo (igual que .webpanel)
    const G_TUNNEL = G.__locTunnel;
    let baseUrl = process.env.WEB_PANEL_URL || process.env.LOCATE_BASE_URL || G_TUNNEL?.url || "";
    
    if (!baseUrl) {
      // Intenta autodetectar desde las cabeceras o usa ngrok/localtunnel si está registrado globalmente
      baseUrl = G.__publicUrl || `http://localhost:${PORT}`;
    }
    baseUrl = baseUrl.replace(/\/+$/, "");
    const pairingUrl = `${baseUrl}/pair/${sessionId}`;

    const text = 
      `🟣 *SISTEMA DE VINCULACIÓN NEÓN* 🟣\n\n` +
      `Se ha generado un enlace web desechable y seguro para vincular tu subbot.\n\n` +
      `🔗 *Enlace de acceso:* \n${pairingUrl}\n\n` +
      `⏳ *Expira en:* 3 minutos (Enlace de un solo uso / Autodestrucción)`;

    await reply({ text });
  },
};
