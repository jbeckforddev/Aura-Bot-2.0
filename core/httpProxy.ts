import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  Dispatcher,
  ProxyAgent,
  Socks5ProxyAgent,
  setGlobalDispatcher,
} from "undici";

type ProxyDispatcher = ProxyAgent | Socks5ProxyAgent;
const PROJECT_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

class RotatingProxyDispatcher extends Dispatcher {
  private nextProxyIndex = 0;

  constructor(private readonly proxies: ProxyDispatcher[]) {
    super();
  }

  get proxyCount(): number {
    return this.proxies.length;
  }

  override dispatch(
    options: Dispatcher.DispatchOptions,
    handler: Dispatcher.DispatchHandler,
  ): boolean {
    const proxy = this.proxies[this.nextProxyIndex];
    this.nextProxyIndex = (this.nextProxyIndex + 1) % this.proxies.length;
    return proxy!.dispatch(options, handler);
  }

  override close(callback: () => void): void;
  override close(): Promise<void>;
  override close(callback?: () => void): Promise<void> | void {
    const closing = Promise.all(this.proxies.map((proxy) => proxy.close())).then(
      () => undefined,
    );
    if (callback) {
      void closing.then(callback);
      return;
    }
    return closing;
  }

  override destroy(error: Error | null, callback: () => void): void;
  override destroy(callback: () => void): void;
  override destroy(error: Error | null): Promise<void>;
  override destroy(): Promise<void>;
  override destroy(
    errorOrCallback?: Error | null | (() => void),
    callback?: () => void,
  ): Promise<void> | void {
    const error =
      typeof errorOrCallback === "function" ? undefined : errorOrCallback;
    const onDestroyed =
      typeof errorOrCallback === "function" ? errorOrCallback : callback;
    const destroying = Promise.all(
      this.proxies.map((proxy) =>
        error === undefined ? proxy.destroy() : proxy.destroy(error),
      ),
    ).then(() => undefined);

    if (onDestroyed) {
      void destroying.then(onDestroyed);
      return;
    }
    return destroying;
  }
}

function createProxyDispatcher(): RotatingProxyDispatcher | undefined {
  const proxyFilePath = path.resolve(
    PROJECT_ROOT,
    process.env.BOT_PROXY_FILE || "proxies.txt",
  );
  const proxyFileUrls = existsSync(proxyFilePath)
    ? readFileSync(proxyFilePath, "utf8")
        .split(/\r?\n/)
        .map((line) => line.replace(/#.*$/, "").trim())
        .filter(Boolean)
    : [];
  const environmentUrls = (process.env.BOT_PROXY_URLS || "")
    .split(",")
    .map((proxyUrl) => proxyUrl.trim())
    .filter(Boolean);
  const proxyUrls = [...proxyFileUrls, ...environmentUrls];

  if (proxyUrls.length === 0) return undefined;

  const proxies = proxyUrls.map((proxyUrl, index): ProxyDispatcher => {
    let parsedUrl: URL;
    try {
      const credentialsMatch = proxyUrl.match(
        /^([^:/\s]+):(\d+):([^:\s]+):(.+)$/,
      );
      if (credentialsMatch) {
        const [, host, port, username, password] = credentialsMatch;
        parsedUrl = new URL(`http://${host}:${port}`);
        parsedUrl.username = username!;
        parsedUrl.password = password!;
      } else {
        const normalizedProxyUrl = /^[a-z][a-z\d+.-]*:\/\//i.test(proxyUrl)
          ? proxyUrl
          : `http://${proxyUrl}`;
        parsedUrl = new URL(normalizedProxyUrl);
      }
    } catch (error) {
      throw new Error(
        `La lista de proxies contiene una URL inválida en la posición ${index + 1}.`,
        { cause: error },
      );
    }

    if (parsedUrl.protocol === "socks5:") {
      return new Socks5ProxyAgent(parsedUrl);
    }
    if (parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:") {
      return new ProxyAgent(parsedUrl.toString());
    }

    throw new Error(
      `Protocolo de proxy no compatible en la posición ${index + 1}. Usa http://, https:// o socks5://.`,
    );
  });

  return new RotatingProxyDispatcher(proxies);
}

const proxyDispatcher = createProxyDispatcher();
if (proxyDispatcher) {
  setGlobalDispatcher(proxyDispatcher);
  console.info(
    `[http-proxy] Rotación habilitada con ${proxyDispatcher.proxyCount} proxies.`,
  );
}
