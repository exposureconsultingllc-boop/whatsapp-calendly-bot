const { Client, LocalAuth } = require('whatsapp-web.js')
const express = require('express')
const qrcode = require('qrcode')

const app = express()
app.use(express.json())

const PORT = process.env.PORT || 3000
const GRUPO_ID = process.env.GRUPO_ID || ''

let lastQR = null
let isConnected = false

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
})

client.on('qr', async (qr) => {
  console.log('QR generado')
  lastQR = await qrcode.toDataURL(qr)
})

client.on('ready', async () => {
  console.log('✅ WhatsApp conectado')
  isConnected = true
  lastQR = null

  const chats = await client.getChats()
  chats.forEach(chat => {
    if (chat.isGroup) {
      console.log(`Grupo: ${chat.name} | ID: ${chat.id._serialized}`)
    }
  })
})

client.on('disconnected', () => {
  console.log('WhatsApp desconectado')
  isConnected = false
})

app.get('/qr', async (req, res) => {
  if (isConnected) {
    return res.send('<h2>✅ WhatsApp ya está conectado</h2>')
  }
  if (!lastQR) {
    return res.send('<h2>⏳ Generando QR... Recargá en 10 segundos</h2><script>setTimeout(()=>location.reload(),10000)</script>')
  }
  res.send(`
    <html>
      <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;background:#111;color:white;">
        <h2>📱 Escaneá este QR con WhatsApp</h2>
        <img src="${lastQR}" style="border:10px solid white;border-radius:12px;width:300px;" />
        <p>WhatsApp → Dispositivos vinculados → Vincular dispositivo</p>
        <script>setTimeout(()=>location.reload(),30000)</script>
      </body>
    </html>
  `)
})

app.post('/webhook', async (req, res) => {
  try {
    if (!isConnected) {
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

    await client.sendMessage(GRUPO_ID, mensaje)

    console.log('✅ Mensaje enviado')
    res.json({ success: true })

  } catch (error) {
    console.error('Error:', error)
    res.status(500).json({ error: error.message })
  }
})

app.get('/', (req, res) => {
  res.json({ status: isConnected ? '✅ Conectado' : '⏳ Esperando conexión' })
})

app.listen(PORT, () => {
  console.log(`🚀 Servidor en puerto ${PORT}`)
  client.initialize()
})
