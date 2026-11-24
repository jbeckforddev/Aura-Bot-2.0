import { test } from "node:test";
import assert from "node:assert/strict";
import getcode from "../cmd/system/getcode.ts";
import {
  getQuotedMessageForInspection,
  quotedMessageAsJson,
} from "../core/ownerQuotedMessage.ts";

const mediaKey = Buffer.from("aura-test-key-not-real").toString("base64");
const sticker = {
  stickerMessage: {
    url: "https://mmg.whatsapp.net/media.enc?token=secret",
    fileSha256: Buffer.from("hash"),
    fileEncSha256: Buffer.from("synthetic-test-hash").toString("base64"),
    mediaKey,
    mimetype: "application/was",
    height: 64,
    width: 64,
    directPath: "/v/enc?token=secret",
    fileLength: { low: 24506, high: 0, unsigned: true },
    mediaKeyTimestamp: 1795474349n,
    isAnimated: true,
    contextInfo: { mediaDomainInfo: {
      mediaKeyDomain: "MEDIA_KEY_DOMAIN_E2EE",
      e2EeMediaKey: mediaKey,
    } },
    stickerSentTs: "1795474350000",
    isAvatar: false,
    isAiSticker: false,
    isLottie: true,
    premium: 1,
  },
};
const msg = {
  message: {
    extendedTextMessage: { text: "$getcode", contextInfo: { quotedMessage: sticker } },
  },
};
const base = {
  msg,
  isOwner: true,
  isGroup: false,
  usedPrefix: "$",
  prefix: "$",
  rawText: "",
  args: [],
  reply: async value => value,
};
function extractJson(text) {
  const match = text.match(/\n\x60\x60\x60\n([\s\S]*?)\n\x60\x60\x60\n/);
  assert.ok(match, "El diseño debe ser el de #r cat");
  return JSON.parse(match[1]);
}

test("encuentra stickerMessage citado mediante contextInfo", () => {
  assert.equal(getQuotedMessageForInspection(msg), sticker);
  assert.equal(getQuotedMessageForInspection({ message: { conversation: "hola" } }), null);
});
test("permite respuestas citadas dentro de envolturas de WhatsApp", () => {
  const wrapped = { message: { ephemeralMessage: { message: {
    extendedTextMessage: { contextInfo: { quotedMessage: sticker } },
  } } } };
  assert.equal(getQuotedMessageForInspection(wrapped), sticker);
});
test("conserva campos originales y convierte Buffer, bigint y Long", () => {
  const actual = quotedMessageAsJson(sticker);
  const data = JSON.parse(actual.json);
  assert.equal(actual.type, "stickerMessage");
  assert.equal(data.stickerMessage.fileSha256, Buffer.from("hash").toString("base64"));
  assert.equal(data.stickerMessage.fileLength, "24506");
  assert.equal(data.stickerMessage.mediaKeyTimestamp, "1795474349");
  assert.equal(data.stickerMessage.mediaKey, mediaKey);
  assert.equal(data.stickerMessage.isAnimated, true);
  assert.equal(data.stickerMessage.contextInfo.mediaDomainInfo.e2EeMediaKey, mediaKey);
});
test("conserva claves, enlaces y atributos completos en el JSON para owners", () => {
  const actual = quotedMessageAsJson(sticker);
  const data = JSON.parse(actual.json).stickerMessage;
  assert.equal(data.mediaKey, mediaKey);
  assert.equal(data.contextInfo.mediaDomainInfo.e2EeMediaKey, mediaKey);
  assert.equal(data.url, sticker.stickerMessage.url);
  assert.equal(data.directPath, sticker.stickerMessage.directPath);
  assert.equal(data.height, 64);
  assert.equal(data.premium, 1);
  assert.ok(actual.json.includes(mediaKey));
  assert.match(actual.json, /token=secret/);
  assert.doesNotMatch(actual.json, /OCULTO EN GRUPO/);
});
test("en privado getcode responde el JSON en el mensaje, no adjunto", async () => {
  const result = await getcode.run(base);
  assert.equal(result.document, undefined);
  assert.match(result.text, /^╭〔 🖥️ 𝐆𝐄𝐓𝐂𝐎𝐃𝐄 \/\/ stickerMessage/);
  assert.match(result.text, /╰━━〔 ⚡ 𝐒𝐘𝐒𝐓𝐄𝐌 〕━━⬣$/);
  const parsed = extractJson(result.text);
  assert.equal(parsed.stickerMessage.mediaKey, mediaKey);
  assert.equal(parsed.stickerMessage.width, 64);
});
test("un nombre de archivo explícito sigue mostrando código aunque se responda a un sticker", async () => {
  const result = await getcode.run({ ...base, rawText: "getcode" });
  assert.equal(typeof result.text, "string");
  assert.match(result.text, /cmd\/system\/getcode\.ts/);
  assert.doesNotMatch(result.text, /"stickerMessage":/);
});

test("en grupo getcode devuelve todos los metadatos cuando ejecuta un owner", async () => {
  const result = await getcode.run({ ...base, isGroup: true });
  const parsed = extractJson(result.text);
  assert.equal(parsed.stickerMessage.mediaKey, mediaKey);
  assert.equal(parsed.stickerMessage.contextInfo.mediaDomainInfo.e2EeMediaKey, mediaKey);
  assert.equal(parsed.stickerMessage.url, sticker.stickerMessage.url);
  assert.equal(parsed.stickerMessage.directPath, sticker.stickerMessage.directPath);
  assert.equal(result.document, undefined);
  assert.ok(result.text.includes('"stickerMessage"'));
  assert.doesNotMatch(result.text, /OCULTO EN GRUPO/);
});
test("usuarios sin rol owner no pueden acceder al JSON completo en grupos", async () => {
  const denied = await getcode.run({ ...base, isGroup: true, isOwner: false });
  assert.match(denied, /Solo los owners/);
  assert.ok(!denied.includes(mediaKey));
  assert.ok(!denied.includes(sticker.stickerMessage.url));
});
test("responder a un texto muestra conversation sin inventar atributos", async () => {
  const quoted = { conversation: "Hola Aura" };
  const result = await getcode.run({ ...base, msg: {
    message: { extendedTextMessage: { contextInfo: { quotedMessage: quoted } } },
  } });
  assert.deepEqual(extractJson(result.text), quoted);
});
test("sin argumento y sin cita muestra ayuda de ambos modos", async () => {
  const result = await getcode.run({ ...base, msg: { message: { conversation: "$getcode" } } });
  assert.match(result, /GUÍA|𝐆𝐔Í𝐀/);
  assert.match(result, /sticker/);
  assert.match(result, /getcode ping/);
});
test("un no-owner no puede consultar datos citados, ni en privado", async () => {
  const result = await getcode.run({ ...base, isOwner: false });
  assert.match(result, /Solo los owners/);
  assert.doesNotMatch(result, /aura-test-key-not-real/);
});
test("no admite propiedades cíclicas ni binarios grandes sin control", () => {
  const c = { stickerMessage: { height: 64, jpegThumbnail: Buffer.alloc(9000) } };
  c.stickerMessage.self = c.stickerMessage;
  const obj = JSON.parse(quotedMessageAsJson(c).json).stickerMessage;
  assert.match(obj.jpegThumbnail, /Datos binarios omitidos/);
  assert.equal(obj.self, "[Referencia circular]");
});
test("solo usa los campos que existen realmente", () => {
  assert.deepEqual(JSON.parse(quotedMessageAsJson({
    stickerMessage: { mimetype: "image/webp" },
  }).json), { stickerMessage: { mimetype: "image/webp" } });
});

// Hecho por Lourtnyx Matterssmith [Lou-Nyx].
