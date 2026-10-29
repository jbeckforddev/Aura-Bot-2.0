import type { GroupMetadata, GroupParticipant } from "baileys";
import type { CommandContext } from "../../types/index.d.ts";
import { fytBold } from "../../core/socketText.ts";
import { formatDuration } from "../../utils/formatter.ts";
import { t } from "../../src/langs/index.ts";


const status = (value: unknown): string =>
  value
    ? t("core_activado_2e624c72")
    : t("core_desactivado_7cc5cccc");
const onlyAdmin = (value: unknown): string =>
  value ? "🔒 Solo Admins" : "🔓 Todos";
const onlyAdminMembers = (value: unknown): string =>
  value ? "🔓 Todos" : "🔒 Solo Admins";

export default {
  name: ["adminsystem", "adminsys", "configgrupo", "groupconfig"],
  category: "group",
  description: t("cmd_muestra_las_configuraciones_ac_a03bbd5d"),
  groupOnly: true,
  adminOnly: true,
  async run(ctx: CommandContext) {
    if (!ctx.groupMeta) {
      return ctx.reply(t("cmd_no_se_pudo_obtener_la_informac_3121a681"));
    }
    const metadata = ctx.groupMeta;
    const participants = Array.isArray(metadata.participants)
      ? metadata.participants
      : [];
    const admins = participants.filter((participant: GroupParticipant) =>
      Boolean(participant.admin),
    );
    const group = ctx.db.getGroup(ctx.from);

    let text = t("cmd_value0_d9d20cb1", { value0: fytBold(t("cmd_admin_system_19c2cc22")) });
    text += t("cmd_value0_b855ee79", { value0: fytBold(metadata.subject || ctx.groupName || "Grupo") });
    text += t("cmd_text_bdfd7fa0");
    text += t("cmd_value0_4bbd2191", { value0: fytBold(t("cmd_configuracion_84529399")) });
    text += t("cmd_value0_value1_c765bc33", { value0: fytBold(t("cmd_edicion_del_grupo_51401288")), value1: onlyAdmin(metadata.restrict) });
    text += t("cmd_value0_value1_0d2b9faa", { value0: fytBold(t("cmd_grupo_cerrado_cb546248")), value1: status(metadata.announce) });
    text += t("cmd_value0_value1_75f3c12c", { value0: fytBold(t("cmd_aprobacion_para_unirse_cc6aab78")), value1: status(metadata.joinApprovalMode) });
    text += t("cmd_value0_value1_cf0e6ca0", { value0: fytBold(t("cmd_anadir_miembros_4e2c364d")), value1: onlyAdminMembers(metadata.memberAddMode) });
    text += t("cmd_value0_value1_63574f9c", { value0: fytBold(t("cmd_mensajes_temporales_97c24b55")), value1: metadata.ephemeralDuration ? formatDuration(Number(metadata.ephemeralDuration)) : "Desactivados" });
    text += t("cmd_value0_4bbd2191", { value0: fytBold(t("cmd_filtros_4ac228f5")) });
    text += t("cmd_value0_value1_f3470541", { value0: fytBold(t("cmd_antilink_1878d9fb")), value1: status(group.antilink) });
    text += t("cmd_value0_value1_670e2442", { value0: fytBold(t("cmd_antiestado_d9923985")), value1: status(group.antiStatus) });
    text += t("cmd_value0_value1_43b21f7f", { value0: fytBold(t("cmd_antitoxico_639fa229")), value1: status(group.antiToxic) });
    text += t("cmd_value0_value1_88f7e135", { value0: fytBold(t("cmd_antillamadas_b8f607b1")), value1: status(group.antiCalls) });
    text += t("cmd_value0_value1_f3470541", { value0: fytBold(t("groupAntiSpamLabel")), value1: status(group.antiSpam) });
    text += t("cmd_value0_6e998262", { value0: fytBold(t("cmd_tipo_de_grupo_3a538159")) });
    text += t("cmd_value0_value1_ffa00b9c", { value0: fytBold(t("cmd_miembros_e9ff2e67")), value1: participants.length });
    text += t("cmd_value0_value1_062a99db", { value0: fytBold(t("cmd_administradores_f8f9e495")), value1: admins.length });
    text += t("cmd_value0_value1_98ba29e8", { value0: fytBold(t("cmd_comunidad_46439222")), value1: status(metadata.isCommunity) });
    text += t("cmd_value0_value1_44a6c641", { value0: fytBold(t("cmd_anuncio_de_comunidad_cdde0c0c")), value1: status(metadata.isCommunityAnnounce) });
    text += t("cmd_value0_92601e2c", { value0: fytBold(t("cmd_system_info_1a78a0cb")) });
    return ctx.reply({ text });
  },
};
