import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const KEY = crypto.createHash('sha256').update(await fs.realpath(ROOT)).digest('hex').slice(0, 16);
const STATE = path.join(os.homedir(), '.aura-reed-sandbox', KEY);
const ADDRESS = process.platform === 'win32'
  ? `\\\\.\\pipe\\aura-reed-sandbox-${KEY}`
  : path.join(STATE, 'sandbox.sock');
const SERVER = path.join(HERE, 'server.mjs');

let serverProcess;
let starting;

process.once('exit', () => {
  try {
    serverProcess?.kill();
  } catch {}
});

function connect(timeout = 350) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(ADDRESS);

    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error('Timeout de conexión'));
    }, timeout);

    socket.once('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });

    socket.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

async function ensureServer() {
  try {
    const socket = await connect();
    socket.destroy();
    return;
  } catch {}

  if (!starting) {
    starting = (async () => {
      await fs.mkdir(STATE, {
        recursive: true,
        mode: 0o700,
      });

      serverProcess = spawn(
        process.execPath,
        [SERVER, '--project', ROOT],
        {
          cwd: ROOT,
          env: process.env,
          stdio: 'ignore',
          windowsHide: true,
        }
      );

      serverProcess.once('exit', () => {
        serverProcess = undefined;
      });

      let lastError;

      for (let attempt = 0; attempt < 40; attempt++) {
        try {
          const socket = await connect(500);
          socket.destroy();
          return;
        } catch (error) {
          lastError = error;

          if (
            serverProcess?.exitCode !== null &&
            serverProcess?.exitCode !== undefined
          ) {
            break;
          }

          await new Promise((resolve) => setTimeout(resolve, 150));
        }
      }

      serverProcess?.kill();

      throw new Error(
        `No se pudo iniciar el proceso Sandbox: ${
          lastError?.message || 'sin respuesta'
        }`
      );
    })().finally(() => {
      starting = undefined;
    });
  }

  await starting;
}

export async function runSandbox(command, args = []) {
  await ensureServer();

  const socket = await connect(1500);

  return new Promise((resolve, reject) => {
    let buffer = '';
    let settled = false;
    const logs = [];

    const finish = (error, result) => {
      if (settled) return;

      settled = true;
      socket.destroy();

      if (error) reject(error);
      else resolve({ ...result, logs });
    };

    socket.setEncoding('utf8');

    socket.on('data', (chunk) => {
      buffer += chunk;

      if (buffer.length > 128_000) {
        return finish(
          new Error('Respuesta del Sandbox demasiado grande.')
        );
      }

      let newline;

      while ((newline = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);

        if (!line.trim()) continue;

        let message;

        try {
          message = JSON.parse(line);
        } catch {
          continue;
        }

        if (message.type === 'log') {
          logs.push({
            level: message.level,
            message: message.message,
          });
        } else if (message.type === 'result') {
          finish(null, message);
        }
      }
    });

    socket.once('error', (error) => finish(error));

    socket.once('close', () => {
      if (!settled) {
        finish(
          new Error(
            'El proceso Sandbox cerró el canal antes de responder.'
          )
        );
      }
    });

    socket.write(
      `${JSON.stringify({
        action: 'run',
        command,
        args,
      })}\n`
    );
  });
}