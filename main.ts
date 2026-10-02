import fs from "fs";
import path from "path";
import sharp from "sharp";
import "./config.ts";
import { connectToWhatsApp } from "./core/conection.ts";
import { startSavedSubBots } from "./core/subbotManager.ts";
import { loadPlugins, watchPlugins } from "./core/cmdLoader.ts";
import { displayBanner, logInfo, connectionLog } from "./core/logger.ts";
import { checkpointDb } from "./database/AuraDB.ts";

// Desactivar caché de memoria nativa de sharp (libvips)
sharp.cache(false);
sharp.concurrency(1);

const TMP_DIR = path.resolve("./cache");
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
process.env.TMPDIR = TMP_DIR;

for (const file of fs.readdirSync(TMP_DIR)) {
  try {
    fs.unlinkSync(path.join(TMP_DIR, file));
  } catch {
    // Ignora archivos que ya no estén disponibles al limpiar el caché.
  }
}

// Limpieza periódica de archivos temporales cada 15 minutos para evitar saturar la RAM
setInterval(
  () => {
    if (fs.existsSync(TMP_DIR)) {
      for (const file of fs.readdirSync(TMP_DIR)) {
        try {
          const filePath = path.join(TMP_DIR, file);
          const stat = fs.statSync(filePath);
          if (Date.now() - stat.mtimeMs > 30 * 60 * 1000) {
            fs.unlinkSync(filePath);
          }
        } catch {
          // Ignora entradas no válidas durante la limpieza del caché.
        }
      }
    }
    checkpointDb();
    if (global.gc) global.gc();
  },
  15 * 60 * 1000,
);

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
