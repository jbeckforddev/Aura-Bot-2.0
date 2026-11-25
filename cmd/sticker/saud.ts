import {
	prepareWAMessageMedia,
	proto,
	extractMessageContent,
	generateWAMessageFromContent,
	downloadMediaMessage,
	downloadContentFromMessage
} from 'baileys'

import { randomBytes } from 'node:crypto'
import type { WAMessage } from 'baileys'
import type { CommandContext, ExtendedWASocket, ReplyContext } from '../../types/index.d.ts'
import type {
	AudioStickerCommandMessage,
	AudioStickerCommandOptions,
	AudioStickerMedia,
	AudioStickerMediaInfo,
	AudioStickerMediaNode,
	AudioStickerSession,
	AudioStickerSessionOptions,
	StickerWithAudio
} from '../../types/media.d.ts'
import {
	applyStickerMetadata,
	isAnimatedWebp,
	isWebp,
	toSticker
} from '../../core/stickerUtils.ts'
import { CONVERT_AUDIO_TO_OGG } from '../../utils/converter.ts'

const DURACION_MAXIMA = 25
const SEGUNDOS_SESION = 60

const sesiones = (globalThis.__audioStickerSessions ??= new Map<string, AudioStickerSession>())

function modificarProto(p: typeof proto) {
	const M: typeof proto.Message & { __audioStickerPatchedV3?: boolean } = p.Message
	if (!M || M.__audioStickerPatchedV3) return

	if (M.StickerMessage) {
		const codificarStickerAnterior = M.StickerMessage.encode

		M.StickerMessage.encode = function (mensaje, writer) {
			const sticker: StickerWithAudio = mensaje
			const audio = sticker.audioMessage

			if (audio && Object.prototype.hasOwnProperty.call(mensaje, 'audioMessage')) {
				delete sticker.audioMessage
			}

			const w = codificarStickerAnterior.call(this, mensaje, writer)

			if (audio && M.AudioMessage) {
				sticker.audioMessage = audio
				M.AudioMessage.encode(audio, w.uint32(210).fork()).ldelim()
			}

			return w
		}

		if (typeof M.StickerMessage.fromObject === 'function') {
			const convertirStickerAnterior = M.StickerMessage.fromObject

			M.StickerMessage.fromObject = function (objeto) {
				const mensaje: StickerWithAudio & proto.Message.StickerMessage = convertirStickerAnterior.call(this, objeto)

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

function obtenerClaveSesion(m: AudioStickerCommandMessage) {
	return `${m.chat}:${m.sender}`
}

function eliminarSesion(clave: string) {
	const existente = sesiones.get(clave)

	if (existente?.timer) {
		clearTimeout(existente.timer)
	}

	sesiones.delete(clave)
}

function desenvolverMensaje(raw: proto.IMessage): proto.IMessage {
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
			(actual.audioStickerMessage as proto.IMessage | undefined)

		if (!siguiente) break
		actual = siguiente
	}

	return actual || {}
}

function detectarMedia(nodo: AudioStickerMediaNode | null | undefined): AudioStickerMediaInfo {
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

	const candidato = contenedor[tipo as keyof proto.IMessage]
	const mediaObj: AudioStickerMedia | null =
		mensajeDirecto ||
		(candidato && typeof candidato === 'object' ? candidato as AudioStickerMedia : null) ||
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
	nodo: AudioStickerMediaNode | null | undefined,
	info: AudioStickerMediaInfo,
	cliente: ExtendedWASocket
): Promise<Buffer | null> {
	if (!nodo) return null

	if (
		info?.mediaObj &&
		info?.dlType &&
		(info.mediaObj.mediaKey || info.mediaObj.directPath || info.mediaObj.url)
	) {
		try {
			const flujo = await downloadContentFromMessage(info.mediaObj, info.dlType)
			const fragmentos: Buffer[] = []

			for await (const fragmento of flujo) {
				fragmentos.push(fragmento)
			}

			const buffer = Buffer.concat(fragmentos)

			if (buffer.length) return buffer
		} catch {}
	}

	if (nodo.fakeObj?.message || nodo.message) {
		try {
			const origen = nodo.fakeObj?.message ? nodo.fakeObj : nodo
			const objetoMensaje: WAMessage = {
				...origen,
				key: origen.key ?? nodo.key ?? { remoteJid: nodo.chat, id: '0' }
			}

			const buffer = await downloadMediaMessage(
				objetoMensaje,
				'buffer',
				{},
				{
					logger: cliente.logger,
					reuploadRequest: (message) => cliente.updateMediaMessage(message)
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
					logger: cliente.logger,
					reuploadRequest: (message) => cliente.updateMediaMessage(message)
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

function generarFormaDeOnda(bufferBase: Buffer, longitud = 64) {
	const forma = Buffer.alloc(longitud)

	for (let i = 0; i < longitud; i++) {
		const byte = bufferBase && bufferBase.length
			? bufferBase[(i * 19 + 7) % bufferBase.length]
			: i * 11

		forma[i] = 18 + (byte % 76)
	}

	return forma
}

async function crearMensajeAudio(cliente: ExtendedWASocket, buffer: Buffer, segundosAlternativos = 0) {
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

	if (!audioMessage) throw new Error('No se generó el mensaje de audio.')

	audioMessage.seconds = segundosFinales
	audioMessage.ptt = true
	audioMessage.mimetype = 'audio/ogg; codecs=opus'

	if (!audioMessage.waveform || !audioMessage.waveform.length) {
		audioMessage.waveform = generarFormaDeOnda(oggBuffer)
	}

	return audioMessage
}

async function enviarStickerConAudio(
	cliente: ExtendedWASocket,
	chat: string,
	bufferSticker: Buffer,
	animado: boolean,
	mensajeAudio: proto.Message.IAudioMessage,
	quoted: WAMessage
) {
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

	const sticker: StickerWithAudio | null | undefined = preparado.stickerMessage
	if (!sticker) throw new Error('No se generó el sticker.')
	sticker.isAnimated = animado
	sticker.audioMessage = mensajeAudio

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

	if (!mensajeGenerado.message) throw new Error('No se generó el mensaje del sticker.')
	await cliente.relayMessage(chat, mensajeGenerado.message, {
		messageId: mensajeGenerado.key.id ?? undefined
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
}: AudioStickerSessionOptions) {
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

async function consumirSesionConAudio(
	m: AudioStickerCommandMessage,
	client: ExtendedWASocket,
	send: CommandContext['reply'],
	react: CommandContext['react'],
	session: AudioStickerSession,
	audioNode: AudioStickerMediaNode | null | undefined,
	audioInfo: AudioStickerMediaInfo
) {
	const clave = obtenerClaveSesion(m)

	session.processing = true

	await react('⏳')

	try {
		const audioBuffer = await descargarBuffer(audioNode, audioInfo, client)

		if (!audioBuffer || !audioBuffer.length) {
			throw new Error('No se pudo descargar el archivo de audio o video.')
		}

		const mensajeAudio = await crearMensajeAudio(
			client,
			audioBuffer,
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
			`❌ No se pudo combinar el audio con el sticker: ${error instanceof Error ? error.message : String(error)}`
		)
	}
}

const handler = async (m: AudioStickerCommandMessage, options: AudioStickerCommandOptions) => {
	const { sock: client, text, reply: send, db, command, react } = options
	const usedPrefix = options.usedPrefix ?? '.'

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

		const usuario = db.getUser(m.sender)

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
			return send({
				sticker: stickerBuffer,
				mimetype: 'image/webp'
			})
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

			const mensajeAudio = await crearMensajeAudio(
				client,
				audioBuffer,
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

				return send({
					sticker: stickerBuffer,
					mimetype: 'image/webp'
				})
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
			`┃ ${error instanceof Error ? error.message : String(error)}\n` +
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
	premiumOnly: true,
	async run(context: CommandContext) {
		const quotedMessage = context.msg.message?.extendedTextMessage?.contextInfo?.quotedMessage
		const quotedContext = context.msg.message?.extendedTextMessage?.contextInfo
		const m: AudioStickerCommandMessage = {
			chat: context.from,
			sender: context.sender,
			key: context.msg.key,
			pushName: context.msg.pushName,
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
	async handleReply(context: ReplyContext) {
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
		const m: AudioStickerCommandMessage = {
			chat: context.from,
			sender: context.sender,
			key: context.msg.key,
			pushName: context.msg.pushName,
			message: context.msg.message,
			quoted: citado,
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
