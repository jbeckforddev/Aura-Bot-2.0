import type { DownloadTemplateOptions } from "../types/template.d.ts";

interface SearchResultItem {
  title: string;
  artist?: string;
  duration?: string;
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
    title = "Sin título",
    label = "DOWNLOAD",
    icon = "🎵",
    loadingText = "Descargando archivo...",
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
  if (showAuthor && author) {lines.push(`┃ > ${bold("Autor")} › ${author}`)}
  if (showChannel && channel) {lines.push(`┃ > ${bold("Canal")} › ${channel}`)}
  if (showArtist && artist) {lines.push(`┃ > ${bold("Artista")} › ${artist}`)}
  if (showAlbum && album) {lines.push(`┃ > ${bold("Álbum")} › ${album}`)}
  if (showDuration && duration) {lines.push(`┃ > ${bold("Duración")} › ${duration}`)}
  if (showViews && views !== undefined && views !== null && views !== "") {lines.push(`┃ > ${bold("Vistas")} › ${views}`)}
  if (showLikes && likes !== undefined && likes !== null && likes !== "") {lines.push(`┃ > ${bold("Likes")} › ${likes}`);}
  if (showComments && comments !== undefined && comments !== null && comments !== "") {lines.push(`┃ > ${bold("Comentarios")} › ${comments}`)}
  if (showShares && shares !== undefined && shares !== null && shares !== "") {lines.push(`┃ > ${bold("Compartidos")} › ${shares}`)}
  if (showQuality && quality) {lines.push(`┃ > ${bold("Calidad")} › ${quality}`);}
  if (showSize && size){lines.push(`┃ > ${bold("Tamaño")} › ${size}`)}
  if (showType && type) {lines.push(`┃ > ${bold("Tipo")} › ${type}`)}
  if (showTotal && total !== undefined && total !== null && total !== "") {lines.push(`┃ > ${bold("Total")} › ${total}`)}
  if (showPackage && packageName) {lines.push(`┃ > ${bold("ID App")} › ${packageName}`)}
  if (showVersion && version) {lines.push(`┃ > ${bold("Versión")} › ${version}`)}
  if (showExtension && extension) {lines.push(`┃ > ${bold("Extensión")} › .${String(extension).toUpperCase()}`)}
  if (showCost && cost !== undefined && cost !== null && cost !== "") {lines.push(`┃ > ${bold("Costo")} › ${cost}`)}
  if (showUrl && url) {lines.push(`┃ > ${bold("Url")} › ${url}`)}
  if (showLoading && loadingText) {lines.push("┣━━━━━━━━━━━━⬣"); const loadingPrefix = loadingIcon ? `${loadingIcon} ` : ""; lines.push(`┃ ${loadingPrefix}${loadingText}`)}
  lines.push(`╰━━〔 ⚡ ${bold("SYSTEM ACTIVE")} 〕━━⬣`);
  return lines.join("\n");
}

export const DL_TEMPLATE = (options: DownloadTemplateOptions = {}) =>
  buildDownloadTemplate(options);

function buildSearchTemplate(options: SearchTemplateOptions = {}): string {
  return buildDownloadTemplate({
    ...options,
    label: options.label ?? "SEARCH",
    icon: options.icon ?? "🔎",
    loadingText: options.loadingText ?? "Buscando resultados...",
    showLoading: options.showLoading ?? false,
    showCost: options.showCost ?? false,
    showUrl: options.showUrl ?? false,
    showTitle: options.showTitle ?? true,
    title: options.title ?? "Búsqueda general",
  });
}

function buildSearchResultsTemplate(options: SearchTemplateOptions = {}): string {
  const boldFormatter = options.bold ?? ((value: string) => value);
  const bold = (value: string): string => boldFormatter(String(value ?? ""));
  const query = options.query ?? "";
  const engine = options.engine ?? "Api Interna";
  const label = options.label ?? "SEARCH";
  const icon = options.icon ?? "🔎";
  const results = options.results ?? [];

  const lines: string[] = [];
  lines.push(`╭〔 ${icon} ${bold(String(label))} 〕⬣`);
  if (query) lines.push(`┃ 🔍 ${bold("Búsqueda")} › ${query}`);
  lines.push(`┃ ⚙️ ${bold("Motor")} › ${engine}`);
  lines.push("╰━━━━━━━━━━━━━━━━⬣");
  lines.push("");

  results.forEach((item, index) => {
    lines.push(`┃ ${index + 1}. ${bold(item.title || "Sin título")}`);
    if (item.artist) lines.push(`┃ ├ 👤 ${bold("Artista")} › ${item.artist}`);
    if (item.duration) lines.push(`┃ ├ ⏱️ ${bold("Duración")} › ${item.duration}`);
    if (item.url) lines.push(`┃ └ 🔗 ${bold("Url")} › ${item.url}`);
    lines.push("");
  });

  lines.push(`╰〔 ⚡ ${bold("SYSTEM ACTIVE")} 〕⬣`);
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