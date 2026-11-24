/**
 * Inspección de metadatos del mensaje citado, sin descargar medios.
 *
 * La carga procede exclusivamente de contextInfo.quotedMessage.
 * No genera datos que WhatsApp no haya entregado al bot.
 * Los valores originales se conservan tanto en grupos como en privados;
 * la autorización exclusiva del owner se aplica en cmd/system/getcode.ts.
 */

type AnyRecord = Record<string, unknown>;

const MESSAGE_WRAPPERS = [
  "message", "ephemeralMessage", "viewOnceMessage", "viewOnceMessageV2",
  "documentWithCaptionMessage", "editedMessage", "extendedTextMessage",
  "imageMessage", "videoMessage", "audioMessage", "documentMessage",
  "stickerMessage", "buttonsResponseMessage", "templateButtonReplyMessage",
  "listResponseMessage", "interactiveResponseMessage",
] as const;

const MAX_DEPTH = 14;
const MAX_NODES = 4000;
const MAX_BINARY_BYTES = 8192;
const MAX_TEXT_LENGTH = 40000;

export class QuotedMessageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QuotedMessageError";
  }
}

function record(value: unknown): AnyRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as AnyRecord : null;
}

/** El contexto de Baileys suele estar en extendedTextMessage.contextInfo. */
export function getQuotedMessageForInspection(msg: unknown): AnyRecord | null {
  const root = record(msg);
  if (!root) return null;
  const seen = new WeakSet<object>();

  function visit(value: unknown, depth: number): AnyRecord | null {
    const node = record(value);
    if (!node || depth > 8 || seen.has(node)) return null;
    seen.add(node);
    const context = record(node.contextInfo);
    const quoted = record(context?.quotedMessage);
    if (quoted && Object.keys(quoted).length) return quoted;
    for (const key of MESSAGE_WRAPPERS) {
      const nested = visit(node[key], depth + 1);
      if (nested) return nested;
    }
    return null;
  }
  return visit(root, 0);
}

function isProtoLong(value: AnyRecord): boolean {
  return typeof value.low === "number" &&
    typeof value.high === "number" &&
    typeof value.unsigned === "boolean" &&
    Object.keys(value).every(key => key === "low" || key === "high" || key === "unsigned");
}

function longToString(value: AnyRecord): string {
  const high = BigInt((value.high as number) >>> 0);
  const low = BigInt((value.low as number) >>> 0);
  const uint = (high << 32n) + low;
  return (!(value.unsigned as boolean) && (value.high as number) < 0
    ? uint - (1n << 64n) : uint).toString();
}

/** Convierte valores protobuf (Buffer, Uint8Array, Long, bigint) a JSON. */
export function quotedMessageAsJson(
  quoted: unknown,
): { type: string; json: string } {
  const root = record(quoted);
  if (!root || !Object.keys(root).length) {
    throw new QuotedMessageError("El mensaje citado no contiene metadatos disponibles.");
  }

  let nodes = 0;
  const ancestors = new WeakSet<object>();

  function convert(value: unknown, depth: number): unknown {
    nodes++;
    if (nodes > MAX_NODES) return "[Límite de elementos alcanzado]";
    if (depth > MAX_DEPTH) return "[Profundidad máxima alcanzada]";
    if (typeof value === "bigint") return value.toString();
    if (typeof value === "string") {
      return value.length > MAX_TEXT_LENGTH
        ? value.slice(0, MAX_TEXT_LENGTH) + "[Texto recortado]" : value;
    }
    if (value === null || typeof value === "boolean" || typeof value === "number") {
      return value;
    }
    if (typeof value !== "object") return undefined;
    if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
      const bytes = Buffer.from(value);
      return bytes.length > MAX_BINARY_BYTES
        ? "[Datos binarios omitidos: " + bytes.length + " bytes]"
        : bytes.toString("base64");
    }

    if (ancestors.has(value)) return "[Referencia circular]";
    ancestors.add(value);
    try {
      if (Array.isArray(value)) {
        return value.slice(0, 300).map(item => convert(item, depth + 1));
      }
      const obj = record(value);
      if (!obj) return null;
      if (isProtoLong(obj)) return longToString(obj);
      const output: AnyRecord = {};
      for (const key of Object.keys(obj).slice(0, 300)) {
        if (key === "__proto__" || key === "prototype" || key === "constructor") continue;
        const converted = convert(obj[key], depth + 1);
        if (converted !== undefined) output[key] = converted;
      }
      return output;
    } finally {
      ancestors.delete(value);
    }
  }

  const converted = convert(root, 0);
  const type = Object.keys(root).find(key => key.endsWith("Message")) ||
    Object.keys(root)[0] || "quotedMessage";
  const json = JSON.stringify(converted, null, 2);
  if (!json) throw new QuotedMessageError("No se pudo convertir el mensaje citado a JSON.");
  if (json.length > 95_000) {
    throw new QuotedMessageError("La estructura del mensaje citado es demasiado grande para el chat.");
  }
  return { type, json };
}

// Hecho por Lourtnyx Matterssmith [Lou-Nyx].
