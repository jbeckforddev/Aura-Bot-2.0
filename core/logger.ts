import chalk from "chalk";
import pino from "pino";
import { createWriteStream, mkdirSync } from "node:fs";
import path from "node:path";
import { format, stripVTControlCharacters } from "node:util";
import type { BotType } from "./botType.ts";

const configuredLogPath = path.resolve(
  process.env.AURA_LOG_FILE || "data/log/log.log",
);
const logPath = path.parse(configuredLogPath);
const startupId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${process.pid}`;
const logFilePath = path.join(
  logPath.dir,
  `${logPath.name}-${startupId}${logPath.ext || ".log"}`,
);
mkdirSync(logPath.dir, { recursive: true });

const logFile = createWriteStream(logFilePath, { flags: "wx" });
const terminal = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  debug: console.debug.bind(console),
};

logFile.on("error", (error) => {
  terminal.error(`No se pudo escribir el archivo de logs ${logFilePath}:`, error);
});

export const operationLogger = pino({ level: "silent" });

type OperationLogLevel =
  | "info"
  | "warn"
  | "error"
  | "alert"
  | "pairing"
  | "success"
  | "httpError"
  | "httpWarn"
  | "httpInfo"
  | "httpSuccess"
  | "debug";

function captureConsole(
  level: OperationLogLevel,
  output: (...args: any[]) => void,
  args: any[],
): void {
  const message = stripVTControlCharacters(format(...args));
  logFile.write(
    `${JSON.stringify({
      time: new Date().toISOString(),
      level,
      source: "console",
      msg: message,
    })}\n`,
  );
  output(...args);
}

console.log = (...args) => captureConsole("info", terminal.log, args);
console.info = (...args) => captureConsole("info", terminal.info, args);
console.warn = (...args) => captureConsole("warn", terminal.warn, args);
console.error = (...args) => captureConsole("error", terminal.error, args);
console.debug = (...args) => captureConsole("debug", terminal.debug, args);
console.info(`Guardando logs de operación en ${logFilePath}.`);

export type CmdLogInput = {
  numeroReal?: string | null;
  receivedAt: number;
  rango?: string | null;
  botType?: BotType;
  cmdName?: string | null;
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
    botType?: BotType;
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
  cmdName,
  text,
  pushName,
  groupMetadata,
  sock,
  botType,
  receivedAt,
  prefix,
}: CmdLogInput) {
  if (!cmdName) return;

  const elapsedMs = Math.round(performance.now() - receivedAt);
  const nombreUsuario = pushName || "Usuario";
  const botName =
    botType ?? sock?.botType ?? (sock?.isSubBot ? "Sub-Bot" : "Principal");
  const botNumber = sock?.subBotId ? `+${sock.subBotId}` : "Principal";
  const groupName = groupMetadata?.subject || "Chat privado";
  const commandText = (text ?? "").slice(prefix?.length ?? 0).trimStart();
  const rawArgs = commandText.slice(cmdName.length).trim();
  const safeArgs = rawArgs.length > 20 ? `${rawArgs.substring(0, 25)}...` : rawArgs;
  const argsDisplay = safeArgs ? chalk.gray(safeArgs) : chalk.dim("{Sin argumentos}");
  const timestamp = new Date().toLocaleString("es-CR", {hour12: false});
  const cmd = prefix + cmdName

  console.log(chalk.cyan("╭───────────────────────────────────────────────╮"));
  console.log(`${chalk.cyan("│")} ${chalk.white.bold("Bot:")}       ${chalk.blue(`${botName} (${botNumber})`)}`,);
  console.log(`${chalk.cyan("│")} ${chalk.white.bold("Usuario:")}   ${chalk.white(`${nombreUsuario}`)}`);
  console.log(`${chalk.cyan("│")} ${chalk.white.bold("Rango:")}     ${chalk.yellow(rango || "USUARIO")}`);
  console.log(`${chalk.cyan("│")} ${chalk.white.bold("Grupo:")}     ${chalk.green(groupName)}`);
  console.log(`${chalk.cyan("│")} ${chalk.white.bold("Fecha:")}     ${chalk.magenta(timestamp)}`);
  console.log(`${chalk.cyan("│")} ${chalk.white.bold("Tiempo:")}    ${chalk.cyan(`${elapsedMs}ms`)}`);
  console.log(chalk.cyan("├───────────────────────────────────────────────┤"));
  console.log(`${chalk.cyan("│")} ${chalk.cyan.bold("COMANDO")} ${chalk.white(`> ${cmd}`)} ${chalk.gray(`${argsDisplay}`)}`);
  console.log(chalk.cyan("╰───────────────────────────────────────────────╯"));
}

export function logInfo(
  message: string,
  level: OperationLogLevel = "info",
): void {
  const prefixMap = {
    info: chalk.bgCyan.bold("[INFO]"),
    warn: chalk.bgYellow.bold("[WARN]"),
    error: chalk.bgRed.bold("[ERROR]"),
    success: chalk.bgGreen.bold("[SUCCESS]"),
    alert: chalk.bgHex("#ff8000").bold("[ALERT]"),
    pairing: chalk.bgBlue.bold("[PAIRING]"),
    httpError: chalk.bgRed.bold("[HTTP ERROR]"),
    httpWarn: chalk.bgYellow.bold("[HTTP WARN]"),
    httpInfo: chalk.bgCyan.bold("[HTTP INFO]"),
    httpSuccess: chalk.bgGreen.bold("[HTTP SUCCESS]"),
  };
  captureConsole(level, terminal.log, [
    `${prefixMap[level]} ${chalk.white(message)}`,
  ]);
}

export function pairingMenuLog() {
  const Options =
    chalk.blue.bold(`╭──────────── Vinculación de Aura Reed ───────────⬣\n`) +
    chalk.blue.bold(`│ \n`) +
    chalk.blue.bold(`│ Seleccione un método de vinculación:\n`) +
    chalk.blue.bold(`│ \n`) +
    chalk.blue.bold(`│ 1. Código QR (Terminal)\n`) +
    chalk.blue.bold(`│ 2. Código de emparejamiento\n`) +
    chalk.blue.bold(`│ \n`) +
    chalk.blue.bold(`╰─────────────────────────────────────────────────⬣\n`);
  console.log(Options);
}
