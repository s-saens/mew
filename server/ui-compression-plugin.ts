import { promisify } from 'node:util'
import { brotliCompress, constants, gzip } from 'node:zlib'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Plugin } from 'vite'

const brotli = promisify(brotliCompress)
const zip = promisify(gzip)

/** Prepare immutable UI text once at build time, keeping compression out of API request work. */
export function uiCompressionPlugin(): Plugin {
  return {
    name: 'mew-ui-compression',
    apply: 'build',
    enforce: 'post',
    // Vite rewrites preload/dependency placeholders in its own generateBundle hooks.
    // Read the final written bytes rather than compressing an intermediate chunk.
    async writeBundle(options, bundle) {
      const pending = Object.values(bundle).filter(item => /^assets\/.*\.(?:js|css|json|svg)$/.test(item.fileName))
      const worker = async () => {
        for (let item = pending.pop(); item; item = pending.pop()) {
          const filename = path.resolve(options.dir!, item.fileName)
          const source = await readFile(filename)
          if (source.byteLength < 1024) continue
          const results = await Promise.all([
            brotli(source, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } }),
            zip(source, { level: 6 }),
          ])
          for (const [index, suffix] of ['br', 'gz'].entries()) {
            if (results[index].byteLength < source.byteLength) {
              await writeFile(`${filename}.${suffix}`, results[index])
            }
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(4, pending.length) }, worker))
    },
  }
}
