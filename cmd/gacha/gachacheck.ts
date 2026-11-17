import type { CommandContext } from "../../types/index.d.ts";
import { getGachaCatalogStats } from "../../core/gachaRuntime.ts";

const REQUIRED = [
  "accepttrade", "animeinfo", "animelist", "buyc", "claim", "deletechar",
  "ginfo", "giveallharem", "givechar", "gtop", "harem", "htop",
  "removerventa", "robwaifu", "rw", "sell", "setclaim", "setfav",
  "tiendawaifus", "trade", "vote", "waifusboard", "wimage", "winfo",
] as const;

export default {
  name: ["gachacheck", "gcheck"],
  category: "gacha",
  description: "Comprueba comandos, catálogo y consultas Gacha sin alterar cartas ni monedas.",
  groupOnly: true,

  async run(ctx: CommandContext) {
    const results: string[] = [];
    let passed = 0;
    const check = (ok: boolean, description: string, detail = "") => {
      if (ok) passed++;
      results.push((ok ? "✅ " : "❌ ") + description + (detail ? " — " + detail : ""));
    };

    try {
      const loaded = ctx.getPlugins();
      const missing = REQUIRED.filter((name) => !loaded.has(name));
      check(missing.length === 0, "Registro de comandos", missing.length
        ? "Faltan: " + missing.join(", ") : REQUIRED.length + "/" + REQUIRED.length + " disponibles");
    } catch (error) {
      check(false, "Registro de comandos", String(error));
    }

    try {
      const stats = getGachaCatalogStats();
      check(stats.characters > 0, "Catálogo cargado",
        stats.characters + " personajes · " + stats.series + " series");
    } catch (error) {
      check(false, "Catálogo cargado", String(error));
    }

    try {
      const { getGachaHarem } = await import("../../database/gachaDB.ts");
      const cards = getGachaHarem(ctx.from, ctx.sender);
      check(Array.isArray(cards), "Lectura de colección",
        cards.length + " cartas propias en este grupo");
    } catch (error) {
      check(false, "Lectura de colección", String(error));
    }

    try {
      const market = await import("../../database/gachaMarketDB.ts");
      const listings = market.listSales(ctx.from);
      const rankings = market.userRankings(ctx.from);
      check(Array.isArray(listings) && Array.isArray(rankings), "Mercado y rankings",
        listings.length + " ofertas · " + rankings.length + " coleccionistas");
    } catch (error) {
      check(false, "Mercado y rankings", String(error));
    }

    try {
      const { default: Database } = await import("better-sqlite3");
      const { default: path } = await import("node:path");
      const dir = globalThis.DATA_BASE_DIR;
      if (typeof dir !== "string" || !dir) throw new Error("Directorio de datos no configurado");
      const sql = new Database(path.join(dir, "Aura.db"), {
        readonly: true,
        fileMustExist: true,
      });
      try {
        const result = sql.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number };
        check(Number.isSafeInteger(result.n), "Base de usuarios",
          result.n + " usuarios registrados");
      } finally {
        sql.close();
      }
    } catch (error) {
      check(false, "Base de usuarios", String(error));
    }

    const status = passed === 5 ? "🟢 CONSULTAS CORRECTAS" : "🔴 REVISIÓN NECESARIA";
    return ctx.reply([
      "🔬 *GACHA CHECK // AURA REED*",
      "━━━━━━━━━━━━━━━━",
      "Estado: " + status,
      "Verificaciones: " + passed + "/5",
      "",
      ...results,
      "",
      "Nota: esta revisión es de solo lectura. No prueba compras, robos ni intercambios reales.",
    ].join("\n"));
  },
};

// Hecho por Lourtnyx Matterssmith [Lou-Nyx].
