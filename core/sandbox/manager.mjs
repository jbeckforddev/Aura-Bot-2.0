import { fork } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { db } from "../../database/AuraDB.ts";
import { encode, decode } from "./codec.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORKER = path.join(HERE, "worker.mjs");

const TIMEOUT = 30_000;
const MAX_STDERR = 8000;

const DB_METHODS = new Set(
  Object.keys(db).filter(
    (method) => typeof db[method] === "function"
  )
);

function send(child, message) {
  return new Promise((resolve, reject) => {
    if (!child.connected) {
      reject(new Error("El canal IPC ya no está disponible."));
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

export function runSandbox(command, args, ctx) {
  return new Promise((resolve, reject) => {
    const child = fork(WORKER, [], {
      cwd: process.cwd(),
      execArgv: ["--import=tsx"],
      stdio: ["ignore", "ignore", "pipe", "ipc"],
      serialization: "advanced",
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        NODE_ENV: "test",
        AURA_SANDBOX: "1",
      },
    });

    let finished = false;
    let stderr = "";

    const timer = setTimeout(() => {
      finish(
        new Error("Tiempo máximo de ejecución excedido.")
      );

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
      } else {
        resolve(result);
      }

      if (child.connected) {
        try {
          child.disconnect();
        } catch {}
      }
    }

    async function sendRpcResult(id, value) {
      try {
        await send(child, {
          type: "rpc-result",
          id,
          ok: true,
          payload: encode(value),
        });
      } catch (error) {
        if (!child.connected || finished) return;

        try {
          await send(child, {
            type: "rpc-result",
            id,
            ok: false,
            error: error instanceof Error
              ? error.message
              : String(error),
          });
        } catch {}
      }
    }

    async function handleRpc(message) {
      const { id, method } = message;

      try {
        const args = decode(message.payload);

        if (!Array.isArray(args)) {
          throw new Error("Argumentos RPC no válidos.");
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
            args
          );
        } else {
          switch (method) {
            case "sock.sendMessage":
              value = await ctx.sock.sendMessage(...args);
              break;

            case "ctx.reply":
              value = await ctx.reply(...args);
              break;

            case "ctx.react":
              value = await ctx.react(...args);
              break;

            case "ctx.resolveLid":
              value = await ctx.resolveLid(...args);
              break;

            case "ctx.copy":
              value = await ctx.copy(...args);
              break;

            case "ctx.buttons":
              value = await ctx.buttons(...args);
              break;

            case "ctx.options":
              value = await ctx.options(...args);
              break;

            default:
              throw new Error(
                `Operación no permitida: ${method}`
              );
          }
        }

        await sendRpcResult(id, value);
      } catch (error) {
        if (!child.connected || finished) return;

        try {
          await send(child, {
            type: "rpc-result",
            id,
            ok: false,
            error: error instanceof Error
              ? error.stack || error.message
              : String(error),
          });
        } catch {}
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
    });

    child.once("close", (code, signal) => {
      if (!finished) {
        finish(
          new Error(
            [
              "El proceso Sandbox terminó sin devolver un resultado.",
              `Código: ${code}`,
              `Señal: ${signal || "ninguna"}`,
              stderr ? `Salida:\n${stderr}` : "",
            ].filter(Boolean).join("\n")
          )
        );
      }
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
      send(child, {
        type: "start",
        payload: encode({
          command,
          args,
          context,
          dbMethods: [...DB_METHODS],
        }),
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