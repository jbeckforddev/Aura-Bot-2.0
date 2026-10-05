import type { CommandContext, AlbumItem } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { requestJson } from "../../core/downloadUtils.ts";
import { sendAlbumMessage } from "../../core/mediaSendUtils.ts";

const USER_ID = "6679412";
const API_KEY =
  "2faa230764f8b4c823f54b2022fd240d2f9fa4a4e6fee5f89e76d0ca2fbf586967e3ccc14c5fa298239c87ffd8ae7256afd6ca49928b58ef2002ad1004c0da28";

interface Rule34Post {
  file_url?: string;
  sample_url?: string;
  preview_url?: string;
  image?: string;
  tags?: string;
}

export default {
  name: ["rule34", "r34"],
  category: "nsfw",
  description: "Busca imágenes en Rule34.",

  async run(ctx: CommandContext) {
    const { sock, from, msg, args, reply, react } = ctx;
    const query = args.join(" ").trim();

    if (!query) {
      return await reply({
        text: `╭〔 ⚠️ ${fytBold("AURA REED")} 〕⬣\n┃ ❌ ${fytBold("FALTA BUSQUEDA")}\n╰━━━━━━━━━━━━⬣\n\n┃ > Por favor, proporciona un\n┃ > término de búsqueda.\n\n╰〔 ⚡ ${fytBold("SYSTEM")} 〕⬣`,
      });
    }

    await react("🔍");

    try {
      const url = `https://api.rule34.xxx/index.php?page=dapi&s=post&q=index&json=1&tags=${encodeURIComponent(query)}&limit=100&api_key=${API_KEY}&user_id=${USER_ID}`;

      const data = await requestJson<Rule34Post[]>(url);

      if (!data || !Array.isArray(data) || data.length === 0) {
        throw new Error(`No se encontraron resultados para "${query}".`);
      }

      const validPosts = data.filter((item) => {
        const fileUrl = item.file_url || item.sample_url || item.image;
        return typeof fileUrl === "string" && /^https?:\/\//i.test(fileUrl);
      });

      if (validPosts.length === 0) {
        throw new Error("No se encontraron imágenes válidas.");
      }

      const shuffled = validPosts.sort(() => 0.5 - Math.random());
      const selected = shuffled.slice(0, 10);

      const captionText = `╭━━〔 ${fytBold("RULE34 SEARCH")} 〕━━⬣\n┃ 🔞 Tag: ${query}\n┃ ⚙️ Motor: › Rule34 API\n╰〔 ⚡ ${fytBold("AURA REED")} 〕⬣`;

      const albumItems: AlbumItem[] = selected.map((item, index) => {
        const imageUrl = item.file_url || item.sample_url || item.image || "";
        return {
          image: { url: imageUrl },
          caption: index === 0 ? captionText : "",
        };
      });

      if (albumItems.length === 1) {
        await reply({
          image: { url: (albumItems[0].image as { url: string }).url },
          caption: captionText,
        });
      } else {
        await sendAlbumMessage(sock, from, albumItems, msg);
      }

      await react("✅");
    } catch (error: unknown) {
      await react("❌");
      return await reply({
        text: `╭〔 ❌ ${fytBold("AURA REED")} 〕⬣\n┃ ⚠️ ${fytBold("SIN RESULTADOS")}\n╰━━━━━━━━━━━━⬣\n\n┃ > ${error instanceof Error ? error.message : `No se encontraron resultados para "${query}".`}\n\n╰〔 ⚡ ${fytBold("SYSTEM")} 〕⬣`,
      });
    }
  },
};

