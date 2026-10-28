import { parse, type Node } from 'acorn'
import { analyze } from 'eslint-scope'

const browserGlobals = new Set(['window', 'self', 'globalThis', 'document', 'location'])

/** Only unresolved browser references are changed; bindings and property names stay intact. */
export function rewritePreviewLocation(source: string): string {
  if (!/\b(?:window|self|globalThis|document|location)\b/.test(source)) return source
  try {
    let ast: ReturnType<typeof parse>
    try { ast = parse(source, { ecmaVersion: 'latest', sourceType: 'module', ranges: true }) }
    catch { ast = parse(source, { ecmaVersion: 'latest', sourceType: 'script', ranges: true, allowReturnOutsideFunction: true }) }
    const scopes = analyze(ast as unknown as Parameters<typeof analyze>[0], { ecmaVersion: 2025, sourceType: ast.sourceType, optimistic: true, ignoreEval: true })
    const shorthand = new Set<number>()
    const constructors = new Set<number>()
    const parents = new Map<Node, Node>()
    const property = (node: Node & Record<string, unknown>) => {
      const key = node.property as Node & { name?: string; value?: unknown }
      return node.computed ? key.type === 'Literal' ? key.value : null : key.name
    }
    const visit = (node: Node) => {
      const fields = node as Node & Record<string, unknown>
      if (node.type === 'Property' && fields.shorthand) shorthand.add((fields.value as Node).start)
      if (node.type === 'NewExpression') {
        let callee = fields.callee as Node & Record<string, unknown>
        while (callee.type === 'MemberExpression') callee = callee.object as typeof callee
        if (callee.type === 'Identifier') constructors.add(callee.start)
      }
      for (const value of Object.values(fields)) {
        if (Array.isArray(value)) {
          for (const child of value) if (child && typeof child === 'object' && typeof child.type === 'string') { parents.set(child, node); visit(child) }
        } else if (value && typeof value === 'object' && 'type' in value && typeof value.type === 'string') { parents.set(value as Node, node); visit(value as Node) }
      }
    }
    visit(ast)
    const edits = new Map<number, { end: number; text: string }>()
    for (const reference of scopes.globalScope?.through ?? []) {
      const { name, range } = reference.identifier
      if (!browserGlobals.has(name) || !range) continue
      const root = ['globalThis', 'window', 'self'].find(candidate => {
        for (let scope: typeof reference.from | null = reference.from; scope; scope = scope.upper) if (scope.set.has(candidate)) return false
        return true
      })
      if (!root) continue
      // Starting with an identifier preserves ASI after `const items = []`.
      const virtualGlobal = `${root}.Object(${root}.__MEW_PORT_PREVIEW_GLOBAL__||${root})`
      let end = range[1]
      let replacement = name === 'globalThis' ? virtualGlobal : `${virtualGlobal}.${name}`
      const parent = parents.get(reference.identifier as unknown as Node) as (Node & Record<string, unknown>) | undefined
      if (name === 'document') {
        // Keep the native Document for DOM brand checks and identity comparisons.
        if (parent?.type !== 'MemberExpression' || parent.object !== reference.identifier || !['location', 'defaultView'].includes(String(property(parent)))) continue
        replacement = `${virtualGlobal}.${property(parent) === 'location' ? 'location' : 'window'}`
        end = parent.end
      } else if (parent?.type === 'MemberExpression' && parent.object === reference.identifier && property(parent) === 'document') {
        const outer = parents.get(parent) as (Node & Record<string, unknown>) | undefined
        if (outer?.type === 'MemberExpression' && outer.object === parent && property(outer) === 'location') {
          replacement = `${virtualGlobal}.location`
          end = outer.end
        }
      }
      if (constructors.has(range[0])) replacement = `(${replacement})`
      edits.set(range[0], { end, text: shorthand.has(range[0]) ? `${name}:${replacement}` : replacement })
    }
    for (const [start, edit] of [...edits].sort((a, b) => b[0] - a[0])) source = source.slice(0, start) + edit.text + source.slice(edit.end)
    return source
  } catch { return source }
}

// Kept separate from the application's rewritten scripts: these references must stay native.
export const previewLocationRuntime = String.raw`
const nativeWindow = window, nativeLocation = location;
const basePath = c.basePath;
const current = () => {
  const url = new URL(c.virtualUrl);
  if (nativeLocation.pathname.startsWith(basePath + '/')) {
    url.pathname = nativeLocation.pathname.slice(basePath.length);
    url.search = nativeLocation.search;
  }
  url.hash = nativeLocation.hash;
  return url;
};
const destination = value => {
  const url = new URL(String(value), current());
  if (url.origin !== new URL(c.virtualUrl).origin) throw new DOMException('Cross-origin preview URL', 'SecurityError');
  return basePath + url.pathname + url.search + url.hash;
};
const virtualLocation = {
  assign(value) { nativeLocation.assign(destination(value)); },
  replace(value) { nativeLocation.replace(destination(value)); },
  reload() { nativeLocation.reload(); },
  toString() { return current().href; },
  valueOf() { return current().href; },
  [Symbol.toPrimitive]() { return current().href; }
};
for (const key of ['href', 'origin', 'protocol', 'host', 'hostname', 'port', 'pathname', 'search', 'hash']) {
  Object.defineProperty(virtualLocation, key, {
    enumerable: true,
    get() { return current()[key]; },
    set(value) {
      if (key === 'origin') return;
      const url = current();
      url[key] = String(value);
      nativeLocation.href = destination(url);
    }
  });
}
const bindings = new WeakMap();
const bound = (value, owner) => {
  if (typeof value !== 'function' || value.prototype) return value;
  let methods = bindings.get(owner);
  if (!methods) { methods = new WeakMap(); bindings.set(owner, methods); }
  let binding = methods.get(value);
  if (!binding) { binding = value.bind(owner); methods.set(value, binding); }
  return binding;
};
let virtualWindow;
const facade = (owner, read) => new Proxy(Object.create(null), {
  get(target, key) {
    const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
    if (descriptor && !descriptor.configurable) {
      if ('value' in descriptor && !descriptor.writable) return descriptor.value;
      if ('get' in descriptor && !descriptor.get) return undefined;
    }
    return read(key);
  },
  set(target, key, value) {
    if (key === 'location') { virtualLocation.assign(value); return true; }
    const result = Reflect.set(owner, key, value, owner);
    if (result && Reflect.has(target, key)) Reflect.defineProperty(target, key, Reflect.getOwnPropertyDescriptor(owner, key));
    return result;
  },
  has(_target, key) { return key in owner; },
  ownKeys(target) { return [...new Set([...Reflect.ownKeys(owner), ...Reflect.ownKeys(target)])]; },
  getOwnPropertyDescriptor(target, key) {
    const fixed = Reflect.getOwnPropertyDescriptor(target, key);
    if (fixed) return fixed;
    const descriptor = Reflect.getOwnPropertyDescriptor(owner, key);
    return descriptor ? { configurable: true, enumerable: descriptor.enumerable, writable: 'writable' in descriptor ? descriptor.writable : !!descriptor.set, value: read(key) } : undefined;
  },
  defineProperty(target, key, descriptor) {
    if (!Reflect.defineProperty(owner, key, descriptor)) return false;
    const actual = Reflect.getOwnPropertyDescriptor(owner, key);
    if (!actual.configurable || Reflect.has(target, key)) return Reflect.defineProperty(target, key, actual);
    return true;
  },
  deleteProperty(target, key) {
    return Reflect.deleteProperty(owner, key) && Reflect.deleteProperty(target, key);
  },
  preventExtensions() { return false; },
  getPrototypeOf() { return Reflect.getPrototypeOf(owner); }
});
virtualWindow = facade(nativeWindow, key => {
  if (key === 'location') return virtualLocation;
  const value = Reflect.get(nativeWindow, key, nativeWindow);
  if (value === nativeWindow) return virtualWindow;
  return bound(value, nativeWindow);
});
const defaultView = Object.getOwnPropertyDescriptor(Document.prototype, 'defaultView');
if (defaultView?.get && defaultView.configurable) Object.defineProperty(Document.prototype, 'defaultView', {
  ...defaultView,
  get() { const value = defaultView.get.call(this); return value === nativeWindow ? virtualWindow : value; }
});
Object.defineProperty(globalThis, '__MEW_PORT_PREVIEW_GLOBAL__', { value: virtualWindow });
const sync = () => { globalThis.__mewBrowserVirtualUrl = current().href; };
sync();
addEventListener('popstate', sync);
addEventListener('hashchange', sync);
`
