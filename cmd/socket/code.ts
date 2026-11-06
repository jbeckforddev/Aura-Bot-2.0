import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { requestSubBotLink } from "../../connection/subbotManager.ts";
import { IS_SUBBOT_ONLINE } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";
import type { CommandContext } from "../../types/index.d.ts";

/* ───────────────────────── Servidor Web Desechable de Vinculación ───────────────────────── */
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
  const TTL = 3 * 60 * 1000; // 3 minutos de duración por enlace desechable
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

    // Ruta de estado para la interfaz web (Polling)
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

    // Ruta para solicitar el código de vinculación desde la web
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
        res.end(JSON.stringify({ ok: false, error: "Número de teléfono inválido." }));
        return;
      }

      session.status = "generating";

      // Disparar la vinculación de Baileys
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
          // Quemar sesión tras éxito
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

    // Interfaz Web Interactiva (Diseño Morado Neón Profundo estilo IDKBOT)
    const pageMatch = pathname.match(/^\/pair\/([A-Za-z0-9]{20,40})$/);
    if (pageMatch) {
      const sessionId = pageMatch[1];
      const session = pairingSessions.get(sessionId);
      if (!session) {
        res.writeHead(410, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"><title>Enlace Expirado</title><style>body{background:#04020a;color:#e9d5ff;font-family:sans-serif;text-align:center;padding-top:50px}</style></head><body><h1>❌ Enlace Desechable Expirado</h1><p>Este enlace ya fue quemado o superó su tiempo de vida.</p></body></html>`);
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Vinculación Neón // LuferOS</title>
<style>
*{box-sizing:border-box;margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}
body{background:#06030f;color:#f3e8ff;padding:16px;display:flex;justify-content:center;align-items:center;min-height:100vh;overflow-x:hidden}
.container{width:100%;max-width:400px;background:linear-gradient(165deg,#130826,#080314);border:1.5px solid #6b21a8;border-radius:20px;padding:24px;box-shadow:0 0 40px rgba(147,51,234,0.25),inset 0 0 20px rgba(147,51,234,0.1);position:relative}
.header{text-align:center;margin-bottom:20px}
.header h1{font-size:20px;font-weight:900;color:#c084fc;letter-spacing:1px;text-transform:uppercase;text-shadow:0 0 10px rgba(192,132,252,0.5)}
.header p{font-size:12px;color:#a78bfa;margin-top:4px}
.step-box{background:#0f051d;border:1px solid #3b0764;border-radius:14px;padding:16px;margin-bottom:16px}
.label{font-size:11px;font-weight:800;color:#c084fc;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px}
.input-group{display:flex;gap:8px}
input{flex:1;background:#05020a;border:1px solid #581c87;color:#fff;padding:12px;border-radius:10px;font-size:15px;outline:none;transition:all .2s}
input:focus{border-color:#a855f7;box-shadow:0 0 12px rgba(168,85,247,0.4)}
.btn{background:linear-gradient(135deg,#9333ea,#7e22ce);color:#fff;border:none;padding:12px 18px;border-radius:10px;font-weight:900;cursor:pointer;font-size:13px;letter-spacing:.8px;text-transform:uppercase;box-shadow:0 4px 15px rgba(147,51,234,0.4);transition:transform .1s}
.btn:active{transform:scale(0.96)}
.code-display{background:#05020a;border:2px dashed #a855f7;border-radius:14px;padding:20px;text-align:center;margin-top:16px;display:none;box-shadow:inset 0 0 15px rgba(168,85,247,0.15)}
.code-text{font-size:26px;font-weight:900;color:#e9d5ff;letter-spacing:3px;font-family:'Courier New',monospace;text-shadow:0 0 12px rgba(233,213,255,0.6)}
.instructions{font-size:12px;color:#cbd5e1;line-height:1.5;margin-top:14px}
.instructions ol{padding-left:18px}
.instructions li{margin-bottom:6px}
.status-msg{text-align:center;font-size:12px;font-weight:700;color:#c084fc;margin-top:12px}
.loader{display:inline-block;width:14px;height:14px;border:2px solid #c084fc;border-top-color:transparent;border-radius:50%;animation:spin 0.8s linear infinite;margin-right:6px;vertical-align:middle}
@keyframes spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>⚡ Vinculación Neón</h1>
    <p>Sistema de Subbots Desechable</p>
  </div>

  <div class="step-box" id="phoneSection">
    <div class="label">Número de WhatsApp (con código de país)</div>
    <div class="input-group">
      <input type="tel" id="phoneInput" placeholder="Ej: 50612345678">
      <button class="btn" onclick="requestPairingCode()">Generar</button>
    </div>
  </div>

  <div class="step-box" id="codeSection" style="display:none">
    <div class="label">Tu Código de Vinculación</div>
    <div class="code-display" id="codeBox" style="display:block">
      <div class="code-text" id="codeValue">----</div>
    </div>
    <div class="instructions">
      <ol>
        <li>Abre WhatsApp en tu teléfono.</li>
        <li>Entra en <b>Dispositivos vinculados</b>.</li>
        <li>Toca <b>Vincular un dispositivo</b> y elige número de teléfono.</li>
        <li>Escribe el código mostrado arriba.</li>
      </ol>
    </div>
    <div class="status-msg" id="statusText"><span class="loader"></span> Esperando confirmación de WhatsApp...</div>
  </div>
</div>

<script>
const SID = "${sessionId}";
let pollInterval = null;

async function requestPairingCode() {
  const phone = document.getElementById('phoneInput').value.trim();
  if(!phone || phone.length < 8) {
    alert("Ingresa un número válido con código de país.");
    return;
  }
  
  document.querySelector('.btn').disabled = true;
  document.querySelector('.btn').textContent = "Conectando...";

  try {
    const res = await fetch('/api/request/' + SID, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone })
    });
    const data = await res.json();
    if(data.ok) {
      document.getElementById('phoneSection').style.display = 'none';
      document.getElementById('codeSection').style.display = 'block';
      startPolling();
    } else {
      alert(data.error || "Error al solicitar código.");
      document.querySelector('.btn').disabled = false;
      document.querySelector('.btn').textContent = "Generar";
    }
  } catch(e) {
    alert("Error de red.");
    document.querySelector('.btn').disabled = false;
    document.querySelector('.btn').textContent = "Generar";
  }
}

function startPolling() {
  pollInterval = setInterval(async () => {
    try {
      const res = await fetch('/api/status/' + SID);
      const data = await res.json();
      if(!data.ok) {
        clearInterval(pollInterval);
        document.getElementById('statusText').innerHTML = "❌ " + (data.error || "Enlace expirado.");
        return;
      }
      if(data.status === 'ready' && data.code) {
        document.getElementById('codeValue').textContent = data.code;
      }
      if(data.status === 'connected') {
        clearInterval(pollInterval);
        document.getElementById('statusText').innerHTML = "✅ ¡Vinculado con éxito! Ya puedes cerrar esta ventana.";
        document.getElementById('codeValue').style.color = "#4ade80";
      }
      if(data.status === 'error') {
        clearInterval(pollInterval);
        document.getElementById('statusText').innerHTML = "❌ Error: " + (data.error || "Desconocido");
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

/* ───────────────────────── Lógica del Comando .code ───────────────────────── */
export default {
  name: ["code", "pairingcode", "vincularcode"],
  description: "Genera un enlace web desechable neón para vincular tu subbot.",
  category: "socket",
  cooldown: 15000,
  ownerOnly: false,

  async run({ reply, sock }: CommandContext) {
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

    // Obtener la URL base del túnel activo (Cloudflare/LHR/Serveo)
    const G_TUNNEL = G.__locTunnel;
    let baseUrl = process.env.LOCATE_BASE_URL || G_TUNNEL?.url || "";
    
    if (!baseUrl) {
      // Fallback local si no hay túnel externo activo
      baseUrl = `http://localhost:${PORT}`;
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
