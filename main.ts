import { displayBanner, logInfo } from "./core/logger.ts";
import v8 from "node:v8";

const MAX_SIZE_OF_RAM = 512
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import "./config.ts";
import { connectToWhatsApp } from "./core/conection.ts";
import { startSavedSubBots } from "./core/subbotManager.ts";
import { loadPlugins, watchPlugins } from "./core/cmdLoader.ts";
import * as AuraDB from "./database/AuraDB.ts";
const TMP_DIR = path.resolve("./cache");

if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
process.env.TMPDIR = TMP_DIR;
process.env.GLOBAL_CUSTOM_TMP = TMP_DIR;

let isCleaningCache = false;

async function cleanCache(maxAgeMs: number = 0) {
  if (isCleaningCache) return;
  isCleaningCache = true;

  try {
    const entries = await fsp.readdir(TMP_DIR, { withFileTypes: true });
    const now = Date.now();

    await Promise.allSettled(
      entries.map(async (entry) => {
        if (entry.name === "profiles") return;
        const fullPath = path.join(TMP_DIR, entry.name);

        if (maxAgeMs <= 0) {
          await fsp.rm(fullPath, { recursive: true, force: true });
          return;
        }

        const stat = await fsp.stat(fullPath);
        if (now - stat.mtimeMs >= maxAgeMs) {
          await fsp.rm(fullPath, { recursive: true, force: true });
        }
      }),
    );
  } catch {} finally {
    isCleaningCache = false;
  }
}

const maintenanceInterval = setInterval(() => {
  void cleanCache(30 * 60 * 1000);
  AuraDB.checkpointDb();

  const currentRss = process.memoryUsage().rss / 1024 / 1024;

  if (currentRss > (MAX_SIZE_OF_RAM * 0.8)) {
    try {
      logInfo(`[RAM] RSS Elevado (${currentRss.toFixed(2)} MB). Forzando purga nativa...`, "warn");
      const v8Native = v8 as any;
      if (typeof v8Native.getHeapSnapshot === "function") {
        const stream = v8Native.getHeapSnapshot();
        stream.resume();
      }
      v8Native.takeCoverageProfile?.();
      if (typeof v8Native.adjustAmountOfExternalAllocatedMemory === "function") {
        v8Native.adjustAmountOfExternalAllocatedMemory(-1024 * 1024 * 10);
      }

    } catch (error) {
      logInfo(`Error en purga de RAM: ${String(error)}`, "error");
    }
  }
}, 5 * 60 * 1000);

maintenanceInterval.unref?.();


let isShuttingDown = false;

function handleShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  try {
    logInfo(`Señal ${signal} recibida. Guardando base de datos...`, "alert");
    AuraDB.checkpointDb();
  } catch {}
  process.exit(0);
}

process.on("SIGINT", () => handleShutdown("SIGINT"));
process.on("SIGTERM", () => handleShutdown("SIGTERM"));
process.on("exit", () => {
  try {
    AuraDB.checkpointDb();
  } catch {}
});

process.on("unhandledRejection", (reason) => {
  logInfo(`Promesa rechazada no controlada: ${String(reason)}`, "error");
});

process.on("uncaughtException", (error) => {
  logInfo(`Excepción crítica capturada: ${error.message}`, "error");
  try {
    AuraDB.checkpointDb();
  } catch {}
});

async function mainBot() {
  await cleanCache(0);
  await Promise.all([
    displayBanner(),
    (async () => {
      try {
        (AuraDB as Record<string, unknown> & { warmLanguageCaches?: () => void }).warmLanguageCaches?.();
      } catch {}
      await loadPlugins();
    })(),
  ]);

  logInfo("Inicializando bot principal...");
  watchPlugins();

  logInfo("Conectando a WhatsApp...");
  await connectToWhatsApp("main", false);

  void startSavedSubBots().catch((error) => {
    logInfo(`Error al iniciar subbots guardados: ${String(error)}`, "error");
  });
}

void mainBot();
