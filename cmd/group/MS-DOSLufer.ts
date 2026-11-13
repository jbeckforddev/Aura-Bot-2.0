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
#dos-screen{flex:1;background:#000;color:#00ff00;font-family:"Courier New",monospace;font-size:11px;padding:10px;overflow-y:auto;white-space:pre-wrap;word-break:break-all}
#dos-input-row{display:flex;background:#05070c;border-top:1px solid #00f3ff;padding:4px 8px;align-items:center}
#dos-prompt{color:#00f3ff;font-weight:900;font-size:11px;margin-right:6px}
#dos-input{flex:1;background:transparent;border:none;color:#fff;font-family:monospace;font-size:11px;outline:none}
#debug-wrap{width:94%;margin:2px auto 4px;background:#06080f;border:1.5px solid #00f3ff;border-radius:8px;overflow:hidden}
#debug-head{background:#0f172a;padding:4px 8px;display:flex;justify-content:space-between;align-items:center;font-size:9px;color:#00f3ff;font-weight:900}
#debug-log{height:64px;overflow-y:auto;padding:5px 7px;font-size:9px;line-height:1.35;color:#4ade80;background:#04060b;touch-action:pan-y;user-select:text}
#pad-area{width:100%;padding:6px 14px 16px;display:flex;flex-direction:column;gap:10px}
.tool-btn{border:1.5px solid #27272a;border-radius:7px;background:#18181b;color:#00f3ff;padding:6px 12px;font-weight:900;font-size:10px;cursor:pointer;width:100%;text-align:center}
.tool-btn:active{background:#00f3ff;color:#09090b}
</style>
<body>
<div id="dos-case">
  <div id="dos-top-bar">
    <span>★ LuferOS MS-DOS 6.22 SYSTEM ★</span>
    <span class="dos-ver">V: 1.0</span>
  </div>
  <div id="lens-outer">
    <div id="lens-bezel">
      <div id="lens-top">
        <div class="pwr-wrap">
          <div id="status-led"></div>
          <span class="pwr-txt" id="status-text">C:\\></span>
        </div>
        <div class="rom-tag">${options.bezelTitle}</div>
      </div>
      <div id="screen-container">
        <div id="dos-screen">Starting MS-DOS...
IBM Personal Computer DOS Version 6.22
(C)Copyright International Business Machines Corp 1981, 1994.
(C)Microsoft Corp 1981-1994.

C:\\> DIR
 Directory of C:\\
 ----------------
 COMMAND COM   54,645
 AUTOEXEC BAT     128
 CONFIG   SYS      95
 DOOM     WAD  12,450,120
 PRINCE   EXE     45,210
 WOLFEN   EXE     88,400

C:\\> _</div>
        <div id="dos-input-row">
          <span id="dos-prompt">C:\\></span>
          <input type="text" id="dos-input" placeholder="Escribe un comando (dir, doom, prince, cls)..." autocomplete="off" />
        </div>
      </div>
    </div>
  </div>
  <div id="debug-wrap">
    <div id="debug-head">
      <span>📟 KERNEL LOGS // DOSBOX v0.74</span>
    </div>
    <div id="debug-log">[00:00.01] MS-DOS BIOS loaded into conventional memory (640KB).
[00:00.02] A20 gate enabled. XMS driver active.
[00:00.05] File system mounted from LuferOS virtual storage.
[00:00.10] Ready for user instructions.</div>
  </div>
  <div id="pad-area">
    <button class="tool-btn" id="btn-quick-doom">▶ EJECUTAR DOOM.EXE</button>
    <button class="tool-btn" id="btn-quick-prince">▶ EJECUTAR PRINCE.EXE</button>
  </div>
</div>
<script>
(function(){
  const screen = document.getElementById("dos-screen");
  const input = document.getElementById("dos-input");
  const log = document.getElementById("debug-log");

  function appendLog(txt) {
    log.innerHTML += "\\n" + txt;
    log.scrollTop = log.scrollHeight;
  }

  function appendScreen(txt) {
    screen.textContent += "\\n" + txt;
    screen.scrollTop = screen.scrollHeight;
  }

  input.addEventListener("keydown", function(e) {
    if (e.key === "Enter") {
      const cmd = input.value.trim();
      if (!cmd) return;
      appendScreen("C:\\\\> " + cmd);
      appendLog("EXEC: " + cmd);
      const low = cmd.toLowerCase();

      if (low === "cls") {
        screen.textContent = "C:\\\\> ";
      } else if (low === "dir") {
        appendScreen(" Volume in drive C has no label.\\n Directory of C:\\\\5 files found.\\n  DOOM     WAD  12,450,120\\n  PRINCE   EXE     45,210\\n  WOLFEN   EXE     88,400\\n  SETUP    BAT        512\\n  README   TXT      1,200");
      } else if (low === "doom") {
        appendScreen("M_Init: Loading graphics & audio...\\nP_Init: Parsing maps...\\nST_START: Entering Hell.\\n[!] DOOM running in protected mode (32-bit x86).");
        appendLog("DOOM.WAD spawned successfully.");
      } else if (low === "prince") {
        appendScreen("Prince of Persia v1.0\\nLoading level 1...\\n[!] Jaffar is waiting in the tower!");
        appendLog("PRINCE.EXE spawned successfully.");
      } else {
        appendScreen("Bad command or file name: " + cmd);
        appendLog("ERR: command not found -> " + cmd);
      }
      input.value = "";
    }
  });

  document.getElementById("btn-quick-doom").addEventListener("click", function() {
    input.value = "doom";
    const ev = new KeyboardEvent("keydown", { key: "Enter", keyCode: 13, bubbles: true });
    input.dispatchEvent(ev);
  });

  document.getElementById("btn-quick-prince").addEventListener("click", function() {
    input.value = "prince";
    const ev = new KeyboardEvent("keydown", { key: "Enter", keyCode: 13, bubbles: true });
    input.dispatchEvent(ev);
  });
})();
</script>
</body>`;
}

export default {
  name: ["dos", "msdos", "pc", "doom"],
  category: "group",
  description: "Emulador LuferOS MS-DOS / DOSBox con consola interactiva de comandos y ejecución de clásicos.",
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
      const gameTitle = cleanArgs.join(" ").toUpperCase() || "MS-DOS 6.22 SHELL";

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
                    text: `💻 *LuferOS MS-DOS 6.22* • ${gameTitle}\n_Pulsa el botón inferior para abrir la terminal PC. Si tu WhatsApp no muestra el botón, escribe:_ \`${prefix}dos inline\``,
                  },
                },
              },
              {
                __typename: "GenAIUnifiedResponseSection",
                view_model: {
                  __typename: "GenAISingleLayoutViewModel",
                  primitive: {
                    __typename: "GenAIBotProgressStatusPrimitive",
                    title: `💻 LuferOS MS-DOS (${gameTitle})`,
                    is_in_progress: true,
                  },
                },
              },
            ],
            embedded_screens: [
              {
                title: `LuferOS MS-DOS`,
                content: [
                  {
                    __typename: "FOAIDNixelButtonSheets",
                    tabs: [
                      {
                        id: "tab_0",
                        tab_header: "LuferOS MS-DOS",
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
              messageDisclaimerText: "LuferOS MS-DOS System",
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
        `❌ ${fytBold("LuferOS MS-DOS:")} ${e?.message || String(e)}`,
      ).catch(() => undefined);
    }
  },
};
