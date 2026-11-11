import { fork } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WORKER = path.join(HERE, "worker.mjs");
const TIMEOUT = 30_000;

export function runSandbox(command, args, ctx) {
  return new Promise((resolve, reject) => {
    const child = fork(WORKER, [], {
      cwd: process.cwd(),
      execArgv: ["--import=tsx"],
      stdio: ["ignore", "ignore", "pipe", "ipc"],
      serialization: "advanced",
      env: {
        ...process.env,
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
      stderr = (stderr + chunk).slice(-8000);
    });

    function finish(error, result) {
      if (finished) return;
      finished = true;

      clearTimeout(timer);

      try {
        child.disconnect();
      } catch {}

      if (error) reject(error);
      else resolve(result);
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
                message.args[0]
              );
              break;

            case "ctx.react":
              value = await ctx.react(
                message.args[0]
              );
              break;

            case "ctx.resolveLid":
              value = await ctx.resolveLid(
                message.args[0]
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

          child.send({
            type: "rpc-result",
            id: message.id,
            ok: true,
            value,
          });
        } catch (error) {
          child.send({
            type: "rpc-result",
            id: message.id,
            ok: false,
            error: error instanceof Error
              ? error.message
              : String(error),
          });
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
            `Proceso de prueba finalizado sin resultado. Código: ${code}; señal: ${signal || "ninguna"}.\n${stderr}`
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
    });
  });
}