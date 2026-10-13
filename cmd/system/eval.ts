import type { CommandContext } from "../../types/index.d.ts";
import { inspect } from "node:util";
import { t } from "../../src/langs/index.ts";


const AsyncFunction = Object.getPrototypeOf(async function () {})
  .constructor as {
  new (...args: string[]): (...values: unknown[]) => Promise<unknown>;
};

function formatResult(value: unknown): string {
  if (typeof value === "string") return value;
  return inspect(value, {
    depth: 6,
    maxArrayLength: 100,
    maxStringLength: 4000,
    colors: false,
  });
}

function getMessageContext(message: Record<string, unknown>) {
  const contextInfo = Object.values(message?.message ?? {})
    .map((value) => (value as Record<string, unknown>)?.contextInfo)
    .find(Boolean) as Record<string, unknown> | undefined;
  const quotedMessage = contextInfo?.quotedMessage ?? null;

  return {
    ...message,
    text: message?.body ?? "",
    quoted: quotedMessage
      ? {
          message: quotedMessage,
          participant: contextInfo.participant ?? null,
          stanzaId: contextInfo.stanzaId ?? null,
          mentionedJid: contextInfo.mentionedJid ?? [],
        }
      : null,
  };
}

export default {
  name: ["eval", "ev", ">"],
  description: t("cmd_evalua_codigo_con_todo_el_cont_835d270f"),
  category: "system",
  modOnly: true,
  async run(ctx: CommandContext) {
    const code = String(ctx.text || ctx.args?.join(" ") || "").trim();
    if (!code)
      return ctx.reply(
        t("cmd_escribe_una_expresion_o_bloque_fbf76626"),
      );
    const m = getMessageContext({ ...ctx.msg, body: ctx.body });

    const context = {
      ...ctx,
      ctx,
      handler: ctx,
      m,
      metadata: {
        msg: ctx.msg,
        m,
        groupMeta: ctx.groupMeta,
        groupName: ctx.groupName,
        sender: ctx.sender,
        from: ctx.from,
        botJid: ctx.botJid,
        botLabel: ctx.botLabel,
        isGroup: ctx.isGroup,
        isAdmin: ctx.isAdmin,
        isBotAdmin: ctx.isBotAdmin,
        isOwner: ctx.isOwner,
        isMod: ctx.isMod,
        isPremium: ctx.isPremium,
        isSelf: false, // isSelf not in CommandContext
      },
    };
    const names = Object.keys(context);
    const values = names.map((name) => context[name]);

    try {
      let result: unknown;
      try {
        const expression = new AsyncFunction(
          ...names,
          `"use strict"; return await (${code});`,
        );
        result = await expression(...values);
      } catch (expressionError) {
        const statements = new AsyncFunction(...names, `"use strict"; ${code}`);
        result = await statements(...values);
        if (result === undefined) result = expressionError;
      }

      const output = formatResult(result);
      return ctx.reply(t("cmd_resultado_value0_6b9075d7", { value0: output.slice(0, 6000) }));
    } catch (error: unknown) {
      return ctx.reply(
        t("cmd_value0_6b94fc8b", { value0: (error instanceof Error ? error.stack || error.message : String(error)).slice(0, 6000) }),
      );
    }
  },
};
