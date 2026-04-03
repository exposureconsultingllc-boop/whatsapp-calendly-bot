const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys')
const express = require('express')
const QRCode = require('qrcode')
const pino = require('pino')
const fs = require('fs')

const app = express()
app.use(express.json())

const PORT = process.env.PORT || 3000
const GRUPO_ID = process.env.GRUPO_ID || ''

let lastQR = null
let isConnected = false
let sock = null

async function connectWhatsApp() {
  const { version } = await fetchLatestBaileysVersion()
  const { state, saveCreds } = await useMultiFileAuthState('/tmp/auth_info')

  sock = makeWASocket({
    version,
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    browser: ['WhatsApp Bot', 'Chrome', '1.0.0']
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log('QR generado correctamente')
      lastQR = await QRCode.toDataURL(qr)
    }

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode
      const shouldReconnect = code !== DisconnectReason.loggedOut
      console.log('Conexión cerrada, código:', code, '- Reconectando:', shouldReconnect)
      isConnected = false
      lastQR = null
      if (shouldReconnect) {
        setTimeout(connectWhatsApp, 3000)
      }
    }

    if (connection === 'open') {
      console.log('✅ WhatsApp conectado')
      isConnected = true
      lastQR = null

      setTimeout(async () => {
        try {
          const groups = await sock.groupFetchAllParticipating()
          console.log('📋 TUS GRUPOS:')
          Object.values(groups).forEach(g => {
            console.log(`- ${g.subject} | ID: ${g.id}`)
          })
        } catch (e) {
          console.log('Error obteniendo grupos:', e.message)
        }
      }, 3000)
    }
  })
}

app.get('/qr', async (req, res) => {
  if (isConnected) {
    return res.send('<h2 style="font-family:sans-serif">✅ WhatsApp ya está conectado</h2>')
  }
  if (!lastQR) {
    return res.send(`
      <h2 style="font-family:sans-serif">⏳ Generando QR... Recargá en 10 segundos</h2>
      <script>setTimeout(()=>location.reload(), 10000)</script>
    `)
  }
  res.send(`
    <html>
      <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:sans-serif;background:#111;color:white;margin:0;">
        <h2>📱 Escaneá este QR con WhatsApp</h2>
        <img src="${lastQR}" style="border:10px solid white;border-radius:12px;width:280px;" />
        <p>WhatsApp → Dispositivos vinculados → Vincular dispositivo</p>
        <p style="color:#aaa;font-size:13px">Se recarga automáticamente cada 30 segundos</p>
        <script>setTimeout(()=>location.reload(), 30000)</script>
      </body>
    </html>
  `)
})

app.post('/webhook', async (req, res) => {
  try {
    if (!isConnected || !sock) {
      return res.status(503).json({ error: 'WhatsApp no conectado' })
    }
    const data = req.body
    const mensaje = `📊 EOD: ${data.fecha || '-'}
🔢 Nombre: ${data.nombre || '-'}
🆕 Apellido: ${data.apellido || '-'}
⛔ Instagram: ${data.pregunta1 || '-'}
📚 Situación Actual: ${data.pregunta2 || '-'}
📅 Ingreso Mensual: ${data.pregunta4 || '-'}
📞 Objetivo Mensual: ${data.pregunta5 || '-'}
✅ Urgencia: ${data.pregunta6 || '-'}
⏳ Inversión disponible: ${data.pregunta8 || '-'}
✅ Número de Celular: ${data.pregunta10 || '-'}`

    await sock.sendMessage(GRUPO_ID, { text: mensaje })
    console.log('✅ Mensaje enviado al grupo')
    res.json({ success: true })
  } catch (error) {
    console.error('Error:', error.message)
    res.status(500).json({ error: error.message })
  }
})

app.get('/', (req, res) => {
  res.json({
    status: isConnected ? '✅ Conectado' : '⏳ Esperando conexión',
    qr_url: '/qr'
  })
})

app.listen(PORT, () => {
  console.log(`🚀 Servidor en puerto ${PORT}`)
  connectWhatsApp()
})
