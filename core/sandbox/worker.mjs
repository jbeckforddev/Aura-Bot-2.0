import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";

const ROOT = process.cwd();
const TEST_DIR = path.join(ROOT, "test");

const pending = new Map();

function rpc(method, args = []) {
  return new Promise((resolve, reject) => {
    const id = randomUUID();

    pending.set(id, { resolve, reject });

    process.send({
      type: "rpc",
      id,
      method,
      args,
    });
  });
}

process.on("message", async (message) => {
  if (message?.type === "rpc-result") {
    const request = pending.get(message.id);
    if (!request) return;

    pending.delete(message.id);

    if (message.ok) {
      request.resolve(message.value);
    } else {
      request.reject(new Error(message.error));
    }

    return;
  }

  if (message?.type !== "start") return;

  try {
    const pluginFile = await findPlugin(message.command);

    if (!pluginFile) {
      throw new Error(
        `No existe el comando "${message.command}" dentro de test/.`
      );
    }

    const imported = await import(
      `${pathToFileURL(pluginFile).href}?test=${Date.now()}`
    );

    const plugin = imported.default;

    if (!plugin || typeof plugin.run !== "function") {
      throw new Error(
        "El archivo no exporta un comando válido."
      );
    }

    const original = message.context;

    const sock = {
      sendMessage: (...args) =>
        rpc("sock.sendMessage", args),
    };

    const ctx = {
      ...original,
      sock,

      reply: (...args) =>
        rpc("ctx.reply", args),

      react: (...args) =>
        rpc("ctx.react", args),

      resolveLid: (...args) =>
        rpc("ctx.resolveLid", args),

      copy: (...args) =>
        rpc("ctx.copy", args),

      buttons: (...args) =>
        rpc("ctx.buttons", args),

      options: (...args) =>
        rpc("ctx.options", args),

      db: undefined,

      activeBotsLive: [],

      clearGroupCache: () => true,

      getPlugins: () => new Map(),

      getPluginCategories: () => [],
    };

    await plugin.run(ctx);

    process.send({
      type: "result",
      ok: true,
      status: "OK",
      command: message.command,
      file: path.relative(ROOT, pluginFile),
    });

    process.exit(0);
  } catch (error) {
    process.send({
      type: "result",
      ok: false,
      status: "ERROR",
      error: error instanceof Error
        ? error.stack || error.message
        : String(error),
    });

    process.exit(1);
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