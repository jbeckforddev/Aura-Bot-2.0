import { rm, readdir } from "node:fs/promises";
import { join } from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

const execAsync = promisify(exec);
const tmpDir = process.env.AURA_DOWNLOAD_CACHE || join(process.cwd(), "cache");

export default {
  name: ["optimize", "clearram", "clean", "optimizervps"],
  category: "owner",
  description: "Optimiza la VPS purgando caché y aniquilando procesos atascados.",
  async run(ctx: CommandContext) {
    const { reply, react, isOwner } = ctx;
    
    if (!isOwner) return;

    await react("⏳").catch(() => undefined);

    const before = process.memoryUsage().rss;
    let killedProcesses = false;

    try {
      await execAsync(`ps -eo pid,etimes,comm | awk '$2>60 && $3~/ffmpeg|unzip|wget|curl/ {print $1}' | xargs -r kill -9`, { timeout: 5000 });
      killedProcesses = true;
    } catch {
      try {
        await execAsync("pkill -9 -f ffmpeg || true; pkill -9 -f unzip || true", { timeout: 5000 });
        killedProcesses = true;
      } catch {}
    }

    let deletedFiles = 0;
    try {
      const files = await readdir(tmpDir);
      for (const file of files) {
        await rm(join(tmpDir, file), { recursive: true, force: true }).catch(() => undefined);
        deletedFiles++;
      }
    } catch {}

    try {
      await execAsync("npm cache clean --force || true", { timeout: 10000 });
    } catch {}

    const after = process.memoryUsage().rss;
    const currentRam = (after / 1024 / 1024).toFixed(2) + " MB";
    const diff = before - after;
    const freedRam = diff > 0 ? (diff / 1024 / 1024).toFixed(2) + " MB" : "0.00 MB";

    const text = `╭〔 🚀 ${fytBold("AURA REED OPTIMIZER")} 〕⬣\n┃ 🧠 ${fytBold("MEMORIA RAM")}\n┃ > Gestión: Automática (V8 Engine)\n┃ > RAM Liberada: ${freedRam}\n┃ > RAM Actual: ${currentRam}\n┃\n┃ 🧹 ${fytBold("LIMPIEZA DE CACHÉ")}\n┃ > Archivos eliminados: ${deletedFiles}\n┃ > Caché NPM: Purgada\n┃\n┃ 💀 ${fytBold("CONTROL DE PROCESOS")}\n┃ > ${killedProcesses ? "Subprocesos fantasma (>60s) aniquilados." : "No se detectaron subprocesos colgados."}\n╰━━〔 ⚡ ${fytBold("SYSTEM ACTIVE")} 〕━━⬣`;

    await reply(text).catch(() => undefined);
    await react("✅").catch(() => undefined);
  }
};
