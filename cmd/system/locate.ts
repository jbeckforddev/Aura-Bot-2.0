import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";

interface CommandLocationInfo {
  primaryName: string;
  aliases: string[];
  category: string;
  relativePath: string;
}

export default {
  name: ["locate", "ubicacion", "findcmd", "cmdpath"],
  category: "system",
  description: "Enumera todos los comandos disponibles del bot y muestra su ruta exacta de archivo.",
  groupOnly: false,
  ownerOnly: false,
  async run(ctx: CommandContext) {
    const { reply, react, args } = ctx;

    await react("🧭").catch(() => undefined);

    const rootDir = process.cwd();
    const cmdRoot = path.join(rootDir, "cmd");

    if (!fs.existsSync(cmdRoot)) {
      await react("❌").catch(() => undefined);
      return reply("❌ No se encontró la carpeta de comandos `cmd/` en el directorio raíz.");
    }

    const commandList: CommandLocationInfo[] = [];
    const categories = fs.readdirSync(cmdRoot, { withFileTypes: true });

    for (const cat of categories) {
      if (!cat.isDirectory()) continue;
      const catDir = path.join(cmdRoot, cat.name);
      const files = fs.readdirSync(catDir).filter((f) => f.endsWith(".ts") || f.endsWith(".js"));

      for (const file of files) {
        const fullPath = path.join(catDir, file);
        const relPath = path.relative(rootDir, fullPath);
        try {
          const mod = await import(pathToFileURL(fullPath).href);
          const plugin = mod?.default;
          if (!plugin || typeof plugin.run !== "function") continue;

          const names: string[] = Array.isArray(plugin.name)
            ? plugin.name
            : typeof plugin.name === "string"
            ? [plugin.name]
            : [];

          if (names.length === 0) continue;

          const primaryName = names[0].toLowerCase();
          const aliases = names.map((n) => n.toLowerCase());
          const category = String(plugin.category || cat.name).toLowerCase();

          commandList.push({
            primaryName,
            aliases,
            category,
            relativePath: relPath,
          });
        } catch {}
      }
    }

    commandList.sort((a, b) => a.primaryName.localeCompare(b.primaryName));

    const searchFilter = String(args[0] || "").toLowerCase().replace(/^[.#/!]/, "").trim();

    if (searchFilter) {
      const match = commandList.find(
        (c) => c.primaryName === searchFilter || c.aliases.includes(searchFilter)
      );

      if (match) {
        await react("✅").catch(() => undefined);
        return reply(
          `🧭 *${fytBold("LOCALIZACIÓN DE COMANDO")}* 🧭\n\n` +
            `🔍 *Búsqueda:* \`.${searchFilter}\`\n` +
            `📌 *Comando Principal:* \`.${match.primaryName}\`\n` +
            `📂 *Categoría:* \`${match.category}\`\n` +
            `📁 *Ruta del Archivo:* \`${match.relativePath}\`\n` +
            `🔀 *Alias:* ${match.aliases.map((a) => `\`.${a}\``).join(", ")}`
        );
      } else {
        await react("❌").catch(() => undefined);
        return reply(`❌ No se encontró ningún comando registrado con el nombre o alias: \`.${searchFilter}\``);
      }
    }

    const categoriesMap = new Map<string, CommandLocationInfo[]>();
    for (const cmd of commandList) {
      const list = categoriesMap.get(cmd.category) || [];
      list.push(cmd);
      categoriesMap.set(cmd.category, list);
    }

    const reportLines: string[] = [
      `🧭 *${fytBold("MAPEO Y UBICACIÓN DE COMANDOS")}* 🧭`,
      `━━━━━━━━━━━━━━━━━━━━━━`,
      `📊 *Total de comandos registrados:* \`${commandList.length}\``,
      `💡 *Tip:* Usa \`.locate <comando>\` para buscar uno en específico (Ej: \`.locate aviator\`).`,
      ``,
    ];

    for (const [catName, cmds] of categoriesMap.entries()) {
      reportLines.push(`📂 *CATEGORÍA: [${catName.toUpperCase()}]* (${cmds.length})`);
      for (const c of cmds) {
        const aliasStr = c.aliases.length > 1 ? ` (Alias: ${c.aliases.slice(1).map(a => `.${a}`).join(", ")})` : "";
        reportLines.push(`  • \`.${c.primaryName}\`${aliasStr}\n    ↳ \`${c.relativePath}\``);
      }
      reportLines.push(``);
    }

    const finalReport = reportLines.join("\n");

    await react("✅").catch(() => undefined);

    if (finalReport.length > 3800) {
      return sock.sendMessage(
        ctx.sender || from,
        {
          document: Buffer.from(finalReport, "utf8"),
          mimetype: "text/plain",
          fileName: "Mapeo_Comandos_AuraBot.txt",
          caption: "🧭 Aquí tienes el reporte completo con la ubicación de todos los comandos del bot.",
        },
        { quoted: msg as any }
      );
    }

    return reply(finalReport);
  },
};
