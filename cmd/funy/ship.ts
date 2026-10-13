import type { WAMessage } from "@whiskeysockets/baileys";
import type { CommandContext, ExtendedWASocket } from "../../types/index.d.ts";
import {
  createCanvas,
  loadImage,
  type SKRSContext2D,
  type Image,
} from "@napi-rs/canvas";
import { fytBold } from "../../core/socketText.ts";
import { t } from "../../src/langs/index.ts";


async function getProfilePic(
  sock: ExtendedWASocket,
  jid: string,
): Promise<Image | null> {
  try {
    const url = await sock.profilePictureUrl(jid, "image");
    const response = await fetch(url);
    if (!response.ok) return null;
    return await loadImage(Buffer.from(await response.arrayBuffer()));
  } catch {
    return null;
  }
}

function drawCircleAvatar(
  context: SKRSContext2D,
  image: Image | null,
  x: number,
  y: number,
  size: number,
) {
  context.save();
  context.beginPath();
  context.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  context.closePath();
  if (image) {
    context.clip();
    context.drawImage(image, x, y, size, size);
  } else {
    context.fillStyle = "#6be368";
    context.fill();
  }
  context.restore();
  context.beginPath();
  context.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  context.lineWidth = 14;
  context.strokeStyle = "#ffffff";
  context.stroke();
}

function drawHeart(
  context: SKRSContext2D,
  centerX: number,
  centerY: number,
  size: number,
  fill: string,
  stroke: string,
  lineWidth: number,
) {
  const top = centerY - size * 0.45;
  const bottom = centerY + size * 0.55;
  const lobe = size * 0.42;
  context.save();
  context.beginPath();
  context.moveTo(centerX, centerY - size * 0.08);
  context.bezierCurveTo(
    centerX - size * 0.16,
    centerY - size * 0.36,
    centerX - lobe,
    top,
    centerX - lobe,
    centerY - size * 0.05,
  );
  context.bezierCurveTo(
    centerX - lobe,
    centerY + size * 0.28,
    centerX - size * 0.2,
    centerY + size * 0.42,
    centerX,
    bottom,
  );
  context.bezierCurveTo(
    centerX + size * 0.2,
    centerY + size * 0.42,
    centerX + lobe,
    centerY + size * 0.28,
    centerX + lobe,
    centerY - size * 0.05,
  );
  context.bezierCurveTo(
    centerX + lobe,
    top,
    centerX + size * 0.16,
    centerY - size * 0.36,
    centerX,
    centerY - size * 0.08,
  );
  context.closePath();
  context.fillStyle = fill;
  context.fill();
  context.lineWidth = lineWidth;
  context.strokeStyle = stroke;
  context.stroke();
  context.restore();
}

function drawProgressBar(
  context: SKRSContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  percent: number,
) {
  const radius = height / 2;
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fillStyle = "#ffffff";
  context.fill();
  const fillWidth = Math.max(0, ((width - 20) * percent) / 100);
  if (fillWidth > 0) {
    context.beginPath();
    context.roundRect(x + 10, y + 10, fillWidth, height - 20, radius - 5);
    context.fillStyle = "#ff0505";
    context.fill();
  }
  drawHeart(
    context,
    x + 10 + fillWidth - 10,
    y + height / 2 - 8,
    100,
    "#ff1010",
    "#050505",
    5,
  );
}

export default {
  name: ["ship"],
  category: "funy",
  description: t("cmd_genera_una_tarjeta_de_compatib_aacb7ac6"),
  groupOnly: true,

  async run(ctx: CommandContext) {
    const messageContext = ctx.msg?.message?.extendedTextMessage?.contextInfo;
    const mentioned = Array.isArray(messageContext?.mentionedJid)
      ? messageContext.mentionedJid
      : [];
    const quotedParticipant = messageContext?.participant;
    let userA = ctx.sender;
    let userB =
      mentioned.length >= 2 ? mentioned[1] : mentioned[0] || quotedParticipant;
    if (mentioned.length >= 2) userA = mentioned[0];

    if (!userA || !userB)
      return ctx.reply({
        text: t("cmd_no_pude_identificar_a_los_usua_2643dccc"),
      });
    if (userA === userB)
      return ctx.reply({
        text: t("cmd_no_podes_hacerte_ship_con_vos__2fa3d0e9"),
      });

    userA = await ctx.resolveLid(userA);
    userB = await ctx.resolveLid(userB);
    const mentions = [userA, userB].filter(
      (jid) => typeof jid === "string" && jid.includes("@"),
    );
    if (mentions.length !== 2)
      return ctx.reply({
        text: t("cmd_no_pude_identificar_correctame_e2657c0a"),
      });

    const width = 1024;
    const height = 740;
    const canvas = createCanvas(width, height);
    const canvasContext = canvas.getContext("2d");
    canvasContext.fillStyle = "#b542e8";
    canvasContext.fillRect(0, 0, width, height);
    const avatarSize = 310;
    const avatarY = 85;
    const avatarX = 85;
    const [imageA, imageB] = await Promise.all([
      getProfilePic(ctx.sock, userA),
      getProfilePic(ctx.sock, userB),
    ]);
    drawCircleAvatar(canvasContext, imageA, avatarX, avatarY, avatarSize);
    drawCircleAvatar(
      canvasContext,
      imageB,
      width - avatarX - avatarSize,
      avatarY,
      avatarSize,
    );

    const percent = Math.floor(Math.random() * 101);
    const heartCenterX = 512;
    const heartCenterY = 400;
    drawHeart(
      canvasContext,
      heartCenterX,
      heartCenterY,
      180,
      "#ff007f",
      "#050505",
      5,
    );
    canvasContext.font = "bold 45px sans-serif";
    canvasContext.textAlign = "center";
    canvasContext.textBaseline = "middle";
    canvasContext.fillStyle = "#050505";
    canvasContext.fillText(`${percent}%`, heartCenterX, heartCenterY + 20);
    drawProgressBar(canvasContext, 85, 580, 854, 78, percent);

    let result = t("cmd_ship_cero_compatibilidad_4d5b0ef1");
    if (percent >= 90) result = t("cmd_ship_ya_casense_y_tengan_hijos_4d5b0ef2");
    else if (percent >= 85) result = t("cmd_ship_son_el_uno_para_el_otro_4d5b0ef3");
    else if (percent >= 70) result = t("cmd_ship_sus_miradas_se_cruzan_4d5b0ef4");
    else if (percent >= 50) result = t("cmd_ship_lo_pulsean_4d5b0ef5");
    else if (percent >= 30) result = t("cmd_ship_mejor_quedan_como_amigos_4d5b0ef6");

    const caption = t("cmd_value0_value1_value2_value3_va_bf910e73", { value0: fytBold(t("cmd_hay_ship_c00cf552")), value1: userA.split("@")[0], value2: userB.split("@")[0], value3: fytBold(t("cmd_porcentaje_693c242a")), value4: percent, value5: result, value6: fytBold(t("cmd_fun_2beb23b3")) });
    return ctx.sock.sendMessage(
      ctx.from,
      { image: canvas.toBuffer("image/png"), caption, mentions },
      { quoted: ctx.msg as unknown as WAMessage },
    );
  },
};
