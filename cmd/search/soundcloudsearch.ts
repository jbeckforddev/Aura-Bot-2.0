import type {
  CommandContext,
  SoundCloudSearchResponse,
} from "../../types/index.d.ts";
import { request } from "undici";
import { fytBold } from "../../core/socketText.ts";
import { formatDuration } from "../../utils/formatter.ts";
import { SEARCH_RESULTS_TEMPLATE } from "../../utils/template.ts";

let cachedClientId: string | null = null;
let cachedAt = 0;

async function getClientId(): Promise<string> {
  if (cachedClientId && Date.now() - cachedAt < 3600000) return cachedClientId;
  const response = await request("https://soundcloud.com", {
    headers: { "User-Agent": "Mozilla/5.0" },
    signal: AbortSignal.timeout(30000),
  });
  const html = await response.body.text();
  const scripts = [
    ...html.matchAll(
      /src="(https:\/\/a-v2\.sndcdn\.com\/assets\/[^"\s]+\.js)"/g,
    ),
  ].map((match) => match[1]);
  for (const scriptUrl of scripts.slice(-5)) {
    const script = await request(scriptUrl, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(30000),
    })
      .then((res) => res.body.text())
      .catch(() => "");
    const match =
      script.match(/client_id\s*[:=]\s*["']([A-Za-z0-9_-]+)["']/) ||
      script.match(/["']client_id["']\s*:\s*["']([A-Za-z0-9_-]+)["']/);
    if (match?.[1]) {
      cachedClientId = match[1];
      cachedAt = Date.now();
      return cachedClientId;
    }
  }
  throw new Error("No se pudo obtener el client_id de SoundCloud.");
}

export default {
  name: ["scsearch", "scbuscar", "scb", "scs"],
  category: "search",
  description: "Busca canciones de SoundCloud.",
  async run({ args, reply, react }: CommandContext) {
    const query = args.join(" ").trim();
    if (!query) return reply("⚠️ Proporciona palabras clave para SoundCloud.");
    await react("🔍");
    try {
      const id = await getClientId();
      const url = new URL("https://api-v2.soundcloud.com/search/tracks");
      url.searchParams.set("q", query);
      url.searchParams.set("client_id", id);
      url.searchParams.set("limit", "10");
      const response = await request(url).then(
        (res) => res.body.json() as Promise<SoundCloudSearchResponse>,
      );
      if (!response.collection?.length)
        throw new Error("No se encontraron resultados.");
      const text = SEARCH_RESULTS_TEMPLATE({
        bold: fytBold,
        label: "SOUNDCLOUD SEARCH",
        icon: "🎵",
        query,
        engine: "Api Interna",
        results: response.collection.slice(0, 10).map((track) => ({
          title: track.title,
          artist: track.user?.username || "Desconocido",
          duration: formatDuration(Math.floor(Number(track.duration || 0) / 1000)),
          url: track.permalink_url || "No disponible",
        })),
      });
      await reply({ text });
      await react("✅");
    } catch (error: unknown) {
      await react("❌");
      return reply({
        text: `❌ Error: ${error instanceof Error ? error.message : String(error) || "No se pudo buscar en SoundCloud."}`,
      });
    }
  },
};
