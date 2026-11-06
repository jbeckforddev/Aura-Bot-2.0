import {
  existsSync,
  readdirSync,
  createReadStream,
  readFileSync,
  statSync,
} from "node:fs";
import path from "node:path";
import type { proto } from "baileys";
import { prepareWAMessageMedia } from "baileys";
import type {
  CommandPlugin,
  CommandContext,
} from "../../types/commands.d.ts";
import { getPlugins } from "../../core/cmdLoader.ts";
import { resolveBotType } from "../../core/botType.ts";
import { sendWithRecordingPresence } from "../../core/mediaSendUtils.ts";
import { fytBold } from "../../core/socketText.ts";
import { t, translateText } from "../../src/langs/index.ts";

type CachedMediaMessage =
  | proto.Message.IImageMessage
  | proto.Message.IVideoMessage;

interface MenuCommandItem {
  name: string;
  aliases: string[];
  category: string;
  desc: string;
}

const mediaCacheMap: Map<string, CachedMediaMessage> =
  (
    globalThis as unknown as {
      __menuMediaCache?: Map<string, CachedMediaMessage>;
    }
  ).__menuMediaCache ??
  ((
    globalThis as unknown as {
      __menuMediaCache?: Map<string, CachedMediaMessage>;
    }
  ).__menuMediaCache = new Map<string, CachedMediaMessage>());

const bannerDataUriCache = new Map<string, string>();

export function clearMenuMediaCache() {
  mediaCacheMap.clear();
  bannerDataUriCache.clear();
  (
    globalThis as unknown as {
      __menuMediaCache?: Map<string, CachedMediaMessage>;
    }
  ).__menuMediaCache?.clear();
}

export async function preloadMenuBanner(sock: { waUploadToServer?: any }) {
  const bannerPath = path.resolve("./assets/img/BotBanner.jpg");
  if (
    mediaCacheMap.has(bannerPath) ||
    !existsSync(bannerPath) ||
    !sock?.waUploadToServer
  ) {
    return;
  }
  try {
    const prepared = await prepareWAMessageMedia(
      { image: createReadStream(bannerPath) },
      {
        upload: sock.waUploadToServer,
        mediaTypeOverride: "thumbnail-link",
      },
    );
    if (prepared.imageMessage) {
      mediaCacheMap.set(bannerPath, prepared.imageMessage);
    }
  } catch {}
}

function getCommandCategories(): string[] {
  let dirs: string[] = [];
  try {
    dirs = readdirSync(path.resolve("./cmd"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name.toLowerCase());
  } catch {}

  const pluginCategories = [...getPlugins().values()]
    .filter((plugin) => !plugin.hideCmd)
    .map((plugin) => String(plugin?.category || "general").toLowerCase())
    .filter(Boolean);

  return [...new Set([...dirs, ...pluginCategories])].sort();
}

async function resolveBannerDataUri(
  sock: any,
  botRecord: any,
): Promise<string> {
  let bannerPath = path.resolve("./assets/img/BotBanner.jpg");
  const dataDir = path.resolve(globalThis.DATA_BASE_DIR || "./data");
  const bannerFileName = String(
    botRecord?.currentBanner || botRecord?.data?.currentBanner || "",
  ).trim();
  const storedBannerPath = bannerFileName
    ? path.join(dataDir, path.basename(bannerFileName))
    : "";

  const customBanner =
    (storedBannerPath && existsSync(storedBannerPath)
      ? { path: storedBannerPath }
      : null) ??
    botRecord?.data?.customBanner ??
    null;

  if (customBanner?.base64) {
    const mime = customBanner.mimetype || "image/jpeg";
    return `data:${mime};base64,${customBanner.base64}`;
  }

  if (customBanner?.path && existsSync(path.resolve(customBanner.path))) {
    bannerPath = path.resolve(customBanner.path);
  }

  const cachedUri = bannerDataUriCache.get(bannerPath);
  if (cachedUri) return cachedUri;

  if (!existsSync(bannerPath)) return "";

  try {
    const stat = statSync(bannerPath);
    const ext = path.extname(bannerPath).toLowerCase();
    const mime =
      ext === ".webp"
        ? "image/webp"
        : ext === ".png"
          ? "image/png"
          : ext === ".gif"
            ? "image/gif"
            : "image/jpeg";

    // Si la imagen pesa menos de 110 KB, se incrusta directo en alta calidad
    if (stat.size <= 110_000) {
      const b64 = readFileSync(bannerPath).toString("base64");
      const uri = `data:${mime};base64,${b64}`;
      bannerDataUriCache.set(bannerPath, uri);
      return uri;
    }

    // Si es más pesada, usamos el jpegThumbnail comprimido de Baileys para no saturar el WebView
    let imgBanner = mediaCacheMap.get(bannerPath);
    if (!imgBanner && sock?.waUploadToServer) {
      const prepared = await prepareWAMessageMedia(
        { image: createReadStream(bannerPath) },
        {
          upload: sock.waUploadToServer,
          mediaTypeOverride: "thumbnail-link",
        },
      );
      if (prepared.imageMessage) {
        imgBanner = prepared.imageMessage;
        mediaCacheMap.set(bannerPath, imgBanner);
      }
    }

    if (imgBanner?.jpegThumbnail) {
      const b64 = Buffer.from(imgBanner.jpegThumbnail).toString("base64");
      const uri = `data:image/jpeg;base64,${b64}`;
      bannerDataUriCache.set(bannerPath, uri);
      return uri;
    }
  } catch {}

  return "";
}

function buildInteractiveMenuPayload(data: {
  botName: string;
  botType: string;
  userName: string;
  prefix: string;
  date: string;
  bannerUri: string;
  initialCategory: string;
  categories: string[];
  commands: MenuCommandItem[];
}) {
  const serialized = JSON.stringify(data);

  const html = `<style>
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#090514;color:#f3e8ff;padding:10px;min-height:100vh}
.app{max-width:420px;margin:0 auto;background:linear-gradient(180deg,#130924 0%,#0b0516 100%);border:1px solid #2e1a47;border-radius:20px;overflow:hidden;box-shadow:0 20px 50px rgba(0,0,0,.75),0 0 25px rgba(139,92,246,.15)}

/* HERO BANNER */
.hero{position:relative;height:155px;background:radial-gradient(circle at 30% 20%,#4c1d95,#1e0b36 70%);overflow:hidden}
.hero img{width:100%;height:100%;object-fit:cover;display:block;filter:brightness(0.85) saturate(1.15)}
.hero-overlay{position:absolute;inset:0;background:linear-gradient(180deg,rgba(9,5,20,0.15) 0%,rgba(19,9,36,0.96) 100%);display:flex;flex-direction:column;justify-content:space-between;padding:12px 14px}
.top-badges{display:flex;justify-content:space-between;align-items:center}
.pill{background:rgba(15,7,28,0.75);backdrop-filter:blur(6px);border:1px solid rgba(168,85,247,0.45);color:#e9d5ff;font-size:10px;font-weight:800;padding:4px 9px;border-radius:999px;letter-spacing:.6px;text-transform:uppercase}
.pill.accent{background:rgba(139,92,246,0.28);color:#d8b4fe;border-color:#a855f7}
.hero-info h1{font-size:18px;font-weight:900;letter-spacing:.8px;color:#fff;text-shadow:0 2px 10px rgba(0,0,0,.8)}
.hero-sub{font-size:11.5px;color:#c4b5fd;margin-top:2px;display:flex;gap:10px;align-items:center}

/* BUSCADOR */
.controls{padding:12px 14px 8px;border-bottom:1px solid #231438}
.search-wrap{position:relative;margin-bottom:10px}
.search-input{width:100%;background:#170d2b;border:1px solid #352056;color:#f5f3ff;padding:9px 32px 9px 12px;border-radius:12px;font-size:12.5px;outline:none;transition:border-color .2s}
.search-input:focus{border-color:#a855f7;box-shadow:0 0 12px rgba(168,85,247,.25)}
.search-input::placeholder{color:#7c669e}
.clear-btn{position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;color:#a78bfa;font-size:14px;font-weight:900;cursor:pointer;padding:4px;display:none}

/* NAVEGACIÓN DE CATEGORÍAS */
.sec-label{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1px;color:#8b74b0;margin-bottom:6px;display:flex;justify-content:space-between}
.tabs{display:flex;gap:6px;overflow-x:auto;padding-bottom:6px;scrollbar-width:none}
.tabs::-webkit-scrollbar{display:none}
.tab-btn{flex:none;background:#170d2b;border:1px solid #2d1b4a;color:#c4b5fd;padding:6px 11px;border-radius:10px;font-size:11.5px;font-weight:700;cursor:pointer;transition:all .15s}
.tab-btn.active{background:linear-gradient(135deg,#8b5cf6,#6d28d9);color:#fff;border-color:#c084fc;box-shadow:0 4px 12px rgba(139,92,246,.35)}

/* BARRA ALFABÉTICA (A-Z) */
.az-bar{display:flex;gap:4px;overflow-x:auto;padding:6px 0 2px;scrollbar-width:none}
.az-bar::-webkit-scrollbar{display:none}
.az-btn{flex:none;min-width:26px;height:26px;border-radius:7px;background:#140b25;border:1px solid #26163f;color:#9d84c4;font-size:11px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center}
.az-btn.has-cmd{color:#ddd6fe;border-color:#3b2363}
.az-btn.active{background:#a855f7;color:#fff;border-color:#e9d5ff;box-shadow:0 0 10px rgba(168,85,247,.45)}
.az-btn.disabled{opacity:.3;pointer-events:none}

/* LISTA DE COMANDOS */
.cmd-list{padding:10px 14px;display:flex;flex-direction:column;gap:8px;min-height:230px}
.cmd-card{background:#150c28;border:1px solid #271742;border-radius:13px;padding:10px 12px;display:flex;justify-content:space-between;align-items:center;gap:10px;cursor:pointer;transition:transform .1s,border-color .15s}
.cmd-card:active{transform:scale(0.98);border-color:#a855f7}
.cmd-main{min-width:0;flex:1}
.cmd-head{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.cmd-name{font-size:13.5px;font-weight:800;color:#e9d5ff;font-family:'Courier New',monospace}
.cmd-cat{font-size:9.5px;font-weight:800;text-transform:uppercase;padding:2px 6px;border-radius:5px;background:rgba(139,92,246,0.18);color:#c084fc;border:1px solid rgba(168,85,247,0.3)}
.cmd-desc{font-size:11.5px;color:#9ca3af;margin-top:3px;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.cmd-aliases{font-size:10px;color:#7c669e;margin-top:3px}
.copy-tag{flex:none;background:#1f113a;border:1px solid #3b2363;color:#d8b4fe;font-size:10.5px;font-weight:800;padding:5px 9px;border-radius:8px}

.empty{text-align:center;padding:38px 16px;color:#7c669e;font-size:12.5px}

/* PAGINACIÓN */
.pager{display:flex;justify-content:space-between;align-items:center;padding:10px 14px 12px;border-top:1px solid #231438;background:#0e071c}
.nav-btn{background:#1b0f33;border:1px solid #352056;color:#e9d5ff;padding:6px 12px;border-radius:9px;font-size:11.5px;font-weight:800;cursor:pointer}
.nav-btn:disabled{opacity:.35;pointer-events:none}
.page-info{font-size:11px;color:#a78bfa;font-weight:700}

/* TOAST */
.toast{position:fixed;bottom:16px;left:50%;transform:translateX(-50%) translateY(20px);background:#7c3aed;color:#fff;font-size:12px;font-weight:800;padding:8px 16px;border-radius:999px;box-shadow:0 8px 25px rgba(0,0,0,.6);opacity:0;pointer-events:none;transition:all .2s;z-index:99}
.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
</style>

<div class="app">
  <div class="hero">
    <img id="bannerImg" style="display:none" alt="Banner">
    <div class="hero-overlay">
      <div class="top-badges">
        <span class="pill accent" id="botTypeBadge"></span>
        <span class="pill" id="prefixBadge"></span>
      </div>
      <div class="hero-info">
        <h1 id="botTitle"></h1>
        <div class="hero-sub">
          <span id="userGreet"></span>
          <span>•</span>
          <span id="totalCmds"></span>
        </div>
      </div>
    </div>
  </div>

  <div class="controls">
    <div class="search-wrap">
      <input type="text" id="searchInput" class="search-input" placeholder="Buscar comando o función...">
      <button class="clear-btn" id="clearBtn" onclick="clearSearch()">✕</button>
    </div>

    <div class="sec-label">
      <span>Categorías</span>
      <span id="activeFilterLabel">Todos</span>
    </div>
    <div class="tabs" id="catTabs"></div>

    <div class="sec-label" style="margin-top:8px">
      <span>Filtrar por letra</span>
      <span id="letterIndicator">A-Z</span>
    </div>
    <div class="az-bar" id="azBar"></div>
  </div>

  <div class="cmd-list" id="cmdList"></div>

  <div class="pager">
    <button class="nav-btn" id="prevBtn" onclick="changePage(-1)">◀ Anterior</button>
    <span class="page-info" id="pageInfo">1 / 1</span>
    <button class="nav-btn" id="nextBtn" onclick="changePage(1)">Siguiente ▶</button>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
const DATA = ${serialized};
const PAGE_SIZE = 6;
const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

let currentCat = DATA.initialCategory && DATA.categories.includes(DATA.initialCategory)
  ? DATA.initialCategory
  : "all";
let currentLetter = "all";
let searchQuery = "";
let currentPage = 1;

function $(id) { return document.getElementById(id); }

function init() {
  if (DATA.bannerUri) {
    const img = $("bannerImg");
    img.src = DATA.bannerUri;
    img.style.display = "block";
  }
  $("botTitle").textContent = DATA.botName;
  $("botTypeBadge").textContent = DATA.botType;
  $("prefixBadge").textContent = "Prefijo: " + DATA.prefix;
  $("userGreet").textContent = "Hola, " + DATA.userName;
  $("totalCmds").textContent = DATA.commands.length + " comandos";

  $("searchInput").addEventListener("input", function(e) {
    searchQuery = (e.target.value || "").trim().toLowerCase();
    $("clearBtn").style.display = searchQuery ? "block" : "none";
    currentPage = 1;
    renderAll();
  });

  renderAll();
}

function clearSearch() {
  $("searchInput").value = "";
  searchQuery = "";
  $("clearBtn").style.display = "none";
  currentPage = 1;
  renderAll();
}

function selectCat(cat) {
  currentCat = cat;
  currentLetter = "all";
  currentPage = 1;
  renderAll();
}

function selectLetter(letter) {
  currentLetter = currentLetter === letter ? "all" : letter;
  currentPage = 1;
  renderAll();
}

function changePage(delta) {
  currentPage += delta;
  renderList();
}

function getCatFiltered() {
  return DATA.commands.filter(function(c) {
    if (currentCat !== "all" && c.category !== currentCat) return false;
    if (searchQuery) {
      const matchName = c.name.toLowerCase().includes(searchQuery);
      const matchAlias = c.aliases.some(function(a) { return a.toLowerCase().includes(searchQuery); });
      const matchDesc = c.desc.toLowerCase().includes(searchQuery);
      if (!matchName && !matchAlias && !matchDesc) return false;
    }
    return true;
  });
}

function getFinalFiltered() {
  const base = getCatFiltered();
  if (currentLetter === "all") return base;
  return base.filter(function(c) {
    return c.name.charAt(0).toUpperCase() === currentLetter;
  });
}

function renderTabs() {
  const counts = { all: DATA.commands.length };
  DATA.commands.forEach(function(c) {
    counts[c.category] = (counts[c.category] || 0) + 1;
  });

  let html = '<button class="tab-btn ' + (currentCat === "all" ? "active" : "") + '" onclick="selectCat(\\'all\\')">⚡ Todos (' + counts.all + ')</button>';
  DATA.categories.forEach(function(cat) {
    if (!counts[cat]) return;
    const label = cat.charAt(0).toUpperCase() + cat.slice(1);
    const active = currentCat === cat ? "active" : "";
    html += '<button class="tab-btn ' + active + '" onclick="selectCat(\\'' + cat + '\\')">' + label + ' (' + counts[cat] + ')</button>';
  });
  $("catTabs").innerHTML = html;
  $("activeFilterLabel").textContent = currentCat === "all" ? "Todos" : currentCat.toUpperCase();
}

function renderAzBar() {
  const availableLetters = new Set();
  getCatFiltered().forEach(function(c) {
    const first = c.name.charAt(0).toUpperCase();
    if (first) availableLetters.add(first);
  });

  let html = '<button class="az-btn has-cmd ' + (currentLetter === "all" ? "active" : "") + '" style="padding:0 8px" onclick="selectLetter(\\'all\\')">TODAS</button>';
  LETTERS.forEach(function(L) {
    const has = availableLetters.has(L);
    const active = currentLetter === L ? "active" : "";
    const cls = has ? "has-cmd " + active : "disabled";
    html += '<button class="az-btn ' + cls + '" onclick="selectLetter(\\'' + L + '\\')">' + L + '</button>';
  });
  $("azBar").innerHTML = html;
  $("letterIndicator").textContent = currentLetter === "all" ? "A-Z" : "Letra " + currentLetter;
}

function copyCommand(cmdText) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(cmdText).catch(function() {});
  } else {
    const el = document.createElement("textarea");
    el.value = cmdText;
    document.body.appendChild(el);
    el.select();
    try { document.execCommand("copy"); } catch(e) {}
    document.body.removeChild(el);
  }
  const t = $("toast");
  t.textContent = "Copiado: " + cmdText;
  t.classList.add("show");
  setTimeout(function() { t.classList.remove("show"); }, 1600);
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderList() {
  const list = getFinalFiltered();
  const totalPages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
  if (currentPage > totalPages) currentPage = totalPages;
  if (currentPage < 1) currentPage = 1;

  const start = (currentPage - 1) * PAGE_SIZE;
  const pageItems = list.slice(start, start + PAGE_SIZE);

  if (pageItems.length === 0) {
    $("cmdList").innerHTML = '<div class="empty">No se encontraron comandos con ese filtro.</div>';
  } else {
    $("cmdList").innerHTML = pageItems.map(function(c) {
      const fullCmd = DATA.prefix + c.name;
      const aliasText = c.aliases.length
        ? '<div class="cmd-aliases">Alias: ' + escapeHtml(c.aliases.map(function(a){ return DATA.prefix + a; }).join(", ")) + '</div>'
        : '';
      return '<div class="cmd-card" onclick="copyCommand(\\'' + fullCmd.replace(/'/g, "") + '\\')">' +
        '<div class="cmd-main">' +
          '<div class="cmd-head">' +
            '<span class="cmd-name">' + escapeHtml(fullCmd) + '</span>' +
            '<span class="cmd-cat">' + escapeHtml(c.category) + '</span>' +
          '</div>' +
          '<div class="cmd-desc">' + escapeHtml(c.desc || "Sin descripción") + '</div>' +
          aliasText +
        '</div>' +
        '<span class="copy-tag">Copiar</span>' +
      '</div>';
    }).join("");
  }

  $("pageInfo").textContent = "Página " + currentPage + " de " + totalPages + " (" + list.length + ")";
  $("prevBtn").disabled = currentPage <= 1;
  $("nextBtn").disabled = currentPage >= totalPages;
}

function renderAll() {
  renderTabs();
  renderAzBar();
  renderList();
}

init();
</script>`;

  return {
    view_model: {
      __typename: "GenAISingleLayoutViewModel",
      primitive: {
        __typename: "FOAHtmlPrimitiveDemoDONOTUSE",
        trusted_sources: [],
        payload: html,
      },
    },
  };
}

export default {
  name: ["menu", "help", "h", "menú"],
  description: t("socketMenuDescription"),
  category: "socket",
  ownerOnly: false,
  modOnly: false,
  adminOnly: false,
  premiumOnly: false,
  groupOnly: false,
  privateOnly: false,
  botUserOnly: false,

  async run(ctx: CommandContext) {
    const { sock, from, msg, args, prefix, usedPrefix, db: runtimeDb } = ctx;
    const quotedMessage = msg?.key ? { ...msg, key: msg.key } : undefined;
    const activePrefix =
      prefix ?? usedPrefix ?? globalThis.DEFAULT_PREFIXES?.[0] ?? ".";
    const remoteJid = from;
    const pushName = msg?.pushName || "Usuario";
    const botRecord = runtimeDb?.getBot?.(ctx.botJid || sock.user?.id);
    const botName = botRecord?.bot_name || "Aura Reed";
    const botType = resolveBotType(botRecord?.bot_type, sock.isSubBot);
    const requested = args && args[0] ? args[0].toLowerCase() : "";

    const categoryAliases: Record<string, string> = {
      ayuda: "system",
      comandos: "system",
      general: "system",
      socket: "socket",
      soporte: "system",
      download: "download",
      media: "download",
      system: "system",
      admin: "admin",
      administrador: "admin",
      owner: "owner",
      propietario: "owner",
    };

    const initialCategory = requested
      ? categoryAliases[requested] || requested
      : "all";

    const categories = getCommandCategories();
    const pluginMap = getPlugins();
    const uniquePlugins = [
      ...new Map(
        [...pluginMap.values()].map((plugin) => [plugin, plugin]),
      ).values(),
    ].filter(
      (plugin) =>
        plugin && !plugin.hideCmd && typeof plugin.run === "function",
    );

    const commands: MenuCommandItem[] = uniquePlugins
      .map((cmd: CommandPlugin) => {
        const names = (Array.isArray(cmd.name) ? cmd.name : [cmd.name])
          .map((n) => String(n || "").trim())
          .filter(Boolean);
        const primaryName = names[0] || "cmd";
        const aliases = names.slice(1);
        const category = String(cmd.category || "general").toLowerCase();

        let rawDesc = "";
        if (Array.isArray(cmd.description)) {
          rawDesc = String(cmd.description[0] || "");
        } else if (typeof cmd.description === "string") {
          rawDesc = cmd.description;
        }

        return {
          name: primaryName,
          aliases,
          category,
          desc: rawDesc ? translateText(rawDesc) : "Comando disponible",
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    const bannerUri = await resolveBannerDataUri(sock, botRecord);

    try {
      const { AIRich } = await import("baileys/lib/Builders/ai-rich.js");
      const rich = new AIRich(sock)
        .setTitle(`🟣 ${String(botName).toUpperCase()} // MENU`)
        .setFooter("Toca para navegar por categorías o buscar por letra");

      rich.addSection(
        buildInteractiveMenuPayload({
          botName: String(botName).toUpperCase(),
          botType,
          userName: pushName,
          prefix: activePrefix,
          date: new Date().toLocaleDateString("es-CR"),
          bannerUri,
          initialCategory,
          categories,
          commands,
        }),
      );

      await rich.send(
        remoteJid,
        quotedMessage ? { quoted: quotedMessage } : {},
      );
    } catch (error) {
      await sock.sendMessage(
        remoteJid,
        {
          text: `${fytBold(String(botName).toUpperCase())}\nError al cargar la interfaz interactiva: ${String(error)}`,
        },
        quotedMessage ? { quoted: quotedMessage } : undefined,
      );
    }

    const dataDir = path.resolve(globalThis.DATA_BASE_DIR || "./data");
    const audioFileName = String(
      botRecord?.currentAudio || botRecord?.data?.currentAudio || "",
    ).trim();
    const storedAudioPath = audioFileName
      ? path.join(dataDir, path.basename(audioFileName))
      : "";
    const customAudio =
      (storedAudioPath && existsSync(storedAudioPath)
        ? { path: storedAudioPath }
        : null) ??
      botRecord?.data?.customAudio ??
      null;

    if (customAudio?.path && existsSync(customAudio.path)) {
      await sendWithRecordingPresence(sock, remoteJid, () =>
        sock.sendMessage(
          remoteJid,
          {
            audio: createReadStream(customAudio.path),
            mimetype: "audio/ogg; codecs=opus",
            ptt: true,
          },
          quotedMessage ? { quoted: quotedMessage } : undefined,
        ),
      );
    } else if (customAudio?.base64) {
      await sendWithRecordingPresence(sock, remoteJid, () =>
        sock.sendMessage(
          remoteJid,
          {
            audio: Buffer.from(customAudio.base64, "base64"),
            mimetype: customAudio.mimetype || "audio/ogg; codecs=opus",
            ptt: customAudio.ptt ?? true,
          },
          quotedMessage ? { quoted: quotedMessage } : undefined,
        ),
      );
    }
  },
};
