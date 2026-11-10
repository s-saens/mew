(() => {
  'use strict';
  if (Object.prototype.hasOwnProperty.call(window, 'mewNative')) return;
  const connection = Object.freeze(__MEW_CONNECTION_JSON__);
  const documentToken = __MEW_DOCUMENT_TOKEN_JSON__;
  if (connection.kind === 'direct' && typeof globalThis.crypto?.randomUUID !== 'function' && typeof globalThis.crypto?.getRandomValues === 'function') {
    Object.defineProperty(globalThis.crypto, 'randomUUID', { configurable: true, value: () => {
      const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 15) | 64;
      bytes[8] = (bytes[8] & 63) | 128;
      const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    } });
  }
  const call = async (operation, args = {}) => {
    const result = await window.webkit.messageHandlers.mewNative.postMessage({ ...args, version: 1, operation, documentToken });
    if (!result || result.ok !== true) throw new Error(result?.error || 'Native operation failed');
    return result.value;
  };
  const host = Object.freeze({
    version: 1,
    connection,
    cache: Object.freeze({
      get: args => call('cache.get', args),
      put: args => call('cache.put', args),
      remove: args => call('cache.remove', args),
    }),
    direct: Object.freeze({
      fetch: args => call('http.fetch', args),
      cancel: args => call('http.cancel', args),
      openSocket: args => call('socket.open', args),
      sendSocket: args => call('socket.send', args),
      closeSocket: args => call('socket.close', args),
      reload: () => call('http.reload'),
    }),
    notifications: Object.freeze({
      permission: () => call('notifications.permission'),
      request: () => call('notifications.request'),
      show: args => call('notifications.show', args),
      close: args => call('notifications.close', args),
    }),
  });
  Object.defineProperty(window, 'mewNative', { value: host, enumerable: false, writable: false, configurable: false });
})();
