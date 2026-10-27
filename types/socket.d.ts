import type { WASocket, proto } from "baileys";
import type { IDatabase } from "./database.d.ts";
import type { CommandPlugin } from "./commands.d.ts";

export type ExtendedWASocket = WASocket & {
  isSubBot?: boolean;
  subBotId?: string;
  sessionName?: string;
  manualLogout?: boolean;
  updateMediaMessage?: (mediaMessage: unknown) => Promise<unknown>;
};

export interface ConnectionOptions {
  pairingMethod?: "qr" | "code";
  allowPairing?: boolean;
  pairingPhone?: string;
  onSocketCreated?: (socket: ExtendedWASocket) => Promise<void> | void;
  pairingTimeoutMs?: number;
  onQr?: (qr: string) => Promise<void> | void;
  onPairingCode?: (code: string) => Promise<void> | void;
  onConnected?: () => Promise<void> | void;
  onPairingError?: (error: Error) => Promise<void> | void;
  onPairingExpired?: () => Promise<void> | void;
  onDisconnected?: () => Promise<void> | void;
  onSessionClosed?: (reason: string) => Promise<void> | void;
}

export interface SubBotLinkRequest {
  requester: string;
  method: "qr" | "code";
  phoneNumber?: string;
  onQr?: (qr: string) => Promise<void> | void;
  onPairingCode?: (code: string) => Promise<void> | void;
  onConnected?: () => Promise<void> | void;
  onPairingError?: (error: Error) => Promise<void> | void;
  onPairingExpired?: () => Promise<void> | void;
  onSessionClosed?: (reason: string) => Promise<void> | void;
}

export interface ContactMetadata {
  user?: string | null;
  jid?: string | null;
  lid?: string | null;
  phoneNumber?: string | null;
  username?: string | null;
  pushName?: string | null;
}

export interface HandlerConfig {
  prefix?: string | string[];
  ownerNumber?: string[];
  coOwners?: string[];
}

export interface MessageLogPayload {
  from: string;
  sender: string;
  isGroup: boolean;
  groupName: string;
  body: string;
  isCmd: boolean;
  cmdName: string;
  botLabel: string;
  msgTypeLabel: string;
}

export interface CmdExecPayload {
  cmdName: string;
  sender: string;
  success: boolean;
  ms: number;
  botLabel: string;
}

export interface HandlerLogger {
  message?: (payload: MessageLogPayload) => void;
  warn?: (message: string) => void;
  error?: (message: string) => void;
  cmdExec?: (payload: CmdExecPayload) => void;
}

export interface AntilinkCheckArgs {
  sock: ExtendedWASocket;
  msg: proto.IWebMessageInfo;
  from: string;
  sender: string;
  body: string;
  isAdmin: boolean;
  isOwner: boolean;
  isBotAdmin: boolean;
  botLabel: string;
}

export interface HandlerOptions {
  config?: HandlerConfig;
  db?: IDatabase;
  logger?: HandlerLogger;
  plugins?: Map<string, CommandPlugin>;
  getPlugins?: () => Map<string, CommandPlugin>;
  checkAntilink?: (args: AntilinkCheckArgs) => Promise<boolean>;
  handleChatXp?: (sender: string) => void;
  handleCommandXp?: (sender: string) => void;
}

export interface GroupCallEvent {
  id?: string;
  from?: string;
  creator?: string;
  isGroup?: boolean;
  participants?: Record<string, unknown>;
  [key: string]: unknown;
}

declare global {
  var DEFAULT_PREFIXES: string[];
  var DEFAULT_BOT_NAME: string;
  var DEFAULT_BOT_VERSION: string;
  var DEFAULT_BOT_AUTHOR: string;
  var DEFAULT_BOT_DESCRIPTION: string;
  var DEFAULT_BOT_OWNER: string;
  var DEFAULT_USER_ROLES: {
    lid?: string;
    role: string;
    jid?: string;
  }[];
  var mainBotSession: string;
  var subBotSession: string;
  var DATA_BASE_DIR: string;
  var mainSocket: ExtendedWASocket | null;

  type ExtendedWASocketGlobal = ExtendedWASocket;
  type ConnectionOptionsGlobal = ConnectionOptions;
  type HandlerOptionsGlobal = HandlerOptions;
}
