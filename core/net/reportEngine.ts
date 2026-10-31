import { isRateLimit, jitter, Pacer, Semaphore, sleep, withRetry } from "./antiban.ts";

export type ReportType = "spam" | "abuse" | "illegal" | "adult" | "false_positive" | "other";

const VALID_TYPES: readonly ReportType[] = [
  "spam", "abuse", "illegal", "adult", "false_positive", "other",
];

export function parseType(raw?: string): ReportType {
  const t = (raw ?? "spam").toLowerCase() as ReportType;
  return VALID_TYPES.includes(t) ? t : "spam";
}

/** Envía el IQ de reporte. Formato real de WhatsApp Web, con fallback. */
async function sendReport(sock: any, jid: string, type: ReportType): Promise<void> {
  try {
    await sock.query({
      tag: "iq",
      attrs: { to: "@s.whatsapp.net", type: "set", xmlns: "disallowed" },
      content: [
        {
          tag: "report",
          attrs: { jid },
          content: [{ tag: "type", attrs: {}, content: Buffer.from(type) }],
        },
      ],
    });
  } catch (err) {
    if (isRateLimit(err)) throw err; // no dupliques tráfico si ya estamos limitados
    await sock.query({
      tag: "iq",
      attrs: { to: "@s.whatsapp.net", type: "set", xmlns: "disallowed" },
      content: [{ tag: "report", attrs: { jid, type } }],
    });
  }
}

export interface Plan {
  jid: string;
  type: ReportType;
  cycles: number;
  keepBlocked: boolean;
}

export interface Stats {
  bots: number;
  cyclesOk: number;
  cyclesFail: number;
  reports: number;
  rateLimited: number;
  skipped: number;
  aborted: boolean;
}

export interface RunOpts {
  sockets: any[];
  plan: Plan;
  concurrency: number;
  minGap: number;
  abortAfterRateLimits?: number;
  onBotDone?: (index: number, ok: boolean) => void;
}

export async function runReportPlan(opts: RunOpts): Promise<Stats> {
  const { plan } = opts;
  const stats: Stats = {
    bots: opts.sockets.length,
    cyclesOk: 0,
    cyclesFail: 0,
    reports: 0,
    rateLimited: 0,
    skipped: 0,
    aborted: false,
  };

  const sem = new Semaphore(Math.max(1, opts.concurrency));
  const pacer = new Pacer(Math.max(400, opts.minGap));
  const abortLimit = opts.abortAfterRateLimits ?? 12;
  const alive = () => !stats.aborted;

  await Promise.allSettled(
    opts.sockets.map((sock, index) =>
      sem.run(async () => {
        // Arranque escalonado: evita que todos abran sesión en el mismo segundo.
        await sleep(jitter(200, 1400));

        if (sock?.ws?.isOpen === false) {
          stats.skipped++;
          opts.onBotDone?.(index, false);
          return;
        }

        let botOk = false;
        try {
          for (let cycle = 1; cycle <= plan.cycles; cycle++) {
            if (!alive()) break;

            await pacer.wait();
            await sock.sendPresenceUpdate?.("available").catch(() => {});

            // 1) Bloquear primero: el reporte se pondera con el bloqueo activo.
            await pacer.wait();
            await withRetry(() => sock.updateBlockStatus(plan.jid, "block"), {
              attempts: 3,
              onRetry: () => {
                stats.rateLimited++;
                pacer.bump(10_000);
              },
            });

            // 2) Reportar mientras el bloqueo está vigente.
            await pacer.wait();
            await withRetry(() => sendReport(sock, plan.jid, plan.type), {
              attempts: 3,
              onRetry: () => {
                stats.rateLimited++;
                pacer.bump(15_000);
              },
            });

            stats.reports++;
            stats.cyclesOk++;
            botOk = true;

            // 3) Desbloquear solo si se pidió, y solo en el último ciclo.
            if (!plan.keepBlocked && cycle === plan.cycles) {
              await pacer.wait();
              await sock.updateBlockStatus(plan.jid, "unblock").catch(() => {});
            }

            if (cycle < plan.cycles) await sleep(jitter(2500, 6500));
          }
        } catch (err) {
          stats.cyclesFail++;
          if (isRateLimit(err)) {
            stats.rateLimited++;
            pacer.bump(20_000);
          }
          console.error(`[reportEngine] socket #${index} falló:`, err);
        } finally {
          opts.onBotDone?.(index, botOk);
        }

        if (stats.rateLimited >= abortLimit) stats.aborted = true;
      }),
    ),
  );

  return stats;
}