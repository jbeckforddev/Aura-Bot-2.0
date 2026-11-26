import { displayBanner, logInfo } from "./core/logger.ts";
import { execFile } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import v8 from "node:v8";
import vm from "node:vm";
import "./config.ts";

import { connectMainBot } from "./connection/MainBotManager.ts";
import { startSavedSubBots } from "./connection/subbotManager.ts";
import {
  startPremiumExpiryMonitor,
  startSavedPremBots,
} from "./connection/premBotManager.ts";
import { loadPlugins, watchPlugins } from "./core/cmdLoader.ts";
import * as AuraDB from "./database/AuraDB.ts";
import { flushPendingContacts } from "./handler.ts";

const execFileAsync = promisify(execFile);

process.setMaxListeners(0);

if (typeof (globalThis as any).gc !== "function") {
  try {
    v8.setFlagsFromString("--expose_gc");
    (globalThis as any).gc = vm.runInNewContext("gc");
  } catch {}
}

const TMP_DIR = path.resolve("./cache");
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
process.env.TMPDIR = TMP_DIR;
process.env.TEMP = TMP_DIR;
process.env.TMP = TMP_DIR;
process.env.GLOBAL_CUSTOM_TMP = TMP_DIR;

export interface HardwareProfile {
  cpuThreads: number;
  totalRamGb: number;
  cuda: boolean;
  h264Nvenc: boolean;
  hevcNvenc: boolean;
  maxGpuJobs: number;
  maxCpuJobs: number;
  runWithGpuSlot: <T>(task: () => Promise<T>) => Promise<T>;
  runWithCpuSlot: <T>(task: () => Promise<T>) => Promise<T>;
}

function createSemaphore(limit: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  const cap = Math.max(1, limit);

  return async function runWithSlot<T>(task: () => Promise<T>): Promise<T> {
    if (active >= cap) {
      await new Promise<void>((resolve) => queue.push(resolve));
    }
    active++;
    try {
      return await task();
    } finally {
      active--;
      const next = queue.shift();
      if (next) next();
    }
  };
}

async function probeHardware(): Promise<HardwareProfile> {
  const cpuThreads =
    typeof os.availableParallelism === "function"
      ? os.availableParallelism()
      : os.cpus().length || 4;
  const totalRamGb = Math.max(1, Math.round(os.totalmem() / 1024 ** 3));

  let cuda = false;
  let h264Nvenc = false;
  let hevcNvenc = false;

  const [hwRes, encRes] = await Promise.allSettled([
    execFileAsync("ffmpeg", ["-hide_banner", "-hwaccels"], {
      timeout: 4000,
      windowsHide: true,
    }),
    execFileAsync("ffmpeg", ["-hide_banner", "-encoders"], {
      timeout: 4000,
      windowsHide: true,
    }),
  ]);

  if (hwRes.status === "fulfilled") {
    cuda = /\bcuda\b/i.test(hwRes.value.stdout);
  }
  if (encRes.status === "fulfilled") {
    const out = encRes.value.stdout;
    h264Nvenc = /\bh264_nvenc\b/i.test(out);
    hevcNvenc = /\bhevc_nvenc\b/i.test(out);
  }

  const maxGpuJobs = cuda || h264Nvenc ? 3 : 0;
  const maxCpuJobs = Math.max(2, cpuThreads - 2);

  const profile: HardwareProfile = {
    cpuThreads,
    totalRamGb,
    cuda,
    h264Nvenc,
    hevcNvenc,
    maxGpuJobs,
    maxCpuJobs,
    runWithGpuSlot: createSemaphore(maxGpuJobs || 1),
    runWithCpuSlot: createSemaphore(maxCpuJobs),
  };

  (globalThis as any).__AURA_HW__ = profile;
  process.env.AURA_CPU_THREADS = String(cpuThreads);
  process.env.AURA_RAM_GB = String(totalRamGb);
  process.env.AURA_HW_CUDA = cuda ? "1" : "0";
  process.env.AURA_HW_NVENC = h264Nvenc ? "1" : "0";
  process.env.AURA_HW_HEVC_NVENC = hevcNvenc ? "1" : "0";
  process.env.AURA_MAX_GPU_JOBS = String(maxGpuJobs);
  process.env.AURA_MAX_CPU_JOBS = String(maxCpuJobs);

  return profile;
}

const GC_HEAP_THRESHOLD_BYTES = Math.min(
  6 * 1024 * 1024 * 1024,
  Math.max(2 * 1024 * 1024 * 1024, Math.floor(os.totalmem() * 0.2)),
);

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
  if (
    typeof (globalThis as any).gc === "function" &&
    process.memoryUsage().heapUsed >= GC_HEAP_THRESHOLD_BYTES
  ) {
    try {
      (globalThis as any).gc();
    } catch {}
  }
}

const maintenanceInterval = setInterval(runMemoryMaintenance, 5 * 60 * 1000);
maintenanceInterval.unref?.();

let isShuttingDown = false;
let hasFlushedOnExit = false;

function flushStateOnce() {
  if (hasFlushedOnExit) return;
  hasFlushedOnExit = true;
  try {
    flushPendingContacts();
  } catch {}
  try {
    AuraDB.checkpointDb();
  } catch {}
}

function handleShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  clearInterval(maintenanceInterval);
  logInfo(`Señal ${signal} recibida. Guardando base de datos...`, "alert");
  flushStateOnce();
  process.exit(0);
}

process.on("SIGINT", () => handleShutdown("SIGINT"));
process.on("SIGTERM", () => handleShutdown("SIGTERM"));
process.on("exit", flushStateOnce);

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
  const [, hw] = await Promise.all([
    displayBanner(),
    probeHardware(),
    (async () => {
      await cleanCache(0);
      try {
        (AuraDB as Record<string, unknown> & { warmLanguageCaches?: () => void }).warmLanguageCaches?.();
      } catch {}
      await loadPlugins();
    })(),
  ]);

  const gpuTag =
    hw.cuda || hw.h264Nvenc
      ? `RTX GPU ACTIVA (CUDA:${hw.cuda ? "ON" : "OFF"} NVENC:${hw.h264Nvenc ? "H264" : "OFF"}${hw.hevcNvenc ? "/HEVC" : ""} | Slots:${hw.maxGpuJobs})`
      : "Solo CPU (FFmpeg sin CUDA/NVENC)";

  logInfo(
    `Hardware listo: ${hw.cpuThreads} hilos | ${hw.totalRamGb}GB RAM | ${gpuTag}`,
    "info",
  );
  logInfo("Inicializando bot principal...");
  watchPlugins();

  const instanceRole = (process.env.INSTANCE_ROLE || "").trim().toLowerCase();
  const shouldStartMainBot = instanceRole !== "sub" && instanceRole !== "subs";
  const shouldStartSubBots = process.env.DISABLE_SUBBOTS !== "true";

  if (shouldStartSubBots) {
    startPremiumExpiryMonitor();
    void Promise.all([startSavedSubBots(), startSavedPremBots()])
      .then(() => {
        runMemoryMaintenance();
      })
      .catch((error) => {
        logInfo(`Error al iniciar subbots guardados: ${String(error)}`, "error");
      });
  } else {
    logInfo(`Subbots desactivados para esta instancia (INSTANCE_ROLE=${instanceRole || "main"}).`, "info");
  }

  if (shouldStartMainBot) {
    logInfo("Conectando a WhatsApp...");
    await connectMainBot("main");
  } else {
    logInfo(`Instancia configurada exclusivamente para subbots (INSTANCE_ROLE=${instanceRole}).`, "info");
  }
}

void mainBot();
