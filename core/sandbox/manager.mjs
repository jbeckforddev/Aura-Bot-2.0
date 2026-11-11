import { fork } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { db } from "../../database/AuraDB.ts";
import { encode, decode } from "./codec.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "../..");
const WORKER = path.join(HERE, "worker.mjs");

const TIMEOUT = 30_000;
const MAX_STDERR = 8000;

const DB_METHODS = new Set(
  Object.keys(db).filter(
    (name) => typeof db[name] === "function"
  )
);

const CONTEXT_METHODS = new Set([
  "sock.sendMessage",
  "ctx.reply",
  "ctx.react",
  "ctx.resolveLid",
  "ctx.copy",
  "ctx.buttons",
  "ctx.options",
]);

function send(child, message) {
  return new Promise((resolve, reject) => {
    if (!child.connected) {
      reject(new Error("El canal IPC no está disponible."));
      return;
    }

    try {
      child.send(message, (error) => {
        if (error) reject(error);
        else resolve();
      });
    } catch (error) {
      reject(error);
    }
  });
}

function getErrorMessage(error) {
  return error instanceof Error
    ? error.stack || error.message
    : String(error);
}

export function runSandbox(command, args, ctx) {
  return new Promise((resolve, reject) => {
    const child = fork(WORKER, [], {
      cwd: ROOT,
      execArgv: ["--import=tsx"],
      stdio: ["ignore", "ignore", "pipe", "ipc"],
      serialization: "advanced",

      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "",
        TMPDIR: process.env.TMPDIR ?? "",
        NODE_ENV: "test",
        AURA_SANDBOX: "1",
      },
    });

    let finished = false;
    let stderr = "";

    const timer = setTimeout(() => {
      finish(new Error("Tiempo máximo de ejecución excedido."));
      child.kill("SIGKILL");
    }, TIMEOUT);

    child.stderr?.setEncoding("utf8");

    child.stderr?.on("data", (chunk) => {
      stderr = (stderr + chunk).slice(-MAX_STDERR);
    });

    function finish(error, result) {
      if (finished) return;

      finished = true;
      clearTimeout(timer);

      if (error) {
        reject(error);

        if (child.connected) {
          try {
            child.disconnect();
          } catch {}
        }
      } else {
        resolve(result);
      }
    }

    async function sendRpcError(id, error) {
      if (!child.connected || finished) return;

      try {
        await send(child, {
          type: "rpc-result",
          id,
          ok: false,
          error: getErrorMessage(error),
        });
      } catch {}
    }

    async function sendRpcSuccess(id, value) {
      if (!child.connected || finished) return;

      try {
        await send(child, {
          type: "rpc-result",
          id,
          ok: true,
          payload: encode(value),
        });
      } catch (error) {
        await sendRpcError(
          id,
          new Error(
            `No se pudo serializar el resultado RPC: ${getErrorMessage(error)}`
          )
        );
      }
    }

    async function handleRpc(message) {
      const { id, method } = message;

      try {
        if (typeof id !== "string" || typeof method !== "string") {
          throw new Error("Solicitud RPC no válida.");
        }

        const rpcArgs = decode(message.payload);

        if (!Array.isArray(rpcArgs)) {
          throw new Error("Los argumentos RPC deben ser un arreglo.");
        }

        let value;

        if (method.startsWith("db.")) {
          const dbMethod = method.slice(3);

          if (!DB_METHODS.has(dbMethod)) {
            throw new Error(
              `Método de base de datos no permitido: ${dbMethod}`
            );
          }

          const operation = db[dbMethod];

          value = await Reflect.apply(
            operation,
            db,
            rpcArgs
          );
        } else {
          if (!CONTEXT_METHODS.has(method)) {
            throw new Error(
              `Operación RPC no permitida: ${method}`
            );
          }

          switch (method) {
            case "sock.sendMessage":
              value = await ctx.sock.sendMessage(...rpcArgs);
              break;

            case "ctx.reply":
              value = await ctx.reply(...rpcArgs);
              break;

            case "ctx.react":
              value = await ctx.react(...rpcArgs);
              break;

            case "ctx.resolveLid":
              value = await ctx.resolveLid(...rpcArgs);
              break;

            case "ctx.copy":
              value = await ctx.copy(...rpcArgs);
              break;

            case "ctx.buttons":
              value = await ctx.buttons(...rpcArgs);
              break;

            case "ctx.options":
              value = await ctx.options(...rpcArgs);
              break;
          }
        }

        await sendRpcSuccess(id, value);
      } catch (error) {
        await sendRpcError(id, error);
      }
    }

    child.on("message", async (message) => {
      if (!message || typeof message !== "object") return;

      if (message.type === "rpc") {
        await handleRpc(message);
        return;
      }

      if (message.type === "result") {
        finish(null, message);
      }
    });

    child.once("error", (error) => {
      finish(error);
      child.kill("SIGKILL");
    });

    child.once("close", (code, signal) => {
      if (finished) return;

      finish(
        new Error(
          [
            "El proceso Sandbox terminó sin devolver un resultado.",
            `Código: ${code}`,
            `Señal: ${signal || "ninguna"}`,
            stderr ? `Salida interna:\n${stderr}` : "",
          ].filter(Boolean).join("\n")
        )
      );
    });

    const context = {
      msg: ctx.msg,
      from: ctx.from,
      sender: ctx.sender,
      senderNum: ctx.senderNum,
      botJid: ctx.botJid,
      botLabel: ctx.botLabel,
      mainBotNum: ctx.mainBotNum,
      isGroup: ctx.isGroup,
      groupName: ctx.groupName,
      groupMeta: ctx.groupMeta,
      body: ctx.body,
      isCmd: ctx.isCmd,
      cmdName: command,
      args,
      text: args.join(" "),
      rawText: args.join(" "),
      usedPrefix: ctx.usedPrefix,
      modPrefix: ctx.modPrefix,
      isOwner: ctx.isOwner,
      isCoOwner: ctx.isCoOwner,
      isMod: ctx.isMod,
      isPremium: ctx.isPremium,
      isAdmin: ctx.isAdmin,
      isBotAdmin: ctx.isBotAdmin,
      isBotUser: ctx.isBotUser,
      receivedAt: ctx.receivedAt,
      prefix: ctx.prefix,
    };

    try {
      const payload = encode({
        command,
        args,
        context,
        dbMethods: [...DB_METHODS],
      });

      send(child, {
        type: "start",
        payload,
      }).catch((error) => {
        finish(error);
        child.kill("SIGKILL");
      });
    } catch (error) {
      finish(error);
      child.kill("SIGKILL");
    }
  });
}