const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys')
const express = require('express')
const qrcode = require('qrcode-terminal')
const pino = require('pino')

const app = express()
app.use(express.json())

const GRUPO_ID = process.env.GRUPO_ID || ''
const PORT = process.env.PORT || 3000

let sock = null
let isConnected = false
let lastQR = null

async function connectWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info')

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: false,
    logger: pino({ level: 'silent' })
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      lastQR = qr
      console.log('QR generado - visitá /qr para verlo')
    }

    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
      isConnected = false
      if (shouldReconnect) connectWhatsApp()
    }

    if (connection === 'open') {
      console.log('✅ WhatsApp conectado correctamente')
      isConnected = true
      lastQR = null

      setTimeout(async () => {
        const groups = await sock.groupFetchAllParticipating()
        console.log('\n📋 TUS GRUPOS DE WHATSAPP:')
        Object.values(groups).forEach(g => {
          console.log(`Nombre: ${g.subject} | ID: ${g.id}`)
        })
      }, 3000)
    }
  })
}

app.get('/qr', (req, res) => {
  if (isConnected) {
    return res.send('<h2>✅ WhatsApp ya está conectado</h2>')
  }
  if (!lastQR) {
    return res.send('<h2>⏳ Generando QR... Recargá la página en 5 segundos</h2><script>setTimeout(()=>location.reload(),5000)</script>')
  }

  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(lastQR)}`
  res.send(`
    <html>
      <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;background:#111;color:white;">
        <h2>📱 Escaneá este QR con WhatsApp</h2>
        <img src="${qrImageUrl}" style="border:10px solid white;border-radius:12px;" />
        <p>WhatsApp → Dispositivos vinculados → Vincular dispositivo</p>
        <script>setTimeout(()=>location.reload(),30000)</script>
      </body>
    </html>
  `)
})

app.post('/webhook', async (req, res) => {
  try {
    if (!isConnected) {
      return res.status(503).json({ error: 'WhatsApp no conectado aún' })
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
    res.json({ success: true, mensaje })

  } catch (error) {
    console.error('Error enviando mensaje:', error)
    res.status(500).json({ error: error.message })
  }
})

app.get('/', (req, res) => {
  res.json({ 
    status: isConnected ? '✅ WhatsApp conectado' : '⏳ Esperando conexión',
    qr: isConnected ? null : 'Visitá /qr para escanear'
  })
})

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`)
  connectWhatsApp()
})
