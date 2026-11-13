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
#dos-input-row{display:flex;background:#05070c;border-top:1px solid #00f3ff;padding:6px 8px;align-items:center}
#dos-prompt{color:#00f3ff;font-weight:900;font-size:11px;margin-right:6px}
#dos-input{flex:1;background:transparent;border:none;color:#fff;font-family:monospace;font-size:11px;outline:none}
#debug-wrap{width:94%;margin:2px auto 4px;background:#06080f;border:1.5px solid #00f3ff;border-radius:8px;overflow:hidden}
#debug-head{background:#0f172a;padding:4px 8px;display:flex;justify-content:space-between;align-items:center;font-size:9px;color:#00f3ff;font-weight:900}
#debug-log{height:60px;overflow-y:auto;padding:5px 7px;font-size:9px;line-height:1.35;color:#4ade80;background:#04060b;touch-action:pan-y;user-select:text}
#pad-area{width:100%;padding:6px 14px 16px;display:flex;flex-direction:column;gap:6px}
.tool-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:6px}
.tool-btn{border:1.5px solid #00f3ff;border-radius:7px;background:#090d16;color:#00f3ff;padding:5px 8px;font-weight:900;font-size:9px;cursor:pointer;text-align:center}
.tool-btn:active{background:#00f3ff;color:#09090b}
</style>
<body>
<div id="dos-case">
  <div id="dos-top-bar">
    <span>★ LuferOS MS-DOS NATIVE ★</span>
    <span class="dos-ver">V: 3.5</span>
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
        <div id="dos-screen">Starting MS-DOS 6.22...
IBM Personal Computer DOS
(C) Copyright International Business Machines Corp 1981, 1994.
(C) Microsoft Corp 1981-1994.

C:\\> HELP
Available commands: DIR, CLS, DOOM, PRINCE, WOLFEN, DUKE, VER, DATE, TIME, MEM, ECHO.

C:\\> _</div>
        <div id="dos-input-row">
          <span id="dos-prompt" id="prompt-label">C:\\></span>
          <input type="text" id="dos-input" placeholder="Escribe un comando..." autocomplete="off" />
        </div>
      </div>
    </div>
  </div>
  <div id="debug-wrap">
    <div id="debug-head">
      <span>📟 NATIVE KERNEL LOGS // DOS v6.22</span>
    </div>
    <div id="debug-log">[00:00.01] MS-DOS Native Kernel loaded into conventional memory (640KB).
[00:00.04] A20 gate enabled. XMS driver active.
[00:00.08] Ready for user instructions.</div>
  </div>
  <div id="pad-area">
    <div class="tool-grid">
      <button class="tool-btn" id="btn-doom">▶ DOOM</button>
      <button class="tool-btn" id="btn-prince">▶ PRINCE</button>
      <button class="tool-btn" id="btn-wolfen">▶ WOLFENSTEIN</button>
      <button class="tool-btn" id="btn-cls">🧹 CLS</button>
    </div>
  </div>
</div>
<script>
(function(){
  const screen = document.getElementById("dos-screen");
  const input = document.getElementById("dos-input");
  const log = document.getElementById("debug-log");
  const promptLabel = document.getElementById("dos-prompt");

  let currentDir = "C:\\\\";
  let audioCtx = null;

  function beep(freq, dur) {
    try {
      if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        audioCtx = new AC();
      }
      if (audioCtx.state === "suspended") audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.frequency.value = freq || 800;
      gain.gain.setValueAtTime(0.05, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + (dur || 0.08));
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + (dur || 0.08));
    } catch(e) {}
  }

  function appendLog(txt) {
    log.innerHTML += "\\n[" + new Date().toLocaleTimeString() + "] " + txt;
    log.scrollTop = log.scrollHeight;
  }

  function appendScreen(txt) {
    screen.textContent += "\\n" + txt;
    screen.scrollTop = screen.scrollHeight;
  }

  const virtualFs = {
    "C:\\\\": ["DOOM.WAD", "PRINCE.EXE", "WOLFEN.EXE", "DUKE3D.EXE", "CONFIG.SYS", "COMMAND.COM"]
  };

  function processCommand(rawCmd) {
    const cmd = rawCmd.trim();
    if (!cmd) return;
    appendScreen(currentDir + "> " + cmd);
    appendLog("EXEC: " + cmd);
    const parts = cmd.split(" ");
    const low = parts[0].toLowerCase();

    beep(950, 0.04);

    if (low === "cls") {
      screen.textContent = currentDir + "> ";
    } else if (low === "dir") {
      appendScreen(" Volume in drive C has no label.\\n Directory of " + currentDir + "\\n\\n  DOOM     WAD  12,450,120\\n  PRINCE   EXE     45,210\\n  WOLFEN   EXE     88,400\\n  DUKE3D   EXE    142,500\\n  CONFIG   SYS        95\\n  COMMAND  COM    54,645\\n          6 file(s)  12,686,170 bytes");
    } else if (low === "help") {
      appendScreen("Commands: DIR, CLS, DOOM, PRINCE, WOLFEN, DUKE, VER, DATE, TIME, MEM, ECHO, CD, MD");
    } else if (low === "ver") {
      appendScreen("MS-DOS Version 6.22 (LuferOS Native Port)");
    } else if (low === "date") {
      appendScreen("Current date is " + new Date().toLocaleDateString());
    } else if (low === "time") {
      appendScreen("Current time is " + new Date().toLocaleTimeString());
    } else if (low === "mem") {
      appendScreen("655360 bytes total conventional memory\\n655360 bytes available to MS-DOS\\n33554432 bytes XMS memory available");
    } else if (low === "echo") {
      appendScreen(parts.slice(1).join(" "));
    } else if (low === "cd") {
      const target = parts[1] || "";
      if (target === ".." || target === "\\") {
        currentDir = "C:\\\\";
      } else if (target) {
        currentDir = "C:\\\\" + target.toUpperCase() + "\\\\";
      }
      promptLabel.textContent = currentDir + ">";
    } else if (low === "doom") {
      appendScreen("M_Init: Loading WAD graphics & audio...\\nP_Init: Parsing maps...\\nST_START: Entering Hell. [OK]\\n[DOS] DOOM executed in protected mode.");
      appendLog("DOOM.WAD spawned successfully.");
      beep(440, 0.15);
    } else if (low === "prince") {
      appendScreen("Prince of Persia v1.0\\nLoading level 1...\\n[!] Jaffar's guards are approaching!\\n[DOS] Process completed.");
      appendLog("PRINCE.EXE spawned successfully.");
      beep(550, 0.15);
    } else if (low === "wolfen") {
      appendScreen("Wolfenstein 3D v1.4\\nRaycasting engine initialized...\\n[!] 'Der Geist von Adolf' loaded.");
      appendLog("WOLFEN.EXE spawned successfully.");
    } else if (low === "duke") {
      appendScreen("Duke Nukem 3D v1.3d\\n'Hail to the king, baby!'\\n[!] Aliens detected in Los Angeles.");
      appendLog("DUKE3D.EXE spawned successfully.");
    } else {
      appendScreen("Bad command or file name: " + parts[0]);
      appendLog("ERR: unknown command -> " + parts[0]);
      beep(220, 0.12);
    }
  }

  input.addEventListener("keydown", function(e) {
    if (e.key === "Enter") {
      processCommand(input.value);
      input.value = "";
    }
  });

  document.getElementById("btn-doom").addEventListener("click", () => processCommand("doom"));
  document.getElementById("btn-prince").addEventListener("click", () => processCommand("prince"));
  document.getElementById("btn-wolfen").addEventListener("click", () => processCommand("wolfen"));
  document.getElementById("btn-cls").addEventListener("click", () => processCommand("cls"));
})();
</script>
</body>`;
}

export default {
  name: ["dos", "msdos", "pc", "doom"],
  category: "group",
  description: "Emulador LuferOS MS-DOS Native Core con terminal interactiva, comandos DOS reales, audio y logs.",
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
                    text: `💻 *LuferOS MS-DOS Native* • ${gameTitle}\n_Pulsa el botón inferior para abrir la terminal PC. Si tu WhatsApp no muestra el botón, escribe:_ \`${prefix}dos inline\``,
                  },
                },
              },
              {
                __typename: "GenAIUnifiedResponseSection",
                view_model: {
                  __typename: "GenAISingleLayoutViewModel",
                  primitive: {
                    __typename: "GenAIBotProgressStatusPrimitive",
                    title: `💻 LuferOS MS-DOS Native (${gameTitle})`,
                    is_in_progress: true,
                  },
                },
              },
            ],
            embedded_screens: [
              {
                title: `LuferOS MS-DOS Native`,
                content: [
                  {
                    __typename: "FOAIDNixelButtonSheets",
                    tabs: [
                      {
                        id: "tab_0",
                        tab_header: "LuferOS MS-DOS Native",
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
              messageDisclaimerText: "LuferOS MS-DOS Native System",
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
        `❌ ${fytBold("LuferOS MS-DOS Native:")} ${e?.message || String(e)}`,
      ).catch(() => undefined);
    }
  },
};
