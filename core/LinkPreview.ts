import type {
  BannerMediaMessage,
  LinkPreviewContextInfo,
} from "../types/media.d.ts";

type LinkPreviewOptions = {
  textOriginal: string;
  link: string;
  author?: string;
  title?: string;
  banner?: BannerMediaMessage;
  mentionedJid?: string[];
  isForwarded?: boolean;
  forwardingScore?: number;
  newsletterJid?: string;
  newsletterName?: string;
};

function getTimestamp(value: unknown): number {
  if (typeof value === "object" && value !== null) {
    return Number((value as { low?: number }).low || 0);
  }
  return Number(value || 0);
}

function buildLinkPreview(
  {
    textOriginal,
    link,
    author = "",
    title = "",
    banner,
    mentionedJid = [],
    isForwarded = true,
    forwardingScore = 1,
    newsletterJid = "120363410945728976@newsletter",
    newsletterName = "⬣〔 𝑨̰𝑼̰𝑹̰𝑨̰ 𝑹̰𝑬̰𝑬̰𝑫̰ 𝑪̰𝑯̰𝑨̰𝑵̰𝑬̰𝑳̰ 〕⬣",
  }: LinkPreviewOptions,
  includeChannel: boolean,
) {
  const contextInfo: LinkPreviewContextInfo = {
    mentionedJid,
    isForwarded,
    forwardingScore,
  };

  if (includeChannel) {
    contextInfo.forwardedNewsletterMessageInfo = {
      newsletterJid,
      newsletterName,
      serverMessageId: -1,
    };
  }

  return {
    extendedTextMessage: {
      text: textOriginal,
      matchedText: link,
      canonicalUrl: link,
      description: author,
      title,
      previewType: 1,
      jpegThumbnail: banner?.jpegThumbnail,
      thumbnailDirectPath: banner?.directPath,
      thumbnailSha256: banner?.fileSha256,
      thumbnailEncSha256: banner?.fileEncSha256,
      mediaKey: banner?.mediaKey,
      mediaKeyTimestamp: getTimestamp(banner?.mediaKeyTimestamp),
      thumbnailHeight: banner?.height || 1080,
      thumbnailWidth: banner?.width || 1920,
      inviteLinkGroupTypeV2: 0,
      contextInfo,
    },
  };
}

export function createLinkPreview(options: LinkPreviewOptions) {
  return buildLinkPreview(options, true);
}

export function createLinkPreviewWithoutChannel(options: LinkPreviewOptions) {
  return buildLinkPreview(options, false);
}

export const LINK_PREVIEW_MAP = createLinkPreview;
