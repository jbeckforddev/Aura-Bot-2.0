import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

const getRandom = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

export default {
  name: ["amante", "noviosecreto", "casialgo", "cuernos"],
  category: "games",
  description: "Revela quién es el amante o casi-algo secreto de un usuario.",
  groupOnly: true,
  async run(ctx: CommandContext) {
    const { reply, react, sock, from, msg, groupMeta, botJid, sender } = ctx;

    const participants = groupMeta?.participants.filter(p => p.id !== botJid && p.id !== sender) || [];
    
    if (participants.length < 1) return reply(`╭〔 ⚠️ ${fytBold("AURA REED")} 〕⬣\n┃ ❌ ${fytBold("NO HAY GANADO")}\n╰━━━━━━━━━━━━⬣`);

    const amante = participants[Math.floor(Math.random() * participants.length)].id;
    
    const lugares = [
        "Motel de 200 pesos (olía a humedad) 🛌",
        "En los baños del trabajo/colegio xd 🚽",
        "Detrás del Oxxo a las 3 AM 🏪",
        "Escondidos en el monte 🌿",
        "En el asiento de atrás del Uber 🚗",
        "Jugando dúo dinámico en Free Fire 🎮",
        "Bajo las cobijas fingiendo dormir diva 💅",
        "En un callejón sin luz 🌃",
        "Viendo Netflix (pero sin ver la tele) 📺",
        "En el techo de lámina de su casa xd 🏠"
    ];

    const frases = [
        "Amor de contrabando, nadie se entera 🤫",
        "Un rapidín, borran chats y a fingir demencia 📱",
        "Cuidado que tu pareja oficial está sospechando 👁️",
        "El que se enamora pierde, y tú ya perdiste 🤡",
        "Mucha calentura, poca responsabilidad afectiva 🔥",
        "Prueba de que Dios los hace y el diablo los junta 😈",
        "Deberían darles vergüenza... inviten xd 🥵",
        "Y la queso... la que soporte los cuernos 🧀💅",
        "Huelen a pecado e ITS desde acá 🤢",
        "Tienen menos futuro que mi economía 📉",
        "Se ven a escondidas porque la sociedad (y sus parejas) no los aceptan xd"
    ];

    const nivelToxicidad = Math.floor(Math.random() * 101);
    const probDescubiertos = Math.floor(Math.random() * 101);
    
    let alertaFinal = "";
    if (probDescubiertos > 80) alertaFinal = "🚨 ¡CUIDADO! Ya les tomaron capturas de pantalla.";
    else if (probDescubiertos > 50) alertaFinal = "👀 Alguien del grupo ya los vio salir juntos.";
    else alertaFinal = "🥷 Modo fantasma: Nadie sospecha nada.";

    await react("🫣").catch(() => undefined);

    const searchMsg = await sock.sendMessage(
      from,
      { text: `╭〔 🕵️ ${fytBold("INVESTIGADOR AURA")} 〕━⬣\n┃ 🔍 Hackeando chats archivados...\n╰━━━━━━━━━━━━⬣` },
      { quoted: msg as any }
    ).catch(() => null);

    await new Promise((resolve) => setTimeout(resolve, 2500));

    const text = `╭〔 🤫 ${fytBold("AMANTE SECRETO")} 〕━⬣
┃ 👤 Infiel: @${sender.split("@")[0]}
┃ 🫦 Ganado: @${amante.split("@")[0]}
┃
┃ 📍 Punto de encuentro: ${getRandom(lugares)}
┃ ☣️ Nivel de toxicidad: ${nivelToxicidad}%
┃ 📈 Riesgo de ser pillados: ${probDescubiertos}%
┃
┃ 💅 Veredicto: ${getRandom(frases)}
┃
┃ > ${alertaFinal}
╰━━━━━━━━━━━━⬣`;

    if (searchMsg?.key) {
      await sock.sendMessage(from, { 
        text, 
        mentions: [sender, amante],
        edit: searchMsg.key 
      }).catch(() => undefined);
    } else {
      await sock.sendMessage(from, { text, mentions: [sender, amante] }, { quoted: msg as any }).catch(() => undefined);
    }
  }
};
