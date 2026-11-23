import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";

export const OWNER_FILE_STAGE = ".aura-owner-staging";
export const OWNER_FILE_MAX_WRITE = 128 * 1024;
export const OWNER_FILE_MAX_READ = 1024 * 1024;
const READ_ROOTS = new Set([
  "cmd", "core", "connection", "database", "src", "types", "utils", "scripts", "docs", "test",
]);
const WRITE_ROOTS = new Set([
  "cmd", "core", "connection", "database", "src", "types", "utils", "scripts", "docs", "test",
]);
const ROOT_FILES = new Set(["README.md", "main.ts", "handler.ts", "package.json", "tsconfig.json"]);
const EXTENSIONS = new Set([
  ".ts", ".mts", ".cts", ".tsx", ".js", ".mjs", ".cjs", ".jsx",
  ".json", ".md", ".txt", ".yaml", ".yml", ".css", ".html", ".svg",
  ".rs", ".go", ".py", ".sql", ".toml",
]);
const SENSITIVE = /(?:^|[._-])(?:env|config|session|sessions|secrets?|credentials?|tokens?|passwords?|api[-_]?keys?|private[-_]?keys?|vault|backups?|dump)(?:[._-]|$)/i;

export class OwnerFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OwnerFileError";
  }
}

type SafePath = { relative: string; physical: string; staged: boolean };

function checkLogicalPath(raw: string, operation: "read" | "write", directory = false): { relative: string; staged: boolean } {
  const requested = String(raw ?? "").trim().replace(/^\.\//, "");
  if (!requested || requested.length > 240 || /[\\\0\r\n]/.test(requested) ||
      path.posix.isAbsolute(requested) || path.win32.isAbsolute(requested)) {
    throw new OwnerFileError("Ruta inválida o absoluta.");
  }
  let segments = requested.split("/");
  if (segments.some(part => !part || part === "." || part === ".." ||
        part.length > 90 || part.startsWith(".") || SENSITIVE.test(part))) {
    throw new OwnerFileError("Ruta prohibida: no se admiten archivos ocultos, sensibles o rutas ascendentes.");
  }
  const staged = segments[0] === "staged";
  if (staged) {
    if (operation !== "read") throw new OwnerFileError("Usa la ruta lógica del proyecto, no staged/, para guardar.");
    segments = segments.slice(1);
    if (segments.length === 0 && directory) return { relative: "", staged: true };
  }
  if (!segments.length) throw new OwnerFileError("Falta una ruta de archivo.");
  const approved = operation === "write" ? WRITE_ROOTS : READ_ROOTS;
  if (segments.length === 1 && operation === "read" && ROOT_FILES.has(segments[0]!)) {
    return { relative: segments[0]!, staged };
  }
  if (segments.length === 1 && operation === "write" && ROOT_FILES.has(segments[0]!)) {
    return { relative: segments[0]!, staged };
  }
  if (!approved.has(segments[0]!)) throw new OwnerFileError("La ubicación no está autorizada.");
  if (segments.length === 1 && !directory) throw new OwnerFileError("Indica el nombre del archivo.");
  const last = segments[segments.length - 1]!;
  if (!directory && !EXTENSIONS.has(path.posix.extname(last).toLowerCase())) {
    throw new OwnerFileError("Extensión no admitida para archivos de código o documentación.");
  }
  return { relative: segments.join("/"), staged };
}

function locate(root: string, raw: string, operation: "read" | "write", directory = false): SafePath {
  const validated = checkLogicalPath(raw, operation, directory);
  const base = path.resolve(root, ...(validated.staged ? [OWNER_FILE_STAGE] : []));
  const physical = path.resolve(base, validated.relative);
  if (physical !== base && !physical.startsWith(base + path.sep)) throw new OwnerFileError("Ruta fuera del proyecto.");
  return { relative: validated.relative, physical, staged: validated.staged };
}

function refuseSymlinks(base: string, target: string): void {
  const root = path.resolve(base);
  const relative = path.relative(root, target);
  if (relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) {
    throw new OwnerFileError("Ruta fuera del proyecto.");
  }
  let current = root;
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    try {
      if (fs.lstatSync(current).isSymbolicLink()) throw new OwnerFileError("No se admiten enlaces simbólicos.");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
      throw error;
    }
  }
}

function safeExisting(root: string, relative: string, directory: boolean): SafePath {
  const result = locate(root, relative, "read", directory);
  refuseSymlinks(root, result.physical);
  let stat: fs.Stats;
  try { stat = fs.lstatSync(result.physical); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new OwnerFileError("El archivo o carpeta no existe.");
    throw error;
  }
  if (stat.isSymbolicLink()) throw new OwnerFileError("No se admiten enlaces simbólicos.");
  if (directory ? !stat.isDirectory() : !stat.isFile()) throw new OwnerFileError(directory ? "No es una carpeta." : "No es un archivo regular.");
  return result;
}

export function readOwnerSource(raw: string, root = process.cwd()): { filename: string; content: Buffer; bytes: number } {
  const source = safeExisting(root, raw, false);
  const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0);
  const fd = fs.openSync(source.physical, flags);
  try {
    const file = fs.fstatSync(fd);
    if (!file.isFile() || file.size > OWNER_FILE_MAX_READ) {
      throw new OwnerFileError("El archivo supera el máximo de 1 MiB o no es regular.");
    }
    const content = fs.readFileSync(fd);
    return { filename: path.basename(source.physical), content, bytes: content.length };
  } finally { fs.closeSync(fd); }
}

export function listOwnerSources(raw: string, root = process.cwd()): string[] {
  const dir = safeExisting(root, raw, true);
  const base = raw.replace(/\/$/, "");
  return fs.readdirSync(dir.physical, { withFileTypes: true })
    .filter(entry => !entry.isSymbolicLink())
    .filter(entry => {
      try { checkLogicalPath(base + "/" + entry.name, "read", entry.isDirectory()); return entry.isDirectory() || entry.isFile(); }
      catch { return false; }
    })
    .slice(0, 40)
    .map(entry => entry.name + (entry.isDirectory() ? "/" : ""));
}

export function normalizeOwnerCode(raw: string): string {
  const text = String(raw || "").replace(/\r\n?/g, "\n").trim();
  const fenced = text.match(/^\x60{3}[a-zA-Z0-9_-]*\n([\s\S]*?)\n\x60{3}$/);
  return ((fenced ? fenced[1]! : text).trim() + "\n");
}

function findContextInfo(value: unknown, depth = 0): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || depth > 6) return null;
  const object = value as Record<string, unknown>;
  if (object.contextInfo && typeof object.contextInfo === "object") {
    const context = object.contextInfo as Record<string, unknown>;
    if (context.quotedMessage) return context;
  }
  for (const key of ["message", "ephemeralMessage", "viewOnceMessage", "viewOnceMessageV2", "documentWithCaptionMessage", "extendedTextMessage", "imageMessage", "videoMessage", "documentMessage", "editedMessage"]) {
    const child = object[key];
    if (child) {
      const result = findContextInfo(child, depth + 1);
      if (result) return result;
    }
  }
  return null;
}

function quotedBody(value: unknown, depth = 0): string {
  if (!value || typeof value !== "object" || depth > 6) return "";
  const object = value as Record<string, unknown>;
  for (const part of [object.conversation, (object.extendedTextMessage as any)?.text,
    (object.documentMessage as any)?.caption, (object.imageMessage as any)?.caption,
    (object.videoMessage as any)?.caption]) {
    if (typeof part === "string" && part.trim()) return part;
  }
  for (const key of ["message", "ephemeralMessage", "viewOnceMessage", "viewOnceMessageV2", "documentWithCaptionMessage", "editedMessage"]) {
    const child = object[key];
    const result = quotedBody(child, depth + 1);
    if (result) return result;
  }
  return "";
}

export function getOwnerQuotedCode(msg: unknown): string {
  const object = (msg || {}) as Record<string, unknown>;
  const context = findContextInfo(object.message || object);
  return quotedBody(context?.quotedMessage);
}

export function writeOwnerStage(raw: string, source: string, replace = false, root = process.cwd()): { path: string; bytes: number; replaced: boolean } {
  const logical = checkLogicalPath(raw, "write");
  const normalized = normalizeOwnerCode(source);
  const content = Buffer.from(normalized, "utf8");
  if (!normalized.trim() || content.length > OWNER_FILE_MAX_WRITE) {
    throw new OwnerFileError("Código vacío o superior al límite de 128 KiB.");
  }
  const stageRoot = path.resolve(root, OWNER_FILE_STAGE);
  refuseSymlinks(root, stageRoot);
  if (!fs.existsSync(stageRoot)) fs.mkdirSync(stageRoot, { mode: 0o700 });
  refuseSymlinks(root, stageRoot);
  const target = path.resolve(stageRoot, logical.relative);
  if (!target.startsWith(stageRoot + path.sep)) throw new OwnerFileError("Ruta de destino no permitida.");
  let cursor = stageRoot;
  for (const part of path.relative(stageRoot, path.dirname(target)).split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, part);
    refuseSymlinks(stageRoot, cursor);
    if (!fs.existsSync(cursor)) fs.mkdirSync(cursor, { mode: 0o700 });
    if (!fs.lstatSync(cursor).isDirectory()) throw new OwnerFileError("Carpeta de destino inválida.");
  }
  refuseSymlinks(stageRoot, target);
  const exists = fs.existsSync(target);
  if (exists && !fs.lstatSync(target).isFile()) throw new OwnerFileError("Destino no es archivo regular.");
  if (exists && !replace) throw new OwnerFileError("Ya existe en staging. Usa --replace para actualizarlo.");
  const temp = path.join(path.dirname(target), ".owner-tmp-" + randomBytes(12).toString("hex"));
  try {
    fs.writeFileSync(temp, content, { flag: "wx", mode: 0o600 });
    if (exists && replace) fs.renameSync(temp, target);
    else { fs.linkSync(temp, target); fs.unlinkSync(temp); }
  } finally {
    try { fs.unlinkSync(temp); } catch { /* Ya fue eliminado. */ }
  }
  return { path: "staged/" + logical.relative, bytes: content.length, replaced: exists };
}

// Hecho por Lourtnyx Matterssmith [Lou-Nyx].
