import type { proto, AnyMessageContent, DownloadableMessage, WAMessage } from "baileys";
import type { ButtonItem } from "./buttons.d.ts";
import type { CommandContext } from "./commands.d.ts";

export type SendMessageContent =
  | AnyMessageContent
  | (AnyMessageContent & {
      buttons?: ButtonItem[];
      headerType?: number;
      [key: string]: unknown;
    })
  | Record<string, unknown>;

export interface PackStickerItem {
  sticker: Buffer;
  isAnimated?: boolean;
  emojis?: string[];
  [key: string]: unknown;
}

export interface SendStickerPackOptions {
  name: string;
  publisher: string;
  description?: string;
  stickers: PackStickerItem[];
  cover?: Buffer;
  quoted?: proto.IWebMessageInfo;
}

export interface AlbumItem {
  image?: Buffer | { url: string } | string | unknown;
  video?: Buffer | { url: string } | string | unknown;
  caption?: string;
  mimetype?: string;
  [key: string]: unknown;
}

export interface StickerMetadata {
  pack?: string;
  author?: string;
  categories?: string[];
  id?: string;
}

export interface MediaDownloadOptions {
  timeout?: number;
  headers?: Record<string, string>;
}

export interface UnwrappedMediaMessage {
  imageMessage?: proto.Message.IImageMessage | null;
  videoMessage?: proto.Message.IVideoMessage | null;
  documentMessage?: proto.Message.IDocumentMessage | null;
  stickerMessage?: proto.Message.IStickerMessage | null;
  audioMessage?: proto.Message.IAudioMessage | null;
  viewOnceMessageV2?: { message?: proto.IMessage | null } | null;
  viewOnceMessage?: { message?: proto.IMessage | null } | null;
  documentWithCaptionMessage?: { message?: proto.IMessage | null } | null;
  [key: string]: unknown;
}

export interface StickerCompressionAttempt {
  fps: number;
  quality: number;
  duration: number;
}

export interface LyricResult {
  title?: string;
  artist?: string;
  album?: string;
  lyrics?: string;
  lrc?: string | null;
  duration?: number | string;
  [key: string]: unknown;
}

export interface DownloadMediaResult {
  filePath?: string;
  buffer?: Buffer;
  mimetype?: string;
  fileName?: string;
  size?: number;
}

export interface QuotedMediaItem {
  caption?: string | null;
  gifPlayback?: boolean | null;
  mimetype?: string | null;
  ptt?: boolean | null;
  fileName?: string | null;
  [key: string]: unknown;
}

export interface BannerMediaMessage {
  jpegThumbnail?: Uint8Array | null;
  directPath?: string | null;
  fileSha256?: Uint8Array | null;
  fileEncSha256?: Uint8Array | null;
  mediaKey?: Uint8Array | null;
  mediaKeyTimestamp?: number | { low?: number } | null;
  height?: number | null;
  width?: number | null;
}

export interface LinkPreviewContextInfo {
  mentionedJid?: string[];
  isForwarded?: boolean;
  forwardingScore?: number;
  forwardedNewsletterMessageInfo?: {
    newsletterJid: string;
    newsletterName: string;
    serverMessageId: number;
  };
}

export interface UguuUploadFile {
  url?: string;
  hash?: string;
  name?: string;
}

export interface UguuUploadResponse {
  files?: UguuUploadFile[];
  success?: boolean;
}

export interface ShazamTrack {
  title?: string;
  subtitle?: string;
  [key: string]: string | undefined;
}

export interface ShazamRecognizeResponse {
  success?: boolean;
  track?: ShazamTrack;
  message?: string;
  noMatch?: boolean;
}

export interface AuddRecognizeResult {
  title?: string;
  artist?: string;
  album?: string;
  release_date?: string;
  label?: string;
  song_link?: string;
  [key: string]: string | undefined;
}

export interface AuddRecognizeResponse {
  status?: string;
  result?: AuddRecognizeResult;
  error?: {
    message?: string;
  };
}

export interface BadWordLevel {
  words: string[];
  reason: string;
}

export interface AudioStickerMedia extends DownloadableMessage {
  mimetype?: string | null;
  seconds?: number | null;
  isAnimated?: boolean | null;
}

export interface AudioStickerMediaInfo {
  kind: "video" | "image" | "webp" | "audio" | null;
  mime: string;
  seconds: number;
  isAnimated?: boolean;
  mediaObj: AudioStickerMedia | null;
  dlType: "video" | "image" | "sticker" | "audio" | "document" | null;
}

export interface AudioStickerMediaNode extends Partial<WAMessage>, AudioStickerMedia {
  chat?: string;
  mtype?: string;
  type?: string;
  msg?: AudioStickerMedia;
  fakeObj?: Partial<WAMessage>;
  download?: () => Promise<Buffer>;
}

export interface AudioStickerCommandMessage extends AudioStickerMediaNode {
  chat: string;
  sender: string;
  key: WAMessage["key"];
  quoted?: AudioStickerMediaNode | null;
}

export interface AudioStickerSession {
  stickerBuffer: Buffer;
  isAnimated: boolean;
  packname: string;
  author: string;
  expiresAt: number;
  processing: boolean;
  timer: ReturnType<typeof setTimeout>;
}

export type AudioStickerCommandOptions = Pick<
  CommandContext,
  "sock" | "db" | "text" | "reply" | "react" | "usedPrefix"
> & { command: string };

export type AudioStickerSessionOptions = Pick<
  AudioStickerSession,
  "stickerBuffer" | "isAnimated" | "packname" | "author"
> & {
  m: AudioStickerCommandMessage;
  client: CommandContext["sock"];
  send: CommandContext["reply"];
  usedPrefix: string;
  command: string;
};

export interface StickerWithAudio extends proto.Message.IStickerMessage {
  audioMessage?: proto.Message.IAudioMessage | null;
}

declare global {
  var __audioStickerSessions: Map<string, AudioStickerSession> | undefined;
  type AlbumItemGlobal = AlbumItem;
  type StickerMetadataGlobal = StickerMetadata;
  type UnwrappedMediaMessageGlobal = UnwrappedMediaMessage;
  type BannerMediaMessageGlobal = BannerMediaMessage;
  type ShazamTrackGlobal = ShazamTrack;
}
