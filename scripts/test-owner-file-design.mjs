import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ownerFilePanel, ownerFileBytes } from "../core/ownerFileDesign.ts";
import savefile from "../cmd/system/savefile.ts";
import getcode from "../cmd/system/getcode.ts";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "aura-design-"));
const previous = process.cwd();
fs.mkdirSync(path.join(root, "cmd", "system"), { recursive: true });
fs.writeFileSync(path.join(root, "cmd", "system", "ping.ts"), "export default true;\n");
process.chdir(root);
after(() => {
  process.chdir(previous);
  fs.rmSync(root, { recursive: true, force: true });
});

const base = {
  isOwner: true,
  isGroup: true,
  usedPrefix: "$",
  prefix: "$",
  args: [],
  rawText: "",
  msg: { message: {} },
  reply: async (content) => content,
};

test("estilo Aura Reed con encabezado, barras y pie SYSTEM INFO", () => {
  const text = ownerFilePanel("GETCODE", "ARCHIVO ENCONTRADO", [
    "📄 *Nombre:* \x60ping.ts\x60",
  ], "success");
  assert.match(text, /^╭〔 ✅ \*𝐀𝐔𝐑𝐀 𝐑𝐄𝐄𝐃\*/);
  assert.match(text, /┃ 🗂️ 𝐆𝐄𝐓𝐂𝐎𝐃𝐄/);
  assert.match(text, /╰━━━━━━━━━━━━⬣/);
  assert.match(text, /╭─〔 ✅/);
  assert.match(text, /┃ 📄 \*Nombre:/);
  assert.match(text, /╰─────────────────────/);
  assert.match(text, /╰〔 ⚡ 𝐒𝐘𝐒𝐓𝐄𝐌 𝐈𝐍𝐅𝐎 〕⬣$/);
});

test("los campos del panel no permiten saltos de línea arbitrarios", () => {
  const text = ownerFilePanel("SAVEFILE", "ERROR", ["Error\nmalicioso"]);
  assert.match(text, /┃ Error malicioso/);
  assert.doesNotMatch(text, /Error\nmalicioso/);
});

test("unidades de tamaño usadas en los documentos", () => {
  assert.equal(ownerFileBytes(0), "0 B");
  assert.equal(ownerFileBytes(512), "512 B");
  assert.equal(ownerFileBytes(1024), "1.0 KB");
  assert.equal(ownerFileBytes(1048576), "1.00 MB");
});

test("ayudas y denegaciones owner usan el mismo diseño", async () => {
  for (const command of [savefile, getcode]) {
    const help = await command.run(base);
    assert.match(help, /╭〔 📁/);
    assert.match(help, /𝐀𝐔𝐑𝐀 𝐑𝐄𝐄𝐃/);
    assert.match(help, /𝐆𝐔Í𝐀/);
    const denied = await command.run({ ...base, isOwner: false });
    assert.match(denied, /╭〔 ❌/);
    assert.match(denied, /Solo los owners/);
  }
});

test("savefile confirma creación/actualización con panel Aura Reed", async () => {
  const first = await savefile.run({
    ...base, rawText: "cmd/system/ejemplo.ts export default 1;",
  });
  assert.match(first, /𝐒𝐀𝐕𝐄𝐅𝐈𝐋𝐄/);
  assert.match(first, /Archivo preparado creado/);
  assert.match(first, /staged\/cmd\/system\/ejemplo.ts/);
  const second = await savefile.run({
    ...base, rawText: "cmd/system/ejemplo.ts export default 2;",
  });
  assert.match(second, /Archivo preparado actualizado/);
  assert.match(second, /╰〔 ⚡ 𝐒𝐘𝐒𝐓𝐄𝐌 𝐈𝐍𝐅𝐎/);
});

test("getcode escribe código con el diseño exacto de #r cat", async () => {
  const result = await getcode.run({ ...base, rawText: "ping" });
  assert.equal(typeof result.text, "string");
  assert.equal(result.document, undefined);
  assert.match(result.text, /^╭〔 🖥️ 𝐆𝐄𝐓𝐂𝐎𝐃𝐄 \/\/ cmd\/system\/ping\.ts 〕━⬣/);
  assert.match(result.text, /━⬣\n\n\x60\x60\x60\nexport default true;\n\n\x60\x60\x60/);
  assert.match(result.text, /╰━━〔 ⚡ 𝐒𝐘𝐒𝐓𝐄𝐌 〕━━⬣$/);
});

test("errores y resultados vacíos también preservan el diseño", async () => {
  const missing = await getcode.run({ ...base, rawText: "archivo-que-no-existe" });
  assert.match(missing, /╭〔 ❌/);
  assert.match(missing, /𝐒𝐈𝐍 𝐑𝐄𝐒𝐔𝐋𝐓𝐀𝐃𝐎𝐒/);
  const invalid = await savefile.run({ ...base, rawText: "config.ts export default 1;" });
  assert.match(invalid, /╭〔 ❌/);
  assert.match(invalid, /𝐄𝐑𝐑𝐎𝐑 𝐀𝐋 𝐆𝐔𝐀𝐑𝐃𝐀𝐑/);
});

// Hecho por Lourtnyx Matterssmith [Lou-Nyx].
