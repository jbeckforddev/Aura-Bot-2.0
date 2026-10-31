import { displayBanner, logInfo } from "./core/logger.ts";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import v8 from "node:v8";
import vm from "node:vm";
import "./config.ts";

process.setMaxListeners(0);

// Enable runtime V8 garbage collection if not already exposed
if (typeof (globalThis as any).gc !== "function") {
  try {
    v8.setFlagsFromString("--expose_gc");
    (globalThis as any).gc = vm.runInNewContext("gc");
  } catch {}
}

import { connectMainBot } from "./connection/MainBotManager.ts";
import { startSavedSubBots } from "./connection/subbotManager.ts";
import { loadPlugins, watchPlugins } from "./core/cmdLoader.ts";
import * as AuraDB from "./database/AuraDB.ts";
import { flushPendingContacts } from "./handler.ts";
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

function runMemoryMaintenance() {
  void cleanCache(10 * 60 * 1000);
  try {
    flushPendingContacts();
  } catch {}
  try {
    AuraDB.checkpointDb();
  } catch {}
  if (typeof (globalThis as any).gc === "function") {
    try {
      (globalThis as any).gc();
    } catch {}
  }
}

const maintenanceInterval = setInterval(runMemoryMaintenance, 5 * 60 * 1000);
maintenanceInterval.unref?.();


let isShuttingDown = false;

function handleShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  try {
    logInfo(`Señal ${signal} recibida. Guardando base de datos...`, "alert");
    flushPendingContacts();
    AuraDB.checkpointDb();
  } catch {}
  process.exit(0);
}

process.on("SIGINT", () => handleShutdown("SIGINT"));
process.on("SIGTERM", () => handleShutdown("SIGTERM"));
process.on("exit", () => {
  try {
    flushPendingContacts();
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

  const instanceRole = (process.env.INSTANCE_ROLE || "").trim().toLowerCase();
  const shouldStartMainBot = instanceRole !== "sub" && instanceRole !== "subs";
  const shouldStartSubBots = process.env.DISABLE_SUBBOTS !== "true" && instanceRole !== "main";

  if (shouldStartMainBot) {
    logInfo("Conectando a WhatsApp...");
    await connectMainBot("main");
  } else {
    logInfo(`Instancia configurada exclusivamente para subbots (INSTANCE_ROLE=${instanceRole}).`, "info");
  }

  if (shouldStartSubBots) {
    void startSavedSubBots()
      .then(() => {
        runMemoryMaintenance();
      })
      .catch((error) => {
        logInfo(`Error al iniciar subbots guardados: ${String(error)}`, "error");
      });
  } else {
    logInfo(`Subbots desactivados para esta instancia (INSTANCE_ROLE=${instanceRole || "main"}).`, "info");
  }
}

void mainBot();
