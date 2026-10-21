import { readdir, watch, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { logInfo } from "./logger.ts";
import type { CommandPlugin } from "../types/index.d.ts";

const plugins = new Map<string, CommandPlugin>();
const pluginPaths = new Map<string, string[]>();
const PLUGINS_DIR = path.resolve("./cmd");
const watchTimers = new Map<string, NodeJS.Timeout>();

function normalizePlugin(plugin: unknown): CommandPlugin | null {
  if (!plugin || typeof plugin !== "object") return null;

  const candidate = plugin as Record<string, unknown>;
  if (!candidate.name) return null;
  if (!candidate.run && typeof candidate.execute === "function") {
    candidate.run = (candidate.execute as (...args: unknown[]) => unknown).bind(candidate);
  }

  if (typeof candidate.run !== "function") return null;

  return candidate as unknown as CommandPlugin;
}

export async function loadPlugins() {
  plugins.clear();
  pluginPaths.clear();
  await loadDir(PLUGINS_DIR);

  const uniquePlugins = new Set(plugins.values());
  logInfo(`Plugins cargados: ${uniquePlugins.size} comandos (${plugins.size} alias)`, "info");
}

async function loadDir(dir: string) {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    const tasks: Promise<void>[] = [];
    const prioritizedPlugins: string[] = [];

    for (const entry of entries) {
      const entryName = entry.name.toString();
      const fullPath = path.join(dir, entryName);

      if (entry.isDirectory()) {
        tasks.push(loadDir(fullPath));
      } else if (entry.isFile() && entryName.endsWith(".ts")) {
        if (entryName === "interacciónSFW.ts") {
          prioritizedPlugins.push(fullPath);
        } else {
          tasks.push(loadPlugin(fullPath));
        }
      }
    }

    await Promise.all(tasks);
    for (const pluginPath of prioritizedPlugins) await loadPlugin(pluginPath);
  } catch {}
}

async function loadPlugin(filePath: string) {
  try {
    const fileStat = await stat(filePath).catch(() => null);
    if (!fileStat || fileStat.isDirectory()) return;

    const url = `${pathToFileURL(filePath).href}?t=${Date.now()}`;
    const mod = await import(url);
    const plugin = normalizePlugin(mod.default);
    if (!plugin) return;

    const oldAliases = pluginPaths.get(filePath);
    if (oldAliases) {
      for (const alias of oldAliases) {
        plugins.delete(alias);
      }
    }

    const names = Array.isArray(plugin.name) ? plugin.name : [plugin.name];
    const newAliases: string[] = [];

    for (const name of names) {
      if (typeof name === "string" && name.trim()) {
        const cleanName = name.toLowerCase();
        plugins.set(cleanName, plugin);
        newAliases.push(cleanName);
      }
    }

    pluginPaths.set(filePath, newAliases);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logInfo(`Error cargando plugin ${filePath}: ${message}`, "error");
  }
}

export async function watchPlugins() {
  const dirStat = await stat(PLUGINS_DIR).catch(() => null);
  if (!dirStat || !dirStat.isDirectory()) return;

  logInfo("Hot-reload de plugins activo con soporte anti-duplicados", "info");

  try {
    const watcher = watch(PLUGINS_DIR, { recursive: true });

    for await (const event of watcher) {
      const fileName = event.filename?.toString();
      if (!fileName || !fileName.endsWith(".ts")) continue;

      const fullPath = path.resolve(PLUGINS_DIR, fileName);

      if (watchTimers.has(fullPath)) {
        clearTimeout(watchTimers.get(fullPath)!);
      }

      const timer = setTimeout(async () => {
        watchTimers.delete(fullPath);

        const fileStat = await stat(fullPath).catch(() => null);

        if (!fileStat) {
          const oldAliases = pluginPaths.get(fullPath);
          if (oldAliases) {
            for (const alias of oldAliases) plugins.delete(alias);
            pluginPaths.delete(fullPath);
            logInfo(`Plugin eliminado del disco y memoria: ${fileName}`, "success");
          }
          return;
        }

        logInfo(`Plugin actualizado detectado: ${fileName}`, "info");
        await loadPlugin(fullPath);
      }, 250);

      watchTimers.set(fullPath, timer);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logInfo(`Error en el observador de plugins: ${message}`, "error");
  }
}

export function getPlugins(): Map<string, CommandPlugin> {
  return plugins;
}
