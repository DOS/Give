import { crc32, inflateRawSync } from "node:zlib"

/**
 * Safe unpacking of an uploaded XLSX (a ZIP archive) before any library
 * sees it. A spreadsheet reader that streams local headers trusts whatever
 * sizes they declare, so a small upload could inflate into gigabytes. Here
 * every entry is inflated with a hard cap on the bytes it may produce,
 * checked against the central directory (size and CRC), and the result is
 * rebuilt as a plain archive of stored (uncompressed) entries with exact
 * sizes, which is what the reader then gets.
 */

export class ZipError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "ZipError"
  }
}

/** All entries together, inflated. Statement XML is a few MB at most. */
export const MAX_INFLATED_BYTES = 32 * 1024 * 1024
const MAX_ENTRIES = 200

function u16(bytes: Uint8Array, at: number): number {
  if (at + 2 > bytes.length) throw new ZipError("truncated archive")
  return bytes[at] | (bytes[at + 1] << 8)
}

function u32(bytes: Uint8Array, at: number): number {
  if (at + 4 > bytes.length) throw new ZipError("truncated archive")
  return (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16)) + bytes[at + 3] * 0x1000000
}

/** True when the bytes start like a ZIP archive ("PK\x03\x04"). */
export function isZip(file: Uint8Array): boolean {
  return file.length >= 4 && file[0] === 0x50 && file[1] === 0x4b && file[2] === 0x03 && file[3] === 0x04
}

interface Entry {
  name: string
  data: Buffer
}

/** Only the parts a worksheet reader needs: XML and relationship files. */
function wanted(name: string): boolean {
  return name.endsWith(".xml") || name.endsWith(".rels")
}

/**
 * Reads the archive's XML entries, each inflated under the cap and checked
 * against the central directory. Throws ZipError on anything unexpected:
 * ZIP64, encryption, a method other than stored or deflate, a local header
 * that disagrees with the directory, a wrong size or CRC, or too much data.
 */
export function unzipXml(file: Uint8Array): Entry[] {
  let end = -1
  for (let i = file.length - 22; i >= Math.max(0, file.length - 22 - 0xffff); i--) {
    if (u32(file, i) === 0x06054b50) {
      end = i
      break
    }
  }
  if (end < 0) throw new ZipError("not a ZIP archive")
  const count = u16(file, end + 10)
  const size = u32(file, end + 12)
  const offset = u32(file, end + 16)
  if (count === 0xffff || size === 0xffffffff || offset === 0xffffffff) throw new ZipError("ZIP64 archive")
  if (count === 0 || count > MAX_ENTRIES || offset + size > end) throw new ZipError("unexpected archive layout")

  const entries: Entry[] = []
  const names = new Set<string>()
  let budget = MAX_INFLATED_BYTES
  let at = offset
  for (let n = 0; n < count; n++) {
    if (u32(file, at) !== 0x02014b50) throw new ZipError("broken central directory")
    const flags = u16(file, at + 8)
    const method = u16(file, at + 10)
    const crc = u32(file, at + 16)
    const packedSize = u32(file, at + 20)
    const fullSize = u32(file, at + 24)
    const nameLength = u16(file, at + 28)
    const extraLength = u16(file, at + 30)
    const commentLength = u16(file, at + 32)
    const local = u32(file, at + 42)
    const nameBytes = file.subarray(at + 46, at + 46 + nameLength)
    const name = Buffer.from(nameBytes).toString(flags & 0x0800 ? "utf8" : "latin1")
    at += 46 + nameLength + extraLength + commentLength
    if (at > end) throw new ZipError("broken central directory")
    if (flags & 0x0001) throw new ZipError("encrypted archive")
    if (!wanted(name)) continue
    if (names.has(name)) throw new ZipError("repeated entry")
    names.add(name)
    if (method !== 0 && method !== 8) throw new ZipError("unsupported compression")
    if (fullSize > budget) throw new ZipError("archive too large once inflated")

    // The local header must name the same entry; its data starts after it.
    if (u32(file, local) !== 0x04034b50) throw new ZipError("broken local header")
    const localNameLength = u16(file, local + 26)
    const localName = file.subarray(local + 30, local + 30 + localNameLength)
    if (Buffer.compare(Buffer.from(localName), Buffer.from(nameBytes)) !== 0) {
      throw new ZipError("local header disagrees with the directory")
    }
    const start = local + 30 + localNameLength + u16(file, local + 28)
    if (start + packedSize > offset) throw new ZipError("entry overlaps the directory")
    const packed = file.subarray(start, start + packedSize)

    let data: Buffer
    try {
      data =
        method === 0
          ? Buffer.from(packed)
          : inflateRawSync(packed, { maxOutputLength: Math.max(1, Math.min(budget, fullSize + 1)) })
    } catch {
      throw new ZipError("entry does not inflate within its declared size")
    }
    if (data.length !== fullSize || crc32(data) !== crc) throw new ZipError("entry size or CRC mismatch")
    budget -= data.length
    entries.push({ name, data })
  }
  return entries
}

/** A ZIP archive of stored (uncompressed) entries, every size exact, no data descriptors. */
export function storedZip(entries: readonly Entry[]): Buffer {
  const local: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const { name, data } of entries) {
    const nameBytes = Buffer.from(name, "utf8")
    const header = Buffer.alloc(30)
    header.writeUInt32LE(0x04034b50, 0)
    header.writeUInt16LE(20, 4)
    header.writeUInt16LE(0x0800, 6)
    header.writeUInt16LE(0, 8)
    header.writeUInt32LE(crc32(data), 14)
    header.writeUInt32LE(data.length, 18)
    header.writeUInt32LE(data.length, 22)
    header.writeUInt16LE(nameBytes.length, 26)
    local.push(header, nameBytes, data)
    const entry = Buffer.alloc(46)
    entry.writeUInt32LE(0x02014b50, 0)
    entry.writeUInt16LE(20, 4)
    entry.writeUInt16LE(20, 6)
    header.copy(entry, 8, 6, 30)
    entry.writeUInt32LE(offset, 42)
    central.push(entry, nameBytes)
    offset += 30 + nameBytes.length + data.length
  }
  const directory = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...local, directory, end])
}
