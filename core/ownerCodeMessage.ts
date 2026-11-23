import { fytBold } from "./socketText.ts";
import { t } from "../src/langs/index.ts";

export const MAX_GETCODE_PART_CHARS = 10_000;
export const MAX_GETCODE_PARTS = 10;
export const MAX_GETCODE_TOTAL_CHARS = MAX_GETCODE_PART_CHARS * MAX_GETCODE_PARTS;

export class OwnerCodeMessageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OwnerCodeMessageError";
  }
}

/**
 * Emplea la misma plantilla de salida de #r cat sin ejecutar comandos
 * del sistema. El código procede de rutas filtradas por getcode.
 */
export function formatOwnerCodeMessages(filePath: string, content: Buffer): string[] {
  let code: string;
  try {
    code = new TextDecoder("utf-8", { fatal: true }).decode(content);
  } catch {
    throw new OwnerCodeMessageError("El archivo no contiene texto UTF-8 válido.");
  }
  if (!code.length) {
    throw new OwnerCodeMessageError("El archivo está vacío.");
  }
  if (code.length > MAX_GETCODE_TOTAL_CHARS) {
    throw new OwnerCodeMessageError(
      "El código supera el límite de 100 000 caracteres para enviar texto en el chat.",
    );
  }

  const parts: string[] = [];
  for (let offset = 0; offset < code.length;) {
    const remaining = code.length - offset;
    let end = Math.min(code.length, offset + MAX_GETCODE_PART_CHARS);

    // Preferir cortes entre líneas, sin alterar el código original.
    if (remaining > MAX_GETCODE_PART_CHARS) {
      const lastBreak = code.lastIndexOf("\n", end - 1);
      if (lastBreak > offset + MAX_GETCODE_PART_CHARS / 2) {
        end = lastBreak + 1;
      }
    }
    // Nunca cortar un par sustituto de UTF-16 en la mitad.
    if (end < code.length) {
      const last = code.charCodeAt(end - 1);
      if (last >= 0xd800 && last <= 0xdbff) end--;
    }
    if (end <= offset) throw new OwnerCodeMessageError("No se pudo dividir el código de forma segura.");
    parts.push(code.slice(offset, end));
    offset = end;
  }

  if (parts.length > MAX_GETCODE_PARTS) {
    throw new OwnerCodeMessageError("El código requiere demasiados mensajes para enviarse al chat.");
  }

  // Mostrar la ruta relativa completa, legible y copiable, no solo
  // el nombre del archivo. La lectura ya valida esta ruta.
  const relativePath = filePath.replace(/\\/g, "/");
  return parts.map((part, index) => {
    const title = fytBold("GETCODE") + " // " + relativePath +
      (parts.length > 1 ? " [" + (index + 1) + "/" + parts.length + "]" : "");

    // Exactamente la plantilla visual de cmd/system/r.ts (salida #r cat).
    return t("cmd_value0_value1_value2_7c4207de", {
      value0: title,
      value1: part,
      value2: fytBold(t("cmd_system_29d43743")),
    });
  });
}

// Hecho por Lourtnyx Matterssmith [Lou-Nyx].
