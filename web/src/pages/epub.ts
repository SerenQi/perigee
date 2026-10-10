import { compressImage } from '../lib/api'

export type EpubChapter = { idx: number; title: string; text: string }
export type ParsedEpub = { title: string; author: string; cover?: string; chapters: EpubChapter[] }

type ZipEntry = { name: string; method: number; compressedSize: number; localOffset: number }

const u16 = (v: DataView, at: number) => v.getUint16(at, true)
const u32 = (v: DataView, at: number) => v.getUint32(at, true)
const arrayBuffer = (bytes: Uint8Array) => {
  const out = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(out).set(bytes)
  return out
}
const normalizePath = (raw: string) => {
  const out: string[] = []
  for (const part of raw.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue
    if (part === '..') out.pop(); else out.push(part)
  }
  return out.join('/')
}
const resolvePath = (baseFile: string, href: string) => normalizePath(`${baseFile.split('/').slice(0, -1).join('/')}/${decodeURIComponent(href.split('#')[0])}`)

class EpubZip {
  private bytes: Uint8Array
  private view: DataView
  private entries = new Map<string, ZipEntry>()

  constructor(buffer: ArrayBuffer) {
    this.bytes = new Uint8Array(buffer)
    this.view = new DataView(buffer)
    let eocd = -1
    for (let i = Math.max(0, this.bytes.length - 65_557); i <= this.bytes.length - 22; i++) {
      if (u32(this.view, i) === 0x06054b50) eocd = i
    }
    if (eocd < 0) throw new Error('这不是有效的 EPUB 文件')
    const count = u16(this.view, eocd + 10)
    let cursor = u32(this.view, eocd + 16)
    const decoder = new TextDecoder('utf-8')
    for (let i = 0; i < count; i++) {
      if (u32(this.view, cursor) !== 0x02014b50) throw new Error('EPUB 目录结构损坏')
      const method = u16(this.view, cursor + 10)
      const compressedSize = u32(this.view, cursor + 20)
      const nameLength = u16(this.view, cursor + 28)
      const extraLength = u16(this.view, cursor + 30)
      const commentLength = u16(this.view, cursor + 32)
      const localOffset = u32(this.view, cursor + 42)
      const name = normalizePath(decoder.decode(this.bytes.subarray(cursor + 46, cursor + 46 + nameLength)))
      this.entries.set(name, { name, method, compressedSize, localOffset })
      cursor += 46 + nameLength + extraLength + commentLength
    }
  }

  async get(path: string): Promise<Uint8Array> {
    const key = normalizePath(path)
    const entry = this.entries.get(key) || [...this.entries.values()].find((e) => e.name.toLowerCase() === key.toLowerCase())
    if (!entry) throw new Error(`EPUB 内缺少文件：${key}`)
    const at = entry.localOffset
    if (u32(this.view, at) !== 0x04034b50) throw new Error('EPUB 本地文件头损坏')
    const start = at + 30 + u16(this.view, at + 26) + u16(this.view, at + 28)
    const packed = this.bytes.slice(start, start + entry.compressedSize)
    if (entry.method === 0) return packed
    if (entry.method !== 8) throw new Error(`暂不支持 EPUB 压缩方式 ${entry.method}`)
    if (!('DecompressionStream' in window)) throw new Error('当前浏览器不支持 EPUB 解压，请改用 TXT 导入')
    try {
      const stream = new Blob([arrayBuffer(packed)]).stream().pipeThrough(new DecompressionStream('deflate-raw' as CompressionFormat))
      return new Uint8Array(await new Response(stream).arrayBuffer())
    } catch { throw new Error('EPUB 章节解压失败，请改用 TXT 导入') }
  }

  async text(path: string) { return new TextDecoder('utf-8').decode(await this.get(path)) }
}

const xml = (source: string) => {
  const doc = new DOMParser().parseFromString(source, 'text/xml')
  if (doc.querySelector('parsererror')) throw new Error('EPUB 元数据无法解析')
  return doc
}
const firstLocal = (doc: Document, name: string) => [...doc.getElementsByTagName('*')].find((e) => e.localName === name)
const allLocal = (doc: Document, name: string) => [...doc.getElementsByTagName('*')].filter((e) => e.localName === name)

function htmlText(doc: Document) {
  const block = new Set(['address','article','aside','blockquote','br','div','dl','dt','dd','figcaption','figure','footer','form','h1','h2','h3','h4','h5','h6','header','hr','li','main','nav','ol','p','pre','section','table','tr','ul'])
  let out = ''
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) { out += node.textContent || ''; return }
    if (!(node instanceof Element)) return
    if (['script','style','svg','noscript'].includes(node.tagName.toLowerCase())) return
    for (const child of [...node.childNodes]) walk(child)
    if (block.has(node.tagName.toLowerCase())) out += '\n\n'
  }
  walk(doc.body)
  return out.replace(/[ \t\f\v]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim()
}

async function coverDataUrl(bytes: Uint8Array, mime: string, name: string) {
  const blob = new Blob([arrayBuffer(bytes)], { type: mime || 'image/jpeg' })
  const url = URL.createObjectURL(blob)
  try {
    const image = new Image()
    await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('封面图片无法读取')); image.src = url })
    const scale = Math.min(1, 400 / Math.max(1, image.width))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale))
    canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height)
    const resized = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => b ? resolve(b) : reject(new Error('封面压缩失败')), 'image/jpeg', .86))
    return compressImage(new File([resized], name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' }))
  } finally { URL.revokeObjectURL(url) }
}

export async function parseEpub(file: File): Promise<ParsedEpub> {
  if (!('DecompressionStream' in window)) throw new Error('当前浏览器不支持 EPUB 解压，请改用 TXT 导入')
  const zip = new EpubZip(await file.arrayBuffer())
  const container = xml(await zip.text('META-INF/container.xml'))
  const opfPath = firstLocal(container, 'rootfile')?.getAttribute('full-path')
  if (!opfPath) throw new Error('EPUB 未声明 OPF 文件')
  const opf = xml(await zip.text(opfPath))
  const title = firstLocal(opf, 'title')?.textContent?.trim() || file.name.replace(/\.epub$/i, '')
  const author = firstLocal(opf, 'creator')?.textContent?.trim() || ''
  const manifest = new Map<string, Element>()
  allLocal(opf, 'item').forEach((item) => { const id = item.getAttribute('id'); if (id) manifest.set(id, item) })

  let coverItem = [...manifest.values()].find((item) => (item.getAttribute('properties') || '').split(/\s+/).includes('cover-image'))
  if (!coverItem) {
    const coverId = allLocal(opf, 'meta').find((m) => m.getAttribute('name') === 'cover')?.getAttribute('content')
    if (coverId) coverItem = manifest.get(coverId)
  }
  let cover: string | undefined
  if (coverItem?.getAttribute('href')) {
    const coverPath = resolvePath(opfPath, coverItem.getAttribute('href')!)
    try { cover = await coverDataUrl(await zip.get(coverPath), coverItem.getAttribute('media-type') || 'image/jpeg', coverPath.split('/').pop() || 'cover.jpg') } catch { /* 无法解码的封面不阻断正文导入 */ }
  }

  const chapters: EpubChapter[] = []
  for (const itemref of allLocal(opf, 'itemref')) {
    const item = manifest.get(itemref.getAttribute('idref') || '')
    const href = item?.getAttribute('href')
    if (!href) continue
    const media = item?.getAttribute('media-type') || ''
    if (media && !/xhtml|html/i.test(media)) continue
    try {
      const doc = new DOMParser().parseFromString(await zip.text(resolvePath(opfPath, href)), 'text/html')
      const heading = doc.querySelector('h1,h2,h3')?.textContent?.replace(/\s+/g, ' ').trim() || ''
      const text = htmlText(doc)
      if (text.length < 40 && !heading) continue
      chapters.push({ idx: chapters.length, title: heading || `第 ${chapters.length + 1} 章`, text })
    } catch { /* spine 中个别坏页跳过，其余章节仍可导入 */ }
  }
  if (!chapters.length) throw new Error('EPUB 中没有识别到可阅读章节')
  return { title, author, cover, chapters }
}
