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

async function connectWhatsApp() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info')

  sock = makeWASocket({
    auth: state,
    printQRInTerminal: true,
    logger: pino({ level: 'silent' })
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log('\n📱 ESCANEA ESTE QR CON WHATSAPP:\n')
      qrcode.generate(qr, { small: true })
    }

    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut
      console.log('Conexión cerrada. Reconectando:', shouldReconnect)
      isConnected = false
      if (shouldReconnect) connectWhatsApp()
    }

    if (connection === 'open') {
      console.log('✅ WhatsApp conectado correctamente')
      isConnected = true

      setTimeout(async () => {
        const groups = await sock.groupFetchAllParticipating()
        console.log('\n📋 TUS GRUPOS DE WHATSAPP:')
        Object.values(groups).forEach(g => {
          console.log(`Nombre: ${g.subject} | ID: ${g.id}`)
        })
        console.log('\nCopia el ID del grupo de ventas y ponelo en la variable GRUPO_ID\n')
      }, 3000)
    }
  })
}

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
    mensaje: 'Bot de WhatsApp - Calendly activo'
  })
})

app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en puerto ${PORT}`)
  connectWhatsApp()
})
