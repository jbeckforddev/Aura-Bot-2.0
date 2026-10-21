import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import inspector from "node:inspector";
import "./config.ts";
import { connectToWhatsApp } from "./core/conection.ts";
import { startSavedSubBots } from "./core/subbotManager.ts";
import { loadPlugins, watchPlugins } from "./core/cmdLoader.ts";
import { displayBanner, logInfo } from "./core/logger.ts";
import * as AuraDB from "./database/AuraDB.ts";

const TMP_DIR = path.resolve("./cache");
const PROFILES_DIR = path.join(TMP_DIR, "profiles");

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
  if (typeof (globalThis as any).gc === "function") {
    try {
      (globalThis as any).gc();
    } catch {}
  }
}, 15 * 60 * 1000);

maintenanceInterval.unref?.();

function startCpuProfile() {
  if (process.env.AURA_DEBUG_PROFILE !== "true") return;

  const session = new inspector.Session();
  session.connect();

  session.post("Profiler.enable", (enableError) => {
    if (enableError) {
      session.disconnect();
      logInfo(`No se pudo habilitar el perfil CPU: ${enableError.message}`, "error");
      return;
    }

    session.post("Profiler.start", (startError) => {
      if (startError) {
        session.disconnect();
        logInfo(`No se pudo iniciar el perfil CPU: ${startError.message}`, "error");
        return;
      }

      const timer = setTimeout(() => {
        session.post("Profiler.stop", async (stopError, result) => {
          session.disconnect();
          if (stopError) {
            logInfo(`No se pudo guardar el perfil CPU: ${stopError.message}`, "error");
            return;
          }

          try {
            await fsp.mkdir(PROFILES_DIR, { recursive: true });
            const profilePath = path.join(PROFILES_DIR, `cpu-${Date.now()}.cpuprofile`);
            await fsp.writeFile(profilePath, JSON.stringify(result.profile));
            logInfo(`Perfil CPU guardado en ${profilePath}`, "alert");
          } catch (error) {
            logInfo(`No se pudo escribir el perfil CPU: ${String(error)}`, "error");
          }
        });
      }, 45_000);

      timer.unref?.();
    });
  });
}

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
  startCpuProfile();

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
