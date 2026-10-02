import os from "os";
import path from "path";
import fs from "fs";

export function setupCustomTmp(): string {
  const customTmpDir =
    process.env.GLOBAL_CUSTOM_TMP || path.join(process.cwd(), "./cache");

  if (!fs.existsSync(customTmpDir)) {
    fs.mkdirSync(customTmpDir, { recursive: true });
  }

  process.env.TMPDIR = customTmpDir;
  process.env.TEMP = customTmpDir;
  process.env.TMP = customTmpDir;

  os.tmpdir = () => customTmpDir;

  return customTmpDir;
}

setupCustomTmp();

// Configuracion de las apis externas
export const DL_CONFIG = {
  alya: {
    BASE_URL: "https://api.alyacore.xyz/",
    API_KEY: "oboe",
  },
  lempi: {
    BASE_URL: "https://api.lempi.lat/",
    API_KEY: "OBOE-AERETHIX",
  },
  deliriusApi: {
    BASE_URL: "https://api.delirius.online/",
    API_KEY: null,
  },
  faaApi: {
    BASE_URL: "https://api-faa.my.id/",
    API_KEY: null,
  },
  nekosApi: {
    BASE_URL: "https://nekos.best/api/v2",
    API_KEY: null,
  },
};
export const GAMES_CONFIG = {
  pokeApi:{
    BASE_URL: "https://pokeapi.co/api/v2",
    API_KEY: null,
  }
}


// Configuracion de fabrica de los bots
globalThis.DEFAULT_PREFIXES = [".", "#", "/", "!", "-", "%", "$"];
globalThis.DEFAULT_BOT_NAME = "AURA REED";
globalThis.DEFAULT_BOT_VERSION = "2.0.0";
globalThis.DEFAULT_BOT_AUTHOR = "𝑷𝒐𝒘𝒆𝒓𝒆𝒅 𝑩𝒚: Jeriel B.";
globalThis.DEFAULT_BOT_DESCRIPTION = "";
globalThis.DEFAULT_BOT_OWNER = "𝐉𝐞𝐫𝐢𝐞𝐥 𝐁";

globalThis.DEFAULT_USER_ROLES = [
  {
    lid: "5163322441896@lid",
    role: "owner",
    jid: "50672373785@s.whatsapp.net",
  },
];

// Directorio de sesiones de bots
globalThis.mainBotSession = "./sessions";
globalThis.subBotSession = "./sessions/subs";
globalThis.DATA_BASE_DIR = "./data";

globalThis.mainSocket = null;
