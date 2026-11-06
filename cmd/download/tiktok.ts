import { rm } from "node:fs/promises";
import {
  downloadToCache,
  pickSearchResult,
  requestJson,
  safeFileName,
  formatCount,
} from "../../core/downloadUtils.ts";
import { DL_CONFIG } from "../../config.ts";
import {
  prepareDownloadCharge,
  confirmDownloadCharge,
  formatMoney,
} from "../../core/economyConfig.ts";
import type {
  CommandContext,
  TikTokSearchResponse,
} from "../../types/index.d.ts";
import { isTikTokUrl, tiktokUrlFormatter } from "../../utils/formatter.ts";
import { fytBold } from "../../core/socketText.ts";
import { DL_TEMPLATE } from "../../utils/template.ts";
import { CONVERT_TO_AVC } from "../../utils/converter.ts";
import { sendAlbumMessage } from "../../core/mediaSendUtils.ts";
import { t } from "../../src/langs/index.ts";

const LEGACY_API = DL_CONFIG.alya.BASE_URL.replace(/\/+$/, "");
const KEY = DL_CONFIG.alya.API_KEY;
const TIKWM_API = "https://www.tikwm.com/api";
const CACHE_TTL = 300_000;

type TikWMVideoResponse = {
  code?: number;
  msg?: string;
  data?: {
    id?: string;
    title?: string;
    cover?: string;
    origin_cover?: string;
    duration?: number;
    play?: string;
    wmplay?: string;
    hdplay?: string;
    images?: string[];
    music_info?: {
      title?: string;
      author?: string;
      play?: string;
    };
    author?: {
      nickname?: string;
      fullname?: string;
      unique_id?: string;
      avatar?: string;
    };
    play_count?: number | string;
    digg_count?: number | string;
    comment_count?: number | string;
    share_count?: number | string;
  };
};

const searchCache = new Map<string, { url: string; exp: number }>();
const metaCache = new Map<string, { data: TikWMVideoResponse; exp: number }>();

function pruneCache<T>(cache: Map<string, { exp: number } & T>) {
  if (cache.size <= 150) return;
  const now = Date.now();
  for (const [key, value] of cache.entries()) {
    if (value.exp <= now) cache.delete(key);
  }
}

async function fetchImageAsDataUri(imageUrl?: string): Promise<string> {
  if (!imageUrl || !/^https?:\/\//.test(imageUrl)) return "";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(imageUrl, { signal: controller.signal });
    if (!res.ok) return "";
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 130_000) return "";
    const mime = res.headers.get("content-type") || "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return "";
  } finally {
    clearTimeout(timer);
  }
}

function buildTikTokRichCard(cardData: {
  id: string;
  title: string;
  author: string;
  handle: string;
  views: string;
  likes: string;
  comments: string;
  shares: string;
  duration: string;
  music: string;
  cost: string;
  url: string;
  mode: "VIDEO HD" | "PHOTO ALBUM";
  coverUri: string;
  avatarUri: string;
}) {
  const serialized = JSON.stringify(cardData);

  const html = `<style>
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#040407;color:#f8fafc;padding:10px}
.card{max-width:410px;margin:0 auto;background:#09090f;border:1px solid #1f1f2e;border-radius:20px;overflow:hidden;box-shadow:0 20px 50px rgba(0,0,0,.85),0 0 25px rgba(254,44,85,.12);position:relative}
.card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#25f4ee,#fe2c55,#25f4ee);background-size:200% 100%;animation:glow 3s linear infinite;z-index:5}
@keyframes glow{0%{background-position:0% 0%}100%{background-position:200% 0%}}

.hero{position:relative;height:150px;background:radial-gradient(circle at 20% 20%,#2b0918,#081c24 85%);overflow:hidden}
.hero-cov{width:100%;height:100%;object-fit:cover;display:block;filter:brightness(0.75) contrast(1.1)}
.hero-shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(4,4,7,0.2) 0%,rgba(9,9,15,0.98) 100%);display:flex;flex-direction:column;justify-content:space-between;padding:12px 14px}

.top-bar{display:flex;justify-content:space-between;align-items:center}
.badge{font-size:10px;font-weight:900;letter-spacing:.8px;padding:4px 9px;border-radius:999px;text-transform:uppercase;backdrop-filter:blur(6px)}
.badge-mode{background:rgba(254,44,85,0.22);color:#ff6b8b;border:1px solid rgba(254,44,85,0.5)}
.badge-cost{background:rgba(37,244,238,0.16);color:#25f4ee;border:1px solid rgba(37,244,238,0.45)}

.author-row{display:flex;align-items:center;gap:10px}
.avatar{width:40px;height:40px;border-radius:50%;border:2px solid #25f4ee;background:#161622;object-fit:cover;flex:none;display:flex;align-items:center;justify-content:center;font-weight:900;color:#25f4ee;font-size:15px}
.author-meta{min-width:0;flex:1}
.author-name{font-size:14.5px;font-weight:900;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.author-sub{font-size:11px;color:#94a3b8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

.body{padding:12px 14px 14px}
.caption{font-size:12px;color:#cbd5e1;line-height:1.4;background:#0f0f18;border:1px solid #1c1c2b;border-radius:11px;padding:9px 11px;margin-bottom:12px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.music-row{display:flex;align-items:center;gap:6px;font-size:11px;color:#25f4ee;margin-bottom:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:12px}
.stat-box{background:#0e0e17;border:1px solid #1b1b29;border-radius:11px;padding:7px 4px;text-align:center}
.stat-val{font-size:12.5px;font-weight:900;color:#fff}
.stat-lbl{font-size:9.5px;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-top:2px}

.actions{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.btn{border:none;border-radius:10px;padding:9px 10px;font-size:11.5px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;transition:transform .1s}
.btn:active{transform:scale(0.96)}
.btn-copy{background:linear-gradient(135deg,#fe2c55,#d91b42);color:#fff;box-shadow:0 4px 14px rgba(254,44,85,.3)}
.btn-info{background:#151522;border:1px solid #28283e;color:#25f4ee}

.toast{position:fixed;bottom:14px;left:50%;transform:translateX(-50%) translateY(20px);background:#25f4ee;color:#040407;font-size:11.5px;font-weight:900;padding:7px 14px;border-radius:999px;opacity:0;pointer-events:none;transition:all .2s;z-index:99}
.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
</style>

<div class="card">
  <div class="hero">
    <img id="covImg" class="hero-cov" style="display:none" alt="Cover">
    <div class="hero-shade">
      <div class="top-bar">
        <span class="badge badge-mode" id="modeBadge"></span>
        <span class="badge badge-cost" id="costBadge"></span>
      </div>
      <div class="author-row">
        <img id="avaImg" class="avatar" style="display:none" alt="Avatar">
        <div id="avaFallback" class="avatar">♪</div>
        <div class="author-meta">
          <div class="author-name" id="authorName"></div>
          <div class="author-sub" id="authorHandle"></div>
        </div>
      </div>
    </div>
  </div>

  <div class="body">
    <div class="caption" id="videoTitle"></div>
    <div class="music-row" id="musicInfo"></div>

    <div class="stats">
      <div class="stat-box">
        <div class="stat-val" id="stViews"></div>
        <div class="stat-lbl">Vistas</div>
      </div>
      <div class="stat-box">
        <div class="stat-val" id="stLikes"></div>
        <div class="stat-lbl">Likes</div>
      </div>
      <div class="stat-box">
        <div class="stat-val" id="stComments"></div>
        <div class="stat-lbl">Coments</div>
      </div>
      <div class="stat-box">
        <div class="stat-val" id="stShares"></div>
        <div class="stat-lbl">Shares</div>
      </div>
    </div>

    <div class="actions">
      <button class="btn btn-copy" onclick="copyUrl()">🔗 Copiar Enlace</button>
      <button class="btn btn-info" onclick="showDetails()">📊 Ver Ficha</button>
    </div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
const D = ${serialized};
function $(id){ return document.getElementById(id); }

function init(){
  if (D.coverUri) {
    $("covImg").src = D.coverUri;
    $("covImg").style.display = "block";
  }
  if (D.avatarUri) {
    $("avaImg").src = D.avatarUri;
    $("avaImg").style.display = "block";
    $("avaFallback").style.display = "none";
  }
  $("modeBadge").textContent = "♪ " + D.mode + (D.duration ? " • " + D.duration : "");
  $("costBadge").textContent = D.cost;
  $("authorName").textContent = D.author;
  $("authorHandle").textContent = "@" + D.handle;
  $("videoTitle").textContent = D.title;
  $("musicInfo").textContent = "🎵 " + D.music;
  $("stViews").textContent = D.views;
  $("stLikes").textContent = D.likes;
  $("stComments").textContent = D.comments;
  $("stShares").textContent = D.shares;
}

function copyUrl(){
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(D.url).catch(function(){});
  } else {
    const t = document.createElement("textarea");
    t.value = D.url;
    document.body.appendChild(t);
    t.select();
    try { document.execCommand("copy"); } catch(e){}
    document.body.removeChild(t);
  }
  const el = $("toast");
  el.textContent = "Enlace copiado al portapapeles";
  el.classList.add("show");
  setTimeout(function(){ el.classList.remove("show"); }, 1600);
}

function showDetails(){
  alert(
    "🎵 TIKTOK ENGINE // METADATA\\n\\n" +
    "• ID: " + D.id + "\\n" +
    "• Autor: " + D.author + " (@" + D.handle + ")\\n" +
    "• Formato: " + D.mode + " (AVC H.264)\\n" +
    "• Audio: " + D.music + "\\n" +
    "• Estadísticas: " + D.views + " vistas | " + D.likes + " likes\\n" +
    "• Costo: " + D.cost + "\\n\\n" +
    "Enlace:\\n" + D.url
  );
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
  name: ["tk", "tt", "ttv", "tiktok", "tkmp4"],
  category: "download",
  description: t("cmd_busca_y_descarga_videos_de_tik_fd0719dc"),
  async run(ctx: CommandContext) {
    const { args = [], reply, react, sock, from, msg } = ctx;
    const query = Array.isArray(args) ? args.join(" ").trim() : String(args ?? "").trim();
    if (!query) return reply(t("cmd_proporciona_una_busqueda_o_un__4bcc0240"));

    void react("⏳").catch(() => undefined);

    const tempFiles = new Set<string>();

    try {
      const formattedUrl = tiktokUrlFormatter(query);
      let url: string;
      const now = Date.now();

      if (isTikTokUrl(formattedUrl)) {
        url = formattedUrl;
      } else {
        const cachedKey = query.toLowerCase();
        const cachedSearch = searchCache.get(cachedKey);

        if (cachedSearch && cachedSearch.exp > now) {
          url = cachedSearch.url;
        } else {
          const search = await requestJson<TikTokSearchResponse>(
            `${LEGACY_API}/search/tiktok?query=${encodeURIComponent(query)}&key=${KEY}`,
          ).catch(() => null);
          const result = pickSearchResult(search?.data, query);
          if (!result?.url) throw new Error("No se encontró ningún video para esa búsqueda.");
          url = result.url;
          pruneCache(searchCache);
          searchCache.set(cachedKey, { url, exp: now + CACHE_TTL });
        }
      }

      let data: TikWMVideoResponse | undefined;
      const cachedMeta = metaCache.get(url);

      if (cachedMeta && cachedMeta.exp > now) {
        data = cachedMeta.data;
      } else {
        data = await requestJson<TikWMVideoResponse>(
          `${TIKWM_API}/?url=${encodeURIComponent(url)}&hd=1`,
          45000,
        );
        if (data?.data) {
          pruneCache(metaCache);
          metaCache.set(url, { data, exp: now + CACHE_TTL });
        }
      }

      if (!data?.data) throw new Error("La API no devolvió datos válidos.");

      const author =
        data.data.author?.nickname ||
        data.data.author?.fullname ||
        data.data.author?.unique_id ||
        "Desconocido";
      const handle = data.data.author?.unique_id || "tiktok";
      const title = data.data.title || "TikTok";
      const views = data.data.play_count;
      const likes = data.data.digg_count;
      const comments = data.data.comment_count;
      const shares = data.data.share_count;
      const musicTitle =
        data.data.music_info?.title || `Audio original - ${author}`;
      const durationSec = Number(data.data.duration || 0);
      const durationFmt =
        durationSec > 0
          ? `${Math.floor(durationSec / 60)}:${String(durationSec % 60).padStart(2, "0")}`
          : "";

      const [coverUri, avatarUri] = await Promise.all([
        fetchImageAsDataUri(data.data.cover || data.data.origin_cover),
        fetchImageAsDataUri(data.data.author?.avatar),
      ]);

      const imageUrls = Array.isArray(data.data.images)
        ? data.data.images.filter(
            (image): image is string =>
              typeof image === "string" && /^https?:\/\//.test(image),
          )
        : [];

      if (imageUrls.length > 0) {
        const URL_PICTURES = `https://www.tiktok.com/@${handle}/photo/${data.data.id}`;
        const AUDIO_URL = data.data.music_info?.play || "";

        const imagePromises = imageUrls.slice(0, 20).map(async (imageUrl) => {
          const file = await downloadToCache(imageUrl, 45000);
          tempFiles.add(file);
          const charge = await prepareDownloadCharge(ctx, "image", file);
          return { file, cost: charge.cost };
        });

        const audioPromise = AUDIO_URL
          ? (async () => {
              const file = await downloadToCache(AUDIO_URL, 90000);
              tempFiles.add(file);
              const charge = await prepareDownloadCharge(ctx, "document", file);
              return { file, cost: charge.cost };
            })()
          : Promise.resolve({ file: "", cost: 0 });

        const [downloadedImages, audioResult] = await Promise.all([
          Promise.all(imagePromises),
          audioPromise,
        ]);

        const totalCost =
          downloadedImages.reduce((sum, img) => sum + img.cost, 0) +
          audioResult.cost;
        const formattedCost = formatMoney(totalCost, ctx);

        const caption = DL_TEMPLATE({
          bold: fytBold,
          label: t("cmd_tiktok_images_c263451e"),
          icon: t("cmd_text_91a64201"),
          title,
          author,
          views: formatCount(views),
          likes: formatCount(likes),
          comments: formatCount(comments),
          shares: formatCount(shares),
          cost: formattedCost,
          url: URL_PICTURES,
          showAuthor: true,
          showViews: views !== undefined && views !== null,
          showLikes: likes !== undefined && likes !== null,
          showComments: comments !== undefined && comments !== null,
          showShares: shares !== undefined && shares !== null,
          loadingText: t("cmd_album_listo_458c0141"),
        });

        try {
          const { AIRich } = await import("baileys/lib/Builders/ai-rich.js");
          const rich = new AIRich(sock)
            .setTitle("🎵 TikTok Slideshow // HD")
            .setFooter(`${downloadedImages.length} fotos • @${handle}`);
          rich.addSection(
            buildTikTokRichCard({
              id: String(data.data.id || "N/A"),
              title,
              author,
              handle,
              views: formatCount(views),
              likes: formatCount(likes),
              comments: formatCount(comments),
              shares: formatCount(shares),
              duration: `${downloadedImages.length} fotos`,
              music: musicTitle,
              cost: formattedCost,
              url: URL_PICTURES,
              mode: "PHOTO ALBUM",
              coverUri,
              avatarUri,
            }),
          );
          await rich.send(from, { quoted: msg });
        } catch {}

        const album = downloadedImages.map((img, index) => ({
          image: { url: img.file },
          caption: index === 0 ? caption : "",
        }));

        const sendTasks: Promise<unknown>[] = [];

        if (audioResult.file) {
          sendTasks.push(
            reply({
              audio: { url: audioResult.file },
              mimetype: "audio/mpeg",
              fileName: `${safeFileName(title, "tiktok")}.mp3`,
            }),
          );
        }

        if (album.length === 1) {
          sendTasks.push(reply(album[0]));
        } else {
          sendTasks.push(sendAlbumMessage(sock, from, album, msg as any));
        }

        await Promise.all(sendTasks);
        confirmDownloadCharge(ctx);
        void react("✅").catch(() => undefined);
        return;
      }

      const primaryVideoUrl = data.data.hdplay || data.data.play || data.data.wmplay;
      const fallbackVideoUrl = data.data.play || data.data.wmplay;
      if (!primaryVideoUrl) throw new Error("La API no devolvió un video descargable.");

      const URL_VIDEO = `https://www.tiktok.com/@${handle}/video/${data.data.id}`;

      let file = "";
      try {
        file = await downloadToCache(primaryVideoUrl, 150000);
      } catch {
        if (fallbackVideoUrl && fallbackVideoUrl !== primaryVideoUrl) {
          file = await downloadToCache(fallbackVideoUrl, 150000);
        } else {
          throw new Error("No se pudo descargar el video desde el servidor de origen.");
        }
      }
      tempFiles.add(file);

      const [convertedFile, { cost }] = await Promise.all([
        CONVERT_TO_AVC(file),
        prepareDownloadCharge(ctx, "video", file),
      ]);
      tempFiles.add(convertedFile);

      const formattedCost = formatMoney(cost, ctx);

      const caption = DL_TEMPLATE({
        bold: fytBold,
        label: t("cmd_tiktok_video_78e6c154"),
        icon: t("cmd_text_a2865ecb"),
        title,
        author,
        views: formatCount(views),
        likes: formatCount(likes),
        comments: formatCount(comments),
        shares: formatCount(shares),
        cost: formattedCost,
        url: URL_VIDEO,
        showAuthor: true,
        showViews: views !== undefined && views !== null,
        showLikes: likes !== undefined && likes !== null,
        showComments: comments !== undefined && comments !== null,
        showShares: shares !== undefined && shares !== null,
        loadingText: t("cmd_listo_mi_compa_f240d06d"),
      });

      try {
        const { AIRich } = await import("baileys/lib/Builders/ai-rich.js");
        const rich = new AIRich(sock)
          .setTitle("🎵 TikTok Media // HD Engine")
          .setFooter(`@${handle} • AVC H.264`);
        rich.addSection(
          buildTikTokRichCard({
            id: String(data.data.id || "N/A"),
            title,
            author,
            handle,
            views: formatCount(views),
            likes: formatCount(likes),
            comments: formatCount(comments),
            shares: formatCount(shares),
            duration: durationFmt,
            music: musicTitle,
            cost: formattedCost,
            url: URL_VIDEO,
            mode: "VIDEO HD",
            coverUri,
            avatarUri,
          }),
        );
        await rich.send(from, { quoted: msg });
      } catch {}

      await reply({
        video: { url: convertedFile },
        mimetype: "video/mp4",
        fileName: `${safeFileName(title, "tiktok")}.mp4`,
        caption,
      });

      confirmDownloadCharge(ctx);
      void react("✅").catch(() => undefined);
    } catch (error: unknown) {
      void react("❌").catch(() => undefined);
      const message =
        error instanceof Error ? error.message : "No se pudo descargar el video.";
      await reply({ text: t("cmd_value0_bb624cd4", { value0: message }) }).catch(
        () => undefined,
      );
    } finally {
      if (tempFiles.size > 0) {
        void Promise.allSettled(
          Array.from(tempFiles, (file) => rm(file, { force: true })),
        );
      }
    }
  },
};
