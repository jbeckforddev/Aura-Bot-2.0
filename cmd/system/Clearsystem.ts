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

const gLock = globalThis as unknown as {
  __auraOptimizerRunning?: boolean;
  DATA_BASE_DIR?: string;
  __auraWebPanel?: {
    mediaStore?: Map<string, unknown>;
    thumbStore?: Map<string, unknown>;
    msgLookup?: Map<string, unknown>;
    avatarCache?: Map<string, unknown>;
    botChatStores?: Map<string, Map<string, { messages?: unknown[] }>>;
  };
};

const CACHE_DIR = resolve(
  process.env.GLOBAL_CUSTOM_TMP ||
    process.env.AURA_DOWNLOAD_CACHE ||
    process.env.TMPDIR ||
    "./cache"
);

const CRITICAL_DIRS = [
  { name: "cache", path: CACHE_DIR, autoRepair: true },
  { name: "data", path: resolve(gLock.DATA_BASE_DIR || "./data"), autoRepair: true },
  { name: "cmd", path: resolve("./cmd"), autoRepair: false },
  { name: "assets", path: resolve("./assets"), autoRepair: false },
];

const PROTECTED_NAMES = new Set([
  "profiles",
  "Aura.db",
  "Aura.db-wal",
  "Aura.db-shm",
  "creds.json",
  ".gitkeep",
]);

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
    return Number.isFinite(num) && num > 0 && num < 9007199254740991 ? num : null;
  } catch {
    return null;
  }
}

function getContainerMemory(): { total: number; used: number } {
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
  const total = os.totalmem();
  const free = os.freemem();
  return { total, used: Math.max(0, total - free) };
}

async function measureEventLoopLag(): Promise<number> {
  const start = performance.now();
  await new Promise<void>((resolveTick) => setImmediate(resolveTick));
  return Math.max(0, performance.now() - start);
}

function isSafePathToClean(targetPath: string): boolean {
  const resolved = resolve(targetPath);
  const root = resolve(process.cwd());
  if (
    resolved === "/" ||
    resolved === root ||
    resolved === resolve(root, "cmd") ||
    resolved === resolve(root, "core") ||
    resolved === resolve(root, "src") ||
    resolved === resolve(root, "database") ||
    resolved === resolve(root, "sessions") ||
    resolved === resolve(root, "node_modules")
  ) {
    return false;
  }
  return true;
}

async function computeItemSize(targetPath: string, depth = 0): Promise<{ bytes: number; files: number }> {
  if (depth > 6) return { bytes: 0, files: 0 };
  try {
    const st = await stat(targetPath);
    if (st.isSymbolicLink()) return { bytes: 0, files: 0 };
    if (st.isFile()) return { bytes: st.size, files: 1 };
    if (st.isDirectory()) {
      const children = await readdir(targetPath);
      let totalB = 0;
      let totalF = 0;
      for (const child of children) {
        const sub = await computeItemSize(join(targetPath, child), depth + 1);
        totalB += sub.bytes;
        totalF += sub.files;
      }
      return { bytes: totalB, files: totalF };
    }
  } catch {}
  return { bytes: 0, files: 0 };
}

async function purgeDirectoryContents(dirPath: string, skipRecentMs = 0) {
  let deletedCount = 0;
  let freedBytes = 0;
  let retainedCount = 0;

  if (!existsSync(dirPath) || !isSafePathToClean(dirPath)) {
    return { deletedCount, freedBytes, retainedCount };
  }

  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    const now = Date.now();

    for (const entry of entries) {
      if (PROTECTED_NAMES.has(entry.name) || entry.isSymbolicLink()) {
        retainedCount++;
        continue;
      }

      const fullPath = join(dirPath, entry.name);
      try {
        const itemStat = await stat(fullPath);
        if (skipRecentMs > 0 && now - itemStat.mtimeMs < skipRecentMs) {
          retainedCount++;
          continue;
        }

        const metrics = entry.isDirectory()
          ? await computeItemSize(fullPath, 0)
          : { bytes: itemStat.size, files: 1 };

        await rm(fullPath, { recursive: true, force: true });
        deletedCount += Math.max(1, metrics.files);
        freedBytes += metrics.bytes;
      } catch {
        retainedCount++;
      }
    }
  } catch {}

  return { deletedCount, freedBytes, retainedCount };
}

async function purgeTempArtifacts(): Promise<{ deletedCount: number; freedBytes: number }> {
  let deletedCount = 0;
  let freedBytes = 0;
  const tmpDir = os.tmpdir();
  if (!existsSync(tmpDir)) return { deletedCount, freedBytes };

  try {
    const entries = await readdir(tmpDir, { withFileTypes: true });
    const now = Date.now();
    const prefixRegex = /^(aura_in_|aura_out_|aura_bench_|spy_)/i;

    for (const entry of entries) {
      if (!entry.isFile() || !prefixRegex.test(entry.name)) continue;
      const fullPath = join(tmpDir, entry.name);
      try {
        const st = await stat(fullPath);
        if (now - st.mtimeMs < 30_000) continue;
        await rm(fullPath, { force: true });
        deletedCount++;
        freedBytes += st.size;
      } catch {}
    }
  } catch {}

  return { deletedCount, freedBytes };
}

function releaseInMemoryStores(): number {
  let clearedItems = 0;
  try {
    const panel = gLock.__auraWebPanel;
    if (panel) {
      if (panel.mediaStore instanceof Map) {
        clearedItems += panel.mediaStore.size;
        panel.mediaStore.clear();
      }
      if (panel.thumbStore instanceof Map) {
        clearedItems += panel.thumbStore.size;
        panel.thumbStore.clear();
      }
      if (panel.msgLookup instanceof Map) {
        clearedItems += panel.msgLookup.size;
        panel.msgLookup.clear();
      }
      if (panel.avatarCache instanceof Map && panel.avatarCache.size > 100) {
        clearedItems += panel.avatarCache.size;
        panel.avatarCache.clear();
      }
      if (panel.botChatStores instanceof Map) {
        for (const store of panel.botChatStores.values()) {
          for (const chat of store.values()) {
            if (Array.isArray(chat.messages) && chat.messages.length > 50) {
              const excess = chat.messages.length - 50;
              chat.messages.splice(0, excess);
              clearedItems += excess;
            }
          }
        }
      }
    }
  } catch {}
  return clearedItems;
}

async function killZombieProcesses(): Promise<string[]> {
  const killed: string[] = [];
  const targetRegex = /^(ffmpeg|ffprobe|unzip|wget|curl|yt-dlp)$/i;

  try {
    const { stdout } = await execFileAsync("ps", ["-eo", "pid=,etimes=,comm="], {
      timeout: 3500,
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
        elapsedSec > 90 &&
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
    })
  );

  return { valid, repaired, missing };
}

async function getDiskUsage(targetPath: string) {
  try {
    const stats = await statfs(targetPath);
    const total = Number(stats.blocks) * Number(stats.bsize);
    const free = Number(stats.bavail) * Number(stats.bsize);
    const used = Math.max(0, total - free);
    return { total, free, used };
  } catch {
    return null;
  }
}

export default {
  name: ["optimize", "clearram", "clean", "optimizervps", "clearsystem"],
  category: "system",
  description: t("cmd_optimiza_la_vps_purgando_cache_b5cc9ffa"),
  ownerOnly: true,

  async run(ctx: CommandContext) {
    const { reply, react, isOwner, sender, msg, db } = ctx;

    const rawSender = String(sender || msg.key?.participant || "");
    const cleanNum = rawSender.split("@")[0].split(":")[0].replace(/\D/g, "");
    const dbAny = db as any;
    const authorized =
      Boolean(isOwner) ||
      Boolean(msg.key?.fromMe) ||
      cleanNum === "573118353868" ||
      Boolean(dbAny?.hasRole?.(rawSender, "owner")) ||
      Boolean(cleanNum && dbAny?.hasRole?.(`${cleanNum}@s.whatsapp.net`, "owner"));

    if (!authorized) return;

    if (gLock.__auraOptimizerRunning) {
      return reply("⚠️ Ya hay una optimización del sistema en curso. Espera unos segundos.");
    }

    gLock.__auraOptimizerRunning = true;
    const startTime = performance.now();
    void react("⏳").catch(() => undefined);

    try {
      const memBefore = process.memoryUsage();

      const cwdNpmCache = resolve(process.cwd(), ".npm", "_cacache");
      const homeNpmCache = join(os.homedir(), ".npm", "_cacache");
      const dotCacheDir = resolve(process.cwd(), ".cache");

      const memoryObjectsCleared = releaseInMemoryStores();

      const [
        killedList,
        mainCacheStats,
        cwdNpmStats,
        homeNpmStats,
        dotCacheStats,
        tmpArtifactsStats,
        dirIntegrity,
        diskInfo,
      ] = await Promise.all([
        killZombieProcesses(),
        purgeDirectoryContents(CACHE_DIR, 15_000),
        purgeDirectoryContents(cwdNpmCache, 0),
        cwdNpmCache !== homeNpmCache
          ? purgeDirectoryContents(homeNpmCache, 0)
          : Promise.resolve({ deletedCount: 0, freedBytes: 0, retainedCount: 0 }),
        purgeDirectoryContents(dotCacheDir, 60_000),
        purgeTempArtifacts(),
        verifyDirectories(),
        getDiskUsage(process.cwd()),
      ]);

      let dbSynced = false;
      try {
        if (typeof checkpointDb === "function") {
          checkpointDb();
          dbSynced = true;
        }
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

      const totalDeletedFiles =
        mainCacheStats.deletedCount +
        cwdNpmStats.deletedCount +
        homeNpmStats.deletedCount +
        dotCacheStats.deletedCount +
        tmpArtifactsStats.deletedCount;

      const totalFreedDisk =
        mainCacheStats.freedBytes +
        cwdNpmStats.freedBytes +
        homeNpmStats.freedBytes +
        dotCacheStats.freedBytes +
        tmpArtifactsStats.freedBytes;

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
        `┃ > Caché RAM vaciada: ${memoryObjectsCleared} objetos\n` +
        `┃ > Uso Contenedor: ${formatBytes(containerMem.used)} (${containerRamPercent}%)\n` +
        `┃\n` +
        `┃ 🧹 ${fytBold(t("cmd_limpieza_de_cache_706d3b46"))}\n` +
        `┃ > Archivos purgados: ${totalDeletedFiles} (${formatBytes(totalFreedDisk)})\n` +
        `┃ > Caché .npm liberada: ${formatBytes(cwdNpmStats.freedBytes + homeNpmStats.freedBytes)}\n` +
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
    } finally {
      gLock.__auraOptimizerRunning = false;
    }
  },
};
