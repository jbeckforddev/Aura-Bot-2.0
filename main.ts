import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import inspector from "node:inspector";
import "./config.ts";
import { connectToWhatsApp } from "./core/conection.ts";
import { startSavedSubBots } from "./core/subbotManager.ts";
import { loadPlugins, watchPlugins } from "./core/cmdLoader.ts";
import { displayBanner, logInfo, connectionLog } from "./core/logger.ts";
import { checkpointDb } from "./database/AuraDB.ts";

const TMP_DIR = path.resolve("./cache");
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
process.env.TMPDIR = TMP_DIR;

async function cleanCache(maxAgeMs: number = 0) {
  try {
    const files = await fsp.readdir(TMP_DIR);
    for (const file of files) {
      const filePath = path.join(TMP_DIR, file);
      try {
        const stat = await fsp.stat(filePath);
        if (Date.now() - stat.mtimeMs >= maxAgeMs) {
          await fsp.unlink(filePath);
        }
      } catch {}
    }
  } catch {}
}

cleanCache(0);

setInterval(() => {
  cleanCache(30 * 60 * 1000);
  checkpointDb();
  if (typeof (global as any).gc === "function") {
    (global as any).gc();
  }
}, 15 * 60 * 1000);

function startCpuProfile() {
  if (process.env.AURA_DEBUG_PROFILE !== "true") return;

  const session = new inspector.Session();
  session.connect();

  session.post("Profiler.enable", (enableError) => {
    if (enableError) {
      session.disconnect();
      connectionLog(`No se pudo habilitar el perfil CPU: ${enableError.message}`, "error");
      return;
    }

    session.post("Profiler.start", (startError) => {
      if (startError) {
        session.disconnect();
        connectionLog(`No se pudo iniciar el perfil CPU: ${startError.message}`, "error");
        return;
      }

      setTimeout(() => {
        session.post("Profiler.stop", (stopError, result) => {
          session.disconnect();
          if (stopError) {
            connectionLog(`No se pudo guardar el perfil CPU: ${stopError.message}`, "error");
            return;
          }

          try {
            const profileDir = path.join(TMP_DIR, "profiles");
            if (!fs.existsSync(profileDir)) fs.mkdirSync(profileDir, { recursive: true });
            const profilePath = path.join(profileDir, `cpu-${Date.now()}.cpuprofile`);
            fs.writeFileSync(profilePath, JSON.stringify(result.profile));
            connectionLog(`Perfil CPU guardado en ${profilePath}`, "alert");
          } catch (error) {
            connectionLog(`No se pudo escribir el perfil CPU: ${String(error)}`, "error");
          }
        });
      }, 45_000);
    });
  });
}

startCpuProfile();

async function mainBot() {
  await displayBanner();
  logInfo("Inicializando bot principal...");
  await loadPlugins();
  watchPlugins();
  await startSavedSubBots();
  connectionLog("Conectando a WhatsApp...");
  await connectToWhatsApp("main", false);
}

void mainBot();
