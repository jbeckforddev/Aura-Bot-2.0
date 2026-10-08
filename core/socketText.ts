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
  return `╭〔 ⚠️ ${fytBold("AURA REED")}〕⬣
┃ ❌ ${fytBold("COMANDO NO ENCONTRADO")}
╰━━━━━━━━━━━━⬣
┃ > El comando \`${cmdName}\` no existe
┃ > o está mal escrito.
┃ > Ejecuta \`${prefix}menu\` para ver
┃ > los comandos disponibles.`;
};

export const ERROR_CMD = ({
  cmdName,
  errorDetails,
}: {
  cmdName: string;
  errorDetails: string;
}) => {
  return `╭〔 ⚠️ ${fytBold("AURA REED")}〕⬣
┃ ❌ ${fytBold("ERROR EN COMANDO")}
╰━━━━━━━━━━━━⬣
┃ > Ocurrió un error al ejecutar
┃ > el comando \`${cmdName}\`.

> Detalles del error:
\`\`\`
${errorDetails}
\`\`\``;
};

export const NOT_BOT_ADMIN = () => {
  return `╭〔 ⚠️ ${fytBold("AURA REED")}〕⬣
┃ ❌ ${fytBold("SIN PERMISOS")}
╰━━━━━━━━━━━━⬣
┃ > Este comando solo puede ser usado
┃ > si el bot es administrador del grupo.`;
};

export const NOT_BOT_USER = () => {
  return `╭〔 ⚠️ ${fytBold("AURA REED")}〕⬣
┃ ❌ ${fytBold("SIN PERMISOS")}
╰━━━━━━━━━━━━⬣
┃ > Este comando solo puede ser usado
┃ > por el misma instancia del bot.`;
};

export const NOT_ADMIN = () => {
  return `╭〔 ⚠️ ${fytBold("AURA REED")}〕⬣
┃ ❌ ${fytBold("SIN PERMISOS")}
╰━━━━━━━━━━━━⬣
┃ > Este comando solo puede ser usado
┃ > por los administradores del grupo.`;
};

export const NOT_PRIVATE = () => {
  return `╭〔 ⚠️ ${fytBold("AURA REED")}〕⬣
┃ ❌ ${fytBold("CHAT PRIVADO")}
╰━━━━━━━━━━━━⬣
┃ > Este comando solo puede ser usado
┃ > en chats privados.`;
};

export const NOT_GROUP = () => {
  return `╭〔 ⚠️ ${fytBold("AURA REED")}〕⬣
┃ ❌ ${fytBold("CHAT NO GRUPAL")}
╰━━━━━━━━━━━━⬣
┃ > Este comando solo puede ser usado
┃ > en grupos.`;
};

export const NOT_OWNER = () => {
  return `╭〔 ⚠️ ${fytBold("AURA REED")}〕⬣
┃ ❌ ${fytBold("SIN PERMISOS")}
╰━━━━━━━━━━━━⬣
┃ > Este comando solo puede ser usado
┃ > por el dueño del bot.`;
};

export const NOT_MOD = () => {
  return `╭〔 ⚠️ ${fytBold("AURA REED")}〕⬣
┃ ❌ ${fytBold("SIN PERMISOS")}
╰━━━━━━━━━━━━⬣
┃ > Este comando solo puede ser usado
┃ > por los moderadores del bot.`;
};

export const NOT_PREMIUM = () => {
  return `╭〔 ⚠️ ${fytBold("AURA REED")}〕⬣
┃ ❌ ${fytBold("BOT NO PREMIUM")}
╰━━━━━━━━━━━━⬣
┃ > Este comando solo puede ser usado
┃ > por los Prem-Bots de Aura Reed.`;
};

export const IS_SUBBOT_ONLINE = ({ prefix }: { prefix?: string }) => {
  return `╭〔  ${fytBold("AURA REED")}〕⬣
┃ ✅${fytBold("SUB-BOT EN LÍNEA")}
╰━━━━━━━━━━━━⬣
┃ > El sub-bot ya está en línea y conectado a WhatsApp.
┃ > cuando quieras desvincular escriba \`${prefix}logout\`
┃ > para cerrar la sesión del sub-bot.`;
};

export const NOT_HAVE_COINS = ({userBalance, typeMedia, minAmount, currencyName, requiredAmount}) => {
  return `╭〔 ⚠️ ${fytBold("AURA REED")} 〕⬣
┃ 💸 ${fytBold("SIN SALDO")}
╰━━━━━━━━━━━━⬣
┃ > Tus ${currencyName} no alcanzan
┃ > para descargar ${typeMedia}.
┃ > Debes tener al menos
┃ > *${requiredAmount || minAmount}*
┃ > para descargas de ${typeMedia}.

┃ > Tienes *${userBalance}*
┃ > en la cartera, debes
┃ > retirar o farmear más.
┃ > ${currencyName} para descargar
┃ > más ${typeMedia}

╰━━〔 ${fytBold("AURA ECONOMY")} 〕━━⬣
`;
}

export const PLUGINS_OFF = ({ pluginCategory, prefix }) => {
  return `╭〔 ⚠️ ${fytBold("SOCKET SYSTEM")} 〕⬣
┃ ${fytBold("COMANDOS DESACTIVADOS")}
╰━━━━━━━━━━━━⬣

┃ > Los comandos ${fytBold(String(pluginCategory).toUpperCase())}
┃ > están desactivados en este grupo.
┣━━━━━━━━━━━━⬣
┃ > Un administrador del
┃ > grupo puede activarlos con
┃ > \`${prefix}enable ${pluginCategory}\`

╰〔 ⚡ ${fytBold("SYSTEM ALERT")} 〕⬣`;
};