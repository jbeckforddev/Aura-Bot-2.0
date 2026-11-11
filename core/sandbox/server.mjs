#!/usr/bin/env node

import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { fork } from 'node:child_process';

const KIT_DIR = path.dirname(fileURLToPath(import.meta.url));

const MAX_HISTORY = 10;
const MAX_LOG_CHARS = 24_000;
const MAX_RUN_MS = 20_000;
const MAX_HEAP_MB = 192;
const MAX_PARALLEL = 1;

function parseArgs(argv) {
  let project = process.cwd();
  let timeout = MAX_RUN_MS;
  const rest = [];

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--project' && argv[i + 1]) {
      project = path.resolve(argv[++i]);
    } else if (argv[i] === '--timeout' && argv[i + 1]) {
      timeout = Math.min(
        120_000,
        Math.max(1000, Number(argv[++i]) || MAX_RUN_MS)
      );
    } else {
      rest.push(argv[i]);
    }
  }

  return { project, timeout, rest };
}

const parsed = parseArgs(process.argv.slice(2));
const PROJECT_ROOT = parsed.project;
const PACKAGE_FILE = path.join(PROJECT_ROOT, 'package.json');
const NODE_MODULES = path.join(PROJECT_ROOT, 'node_modules');

if (
  !fs.existsSync(PACKAGE_FILE) ||
  !fs.existsSync(NODE_MODULES)
) {
  console.error(
    'No se encontró package.json o node_modules en --project.'
  );
  process.exit(1);
}

const projectReal = await fsp.realpath(PROJECT_ROOT);
const modulesReal = await fsp.realpath(NODE_MODULES);

const key = crypto
  .createHash('sha256')
  .update(projectReal)
  .digest('hex')
  .slice(0, 16);

const stateDir = path.join(
  os.homedir(),
  '.aura-reed-sandbox',
  key
);

await fsp.mkdir(stateDir, {
  recursive: true,
  mode: 0o700,
});

if (process.platform !== 'win32') {
  await fsp.chmod(stateDir, 0o700).catch(() => {});
}

const historyFile = path.join(stateDir, 'history.json');

const socketAddress = process.platform === 'win32'
  ? `\\\\.\\pipe\\aura-reed-sandbox-${key}`
  : path.join(stateDir, 'sandbox.sock');

let active = null;
let history = [];

try {
  history = JSON.parse(
    await fsp.readFile(historyFile, 'utf8')
  );

  if (!Array.isArray(history)) history = [];
} catch {}

async function saveHistory(item) {
  history.unshift(item);
  history = history.slice(0, MAX_HISTORY);

  await fsp.writeFile(
    historyFile,
    JSON.stringify(history, null, 2),
    'utf8'
  );
}

function send(socket, payload) {
  if (!socket.destroyed) {
    socket.write(`${JSON.stringify(payload)}\n`);
  }
}

function safeName(value) {
  return String(value ?? '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 64) || 'test';
}

async function copyProjectToWorkspace(workspace) {
  const destination = path.join(workspace, 'project');

  const excluded = new Set([
    'node_modules',
    '.git',
    '.github',
    'data',
    'sessions',
    'cache',
    'dist',
    '.aura-sandbox',
    '.sandbox',
    'coverage',
    'logs',
    'tmp',
    'temp',
  ]);

  await fsp.cp(PROJECT_ROOT, destination, {
    recursive: true,
    force: true,
    dereference: false,

    filter(source) {
      const relative = path.relative(
        PROJECT_ROOT,
        source
      );

      if (!relative) return true;

      const parts = relative.split(path.sep);

      if (
        parts.some((part) => excluded.has(part))
      ) {
        return false;
      }

      const base = path.basename(source);

      if (/^\.env(?:\.|$)/i.test(base)) {
        return false;
      }

      if (
        /\.(?:db|sqlite|sqlite3|session|pem|key)$/i.test(base)
      ) {
        return false;
      }

      if (
        /^(?:auth_info_baileys|creds\.json)$/i.test(base)
      ) {
        return false;
      }

      return true;
    },
  });

  const targetModules = path.join(
    destination,
    'node_modules'
  );

  await fsp.symlink(
    NODE_MODULES,
    targetModules,
    process.platform === 'win32' ? 'junction' : 'dir'
  );

  return destination;
}

function buildChildEnv(workspace) {
  const allowed = [
    'PATH',
    'HOME',
    'USERPROFILE',
    'TMP',
    'TEMP',
    'TMPDIR',
    'LANG',
    'LC_ALL',
    'TZ',
    'SystemRoot',
    'WINDIR',
    'LD_LIBRARY_PATH',
  ];

  const env = {
    NODE_ENV: 'test',
    AURA_SANDBOX: '1',
    GLOBAL_CUSTOM_TMP: path.join(workspace, 'cache'),
  };

  for (const name of allowed) {
    if (process.env[name]) {
      env[name] = process.env[name];
    }
  }

  return env;
}

function permissionArgs(workspace) {
  return [
    '--permission',
    `--allow-fs-read=${workspace}`,
    `--allow-fs-read=${modulesReal}`,
    `--allow-fs-read=${KIT_DIR}`,
    `--allow-fs-write=${workspace}`,
    '--allow-addons',
    '--max-old-space-size=' + MAX_HEAP_MB,
  ];
}

function appendLimited(current, text) {
  const next = current + String(text);

  return next.length > MAX_LOG_CHARS
    ? next.slice(-MAX_LOG_CHARS)
    : next;
}

function startRun(request, socket, timeoutMs) {
  if (active) {
    send(socket, {
      type: 'result',
      ok: false,
      status: 'BUSY',
      message: 'Ya existe una prueba activa.',
    });

    return;
  }

  const command = String(
    request.command ?? ''
  ).trim().toLowerCase();

  if (!/^[a-z0-9_-]{1,64}$/.test(command)) {
    send(socket, {
      type: 'result',
      ok: false,
      status: 'INVALID',
      message: 'Nombre de comando no válido.',
    });

    return;
  }

  const args = Array.isArray(request.args)
    ? request.args.map((value) => String(value).slice(0, 500))
    : [];

  if (args.length > 30) {
    send(socket, {
      type: 'result',
      ok: false,
      status: 'INVALID',
      message: 'Máximo 30 argumentos.',
    });

    return;
  }

  void (async () => {
    const id = crypto.randomUUID();
    const startedAt = Date.now();

    const workspace = await fsp.mkdtemp(
      path.join(os.tmpdir(), 'aura-reed-sandbox-')
    );

    let projectCopy;

    try {
      projectCopy = await copyProjectToWorkspace(workspace);

      const workerFile = path.join(
        KIT_DIR,
        'worker.mjs'
      );

      const requestForWorker = {
        id,
        command,
        args,
        workspace: projectCopy,
      };

      const child = fork(
        workerFile,
        [
          Buffer.from(
            JSON.stringify(requestForWorker)
          ).toString('base64url'),
        ],
        {
          cwd: projectCopy,
          execPath: process.execPath,

          execArgv: [
            '--import=tsx',
            ...permissionArgs(projectCopy),
          ],

          env: buildChildEnv(projectCopy),

          stdio: [
            'ignore',
            'pipe',
            'pipe',
            'ipc',
          ],

          serialization: 'advanced',
        }
      );

      const state = {
        id,
        command,
        child,
        socket,
        workspace,
        startedAt,
        output: '',
        result: null,
        timedOut: false,
        cancelled: false,
        timeout: null,
        killTimeout: null,
      };

      active = state;

      const log = (level, message) => {
        const line = `[${level}] ${String(message)}`;

        state.output = appendLimited(
          state.output,
          line + '\n'
        );

        send(socket, {
          type: 'log',
          id,
          level,
          message: String(message).slice(0, 4000),
        });
      };

      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');

      child.stdout.on('data', (chunk) => {
        log('STDOUT', chunk);
      });

      child.stderr.on('data', (chunk) => {
        log('STDERR', chunk);
      });

      child.on('message', (message) => {
        if (!message || typeof message !== 'object') {
          return;
        }

        if (message.type === 'log') {
          log(
            message.level || 'INFO',
            message.message || ''
          );
        } else if (message.type === 'result') {
          state.result = message;
        } else if (message.type === 'fatal') {
          log(
            'FATAL',
            message.message || 'Error fatal'
          );
        }
      });

      state.timeout = setTimeout(() => {
        if (active !== state) return;

        state.timedOut = true;

        log(
          'ERROR',
          `Tiempo máximo excedido (${timeoutMs} ms).`
        );

        child.kill('SIGTERM');

        state.killTimeout = setTimeout(
          () => child.kill('SIGKILL'),
          800
        );
      }, timeoutMs);

      state.timeout.unref?.();

      child.on('error', (error) => {
        log(
          'ERROR',
          `No se pudo iniciar el proceso: ${error.message}`
        );
      });

      child.on('close', async (code, signal) => {
        clearTimeout(state.timeout);
        clearTimeout(state.killTimeout);

        const durationMs = Date.now() - startedAt;

        let status;

        if (state.cancelled) {
          status = 'CANCELLED';
        } else if (state.timedOut) {
          status = 'TIMEOUT';
        } else if (
          state.result?.status === 'OK' &&
          code === 0
        ) {
          status = 'OK';
        } else if (state.result?.status === 'ERROR') {
          status = 'ERROR';
        } else if (
          state.result?.status === 'FATAL' ||
          code !== 0 ||
          signal
        ) {
          status = 'CRASHED';
        } else {
          status = 'CLOSED_EARLY';
        }

        const summary = {
          id,
          command,
          args,
          status,
          exitCode: code,
          signal: signal || null,
          durationMs,
          processMain: 'UNTOUCHED',
          output: state.output,
          messages: state.result?.messages || [],
          error: state.result?.error || null,
          finishedAt: new Date().toISOString(),
        };

        await saveHistory(summary).catch(() => {});

        active = null;

        await fsp.rm(
          workspace,
          {
            recursive: true,
            force: true,
          }
        ).catch(() => {});

        send(socket, {
          type: 'result',
          ok: status === 'OK',
          ...summary,
        });
      });
    } catch (error) {
      await fsp.rm(
        workspace,
        {
          recursive: true,
          force: true,
        }
      ).catch(() => {});

      send(socket, {
        type: 'result',
        ok: false,
        status: 'SETUP_ERROR',
        message: error instanceof Error
          ? error.message
          : String(error),
      });
    }
  })();
}

const server = net.createServer((socket) => {
  socket.setEncoding('utf8');

  let buffer = '';

  socket.on('data', (chunk) => {
    buffer += chunk;

    if (buffer.length > 64_000) {
      send(socket, {
        type: 'result',
        ok: false,
        status: 'INVALID',
        message: 'Solicitud demasiado grande.',
      });

      socket.destroy();
      return;
    }

    let newline;

    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);

      if (!line.trim()) continue;

      let request;

      try {
        request = JSON.parse(line);
      } catch {
        send(socket, {
          type: 'result',
          ok: false,
          status: 'INVALID',
          message: 'JSON inválido.',
        });

        continue;
      }

      switch (request.action) {
        case 'run':
          startRun(request, socket, parsed.timeout);
          break;

        case 'status':
          send(
            socket,
            active
              ? {
                  type: 'result',
                  ok: true,
                  status: 'RUNNING',
                  id: active.id,
                  command: active.command,
                  elapsedMs: Date.now() - active.startedAt,
                }
              : {
                  type: 'result',
                  ok: true,
                  status: 'IDLE',
                }
          );
          break;

        case 'logs':
          send(socket, {
            type: 'result',
            ok: true,
            status: 'LOGS',
            logs: history,
          });
          break;

        case 'stop':
          if (!active) {
            send(socket, {
              type: 'result',
              ok: true,
              status: 'IDLE',
              message: 'No hay pruebas activas.',
            });
          } else {
            active.cancelled = true;
            active.child.kill('SIGTERM');

            active.killTimeout = setTimeout(
              () => active?.child.kill('SIGKILL'),
              800
            );

            send(socket, {
              type: 'result',
              ok: true,
              status: 'STOPPING',
              id: active.id,
            });
          }
          break;

        case 'shutdown':
          send(socket, {
            type: 'result',
            ok: true,
            status: 'SHUTTING_DOWN',
          });

          if (active) {
            active.cancelled = true;
            active.child.kill('SIGTERM');
          }

          setTimeout(() => process.exit(0), 150);
          break;

        default:
          send(socket, {
            type: 'result',
            ok: false,
            status: 'INVALID',
            message: 'Acción desconocida.',
          });
      }
    }
  });
});

if (process.platform !== 'win32') {
  await fsp.rm(socketAddress, { force: true }).catch(() => {});
}

server.listen(socketAddress, async () => {
  if (process.platform !== 'win32') {
    await fsp.chmod(socketAddress, 0o600).catch(() => {});
  }

  console.log('Aura Reed Sandbox activo.');
  console.log(`Proyecto: ${projectReal}`);
  console.log(`Canal local: ${socketAddress}`);
  console.log(
    `Límite: ${parsed.timeout} ms · ${MAX_HEAP_MB} MB · concurrencia ${MAX_PARALLEL}`
  );
});

function shutdown() {
  if (active) {
    active.cancelled = true;
    active.child.kill('SIGTERM');

    const child = active.child;

    const forceTimer = setTimeout(
      () => child.kill('SIGKILL'),
      800
    );

    forceTimer.unref?.();
  }

  server.close();

  if (process.platform !== 'win32') {
    void fsp.rm(socketAddress, { force: true });
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);