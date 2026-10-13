import type { DownloadTemplateOptions } from "../types/template.d.ts";
import { t } from "../src/langs/index.ts";

interface SearchResultItem {
  title: string;
  artist?: string;
  duration?: string;
  likes?: string;
  url?: string;
}

interface SearchTemplateOptions extends DownloadTemplateOptions {
  query?: string;
  engine?: string;
  results?: SearchResultItem[];
}

function buildDownloadTemplate(options: DownloadTemplateOptions = {}): string {
  const {
    bold: boldFormatter,
    title = t("template_no_title_44ba2cb7"),
    label = t("template_download_524d6ef8"),
    icon = "🎵",
    loadingText = t("template_downloading_file_5b7d8a4e"),
    loadingIcon = "",
    showTitle = true,
    showLoading = true,
    showCost = true,
    showUrl = true,
    showDuration = false,
    showQuality = false,
    showSize = false,
    showType = false,
    showViews = false,
    showLikes = false,
    showVideoId = false,
    showSource = false,
    showComments = false,
    showShares = false,
    showAuthor = false,
    showChannel = false,
    showArtist = false,
    showAlbum = false,
    showPackage = false,
    showVersion = false,
    showTotal = false,
    showExtension = false,
    author,
    channel,
    artist,
    album,
    duration,
    quality,
    size,
    type,
    cost,
    url,
    views,
    likes,
    videoId,
    source,
    comments,
    shares,
    total,
    packageName,
    version,
    extension,
  } = options;
  const bold = (value: unknown): string =>
    boldFormatter ? boldFormatter(String(value ?? "")) : String(value ?? "");
  const lines: string[] = [];
  lines.push(`╭〔 ${icon} ${bold(label)} 〕━⬣\n`);
  if (showTitle && title) {lines.push(`┃ ➥ ${bold(title)}`)}
  lines.push("");
  lines.push("┣━━━━━━━━━━━━⬣");
  if (showAuthor && author) {lines.push(`┃ > ${bold(t("template_author_b5aa6d2c"))} › ${author}`)}
  if (showChannel && channel) {lines.push(`┃ > ${bold(t("template_channel_6ef14b8d"))} › ${channel}`)}
  if (showArtist && artist) {lines.push(`┃ > ${bold(t("template_artist_8a39d56a"))} › ${artist}`)}
  if (showAlbum && album) {lines.push(`┃ > ${bold(t("template_album_2391d12d"))} › ${album}`)}
  if (showDuration && duration) {lines.push(`┃ > ${bold(t("template_duration_f6878fc1"))} › ${duration}`)}
  if (showViews && views !== undefined && views !== null && views !== "") {lines.push(`┃ > ${bold(t("template_views_f73f3d1e"))} › ${views}`)}
  if (showLikes && likes !== undefined && likes !== null && likes !== "") {lines.push(`┃ > ${bold(t("template_likes_1d3a66d8"))} › ${likes}`);}
  if (showVideoId && videoId) {lines.push(`┃ > ${bold(t("template_id_1821f5f5"))} › ${videoId}`);}
  if (showSource && source) {lines.push(`┃ > ${bold(t("template_engine_2fbe8b3a"))} › ${source}`);}
  if (showComments && comments !== undefined && comments !== null && comments !== "") {lines.push(`┃ > ${bold(t("template_comments_70e3e819"))} › ${comments}`)}
  if (showShares && shares !== undefined && shares !== null && shares !== "") {lines.push(`┃ > ${bold(t("template_shared_6d54b2d8"))} › ${shares}`)}
  if (showQuality && quality) {lines.push(`┃ > ${bold(t("template_quality_a174c3a9"))} › ${quality}`);}
  if (showSize && size){lines.push(`┃ > ${bold(t("template_size_015783b6"))} › ${size}`)}
  if (showType && type) {lines.push(`┃ > ${bold(t("template_type_8ad5d538"))} › ${type}`)}
  if (showTotal && total !== undefined && total !== null && total !== "") {lines.push(`┃ > ${bold(t("template_total_127f53c2"))} › ${total}`)}
  if (showPackage && packageName) {lines.push(`┃ > ${bold(t("template_app_id_3d93b4ca"))} › ${packageName}`)}
  if (showVersion && version) {lines.push(`┃ > ${bold(t("template_version_16eb8ce9"))} › ${version}`)}
  if (showExtension && extension) {lines.push(`┃ > ${bold(t("template_extension_7dd1844c"))} › .${String(extension).toUpperCase()}`)}
  if (showCost && cost !== undefined && cost !== null && cost !== "") {lines.push(`┃ > ${bold(t("template_cost_7a4cf3ab"))} › ${cost}`)}
  if (showUrl && url) {lines.push(`┃ > ${bold(t("template_url_9d718ced"))} › ${url}`)}
  if (showLoading && loadingText) {lines.push("┣━━━━━━━━━━━━⬣"); const loadingPrefix = loadingIcon ? `${loadingIcon} ` : ""; lines.push(`┃ ${loadingPrefix}${loadingText}`)}
  lines.push(`╰━━〔 ⚡ ${bold(t("template_system_active_48d8a8bf"))} 〕━━⬣`);
  return lines.join("\n");
}

export const DL_TEMPLATE = (options: DownloadTemplateOptions = {}) =>
  buildDownloadTemplate(options);

function buildSearchTemplate(options: SearchTemplateOptions = {}): string {
  return buildDownloadTemplate({
    ...options,
    label: options.label ?? t("template_search_14eb597b"),
    icon: options.icon ?? "🔎",
    loadingText: options.loadingText ?? t("template_searching_results_2540c40d"),
    showLoading: options.showLoading ?? false,
    showCost: options.showCost ?? false,
    showUrl: options.showUrl ?? false,
    showTitle: options.showTitle ?? true,
    title: options.title ?? t("template_general_search_4c0d509b"),
  });
}

function buildSearchResultsTemplate(options: SearchTemplateOptions = {}): string {
  const boldFormatter = options.bold ?? ((value: string) => value);
  const bold = (value: string): string => boldFormatter(String(value ?? ""));
  const query = options.query ?? "";
  const engine = options.engine ?? "Api Interna";
  const label = options.label ?? t("template_search_14eb597b");
  const icon = options.icon ?? "🔎";
  const results = options.results ?? [];

  const lines: string[] = [];
  lines.push(`╭〔 ${icon} ${bold(String(label))} 〕⬣`);
  if (query) lines.push(`┃ 🔍 ${bold(t("template_search_14eb597b"))} › ${query}`);
  lines.push(`┃ ⚙️ ${bold(t("template_engine_2fbe8b3a"))} › ${engine}`);
  lines.push("╰━━━━━━━━━━━━━━━━⬣");
  lines.push("");

  results.forEach((item, index) => {
    lines.push(`┃ ${index + 1}. ${bold(item.title || "Sin título")}`);
    if (item.artist) lines.push(`┃ ├ 👤 ${bold(t("template_artist_8a39d56a"))} › ${item.artist}`);
    if (item.duration) lines.push(`┃ ├ ⏱️ ${bold(t("template_duration_f6878fc1"))} › ${item.duration}`);
    if (item.likes) lines.push(`┃ ├ 👍 ${bold(t("template_likes_1d3a66d8"))} › ${item.likes}`);
    if (item.url) lines.push(`┃ └ 🔗 ${bold(t("template_url_9d718ced"))} › ${item.url}`);
    lines.push("");
  });

  lines.push(`╰〔 ⚡ ${bold(t("template_system_active_48d8a8bf"))} 〕⬣`);
  return lines.join("\n");
}

export const SEARCH_TEMPLATE = (options: SearchTemplateOptions = {}) =>
  buildSearchTemplate(options);

export const SEARCH_RESULTS_TEMPLATE = (options: SearchTemplateOptions = {}) =>
  buildSearchResultsTemplate(options);

export function searchTemplate(options: SearchTemplateOptions = {}): string {
  return buildSearchTemplate(options);
}

export function searchResultsTemplate(options: SearchTemplateOptions = {}): string {
  return buildSearchResultsTemplate(options);
}