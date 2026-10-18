import type { CommandContext } from "../../types/index.d.ts";
import {
	addStickerCommand,
	getQuotedStickerHash,
	listStickerCommands,
	removeStickerCommand,
} from "../../utils/cmdRegisterForStiker.ts";
import { t } from "../../src/langs/index.ts";

export default {
	name: ["cmdst", "agregarcmdsticker"],
	category: "utils",
	description: t("cmdst_description"),
	usage: t("cmdst_usage"),
	async run(ctx: CommandContext) {
		const { args, db, rawText, sender, getPlugins, msg, react, reply } = ctx;
		const requestedCommand = args[0];

		if (!requestedCommand) {
			const commands = listStickerCommands(db, sender);
			const activeCommands = commands.length
				? commands.map((command) => t("cmdst_list_item", { command })).join("\n")
				: t("cmdst_list_empty");
			return reply({
				text:
					`${t("cmdst_list_title")}\n${activeCommands}\n╰━━━━━━━━━━━━⬣\n\n` +
					t("cmdst_help", { prefix: ctx.usedPrefix || "." }),
			});
		}

		const command = requestedCommand
			.trim()
			.replace(/^[^a-zA-Z0-9]+/, "")
			.toLowerCase();
		const commandArgs = rawText.slice(requestedCommand.length).trim();
		if (!/^[a-z0-9_-]+$/.test(command)) {
			return reply({ text: t("cmdst_invalid_name") });
		}

		if (["cmdst", "agregarcmdsticker"].includes(command)) {
			return reply({ text: t("cmdst_reserved_command") });
		}

		if (command === "borrar") {
			const stickerHash = getQuotedStickerHash(msg);
			if (!stickerHash) {
				return reply({ text: t("cmdst_reply_required") });
			}
			if (!removeStickerCommand(db, sender, stickerHash)) {
				return reply({ text: t("cmdst_remove_not_found") });
			}

			await react("🗑️");
			return reply({ text: t("cmdst_removed") });
		}

		if (!getPlugins().has(command)) {
			return reply({ text: t("cmdst_command_not_found", { command }) });
		}

		const stickerHash = getQuotedStickerHash(msg);
		if (!stickerHash) {
			return reply({ text: t("cmdst_reply_required") });
		}

		const shortcut = [command, commandArgs].filter(Boolean).join(" ");
		if (!addStickerCommand(db, sender, stickerHash, shortcut)) {
			return reply({ text: t("cmdst_save_failed") });
		}

		await react("✅");
		return reply({
			text: t("cmdst_saved", {
				prefix: ctx.usedPrefix || ".",
				shortcut,
			}),
		});
	},
};