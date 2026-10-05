import type { CommandContext } from "../types/index.d.ts";

export function makeGachaCtx(ctx: CommandContext) {
  const sender = ctx.sender;
  const chatId = ctx.isGroup ? ctx.from : sender;

  return {
    sender,
    args: ctx.args,
    msg: ctx.msg,
    chatId,
    sock: ctx.sock,
    isOwner: ctx.isOwner,
    fullText: ctx.text,
    usedPrefix: ctx.usedPrefix || ".",
    reply: async (
      text: string | { text: string; mentions?: string[] },
      mentions?: string[],
    ) => {
      if (typeof text === "string") {
        return ctx.reply(mentions?.length ? { text, mentions } : text);
      }
      return ctx.reply(text);
    },
    addCoins: (amount: number) => Math.max(0, amount),
    getCoins: () => 0,
  };
}
