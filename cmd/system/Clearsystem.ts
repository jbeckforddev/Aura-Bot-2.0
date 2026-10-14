import { rm, readdir, stat, statfs, mkdir, access } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { performance } from "node:perf_hooks";
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { checkpointDb } from "../../database/AuraDB.ts";
import { t } from "../../src/langs/index.ts";

const execFileAsync = promisify(execFile);

const CACHE_DIR =
  process.env.GLOBAL_CUSTOM_TMP ||
  process.env.AURA_DOWNLOAD_CACHE ||
  process.env.TMPDIR ||
  resolve("./cache");

const CRITICAL_DIRS = [
  { name: "cache", path: CACHE_DIR, autoRepair: true },
  { name: "data", path: resolve(globalThis.DATA_BASE_DIR || "./data"), autoRepair: true },
  { name: "cmd", path: resolve("./cmd"), autoRepair: false },
  { name: "assets", path: resolve("./assets"), autoRepair: false },
];

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0.00 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(2)} ${units[index]}`;
}

function readCgroupNumber(filePath: string): number | null {
  try {
    const raw = readFileSync(filePath, "utf8").trim();
    if (!raw || raw === "max") return null;
    const num = Number(raw);
    return Number.isFinite(num) && num > 0 && num < 9223372036854771712 ? num : null;
  } catch {
    return null;
  }
}

function getContainerMemory() {
  if (existsSync("/sys/fs/cgroup/memory.max") && existsSync("/sys/fs/cgroup/memory.current")) {
    const total = readCgroupNumber("/sys/fs/cgroup/memory.max");
    const used = readCgroupNumber("/sys/fs/cgroup/memory.current");
    if (total && used !== null) return { total, used };
  }
  if (existsSync("/sys/fs/cgroup/memory/memory.limit_in_bytes")) {
    const total = readCgroupNumber("/sys/fs/cgroup/memory/memory.limit_in_bytes");
    const used = readCgroupNumber("/sys/fs/cgroup/memory/memory.usage_in_bytes");
    if (total && used !== null) return { total, used };
  }
  return { total: os.totalmem(), used: os.totalmem() - os.freemem() };
}

async function measureEventLoopLag(): Promise<number> {
  const start = performance.now();
  await new Promise<void>((resolveTick) => setImmediate(resolveTick));
  return Math.max(0, performance.now() - start);
}

async function getDirectoryStats(dirPath: string, skipRecentMs: number = 0) {
  let deletedCount = 0;
  let freedBytes = 0;
  let retainedCount = 0;

  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    const now = Date.now();

    await Promise.allSettled(
      entries.map(async (entry) => {
        if (entry.name === "profiles") {
          retainedCount++;
          return;
        }
        const fullPath = join(dirPath, entry.name);
        try {
          const itemStat = await stat(fullPath);
          if (skipRecentMs > 0 && now - itemStat.mtimeMs < skipRecentMs) {
            retainedCount++;
            return;
          }
          const size = itemStat.isFile() ? itemStat.size : 0;
          await rm(fullPath, { recursive: true, force: true });
          deletedCount++;
          freedBytes += size;
        } catch {}
      }),
    );
  } catch {}

  return { deletedCount, freedBytes, retainedCount };
}

async function killZombieProcesses(): Promise<string[]> {
  const killed: string[] = [];
  const targetRegex = /^(ffmpeg|ffprobe|unzip|wget|curl|yt-dlp)$/i;

  try {
    const { stdout } = await execFileAsync("ps", ["-eo", "pid=,etimes=,comm="], {
      timeout: 4000,
    });

    const lines = stdout.split("\n");
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 3) continue;

      const pid = Number(parts[0]);
      const elapsedSec = Number(parts[1]);
      const comm = parts.slice(2).join(" ");

      if (
        Number.isInteger(pid) &&
        pid > 1 &&
        pid !== process.pid &&
        elapsedSec > 60 &&
        targetRegex.test(comm)
      ) {
        try {
          process.kill(pid, "SIGKILL");
          killed.push(`${comm} (PID: ${pid} | ${elapsedSec}s)`);
        } catch {}
      }
    }
  } catch {}

  return killed;
}

async function verifyDirectories() {
  let valid = 0;
  let repaired = 0;
  let missing = 0;

  await Promise.allSettled(
    CRITICAL_DIRS.map(async (dir) => {
      try {
        await access(dir.path);
        valid++;
      } catch {
        if (dir.autoRepair) {
          try {
            await mkdir(dir.path, { recursive: true });
            repaired++;
            return;
          } catch {}
        }
        missing++;
      }
    }),
  );

  return { valid, repaired, missing };
}

async function getDiskUsage(targetPath: string) {
  try {
    const stats = await statfs(targetPath);
    const total = stats.blocks * stats.bsize;
    const free = stats.bavail * stats.bsize;
    const used = Math.max(0, total - free);
    return { total, free, used };
  } catch {
    return null;
  }
}

export default {
  name: ["optimize", "clearram", "clean", "optimizervps"],
  category: "owner",
  description: t("cmd_optimiza_la_vps_purgando_cache_b5cc9ffa"),
  ownerOnly: true,

  async run(ctx: CommandContext) {
    const { reply, react, isOwner } = ctx;
    if (!isOwner) return;

    const startTime = performance.now();
    void react("⏳").catch(() => undefined);

    const memBefore = process.memoryUsage();
    const npmCacheTmp = join(os.homedir(), ".npm", "_cacache", "tmp");

    const [killedList, mainCacheStats, npmTmpStats, dirIntegrity, diskInfo] =
      await Promise.all([
        killZombieProcesses(),
        getDirectoryStats(CACHE_DIR, 15_000),
        getDirectoryStats(npmCacheTmp, 0),
        verifyDirectories(),
        getDiskUsage(process.cwd()),
      ]);

    let dbSynced = false;
    try {
      checkpointDb();
      dbSynced = true;
    } catch {}

    let gcTriggered = false;
    if (typeof (globalThis as any).gc === "function") {
      try {
        (globalThis as any).gc();
        gcTriggered = true;
      } catch {}
    }

    const eventLoopLag = await measureEventLoopLag();
    const memAfter = process.memoryUsage();
    const containerMem = getContainerMemory();

    const rssDiff = Math.max(0, memBefore.rss - memAfter.rss);
    const heapDiff = Math.max(0, memBefore.heapUsed - memAfter.heapUsed);
    const totalFreedRam = Math.max(rssDiff, heapDiff);

    const totalDeletedFiles = mainCacheStats.deletedCount + npmTmpStats.deletedCount;
    const totalFreedDisk = mainCacheStats.freedBytes + npmTmpStats.freedBytes;

    const activeHandles =
      typeof (process as any)._getActiveHandles === "function"
        ? (process as any)._getActiveHandles().length
        : 0;

    const cpuLoad = os.loadavg()[0].toFixed(2);
    const elapsedMs = (performance.now() - startTime).toFixed(0);

    const integrityStatus =
      dirIntegrity.missing > 0
        ? `⚠️ (${dirIntegrity.missing} faltantes)`
        : dirIntegrity.repaired > 0
          ? `🛠️ (${dirIntegrity.repaired} reparados)`
          : `✅ OK (${dirIntegrity.valid}/${CRITICAL_DIRS.length})`;

    const diskLine = diskInfo
      ? `${formatBytes(diskInfo.free)} libres de ${formatBytes(diskInfo.total)}`
      : "No disponible";

    const containerRamPercent =
      containerMem.total > 0
        ? ((containerMem.used / containerMem.total) * 100).toFixed(1)
        : "0.0";

    const processReport =
      killedList.length > 0
        ? `┃ > ${killedList.length} proceso(s) aniquilado(s):\n` +
          killedList.map((p) => `┃   - ${p}\n`).join("")
        : "┃ > No se detectaron subprocesos colgados.\n";

    const text =
      `╭〔 🚀 ${fytBold(t("cmd_aura_reed_optimizer_b0ff54e4"))} 〕⬣\n` +
      `┃ 🧠 ${fytBold(t("cmd_memoria_ram_1bb3f287"))}\n` +
      `┃ > Motor V8: ${gcTriggered ? "GC Forzado" : "Automático"}\n` +
      `┃ > RAM Bot (RSS): ${formatBytes(memBefore.rss)} ➔ ${formatBytes(memAfter.rss)}\n` +
      `┃ > Heap V8: ${formatBytes(memBefore.heapUsed)} ➔ ${formatBytes(memAfter.heapUsed)}\n` +
      `┃ > Memoria Liberada: ${formatBytes(totalFreedRam)}\n` +
      `┃ > Uso Contenedor: ${formatBytes(containerMem.used)} (${containerRamPercent}%)\n` +
      `┃\n` +
      `┃ 🧹 ${fytBold(t("cmd_limpieza_de_cache_706d3b46"))}\n` +
      `┃ > Archivos purgados: ${totalDeletedFiles} (${formatBytes(totalFreedDisk)})\n` +
      `┃ > En uso / protegidos: ${mainCacheStats.retainedCount}\n` +
      `┃ > Disco VPS: ${diskLine}\n` +
      `┃\n` +
      `┃ 🛡️ ${fytBold("INTEGRIDAD Y RENDIMIENTO")}\n` +
      `┃ > Directorios: ${integrityStatus}\n` +
      `┃ > Base de Datos (WAL): ${dbSynced ? "Sincronizada" : "Sin cambios"}\n` +
      `┃ > Latencia Event Loop: ${eventLoopLag.toFixed(2)} ms\n` +
      `┃ > Carga CPU (1m): ${cpuLoad} | Handles: ${activeHandles}\n` +
      `┃ > Tiempo de optimización: ${elapsedMs} ms\n` +
      `┃\n` +
      `┃ 💀 ${fytBold(t("cmd_control_de_procesos_a88a5e2f"))}\n` +
      `${processReport}` +
      `╰━━〔 ⚡ ${fytBold(t("cmd_system_active_e403484a"))} 〕━━⬣`;

    await reply(text).catch(() => undefined);
    void react("✅").catch(() => undefined);
  },
};
