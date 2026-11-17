const net = require('node:net')
const url = process.argv[2]
if (!url || process.argv.length !== 3 || !process.env.MEW_TERMINAL_BROWSER_SOCKET) {
  console.error('Mew browser: an HTTP(S) URL and active terminal are required')
  process.exit(1)
}
const socket = net.createConnection(process.env.MEW_TERMINAL_BROWSER_SOCKET)
let result = ''
socket.setTimeout(5000, () => socket.destroy(new Error('request timed out')))
socket.on('connect', () => socket.end(JSON.stringify({ url }) + '\n'))
socket.on('data', chunk => { result += chunk.toString() })
socket.on('end', () => { if (result !== 'ok\n') { console.error('Mew browser: no authorized terminal viewer is available or URL is invalid'); process.exitCode = 1 } })
socket.on('error', error => { console.error(`Mew browser: ${error.message}`); process.exitCode = 1 })
