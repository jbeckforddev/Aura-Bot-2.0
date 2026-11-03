import fs from 'fs'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

let handler = async (m, { conn }) => {
    let q = m.quoted ? m.quoted : m
    let mime = (q.msg || q).mimetype || q.mediaType || ''
    let fileName = (q.msg || q).fileName || ''

    if (!mime.includes('mp4') && !fileName.toLowerCase().endsWith('.mp4')) {
        return m.reply('Responde a un archivo .mp4 enviado como documento.')
    }

    await m.reply('Procesando y comprimiendo el video...')

    let tmpDir = './tmp'
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })

    let stamp = Date.now()
    let inputPath = path.join(tmpDir, `in_${stamp}.mp4`)
    let outputPath = path.join(tmpDir, `out_${stamp}.mp4`)

    try {
        let media = await q.download()
        await fs.promises.writeFile(inputPath, media)

        let ffmpegCmd = `ffmpeg -y -i "${inputPath}" -map 0:v:0 -map 0:a:0? -map_metadata -1 -map_chapters -1 -c:v libx264 -crf 24 -preset veryfast -pix_fmt yuv420p -vf "scale=trunc(iw/2)*2:trunc(ih/2)*2" -c:a aac -b:a 128k -movflags +faststart "${outputPath}"`

        await execAsync(ffmpegCmd)

        let videoBuffer = await fs.promises.readFile(outputPath)

        await conn.sendMessage(m.chat, {
            video: videoBuffer,
            mimetype: 'video/mp4'
        }, { quoted: m })

    } catch (err) {
        await m.reply('Ocurrió un error al comprimir el archivo .mp4.')
    } finally {
        if (fs.existsSync(inputPath)) await fs.promises.unlink(inputPath)
        if (fs.existsSync(outputPath)) await fs.promises.unlink(outputPath)
    }
}

handler.help = ['compress']
handler.tags = ['tools']
handler.command = /^(compress)$/i

export default handler
