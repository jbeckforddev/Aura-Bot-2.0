import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.resolve(process.cwd(), "data", "dos_cache");

if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

function buildDosConsoleHtml(options: {
  bezelTitle: string;
}): string {
  return `<style>
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none;touch-action:none}
html,body{width:100%;min-height:100%;background:#05060a;color:#f4f4f5;font-family:monospace;overflow-x:hidden;overflow-y:auto}
body{min-height:100dvh;display:flex;align-items:flex-start;justify-content:center}
#dos-case{width:min(98vw,540px);margin:0 auto;background:linear-gradient(165deg,#18181b 0%,#09090b 100%);border:3px solid #3f3f46;border-radius:22px 22px 46px 22px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 20px 48px rgba(0,0,0,.92)}
#dos-top-bar{display:flex;justify-content:space-between;align-items:center;padding:6px 12px;background:linear-gradient(90deg,#09090b,#1e1b4b 50%,#09090b);border-bottom:2px solid #00f3ff;font-size:11px;font-weight:900;color:#fff}
.dos-ver{background:#00f3ff;color:#09090b;padding:1px 6px;border-radius:4px;font-size:9px;font-weight:900}
#lens-outer{width:100%;padding:8px 12px 6px;display:flex;flex-direction:column;align-items:center}
#lens-bezel{width:100%;background:#121215;border:3px solid #3f3f46;border-radius:14px;padding:7px 10px 8px;display:flex;flex-direction:column;align-items:center}
#lens-top{width:100%;display:flex;align-items:center;justify-content:space-between;margin-bottom:5px}
.pwr-wrap{display:flex;align-items:center;gap:5px}
#status-led{width:8px;height:8px;border-radius:50%;background:#22c55e;box-shadow:0 0 9px #22c55e}
.pwr-txt{font-size:8px;font-weight:900;color:#d4d4d8}
.rom-tag{font-size:8.5px;font-weight:900;color:#00f3ff;text-transform:uppercase;max-width:210px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#screen-container{position:relative;width:96%;aspect-ratio:4/3;background:#000;border:2.5px solid #00f3ff;border-radius:6px;overflow:hidden;display:flex;flex-direction:column}
#dosbox{width:100%;height:100%}
#debug-wrap{width:94%;margin:4px auto;background:#06080f;border:1.5px solid #00f3ff;border-radius:8px;overflow:hidden}
#debug-head{background:#0f172a;padding:4px 8px;display:flex;justify-content:space-between;align-items:center;font-size:9px;color:#00f3ff;font-weight:900}
#debug-log{height:64px;overflow-y:auto;padding:5px 7px;font-size:9px;line-height:1.35;color:#4ade80;background:#04060b;touch-action:pan-y;user-select:text}
#pad-area{width:100%;padding:6px 14px 16px;display:flex;flex-direction:column;gap:6px}
.tool-btn{border:1.5px solid #00f3ff;border-radius:7px;background:#090d16;color:#00f3ff;padding:8px;font-weight:900;font-size:10px;cursor:pointer;text-align:center;width:100%}
.tool-btn:active{background:#00f3ff;color:#09090b}
</style>
<link rel="stylesheet" href="https://v6.js-dos.com/latest/js-dos.css">
<script src="https://v6.js-dos.com/latest/js-dos.js"></script>
<body>
<div id="dos-case">
  <div id="dos-top-bar">
    <span>★ LuferOS MS-DOS REAL DOSBOX ★</span>
    <span class="dos-ver">V: 3.0</span>
  </div>
  <div id="lens-outer">
    <div id="lens-bezel">
      <div id="lens-top">
        <div class="pwr-wrap">
          <div id="status-led"></div>
          <span class="pwr-txt" id="status-text">DOSBOX</span>
        </div>
        <div class="rom-tag">${options.bezelTitle}</div>
      </div>
      <div id="screen-container">
        <div id="dosbox"></div>
      </div>
    </div>
  </div>
  <div id="debug-wrap">
    <div id="debug-head">
      <span>📟 DOSBOX WEBASSEMBLY KERNEL LOGS</span>
    </div>
    <div id="debug-log">Inicializando DOSBox WebAssembly Wasm core...</div>
  </div>
  <div id="pad-area">
    <button class="tool-btn" id="btn-restart">🔄 REINICIAR DOSBOX</button>
  </div>
</div>
<script>
(function(){
  const logEl = document.getElementById("debug-log");
  function log(msg) {
    logEl.textContent += "\\n[" + new Date().toLocaleTimeString() + "] " + msg;
    logEl.scrollTop = logEl.scrollHeight;
  }
  
  window.addEventListener("error", function(e) {
    log("ERR: " + (e.message || e));
  });

  if (typeof Dos === "function") {
    log("Librería js-dos detectada OK. Montando entorno...");
    Dos(document.getElementById("dosbox"), {
      url: "https://v6.js-dos.com/latest/games/doom.jsdos"
    }).then(function (ci) {
      log("¡DOSBox Wasm iniciado con éxito! Corriendo Doom / MS-DOS real.");
    }).catch(function (err) {
      log("Fallo al iniciar DOSBox: " + err);
    });
  } else {
    log("ERROR: No se pudo cargar js-dos desde CDN.");
  }

  document.getElementById("btn-restart").addEventListener("click", function() {
    window.location.reload();
  });
})();
</script>
</body>`;
}

export default {
  name: ["dos", "msdos", "pc", "doom"],
  category: "group",
  description: "Emulador LuferOS MS-DOS Real con DOSBox WebAssembly y consola de logs en vivo.",
  groupOnly: false,

  async run(ctx: CommandContext) {
    const { sock, from, msg, args = [], usedPrefix, reply, react } = ctx;
    const prefix = usedPrefix || ".";

    await react("💻").catch(() => undefined);

    try {
      const isInlineFallback = args.some((a) =>
        ["inline", "lite", "burbuja"].includes(a.toLowerCase()),
      );
      const cleanArgs = args.filter(
        (a) => !["inline", "lite", "burbuja"].includes(a.toLowerCase()),
      );
      const gameTitle = cleanArgs.join(" ").toUpperCase() || "DOOM.JSDOS (REAL)";

      const HTML = buildDosConsoleHtml({
        bezelTitle: gameTitle,
      });

      const uniqueResponseId = `LuferOS_DOS_${randomUUID().replace(/-/g, "")}`;

      const data = isInlineFallback
        ? {
            response_id: uniqueResponseId,
            sections: [
              {
                __typename: "GenAIUnifiedResponseSection",
                view_model: {
                  __typename: "GenAISingleLayoutViewModel",
                  primitive: {
                    __typename: "FOAHtmlPrimitiveDemoDONOTUSE",
                    trusted_sources: [],
                    payload: HTML,
                  },
                },
              },
            ],
          }
        : {
            response_id: uniqueResponseId,
            sections: [
              {
                __typename: "GenAIUnifiedResponseSection",
                view_model: {
                  __typename: "GenAISingleLayoutViewModel",
                  primitive: {
                    __typename: "GenAITextPrimitive",
                    text: `💻 *LuferOS MS-DOS Real DOSBox* • ${gameTitle}\n_Pulsa el botón inferior para abrir la máquina virtual MS-DOS. Si tu WhatsApp no muestra el botón, escribe:_ \`${prefix}dos inline\``,
                  },
                },
              },
              {
                __typename: "GenAIUnifiedResponseSection",
                view_model: {
                  __typename: "GenAISingleLayoutViewModel",
                  primitive: {
                    __typename: "GenAIBotProgressStatusPrimitive",
                    title: `💻 LuferOS MS-DOS Real (${gameTitle})`,
                    is_in_progress: true,
                  },
                },
              },
            ],
            embedded_screens: [
              {
                title: `LuferOS MS-DOS Real`,
                content: [
                  {
                    __typename: "FOAIDNixelButtonSheets",
                    tabs: [
                      {
                        id: "tab_0",
                        tab_header: "LuferOS MS-DOS Real",
                        sections: [
                          {
                            __typename: "GenAIUnifiedResponseSection",
                            view_model: {
                              __typename: "GenAISingleLayoutViewModel",
                              primitive: {
                                __typename: "GenAIaeacdsnwHtmlPrimitive",
                                payload: HTML,
                                url: "https://whatsapp.com",
                                trusted_sources: ["whatsapp.com", "example.com"],
                              },
                            },
                          },
                        ],
                        step_entries: [],
                      },
                    ],
                  },
                ],
              },
            ],
          };

      const msgId = randomUUID();

      await sock.relayMessage(
        from,
        {
          messageContextInfo: {
            deviceListMetadata: {},
            deviceListMetadataVersion: 2,
            botMetadata: {
              messageDisclaimerText: "LuferOS MS-DOS Real System",
              richResponseSourcesMetadata: {},
            },
          },
          botForwardedMessage: {
            message: {
              richResponseMessage: {
                messageType: 1,
                unifiedResponse: {
                  data: Buffer.from(JSON.stringify(data)).toString("base64"),
                },
                contextInfo: {
                  forwardingScore: 1,
                  isForwarded: true,
                  forwardedAiBotMessageInfo: {
                    botJid: "13135550002@s.whatsapp.net",
                  },
                  forwardOrigin: 4,
                },
              },
            },
          },
        } as any,
        {
          messageId: msgId,
        },
      );

      await react("✅").catch(() => undefined);
    } catch (e: any) {
      await react("❌").catch(() => undefined);
      await reply(
        `❌ ${fytBold("LuferOS MS-DOS Real:")} ${e?.message || String(e)}`,
      ).catch(() => undefined);
    }
  },
};
