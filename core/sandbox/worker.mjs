import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";

import { encode, decode } from "./codec.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const TEST_DIR = path.join(ROOT, "test");

const pending = new Map();

let finished = false;

function finish(payload, exitCode = 0) {
  if (finished) return;

  finished = true;
  process.exitCode = exitCode;

  for (const request of pending.values()) {
    request.reject(
      new Error("El proceso Sandbox terminó.")
    );
  }

  pending.clear();

  if (!process.connected) return;

  process.send(payload, (error) => {
    if (error) process.exitCode = 1;

    if (process.connected) {
      process.disconnect();
    }
  });
}

function rpc(method, args = []) {
  return new Promise((resolve, reject) => {
    if (!process.connected || finished) {
      reject(new Error("El canal IPC no está disponible."));
      return;
    }

    const id = randomUUID();

    pending.set(id, { resolve, reject });

    try {
      process.send({
        type: "rpc",
        id,
        method,
        payload: encode(args),
      }, (error) => {
        if (!error) return;

        pending.delete(id);
        reject(error);
      });
    } catch (error) {
      pending.delete(id);
      reject(error);
    }
  });
}

function createDatabaseProxy(methods) {
  const allowed = new Set(methods);
  const target = Object.create(null);

  return new Proxy(target, {
    get(_target, property) {
      if (property === "then") return undefined;

      if (property === Symbol.toStringTag) {
        return "AuraDatabaseProxy";
      }

      if (typeof property !== "string") {
        return undefined;
      }

      if (!allowed.has(property)) {
        return undefined;
      }

      return (...args) =>
        rpc(`db.${property}`, args);
    },

    set() {
      return false;
    },

    has(_target, property) {
      return allowed.has(property);
    },

    ownKeys() {
      return [...allowed];
    },

    getOwnPropertyDescriptor(_target, property) {
      if (!allowed.has(property)) return undefined;

      return {
        configurable: true,
        enumerable: true,
        writable: false,
      };
    },
  });
}

process.on("disconnect", () => {
  for (const request of pending.values()) {
    request.reject(
      new Error("Se perdió la conexión con el proceso principal.")
    );
  }

  pending.clear();
});

process.on("message", async (message) => {
  if (message?.type === "rpc-result") {
    const request = pending.get(message.id);

    if (!request) return;

    pending.delete(message.id);

    if (message.ok) {
      try {
        request.resolve(decode(message.payload));
      } catch (error) {
        request.reject(error);
      }
    } else {
      request.reject(
        new Error(message.error || "Error en operación RPC.")
      );
    }

    return;
  }

  if (message?.type !== "start" || finished) return;

  try {
    const start = decode(message.payload);

    const {
      command,
      args,
      context,
      dbMethods,
    } = start;

    const pluginFile = await findPlugin(command);

    if (!pluginFile) {
      throw new Error(
        `No existe el comando "${command}" dentro de test/.`
      );
    }

    const imported = await import(
      `${pathToFileURL(pluginFile).href}?test=${Date.now()}`
    );

    const plugin = imported.default;

    if (!plugin || typeof plugin.run !== "function") {
      throw new Error(
        "El archivo no exporta un comando válido mediante default.run(ctx)."
      );
    }

    const sock = {
      sendMessage: (...rpcArgs) =>
        rpc("sock.sendMessage", rpcArgs),
    };

    const ctx = {
      ...context,

      args,
      sock,

      db: createDatabaseProxy(dbMethods),

      reply: (...rpcArgs) =>
        rpc("ctx.reply", rpcArgs),

      react: (...rpcArgs) =>
        rpc("ctx.react", rpcArgs),

      resolveLid: (...rpcArgs) =>
        rpc("ctx.resolveLid", rpcArgs),

      copy: (...rpcArgs) =>
        rpc("ctx.copy", rpcArgs),

      buttons: (...rpcArgs) =>
        rpc("ctx.buttons", rpcArgs),

      options: (...rpcArgs) =>
        rpc("ctx.options", rpcArgs),

      activeBotsLive: [],

      clearGroupCache: () => true,

      getPlugins: () => new Map(),

      getPluginCategories: () => [],
    };

    await plugin.run(ctx);

    finish({
      type: "result",
      ok: true,
      status: "OK",
      command,
      file: path.relative(ROOT, pluginFile),
    });
  } catch (error) {
    finish({
      type: "result",
      ok: false,
      status: "ERROR",
      error: error instanceof Error
        ? error.stack || error.message
        : String(error),
    }, 1);
  }
});

async function findPlugin(alias) {
  const files = await getTypeScriptFiles(TEST_DIR);

  for (const file of files) {
    const imported = await import(
      `${pathToFileURL(file).href}?lookup=${Date.now()}`
    );

    const plugin = imported.default;

    if (!plugin) continue;

    const names = Array.isArray(plugin.name)
      ? plugin.name
      : [plugin.name];

    if (
      names.some(
        (name) =>
          typeof name === "string" &&
          name.toLowerCase() === alias
      )
    ) {
      return file;
    }
  }

  return null;
}

async function getTypeScriptFiles(directory) {
  const files = [];

  const entries = await fs.readdir(directory, {
    withFileTypes: true,
  });

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (entry.name.startsWith(".")) continue;

      files.push(
        ...await getTypeScriptFiles(fullPath)
      );
    } else if (
      entry.isFile() &&
      entry.name.endsWith(".ts")
    ) {
      files.push(fullPath);
    }
  }

  return files;
}