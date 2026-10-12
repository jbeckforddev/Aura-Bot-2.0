import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { lookup } from "node:dns/promises";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

process.env.NODE_ENV = "test";
process.env.DOWNLOAD_CACHE_DIR = await mkdtemp(path.join(tmpdir(), "aura-download-cache-"));
process.env.DOWNLOAD_ALLOW_LOCALHOST = "true";
process.env.DOWNLOAD_CONCURRENCY = "2";

const {
  downloadToCache,
  getDownloadQueueStatus,
  requestHead,
  requestJson,
  requestText,
} = await import("../core/downloadUtils.ts");

let server: ReturnType<typeof createServer> | null = null;
let baseUrl = "";
let serverRequests = 0;

async function startServer() {
  serverRequests = 0;
  const handlers = new Map<string, (req: IncomingMessage, res: ServerResponse) => void>();
  server = createServer((req, res) => {
    const url = new URL(req.url || "/", "http://127.0.0.1");
    const handler = handlers.get(url.pathname);
    if (!handler) {
      res.statusCode = 404;
      res.end("not found");
      return;
    }
    serverRequests += 1;
    handler(req, res);
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const address = server.address();
  assert.ok(address && typeof address === "object" && "port" in address);
  baseUrl = `http://127.0.0.1:${address.port}`;
  return handlers;
}

beforeEach(async () => {
  const cacheDir = process.env.DOWNLOAD_CACHE_DIR || "";
  await rm(cacheDir, { recursive: true, force: true });
  await mkdir(cacheDir, { recursive: true });
  process.env.NODE_ENV = "test";
  process.env.DOWNLOAD_ALLOW_LOCALHOST = "true";
});

afterEach(async () => {
  if (server) {
    await new Promise<void>((resolve, reject) => {
      server?.close((error) => (error ? reject(error) : resolve()));
    });
    server = null;
  }
  await rm(process.env.DOWNLOAD_CACHE_DIR || "", { recursive: true, force: true });
  process.env.DOWNLOAD_ALLOW_LOCALHOST = "true";
});

describe("downloadUtils", () => {
  it("descarga un archivo pequeño en disco y devuelve la ruta", async () => {
    const handlers = await startServer();
    handlers.set("/small", (_req, res) => {
      res.statusCode = 200;
      res.setHeader("content-type", "text/plain");
      res.end("hello world");
    });

    const filePath = await downloadToCache(`${baseUrl}/small`, 15000);
    const content = await readFile(filePath, "utf8");

    assert.equal(content, "hello world");
    assert.ok(filePath.includes(".bin") || filePath.includes("download-"));
    assert.ok((await stat(filePath)).size > 0);
  });

  it("rechaza errores HTTP y elimina el archivo parcial", async () => {
    const handlers = await startServer();
    handlers.set("/error", (_req, res) => {
      res.statusCode = 500;
      res.end("boom");
    });

    await assert.rejects(
      () => downloadToCache(`${baseUrl}/error`, 15000),
      /HTTP 500|Descarga HTTP|HTTP/,
    );

    const cacheEntries = await readdir(process.env.DOWNLOAD_CACHE_DIR || "");
    const stillPartial = cacheEntries.filter(
      (entry) => entry.includes(".part") || entry.includes("download-"),
    );
    assert.equal(stillPartial.length, 0);
  });

  it("reutiliza un archivo ya descargado en caché", async () => {
    const handlers = await startServer();
    handlers.set("/cached", (_req, res) => {
      res.statusCode = 200;
      res.end("cached body");
    });

    const firstPath = await downloadToCache(`${baseUrl}/cached`, 15000);
    const secondPath = await downloadToCache(`${baseUrl}/cached`, 15000);

    assert.equal(secondPath, firstPath);
    const content = await readFile(secondPath, "utf8");
    assert.equal(content, "cached body");
  });

  it("deduplica dos descargas simultáneas con la misma URL", async () => {
    const handlers = await startServer();
    handlers.set("/same", async (_req, res) => {
      await delay(200);
      res.statusCode = 200;
      res.end("same content");
    });

    const [first, second] = await Promise.all([
      downloadToCache(`${baseUrl}/same`, 30000),
      downloadToCache(`${baseUrl}/same`, 30000),
    ]);

    assert.equal(serverRequests, 1);
    assert.equal(first, second);
  });

  it("no comparte el archivo cuando cambian encabezados relevantes", async () => {
    const handlers = await startServer();
    handlers.set("/header", (req, res) => {
      res.statusCode = 200;
      res.end(req.headers.accept === "application/octet-stream" ? "stream-a" : "stream-b");
    });

    const fileA = await downloadToCache(`${baseUrl}/header`, 15000, { Accept: "application/octet-stream" });
    const fileB = await downloadToCache(`${baseUrl}/header`, 15000, { Accept: "application/json" });

    assert.notEqual(fileA, fileB);
    assert.equal(await readFile(fileA, "utf8"), "stream-a");
    assert.equal(await readFile(fileB, "utf8"), "stream-b");
  });

  it("bloquea localhost y direcciones internas antes de descargar", async () => {
    process.env.DOWNLOAD_ALLOW_LOCALHOST = "false";
    await assert.rejects(
      () => downloadToCache("http://localhost:65535/test.bin", 5000),
      (error) => {
        const message = error instanceof Error ? error.message : String(error);
        return /no permitida|no permitido|localhost|local|privada|privado|direcci[oó]n/i.test(message);
      },
    );
    process.env.DOWNLOAD_ALLOW_LOCALHOST = "true";
  });

  it("no permite el override de localhost fuera del entorno test", async () => {
    process.env.NODE_ENV = "production";
    process.env.DOWNLOAD_ALLOW_LOCALHOST = "true";

    await assert.rejects(
      () => downloadToCache("http://127.0.0.1:65535/test.bin", 5000),
      /privada|reservada|local|permitido/i,
    );

    process.env.NODE_ENV = "test";
  });

  it("bloquea IPv4 mapeado en IPv6 y otras direcciones reservadas", async () => {
    process.env.DOWNLOAD_ALLOW_LOCALHOST = "false";

    await assert.rejects(
      () => downloadToCache("http://[::ffff:127.0.0.1]/test.bin", 5000),
      (error) => {
        const msg = error instanceof Error ? error.message : String(error);
        return /ipv4|localhost|loopback|reservada|privada|bloqueada|no permitida|no permitido/i.test(msg);
      },
    );

    await assert.rejects(
      () => downloadToCache("http://[::ffff:10.0.0.1]/test.bin", 5000),
      (error) => {
        const msg = error instanceof Error ? error.message : String(error);
        return /ipv4|localhost|loopback|reservada|privada|bloqueada|no permitida|no permitido/i.test(msg);
      },
    );
    await assert.rejects(
      () => downloadToCache("http://[0:0:0:0:0:ffff:7f00:1]/test.bin", 5000),
      /privada|reservada|local|permitido/i,
    );

    for (const blockedUrl of [
      "http://0.1.2.3/test.bin",
      "http://[fd00::1]/test.bin",
      "http://[fe80::1]/test.bin",
      "http://[64:ff9b::a00:1]/test.bin",
      "http://[ff02::1]/test.bin",
      "http://[2002:a00:1::1]/test.bin",
      "http://[3fff::1]/test.bin",
    ]) {
      await assert.rejects(() => downloadToCache(blockedUrl, 5000));
    }

    process.env.DOWNLOAD_ALLOW_LOCALHOST = "true";
  });

  it("conserva caché y temporales porque no hay leases de consumidor", async () => {
    const cacheDir = process.env.DOWNLOAD_CACHE_DIR || "";
    const staleFile = path.join(cacheDir, "download-stale.bin");
    const oldPart = path.join(cacheDir, ".download-orphan.part");
    await writeFile(staleFile, "cached output");
    await writeFile(oldPart, "partial output");
    const oldModified = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await utimes(staleFile, oldModified, oldModified);
    await utimes(oldPart, oldModified, oldModified);

    const handlers = await startServer();
    handlers.set("/fresh", (_req, res) => {
      res.statusCode = 200;
      res.end("fresh payload");
    });

    const result = await downloadToCache(`${baseUrl}/fresh`, 15000);
    assert.ok(result.includes("download-"));

    const entries = await readdir(cacheDir);
    assert.ok(entries.includes("download-stale.bin"));
    assert.ok(entries.includes(".download-orphan.part"));
  });

  it("fija la conexión a una dirección devuelta por la resolución validada", async () => {
    const handlers = await startServer();
    let peerAddress = "";
    handlers.set("/peer", (req, res) => {
      peerAddress = req.socket.remoteAddress || "";
      res.end(peerAddress);
    });

    const resolved = await lookup("localhost", { all: true, verbatim: false });
    const responsePeer = await requestText(
      `http://localhost:${new URL(baseUrl).port}/peer`,
      5000,
    );
    const normalizedPeer = responsePeer.startsWith("::ffff:")
      ? responsePeer.slice(7)
      : responsePeer;

    assert.equal(responsePeer, peerAddress);
    assert.ok(resolved.some((entry) => entry.address === normalizedPeer));
  });

  it("realiza HEAD con destino validado y conserva sus metadatos", async () => {
    const handlers = await startServer();
    handlers.set("/head", (req, res) => {
      assert.equal(req.method, "HEAD");
      res.setHeader("content-length", "123");
      res.setHeader("content-type", "application/pdf");
      res.setHeader("content-disposition", 'attachment; filename="report.pdf"');
      res.end();
    });

    const response = await requestHead(`${baseUrl}/head`, 5000);
    assert.equal(response.statusCode, 200);
    assert.equal(response.headers["content-length"], "123");
    assert.equal(response.headers["content-type"], "application/pdf");
    assert.equal(
      response.headers["content-disposition"],
      'attachment; filename="report.pdf"',
    );
  });

  it("valida redirects de requestJson/requestText y elimina headers al cambiar origen", async () => {
    const handlers = await startServer();
    const port = new URL(baseUrl).port;
    let redirectedHeaders: IncomingMessage["headers"] | undefined;
    handlers.set("/redirect-json", (_req, res) => {
      res.statusCode = 302;
      res.setHeader("location", `http://localhost:${port}/json-target`);
      res.end();
    });
    handlers.set("/json-target", (req, res) => {
      redirectedHeaders = req.headers;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true }));
    });
    handlers.set("/redirect-text", (_req, res) => {
      res.statusCode = 302;
      res.setHeader("location", `http://localhost:${port}/text-target`);
      res.end();
    });
    handlers.set("/text-target", (req, res) => {
      redirectedHeaders = req.headers;
      res.end("redirected text");
    });
    let privateTargetRequests = 0;
    handlers.set("/redirect-private", (_req, res) => {
      process.env.NODE_ENV = "production";
      res.statusCode = 302;
      res.setHeader("location", `http://127.0.0.1:${port}/private-target`);
      res.end();
    });
    handlers.set("/private-target", (_req, res) => {
      privateTargetRequests += 1;
      res.end("must not connect");
    });

    assert.deepEqual(
      await requestJson(`${baseUrl}/redirect-json`, 5000, {
        Authorization: "Bearer secret",
        Cookie: "session=secret",
        "X-Api-Key": "secret",
      }),
      { ok: true },
    );
    assert.equal(redirectedHeaders?.authorization, undefined);
    assert.equal(redirectedHeaders?.cookie, undefined);
    assert.equal(redirectedHeaders?.["x-api-key"], undefined);

    assert.equal(
      await requestText(`${baseUrl}/redirect-text`, 5000, {
        "X-Private-Token": "secret",
      }),
      "redirected text",
    );
    assert.equal(redirectedHeaders?.["x-private-token"], undefined);

    process.env.NODE_ENV = "test";
    await assert.rejects(
      () => requestText(`${baseUrl}/redirect-private`, 5000),
      /privada|reservada|local|permitido/i,
    );
    process.env.NODE_ENV = "test";
    assert.equal(privateTargetRequests, 0);
  });

  it("la cancelación de un consumidor no aborta la descarga deduplicada de otro", async () => {
    const handlers = await startServer();
    let notifyRequestStarted = () => {};
    const requestStarted = new Promise<void>((resolve) => {
      notifyRequestStarted = resolve;
    });
    handlers.set("/shared-slow", async (_req, res) => {
      notifyRequestStarted();
      await delay(150);
      res.end("shared result");
    });

    const controller = new AbortController();
    const first = downloadToCache(
      `${baseUrl}/shared-slow`,
      5000,
      {},
      Number.POSITIVE_INFINITY,
      controller.signal,
    );
    const second = downloadToCache(`${baseUrl}/shared-slow`, 5000);
    await requestStarted;
    controller.abort();

    await assert.rejects(first, /cancel|abort/i);
    const filePath = await second;
    assert.equal(await readFile(filePath, "utf8"), "shared result");
    assert.equal(serverRequests, 1);
  });

  it("rechaza timeout y cancelación con errores explícitos", async () => {
    process.env.DOWNLOAD_ALLOW_LOCALHOST = "true";
    const handlers = await startServer();
    handlers.set("/slow", async (_req, res) => {
      await delay(5000);
      res.statusCode = 200;
      res.end("slow");
    });

    await assert.rejects(
      () => downloadToCache(`${baseUrl}/slow`, 200),
      /timeout|Abort|aborted|tiempo/i,
    );

    const controller = new AbortController();
    const abortPromise = downloadToCache(`${baseUrl}/slow`, 5000, {}, Number.POSITIVE_INFINITY, controller.signal);
    controller.abort();

    await assert.rejects(
      abortPromise,
      /aborted|Abort|cancel/i,
    );
  });

  it("respeta la cola de concurrencia global y entrega el estado", async () => {
    const status = getDownloadQueueStatus();
    assert.equal(status.maxConcurrent, 2);
    assert.ok(status.active >= 0);
    assert.ok(status.waiting >= 0);
  });
});
