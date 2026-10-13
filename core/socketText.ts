import { t } from "../src/langs/index.ts";

export const fytBold = (texto?: string) => {
  const mapa = {
    a: "𝐚",
    b: "𝐛",
    c: "𝐜",
    d: "𝐝",
    e: "𝐞",
    f: "𝐟",
    g: "𝐠",
    h: "𝐡",
    i: "𝐢",
    j: "𝐣",
    k: "𝐤",
    l: "𝐥",
    m: "𝐦",
    n: "𝐧",
    o: "𝐨",
    p: "𝐩",
    q: "𝐪",
    r: "𝐫",
    s: "𝐬",
    t: "𝐭",
    u: "𝐮",
    v: "𝐯",
    w: "𝐰",
    x: "𝐱",
    y: "𝐲",
    z: "𝐳",

    A: "𝐀",
    B: "𝐁",
    C: "𝐂",
    D: "𝐃",
    E: "𝐄",
    F: "𝐅",
    G: "𝐆",
    H: "𝐇",
    I: "𝐈",
    J: "𝐉",
    K: "𝐊",
    L: "𝐋",
    M: "𝐌",
    N: "𝐍",
    O: "𝐎",
    P: "𝐏",
    Q: "𝐐",
    R: "𝐑",
    S: "𝐒",
    T: "𝐓",
    U: "𝐔",
    V: "𝐕",
    W: "𝐖",
    X: "𝐗",
    Y: "𝐘",
    Z: "𝐙",
  };
  return String(texto)
    .split("")
    .map((letra) => mapa[letra] || letra)
    .join("");
};

export const NOT_CMD_FOUND = ({
  cmdName,
  prefix = ".",
}: {
  cmdName: string;
  prefix?: string;
}) => {
  return t("commandNotFound", { cmdName, prefix });
};

export const ERROR_CMD = ({
  cmdName,
  errorDetails,
}: {
  cmdName: string;
  errorDetails: string;
}) => {
  return t("commandError", { cmdName, errorDetails });
};

export const NOT_BOT_ADMIN = () => {
  return t("notBotAdmin");
};

export const NOT_BOT_USER = () => {
  return t("notBotUser");
};

export const NOT_ADMIN = () => {
  return t("notAdmin");
};

export const NOT_PRIVATE = () => {
  return t("notPrivate");
};

export const NOT_GROUP = () => {
  return t("notGroup");
};

export const NOT_OWNER = () => {
  return t("notOwner");
};

export const NOT_MOD = () => {
  return t("notMod");
};

export const NOT_PREMIUM = () => {
  return t("notPremium");
};

export const IS_SUBBOT_ONLINE = ({ prefix }: { prefix?: string }) => {
  return t("subbotOnline", { prefix: prefix ?? "." });
};

export const NOT_HAVE_COINS = ({userBalance, typeMedia, minAmount, currencyName, requiredAmount}) => {
  return t("notEnoughCoins", {
    userBalance,
    typeMedia,
    currencyName,
    requiredAmount: requiredAmount || minAmount,
  });
}

export const PLUGINS_OFF = ({ pluginCategory, prefix }) => {
  const category = String(pluginCategory);
  return t("pluginsOff", {
    pluginCategory: fytBold(category.toUpperCase()),
    pluginCategoryPlain: category,
    prefix,
  });
};