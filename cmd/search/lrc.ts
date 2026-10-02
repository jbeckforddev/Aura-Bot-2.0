import { randomUUID } from "node:crypto";
import { LRUCache } from "lru-cache";
import { DL_CONFIG } from "../../config.ts";
import { safeFileName, requestJson } from "../../core/downloadUtils.ts";
import { fytBold } from "../../core/socketText.ts";
import { formatDuration } from "../../utils/formatter.ts";
import type { CommandContext, OptionRow, LyricResult } from "../../types/index.d.ts";

type SearchSession = {
  sender: string;
  chat: string;
  results: LyricResult[];
};

const searchSessions = new LRUCache<string, SearchSession>({
  max: 500,
  ttl: 10 * 60 * 1000,
});

function getSession(token: string, sender: string, chat: string): SearchSession {
  const session = searchSessions.get(token);
  if (!session || session.sender !== sender || session.chat !== chat) {
    throw new Error("La búsqueda expiró. Ejecuta .lrc de nuevo.");
  }
  return session;
}

function makeRow(title: string, rowId: string, description: string): OptionRow {
  return { title, rowId, description };
}

export default {
  name: ["lrc", "lyrics"],
  category: "search",
  description: "Busca letras y permite descargarlas o enviarlas como texto.",
  async run({ args, reply, react, options, usedPrefix, sender, from }: CommandContext) {
    try {
      const action = String(args[0] || "").toLowerCase();

      if (action === "select") {
        const token = args[1];
        const index = Number(args[2]);
        const session = getSession(token, sender, from);
        const result = session.results[index];
        if (!result) throw new Error("No se encontró esa canción.");

        const rows = [
          makeRow(
            "Letras sincronizadas (.lrc)",
            `${usedPrefix}lrc file ${token} ${index} lrc`,
            "Descargar archivo .lrc con marcas de tiempo"
          ),
          makeRow(
            "Letras normales (.txt)",
            `${usedPrefix}lrc file ${token} ${index} txt`,
            "Enviar como mensaje de texto normal"
          ),
        ];

        let preview = `╭〔🎙️ ${fytBold("LYRICS SELECT")} 〕━⬣\n`;
        preview += `┃ ➥ ${fytBold(result.title) || "Desconocido"}\n`;
        preview += `┣━━━━━━━━━━━━⬣\n`;
        preview += `┃ > 👤 ${result.artist || "Desconocido"}\n`;
        preview += `┃ > 💽 ${result.album || "Desconocido"}\n`;
        preview += `┃ > ⏳️ ${formatDuration(result.duration) || "0:00"}\n`;
        preview += `┣━━━━━━━━━━━━⬣\n`;
        preview += `┃ > Elija el formato de letra\n`;
        preview += `╰〔 ⚡ ${fytBold("SYSTEM ACTIVE")} 〕⬣`;

        return options(
          preview,
          [{ title: "Descargas", rows }],
          globalThis.DEFAULT_BOT_AUTHOR,
          "Elegir formato"
        );
      }

      if (action === "file") {
        const token = args[1];
        const index = Number(args[2]);
        const format = String(args[3] || "").toLowerCase();
        const session = getSession(token, sender, from);
        const result = session.results[index];
        if (!result) throw new Error("No se encontró esa canción.");
        if (format !== "lrc" && format !== "txt") {
          throw new Error("Formato inválido. Elige LRC o TXT.");
        }

        const content = format === "lrc" ? result.lrc : result.lyrics;
        if (typeof content !== "string" || !content.trim()) {
          throw new Error(
            format === "lrc"
              ? "Esta canción no tiene letra sincronizada disponible."
              : "Esta canción no tiene letra en texto disponible."
          );
        }

        await react("⏳");

        if (format === "lrc") {
          const fileName = `${safeFileName(
            `${result.title || "letra"} - ${result.artist || "artista"}`,
            "letra"
          )}.lrc`;
          await reply({
            document: Buffer.from(content.trim(), "utf8"),
            mimetype: "text/plain; charset=utf-8",
            fileName,
            caption: `${result.title || "Canción"} - ${result.artist || "Artista desconocido"} (LRC)`,
          });
        } else {
          await reply({
            text: content.trim(),
          });
        }

        return react("✅");
      }

      const query = args.slice(0).join(" ").trim();
      if (!query) {
        return reply("⚠️ Proporciona el nombre de la canción o artista.");
      }

      await react("⏳");
      const apiUrl = `${DL_CONFIG.alya.BASE_URL.replace(/\/+$/, "")}/tools/lyrics?query=${encodeURIComponent(query)}&key=${DL_CONFIG.alya.API_KEY}`;
      const data = await requestJson(apiUrl, 30000);
      const responseResults = Array.isArray(data?.data)
        ? data.data
        : data?.resultados;
      const results: LyricResult[] = Array.isArray(responseResults)
        ? responseResults.filter(
          (result: unknown): result is LyricResult =>
            Boolean(result) && typeof result === "object"
        )
        : [];
      if (!data?.status || results.length === 0) {
        throw new Error("No se encontraron resultados para la búsqueda.");
      }

      const token = randomUUID();
      searchSessions.set(token, { sender, chat: from, results });
      const rows = results.slice(0, 10).map((result, index) =>
        makeRow(
          String(result.title || `Canción ${index + 1}`).slice(0, 24),
          `${usedPrefix}lrc select ${token} ${index}`,
          String(result.artist || "Artista desconocido").slice(0, 72)
        )
      );

      const h = `╭〔 ${fytBold("LYRICS SEARCH")} 〕━⬣`;
      let t = `┃ ➥ ${fytBold(query)}\n`;
      t += `┣━━━━━━━━━━━━⬣\n`;
      t += `┃ > Elija tu letra preferida\n`;
      t += `╰〔 ⚡ ${fytBold("SYSTEM ACTIVE")} 〕⬣`;

      await react("✅");
      return options(
        t,
        [{ title: "Canciones", rows }],
        globalThis.DEFAULT_BOT_AUTHOR,
        "Ver canciones",
        h
      );
    } catch (error: unknown) {
      await react("❌");
      const message =
        error instanceof Error ? error.message : "No se pudo procesar la solicitud.";
      return reply({
        text: `❌ Error: ${message}`,
      });
    }
  },
};