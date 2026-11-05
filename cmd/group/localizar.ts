import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

/* ─────────────── sesiones de solicitud de ubicación ───────────────
   Solo registran "a quién se le pidió" para poder confirmar cuando
   esa persona decide compartir su ubicación por su cuenta. No se
   guarda ningún dato de ubicación aquí: eso solo llega si la persona
   lo envía ella misma como mensaje nativo de WhatsApp.
--------------------------------------------------------------------- */

type UbicacionSession = {
  chat: string;
  requestedBy: string;
  target: string;
  createdAt: number;
};

const G = globalThis as any;
const sessions: Map<string, UbicacionSession> = (G.__ubicSessions ??= new Map());

const TTL = 10 * 60 * 1000; // 10 minutos

function sweep() {
  const now = Date.now();
  for (const [id, s] of sessions) if (now - s.createdAt > TTL) sessions.delete(id);
}
setInterval(sweep, 5 * 60 * 1000).unref?.();

function sessionKey(chat: string, who: string) {
  return `${chat}|${who}`;
}

/* ─────────────── comando: pedir ubicación ─────────────── */

export default {
  name: ["ubicacion", "pedirubicacion", "compartirubicacion"],
  category: "group",
  description:
    "Pide a alguien compartir su ubicación usando la función nativa de WhatsApp (con su consentimiento explícito).",
  async run(ctx: CommandContext) {
    const { reply, react, from, msg } = ctx;

    const mentioned: string[] =
      (msg.message?.extendedTextMessage?.contextInfo?.mentionedJid as string[]) || [];

    const author: string = (msg.key as any).participant || from;
    // Si no se menciona a nadie, se interpreta como que el propio autor
    // quiere compartir la suya (p. ej. ".ubicacion" para avisar al chat
    // que va a enviarla).
    const target = mentioned[0] || author;

    sessions.set(sessionKey(from, target), {
      chat: from,
      requestedBy: author,
      target,
      createdAt: Date.now(),
    });

    const num = target.split("@")[0];

    await react("📍").catch(() => undefined);
    await reply(
      `${fytBold("Solicitud de ubicación")}\n\n` +
        `@${num}, si quieres compartir tu ubicación con este chat, usa la función ` +
        `nativa de WhatsApp:\n\n` +
        `📎 *Adjuntar* → *Ubicación* → *Enviar tu ubicación actual* (o *en vivo*).\n\n` +
        `Tú decides exactamente qué compartir, y todos en el chat lo ven igual que tú. ` +
        `No se recopila ni se envía nada de forma automática.\n\n` +
        `_Esta solicitud expira en 10 minutos._`,
      { mentions: [target] },
    ).catch(() => undefined);
  },
};

/* ─────────────── hook: confirmar cuando llega la ubicación ───────────────

   Esto NO escucha ni intercepta nada por su cuenta. Debes llamarlo tú
   desde el despachador principal de mensajes de tu bot (el lugar donde
   hoy procesas cada mensaje entrante, antes o después de resolver
   comandos), pasándole el socket y el mensaje crudo. No tengo
   visibilidad de ese despachador en tu proyecto, así que te dejo el
   hook listo para conectar; ajusta los tipos si tu framework ya expone
   algo más específico que "any".

   Ejemplo de integración (en tu loop de mensajes):

     sock.ev.on("messages.upsert", async ({ messages }) => {
       for (const m of messages) {
         await checkLocationConsent(sock, m);
         // ...tu lógica normal de comandos...
       }
     });

   Esta función solo reacciona si:
     1) la persona envió un mensaje de tipo "ubicación" de WhatsApp
        (algo que ella decidió adjuntar, visible nativamente para
        todo el chat), y
     2) existe una solicitud pendiente para ella en ese chat.
   No hace geolocalización por IP, no abre túneles, no captura nada
   de forma oculta.
--------------------------------------------------------------------- */

export async function checkLocationConsent(sock: any, msg: any) {
  const from: string | undefined = msg?.key?.remoteJid;
  const loc = msg?.message?.locationMessage || msg?.message?.liveLocationMessage;
  if (!loc || !from) return;

  const sender: string = msg.key.participant || from;
  const key = sessionKey(from, sender);
  const session = sessions.get(key);
  if (!session) return; // nadie pidió ubicación a esta persona en este chat

  sessions.delete(key);

  const num = sender.split("@")[0];
  await sock
    .sendMessage(
      from,
      { text: `✅ Ubicación recibida de @${num}. ¡Gracias por compartirla!`, mentions: [sender] },
      { quoted: msg },
    )
    .catch(() => undefined);
}
