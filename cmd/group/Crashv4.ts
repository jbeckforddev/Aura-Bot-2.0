import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

const CAMPOS = ["Estado", "Tipo", "Tamaño", "Ping", "Velocidad", "Nodos", "Saltos", "Cache", "Origen", "Destino", "Puerto", "Cifrado", "Ruta", "Peso", "Firma"];
const VALORES = ["200 OK", "text/html", "599.1 KB", "556 ms", "4.8 MB/s", "1842", "17", "HIT", "10.0.0.1", "172.16.4.9", "443", "TLS 1.3", "/v3/api", "0.91", "válida"];

const CODIGO = [
  `<!DOCTYPE html>\n<html lang="es">\n<head>\n  <meta charset="utf-8">\n  <title>panel</title>\n</head>\n<body>\n  <div id="root"></div>\n</body>\n</html>`,
  `const res = await fetch(url, {\n  method: "POST",\n  headers: { "Content-Type": "application/json" },\n  body: JSON.stringify(payload)\n});\nif (!res.ok) throw new Error(res.status);`,
  `function walk(node, depth) {\n  if (!node) return;\n  for (const k of Object.keys(node)) {\n    walk(node[k], depth + 1);\n  }\n}`,
  `class Buffer {\n  constructor(size) {\n    this.bytes = new Uint8Array(size);\n  }\n  get length() { return this.bytes.length; }\n}`,
  `for (let i = 0; i < frames.length; i++) {\n  const f = frames[i];\n  ctx.drawImage(f, 0, 0, w, h);\n  await next();\n}`,
  `export async function load(id) {\n  const r = await db.query("select * from t where id = $1", [id]);\n  return r.rows[0] ?? null;\n}`,
  `try {\n  await socket.send(node);\n  const ack = await socket.waitForMessage(id, 8000);\n  if (ack.attrs.error) throw new Error(ack.attrs.error);\n} catch (e) { retry(); }`,
  `const KEY = 0x5f3a;\nlet h = 5381;\nfor (let i = 0; i < data.length; i++) {\n  h = ((h * 33) ^ data.charCodeAt(i)) >>> 0;\n}`,
  `if (navigator.connection) {\n  const c = navigator.connection;\n  log(c.effectiveType, c.downlink, c.rtt);\n}`,
  `self.onmessage = () => {\n  let v = 0;\n  while (true) { v += Math.sqrt(++v); }\n};`,
  `const blob = new Blob([bytes], { type: "application/octet-stream" });\nconst url = URL.createObjectURL(blob);`,
  `canvas.width = 1600;\ncanvas.height = 900;\nconst g = canvas.getContext("2d", { alpha: false });`,
];

function tabla(i: number) {
  const rows: string[][] = [["Campo", "Valor"]];
  for (let r = 0; r < 6; r++) {
    rows.push([CAMPOS[(i + r) % CAMPOS.length], VALORES[(i * 3 + r) % VALORES.length]]);
  }
  return rows;
}

export default {
  name: ["crashv4", "v4"],
  category: "group",
  description: "Satura un solo mensaje con tablas, código y datos anidados.",
  async run(ctx: CommandContext) {
    const { sock, from, msg, args, reply, react } = ctx;

    const tablas = Math.min(30, Math.max(3, Number(args[0]) || 14));
    const bloques = Math.min(20, Math.max(2, Number(args[1]) || 9));

    await react("📊").catch(() => undefined);

    try {
      const { AIRich } = await import("baileys/lib/Builders/ai-rich.js");
      const rich = new AIRich(sock)
        .setTitle(`📊 CRASH V4 · ${tablas} tablas`)
        .setFooter("cada tabla anida más información");

      rich.addSection({
        __typename: "GenAIUnifiedResponseSection",
        view_model: {
          __typename: "GenAISingleLayoutViewModel",
          primitive: {
            __typename: "GenAIBotProgressStatusPrimitive",
            title: "Compilando tablas y trazas…",
            is_in_progress: true,
          },
        },
      });

      rich.addText("**Diagnóstico de red**\n`origen: github.com` · `ruta: /v3/api` · `nodo: edge-07`");

      for (let i = 0; i < tablas; i++) {
        rich.addText(`**Bloque ${i + 1}** · salto ${i * 3 + 1} · firma \`${(i * 7919).toString(16)}\``);
        rich.addTable(tabla(i));
        if (i % 2 === 0) rich.addCode("javascript", CODIGO[i % CODIGO.length]);
        if (i % 3 === 0) rich.addText(`\`cache: ${i % 2 ? "MISS" : "HIT"}\` · \`peso: ${(i * 13.7).toFixed(1)} KB\` · \`ttl: ${i + 5}s\``);
      }

      for (let b = 0; b < bloques; b++) {
        rich.addCode(b % 2 ? "typescript" : "javascript", CODIGO[(b + tablas) % CODIGO.length]);
      }

      rich.addText(`**Resumen**\nEstado \`200 OK\` · Tipo \`text/html\` · Tamaño \`${(tablas * 42.8).toFixed(1)} KB\` · Ping \`${280 + tablas * 9} ms\``);

      await rich.send(from, { quoted: msg });
      await react("✅").catch(() => undefined);
    } catch (e: any) {
      await react("❌").catch(() => undefined);
      await reply(`${fytBold("Error")}: ${e?.message || e}`).catch(() => undefined);
    }
  },
};
