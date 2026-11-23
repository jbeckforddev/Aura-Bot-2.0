import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_GETCODE_PART_CHARS,
  MAX_GETCODE_TOTAL_CHARS,
  formatOwnerCodeMessages,
} from "../core/ownerCodeMessage.ts";

function sourceFromMessage(message) {
  const matched = message.match(/\n\x60\x60\x60\n([\s\S]*?)\n\x60\x60\x60\n/);
  assert.ok(matched, "El mensaje debe contener un bloque de código como #r cat");
  return matched[1];
}

test("usa exactamente el marco de #r cat, enviando texto y no documentos", () => {
  const code = "const valor = 7;\nconsole.log(valor);\n";
  const parts = formatOwnerCodeMessages("cmd/system/ejemplo.ts", Buffer.from(code));
  assert.equal(parts.length, 1);
  assert.match(parts[0], /^╭〔 🖥️ 𝐆𝐄𝐓𝐂𝐎𝐃𝐄/);
  assert.match(parts[0], /╰━━〔 ⚡ 𝐒𝐘𝐒𝐓𝐄𝐌 〕━━⬣$/);
  assert.equal(sourceFromMessage(parts[0]), code);
});

test("código largo dividido en partes completas y ordenadas", () => {
  const code = "console.log('paso');\n".repeat(1650);
  const parts = formatOwnerCodeMessages("cmd/system/largo.ts", Buffer.from(code));
  assert.ok(parts.length >= 3 && parts.length <= 10);
  assert.equal(parts.map(sourceFromMessage).join(""), code);
  for (const [index, message] of parts.entries()) {
    assert.match(message, new RegExp("\\[" + (index + 1) + "/" + parts.length + "\\]"));
    assert.ok(message.length < MAX_GETCODE_PART_CHARS + 400);
  }
});

test("divide líneas largas sin romper emojis Unicode", () => {
  const code = "x".repeat(9999) + "🌸" + "y".repeat(100);
  const parts = formatOwnerCodeMessages("cmd/system/emoji.ts", Buffer.from(code));
  assert.ok(parts.length >= 2);
  assert.equal(parts.map(sourceFromMessage).join(""), code);
  assert.equal(parts.some(part => part.includes("\ufffd")), false);
});

test("rechaza archivos demasiado largos sin entregar contenido parcial", () => {
  const tooLong = "a".repeat(MAX_GETCODE_TOTAL_CHARS + 1);
  assert.throws(
    () => formatOwnerCodeMessages("cmd/system/muy-grande.ts", Buffer.from(tooLong)),
    /100 000 caracteres/,
  );
});

test("rechaza contenido binario o UTF-8 corrupto", () => {
  assert.throws(
    () => formatOwnerCodeMessages("cmd/system/invalido.ts", Buffer.from([0xff, 0xfe])),
    /UTF-8/,
  );
  assert.throws(
    () => formatOwnerCodeMessages("cmd/system/vacio.ts", Buffer.alloc(0)),
    /vacío/,
  );
});

// Hecho por Lourtnyx Matterssmith [Lou-Nyx].
