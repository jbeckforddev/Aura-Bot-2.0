import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";


export default {
  name: ["setmeta", "metasticker", "sticker-meta"],
  category: "sticker",
  description: t("cmd_configura_el_pack_y_autor_de_t_36ab1aab"),
  async run({ args, db, sender, usedPrefix, reply }: CommandContext) {
    const user = db.getUser(sender);
    const currentPack =
      user.stickerPackName || user.data?.stickerPackName || "Aura Reed";
    const currentAuthor =
      user.stickerPackAuthor || user.data?.stickerPackAuthor || "Aura Reed";
    const raw = args.join(" ").trim();
    if (!raw) {
      return reply({
        text: t("cmd_value0_value1_pack_value2_auto_63c1f1a8", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_sticker_metadata_cadb5a4e")), value2: currentPack, value3: currentAuthor, value4: usedPrefix || ".", value5: fytBold(t("cmd_system_29d43743")) }),
      });
    }

    const [pack, author] = raw.split("|").map((value) => value.trim());
    if (!pack || !author) {
      return reply({
        text: t("cmd_usa_el_formato_value0_setmeta__497b097b", { value0: usedPrefix || "." }),
      });
    }

    db.setUser(sender, {
      stickerPackName: pack,
      stickerPackAuthor: author,
    });
    return reply({
      text: t("cmd_value0_value1_pack_value2_auto_50fe3aaa", { value0: fytBold(t("cmd_aura_reed_95dcfb15")), value1: fytBold(t("cmd_metadatos_actualizados_246f1e91")), value2: pack, value3: author, value4: fytBold(t("cmd_system_29d43743")) }),
    });
  },
};
