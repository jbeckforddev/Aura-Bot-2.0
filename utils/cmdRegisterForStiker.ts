import type { proto } from "@whiskeysockets/baileys";
import type { IDatabase } from "../types/database.d.ts";

const STICKER_COMMANDS_FIELD = "CmdSticker";

function findStickerMessage(
	value: unknown,
	depth = 0,
): Record<string, unknown> | null {
	if (!value || typeof value !== "object" || depth > 8) return null;
	const record = value as Record<string, unknown>;
	if (record.stickerMessage && typeof record.stickerMessage === "object") {
		return record.stickerMessage as Record<string, unknown>;
	}

	for (const child of Object.values(record)) {
		const found = findStickerMessage(child, depth + 1);
		if (found) return found;
	}
	return null;
}

function findQuotedMessage(value: unknown, depth = 0): unknown {
	if (!value || typeof value !== "object" || depth > 8) return null;
	const record = value as Record<string, unknown>;
	if (record.quotedMessage && typeof record.quotedMessage === "object") {
		return record.quotedMessage;
	}

	for (const child of Object.values(record)) {
		const found = findQuotedMessage(child, depth + 1);
		if (found) return found;
	}
	return null;
}

function normalizeStickerHash(value: unknown): string | null {
	if (!(value instanceof Uint8Array) || value.byteLength !== 32) return null;
	return Buffer.from(value).toString("base64");
}

export function getStickerHash(message: proto.IMessage | null | undefined) {
	const sticker = findStickerMessage(message);
	return normalizeStickerHash(sticker?.fileSha256);
}

export function getQuotedStickerHash(message: proto.IWebMessageInfo) {
	const quotedMessage = findQuotedMessage(message.message);
	const sticker = findStickerMessage(quotedMessage);
	return normalizeStickerHash(sticker?.fileSha256);
}

function readStickerCommands(db: IDatabase, userJid: string) {
	const stored = db.getUser(userJid)[STICKER_COMMANDS_FIELD];
	if (typeof stored !== "string") return {};
	try {
		const parsed: unknown = JSON.parse(stored);
		return parsed && typeof parsed === "object" && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: {};
	} catch {
		return {};
	}
}

export function getStickerCommand(
	db: IDatabase,
	userJid: string,
	stickerHash: string | null,
): string | null {
	if (!stickerHash) return null;
	const command = readStickerCommands(db, userJid)[stickerHash];
	return typeof command === "string" ? command : null;
}

export function addStickerCommand(
	db: IDatabase,
	userJid: string,
	stickerHash: string,
	command: string,
): boolean {
	if (!stickerHash || !command) return false;

	const commands = {
		...readStickerCommands(db, userJid),
		[stickerHash]: command,
	};
	db.setUser(userJid, { [STICKER_COMMANDS_FIELD]: JSON.stringify(commands) });
	return true;
}

export function listStickerCommands(db: IDatabase, userJid: string) {
	return Object.values(readStickerCommands(db, userJid)).filter(
		(command): command is string => typeof command === "string",
	);
}
