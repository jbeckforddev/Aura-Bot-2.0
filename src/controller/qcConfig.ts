export const QC_CONFIG = {
  canvasSize: 500,
  minBubbleWidth: 300,
  maxBubbleWidth: 300,
  avatarSize: 108,
  tailSize: 50,
  horizontalPadding: 42,
  colors: {
    bubble: "#f2e5ff",
    quotedBubble: "#d0d0d0",
    quoteAccent: "#1100ff",
    username: "#888888",
    text: "#080808",
    fallbackAvatar: "#1100ff",
  },
  font: {
    family: "Arial, sans-serif",
    main: 40,
    mainMinimum: 30,
    quoted: 25,
    quotedMinimum: 15,
    username: 30,
    quotedUsername: 15,
    lineSpacing: 1.18,
  },
  maxLines: {
    main: 5,
    quoted: 3,
  },
  maxCharacters: {
    main: 40,
    quoted: 40,
  },
  messages: {
    mainTextTooLong: "El texto principal no puede superar los 40 caracteres.",
    quotedTextTooLong: "El texto citado no puede superar los 40 caracteres.",
  },
  quote: {
    horizontalPadding: 24,
    verticalPadding: 18,
    accentWidth: 12,
    borderRadius: 28,
  },
} as const;