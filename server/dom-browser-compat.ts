/** Restore reflected link URLs before rrweb matches them against CSSStyleSheet.href. */
export const DOM_BROWSER_COMPAT_SCRIPT = `(() => {
  const prototype = HTMLLinkElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'href');
  if (!descriptor?.get || !descriptor.configurable) return;
  const originalGet = descriptor.get;
  Object.defineProperty(prototype, 'href', {
    ...descriptor,
    get() {
      const value = originalGet.call(this);
      if (!this.hasAttribute('href')) return value;
      try { return new URL(value, this.ownerDocument.baseURI).href; }
      catch { return value; }
    },
  });
})();`
