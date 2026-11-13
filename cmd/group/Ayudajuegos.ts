import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";

export default {
  name: ["ayudajuegos", "juegoshelp", "emuladores", "helpnes", "helpgbc"],
  category: "group",
  description: "Muestra la guía completa para usar el emulador NES y LuferOS Game color Sys V: 3.0.",
  groupOnly: false,

  async run(ctx: CommandContext) {
    const { reply, usedPrefix } = ctx;
    const prefix = usedPrefix || ".";

    const helpText = [
      `╭〔 🎮 ${fytBold("CENTRO DE EMULACIÓN LUFEROS")} 〕⬣`,
      `┃ ¡Disfruta de tus juegos retro favoritos directamente`,
      `┃ en WhatsApp a pantalla completa y con controles táctiles!`,
      `╰━━━━━━━━━━━━━━━━━━━━━━⬣`,
      ``,
      `🕹️ **1. EMULADOR NES (.nes)**`,
      `• Jugar por defecto: \`${prefix}nes\` (ej. Mario Bros)`,
      `• Buscar juego guardado: \`${prefix}nes <Nombre>\``,
      `• Ver lista de NES: \`${prefix}nes list\``,
      `• Guardar ROM: Responde a un archivo \`.nes\` o \`.zip\` con \`${prefix}nes save <Nombre>\``,
      `• Modo burbuja (grupos): \`${prefix}nes inline <Nombre>\``,
      ``,
      `👾 **2. LUFEROS GAME COLOR SYS V: 3.0 (.gbc)**`,
      `• Jugar por defecto: \`${prefix}gbc\``,
      `• Buscar juego guardado: \`${prefix}gbc <Nombre>\``,
      `• Ver lista de GBC: \`${prefix}gbc list\``,
      `• Guardar ROM: Responde a un archivo \`.gb\`, \`.gbc\` o \`.zip\` con \`${prefix}gbc save <Nombre>\``,
      `• Modo burbuja (grupos): \`${prefix}gbc inline <Nombre>\``,
      ``,
      `💡 **Consejos Útiles:**`,
      `• Si estás en un grupo y el botón de pantalla completa no se muestra por restricciones de tu versión de WhatsApp, usa siempre la variante \`inline\` (ej: \`${prefix}gbc inline Bowling\`).`,
      `• El sistema detecta automáticamente si intentas subir un juego duplicado y te avisa con qué nombre ya está guardado.`,
      `╰━━〔 ⚡ ${fytBold("LUFEROS OS")} 〕━━ꬾ`,
    ].join("\n");

    return reply(helpText);
  },
};
