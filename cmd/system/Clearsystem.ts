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

function buildOptimizerRichPayload(data: {
  gcMode: string;
  rssBefore: string;
  rssAfter: string;
  heapBefore: string;
  heapAfter: string;
  freedRam: string;
  memObjects: number;
  containerUsed: string;
  containerTotal: string;
  containerPct: number;
  deletedFiles: number;
  freedDisk: string;
  npmFreed: string;
  retainedFiles: number;
  diskFree: string;
  diskTotal: string;
  diskPct: number;
  integrityStatus: string;
  dbStatus: string;
  loopLag: string;
  cpuLoad: string;
  handles: number;
  elapsedMs: string;
  killedList: string[];
  rawTextReport: string;
}) {
  const serialized = JSON.stringify(data);

  const html = `<style>
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent;user-select:none;-webkit-user-select:none}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#05020c;color:#f5f3ff;padding:10px}
.card{max-width:420px;margin:0 auto;background:linear-gradient(180deg,#130826 0%,#070312 100%);border:1.5px solid #3b1d6e;border-radius:20px;overflow:hidden;box-shadow:0 20px 55px rgba(0,0,0,.85),0 0 30px rgba(139,92,246,.2);position:relative}
.card::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#7c3aed,#ec4899,#00ffcc,#7c3aed);background-size:200% 100%;animation:flow 3s linear infinite;z-index:10}
@keyframes flow{0%{background-position:0% 0%}100%{background-position:200% 0%}}
.head{padding:14px 16px;background:radial-gradient(circle at 85% 15%,rgba(168,85,247,.28),transparent 60%);border-bottom:1px solid #261447;display:flex;justify-content:space-between;align-items:center}
.brand{display:flex;align-items:center;gap:10px}
.orb{width:36px;height:36px;border-radius:11px;background:linear-gradient(135deg,#9333ea,#db2777);display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 0 15px rgba(147,51,234,.5)}
.brand-txt h1{font-size:13.5px;font-weight:900;letter-spacing:.8px;color:#fff;text-transform:uppercase}
.brand-txt p{font-size:10.5px;color:#00ffcc;font-weight:800;font-family:'Courier New',monospace}
.pill{font-size:9.5px;font-weight:900;padding:4px 9px;border-radius:999px;background:rgba(139,92,246,.2);color:#e9d5ff;border:1px solid rgba(168,85,247,.45);font-family:'Courier New',monospace}
.body{padding:14px 16px}
.bars-wrap{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px}
.bar-card{background:#0d051c;border:1px solid #28154a;border-radius:12px;padding:9px 10px}
.bar-top{display:flex;justify-content:space-between;font-size:9.5px;font-weight:900;color:#c4b5fd;margin-bottom:5px;text-transform:uppercase}
.bar-track{height:6px;background:#190d30;border-radius:999px;overflow:hidden;border:1px solid #2e1854;margin-bottom:5px}
.bar-fill{height:100%;background:linear-gradient(90deg,#8b5cf6,#ec4899);border-radius:999px;width:0%;transition:width .5s ease}
.bar-fill.cyan{background:linear-gradient(90deg,#00ffcc,#38bdf8)}
.bar-sub{font-size:10px;color:#9378bc;font-family:'Courier New',monospace;font-weight:700}
.sec-lbl{font-size:9.5px;font-weight:900;text-transform:uppercase;letter-spacing:1.1px;color:#a78bfa;margin:10px 0 6px;display:flex;justify-content:space-between}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:7px}
.box{background:#0f061e;border:1px solid #251345;border-radius:11px;padding:8px 10px}
.box.wide{grid-column:span 2;display:flex;justify-content:space-between;align-items:center;background:linear-gradient(135deg,rgba(124,58,237,.16),rgba(0,255,204,.08));border-color:#5b21b6}
.k{font-size:9px;font-weight:800;color:#8b74b0;text-transform:uppercase;letter-spacing:.5px}
.v{font-size:11.5px;font-weight:900;color:#f3e8ff;margin-top:2px;font-family:'Courier New',monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.v.hl{color:#00ffcc;font-size:12.5px}
.proc-box{background:#090414;border:1px solid #28144a;border-left:3px solid #ec4899;border-radius:10px;padding:8px 10px;margin-top:6px;font-size:11px;color:#d8b4fe;font-family:'Courier New',monospace;line-height:1.4}
.actions{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:14px}
.btn{border:none;border-radius:11px;padding:10px;font-size:11.5px;font-weight:900;cursor:pointer;text-transform:uppercase;letter-spacing:.7px;transition:transform .1s}
.btn:active{transform:scale(0.96)}
.btn-primary{background:linear-gradient(135deg,#8b5cf6,#6d28d9);color:#fff;box-shadow:0 4px 15px rgba(139,92,246,.35)}
.btn-sec{background:#170d2b;border:1px solid #3b2166;color:#d8b4fe}
.toast{position:fixed;bottom:14px;left:50%;transform:translateX(-50%) translateY(20px);background:#8b5cf6;color:#fff;font-size:11.5px;font-weight:800;padding:7px 15px;border-radius:999px;opacity:0;pointer-events:none;transition:all .2s;z-index:99;box-shadow:0 6px 20px rgba(0,0,0,.6)}
.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}
</style>

<div class="card">
  <div class="head">
    <div class="brand">
      <div class="orb">🚀</div>
      <div class="brand-txt">
        <h1>Aura VPS Optimizer</h1>
        <p id="gcBadge"></p>
      </div>
    </div>
    <span class="pill" id="timePill"></span>
  </div>

  <div class="body">
    <div class="bars-wrap">
      <div class="bar-card">
        <div class="bar-top"><span>🧠 RAM VPS</span><span id="ramPctTxt"></span></div>
        <div class="bar-track"><div class="bar-fill" id="ramBar"></div></div>
        <div class="bar-sub" id="ramSubTxt"></div>
      </div>
      <div class="bar-card">
        <div class="bar-top"><span>💾 DISCO</span><span id="diskPctTxt"></span></div>
        <div class="bar-track"><div class="bar-fill cyan" id="diskBar"></div></div>
        <div class="bar-sub" id="diskSubTxt"></div>
      </div>
    </div>

    <div class="sec-lbl"><span>⚡ MEMORIA & MOTOR V8</span><span>RAM PURGE</span></div>
    <div class="grid">
      <div class="box">
        <div class="k">RAM Bot (RSS)</div>
        <div class="v" id="vRss"></div>
      </div>
      <div class="box">
        <div class="k">Heap V8</div>
        <div class="v" id="vHeap"></div>
      </div>
      <div class="box wide">
        <div>
          <div class="k">Memoria Liberada & Caché RAM</div>
          <div class="v hl" id="vFreedRam"></div>
        </div>
        <span class="pill" id="vObjCleared"></span>
      </div>
    </div>

    <div class="sec-lbl"><span>🧹 ALMACENAMIENTO & CACHÉ</span><span>DISK CLEAN</span></div>
    <div class="grid">
      <div class="box">
        <div class="k">Archivos Purgados</div>
        <div class="v hl" id="vFiles"></div>
      </div>
      <div class="box">
        <div class="k">Caché .npm</div>
        <div class="v" id="vNpm"></div>
      </div>
      <div class="box">
        <div class="k">Protegidos / Uso</div>
        <div class="v" id="vRetained"></div>
      </div>
      <div class="box">
        <div class="k">Directorios</div>
        <div class="v" id="vDirs"></div>
      </div>
    </div>

    <div class="sec-lbl"><span>🛡️ TELEMETRÍA & PROCESOS</span><span id="vWal"></span></div>
    <div class="grid">
      <div class="box">
        <div class="k">Event Loop Lag</div>
        <div class="v" id="vLag"></div>
      </div>
      <div class="box">
        <div class="k">CPU (1m) / Handles</div>
        <div class="v" id="vCpu"></div>
      </div>
    </div>
    <div class="proc-box" id="procBox"></div>

    <div class="actions">
      <button class="btn btn-primary" onclick="copyReport()">📋 Copiar Reporte</button>
      <button class="btn btn-sec" onclick="showAlertReport()">🔍 Ver Consola</button>
    </div>
  </div>
</div>

<div class="toast" id="toast"></div>

<script>
const D = ${serialized};
function $(id){ return document.getElementById(id); }

function init(){
  $("gcBadge").textContent = "V8: " + D.gcMode;
  $("timePill").textContent = "⏱️ " + D.elapsedMs + " ms";
  $("ramPctTxt").textContent = D.containerPct + "%";
  $("ramSubTxt").textContent = D.containerUsed + " / " + D.containerTotal;
  $("diskPctTxt").textContent = D.diskPct + "%";
  $("diskSubTxt").textContent = D.diskFree + " libres";

  setTimeout(function(){
    $("ramBar").style.width = Math.min(100, Math.max(4, D.containerPct)) + "%";
    $("diskBar").style.width = Math.min(100, Math.max(4, D.diskPct)) + "%";
  }, 80);

  $("vRss").textContent = D.rssBefore + " ➔ " + D.rssAfter;
  $("vHeap").textContent = D.heapBefore + " ➔ " + D.heapAfter;
  $("vFreedRam").textContent = D.freedRam + " liberados";
  $("vObjCleared").textContent = D.memObjects + " objs";
  $("vFiles").textContent = D.deletedFiles + " (" + D.freedDisk + ")";
  $("vNpm").textContent = D.npmFreed;
  $("vRetained").textContent = D.retainedFiles + " archivos";
  $("vDirs").textContent = D.integrityStatus;
  $("vWal").textContent = "WAL: " + D.dbStatus;
  $("vLag").textContent = D.loopLag + " ms";
  $("vCpu").textContent = D.cpuLoad + " | " + D.handles + "H";

  if (D.killedList && D.killedList.length > 0) {
    $("procBox").textContent = "💀 " + D.killedList.length + " aniquilado(s): " + D.killedList.join(", ");
  } else {
    $("procBox").textContent = "✅ Sin procesos zombi ni subprocesos colgados.";
  }
}

function copyReport(){
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(D.rawTextReport).catch(function(){});
  } else {
    const t = document.createElement("textarea");
    t.value = D.rawTextReport;
    document.body.appendChild(t);
    t.select();
    try { document.execCommand("copy"); } catch(e){}
    document.body.removeChild(t);
  }
  const el = $("toast");
  el.textContent = "Reporte copiado al portapapeles";
  el.classList.add("show");
  setTimeout(function(){ el.classList.remove("show"); }, 1600);
}

function showAlertReport(){
  alert(D.rawTextReport);
}

init();
</script>`;

  return {
    view_model: {
      __typename: "GenAISingleLayoutViewModel",
      primitive: {
        __typename: "FOAHtmlPrimitiveDemoDONOTUSE",
        trusted_sources: [],
        payload: html,
      },
    },
  };
}

export default {
  name: ["optimize", "clearram", "clean", "optimizervps", "clearsystem"],
  category: "system",
  description: t("cmd_optimiza_la_vps_purgando_cache_b5cc9ffa"),
  ownerOnly: true,

  async run(ctx: CommandContext) {
    const { reply, react, isOwner, sender, msg, db, sock, from } = ctx;

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
          ? Number(((containerMem.used / containerMem.total) * 100).toFixed(1))
          : 0;

      const diskUsedPercent =
        diskInfo && diskInfo.total > 0
          ? Number(((diskInfo.used / diskInfo.total) * 100).toFixed(1))
          : 0;

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

      try {
        const { AIRich } = await import("baileys/lib/Builders/ai-rich.js");
        const rich = new AIRich(sock)
          .setTitle("🚀 AURA VPS OPTIMIZER // SYSTEM")
          .setFooter(`Optimizado en ${elapsedMs} ms • ${formatBytes(totalFreedDisk)} liberados`);

        rich.addSection(
          buildOptimizerRichPayload({
            gcMode: gcTriggered ? "GC Forzado" : "Automático",
            rssBefore: formatBytes(memBefore.rss),
            rssAfter: formatBytes(memAfter.rss),
            heapBefore: formatBytes(memBefore.heapUsed),
            heapAfter: formatBytes(memAfter.heapUsed),
            freedRam: formatBytes(totalFreedRam),
            memObjects: memoryObjectsCleared,
            containerUsed: formatBytes(containerMem.used),
            containerTotal: formatBytes(containerMem.total),
            containerPct: containerRamPercent,
            deletedFiles: totalDeletedFiles,
            freedDisk: formatBytes(totalFreedDisk),
            npmFreed: formatBytes(cwdNpmStats.freedBytes + homeNpmStats.freedBytes),
            retainedFiles: mainCacheStats.retainedCount,
            diskFree: diskInfo ? formatBytes(diskInfo.free) : "N/A",
            diskTotal: diskInfo ? formatBytes(diskInfo.total) : "N/A",
            diskPct: diskUsedPercent,
            integrityStatus,
            dbStatus: dbSynced ? "OK" : "Sin cambios",
            loopLag: eventLoopLag.toFixed(2),
            cpuLoad,
            handles: activeHandles,
            elapsedMs,
            killedList,
            rawTextReport: text,
          })
        );

        await rich.send(from, { quoted: msg });
      } catch {
        await reply(text).catch(() => undefined);
      }

      void react("✅").catch(() => undefined);
    } finally {
      gLock.__auraOptimizerRunning = false;
    }
  },
};
