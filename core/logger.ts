import chalk from "chalk";

export type CmdLogInput = {
  numeroReal?: string | null;
  receivedAt: number;
  rango?: string | null;
  commandName?: string | null;
  isGroup?: boolean;
  text?: string | null;
  jidRemitente?: string | null;
  pushName?: string | null;
  groupMetadata?: {
    subject?: string | null;
  } | null;
  prefix?: string | null;
  sock?: {
    isSubBot?: boolean;
    subBotId?: string | number;
  } | null;
};

export async function displayBanner() {
  console.clear();
  const banner = `
    \t${chalk.hex("#e9d5ff").bold("  █████╗ ██╗   ██╗██████╗  █████╗ ")}
    \t${chalk.hex("#c084fc").bold(" ██╔══██╗██║   ██║██╔══██╗██╔══██╗")}
    \t${chalk.hex("#a855f7").bold(" ███████║██║   ██║██████╔╝███████║")}
    \t${chalk.hex("#8b5cf6").bold(" ██╔══██║██║   ██║██╔══██╗██╔══██║")}
    \t${chalk.hex("#6d28d9").bold(" ██║  ██║╚██████╔╝██║  ██║██║  ██║")}
    \t${chalk.hex("#4c1d95").bold(" ╚═╝  ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚═╝  ╚═╝")}
    \t${chalk.hex("#6d28d9").italic("────── Powered By Jeriel B. ──────")}
`;
  console.log(banner);
}

export function cmdLog({
  rango,
  commandName,
  text,
  pushName,
  groupMetadata,
  sock,
  receivedAt,
}: CmdLogInput) {
  if (!commandName) return;

  const elapsedMs = Math.round(performance.now() - receivedAt);
  const nombreUsuario = pushName || "Usuario";
  const botName = sock?.isSubBot ? "Sub-Bot" : "Bot";
  const botNumber = sock?.subBotId ? `+${sock.subBotId}` : "Principal";
  const groupName = groupMetadata?.subject || "Chat privado";
  const commandText = text ? String(text).trim() : "{ Sin argumentos }";
  const timestamp = new Date().toLocaleString("es-CR", {
    timeZone: "America/Costa_Rica",
    hour12: false,
  });

  console.log(chalk.cyan("╭───────────────────────────────────────────────╮"));
  console.log(`${chalk.cyan("│")} ${chalk.gray("🤖\u00A0Bot:")}       ${chalk.blue(`${botName} (${botNumber})`)}`,);
  console.log(`${chalk.cyan("│")} ${chalk.gray("👤\u00A0Usuario:")}   ${chalk.white(`${nombreUsuario}`)}`);
  console.log(`${chalk.cyan("│")} ${chalk.gray("🛡️\u00A0Rango:")}     ${chalk.yellow(rango || "USUARIO")}`);
  console.log(`${chalk.cyan("│")} ${chalk.gray("👥\u00A0Grupo:")}     ${chalk.green(groupName)}`);
  console.log(`${chalk.cyan("│")} ${chalk.gray("🕒\u00A0Fecha:")}     ${chalk.magenta(timestamp)}`);
  console.log(`${chalk.cyan("│")} ${chalk.gray("⌛\u00A0Tiempo:")}    ${chalk.cyan(`${elapsedMs}ms`)}`);
  console.log(chalk.cyan("├───────────────────────────────────────────────┤"));
  console.log(`${chalk.cyan("│")} ${chalk.cyan.bold("COMANDO")} ${chalk.white(`> ${commandName}`)} ${chalk.gray(`${commandText}`)}`);
  console.log(chalk.cyan("╰───────────────────────────────────────────────╯"));
}

export function logInfo(
  message: string,
  level: "info" | "warn" | "error" | "alert" | "success" = "info",
) {
  const prefixMap = {
    info: chalk.bgCyan.bold("[INFO]"),
    warn: chalk.bgYellow.bold("[WARN]"),
    error: chalk.bgRed.bold("[ERROR]"),
    success: chalk.bgGreen.bold("[SUCCESS]"),
    alert: chalk.bgHex("#ff8000").bold("[ALERT]"),
  };
  console.log(`${prefixMap[level]} ${chalk.white(message)}`);
}

export function pairingLog(message: string) {
  const menu =
    chalk.blue.bold(`╭──────────── Vinculación de Aura Reed ───────────⬣\n`) +
    chalk.blue.bold(`│ \n`) +
    chalk.blue.bold(`│ Seleccione un método de vinculación:\n`) +
    chalk.blue.bold(`│ \n`) +
    chalk.blue.bold(`│ 1. Código QR (Terminal)\n`) +
    chalk.blue.bold(`│ 2. Código de emparejamiento\n`) +
    chalk.blue.bold(`│ \n`) +
    chalk.blue.bold(`╰─────────────────────────────────────────────────⬣\n`) +
    `${chalk.bgYellow("[PAIRING]")} ${chalk.white(message)}`;
  console.log(menu);
}
