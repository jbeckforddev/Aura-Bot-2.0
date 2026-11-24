import {
	prepareWAMessageMedia,
	proto,
	extractMessageContent,
	generateWAMessageFromContent,
	downloadMediaMessage,
	downloadContentFromMessage
} from 'baileys'

import { randomBytes } from 'node:crypto'
import type { CommandContext } from '../../types/index.d.ts'
import {
	applyStickerMetadata,
	isAnimatedWebp,
	isWebp,
	toSticker
} from '../../core/stickerUtils.ts'
import { CONVERT_AUDIO_TO_OGG } from '../../utils/converter.ts'

const DURACION_MAXIMA = 25
const SEGUNDOS_SESION = 60

type MediaKind = 'video' | 'image' | 'webp' | 'audio' | null
type DownloadType = 'video' | 'image' | 'sticker' | 'audio' | 'document' | null

interface MediaInfo {
	kind: MediaKind
	mime: string
	seconds: number
	isAnimated?: boolean
	mediaObj: Record<string, unknown> | null
	dlType: DownloadType
}

interface StickerSession {
	stickerBuffer: Buffer
	isAnimated: boolean
	packname: string
	author: string
	expiresAt: number
	processing: boolean
	timer: ReturnType<typeof setTimeout>
}

interface StickerNode {
	chat: string
	sender: string
	key?: Record<string, unknown>
	pushName?: string
	text?: string
	body?: string
	message?: Record<string, unknown>
	quoted?: StickerNode | null
	conn?: StickerClient
	fromMe?: boolean
	mtype?: string
	type?: string
	msg?: Record<string, unknown>
	mediaKey?: Uint8Array
	url?: string
	directPath?: string
	mimetype?: string
	seconds?: number
	fakeObj?: { message?: Record<string, unknown> }
	download?: () => Promise<Buffer>
}

interface StickerClient {
	user?: { id?: string }
	waUploadToServer?: (...args: unknown[]) => Promise<unknown>
	updateMediaMessage?: (message: unknown) => Promise<unknown>
	sendMessage?: (chat: string, content: Record<string, unknown>, options?: Record<string, unknown>) => Promise<unknown>
	relayMessage?: (chat: string, message: unknown, options?: Record<string, unknown>) => Promise<unknown>
}

if (!globalThis.__audioStickerSessions) {
	globalThis.__audioStickerSessions = new Map<string, StickerSession>()
}

const sesiones = globalThis.__audioStickerSessions

function modificarProto(p) {
	const M = p?.Message
	if (!M || M.__audioStickerPatchedV3) return

	if (M.StickerMessage) {
		const codificarStickerAnterior = M.StickerMessage.encode

		M.StickerMessage.encode = function (mensaje, writer) {
			const audio = mensaje?.audioMessage

			if (audio && Object.prototype.hasOwnProperty.call(mensaje, 'audioMessage')) {
				delete mensaje.audioMessage
			}

			const w = codificarStickerAnterior.call(this, mensaje, writer)

			if (audio && M.AudioMessage) {
				mensaje.audioMessage = audio
				M.AudioMessage.encode(audio, w.uint32(210).fork()).ldelim()
			}

			return w
		}

		if (typeof M.StickerMessage.fromObject === 'function') {
			const convertirStickerAnterior = M.StickerMessage.fromObject

			M.StickerMessage.fromObject = function (objeto) {
				const mensaje = convertirStickerAnterior.call(this, objeto)

				if (objeto?.audioMessage) {
					mensaje.audioMessage = M.AudioMessage?.fromObject
						? M.AudioMessage.fromObject(objeto.audioMessage)
						: objeto.audioMessage
				}

				return mensaje
			}
		}
	}

	const codificarMensajeAnterior = M.encode

	M.encode = function (mensaje, writer) {
		const audioSticker = mensaje?.audioStickerMessage

		if (audioSticker) {
			if (Object.prototype.hasOwnProperty.call(mensaje, 'stickerMessage')) {
				delete mensaje.stickerMessage
			}

			if (Object.prototype.hasOwnProperty.call(mensaje, 'audioStickerMessage')) {
				delete mensaje.audioStickerMessage
			}
		}

		const w = codificarMensajeAnterior.call(this, mensaje, writer)

		if (audioSticker && M.FutureProofMessage) {
			mensaje.audioStickerMessage = audioSticker
			M.FutureProofMessage.encode(audioSticker, w.uint32(1074).fork()).ldelim()
		}

		return w
	}

	if (typeof M.fromObject === 'function') {
		const convertirMensajeAnterior = M.fromObject

		M.fromObject = function (objeto) {
			const mensaje = convertirMensajeAnterior.call(this, objeto)

			if (objeto?.audioStickerMessage) {
				const interno = objeto.audioStickerMessage.message || objeto.audioStickerMessage

				if (interno?.stickerMessage && objeto.audioStickerMessage.message?.stickerMessage?.audioMessage) {
					interno.stickerMessage.audioMessage = objeto.audioStickerMessage.message.stickerMessage.audioMessage
				}

				mensaje.audioStickerMessage = { message: interno }
				delete mensaje.stickerMessage

				if (interno) {
					Object.setPrototypeOf(mensaje, interno)
				}
			}

			return mensaje
		}
	}

	M.__audioStickerPatchedV3 = true
}

async function asegurarModificado() {
	modificarProto(proto)

	for (const paquete of ['kage-baileys', '@whiskeysockets/baileys', 'baileys']) {
		try {
			const modulo = await import(paquete)

			if (modulo?.proto) modificarProto(modulo.proto)
			if (modulo?.default?.proto) modificarProto(modulo.default.proto)
		} catch {}
	}
}

function obtenerClaveSesion(m: StickerNode) {
	return `${m.chat}:${m.sender}`
}

function eliminarSesion(clave: string) {
	const existente = sesiones.get(clave)

	if (existente?.timer) {
		clearTimeout(existente.timer)
	}

	sesiones.delete(clave)
}

function desenvolverMensaje(raw) {
	let actual =
		typeof extractMessageContent === 'function'
			? extractMessageContent(raw) || raw
			: raw

	for (let i = 0; i < 6 && actual; i++) {
		const siguiente =
			actual.ephemeralMessage?.message ||
			actual.viewOnceMessageV2?.message ||
			actual.viewOnceMessageV2Extension?.message ||
			actual.viewOnceMessage?.message ||
			actual.documentWithCaptionMessage?.message ||
			actual.editedMessage?.message ||
			actual.audioStickerMessage?.message ||
			actual.audioStickerMessage

		if (!siguiente) break
		actual = siguiente
	}

	return actual || {}
}

function detectarMedia(nodo: Record<string, unknown> | null | undefined): MediaInfo {
	if (!nodo) {
		return {
			kind: null,
			mime: '',
			seconds: 0,
			mediaObj: null,
			dlType: null
		}
	}

	const contenedor = desenvolverMensaje(nodo.message || nodo.fakeObj?.message || {})

	const tipo =
		nodo.mtype ||
		nodo.type ||
		Object.keys(contenedor).find(k =>
			/imageMessage|videoMessage|stickerMessage|audioMessage|documentMessage/i.test(k)
		) ||
		''

	const mensajeDirecto =
		nodo.msg && typeof nodo.msg === 'object' &&
		(nodo.msg.mediaKey || nodo.msg.url || nodo.msg.directPath || nodo.msg.mimetype)
			? nodo.msg
			: null

	const mediaObj =
		mensajeDirecto ||
		contenedor[tipo] ||
		contenedor.videoMessage ||
		contenedor.imageMessage ||
		contenedor.stickerMessage ||
		contenedor.audioMessage ||
		contenedor.documentMessage ||
		(nodo.mediaKey || nodo.url || nodo.directPath ? nodo : null)

	const mime = String(nodo.mimetype || mediaObj?.mimetype || '').toLowerCase()
	const segundos = Number(mediaObj?.seconds || nodo.seconds || nodo.msg?.seconds || 0)

	if (/video/i.test(mime) || /videoMessage/i.test(tipo)) {
		const dlType = /documentMessage/i.test(tipo) ? 'document' : 'video'

		return {
			kind: 'video',
			mime: mime || 'video/mp4',
			seconds: segundos,
			mediaObj,
			dlType
		}
	}

	if (/webp/i.test(mime) || /stickerMessage/i.test(tipo)) {
		return {
			kind: 'webp',
			mime: 'image/webp',
			seconds: segundos,
			isAnimated: Boolean(mediaObj?.isAnimated),
			mediaObj,
			dlType: 'sticker'
		}
	}

	if (/image/i.test(mime) || /imageMessage/i.test(tipo)) {
		const dlType = /documentMessage/i.test(tipo) ? 'document' : 'image'

		return {
			kind: 'image',
			mime: mime || 'image/jpeg',
			seconds: 0,
			mediaObj,
			dlType
		}
	}

	if (/audio|ogg|opus|mpeg|mp3|wav|m4a|aac/i.test(mime) || /audioMessage/i.test(tipo)) {
		const dlType = /documentMessage/i.test(tipo) ? 'document' : 'audio'

		return {
			kind: 'audio',
			mime: mime || 'audio/mpeg',
			seconds: segundos,
			mediaObj,
			dlType
		}
	}

	return {
		kind: null,
		mime: '',
		seconds: 0,
		mediaObj: null,
		dlType: null
	}
}

async function descargarBuffer(
	nodo: StickerNode | null | undefined,
	info: MediaInfo,
	cliente: StickerClient
): Promise<Buffer | null> {
	if (!nodo) return null

	if (
		info?.mediaObj &&
		info?.dlType &&
		(info.mediaObj.mediaKey || info.mediaObj.directPath || info.mediaObj.url)
	) {
		try {
			const flujo = await downloadContentFromMessage(info.mediaObj, info.dlType)
			const fragmentos = []

			for await (const fragmento of flujo) {
				fragmentos.push(fragmento)
			}

			const buffer = Buffer.concat(fragmentos)

			if (buffer.length) return buffer
		} catch {}
	}

	if (nodo.fakeObj?.message || nodo.message) {
		try {
			const objetoMensaje = nodo.fakeObj?.message ? nodo.fakeObj : nodo

			const buffer = await downloadMediaMessage(
				objetoMensaje,
				'buffer',
				{},
				{
					logger: {
						info: () => {},
						error: () => {},
						warn: () => {}
					},
					reuploadRequest: cliente?.updateMediaMessage
				}
			)

			if (buffer?.length) return buffer
		} catch {}
	}

	if (info?.mediaObj && info?.dlType) {
		try {
			const sintetico = {
				key: nodo.key || {
					remoteJid: nodo.chat || 'status@broadcast',
					id: '0'
				},
				message: {
					[`${info.dlType}Message`]: info.mediaObj
				}
			}

			const buffer = await downloadMediaMessage(
				sintetico,
				'buffer',
				{},
				{
					logger: {
						info: () => {},
						error: () => {},
						warn: () => {}
					},
					reuploadRequest: cliente?.updateMediaMessage
				}
			)

			if (buffer?.length) return buffer
		} catch {}
	}

	if (typeof nodo.download === 'function') {
		try {
			const buffer = await nodo.download()

			if (buffer?.length) return buffer
		} catch {}
	}

	return null
}

function generarFormaDeOnda(bufferBase, longitud = 64) {
	const forma = Buffer.alloc(longitud)

	for (let i = 0; i < longitud; i++) {
		const byte = bufferBase && bufferBase.length
			? bufferBase[(i * 19 + 7) % bufferBase.length]
			: i * 11

		forma[i] = 18 + (byte % 76)
	}

	return forma
}

async function crearMensajeAudio(cliente, buffer, extension, segundosAlternativos = 0) {
	const duracionComun =
		segundosAlternativos > 0
			? Math.max(1, Math.min(DURACION_MAXIMA, segundosAlternativos))
			: 5
	const oggBuffer = await CONVERT_AUDIO_TO_OGG(
		buffer,
		duracionComun
	)

	const { audioMessage } = await prepareWAMessageMedia(
		{
			audio: oggBuffer,
			mimetype: 'audio/ogg; codecs=opus',
			ptt: true
		},
		{
			upload: cliente.waUploadToServer
		}
	)

	const segundosElegidos =
		segundosAlternativos > 0
			? segundosAlternativos
			: 5

	const segundosFinales = Math.max(
		1,
		Math.min(DURACION_MAXIMA, Math.round(segundosElegidos))
	)

	audioMessage.seconds = segundosFinales
	audioMessage.ptt = true
	audioMessage.mimetype = 'audio/ogg; codecs=opus'

	if (!audioMessage.waveform || !audioMessage.waveform.length) {
		audioMessage.waveform = generarFormaDeOnda(oggBuffer)
	}

	return audioMessage
}

async function enviarStickerConAudio(cliente, chat, bufferSticker, animado, mensajeAudio, quoted) {
	await asegurarModificado()

	const preparado = await prepareWAMessageMedia(
		{
			sticker: bufferSticker,
			isAnimated: animado
		},
		{
			upload: cliente.waUploadToServer
		}
	)

	preparado.stickerMessage.isAnimated = Boolean(animado)
	preparado.stickerMessage.audioMessage = mensajeAudio

	const carga = {
		__proto__: preparado,
		audioStickerMessage: {
			message: preparado
		},
		messageContextInfo: {
			messageSecret: randomBytes(32)
		}
	}

	const mensajeGenerado = generateWAMessageFromContent(
		chat,
		carga,
		{
			userJid: cliente.user?.id || chat,
			quoted
		}
	)

	await cliente.relayMessage(chat, mensajeGenerado.message, {
		messageId: mensajeGenerado.key.id
	})
}

function iniciarSesionSticker({
	m,
	client,
	send,
	stickerBuffer,
	isAnimated,
	packname,
	author,
	usedPrefix,
	command
}) {
	const clave = obtenerClaveSesion(m)

	eliminarSesion(clave)

	const timer = setTimeout(() => {
		if (sesiones.has(clave)) {
			sesiones.delete(clave)

			if (client?.sendMessage) {
				client.sendMessage(
					m.chat,
					{
						text:
							`╭〔 ⏰ *AUDIO STICKER* 〕⬣\n` +
							`┃ *Sesión finalizada*\n` +
							`┃ El tiempo de espera de ${SEGUNDOS_SESION} segundos terminó.\n` +
							`┃ Envía nuevamente la imagen o usa ${usedPrefix}${command} --add.\n` +
							`╰━━〔 ⚡ *AURA REED* 〕━━⬣`
					},
					{
						quoted: m
					}
				).catch(() => {})
			}
		}
	}, SEGUNDOS_SESION * 1000)

	sesiones.set(clave, {
		stickerBuffer,
		isAnimated,
		packname,
		author,
		expiresAt: Date.now() + SEGUNDOS_SESION * 1000,
		processing: false,
		timer
	})

	return send(
		`╭〔 ⚡ *AUDIO STICKER* 〕⬣\n` +
		`┃ *Sesión activada*\n` +
		`┃\n` +
		`┃ 🎨 *Paquete:* ${packname}\n` +
		`┃ 👤 *Autor:* ${author}\n` +
		`┃ 🖼️ *Tipo:* ${isAnimated ? 'GIF animado' : 'Imagen estática'}\n` +
		`┃ ⏱️ *Audio máximo:* ${DURACION_MAXIMA} segundos\n` +
		`┃ ⌛ *Tiempo:* ${SEGUNDOS_SESION} segundos\n` +
		`┃\n` +
		`┃ *Siguiente paso*\n` +
		`┃ Envía un *Audio MP3 / Nota de voz*.\n` +
		`┃ También puedes responder a un audio con \`${usedPrefix}${command} --add\`.\n` +
		`┃ Escribe \`${usedPrefix}${command} cancelar\` para cancelar.\n` +
		`╰━━〔 ⚡ *AURA REED* 〕━━⬣`
	)
}

async function consumirSesionConAudio(m, client, send, react, session, audioNode, audioInfo) {
	const clave = obtenerClaveSesion(m)

	session.processing = true

	await react('⏳')

	try {
		const audioBuffer = await descargarBuffer(audioNode, audioInfo, client)

		if (!audioBuffer || !audioBuffer.length) {
			throw new Error('No se pudo descargar el archivo de audio o video.')
		}

		const extension =
			audioInfo.kind === 'video'
				? 'mp4'
				: /ogg|opus/i.test(audioInfo.mime)
					? 'ogg'
					: /mp4|m4a|aac/i.test(audioInfo.mime)
						? 'm4a'
						: 'mp3'

		const mensajeAudio = await crearMensajeAudio(
			client,
			audioBuffer,
			extension,
			audioInfo.seconds
		)

		await enviarStickerConAudio(
			client,
			m.chat,
			session.stickerBuffer,
			session.isAnimated,
			mensajeAudio,
			m
		)

		eliminarSesion(clave)

		await react('✅')
	} catch (error) {
		session.processing = false

		console.error('[ERROR SESIÓN AUDIO STICKER]', error)

		await react('❌')

		await send(
			`❌ No se pudo combinar el audio con el sticker: ${error?.message || String(error)}`
		)
	}
}

const handler = async (m, extra = {}) => {
	const {
		sock,
		conn,
		text,
		reply,
		db,
		usedPrefix = '.',
		command = 'audiosticker'
	} = extra

	const client = sock || conn || m.conn || global.conn || global.sock

	const send = reply || (
		texto => client.sendMessage(
			m.chat,
			{ text: texto },
			{ quoted: m }
		)
	)

	const react = async emoji => {
		if (client?.sendMessage) {
			await client.sendMessage(
				m.chat,
				{
					react: {
						text: emoji,
						key: m.key
					}
				}
			).catch(() => {})
		}
	}

	const clave = obtenerClaveSesion(m)
	const sesionActiva = sesiones.get(clave)
	const textoIngresado = String(text || '').trim()
	const modoAgregarAudio = /(?:^|\s)--add(?:\s|$)/i.test(textoIngresado)

	if (/^(cancelar|cancel|batal|stop)$/i.test(textoIngresado)) {
		if (!sesionActiva) {
			return send(
				`╭〔 ⚠️ *AUDIO STICKER* 〕⬣\n` +
				`┃ No hay ninguna sesión activa.\n` +
				`╰━━〔 ⚡ *AURA REED* 〕━━⬣`
			)
		}

		eliminarSesion(clave)

		await react('✅')

		return send(
			`╭〔 ✅ *AUDIO STICKER* 〕⬣\n` +
			`┃ Sesión cancelada correctamente.\n` +
			`╰━━〔 ⚡ *AURA REED* 〕━━⬣`
		)
	}

	const infoPropia = detectarMedia(m)
	const citado = m.quoted
	const infoCitada = detectarMedia(citado)

	const tieneVisualPropio =
		infoPropia.kind === 'video' ||
		infoPropia.kind === 'image' ||
		infoPropia.kind === 'webp'

	const tieneVisualCitado =
		infoCitada.kind === 'video' ||
		infoCitada.kind === 'image' ||
		infoCitada.kind === 'webp'

	const tieneAudioPropio = infoPropia.kind === 'audio'
	const tieneAudioCitado = infoCitada.kind === 'audio'

	if (
		sesionActiva &&
		!sesionActiva.processing &&
		modoAgregarAudio &&
		(tieneAudioPropio || tieneAudioCitado) &&
		!tieneVisualPropio
	) {
		const nodoAudio = tieneAudioPropio ? m : citado
		const infoAudio = tieneAudioPropio ? infoPropia : infoCitada

		return await consumirSesionConAudio(
			m,
			client,
			send,
			react,
			sesionActiva,
			nodoAudio,
			infoAudio
		)
	}

	if (
		!tieneVisualPropio &&
		!tieneVisualCitado &&
		!tieneAudioPropio &&
		!tieneAudioCitado
	) {
		if (sesionActiva) {
			const segundosRestantes = Math.max(
				1,
				Math.ceil((sesionActiva.expiresAt - Date.now()) / 1000)
			)

			return send(
				`╭〔 ⏳ *AUDIO STICKER* 〕⬣\n` +
				`┃ *Sesión activa: ${segundosRestantes}s*\n` +
				`┃ Envía un *Audio MP3 / Nota de voz*.\n` +
				`┃ También puedes responder a un audio con \`${usedPrefix}${command} --add\`.\n` +
				`┃ Escribe \`${usedPrefix}${command} cancelar\` para cancelar.\n` +
				`╰━━〔 ⚡ *AURA REED* 〕━━⬣`
			)
		}

		return send(
			`╭〔 ⚡ *AUDIO STICKER* 〕⬣\n` +
			`┃ Crea stickers con o sin audio.\n` +
			`┃\n` +
			`┃ *Uso normal*\n` +
			`┃ Responde a una imagen, sticker o video con \`${usedPrefix}${command}\`.\n` +
			`┃ Los videos usan su propio sonido.\n` +
			`┃\n` +
			`┃ *Añadir audio con --add*\n` +
			`┃ Responde a una foto o sticker con \`${usedPrefix}${command} --add\`.\n` +
			`┃ Tendrás ${SEGUNDOS_SESION} segundos para enviar el audio.\n` +
			`┃ El video citado usa su sonido original.\n` +
			`┃\n` +
			`┃ *Duración máxima:* ${DURACION_MAXIMA} segundos\n` +
			`╰━━〔 ⚡ *AURA REED* 〕━━⬣`
		)
	}

	if (
		!tieneVisualPropio &&
		!tieneVisualCitado &&
		(tieneAudioPropio || tieneAudioCitado)
	) {
		if (!modoAgregarAudio) {
			return send(
				`╭〔 ⚠️ *AUDIO STICKER* 〕⬣\n` +
				`┃ Falta seleccionar una imagen, video o sticker.\n` +
				`┃ Responde al medio con \`${usedPrefix}${command}\`.\n` +
				`┃ Usa \`${usedPrefix}${command} --add\` para añadir audio.\n` +
				`╰━━〔 ⚡ *AURA REED* 〕━━⬣`
			)
		}
		return send(
			`╭〔 ⚠️ *AUDIO STICKER* 〕⬣\n` +
			`┃ Primero responde a una foto o sticker.\n` +
			`┃ Después tendrás ${SEGUNDOS_SESION} segundos para enviar el audio.\n` +
			`╰━━〔 ⚡ *AURA REED* 〕━━⬣`
		)
	}

	await react('⏳')

	try {
		await asegurarModificado()

		const usuario = db?.getUser?.(m.sender) ?? {}

		const packname =
			usuario.stickerPackName ||
			usuario.data?.stickerPackName ||
			'Aura Reed'

		const author =
			usuario.stickerPackAuthor ||
			usuario.data?.stickerPackAuthor ||
			m.pushName ||
			'Aura Reed'

		const nodoVisual = tieneVisualPropio ? m : citado
		const infoVisual = tieneVisualPropio ? infoPropia : infoCitada

		const esVideo = infoVisual.kind === 'video'
		const duracionVideo = infoVisual.seconds || 0

		if (esVideo && duracionVideo > DURACION_MAXIMA) {
			await react('❌')

			return send(
				`╭〔 ⚠️ *AUDIO STICKER* 〕⬣\n` +
				`┃ La duración máxima es de ${DURACION_MAXIMA} segundos.\n` +
				`╰━━〔 ⚡ *AURA REED* 〕━━⬣`
			)
		}

		const datosVisuales = await descargarBuffer(
			nodoVisual,
			infoVisual,
			client
		)

		if (!datosVisuales || !datosVisuales.length) {
			throw new Error('No se pudo descargar el archivo de imagen o video.')
		}

		const stickerSinMetadata =
			infoVisual.kind === 'webp' && isWebp(datosVisuales) && !esVideo
				? datosVisuales
				: await toSticker(
					datosVisuales,
					esVideo,
					DURACION_MAXIMA,
					esVideo
						? Math.max(1, Math.min(DURACION_MAXIMA, duracionVideo))
						: undefined
				)

		const stickerBuffer = await applyStickerMetadata(
			stickerSinMetadata,
			db,
			m.sender,
			m.pushName || 'Aura Reed'
		)

		const esAnimado =
			esVideo || isAnimatedWebp(stickerBuffer)

		if (!modoAgregarAudio && !esVideo) {
			eliminarSesion(clave)
			await react('✅')
			if (reply) {
				return reply({
					sticker: stickerBuffer,
					mimetype: 'image/webp'
				})
			}
			return client.sendMessage(
				m.chat,
				{
					sticker: stickerBuffer,
					mimetype: 'image/webp'
				},
				{ quoted: m }
			)
		}

		if (modoAgregarAudio && !tieneAudioCitado) {
			await react('✅')
			return await iniciarSesionSticker({
				m,
				client,
				send,
				stickerBuffer,
				isAnimated: esAnimado,
				packname,
				author,
				usedPrefix,
				command
			})
		}

		if (modoAgregarAudio && tieneAudioCitado) {
			const audioBuffer = await descargarBuffer(
				citado,
				infoCitada,
				client
			)

			if (!audioBuffer || !audioBuffer.length) {
				throw new Error('No se pudo descargar el audio citado.')
			}

			const extension =
				/ogg|opus/i.test(infoCitada.mime)
					? 'ogg'
					: /mp4|m4a|aac/i.test(infoCitada.mime)
						? 'm4a'
						: 'mp3'

			const mensajeAudio = await crearMensajeAudio(
				client,
				audioBuffer,
				extension,
				infoCitada.seconds
			)

			await enviarStickerConAudio(
				client,
				m.chat,
				stickerBuffer,
				esAnimado,
				mensajeAudio,
				m
			)

			eliminarSesion(clave)

			await react('✅')

			return
		}

		if (esVideo) {
			try {
				const mensajeAudio = await crearMensajeAudio(
					client,
					datosVisuales,
					'mp4',
					duracionVideo
				)

				await enviarStickerConAudio(
					client,
					m.chat,
					stickerBuffer,
					true,
					mensajeAudio,
					m
				)

				eliminarSesion(clave)

				await react('✅')

				return
			} catch (error) {
				await react('❌')
				eliminarSesion(clave)

				if (reply) {
					return reply({
						sticker: stickerBuffer,
						mimetype: 'image/webp'
					})
				}

				return client.sendMessage(
					m.chat,
					{
						sticker: stickerBuffer,
						mimetype: 'image/webp'
					},
					{ quoted: m }
				)
			}
		}

		return await iniciarSesionSticker({
			m,
			client,
			send,
			stickerBuffer,
			isAnimated: esAnimado,
			packname,
			author,
			usedPrefix,
			command
		})
	} catch (error) {
		console.error('[ERROR AUDIO STICKER]', error)

		await react('❌')

		await send(
			`╭〔 ❌ *AUDIO STICKER* 〕⬣\n` +
			`┃ No se pudo procesar el archivo.\n` +
			`┃ ${error?.message || String(error)}\n` +
			`╰━━〔 ⚡ *AURA REED* 〕━━⬣`
		)
	}
}

export default {
	name: [
		'audiosticker',
		'stikeraudio',
		'stickeraudio',
		'figurinhasom',
		'saudio',
        "sa"
	],
	category: 'sticker',
	description: 'Crea stickers estáticos o GIF animados con sonido de hasta 25 segundos mediante un sistema de sesiones.',
	limit: true,
	async run(context: CommandContext) {
		const quotedMessage = context.msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
		const quotedContext = context.msg.message?.extendedTextMessage?.contextInfo
		const m = {
			chat: context.from,
			sender: context.sender,
			key: context.msg.key,
			pushName: context.msg.pushName,
			text: context.text,
			body: context.body,
			message: context.msg.message,
			quoted: quotedMessage
				? {
					key: {
						remoteJid: quotedContext?.remoteJid || context.from,
						id: quotedContext?.stanzaId,
						participant: quotedContext?.participant
					},
					message: quotedMessage
				}
				: null,
			conn: context.sock,
			fromMe: Boolean(context.msg.key?.fromMe)
		}

		return await handler(m, {
			sock: context.sock,
			db: context.db,
			text: context.text,
			reply: context.reply,
			react: context.react,
			usedPrefix: context.usedPrefix,
			command: context.cmdName
		})
	},
	async handleReply(context) {
		const clave = `${context.from}:${context.sender}`
		const sesion = sesiones.get(clave)

		if (!sesion || sesion.processing) return false

		if (Date.now() > sesion.expiresAt) {
			eliminarSesion(clave)
			return false
		}

		const textoMensaje = String(context.body || '').trim()
		if (/^[./!#]?(audiosticker|stikeraudio|stickeraudio|figurinhasom|saudio)\b/i.test(textoMensaje)) {
			return false
		}

		const quotedMessage = context.msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
		const quotedContext = context.msg.message?.extendedTextMessage?.contextInfo
		const citado = quotedMessage
			? {
				key: {
					remoteJid: quotedContext?.remoteJid || context.from,
					id: quotedContext?.stanzaId,
					participant: quotedContext?.participant
				},
				message: quotedMessage
			}
			: null
		const m = {
			chat: context.from,
			sender: context.sender,
			key: context.msg.key,
			pushName: context.msg.pushName,
			text: context.body,
			body: context.body,
			message: context.msg.message,
			quoted: citado,
			conn: context.sock,
			fromMe: Boolean(context.msg.key?.fromMe)
		}
		const infoPropia = detectarMedia(m)
		const infoCitada = detectarMedia(citado)
		const esAudioDirecto = infoPropia.kind === 'audio'
		const esRespuestaAudio = !textoMensaje && infoCitada.kind === 'audio'

		if (!esAudioDirecto && !esRespuestaAudio) return false

		const nodoAudio = esAudioDirecto ? m : citado
		const infoAudio = esAudioDirecto ? infoPropia : infoCitada

		await consumirSesionConAudio(
			m,
			context.sock,
			content => context.reply(content),
			emoji => context.react(emoji),
			sesion,
			nodoAudio,
			infoAudio
		)

		return true
	}
}