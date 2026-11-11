import fs from 'node:fs'
import { Readable } from 'node:stream'

const MAX_BYTES = 512 * 1024 * 1024
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
  return value >>> 0
})

interface ArchiveFile { path: string; name: string; size: number; fingerprint: string }

export function artifactFingerprint(stat: fs.Stats): string {
  return `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`
}

/** ZIP store entries are streamed, with checksums and sizes written in data descriptors. */
export function projectActionArchive(files: ArchiveFile[], validate: (relative: string) => string): Readable {
  async function* generate() {
    const central: Buffer[] = []
    let offset = 0, total = 0
    for (const file of files) {
      const name = Buffer.from(file.name, 'utf8')
      const local = Buffer.alloc(30)
      local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0808, 6)
      local.writeUInt16LE(name.length, 26)
      const localOffset = offset
      offset += local.length + name.length
      // Validate every path again immediately before opening; do not follow the final link.
      const fd = fs.openSync(validate(file.path), fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0))
      let stream: fs.ReadStream | undefined
      try {
        const stat = fs.fstatSync(fd)
        if (!stat.isFile() || stat.size !== file.size || artifactFingerprint(stat) !== file.fingerprint || total + stat.size > MAX_BYTES) throw new Error('Archive output changed or exceeds the permitted size')
        stream = fs.createReadStream('', { fd, autoClose: true })
        yield local; yield name
        let crc = 0xffffffff, size = 0
        for await (const value of stream) {
          const chunk = value as Buffer
          size += chunk.length; total += chunk.length
          if (total > MAX_BYTES || size > file.size) throw new Error('Archive output changed or exceeds the permitted size')
          for (const byte of chunk) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
          offset += chunk.length
          yield chunk
        }
        if (size !== file.size) throw new Error('Archive output changed while reading')
        crc = (crc ^ 0xffffffff) >>> 0
        const descriptor = Buffer.alloc(16)
        descriptor.writeUInt32LE(0x08074b50, 0); descriptor.writeUInt32LE(crc, 4); descriptor.writeUInt32LE(size, 8); descriptor.writeUInt32LE(size, 12)
        offset += descriptor.length
        yield descriptor
        const entry = Buffer.alloc(46)
        entry.writeUInt32LE(0x02014b50, 0); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(0x0808, 8)
        entry.writeUInt32LE(crc, 16); entry.writeUInt32LE(size, 20); entry.writeUInt32LE(size, 24)
        entry.writeUInt16LE(name.length, 28); entry.writeUInt32LE(localOffset, 42)
        central.push(entry, name)
      } finally {
        if (stream) stream.destroy()
        else fs.closeSync(fd)
      }
    }
    const centralOffset = offset
    for (const buffer of central) { offset += buffer.length; yield buffer }
    const end = Buffer.alloc(22)
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10)
    end.writeUInt32LE(offset - centralOffset, 12); end.writeUInt32LE(centralOffset, 16)
    yield end
  }
  return Readable.from(generate(), { highWaterMark: 64 * 1024 })
}
