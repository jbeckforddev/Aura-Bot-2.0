import type {
  proto,
  GroupMetadata,
  AnyMessageContent,
} from "@whiskeysockets/baileys";
import type { ExtendedWASocket } from "./socket.d.ts";
import type { IDatabase } from "./database.d.ts";
import type { ButtonItem, OptionSection } from "./buttons.d.ts";

export type ReplyContent =
  | string
  | (AnyMessageContent & {
      text?: string;
      mentions?: string[];
      [key: string]: unknown;
    });

export interface CommandContext {
  sock: ExtendedWASocket;
  db: IDatabase;
  msg: proto.IWebMessageInfo;
  from: string;
  sender: string;
  senderNum: string;
  botJid: string;
  botLabel: string;
  mainBotNum: string;
  activeBotsLive: ExtendedWASocket[];
  isGroup: boolean;
  groupName: string;
  groupMeta: GroupMetadata | null;
  body: string;
  isCmd: boolean;
  cmdName: string;
  args: string[];
  text: string;
  rawText: string;
  usedPrefix: string | null;
  modPrefix: string;
  isOwner: boolean;
  isCoOwner: boolean;
  isMod: boolean;
  isPremium: boolean;
  isAdmin: boolean;
  isBotAdmin: boolean;
  isBotUser: boolean;
  resolveLid: (lidJid: string) => Promise<string>;
  clearGroupCache: () => boolean;
  reply: (content: ReplyContent) => Promise<proto.WAMessage | undefined>;
  react: (emoji: string) => Promise<proto.WAMessage | undefined>;
  copy: (
    text: string,
    copyCode: string,
    buttonText?: string,
    footer?: string,
  ) => Promise<unknown>;
  buttons: (
    text: string,
    buttons: ButtonItem[],
    footer?: string,
  ) => Promise<proto.WebMessageInfo | undefined>;
  options: (
    text: string,
    sections: OptionSection[],
    footer?: string,
    buttonText?: string,
    title?: string,
  ) => Promise<unknown>;
  getPlugins: () => Map<string, CommandPlugin>;
  getPluginCategories: () => string[];
}

export interface ReplyContext {
  sock: ExtendedWASocket;
  msg: proto.IWebMessageInfo;
  from: string;
  body: string;
  sender: string;
  botJid: string;
  db: IDatabase;
  usedPrefix: string;
  reply: (content: ReplyContent) => Promise<proto.WebMessageInfo | undefined>;
  react: (emoji: string) => Promise<proto.WebMessageInfo | undefined>;
}

export interface CommandPlugin {
  name: string | string[];
  category?: string;
  description?: string | string[];
  usage?: string;
  tags?: string[];
  cooldown?: number;
  ownerOnly?: boolean;
  modOnly?: boolean;
  adminOnly?: boolean;
  botAdmin?: boolean;
  groupOnly?: boolean;
  privateOnly?: boolean;
  premiumOnly?: boolean;
  botUserOnly?: boolean;
  run: (ctx: CommandContext) => Promise<unknown> | unknown;
  execute?: (ctx: CommandContext) => Promise<unknown> | unknown;
  handleReply?: (ctx: ReplyContext) => Promise<boolean | void> | boolean | void;
  [key: string]: unknown;
}

export interface InteractionApiResponse {
  status?: boolean;
  result?: string;
  [key: string]: unknown;
}

export interface WaBanCheckData {
  isBanned?: boolean;
  isPermanent?: boolean;
  violation_info?: {
    description?: string;
    duration?: string;
    risk?: string;
  };
  status_message?: string;
  [key: string]: unknown;
}

export interface WaBanCheckResponse {
  resultado?: {
    data?: WaBanCheckData;
  };
  [key: string]: unknown;
}

declare global {
  type CommandContextGlobal = CommandContext;
  type CommandPluginGlobal = CommandPlugin;
  type ReplyContextGlobal = ReplyContext;
  type InteractionApiResponseGlobal = InteractionApiResponse;
  type WaBanCheckResponseGlobal = WaBanCheckResponse;
}
