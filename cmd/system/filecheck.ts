import type { CommandContext } from "../../types/index";
import { fytBold } from "../../core/socketText.ts";
import * as fs from "node:fs";
import * as path from "node:path";
import ts from "typescript";
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
    if (new Set(["node_modules", ".git", "dist", "sessions", "data", "cache", ".npm", ".tx3", ".wip"]).has(entry.name)) continue;
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      collectCodeFiles(full, list);
    } else if (
      entry.isFile() &&
      /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs|json)$/i.test(entry.name)
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


function literalString(node: ts.Node | undefined): string | null {
  return node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    ? node.text : null;
}

function makeSource(filePath: string, content: string): ts.SourceFile {
  return ts.createSourceFile(
    filePath, content, ts.ScriptTarget.Latest, true,
    /\.(js|jsx|mjs|cjs)$/i.test(filePath) ? ts.ScriptKind.JS : ts.ScriptKind.TS,
  );
}

function checkStaticSyntaxAndImports(filePath: string, rootDir: string): FileIssue[] {
  const issues: FileIssue[] = [];
  const file = path.relative(rootDir, filePath);
  let content = "";

  try {
    content = fs.readFileSync(filePath, "utf8");
  } catch (error) {
    issues.push({ file, type: "SYNTAX", detail: "No se pudo leer: " + String(error) });
    return issues;
  }
  if (!content.trim()) {
    issues.push({ file, type: "SYNTAX", detail: "El archivo está vacío." });
    return issues;
  }

  if (filePath.endsWith(".json")) {
    try {
      JSON.parse(content);
    } catch (error) {
      issues.push({ file, type: "JSON_CORRUPTO", detail: String(error).slice(0, 180) });
    }
    return issues;
  }

  const source = makeSource(filePath, content);
  const diagnostics =
    (source as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] })
      .parseDiagnostics || [];

  for (const diagnostic of diagnostics) {
    const location = source.getLineAndCharacterOfPosition(diagnostic.start || 0);
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ");
    issues.push({
      file, type: "SYNTAX",
      detail: "Línea " + (location.line + 1) + ", columna " +
        (location.character + 1) + ": " + message.slice(0, 220),
    });
  }

  const baseDir = path.dirname(filePath);
  const inspected = new Set<string>();

  function inspectImport(spec: string) {
    if (!spec.startsWith(".") || inspected.has(spec)) return;
    inspected.add(spec);
    if (!resolveImportTarget(baseDir, spec)) {
      issues.push({ file, type: "IMPORT_ROTO", detail: "Ruta inexistente: " + spec });
    }
  }

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const spec = literalString(node.moduleSpecifier);
      if (spec) inspectImport(spec);
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference)
    ) {
      const spec = literalString(node.moduleReference.expression);
      if (spec) inspectImport(spec);
    } else if (ts.isCallExpression(node) && node.arguments.length > 0) {
      const imported = node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require");
      if (imported) {
        const spec = literalString(node.arguments[0]);
        if (spec) inspectImport(spec);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return issues;
}

interface CommandMetadata {
  names: string[];
  category: string | null;
  hasExecutor: boolean;
  readable: boolean;
}

function readCommandMetadata(filePath: string): CommandMetadata {
  const source = makeSource(filePath, fs.readFileSync(filePath, "utf8"));
  const statement = source.statements.find(
    (item): item is ts.ExportAssignment =>
      ts.isExportAssignment(item) && !item.isExportEquals,
  );

  const empty: CommandMetadata = {
    names: [], category: null, hasExecutor: false, readable: false,
  };
  if (!statement) return empty;

  let expression: ts.Expression = statement.expression;
  // Desenvuelve expresiones TypeScript que conservan el objeto del comando.
  // Ejemplos: export default {...} satisfies CommandPlugin; y {...} as CommandPlugin.
  while (
    ts.isParenthesizedExpression(expression) ||
    ts.isSatisfiesExpression(expression) ||
    ts.isAsExpression(expression) ||
    ts.isTypeAssertionExpression(expression)
  ) {
    expression = expression.expression;
  }
  // Algunos módulos exportan un identificador: const command = {...}; export default command.
  if (ts.isIdentifier(expression)) {
    const name = expression.text;
    const declaration = source.statements
      .filter(ts.isVariableStatement)
      .flatMap((statement) => statement.declarationList.declarations)
      .find((item) => ts.isIdentifier(item.name) && item.name.text === name);
    if (declaration?.initializer) expression = declaration.initializer;
  }

  const isEconomyFactory = ts.isCallExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === "createEconomyActivity" &&
    expression.arguments.length > 0 &&
    ts.isObjectLiteralExpression(expression.arguments[0]);
  if (isEconomyFactory && ts.isCallExpression(expression)) {
    expression = expression.arguments[0];
  }

  if (!ts.isObjectLiteralExpression(expression)) return empty;
  const commandObject = expression;

  function propertyKey(item: ts.ObjectLiteralElementLike): string | null {
    if (!item.name) return null;
    return ts.isIdentifier(item.name) ? item.name.text : literalString(item.name);
  }

  function property(key: string): ts.ObjectLiteralElementLike | undefined {
    return commandObject.properties.find((item) => propertyKey(item) === key);
  }

  const nameProp = property(isEconomyFactory ? "names" : "name");
  let names: string[] = [];
  if (nameProp && ts.isPropertyAssignment(nameProp)) {
    const value = nameProp.initializer;
    if (ts.isArrayLiteralExpression(value)) {
      names = value.elements.map(literalString).filter(
        (name): name is string => name !== null,
      );
    } else if (
      ts.isCallExpression(value) &&
      ts.isPropertyAccessExpression(value.expression) &&
      ts.isIdentifier(value.expression.expression) &&
      value.expression.expression.text === "Object" &&
      value.expression.name.text === "keys" &&
      value.arguments.length === 1 &&
      ts.isIdentifier(value.arguments[0]) &&
      value.arguments[0].text === "DATA"
    ) {
      // Interacciones SFW/NSFW: nombres declarados en JSON, sin ejecutar el comando.
      const match = source.text.match(
        /const\s+DATA_PATH\s*=\s*path\.resolve\(\s*process\.cwd\(\)\s*,\s*["']([^"']+\.json)["']\s*\)/,
      );
      if (match) {
        const root = path.resolve(process.cwd(), "database") + path.sep;
        const jsonFile = path.resolve(process.cwd(), match[1]);
        if (jsonFile.startsWith(root) && fs.existsSync(jsonFile)) {
          try {
            names = Object.keys(JSON.parse(fs.readFileSync(jsonFile, "utf8")));
          } catch {}
        }
      }
    } else {
      const name = literalString(value);
      if (name !== null) names = [name];
    }
  }

  const catProp = property("category");
  const category = isEconomyFactory
    ? "economy"
    : catProp && ts.isPropertyAssignment(catProp)
      ? literalString(catProp.initializer) : null;

  const hasExecutor = isEconomyFactory || ["run", "execute"].some((key) => {
    const item = property(key);
    if (!item) return false;
    if (ts.isMethodDeclaration(item)) return true;
    return ts.isPropertyAssignment(item) &&
      (ts.isArrowFunction(item.initializer) || ts.isFunctionExpression(item.initializer));
  });

  return { names, category, hasExecutor, readable: true };
}

export default {
  name: ["filecheck", "checkbot", "auditarbot", "diagnostico"],
  category: "system",
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
      const dirs = fs.readdirSync(cmdRoot, { withFileTypes: true })
        .filter((entry) => entry.isDirectory());
      for (const entry of dirs) validCmdFolders.add(entry.name);

      // Se inspeccionan archivos, sin importarlos ni ejecutar inicializaciones.
      // Incluye los comandos sueltos en cmd/ y todas sus subcarpetas.
      const commandFiles = collectCodeFiles(cmdRoot)
        .filter((file) => /\.(ts|js)$/.test(file) && !file.endsWith(".d.ts"))
        .sort((a, b) => a.localeCompare(b));

      for (const fullCmdPath of commandFiles) {
        totalCmdFiles++;
        const relCmdPath = path.relative(rootDir, fullCmdPath);
        const dir = path.relative(cmdRoot, path.dirname(fullCmdPath));
        const catName = dir ? dir.split(path.sep)[0] : null;
        let hasCmdError = issues.some((issue) =>
          issue.file === relCmdPath &&
          (issue.type === "SYNTAX" || issue.type === "IMPORT_ROTO"),
        );

        try {
          const plugin = readCommandMetadata(fullCmdPath);
          if (!plugin.readable) {
            issues.push({
              file: relCmdPath, type: "ESTRUCTURA_CMD",
              detail: "No se pudo inspeccionar el export default estáticamente.",
            });
            hasCmdError = true;
          }
          if (!plugin.hasExecutor) {
            issues.push({
              file: relCmdPath, type: "ESTRUCTURA_CMD",
              detail: "No se identificó un método run o execute literal.",
            });
            hasCmdError = true;
          }
          if (plugin.names.length === 0 || plugin.names.some((name) => !name.trim())) {
            issues.push({
              file: relCmdPath, type: "ESTRUCTURA_CMD",
              detail: "No se identificaron alias literales válidos en name.",
            });
            hasCmdError = true;
          } else {
            for (const name of plugin.names) {
              const alias = name.toLowerCase().trim();
              if (!alias) continue;
              totalAliasesRegistered++;
              const previous = commandRegistry.get(alias);
              if (previous) {
                issues.push({
                  file: relCmdPath, type: "DUPLICADO",
                  detail: previous === relCmdPath
                    ? "Alias repetido en el mismo archivo: ." + alias
                    : "El comando ." + alias + " colisiona con " + previous,
                });
                hasCmdError = true;
              } else {
                commandRegistry.set(alias, relCmdPath);
              }
            }
          }

          const category = plugin.category?.trim() || "";
          if (!category) {
            issues.push({
              file: relCmdPath, type: "CATEGORIA",
              detail: "No se identificó una categoría literal.",
            });
            hasCmdError = true;
          } else if (!validCmdFolders.has(category)) {
            issues.push({
              file: relCmdPath, type: "CATEGORIA",
              detail: "Categoría inexistente: " + category,
            });
            hasCmdError = true;
          } else if (category !== catName) {
            issues.push({
              file: relCmdPath, type: "CATEGORIA",
              detail: catName
                ? "Categoría " + category + " no coincide con carpeta " + catName
                : "Comando fuera de su carpeta: cmd/" + category + "/",
            });
            hasCmdError = true;
          }
          if (!hasCmdError) healthyCmdFiles++;
        } catch (error) {
          issues.push({
            file: relCmdPath, type: "ESTRUCTURA_CMD",
            detail: "Análisis estático incompleto: " + String(error).slice(0, 140),
          });
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
      `┃ 🤖 *Comandos validados estáticamente:* \`${healthyCmdFiles} / ${totalCmdFiles}\` (\`${totalAliasesRegistered}\` alias)`,
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
