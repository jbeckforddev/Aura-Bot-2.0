/**
 * antiban.ts — ritmo global, concurrencia y reintentos.
 * TODO el tráfico de reporte pasa por aquí. Sin esto, los subbots comparten IP
 * y se pisan entre sí hasta que WhatsApp corta.
 */

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
export const jitter = (min: number, max: number) =>
  min + Math.floor(Math.random() * Math.max(1, max - min + 1));

const RATE_HINTS = [
  "rate-overlimit", "rate_overlimit", "429", "too many requests",
  "overlimit", "503", "connection closed", "stream errored", "timed out", "timeout",
];

export function isRateLimit(err: unknown): boolean {
  const raw =
    err instanceof Error ? `${err.message} ${err.stack ?? ""}` : JSON.stringify(err ?? "");
  const s = raw.toLowerCase();
  return RATE_HINTS.some((h) => s.includes(h));
}

/** Limita cuántas sesiones operan a la vez. */
export class Semaphore {
  private queue: (() => void)[] = [];
  private active = 0;
  constructor(private readonly max: number) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) await new Promise<void>((r) => this.queue.push(r));
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}

/**
 * Espaciador global. Garantiza un hueco mínimo entre operaciones de red de
 * CUALQUIER sesión, porque todas salen por la misma IP.
 */
export class Pacer {
  private next = 0;
  constructor(private readonly minGap: number) {}

  async wait(): Promise<void> {
    const now = Date.now();
    const target = Math.max(now, this.next);
    // El hueco real es minGap + hasta 40% de ruido: un patrón fijo es detectable.
    this.next = target + this.minGap + jitter(0, Math.floor(this.minGap * 0.4));
    const delta = target - now;
    if (delta > 0) await sleep(delta);
  }

  /** Empuja el reloj global hacia adelante tras un 429. */
  bump(extraMs: number): void {
    this.next = Math.max(this.next, Date.now() + extraMs);
  }
}

export interface RetryOpts {
  attempts?: number;
  base?: number;
  max?: number;
  onRetry?: (err: unknown, attempt: number) => void;
}

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOpts = {}): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const base = opts.base ?? 1200;
  const max = opts.max ?? 30_000;
  let lastErr: unknown;

  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRateLimit(err)) {
        if (i === attempts) break;
        await sleep(jitter(300, 900));
        continue;
      }
      if (i === attempts) break;
      const backoff = Math.min(max, base * 2 ** (i - 1)) + jitter(0, 700);
      opts.onRetry?.(err, i);
      await sleep(backoff);
    }
  }
  throw lastErr;
}