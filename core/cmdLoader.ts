import { readdir, watch, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { logInfo } from "./logger.ts";
import type { CommandPlugin } from "../types/index.d.ts";

const PLUGINS_DIR = path.resolve("./cmd");
const IMPORT_BATCH_SIZE = 8;
const RELOAD_DEBOUNCE_MS = 250;

const plugins = new Map<string, CommandPlugin>();
const filePlugins = new Map<string, CommandPlugin>();
const watchTimers = new Map<string, NodeJS.Timeout>();
let watching = false;

function normalizePlugin(plugin: unknown): CommandPlugin | null {
  if (!plugin || typeof plugin !== "object") return null;
  const candidate = plugin as Record<string, unknown>;
  if (!candidate.name) return null;

  if (typeof candidate.run !== "function" &&
      typeof candidate.execute === "function") {
    candidate.run = (...args: unknown[]) =>
      (candidate.execute as (...values: unknown[]) => unknown).apply(candidate, args);
  }

  return typeof candidate.run === "function"
    ? candidate as unknown as CommandPlugin
    : null;
}

async function collectCommandFiles(directory: string): Promise<string[]> {
  const files: string[] = [];
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    logInfo("No se pudo leer cmd/: " + String(error), "error");
    return files;
  }

  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectCommandFiles(full));
    } else if (entry.isFile() && /\.(ts|js)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
      files.push(full);
    }
  }
  return files;
}

async function readPlugin(filePath: string): Promise<CommandPlugin | null> {
  const fileStat = await stat(filePath).catch(() => null);
  if (!fileStat?.isFile()) return null;

  try {
    const url = pathToFileURL(filePath).href + "?t=" + Date.now();
    const module = await import(url);
    const plugin = normalizePlugin(module.default);
    if (!plugin) {
      logInfo("Comando inválido en " + path.relative(PLUGINS_DIR, filePath), "error");
    }
    return plugin;
  } catch (error) {
    logInfo(
      "Error cargando plugin " + filePath + ": " +
      (error instanceof Error ? error.message : String(error)),
      "error",
    );
    return null;
  }
}

function rankFile(filePath: string): string {
  // La interacción SFW tenía prioridad de alias en el cargador anterior.
  return path.basename(filePath) === "interacciónSFW.ts" ? "\0" : filePath;
}

function rebuildRegistry(): void {
  plugins.clear();
  const aliases = new Map<string, string>();

  const sorted = [...filePlugins.entries()].sort((a, b) =>
    rankFile(a[0]).localeCompare(rankFile(b[0])),
  );

  for (const [filePath, plugin] of sorted) {
    const names = Array.isArray(plugin.name) ? plugin.name : [plugin.name];
    for (const name of names) {
      if (typeof name !== "string") continue;
      const alias = name.toLowerCase().trim();
      if (!alias) continue;

      const previousFile = aliases.get(alias);
      if (previousFile) {
        logInfo(
          "Alias duplicado '" + alias + "': " +
          path.relative(PLUGINS_DIR, filePath) + " frente a " +
          path.relative(PLUGINS_DIR, previousFile) +
          ". Se conserva el primero.",
          "error",
        );
        continue;
      }
      plugins.set(alias, plugin);
      aliases.set(alias, filePath);
    }
  }
}

export async function loadPlugins(): Promise<void> {
  filePlugins.clear();
  const files = await collectCommandFiles(PLUGINS_DIR);

  for (let index = 0; index < files.length; index += IMPORT_BATCH_SIZE) {
    const batch = files.slice(index, index + IMPORT_BATCH_SIZE);
    const results = await Promise.all(batch.map(readPlugin));
    results.forEach((plugin, offset) => {
      if (plugin) filePlugins.set(batch[offset], plugin);
    });
  }

  rebuildRegistry();
  logInfo(
    "Plugins cargados: " + new Set(plugins.values()).size +
      " comandos (" + plugins.size + " alias)",
    "info",
  );
}

async function reloadFile(filePath: string): Promise<void> {
  const fileStat = await stat(filePath).catch(() => null);
  if (!fileStat?.isFile()) {
    if (filePlugins.delete(filePath)) {
      rebuildRegistry();
      logInfo("Plugin eliminado: " + path.relative(PLUGINS_DIR, filePath), "info");
    }
    return;
  }

  const updated = await readPlugin(filePath);
  if (!updated) {
    // No se descarta la instancia anterior ante un error de hot-reload.
    return;
  }

  filePlugins.set(filePath, updated);
  rebuildRegistry();
  logInfo("Plugin actualizado: " + path.relative(PLUGINS_DIR, filePath), "info");
}

export async function watchPlugins(): Promise<void> {
  if (watching) return;
  const directory = await stat(PLUGINS_DIR).catch(() => null);
  if (!directory?.isDirectory()) return;

  watching = true;
  logInfo("Hot-reload de plugins activo", "info");

  try {
    const watcher = watch(PLUGINS_DIR, { recursive: true });
    for await (const event of watcher) {
      const fileName = event.filename?.toString();
      if (!fileName || !/\.(ts|js)$/.test(fileName) || fileName.endsWith(".d.ts")) continue;

      const filePath = path.resolve(PLUGINS_DIR, fileName);
      if (!filePath.startsWith(PLUGINS_DIR + path.sep)) continue;

      const previous = watchTimers.get(filePath);
      if (previous) clearTimeout(previous);

      watchTimers.set(
        filePath,
        setTimeout(() => {
          watchTimers.delete(filePath);
          void reloadFile(filePath).catch((error) =>
            logInfo("Error de recarga: " + String(error), "error"),
          );
        }, RELOAD_DEBOUNCE_MS),
      );
    }
  } catch (error) {
    logInfo("Error en el observador de plugins: " + String(error), "error");
  } finally {
    watching = false;
    for (const timer of watchTimers.values()) clearTimeout(timer);
    watchTimers.clear();
  }
}

export function getPlugins(): Map<string, CommandPlugin> {
  return plugins;
}
