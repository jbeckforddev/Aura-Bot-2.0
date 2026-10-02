import type { proto } from "@whiskeysockets/baileys";
import type { ExtendedWASocket } from "./socket.d.ts";

export interface SearchItem {
  url?: string;
  title?: string;
  desc?: string;
  description?: string;
  author?: {
    nickname?: string;
    fullname?: string;
    [key: string]: unknown;
  };
  views?: number | string;
  likes?: number | string;
  comments?: number | string;
  [key: string]: unknown;
}

export interface DownloadPreviewOptions {
  sock: ExtendedWASocket;
  from: string;
  msg: proto.IWebMessageInfo;
  thumbnail: string;
  caption: string;
  link: string;
  title: string;
  author?: string;
  sender?: string;
  mentions?: string[];
}

export interface ApkDownloadData {
  name?: string;
  package?: string;
  size?: string;
  lastUpdated?: string;
  banner?: string;
  dl?: string;
  [key: string]: unknown;
}

export interface ApkDownloadResponse {
  status?: boolean;
  data?: ApkDownloadData;
  [key: string]: unknown;
}

export interface YouTubeSearchItem {
  url?: string;
  title?: string;
  author?: string;
  autor?: string;
  duration?: string;
  thumbnail?: string;
  views?: string | number;
  [key: string]: unknown;
}

export interface YouTubeSearchResponse {
  status?: boolean;
  result?: YouTubeSearchItem[];
  [key: string]: unknown;
}

export interface YouTubeMp3Data {
  title?: string;
  author?: string;
  duration?: string;
  quality?: string;
  dl?: string;
  videoId?: string;
  [key: string]: unknown;
}

export interface YouTubeMp3Response {
  status?: boolean;
  data?: YouTubeMp3Data;
  [key: string]: unknown;
}

export interface YouTubeVideoDataDetails {
  url?: string;
  download?: string;
  title?: string;
  author?: string;
  channel?: string;
  image?: string;
  format?: string;
  tamaño?: string;
  size?: string;
  quality?: string;
  [key: string]: unknown;
}

export interface YouTubeVideoData {
  status?: boolean;
  titulo?: string;
  title?: string;
  canal?: string;
  author?: string;
  duracion?: string;
  duration?: string;
  miniatura?: string;
  thumbnail?: string;
  datos?: YouTubeVideoDataDetails;
  data?: YouTubeVideoDataDetails;
  [key: string]: unknown;
}

export interface SpotifySongData {
  title?: string;
  artist?: string;
  album?: string;
  duration?: string;
  url?: string;
  coverHd?: string;
  cover?: string;
  dl?: string | { mp3?: string };
  [key: string]: unknown;
}

export interface SpotifyResponse {
  status?: boolean;
  data?: SpotifySongData;
  [key: string]: unknown;
}

export interface TikTokAuthor {
  nickname?: string;
  fullname?: string;
  unique_id?: string;
  [key: string]: unknown;
}

export interface TikTokStats {
  views?: number | string;
  likes?: number | string;
  comment?: number | string;
  share?: number | string;
  [key: string]: unknown;
}

export interface TikTokMediaItem {
  url?: string;
  type?: string;
  [key: string]: unknown;
}

export interface TikTokDownloadData {
  status?: boolean;
  title?: string;
  author?: TikTokAuthor;
  stats?: TikTokStats;
  play_count?: number | string;
  digg_count?: number | string;
  comment_count?: number | string;
  share_count?: number | string;
  data?: TikTokMediaItem[];
  [key: string]: unknown;
}

export interface TikTokSearchItem {
  url?: string;
  title?: string;
  desc?: string;
  author?: TikTokAuthor;
  stats?: TikTokStats;
  [key: string]: unknown;
}

export interface TikTokSearchResponse {
  status?: boolean;
  data?: TikTokSearchItem[];
  [key: string]: unknown;
}

export interface InstagramMediaItem {
  url?: string;
  type?: "video" | "image" | string;
  [key: string]: unknown;
}

export interface InstagramDownloadData {
  caption?: string;
  download?: InstagramMediaItem[];
  [key: string]: unknown;
}

export interface InstagramDownloadResponse {
  status?: boolean;
  data?: InstagramDownloadData;
  [key: string]: unknown;
}

export interface TwitterMediaItem {
  url?: string;
  quality?: string | number;
  [key: string]: unknown;
}

export interface TwitterDownloadData {
  type?: "video" | "image" | string;
  result?: string | TwitterMediaItem | TwitterMediaItem[];
  thumbnail?: string | { url?: string };
  [key: string]: unknown;
}

export interface TwitterDownloadResponse {
  status?: boolean;
  data?: TwitterDownloadData;
  [key: string]: unknown;
}

export interface FacebookMediaItem {
  url?: string;
  hd?: string;
  sd?: string;
  quality?: string;
  [key: string]: unknown;
}

export interface FacebookDownloadResponse {
  status?: boolean;
  resultados?: (string | FacebookMediaItem)[];
  data?: (string | FacebookMediaItem)[] | FacebookMediaItem;
  result?: (string | FacebookMediaItem)[] | FacebookMediaItem;
  [key: string]: unknown;
}

export interface MediaFireDownloadData {
  download: string;
  name: string;
  size: string;
}

export interface PinterestItem {
  hd?: string;
  mini?: string;
  image?: string;
  [key: string]: unknown;
}

export interface PinterestSearchResponse {
  status?: boolean;
  data?: (string | PinterestItem)[];
  [key: string]: unknown;
}

export interface StickerPackSearchResultItem {
  url?: string;
  name?: string;
  isPaid?: boolean;
  author?: string;
  [key: string]: unknown;
}

export interface StickerPackSearchResponse {
  status?: boolean;
  resultados?: StickerPackSearchResultItem[];
  result?: StickerPackSearchResultItem[];
  [key: string]: unknown;
}

export interface StickerPackItem {
  imageUrl?: string;
  url?: string;
  image?: string;
  isAnimated?: boolean;
  animated?: boolean;
  [key: string]: unknown;
}

export interface StickerPackDetailData {
  name?: string;
  thumbnailUrl?: string;
  thumbnail?: string;
  stickers?: StickerPackItem[];
  [key: string]: unknown;
}

export interface StickerPackDetailResponse {
  status?: boolean;
  detalles?: StickerPackDetailData;
  name?: string;
  thumbnailUrl?: string;
  thumbnail?: string;
  stickers?: StickerPackItem[];
  [key: string]: unknown;
}

export interface SoundCloudTranscoding {
  url?: string;
  format?: {
    protocol?: string;
    mime_type?: string;
  };
  [key: string]: unknown;
}

export interface SoundCloudTrack {
  id?: number | string;
  kind?: string;
  title?: string;
  permalink_url?: string;
  uri?: string;
  duration?: number;
  artwork_url?: string;
  user?: {
    username?: string;
    avatar_url?: string;
  };
  media?: {
    transcodings?: SoundCloudTranscoding[];
  };
  [key: string]: unknown;
}

export interface SoundCloudSearchResponse {
  collection?: SoundCloudTrack[];
  [key: string]: unknown;
}

declare global {
  type SearchItemGlobal = SearchItem;
  type ApkDownloadResponseGlobal = ApkDownloadResponse;
  type YouTubeMp3ResponseGlobal = YouTubeMp3Response;
  type SpotifyResponseGlobal = SpotifyResponse;
  type TikTokDownloadDataGlobal = TikTokDownloadData;
}
