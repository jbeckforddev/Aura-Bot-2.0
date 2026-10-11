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

    const beforeMem = process.memoryUsage().rss;
    const beforeStr = (beforeMem / 1024 / 1024).toFixed(2) + " MB";

    let killedList: string[] = [];
    
    try {
      const { stdout: zombiePids } = await execAsync(`ps -eo pid,etimes,comm | awk '$2>60 && $3~/ffmpeg|unzip|wget|curl/ {print $1}'`, { timeout: 5000 });
      const pids = zombiePids.trim().split("\n").filter(Boolean);
      
      if (pids.length > 0) {
        for (const pid of pids) {
          try {
            const { stdout: procName } = await execAsync(`ps -p ${pid} -o comm=`);
            killedList.push(`${procName.trim()} (PID: ${pid})`);
            await execAsync(`kill -9 ${pid}`);
          } catch {}
        }
      }
    } catch {
      try {
        await execAsync("pkill -9 -f ffmpeg || true; pkill -9 -f unzip || true", { timeout: 5000 });
        killedList.push("Múltiples subprocesos de conversión (Forzado)");
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

    const afterMem = process.memoryUsage().rss;
    const afterStr = (afterMem / 1024 / 1024).toFixed(2) + " MB";
    const diff = beforeMem - afterMem;
    const freedRam = diff > 0 ? (diff / 1024 / 1024).toFixed(2) + " MB" : "0.00 MB";

    let processReport = "";
    if (killedList.length > 0) {
      processReport = `┃ > ${killedList.length} proceso(s) aniquilado(s):\n`;
      killedList.forEach(p => {
        processReport += `┃   - ${p}\n`;
      });
    } else {
      processReport = "┃ > No se detectaron subprocesos colgados.\n";
    }

    const text = `╭〔 🚀 ${fytBold("AURA REED OPTIMIZER")} 〕⬣\n┃ 🧠 ${fytBold("MEMORIA RAM")}\n┃ > Gestión: Automática (V8 Engine)\n┃ > RAM Inicial: ${beforeStr}\n┃ > RAM Final: ${afterStr}\n┃ > Liberado: ${freedRam}\n┃\n┃ 🧹 ${fytBold("LIMPIEZA DE CACHÉ")}\n┃ > Archivos eliminados: ${deletedFiles}\n┃ > Caché NPM: Purgada\n┃\n┃ 💀 ${fytBold("CONTROL DE PROCESOS")}\n${processReport}╰━━〔 ⚡ ${fytBold("SYSTEM ACTIVE")} 〕━━⬣`;

    await reply(text).catch(() => undefined);
    await react("✅").catch(() => undefined);
  }
};
