import { crc32, deflateRawSync } from "node:zlib"

import { describe, expect, it } from "vitest"

import { xlsxFile } from "@/test/xlsx-file"

import { MAX_INFLATED_BYTES, storedZip, unzipXml, ZipError } from "./zip"

interface Part {
  name: string
  data: Buffer
  /** Overrides of what the headers declare. */
  declaredSize?: number
  localName?: string
  localFlags?: number
  flags?: number
  crc?: number
  packedOverride?: Buffer
}

/** A one-off archive whose headers can lie, as an attacker's would. */
function archive(parts: Part[]): Uint8Array {
  const local: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const part of parts) {
    const packed = part.packedOverride ?? deflateRawSync(part.data)
    const name = Buffer.from(part.name)
    const localName = Buffer.from(part.localName ?? part.name)
    const crc = part.crc ?? crc32(part.data)
    const size = part.declaredSize ?? part.data.length
    const head = Buffer.alloc(30)
    head.writeUInt32LE(0x04034b50, 0)
    head.writeUInt16LE(20, 4)
    head.writeUInt16LE(part.localFlags ?? 0, 6)
    head.writeUInt16LE(8, 8)
    // A data-descriptor style local header declares nothing.
    head.writeUInt32LE(part.localFlags === 0x08 ? 0 : crc, 14)
    head.writeUInt32LE(part.localFlags === 0x08 ? 0 : packed.length, 18)
    head.writeUInt32LE(part.localFlags === 0x08 ? 0 : size, 22)
    head.writeUInt16LE(localName.length, 26)
    local.push(head, localName, packed)
    const entry = Buffer.alloc(46)
    entry.writeUInt32LE(0x02014b50, 0)
    entry.writeUInt16LE(20, 4)
    entry.writeUInt16LE(20, 6)
    entry.writeUInt16LE(part.flags ?? 0, 8)
    entry.writeUInt16LE(8, 10)
    entry.writeUInt32LE(crc, 16)
    entry.writeUInt32LE(packed.length, 20)
    entry.writeUInt32LE(size, 24)
    entry.writeUInt16LE(name.length, 28)
    entry.writeUInt32LE(offset, 42)
    central.push(entry, name)
    offset += 30 + localName.length + packed.length
  }
  const directory = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(parts.length, 8)
  end.writeUInt16LE(parts.length, 10)
  end.writeUInt32LE(directory.length, 12)
  end.writeUInt32LE(offset, 16)
  return new Uint8Array(Buffer.concat([...local, directory, end]))
}

const XML = Buffer.from("<a>hello</a>")

describe("unzipXml", () => {
  it("reads the XML entries of a workbook and skips the rest", () => {
    const entries = unzipXml(
      archive([
        { name: "xl/a.xml", data: XML },
        { name: "xl/media/x.png", data: XML },
      ])
    )
    expect(entries.map((e) => [e.name, e.data.toString()])).toEqual([["xl/a.xml", "<a>hello</a>"]])
  })

  it("rebuilds an archive the reader can read", () => {
    const entries = unzipXml(xlsxFile([["a"]]))
    expect(unzipXml(storedZip(entries)).map((e) => e.name)).toEqual(entries.map((e) => e.name))
  })

  it("stops inflating at the declared size: a bomb behind a data descriptor", () => {
    // 40 MB of zeros, declared as 100 bytes, with a local header that declares nothing.
    const bomb = Buffer.alloc(40 * 1024 * 1024)
    const file = archive([
      { name: "xl/worksheets/sheet1.xml", data: bomb, declaredSize: 100, localFlags: 0x08, crc: 0 },
    ])
    expect(() => unzipXml(file)).toThrow("does not inflate within its declared size")
  })

  it("refuses an archive that declares more than the inflate budget", () => {
    const file = archive([{ name: "xl/a.xml", data: XML, declaredSize: MAX_INFLATED_BYTES + 1 }])
    expect(() => unzipXml(file)).toThrow("too large once inflated")
  })

  it("counts every entry against one budget", () => {
    const zeros = Buffer.alloc(Math.floor(MAX_INFLATED_BYTES / 2) + 1)
    const file = archive([
      { name: "xl/a.xml", data: zeros },
      { name: "xl/b.xml", data: zeros },
    ])
    expect(() => unzipXml(file)).toThrow("too large once inflated")
  })

  it.each([
    ["a local header naming another entry", { localName: "xl/b.xml" }],
    ["an encrypted entry", { flags: 0x0001 }],
    ["a wrong CRC", { crc: 1234 }],
    ["a size smaller than the data", { declaredSize: 5 }],
    ["a size larger than the data", { declaredSize: 50 }],
  ])("refuses %s", (_, override) => {
    expect(() => unzipXml(archive([{ name: "xl/a.xml", data: XML, ...override }]))).toThrow(ZipError)
  })

  it("refuses a repeated entry", () => {
    const file = archive([
      { name: "xl/a.xml", data: XML },
      { name: "xl/a.xml", data: XML },
    ])
    expect(() => unzipXml(file)).toThrow("repeated entry")
  })

  it("refuses what is not a ZIP archive", () => {
    expect(() => unzipXml(new TextEncoder().encode("PK\u0003\u0004 not really"))).toThrow(ZipError)
  })
})
