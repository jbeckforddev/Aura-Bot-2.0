import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import * as fs from "node:fs";
import * as path from "node:path";
import { pathToFileURL } from "node:url";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

interface FileIssue {
  file: string;
  type: "SYNTAX" | "IMPORT_ROTO" | "ESTRUCTURA_CMD" | "JSON_CORRUPTO" | "CATEGORIA" | "DUPLICADO";
  detail: string;
}

interface FolderSizeInfo {
  name: string;
  bytes: number;
  filesCount: number;
}

interface HeavyFileInfo {
  relPath: string;
  bytes: number;
}

function formatSize(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const idx = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, idx)).toFixed(2)} ${units[idx]}`;
}

function getFolderMetrics(dirPath: string, heavyFiles?: HeavyFileInfo[], rootPath?: string): { bytes: number; count: number } {
  let totalBytes = 0;
  let totalCount = 0;
  let entries: fs.Dirent[] = [];

  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return { bytes: 0, count: 0 };
  }

  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isSymbolicLink()) continue;

    if (entry.isDirectory()) {
      const sub = getFolderMetrics(full, heavyFiles, rootPath);
      totalBytes += sub.bytes;
      totalCount += sub.count;
    } else if (entry.isFile()) {
      try {
        const st = fs.statSync(full);
        totalBytes += st.size;
        totalCount++;
        if (heavyFiles && rootPath && !full.includes("node_modules") && !full.includes(".git")) {
          heavyFiles.push({
            relPath: path.relative(rootPath, full),
            bytes: st.size,
          });
        }
      } catch {}
    }
  }

  return { bytes: totalBytes, count: totalCount };
}

function collectCodeFiles(dirPath: string, list: string[] = []): string[] {
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return list;
  }

  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git" || entry.name === "dist") continue;
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      collectCodeFiles(full, list);
    } else if (
      entry.isFile() &&
      (entry.name.endsWith(".ts") || entry.name.endsWith(".js") || entry.name.endsWith(".json"))
    ) {
      list.push(full);
    }
  }
  return list;
}

function resolveImportTarget(baseDir: string, importSpec: string): boolean {
  if (!importSpec.startsWith(".")) return true;
  const cleanSpec = importSpec.split("?")[0].split("#")[0];
  const resolvedBase = path.resolve(baseDir, cleanSpec);

  const candidates = [
    resolvedBase,
    `${resolvedBase}.ts`,
    `${resolvedBase}.js`,
    `${resolvedBase}.d.ts`,
    `${resolvedBase}.json`,
    path.join(resolvedBase, "index.ts"),
    path.join(resolvedBase, "index.js"),
    path.join(resolvedBase, "index.d.ts"),
  ];

  if (cleanSpec.endsWith(".js")) {
    const asTs = resolvedBase.slice(0, -3) + ".ts";
    const asDts = resolvedBase.slice(0, -3) + ".d.ts";
    candidates.push(asTs, asDts);
  }

  for (const c of candidates) {
    try {
      if (fs.existsSync(c) && fs.statSync(c).isFile()) return true;
    } catch {}
  }

  return false;
}

function checkStaticSyntaxAndImports(filePath: string, rootDir: string): FileIssue[] {
  const issues: FileIssue[] = [];
  const rel = path.relative(rootDir, filePath);
  let content = "";

  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch (err: any) {
    issues.push({ file: rel, type: "SYNTAX", detail: `No se pudo leer el archivo: ${err?.message || "Error"}` });
    return issues;
  }

  if (content.trim().length === 0) {
    issues.push({ file: rel, type: "SYNTAX", detail: "El archivo está completamente vacío (0 bytes)." });
    return issues;
  }

  if (filePath.endsWith(".json")) {
    try {
      JSON.parse(content);
    } catch (err: any) {
      issues.push({
        file: rel,
        type: "JSON_CORRUPTO",
        detail: String(err?.message || "JSON inválido").slice(0, 100),
      });
    }
    return issues;
  }

  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^(Import|Export|Const|Let|Var|Async|Function|Return)\s+/.test(line)) {
      const badWord = line.split(/\s+/)[0];
      issues.push({
        file: rel,
        type: "SYNTAX",
        detail: `Línea ${i + 1}: Palabra clave con mayúscula inicial ("${badWord}").`,
      });
    }
  }

  const importRegex = /(?:import|export)\s+(?:type\s+)?(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g;
  const dynamicImportRegex = /import\s*\(\s*["']([^"']+)["']\s*\)/g;
  const requireRegex = /require\s*\(\s*["']([^"']+)["']\s*\)/g;
  const baseDir = path.dirname(filePath);

  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(content)) !== null) {
    const spec = match[1];
    if (spec.startsWith(".") && !resolveImportTarget(baseDir, spec)) {
      issues.push({
        file: rel,
        type: "IMPORT_ROTO",
        detail: `Ruta inexistente: "${spec}"`,
      });
    }
  }

  while ((match = dynamicImportRegex.exec(content)) !== null) {
    const spec = match[1];
    if (spec.startsWith(".") && !resolveImportTarget(baseDir, spec)) {
      issues.push({
        file: rel,
        type: "IMPORT_ROTO",
        detail: `Import dinámico roto: "${spec}"`,
      });
    }
  }

  while ((match = requireRegex.exec(content)) !== null) {
    const spec = match[1];
    if (spec.startsWith(".") && !resolveImportTarget(baseDir, spec)) {
      issues.push({
        file: rel,
        type: "IMPORT_ROTO",
        detail: `Require hacia ruta inexistente: "${spec}"`,
      });
    }
  }

  return issues;
}

export default {
  name: ["filecheck", "checkbot", "auditarbot", "diagnostico"],
  category: "group",
  description: "Escanea toda la base del bot, verifica sintaxis, rutas, salud de comandos y consumo de almacenamiento.",
  groupOnly: false,
  ownerOnly: false,
  async run(ctx: CommandContext) {
    const { reply, react, sock, from, msg } = ctx;

    await react("🔍").catch(() => undefined);
    const startMs = performance.now();
    const rootDir = process.cwd();

    const topItems = fs.readdirSync(rootDir, { withFileTypes: true });
    const folderSizes: FolderSizeInfo[] = [];
    const heavyFiles: HeavyFileInfo[] = [];
    let rootFilesBytes = 0;
    let rootFilesCount = 0;

    for (const item of topItems) {
      if (item.isSymbolicLink()) continue;
      const full = path.join(rootDir, item.name);
      if (item.isDirectory()) {
        const metrics = getFolderMetrics(full, heavyFiles, rootDir);
        folderSizes.push({
          name: `${item.name}/`,
          bytes: metrics.bytes,
          filesCount: metrics.count,
        });
      } else if (item.isFile()) {
        try {
          const st = fs.statSync(full);
          rootFilesBytes += st.size;
          rootFilesCount++;
          heavyFiles.push({
            relPath: item.name,
            bytes: st.size,
          });
        } catch {}
      }
    }

    if (rootFilesCount > 0) {
      folderSizes.push({
        name: "(Archivos Raíz)",
        bytes: rootFilesBytes,
        filesCount: rootFilesCount,
      });
    }

    folderSizes.sort((a, b) => b.bytes - a.bytes);
    heavyFiles.sort((a, b) => b.bytes - a.bytes);

    const totalProjectBytes = folderSizes.reduce((acc, f) => acc + f.bytes, 0);
    const totalProjectFiles = folderSizes.reduce((acc, f) => acc + f.filesCount, 0);

    let diskPartitionInfo = "No disponible";
    try {
      const { stdout } = await execAsync("df -h . | tail -n 1", { timeout: 3000 });
      const parts = stdout.trim().split(/\s+/);
      if (parts.length >= 5) {
        diskPartitionInfo = `Usado: ${parts[2]} de ${parts[1]} (Libre: ${parts[3]} | ${parts[4]})`;
      }
    } catch {}

    const allCodeFiles = collectCodeFiles(rootDir);
    const issues: FileIssue[] = [];

    for (const file of allCodeFiles) {
      const fileIssues = checkStaticSyntaxAndImports(file, rootDir);
      issues.push(...fileIssues);
    }

    const cmdRoot = path.join(rootDir, "cmd");
    const validCmdFolders = new Set<string>();
    const commandRegistry = new Map<string, string>();
    let totalCmdFiles = 0;
    let healthyCmdFiles = 0;
    let totalAliasesRegistered = 0;

    if (fs.existsSync(cmdRoot)) {
      const catDirs = fs.readdirSync(cmdRoot, { withFileTypes: true }).filter((d) => d.isDirectory());
      for (const cDir of catDirs) {
        validCmdFolders.add(cDir.name);
      }

      for (const cDir of catDirs) {
        const catName = cDir.name;
        const catPath = path.join(cmdRoot, catName);
        const cmdFiles = fs
          .readdirSync(catPath)
          .filter((f) => (f.endsWith(".ts") || f.endsWith(".js")) && !f.endsWith(".d.ts"));

        for (const file of cmdFiles) {
          totalCmdFiles++;
          const fullCmdPath = path.join(catPath, file);
          const relCmdPath = path.relative(rootDir, fullCmdPath);
          let hasCmdError = false;

          try {
            const mod = await import(pathToFileURL(fullCmdPath).href);
            const plugin = mod?.default;

            if (!plugin || typeof plugin !== "object") {
              issues.push({
                file: relCmdPath,
                type: "ESTRUCTURA_CMD",
                detail: "No exporta un objeto por defecto (export default).",
              });
              continue;
            }

            if (typeof plugin.run !== "function") {
              issues.push({
                file: relCmdPath,
                type: "ESTRUCTURA_CMD",
                detail: "Falta la función ejecutora run(ctx).",
              });
              hasCmdError = true;
            }

            const names = Array.isArray(plugin.name)
              ? plugin.name
              : typeof plugin.name === "string"
              ? [plugin.name]
              : [];

            if (names.length === 0 || !names[0]) {
              issues.push({
                file: relCmdPath,
                type: "ESTRUCTURA_CMD",
                detail: "Propiedad 'name' vacía o inválida.",
              });
              hasCmdError = true;
            } else {
              for (const alias of names) {
                const cleanAlias = String(alias).toLowerCase().trim();
                if (!cleanAlias) continue;
                totalAliasesRegistered++;
                if (commandRegistry.has(cleanAlias)) {
                  const prevFile = commandRegistry.get(cleanAlias)!;
                  if (prevFile !== relCmdPath) {
                    issues.push({
                      file: relCmdPath,
                      type: "DUPLICADO",
                      detail: `El comando ".${cleanAlias}" colisiona con ${prevFile}`,
                    });
                  }
                } else {
                  commandRegistry.set(cleanAlias, relCmdPath);
                }
              }
            }

            const declaredCategory = String(plugin.category || "").trim();
            if (!declaredCategory) {
              issues.push({
                file: relCmdPath,
                type: "CATEGORIA",
                detail: `No tiene 'category' definida (debería ser "${catName}").`,
              });
              hasCmdError = true;
            } else if (!validCmdFolders.has(declaredCategory)) {
              issues.push({
                file: relCmdPath,
                type: "CATEGORIA",
                detail: `Categoría inexistente "${declaredCategory}" (carpeta actual: "${catName}").`,
              });
              hasCmdError = true;
            } else if (declaredCategory !== catName) {
              issues.push({
                file: relCmdPath,
                type: "CATEGORIA",
                detail: `Categoría "${declaredCategory}" no coincide con su carpeta "${catName}".`,
              });
            }

            if (!hasCmdError) {
              healthyCmdFiles++;
            }
          } catch (err: any) {
            const rawMsg = String(err?.stack || err?.message || err)
              .split("\n")
              .slice(0, 2)
              .join(" ")
              .slice(0, 140);
            issues.push({
              file: relCmdPath,
              type: "SYNTAX",
              detail: `Fallo al compilar/importar: ${rawMsg}`,
            });
          }
        }
      }
    }

    const elapsedMs = (performance.now() - startMs).toFixed(0);

    const topFoldersText = folderSizes
      .slice(0, 7)
      .map((f, idx) => {
        const pct = totalProjectBytes > 0 ? ((f.bytes / totalProjectBytes) * 100).toFixed(1) : "0.0";
        const medal = idx === 0 ? "🔥" : idx === 1 ? "📦" : "📁";
        return `┃ ${medal} *${f.name}* — \`${formatSize(f.bytes)}\` (${pct}%) [${f.filesCount} arch.]`;
      })
      .join("\n");

    const topHeavyFilesText = heavyFiles
      .slice(0, 5)
      .map((f, idx) => `┃ ${idx + 1}. \`${f.relPath}\` (${formatSize(f.bytes)})`)
      .join("\n");

    const healthStatus =
      issues.length === 0
        ? "🟢 INTACTO (100% Operativo)"
        : issues.some((x) => x.type === "SYNTAX" || x.type === "IMPORT_ROTO")
        ? "🔴 ERRORES CRÍTICOS DETECTADOS"
        : "🟡 ADVERTENCIAS DE ESTRUCTURA";

    const issuesSection: string[] = [];
    if (issues.length === 0) {
      issuesSection.push(
        `╭─〔 ✅ *INTEGRIDAD DE CÓDIGO Y RUTAS* 〕`,
        `┃ 🎯 *Errores de Sintaxis:* \`0\``,
        `┃ 🔗 *Llamados / Imports Rotos:* \`0\``,
        `┃ 🧩 *Comandos Defectuosos:* \`0\``,
        `┃ ✨ *Todos los módulos y rutas responden correctamente.*`,
        `╰─────────────────────`
      );
    } else {
      issuesSection.push(`╭─〔 🚨 *ARCHIVOS CON ERRORES (${issues.length})* 〕`);
      for (const item of issues.slice(0, 18)) {
        issuesSection.push(`┃ ❌ *[$${item.type}]* \`${item.file}\``);
        issuesSection.push(`┃ ╰─ ⚠️ ${item.detail}`);
      }
      if (issues.length > 18) {
        issuesSection.push(`┃ ... y *${issues.length - 18}* alertas adicionales.`);
      }
      issuesSection.push(`╰─────────────────────`);
    }

    const report = [
      `🔬 *${fytBold("AUDITORÍA PROFUNDA // FILECHECK")}* 🔬`,
      `━━━━━━━━━━━━━━━━━━━━━━`,
      `╭─〔 🩺 *ESTADO GENERAL DEL SISTEMA* 〕`,
      `┃ 🚦 *Diagnóstico:* ${healthStatus}`,
      `┃ ⏱️ *Tiempo de escaneo:* \`${elapsedMs} ms\``,
      `┃ 📄 *Archivos de código analizados:* \`${allCodeFiles.length}\``,
      `┃ 🤖 *Comandos operativos:* \`${healthyCmdFiles} / ${totalCmdFiles}\` (\`${totalAliasesRegistered}\` alias)`,
      `┃ ⚠️ *Incidencias totales:* \`${issues.length}\``,
      `╰─────────────────────`,
      ``,
      `╭─〔 💾 *CONSUMO DE ALMACENAMIENTO* 〕`,
      `┃ 💽 *Partición VPS:* \`${diskPartitionInfo}\``,
      `┃ 🗄️ *Peso Total del Bot:* \`${formatSize(totalProjectBytes)}\` (${totalProjectFiles} archivos)`,
      `┃ 🏆 *Carpeta más pesada:* \`${folderSizes[0]?.name || "N/A"}\` (\`${formatSize(folderSizes[0]?.bytes || 0)}\`)`,
      `┃`,
      `┃ 📊 *Desglose por Carpetas:*`,
      topFoldersText,
      `┃`,
      `┃ 🏋️ *Top 5 Archivos Más Pesados (Sin node_modules):*`,
      topHeavyFilesText || "┃ Sin archivos relevantes",
      `╰─────────────────────`,
      ``,
      ...issuesSection,
    ].join("\n");

    await react(issues.length === 0 ? "✅" : "⚠️").catch(() => undefined);

    if (issues.length > 12) {
      const fullLog = issues
        .map((x, i) => `${i + 1}. [${x.type}] ${x.file}\n   Detalle: ${x.detail}`)
        .join("\n\n");

      await sock.sendMessage(
        from,
        {
          document: Buffer.from(fullLog, "utf8"),
          mimetype: "text/plain",
          fileName: `Reporte_Errores_AuraBot_${Date.now()}.txt`,
          caption: report,
        },
        { quoted: msg as any }
      );
      return;
    }

    return reply(report);
  },
};
