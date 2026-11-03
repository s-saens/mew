self.addEventListener('install', event => {
  event.waitUntil(self.skipWaiting())
})

self.addEventListener('message', event => {
  if (event.origin !== self.location.origin || event.data?.type !== 'mew-notification-client' || event.data.protocol !== 1) return
  if (event.source?.type !== 'window' || typeof event.source.id !== 'string' || !event.source.id || !Array.isArray(event.ports) || event.ports.length !== 1) return
  const source = event.source, port = event.ports[0]
  if (typeof port?.postMessage !== 'function' || typeof port.close !== 'function') return
  event.waitUntil((async () => {
    try {
      if (new URL(source.url).origin !== self.location.origin) return
      const client = await self.clients.get(source.id)
      if (client?.type !== 'window' || client.id !== source.id || new URL(client.url).origin !== self.location.origin) return
      port.postMessage({ type: 'mew-notification-client', protocol: 1, clientId: client.id })
    } catch { /* A window can disappear during the handshake. */ }
    finally { port.close() }
  })())
})

self.addEventListener('notificationclick', event => {
  event.notification.close()
  const data = event.notification.data
  if (data?.protocol !== 'mew-notification-v1' || typeof data.id !== 'string' || !data.id || typeof data.clientId !== 'string' || !data.clientId) return
  if (event.notification.tag !== data.id) return
  event.waitUntil((async () => {
    try {
      const client = await self.clients.get(data.clientId)
      if (client?.type !== 'window' || client.id !== data.clientId || new URL(client.url).origin !== self.location.origin) return
      await client.focus()
      client.postMessage({ type: 'mew-notification-click', id: data.id })
    } catch { /* No other tab is opened when the owning window has gone away. */ }
  })())
})
