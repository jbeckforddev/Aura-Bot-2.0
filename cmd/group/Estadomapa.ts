import path from "node:path";
import fs from "node:fs";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { jidNormalizedUser } from "baileys";
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const W = 720;
const H = 1280;
const S = 1.5;
const MAP_W = 560;
const MAP_H = 400;
const DEFAULT_COLOR: [number, number, number] = [142, 107, 168];
const UA = "LuferOSMapBot/1.2 (WhatsApp status module)";

const COLORES: Record<string, string> = {
  morado: "#9C27B0",
  purple: "#9C27B0",
  azul: "#2196F3",
  blue: "#2196F3",
  rojo: "#F44336",
  red: "#F44336",
  verde: "#25D366",
  green: "#25D366",
  negro: "#212121",
  black: "#212121",
  naranja: "#FF5722",
  orange: "#FF5722",
  rosa: "#E91E63",
  pink: "#E91E63",
  amarillo: "#FFC107",
  yellow: "#FFC107",
  cafe: "#795548",
  brown: "#795548",
  gris: "#607D8B",
  gray: "#607D8B",
  cyan: "#00BCD4",
};

let FONT = '"Noto Sans","Liberation Sans","DejaVu Sans",Arial,sans-serif';
let fontRegistered = false;

async function getCanvasModule(): Promise<any> {
  for (const modName of ["@napi-rs/canvas", "canvas"]) {
    try {
      const mod: any = await import(modName);
      if (!fontRegistered && mod.GlobalFonts?.registerFromPath) {
        fontRegistered = true;
        const candidates = [
          path.resolve(__dirname, "../../assets/fonts/husky.ttf"),
          path.resolve(process.cwd(), "assets/fonts/husky.ttf"),
        ];
        for (const fp of candidates) {
          if (fs.existsSync(fp)) {
            mod.GlobalFonts.registerFromPath(fp, "HuskyFont");
            FONT = `"HuskyFont",${FONT}`;
            break;
          }
        }
      }
      return mod;
    } catch {}
  }
  throw new Error("No se encontró @napi-rs/canvas ni canvas instalados en el entorno.");
}

const font = (size: number, weight = "") => `${weight} ${size}px ${FONT}`.trim();

const mix = (a: number[], b: number[], t: number): [number, number, number] => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t),
];

const rgba = (c: number[], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

function hexToRgb(h: string): [number, number, number] | null {
  const m = String(h).trim().match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/i);
  if (!m) return null;
  let x = m[1];
  if (x.length === 3) {
    x = [...x].map((c) => c + c).join("");
  }
  return [
    parseInt(x.slice(0, 2), 16),
    parseInt(x.slice(2, 4), 16),
    parseInt(x.slice(4, 6), 16),
  ];
}

function rr(ctx: any, x: number, y: number, w: number, h: number, r: number) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function wrapText(ctx: any, text: string, maxW: number, maxLines: number): string[] {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const test = line ? `${line} ${w}` : w;
    if (ctx.measureText(test).width > maxW && line) {
      lines.push(line);
      line = w;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    let l = lines[maxLines - 1];
    while (l.length > 1 && ctx.measureText(`${l}…`).width > maxW) {
      l = l.slice(0, -1);
    }
    lines[maxLines - 1] = `${l}…`;
  }
  return lines;
}

async function getJson(url: string): Promise<any> {
  const r = await fetch(url, {
    signal: AbortSignal.timeout(10000),
    headers: {
      "User-Agent": UA,
      "Accept-Language": "es",
    },
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

function unwrapMessage(message: any): any {
  if (!message || typeof message !== "object") return null;
  if (message.ephemeralMessage?.message) return unwrapMessage(message.ephemeralMessage.message);
  if (message.viewOnceMessage?.message) return unwrapMessage(message.viewOnceMessage.message);
  if (message.viewOnceMessageV2?.message) return unwrapMessage(message.viewOnceMessageV2.message);
  if (message.documentWithCaptionMessage?.message) return unwrapMessage(message.documentWithCaptionMessage.message);
  if (message.editedMessage?.message) return unwrapMessage(message.editedMessage.message);
  return message;
}

function extractLocationNode(msg: any): any {
  const root = unwrapMessage(msg?.message);
  if (!root) return null;

  if (root.locationMessage || root.liveLocationMessage) {
    return root.locationMessage || root.liveLocationMessage;
  }

  for (const key of Object.keys(root)) {
    const sub = root[key];
    if (sub && typeof sub === "object" && sub.contextInfo?.quotedMessage) {
      const quoted = unwrapMessage(sub.contextInfo.quotedMessage);
      if (quoted?.locationMessage || quoted?.liveLocationMessage) {
        return quoted.locationMessage || quoted.liveLocationMessage;
      }
    }
  }
  return null;
}

function titleFromAddress(a: any, display: string): string {
  const addr = a || {};
  const t = [
    addr.city || addr.town || addr.village || addr.municipality || addr.suburb || addr.county,
    addr.state || addr.country,
  ]
    .filter(Boolean)
    .join(", ");
  return t || String(display || "").split(",")[0].trim();
}

async function reverseGeocode(lat: number, lon: number): Promise<{ title: string; address: string }> {
  try {
    const r = await getJson(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=16&addressdetails=1&lat=${lat}&lon=${lon}`,
    );
    return {
      title: titleFromAddress(r.address, r.display_name),
      address: r.display_name || "",
    };
  } catch {
    try {
      const p = await getJson(`https://photon.komoot.io/reverse?lon=${lon}&lat=${lat}`);
      const prop = p?.features?.[0]?.properties;
      if (prop) {
        const title = [prop.name || prop.city || prop.locality, prop.state || prop.country]
          .filter(Boolean)
          .join(", ");
        const address = [prop.street, prop.district, prop.city, prop.state, prop.country]
          .filter(Boolean)
          .join(", ");
        return {
          title: title || `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
          address,
        };
      }
    } catch {}
    return {
      title: `${lat.toFixed(5)}, ${lon.toFixed(5)}`,
      address: "",
    };
  }
}

async function resolverUbicacion(
  msg: any,
  query: string,
): Promise<{ lat: number; lon: number; title: string; address: string } | null> {
  const loc = extractLocationNode(msg);
  if (loc && loc.degreesLatitude != null && loc.degreesLongitude != null) {
    const lat = Number(loc.degreesLatitude);
    const lon = Number(loc.degreesLongitude);
    if (loc.name || loc.address) {
      return {
        lat,
        lon,
        title: String(loc.name || loc.address),
        address: loc.name ? String(loc.address || "") : "",
      };
    }
    return { lat, lon, ...(await reverseGeocode(lat, lon)) };
  }

  if (!query) return null;

  const coordMatch = query.match(/^\s*(-?\d{1,2}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/);
  if (coordMatch) {
    const lat = parseFloat(coordMatch[1]);
    const lon = parseFloat(coordMatch[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      return { lat, lon, ...(await reverseGeocode(lat, lon)) };
    }
  }

  try {
    const list = await getJson(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&q=${encodeURIComponent(query)}`,
    );
    if (Array.isArray(list) && list.length > 0) {
      const it = list[0];
      const parts = String(it.display_name || "")
        .split(",")
        .map((s) => s.trim());
      return {
        lat: parseFloat(it.lat),
        lon: parseFloat(it.lon),
        title: it.name || parts[0] || query,
        address: parts.slice(1).join(", "),
      };
    }
  } catch {}

  try {
    const photon = await getJson(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=1`,
    );
    const feat = photon?.features?.[0];
    if (feat?.geometry?.coordinates) {
      const [lon, lat] = feat.geometry.coordinates;
      const p = feat.properties || {};
      const title = p.name || p.city || p.state || query;
      const address = [p.street, p.city, p.state, p.country].filter(Boolean).join(", ");
      return {
        lat: Number(lat),
        lon: Number(lon),
        title: String(title),
        address,
      };
    }
  } catch {}

  return null;
}

function project(lat: number, lon: number, z: number): { x: number; y: number } {
  const n = 256 * 2 ** z;
  const la = Math.max(-85.0511, Math.min(85.0511, lat));
  const x = ((lon + 180) / 360) * n;
  const y = ((1 - Math.log(Math.tan(Math.PI / 4 + (la * Math.PI) / 360)) / Math.PI) / 2) * n;
  return { x, y };
}

async function fetchTileBuffer(z: number, x: number, y: number): Promise<Buffer> {
  const urls = [
    `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
    `https://a.basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}.png`,
    `https://b.basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}.png`,
  ];

  for (const url of urls) {
    try {
      const r = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        headers: { "User-Agent": UA },
      });
      if (r.ok) {
        const ab = await r.arrayBuffer();
        return Buffer.from(ab);
      }
    } catch {}
  }
  throw new Error("Tile fetch failed");
}

async function buildMap(canvasMod: any, lat: number, lon: number, zoom: number): Promise<any> {
  const { createCanvas, loadImage } = canvasMod;
  const c = createCanvas(MAP_W, MAP_H);
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#e8e4dc";
  ctx.fillRect(0, 0, MAP_W, MAP_H);

  const z = Math.max(3, Math.min(18, zoom));
  const n = 2 ** z;
  const { x: cx, y: cy } = project(lat, lon, z);
  const left = cx - MAP_W / 2;
  const top = cy - MAP_H / 2;

  const jobs: Promise<boolean>[] = [];
  for (let ty = Math.floor(top / 256); ty <= Math.floor((top + MAP_H) / 256); ty++) {
    for (let tx = Math.floor(left / 256); tx <= Math.floor((left + MAP_W) / 256); tx++) {
      if (ty < 0 || ty >= n) continue;
      const wx = ((tx % n) + n) % n;
      jobs.push(
        fetchTileBuffer(z, wx, ty)
          .then((buf) => loadImage(buf))
          .then((img) => {
            ctx.drawImage(img, tx * 256 - left, ty * 256 - top);
            return true;
          })
          .catch(() => false),
      );
    }
  }

  const ok = (await Promise.all(jobs)).filter(Boolean).length;
  if (!ok) {
    throw new Error("No se pudieron descargar las teselas del mapa.");
  }

  ctx.font = font(12);
  const label = "© OpenStreetMap";
  const tw = ctx.measureText(label).width;
  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.fillRect(MAP_W - tw - 12, MAP_H - 20, tw + 12, 20);
  ctx.fillStyle = "#333";
  ctx.textAlign = "left";
  ctx.fillText(label, MAP_W - tw - 6, MAP_H - 6);
  return c;
}

function drawPin(ctx: any, x: number, y: number) {
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(x, y + 2, 13, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = "#1FAA59";
  ctx.beginPath();
  ctx.arc(x, y - 36, 24, 2.18, 0.96 + Math.PI * 2, false);
  ctx.lineTo(x, y);
  ctx.closePath();
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(x, y - 36, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

async function renderTarjeta(options: {
  lat: number;
  lon: number;
  title: string;
  address: string;
  color: [number, number, number] | null;
  zoom: number;
  button: string | null;
}): Promise<Buffer> {
  const canvasMod = await getCanvasModule();
  const { createCanvas } = canvasMod;
  const canvas = createCanvas(Math.round(W * S), Math.round(H * S));
  const ctx = canvas.getContext("2d");
  ctx.scale(S, S);
  ctx.textAlign = "left";

  const base = options.color || DEFAULT_COLOR;
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, rgba(mix(base, [255, 255, 255], 0.12), 1));
  bg.addColorStop(1, rgba(mix(base, [0, 0, 0], 0.25), 1));
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  const map = await buildMap(canvasMod, options.lat, options.lon, options.zoom);

  const TEXT_H = 130;
  const CARD_W = MAP_W;
  const CARD_H = MAP_H + TEXT_H;
  const PILL_H = 60;
  const GAP = 18;
  const total = (options.button ? PILL_H + GAP : 0) + CARD_H;
  const top = Math.round(625 - total / 2);
  const cardX = (W - CARD_W) / 2;
  const cardY = top + (options.button ? PILL_H + GAP : 0);

  if (options.button) {
    ctx.font = font(26, "bold");
    const label = `${options.button}  ›`;
    const pw = ctx.measureText(label).width + 64;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.25)";
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 6;
    rr(ctx, (W - pw) / 2, top, pw, PILL_H, PILL_H / 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = "#1b1b1f";
    ctx.textAlign = "center";
    ctx.fillText(label, W / 2, top + PILL_H / 2 + 9);
    ctx.textAlign = "left";
  }

  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 14;
  rr(ctx, cardX, cardY, CARD_W, CARD_H, 30);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.restore();

  ctx.save();
  rr(ctx, cardX, cardY, CARD_W, CARD_H, 30);
  ctx.clip();
  ctx.drawImage(map, cardX, cardY);
  ctx.restore();

  drawPin(ctx, cardX + MAP_W / 2, cardY + MAP_H / 2);

  ctx.fillStyle = "#16161a";
  ctx.font = font(30, "bold");
  const t1 = wrapText(ctx, options.title, CARD_W - 56, 1)[0] || "";
  ctx.fillText(t1, cardX + 28, cardY + MAP_H + 52);

  if (options.address) {
    ctx.fillStyle = "#6b6b73";
    ctx.font = font(22);
    wrapText(ctx, options.address, CARD_W - 56, 2).forEach((l, i) =>
      ctx.fillText(l, cardX + 28, cardY + MAP_H + 90 + i * 28),
    );
  }

  if (typeof canvas.toBuffer === "function") {
    try {
      return canvas.toBuffer("image/jpeg", 90);
    } catch {
      return canvas.toBuffer("image/png");
    }
  }
  throw new Error("Error al exportar el lienzo de imagen.");
}

function parseMapArgs(rawInput: string) {
  let raw = String(rawInput).trim();
  const o: {
    title: string | null;
    address: string | null;
    button: string | null;
    color: [number, number, number] | null;
    zoom: number;
  } = {
    title: null,
    address: null,
    button: "Ver ubicación",
    color: null,
    zoom: 15,
  };

  const FLAGS = "t|a|b|c|z|sinboton";
  const NEXT = `(?=\\s-(?:${FLAGS})(?:\\s|$)|\\s*\\||$)`;

  raw = raw.replace(/(?:^|\s)-sinboton(?=\s|$)/gi, () => {
    o.button = null;
    return " ";
  });

  raw = raw.replace(
    new RegExp(`(?:^|\\s)-(t|a|b)\\s+("[^"]*"|“[^”]*”|'[^']*'|[^|]+?${NEXT})`, "gi"),
    (_, n, val) => {
      const cleanVal = String(val).replace(/^["“'”]|["”'“]$/g, "").trim();
      const flag = String(n).toLowerCase();
      if (flag === "t") o.title = cleanVal.slice(0, 80);
      else if (flag === "a") o.address = cleanVal.slice(0, 160);
      else o.button = cleanVal.slice(0, 24) || null;
      return " ";
    },
  );

  raw = raw.replace(
    new RegExp(`(?:^|\\s)-(c|z)\\s+(?!-(?:${FLAGS})(?:\\s|$))(\\S+)`, "gi"),
    (_, n, val) => {
      if (String(n).toLowerCase() === "c") {
        o.color = hexToRgb(COLORES[String(val).toLowerCase()] || String(val)) || null;
      } else {
        const z = parseInt(String(val), 10);
        if (Number.isFinite(z)) o.zoom = Math.max(3, Math.min(18, z));
      }
      return " ";
    },
  );

  raw = raw.replace(/(?:^|\s)-(?:t|a|b|c|z)(?=\s|$)/gi, " ");
  raw = raw.replace(/\s{2,}/g, " ").trim();

  let query = raw;
  let text = "";
  if (raw.includes("|")) {
    const [q, ...rest] = raw.split("|");
    query = q.trim();
    text = rest.join("|").trim();
  }
  return { query, text, opts: o };
}

async function sendGroupStatus(sock: any, jid: string, content: Record<string, any>) {
  const bMod: any = await import("baileys");
  const genContent = bMod.generateWAMessageContent || bMod.default?.generateWAMessageContent;
  const genFromContent = bMod.generateWAMessageFromContent || bMod.default?.generateWAMessageFromContent;

  if (typeof genContent === "function" && typeof genFromContent === "function") {
    const inner = await genContent(content, {
      upload: sock.waUploadToServer,
    });
    const messageSecret = randomBytes(32);
    const msgObj = genFromContent(
      jid,
      {
        messageContextInfo: {
          messageSecret,
        },
        groupStatusMessageV2: {
          message: inner,
        },
      },
      {
        userJid: sock.user?.id,
      },
    );
    await sock.relayMessage(jid, msgObj.message, { messageId: msgObj.key.id });
    return;
  }

  await sock.sendMessage(jid, content);
}

function obtenerTodosLosIdsConocidos(sock: any): Set<string> {
  const ids = new Set<string>();
  const sources = [
    (global as any).db?.data?.users ? Object.keys((global as any).db.data.users) : [],
    sock?.chats ? Object.keys(sock.chats) : [],
    sock?.store?.chats?.keys ? Array.from(sock.store.chats.keys()) : [],
    sock?.store?.contacts ? Object.keys(sock.store.contacts) : [],
  ];

  for (const list of sources) {
    for (const id of list) {
      if (typeof id === "string" && /@(s\.whatsapp\.net|lid)$/.test(id)) {
        ids.add(jidNormalizedUser(id));
      }
    }
  }
  return ids;
}

async function resolverJidsReales(
  sock: any,
  idsOrigen: string[],
  knownParticipants: any[] = [],
): Promise> {
  const mapa = new Map<string, string>();
  const lidLookup = new Map<string, string>();

  for (const p of knownParticipants) {
    const lid = p?.lid ? jidNormalizedUser(p.lid) : p?.id?.endsWith("@lid") ? jidNormalizedUser(p.id) : "";
    const real =
      p?.jid && p.jid.endsWith("@s.whatsapp.net")
        ? jidNormalizedUser(p.jid)
        : p?.phoneNumber && p.phoneNumber.endsWith("@s.whatsapp.net")
          ? jidNormalizedUser(p.phoneNumber)
          : p?.id?.endsWith("@s.whatsapp.net")
            ? jidNormalizedUser(p.id)
            : "";

    if (lid && real) {
      lidLookup.set(lid, real);
    }
  }

  for (const rawId of idsOrigen) {
    if (!rawId) continue;
    const norm = jidNormalizedUser(rawId);
    if (norm.endsWith("@s.whatsapp.net")) {
      mapa.set(rawId, norm);
    } else if (norm.endsWith("@lid")) {
      mapa.set(rawId, lidLookup.get(norm) || norm);
    }
  }

  return mapa;
}

async function armarAudiencia(
  sock: any,
  msg: any,
  from: string,
  flagsObj: { test: boolean; todos: boolean },
): Promise<{ statusJidList: string[]; total: number; listName: string }> {
  const botId = sock.user?.id ? jidNormalizedUser(sock.user.id) : "";
  const botLid = sock.user?.lid ? jidNormalizedUser(sock.user.lid) : "";
  let idsOrigen: string[] = [];
  let listName = "";
  const participantPool: any[] = [];

  if (flagsObj.test) {
    const target = msg.key.participant || from;
    idsOrigen = [target];
    listName = "Prueba estadomapa";
  } else if (flagsObj.todos) {
    const idsSet = obtenerTodosLosIdsConocidos(sock);
    try {
      const grupos = await sock.groupFetchAllParticipating();
      for (const g of Object.values(grupos) as any[]) {
        for (const p of g.participants || []) {
          participantPool.push(p);
          const candidate = p.jid || p.phoneNumber || p.id;
          if (candidate) idsSet.add(jidNormalizedUser(candidate));
        }
      }
    } catch {}
    if (botId) idsSet.delete(botId);
    if (botLid) idsSet.delete(botLid);
    idsOrigen = [...idsSet].filter((id) => /@(s\.whatsapp\.net|lid)$/.test(id));
    listName = "Todos";
  } else if (from.endsWith("@g.us")) {
    const meta = await sock.groupMetadata(from);
    for (const p of meta.participants || []) {
      participantPool.push(p);
    }
    idsOrigen = (meta.participants || [])
      .map((p: any) => p.jid || p.phoneNumber || p.id)
      .filter((id: string) => {
        const norm = jidNormalizedUser(id);
        return norm && norm !== botId && norm !== botLid;
      });
    listName = meta.subject || "Grupo";
  } else {
    const idsSet = obtenerTodosLosIdsConocidos(sock);
    if (botId) idsSet.delete(botId);
    if (botLid) idsSet.delete(botLid);
    idsOrigen = [...idsSet];
    listName = "Interactuaron con el bot";
  }

  if (!idsOrigen.length) {
    throw new Error("No encontré usuarios conocidos para armar la audiencia.");
  }

  const mapa = await resolverJidsReales(sock, idsOrigen, participantPool);
  const statusJidList = Array.from(new Set([...mapa.values()].filter(Boolean)));

  if (!statusJidList.length) {
    throw new Error("No se pudo resolver el JID real de ningún usuario.");
  }

  return { statusJidList, total: idsOrigen.length, listName };
}

export default {
  name: ["map", "estadomapa", "estadoubi", "estadogps", "estadoubicacion"],
  category: "group",
  description: "Publica un estado con tarjeta de mapa y botón Ver ubicación.",
  groupOnly: false,

  async run(ctx: CommandContext) {
    const { sock, from, msg, args = [], usedPrefix, reply, react } = ctx;
    const prefix = usedPrefix || ".";

    try {
      const flags = new Set<string>();
      const rest = [...args];
      while (
        rest.length &&
        ["pv", "test", "todos", "aro", "nativo"].includes(rest[0].toLowerCase())
      ) {
        flags.add(rest.shift()!.toLowerCase());
      }

      const { query, text, opts } = parseMapArgs(rest.join(" "));

      const modoPv =
        flags.has("pv") ||
        flags.has("test") ||
        flags.has("todos") ||
        flags.has("aro") ||
        flags.has("nativo") ||
        !from.endsWith("@g.us");

      await react("⏳").catch(() => undefined);

      const ubi = await resolverUbicacion(msg, query);
      if (!ubi) {
        if (!query) {
          await react("❓").catch(() => undefined);
          return reply(
            `╭〔 📍 ${fytBold("Estado con Mapa")} 〕⬣\n` +
              `• \`${prefix}estadomapa Bogotá, Colombia\`\n` +
              `• \`${prefix}estadomapa 4.7110, -74.0721\`\n` +
              `• Responde a una ubicación con \`${prefix}estadomapa\`\n\n` +
              `• *Opciones:* \`-t "Título"\` \`-a "Dirección"\` \`-b "Botón"\` \`-sinboton\` \`-c azul\` \`-z 15\`\n` +
              `• *Texto extra:* \`${prefix}estadomapa Bogotá | Mi viaje\`\n` +
              `• *Estado del bot:* \`${prefix}estadomapa pv Bogotá\` (\`test\`, \`todos\`, \`aro\`, \`nativo\`)\n` +
              `╰━━━━━━━━━━━━⬣`,
          );
        }
        await react("🔍").catch(() => undefined);
        return reply(`❌ No se encontró la ubicación solicitada: \`${query}\``);
      }

      const title = opts.title || ubi.title;
      const address = opts.address != null ? opts.address : ubi.address;
      const gmaps = `https://www.google.com/maps?q=${ubi.lat},${ubi.lon}`;

      let content: Record<string, any>;
      if (flags.has("nativo")) {
        content = {
          location: {
            degreesLatitude: ubi.lat,
            degreesLongitude: ubi.lon,
            name: title,
            address: address || undefined,
          },
        };
      } else {
        const buf = await renderTarjeta({
          lat: ubi.lat,
          lon: ubi.lon,
          title,
          address,
          color: opts.color,
          zoom: opts.zoom,
          button: opts.button,
        });
        const caption =
          `📍 ${title}` +
          (address ? `\n${address}` : "") +
          `\n${gmaps}` +
          (text ? `\n\n${text}` : "");

        content = {
          image: buf,
          mimetype: "image/jpeg",
          caption: caption.slice(0, 900),
          backgroundColor: opts.color
            ? `#${opts.color.map((v) => v.toString(16).padStart(2, "0")).join("")}`
            : "#8E6BA8",
        };
      }

      if (!modoPv) {
        await sendGroupStatus(sock, from, content);
        await react("✅").catch(() => undefined);
        return;
      }

      const aud = await armarAudiencia(sock, msg, from, {
        test: flags.has("test"),
        todos: flags.has("todos"),
      });

      if (flags.has("aro")) {
        content.contextInfo = {
          statusAudienceMetadata: {
            audienceType: 1,
            listName: aud.listName,
            listEmoji: "🧁",
          },
        };
      }

      const resultado = await sock.sendMessage("status@broadcast", content as any, {
        broadcast: true,
        statusJidList: aud.statusJidList,
      } as any);

      if (!resultado?.key?.id) {
        throw new Error("sendMessage no devolvió un key/id válido.");
      }

      await react("✅").catch(() => undefined);
      await reply(
        `✅ ¡Estado publicado para \`${aud.statusJidList.length}/${aud.total}\` usuario(s)!`,
      );
    } catch (e: any) {
      await react("❌").catch(() => undefined);
      await reply(`⚠️ Error:\n\`\`\`${e?.message || String(e)}\`\`\``);
    }
  },
};
