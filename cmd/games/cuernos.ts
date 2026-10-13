import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";


const getRandom = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

export default {
  name: ["amante", "noviosecreto", "casialgo", "cuernos"],
  category: "games",
  description: t("cmd_revela_quien_es_el_amante_o_ca_ab9b7f44"),
  groupOnly: true,
  async run(ctx: CommandContext) {
    const { reply, react, sock, from, msg, groupMeta, botJid, sender } = ctx;

    const participants = groupMeta?.participants.filter(p => p.id !== botJid && p.id !== sender) || [];
    
    if (participants.length < 1) return reply(t("cmd_value0_value1_abc43fce", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_no_hay_ganado_cfd71a74")) }));

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
      { text: t("cmd_value0_hackeando_chats_archiva_82e3345f", { value0: fytBold(t("cmd_investigador_aura_fba81982")) }) },
      { quoted: msg as any }
    ).catch(() => null);

    await new Promise((resolve) => setTimeout(resolve, 2500));

    const text = t("cmd_value0_infiel_value1_ganado_va_27cdb372", { value0: fytBold(t("cmd_amante_secreto_1f494196")), value1: sender.split("@")[0], value2: amante.split("@")[0], value3: getRandom(lugares), value4: nivelToxicidad, value5: probDescubiertos, value6: getRandom(frases), value7: alertaFinal });

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
