
import { fork } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORKER = path.join(HERE, "worker.mjs");

const TIMEOUT = 30_000;
const MAX_STDERR = 8000;

export function runSandbox(command, args, ctx) {
  return new Promise((resolve, reject) => {
    const child = fork(WORKER, [], {
      cwd: process.cwd(),
      execArgv: ["--import=tsx"],
      stdio: ["ignore", "ignore", "pipe", "ipc"],
      serialization: "advanced",

      // Solo variables necesarias para iniciar el proceso.
      // No transmitir tokens ni credenciales del bot.
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

    child.on("message", async (message) => {
      if (!message || typeof message !== "object") return;

      if (message.type === "rpc") {
        try {
          let value;

          switch (message.method) {
            case "sock.sendMessage":
              value = await ctx.sock.sendMessage(
                ...message.args
              );
              break;

            case "ctx.reply":
              value = await ctx.reply(
                ...message.args
              );
              break;

            case "ctx.react":
              value = await ctx.react(
                ...message.args
              );
              break;

            case "ctx.resolveLid":
              value = await ctx.resolveLid(
                ...message.args
              );
              break;

            case "ctx.copy":
              value = await ctx.copy(
                ...message.args
              );
              break;

            case "ctx.buttons":
              value = await ctx.buttons(
                ...message.args
              );
              break;

            case "ctx.options":
              value = await ctx.options(
                ...message.args
              );
              break;

            default:
              throw new Error(
                `Operación no permitida: ${message.method}`
              );
          }

          if (child.connected && !finished) {
            child.send({
              type: "rpc-result",
              id: message.id,
              ok: true,
              value,
            });
          }
        } catch (error) {
          if (child.connected && !finished) {
            child.send({
              type: "rpc-result",
              id: message.id,
              ok: false,
              error: error instanceof Error
                ? error.message
                : String(error),
            });
          }
        }

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

    child.send({
      type: "start",
      command,
      args,
      context,
    }, (error) => {
      if (error) {
        finish(error);
        child.kill("SIGKILL");
      }
    });
  });
}
