import ytdl from "@vreden/youtube_scraper";
import { parentPort, workerData } from "node:worker_threads";

const { url, kind, quality } = workerData;

function makeCloneable(value) {
  if (typeof value === "function" || typeof value === "symbol") return undefined;
  if (Array.isArray(value)) return value.map(makeCloneable);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => typeof item !== "function" && typeof item !== "symbol")
        .map(([key, item]) => [key, makeCloneable(item)]),
    );
  }
  return value;
}

try {
  const response = workerData.action === "metadata"
    ? await ytdl.metadata(url)
    : kind === "audio"
      ? await ytdl.ytmp3(url, quality)
      : await ytdl.ytmp4(url, quality);
  parentPort?.postMessage(makeCloneable(response));
} catch (error) {
  parentPort?.postMessage({
    workerError: error instanceof Error ? error.message : String(error),
  });
} finally {
  parentPort?.close();
}
