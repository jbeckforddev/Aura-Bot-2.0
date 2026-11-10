import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { generateWAMessageFromContent, proto } from "baileys";
import type { CommandContext } from "../../types/index.d.ts";

const run = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const VIDEO_URL =
  "https://raw.githubusercontent.com/LyncxTeams/Upload/main/Media/0cb9cb.mp4";
const AUDIO_FILENAME = "when_bambixd_2026-11-10_09-55-38.mp3";

function resolveLocalAudioPath(fileName: string): string {
  const candidates = [
    path.join(__dirname, fileName),
    path.resolve(process.cwd(), "cmd", "group", fileName),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return candidates[0];
}

export default {
  name: ["xd2"],
  category: "group",
  description: "Envía tarjeta HTML Rich multimedia con el audio de When Bambi.",
  groupOnly: false,

  async run(ctx: CommandContext) {
    const { sock, from, msg, reply, react } = ctx;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "rich-xd2-"));

    try {
      const video = path.join(dir, "video.mp4");
      const frame = path.join(dir, "frame.gif");
      const audioFile = path.join(dir, "bgm.webm");
      const localAudio = resolveLocalAudioPath(AUDIO_FILENAME);

      if (!fs.existsSync(localAudio)) {
        throw new Error(`No se encontró el archivo de audio en: ${localAudio}`);
      }

      await react("⏳").catch(() => undefined);

      const res = await fetch(VIDEO_URL, {
        headers: { "User-Agent": "Mozilla/5.0" },
        redirect: "follow",
      });
      if (!res.ok) throw new Error(`Descarga de video fallida: HTTP ${res.status}`);

      fs.writeFileSync(video, Buffer.from(await res.arrayBuffer()));
      if (!fs.existsSync(video) || fs.statSync(video).size === 0) {
        throw new Error("El video descargado está vacío.");
      }

      const profiles = [
        { duration: 3, fps: 8, width: 320 },
        { duration: 3, fps: 6, width: 240 },
        { duration: 2, fps: 5, width: 180 },
      ];

      let converted = false;

      for (const p of profiles) {
        try {
          if (fs.existsSync(frame)) fs.unlinkSync(frame);

          await run(
            "ffmpeg",
            [
              "-y",
              "-ss",
              "0",
              "-i",
              video,
              "-t",
              String(p.duration),
              "-an",
              "-vf",
              `fps=${p.fps},scale=${p.width}:-2:flags=lanczos`,
              "-loop",
              "0",
              frame,
            ],
            { timeout: 120000 },
          );

          if (
            fs.existsSync(frame) &&
            fs.statSync(frame).size > 0 &&
            fs.statSync(frame).size <= 700 * 1024
          ) {
            converted = true;
            break;
          }
        } catch {}
      }

      if (!converted) throw new Error("GIF falló o supera los 700 KB.");

      const gifSize = fs.statSync(frame).size;
      const thumb = "data:image/gif;base64," + fs.readFileSync(frame).toString("base64");

      let audioB64 = "";

      await run(
        "ffmpeg",
        [
          "-y",
          "-i",
          localAudio,
          "-vn",
          "-t",
          "30",
          "-c:a",
          "libopus",
          "-b:a",
          "16k",
          "-application",
          "audio",
          "-vbr",
          "constrained",
          "-ac",
          "1",
          "-f",
          "webm",
          audioFile,
        ],
        { timeout: 120000 },
      );

      if (fs.existsSync(audioFile) && fs.statSync(audioFile).size > 0) {
        audioB64 = "data:audio/webm;base64," + fs.readFileSync(audioFile).toString("base64");
      }

      const audioScript = audioB64
        ? `<script>
(function(){
var URI='${audioB64}';
var ctx=null,buffer=null,node=null,ready=false,playing=false;
function getCtx(){var AC=window.AudioContext||window.webkitAudioContext;if(!AC)return null;if(!ctx)ctx=new AC();return ctx;}
function decode(c,ab){return new Promise(function(resolve,reject){var done=false;function ok(b){if(!done){done=true;resolve(b)}}function bad(e){if(!done){done=true;reject(e)}}try{var r=c.decodeAudioData(ab,ok,bad);if(r&&typeof r.then==='function')r.then(ok,bad);}catch(e){bad(e)}});}
function toAB(uri){var bin=atob(uri.slice(uri.indexOf(',')+1));var bytes=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);return bytes.buffer;}
async function start(){if(!ready||playing)return;try{var c=getCtx();if(!c)return;if(c.state!=='running')await c.resume();if(c.state!=='running')return;var source=c.createBufferSource();source.buffer=buffer;source.loop=true;source.connect(c.destination);source.onended=function(){if(node===source){node=null;playing=false;start();}};source.start(0);node=source;playing=true;}catch(e){}}
async function init(){try{var c=getCtx();if(!c)return;buffer=await decode(c,toAB(URI));ready=true;await start();}catch(e){}}
document.addEventListener('click',function(){if(ready&&!playing)start();},{passive:true});
document.addEventListener('touchend',function(){if(ready&&!playing)start();},{passive:true});
init();
window.addEventListener('beforeunload',function(){try{if(node)node.stop();if(ctx)ctx.close();}catch(e){}});
})();
</script>`
        : "";

      const html = `<style>
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
html,body{background:transparent!important}
body{padding:4px 6px 8px;overflow:hidden}
.wrap{width:100%;max-width:420px;margin:auto}
.thumb{display:block;width:100%;height:auto;max-height:230px;object-fit:cover;
-webkit-mask-image:linear-gradient(to right,transparent 0,#000 16%,#000 84%,transparent 100%),linear-gradient(to bottom,transparent 0,#000 22%,#000 78%,transparent 100%);
-webkit-mask-composite:source-in}
</style>
<div class="wrap"><img class="thumb" src="${thumb}" alt=""></div>
${audioScript}`;

      const responseId = `html-rich-${crypto.randomBytes(8).toString("hex")}`;

      const response = {
        response_id: responseId,
        sections: [
          {
            view_model: {
              __typename: "GenAISingleLayoutViewModel",
              primitive: {
                __typename: "GenAIaeacdsnwHtmlPrimitive",
                trusted_sources: [],
                payload: html,
              },
            },
          },
        ],
      };

      const fakeQuoted = {
        key: {
          fromMe: false,
          participant: "13135550002@s.whatsapp.net",
          remoteJid: "status@broadcast",
          id: "META-BYPASS",
        },
        message: {
          contactMessage: {
            displayName: "WhatsApp Business 🔵\nContacto: Meta AI:\n2take1-Interative",
            vcard:
              "BEGIN:VCARD\n" +
              "VERSION:3.0\n" +
              "N;CHARSET=UTF-8:;Meta AI;;;;\n" +
              "FN;CHARSET=UTF-8:Meta AI\n" +
              "TEL;waid=13135550002:+1 313 555 0002\n" +
              "END:VCARD",
          },
        },
      };

      const waMsg = generateWAMessageFromContent(
        from,
        {
          messageContextInfo: {
            threadId: [],
            deviceListMetadata: {
              senderKeyIndexes: [],
              recipientKeyIndexes: [],
            },
            deviceListMetadataVersion: 2,
            botMetadata: {
              messageDisclaimerText: "⚡ HTML Rich - When Bambi Audio",
              botResponseId: responseId,
              verificationMetadata: {
                proofs: [
                  {
                    certificateChain: [Buffer.alloc(0), Buffer.alloc(0)],
                    version: 1,
                    useCase:
                      (proto as any).BotSignatureVerificationUseCaseProof
                        ?.BotSignatureUseCase?.WA_BOT_MSG,
                    signature: Buffer.alloc(0),
                  },
                ],
              },
              capabilityMetadata: {
                capabilities: [
                  "PROGRESS_INDICATOR",
                  "RICH_RESPONSE_HEADING",
                  "RICH_RESPONSE_NESTED_LIST",
                  "AI_MEMORY",
                  "RICH_RESPONSE_THREAD_SURFING",
                  "RICH_RESPONSE_TABLE",
                  "RICH_RESPONSE_CODE",
                  "RICH_RESPONSE_STRUCTURED_RESPONSE",
                  "RICH_RESPONSE_INLINE_IMAGE",
                  "RICH_RESPONSE_SUB_HEADING",
                  "RICH_RESPONSE_GRID_IMAGE",
                  "AI_STUDIO_UGC_MEMORY",
                  "RICH_RESPONSE_LATEX",
                  "RICH_RESPONSE_MAPS",
                  "RICH_RESPONSE_INLINE_REELS",
                  "AGENTIC_PLANNING",
                  "ACCOUNT_LINKING",
                  "STREAMING_DISAGGREGATION",
                  "RICH_RESPONSE_GRID_IMAGE_3P",
                  "RICH_RESPONSE_LATEX_INLINE",
                  "QUERY_PLAN",
                  "PROACTIVE_MESSAGE",
                  "RICH_RESPONSE_UNIFIED_RESPONSE",
                  "PROMOTION_MESSAGE",
                  "SIMPLIFIED_PROFILE_PAGE",
                  "RICH_RESPONSE_SOURCES_IN_MESSAGE",
                  "RICH_RESPONSE_SIDE_BY_SIDE_SURVEY",
                  "RICH_RESPONSE_UNIFIED_TEXT_COMPONENT",
                  "AI_SHARED_MEMORY",
                  "RICH_RESPONSE_UNIFIED_SOURCES",
                  "RICH_RESPONSE_UNIFIED_DOMAIN_CITATIONS",
                  "RICH_RESPONSE_UR_INLINE_REELS_ENABLED",
                  "RICH_RESPONSE_UR_MEDIA_GRID_ENABLED",
                  "RICH_RESPONSE_UR_TIMESTAMP_PLACEHOLDER",
                  "RICH_RESPONSE_IN_APP_SURVEY",
                  "AI_RESPONSE_MODEL_BRANDING",
                  "SESSION_TRANSPARENCY_SYSTEM_MESSAGE",
                  "RICH_RESPONSE_UR_REASONING",
                  "RICH_RESPONSE_UR_ZEITGEIST_CITATIONS",
                  "RICH_RESPONSE_UR_ZEITGEIST_CAROUSEL",
                  "AI_IMAGINE_LOADING_INDICATOR",
                  "RICH_RESPONSE_UR_IMAGINE",
                  "AI_IMAGINE_UR_TO_NATIVE_LOADING_INDICATOR",
                  "RICH_RESPONSE_UR_BLOKS_ENABLED",
                  "RICH_RESPONSE_INLINE_LINKS_ENABLED",
                  "RICH_RESPONSE_UR_IMAGINE_VIDEO",
                  "JSON_PATCH_STREAMING",
                  "AI_TAB_FORCE_CLIPPY",
                  "UNIFIED_RESPONSE_EMBEDDED_SCREENS",
                  "AI_SUBSCRIPTION_ENABLED",
                ],
              },
              richResponseSourcesMetadata: {
                sources: [
                  {
                    provider: 0,
                    sourceQuery: "",
                    citationNumber: 1,
                    sourceTitle: "HTML Rich When Bambi",
                  },
                ],
              },
              botMessageOriginMetadata: {},
              botGroupMetadata: {
                participantsMetadata: [{ botFbid: "867051314767696" }],
              },
              botRenderingConfigMetadata: {
                bloksVersioningId:
                  "b2283ed77b26a6c0456f43d90a7d192ee508374aa31695e4774216ea5bb0700a85f4b064167acdc3275b48d195da42ba2f458fd15fc8445e69c2a874c2834406",
                pixelDensity: 1.7,
              },
            },
          },
          botForwardedMessage: {
            message: {
              richResponseMessage: {
                messageType: 1,
                submessages: [
                  {
                    messageType: 2,
                    messageText: "⚡ HTML RICH // XD2\n\nToca la tarjeta para activar el audio",
                  },
                ],
                unifiedResponse: {
                  data: Buffer.from(JSON.stringify(response)).toString("base64"),
                },
                contextInfo: {
                  forwardingScore: 1,
                  isForwarded: true,
                  expiration: 0,
                  forwardOrigin: 4,
                  botMessageSharingInfo: {
                    botEntryPointOrigin: "FAVICON",
                    forwardScore: 1,
                  },
                  participant: "0@s.whatsapp.net",
                  remoteJid: from,
                  stanzaId: responseId,
                },
              },
            },
          },
        } as any,
        {
          quoted: (fakeQuoted as any) || msg,
          userJid: sock.user?.id,
        },
      );

      await sock.relayMessage(from, waMsg.message!, { messageId: waMsg.key.id! });

      const edtMsg = generateWAMessageFromContent(
        from,
        {
          botForwardedMessage: {
            message: {
              protocolMessage: {
                key: waMsg.key,
                type: proto.Message.ProtocolMessage.Type.MESSAGE_EDIT,
                editedMessage: waMsg.message,
              },
            },
          },
        } as any,
        { userJid: sock.user?.id },
      );

      await sock.relayMessage(from, edtMsg.message!, { messageId: edtMsg.key.id! });

      await react("✅").catch(() => undefined);
      await reply(`✅ HTML Rich (.xd2) enviado.\n🎞️ GIF: ${Math.ceil(gifSize / 1024)} KB`);
    } catch (e: any) {
      await react("❌").catch(() => undefined);
      await reply(`❌ Error en .xd2:\n${e?.message || String(e)}`);
    } finally {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {}
    }
  },
};
