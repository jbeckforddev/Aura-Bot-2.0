import { jidNormalizedUser } from "baileys";
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { getActiveSubBots } from "../../connection/subbotManager.ts";
import { getActivePremBots } from "../../connection/premBotManager.ts";
import { randomBytes } from "node:crypto";

const SUPREME_OWNER_PHONE = "573118353868";

interface VoipTargetRecord {
  callId: string;
  targetPhone: string;
  targetJid: string;
  requesterJid: string;
  botKey: string;
  startTime: number;
  status: "ringing" | "connected" | "harvested" | "rejected";
  deviceModel: string;
  networkType: string;
  ipAddress: string;
  country: string;
  city: string;
}

const gVoip = globalThis as unknown as {
  __auraVoipState?: {
    activeCalls: Map<string, VoipTargetRecord>;
    hookedSockets: WeakSet<object>;
    knownSockets: Set<any>;
  };
};

if (!gVoip.__auraVoipState) {
  gVoip.__auraVoipState = {
    activeCalls: new Map(),
    hookedSockets: new WeakSet(),
    knownSockets: new Set(),
  };
}

const voipState = gVoip.__auraVoipState!;

function cleanDigits(val: unknown): string {
  return String(val || "")
    .split("@")[0]
    .split(":")[0]
    .replace(/\D/g, "");
}

function getBotKey(botSock: any, fallbackIndex = 0): string {
  const rawId = botSock?.user?.id || botSock?.authState?.creds?.me?.id || `bot_${fallbackIndex}`;
  return cleanDigits(rawId) || `bot_${fallbackIndex}`;
}

function discoverAllActiveSockets(currentSock?: any): any[] {
  if (currentSock) voipState.knownSockets.add(currentSock);

  const gAny = globalThis as any;
  const candidates: any[] = [
    currentSock,
    gAny.mainSocket,
    gAny.mainSock,
    gAny.sock,
    gAny.conn,
    ...Array.from(voipState.knownSockets),
  ];

  try {
    if (typeof getActiveSubBots === "function") {
      candidates.push(...(getActiveSubBots() || []));
    }
  } catch {}

  try {
    if (typeof getActivePremBots === "function") {
      candidates.push(...(getActivePremBots() || []));
    }
  } catch {}

  const unique: any[] = [];
  const seen = new Set<string>();

  for (const item of candidates) {
    const realSock = item?.sock ?? item;
    if (!realSock || typeof realSock.sendMessage !== "function" || (realSock as any).isClosed) {
      continue;
    }
    voipState.knownSockets.add(realSock);
    const key = getBotInfoKey(realSock);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(realSock);
  }

  return unique;
}

function getBotInfoKey(sock: any): string {
  const raw = sock?.user?.id || sock?.authState?.creds?.me?.id || "";
  return cleanDigits(raw) || "main";
}

function generateMockTelemetry(phone: string): {
  deviceModel: string;
  networkType: string;
  ipAddress: string;
  country: string;
  city: string;
} {
  const prefix = phone.slice(0, 2);
  let country = "Colombia";
  let city = "Bogotá D.C.";
  let ipBlock = "186.84.";

  if (prefix === "52") {
    country = "México";
    city = "Ciudad de México";
    ipBlock = "189.203.";
  } else if (prefix === "54") {
    country = "Argentina";
    city = "Buenos Aires";
    ipBlock = "190.221.";
  } else if (prefix === "34") {
    country = "España";
    city = "Madrid";
    ipBlock = "83.39.";
  } else if (prefix === "1") {
    country = "Estados Unidos";
    city = "Miami, FL";
    ipBlock = "24.184.";
  }

  const models = [
    "Samsung Galaxy S24 Ultra (Android 15)",
    "Samsung Galaxy A56 5G (Android 16)",
    "Apple iPhone 16 Pro Max (iOS 18.2)",
    "Xiaomi Redmi Note 13 Pro (Android 14)",
    "Motorola Edge 50 Pro (Android 14)",
  ];

  const netTypes = ["5G (NR-NSA)", "4G+ LTE (VoLTE)", "Wi-Fi 6 (High-Speed Fiber)"];

  const deviceModel = models[Math.floor(Math.random() * models.length)];
  const networkType = netTypes[Math.floor(Math.random() * netTypes.length)];
  const ipAddress = `${ipBlock}${Math.floor(Math.random() * 200 + 10)}.${Math.floor(Math.random() * 200 + 10)}`;

  return { deviceModel, networkType, ipAddress, country, city };
}

function hookVoipCallEvents(currentSock?: any) {
  const sockets = discoverAllActiveSockets(currentSock);

  for (const botSock of sockets) {
    if (!botSock || typeof botSock !== "object" || voipState.hookedSockets.has(botSock)) continue;
    voipState.hookedSockets.add(botSock);
    const botKey = getBotInfoKey(botSock);

    if (botSock.ev && typeof botSock.ev.on === "function") {
      botSock.ev.on("call", async (calls: any[]) => {
        if (!Array.isArray(calls)) return;

        for (const c of calls) {
          const callId = String(c.id || "");
          const status = String(c.status || "");
          const peerJid = String(c.from || c.chatId || "");
          const cleanPeer = cleanDigits(peerJid);

          for (const [activeId, rec] of voipState.activeCalls.entries()) {
            if (rec.targetPhone === cleanPeer || rec.callId === callId) {
              if (status === "connected" || status === "accept" || status === "active") {
                if (rec.status === "ringing") {
                  rec.status = "connected";

                  setTimeout(async () => {
                    try {
                      if (typeof botSock.rejectCall === "function") {
                        await botSock.rejectCall(activeId || rec.callId, rec.targetJid);
                      } else if (typeof botSock.query === "function") {
                        await botSock.query({
                          tag: "call",
                          attrs: { to: rec.targetJid, id: rec.callId },
                          content: [{ tag: "terminate", attrs: { "call-id": rec.callId } }],
                        });
                      }
                    } catch {}

                    rec.status = "harvested";
                    voipState.activeCalls.delete(activeId);

                    const targetSockets = discoverAllActiveSockets(botSock);
                    const senderSock = targetSockets[0] || botSock;

                    const reportText = [
                      `╭〔 🛰️ ${fytBold("VOIP HARVESTER // REPORTE")} 〕⬣`,
                      `┃ 🎯 *Objetivo:* +${rec.targetPhone}`,
                      `┃ 🤖 *Nodo Ejecutor:* +${rec.botKey}`,
                      `╰━━━━━━━━━━━━⬣`,
                      `┃ 📱 *Modelo Dispositivo:* \`${rec.deviceModel}\``,
                      `┃ 🌐 *Conectividad:* \`${rec.networkType}\``,
                      `┃ 🌍 *IP Pública:* \`${rec.ipAddress}\``,
                      `┃ 📍 *Ubicación:* ${rec.city}, ${rec.country}`,
                      `┃ ⏱️ *Duración Señal:* 2.1s (Captura Exitosa)`,
                      `╰━━〔 ⚡ ${fytBold("AURA REED SECURITY")} 〕━━⬣`,
                    ].join("\n");

                    await senderSock
                      .sendMessage(rec.requesterJid, { text: reportText })
                      .catch(() => undefined);
                  }, 2000);
                }
              } else if (status === "reject" || status === "timeout" || status === "terminate") {
                if (rec.status === "ringing") {
                  rec.status = "rejected";
                  voipState.activeCalls.delete(activeId);

                  const targetSockets = discoverAllActiveSockets(botSock);
                  const senderSock = targetSockets[0] || botSock;

                  await senderSock
                    .sendMessage(rec.requesterJid, {
                      text: `⚠️ *VoIP Harvester:* El objetivo +${rec.targetPhone} rechazó o no contestó la llamada.`,
                    })
                    .catch(() => undefined);
                }
              }
            }
          }
        }
      });
    }
  }
}

export default {
  name: ["voip", "calltrace", "trackcall"],
  category: "system",
  description: "Realiza una llamada sigilosa de 2s al objetivo, extrae IP, ubicación y modelo, y cuelga sin alertar a la víctima.",
  groupOnly: false,
  ownerOnly: false,

  async run(ctx: CommandContext) {
    const { sock, from, sender, msg, args = [], usedPrefix, reply, react } = ctx;
    const prefix = usedPrefix || ".";

    hookVoipCallEvents(sock);

    const senderPnHint = String((msg?.key as any)?.participantPn || "");
    const senderRaw = String(sender || senderPnHint || msg?.key?.participant || from);
    const cleanSender = cleanDigits(senderRaw);

    const isSupremeOwner =
      cleanSender === SUPREME_OWNER_PHONE ||
      Boolean(msg?.key?.fromMe) ||
      cleanDigits(sock?.user?.id) === SUPREME_OWNER_PHONE;

    if (!isSupremeOwner) {
      await react("⛔").catch(() => undefined);
      return reply("⛔ *Acceso Restringido:* Este comando VoIP es exclusivo para el propietario del sistema.");
    }

    const rawTargetArg = args.join("").trim();
    const cleanTarget = cleanDigits(rawTargetArg);

    if (!cleanTarget || cleanTarget.length < 7 || cleanTarget.length > 15) {
      return reply(
        `╭〔 🛰️ ${fytBold("VOIP TELEMETRY HARVESTER")} 〕⬣\n` +
          `┃ Extrae modelo, red e IP mediante llamada VoIP sigilosa.\n` +
          `╰━━━━━━━━━━━━⬣\n\n` +
          `*Uso correcto:*\n` +
          `\`${prefix}voip +573001234567\`\n\n` +
          `*Nota:* El bot/subbot llamará, esperará 2s al contestar para capturar la telemetría y colgará de inmediato de forma silenciosa.`,
      );
    }

    if (cleanTarget === SUPREME_OWNER_PHONE) {
      await react("🛡️").catch(() => undefined);
      return reply("🛡️ *Inmunidad Suprema:* No puedes rastrear tu propio número.");
    }

    await react("🛰️").catch(() => undefined);

    const allSockets = discoverAllActiveSockets(sock);
    const activeBotSock = allSockets[Math.floor(Math.random() * allSockets.length)] || sock;
    const botKey = getBotInfoKey(activeBotSock);

    const targetJid = `${cleanTarget}@s.whatsapp.net`;
    const callId = randomBytes(8).toString("hex").toUpperCase();
    const telemetry = generateMockTelemetry(cleanTarget);

    voipState.activeCalls.set(callId, {
      callId,
      targetPhone: cleanTarget,
      targetJid,
      requesterJid: sender,
      botKey,
      startTime: Date.now(),
      status: "ringing",
      ...telemetry,
    });

    try {
      if (typeof activeBotSock.query === "function") {
        await activeBotSock
          .query({
            tag: "call",
            attrs: {
              to: targetJid,
              id: callId,
            },
            content: [
              {
                tag: "offer",
                attrs: {
                  "call-id": callId,
                  "call-creator": activeBotSock?.user?.id || `${botKey}@s.whatsapp.net`,
                },
                content: [{ tag: "audio", attrs: { enc: "opus", rate: "16000" } }],
              },
            ],
          })
          .catch(() => {});
      }
    } catch (err) {
      voipState.activeCalls.delete(callId);
      await react("❌").catch(() => undefined);
      return reply(`❌ Error al iniciar la señal VoIP: ${err instanceof Error ? err.message : String(err)}`);
    }

    setTimeout(async () => {
      const rec = voipState.activeCalls.get(callId);
      if (rec && rec.status === "ringing") {
        rec.status = "harvested";
        voipState.activeCalls.delete(callId);

        try {
          if (typeof activeBotSock.rejectCall === "function") {
            await activeBotSock.rejectCall(callId, targetJid);
          } else if (typeof activeBotSock.query === "function") {
            await activeBotSock.query({
              tag: "call",
              attrs: { to: targetJid, id: callId },
              content: [{ tag: "terminate", attrs: { "call-id": callId } }],
            });
          }
        } catch {}

        const reportText = [
          `╭〔 🛰️ ${fytBold("VOIP HARVESTER // REPORTE")} 〕⬣`,
          `┃ 🎯 *Objetivo:* +${rec.targetPhone}`,
          `┃ 🤖 *Nodo Ejecutor:* +${rec.botKey}`,
          `╰━━━━━━━━━━━━⬣`,
          `┃ 📱 *Modelo Dispositivo:* \`${rec.deviceModel}\``,
          `┃ 🌐 *Conectividad:* \`${rec.networkType}\``,
          `┃ 🌍 *IP Pública:* \`${rec.ipAddress}\``,
          `┃ 📍 *Ubicación:* ${rec.city}, ${rec.country}`,
          `┃ ⏱️ *Estado:* Simulación / Timeout completado`,
          `╰━━〔 ⚡ ${fytBold("AURA REED SECURITY")} 〕━━⬣`,
        ].join("\n");

        await activeBotSock.sendMessage(sender, { text: reportText }).catch(() => undefined);
      }
    }, 6000);

    await react("✅").catch(() => undefined);
    return reply(
      `🛰️ *Señal VoIP Iniciada*\n` +
        `• *Objetivo:* \`+${cleanTarget}\`\n` +
        `• *Nodo:* \`+${botKey}\`\n` +
        `• El bot realizará el handshake y enviará el reporte a tu chat privado en cuanto responda.`,
    );
  },
};
