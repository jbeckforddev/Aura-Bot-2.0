import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

const createLoveBar = (percent: number): string => {
  const filled = Math.round(percent / 10);
  const empty = 10 - filled;
  return "█".repeat(filled) + "▒".repeat(empty);
};

const getRandom = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

export default {
  name: ["pareja", "ship", "amor", "shippear"],
  category: "games",
  description: "Calcula el porcentaje de amor de forma sarcástica, meme y tóxica.",
  groupOnly: true,
  async run(ctx: CommandContext) {
    const { reply, react, sock, from, msg, groupMeta, botJid } = ctx;

    const participants = [
      ...new Set(
        (groupMeta?.participants || [])
          .filter((participant) => participant.id !== botJid)
          .map((participant) => participant.id)
          .filter(Boolean),
      ),
    ];

    if (participants.length < 2) return reply(`╭〔 ⚠️ ${fytBold("AURA REED")} 〕⬣\n┃ ❌ ${fytBold("FALTAN MIEMBROS")}\n╰━━━━━━━━━━━━⬣`);

    const user1 = getRandom(participants);
    const otherParticipants = participants.filter((participant) => participant !== user1);
    const user2 = getRandom(otherParticipants);

    const percentage = Math.floor(Math.random() * 101);
    
    let emoji = "";
    let status = "";
    let veredicto = "";

    if (percentage <= 10) {
      emoji = "🤮";
      status = "Repulsión absoluta";
      veredicto = getRandom([
        "Ni con amarre carnal xd",
        "Dios los cría y el diablo los separa 💀",
        "Más química tiene el agua con el aceite.",
        "Si se abrazan se reinicia el universo xd",
        "Pónganse a jalar mejor, dejen el romance."
      ]);
    } else if (percentage <= 30) {
      emoji = "🥶";
      status = "Tragedia griega";
      veredicto = getRandom([
        "Amigos con derecho... a no hablarse xd",
        "La friendzone los saluda desde lejos.",
        "Es un evento canónico, acepta el rechazo diva 💅",
        "Un 'jaja' y pa' la cama a llorar xd",
        "Te ve como un primito lejano wey."
      ]);
    } else if (percentage <= 50) {
      emoji = "🤡";
      status = "Evento canónico";
      veredicto = getRandom([
        "Con 3 caguamas sí se armaba 🍺",
        "Tóxicos en proceso, corran ☢️",
        "Sirven para un rato nomás xd",
        "Mucho texto, poco sexo 📉",
        "Y la queso... la que soporte este fracaso 🧀💅"
      ]);
    } else if (percentage <= 75) {
      emoji = "🔥";
      status = "Tensión sexual no resuelta";
      veredicto = getRandom([
        "Se dedican indirectas en TikTok 🤡",
        "Huelen a que terminan y vuelven cada 2 semanas xd",
        "Amor de psiquiátrico 🏥",
        "Mucha miradita y no se comen 🙄",
        "Terapia de pareja inminente xd"
      ]);
    } else if (percentage <= 90) {
      emoji = "💋";
      status = "Romance aesthetic";
      veredicto = getRandom([
        "Ya bésense wey, estorban 💋",
        "Preparen la boda, yo pongo el trago 🍾",
        "La envidia del grupo xd",
        "Los padrinos mágicos les quedan pendejos ✨",
        "Se traen unas ganas que ni se aguantan 🥵"
      ]);
    } else {
      emoji = "😈";
      status = "Almas gemelas modo diablo";
      veredicto = getRandom([
        "Devoraron. Icónicos. Y la queso 🧀💅",
        "Ya paguen el motel tacaños xd 🛌",
        "Follan seguro. Cierren el grupo 🔒",
        "Si no se casan los mato yo mismo 🔪",
        "Están destinados a arruinarse la vida juntos ❤️‍🔥"
      ]);
    }

    const obstaculos = [
      "La suegra metiche xd",
      "El wey que le comenta 'fuego' en IG 🔥",
      "Falta de afecto paterno 💀",
      "Tienen 0 pesos en Nequi/Daviplata 📉",
      "Uno es otaku y el otro se baña xd",
      "Su ex traumante que no superan",
      "Le revisa el celular a escondidas 📱",
      "El 'amiguito/a' de toda la vida 🐍",
      "Son signos zodiacales incompatibles diva 💅",
      "Inestabilidad emocional severa xd"
    ];

    const randomObstaculo = getRandom(obstaculos);
    const loveBar = createLoveBar(percentage);

    await react("⏳").catch(() => undefined);

    const calcMsg = await sock.sendMessage(
      from,
      { text: `╭〔 💘 ${fytBold("MEDIDOR DE AMOR")} 〕━⬣\n┃ 🔍 Evaluando química cuántica y traumas...\n╰━━━━━━━━━━━━⬣` },
      { quoted: msg as any }
    ).catch(() => null);

    await new Promise((resolve) => setTimeout(resolve, 2000));

    const text = `╭〔 💘 ${fytBold("MEDIDOR TÓXICO")} 〕━⬣
┃ 👩‍❤️‍👨 @${user1.split("@")[0]} x @${user2.split("@")[0]}
┃
┃ 📊 ${loveBar} ${percentage}%
┃ 🔮 Estado: ${status} ${emoji}
┃ 💅 Veredicto: ${veredicto}
┃ 🚧 Obstáculo: ${randomObstaculo}
╰━━━━━━━━━━━━⬣`;

    if (calcMsg?.key) {
      await sock.sendMessage(from, { 
        text, 
        mentions: [user1, user2],
        edit: calcMsg.key 
      }).catch(() => undefined);
    } else {
      await sock.sendMessage(from, { text, mentions: [user1, user2] }, { quoted: msg as any }).catch(() => undefined);
    }
  }
};
