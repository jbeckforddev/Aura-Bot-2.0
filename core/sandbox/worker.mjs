import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';

const encoded = process.argv[2] || '';

const request = JSON.parse(
  Buffer.from(encoded, 'base64url').toString('utf8')
);

const root = process.cwd();
const commandName = String(
  request.command || ''
).toLowerCase();

const startedAt = Date.now();
const messages = [];

let completed = false;

function send(payload) {
  try {
    if (process.send) process.send(payload);
  } catch {}
}

function log(level, message) {
  const text = typeof message === 'string'
    ? message
    : safeString(message);

  send({
    type: 'log',
    level,
    message: text.slice(0, 4000),
  });
}

function safeString(value) {
  if (value instanceof Error) {
    return `${value.name}: ${value.message}\n${value.stack || ''}`;
  }

  try {
    return typeof value === 'string'
      ? value
      : JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function record(kind, content) {
  const text = typeof content === 'string'
    ? content
    : content?.text !== undefined
      ? String(content.text)
      : safeString(content);

  messages.push({
    kind,
    text: text.slice(0, 4000),
    at: new Date().toISOString(),
  });

  log('BOT-MOCK', `${kind}: ${text}`);
}

// La red se bloquea dentro del proceso de prueba.
// No se importa el socket real de Baileys.

function blockNetwork() {
  const denyFetch = async () => {
    throw new Error(
      'Sandbox: acceso de red bloqueado.'
    );
  };

  globalThis.fetch = denyFetch;

  if (globalThis.WebSocket) {
    try {
      globalThis.WebSocket = class {
        constructor() {
          throw new Error(
            'Sandbox: WebSocket bloqueado.'
          );
        }
      };
    } catch {}
  }
}

for (const name of [
  'http',
  'https',
  'net',
  'tls',
  'dgram',
  'child_process',
]) {
  try {
    const mod = await import(`node:${name}`);

    const deny = () => {
      throw new Error(
        `Sandbox: API ${name} bloqueada.`
      );
    };

    if (name === 'http' || name === 'https') {
      mod.default.request = deny;
      mod.default.get = deny;
    } else if (name === 'net') {
      mod.default.connect = deny;
      mod.default.createConnection = deny;
      mod.default.createServer = deny;
    } else if (name === 'tls') {
      mod.default.connect = deny;
    } else if (name === 'dgram') {
      mod.default.createSocket = deny;
    } else if (name === 'child_process') {
      for (const method of [
        'spawn',
        'spawnSync',
        'exec',
        'execSync',
        'execFile',
        'execFileSync',
        'fork',
      ]) {
        mod.default[method] = deny;
      }
    }

    syncBuiltinESMExports();
  } catch (error) {
    log(
      'WARN',
      `No se pudo aplicar un bloqueo de API: ${safeString(error)}`
    );
  }
}

function installConsoleCapture() {
  for (const level of [
    'log',
    'info',
    'warn',
    'error',
    'debug',
  ]) {
    console[level] = (...args) => {
      log(
        level.toUpperCase(),
        args.map(safeString).join(' ')
      );
    };
  }
}

function installFatalHandlers() {
  process.on('uncaughtException', (error) => {
    send({
      type: 'fatal',
      message: safeString(error),
    });

    process.exit(70);
  });

  process.on('unhandledRejection', (reason) => {
    send({
      type: 'fatal',
      message: `UnhandledRejection: ${safeString(reason)}`,
    });

    process.exit(71);
  });
}

async function walkTs(dir) {
  const files = [];

  const entries = await (
    await import('node:fs/promises')
  ).readdir(dir, {
    withFileTypes: true,
  });

  for (const entry of entries) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...await walkTs(full));
    } else if (
      entry.isFile() &&
      entry.name.endsWith('.ts')
    ) {
      files.push(full);
    }
  }

  return files;
}

async function findPluginFile(alias) {
  const require = (
    await import('node:module')
  ).createRequire(
    path.join(root, 'package.json')
  );

  const ts = require('typescript');
  const commandDir = path.join(root, 'cmd');
  const files = await walkTs(commandDir);

  for (const file of files) {
    const sourceText = await (
      await import('node:fs/promises')
    ).readFile(file, 'utf8');

    const source = ts.createSourceFile(
      file,
      sourceText,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    );

    let matched = false;

    const visit = (node) => {
      if (matched) return;

      if (ts.isObjectLiteralExpression(node)) {
        let hasRunner = false;
        let names = [];

        for (const property of node.properties) {
          const propertyName = property.name;

          const key = propertyName &&
            (
              ts.isIdentifier(propertyName) ||
              ts.isStringLiteral(propertyName)
            )
            ? propertyName.text
            : '';

          if (
            (
              ts.isMethodDeclaration(property) ||
              ts.isPropertyAssignment(property)
            ) &&
            (
              key === 'run' ||
              key === 'execute'
            )
          ) {
            hasRunner = true;
          }

          if (
            ts.isPropertyAssignment(property) &&
            key === 'name'
          ) {
            const initializer = property.initializer;

            if (ts.isStringLiteralLike(initializer)) {
              names.push(initializer.text);
            } else if (
              ts.isArrayLiteralExpression(initializer)
            ) {
              names.push(
                ...initializer.elements
                  .filter(ts.isStringLiteralLike)
                  .map((element) => element.text)
              );
            }
          }
        }

        if (
          hasRunner &&
          names.some(
            (name) => name.toLowerCase() === alias
          )
        ) {
          matched = true;
        }
      }

      if (!matched) {
        ts.forEachChild(node, visit);
      }
    };

    visit(source);

    if (matched) return file;
  }

  return null;
}

function makeSocketMock(from) {
  const target = {
    user: {
      id: 'sandbox@s.whatsapp.net',
      name: 'Aura Reed Sandbox',
    },
    isSubBot: false,
    botType: 'Principal',
  };

  return new Proxy(target, {
    get(object, property) {
      if (property in object) {
        return object[property];
      }

      if (property === 'sendMessage') {
        return async (jid, content) => {
          record('sendMessage', content);

          return {
            key: {
              remoteJid: jid || from,
              id: `SANDBOX-${Date.now()}`,
            },
          };
        };
      }

      if (property === 'groupMetadata') {
        return async () => ({
          id: from,
          subject: 'Sandbox Group',
          participants: [],
        });
      }

      if (
        property === 'on' ||
        property === 'ev' ||
        property === 'ws'
      ) {
        return undefined;
      }

      return async (...args) => {
        log(
          'SOCKET-MOCK',
          `${String(property)}(${args.map(safeString).join(', ')})`
        );

        return undefined;
      };
    },
  });
}

async function main() {
  installFatalHandlers();
  installConsoleCapture();
  blockNetwork();

  log(
    'INFO',
    `Iniciando prueba aislada: ${commandName}`
  );

  log(
    'INFO',
    'Buscando archivo del comando en cmd/**/*.ts'
  );

  const pluginFile = await findPluginFile(commandName);

  if (!pluginFile) {
    throw new Error(
      `No se encontró un comando registrado con el alias: ${commandName}`
    );
  }

  log(
    'INFO',
    `Comando localizado: ${path.relative(root, pluginFile)}`
  );

  const databaseModule = await import(
    pathToFileURL(
      path.join(root, 'database', 'AuraDB.ts')
    ).href
  );

  const pluginModule = await import(
    pathToFileURL(pluginFile).href
  );

  const plugin = pluginModule.default;

  if (
    !plugin ||
    typeof plugin.run !== 'function'
  ) {
    throw new Error(
      'El módulo no exporta un comando válido mediante default.run(ctx).'
    );
  }

  const from = '525000000000@s.whatsapp.net';

  const args = Array.isArray(request.args)
    ? request.args
    : [];

  const text = args.join(' ');

  const body =
    `.${commandName}${text ? ` ${text}` : ''}`;

  const fakeMsg = {
    key: {
      remoteJid: from,
      participant: from,
      id: 'AURA-SANDBOX-MESSAGE',
      fromMe: false,
    },

    message: {
      conversation: body,
    },

    pushName: 'Sandbox Test',
    messageTimestamp: Math.floor(Date.now() / 1000),
  };

  const sock = makeSocketMock(from);
  const db = databaseModule.db;

  const ctx = {
    sock,
    db,
    msg: fakeMsg,
    receivedAt: Date.now(),
    from,
    sender: from,
    senderNum: from.split('@')[0],
    botJid: from,
    botLabel: 'AURA REED SANDBOX',
    mainBotNum: from.split('@')[0],
    activeBotsLive: [],
    isGroup: false,
    groupName: '',
    groupMeta: null,
    body,
    isCmd: true,
    cmdName: commandName,
    args,
    text,
    rawText: text,
    usedPrefix: '.',
    modPrefix: '',
    isOwner: true,
    isCoOwner: false,
    isMod: true,
    isPremium: true,
    isAdmin: true,
    isBotAdmin: true,
    isBotUser: true,
    prefix: '.',

    resolveLid: async (jid) => jid,

    clearGroupCache: () => true,
    clearGROUP_METADATA_CACHE: () => true,

    reply: async (content) => {
      record('reply', content);
      return undefined;
    },

    react: async (emoji) => {
      record('react', emoji);
      return undefined;
    },

    copy: async (...values) => {
      record('copy', values);
      return undefined;
    },

    buttons: async (...values) => {
      record('buttons', values);
      return undefined;
    },

    options: async (...values) => {
      record('options', values);
      return undefined;
    },

    getPlugins: () => new Map([
      [commandName, plugin],
    ]),

    getPluginCategories: () =>
      plugin.category
        ? [String(plugin.category)]
        : [],
  };

  log(
    'INFO',
    `Ejecutando ${commandName} con contexto simulado.`
  );

  await plugin.run(ctx);

  completed = true;

  send({
    type: 'result',
    status: 'OK',
    durationMs: Date.now() - startedAt,
    messages,
  });
}

main()
  .catch((error) => {
    send({
      type: 'result',
      status: 'ERROR',
      durationMs: Date.now() - startedAt,
      messages,
      error: safeString(error),
    });

    process.exitCode = 1;
  })
  .finally(() => {
    if (completed) {
      log('INFO', 'Prueba finalizada.');
    }
  });