import { XMLBuilder, XMLParser } from 'fast-xml-parser'
import { nanoid } from 'nanoid'
import type {
  CategoryRecord,
  CodeNode,
  Coding,
  DocumentRecord,
  NoteAttachment,
  NoteRecord,
  ProjectData,
  Segment
} from './types'
import { PROJECT_SCHEMA_VERSION } from './types'
import { joinParagraphs } from './text'

/**
 * REFI-QDA Project Exchange (.qdpx) — the format NVivo, MAXQDA, ATLAS.ti,
 * QualCoder and others use to move a coded project between tools, and the
 * one data repositories ask for when archiving qualitative data. A .qdpx
 * is a zip: `project.qde` (XML, namespace urn:QDA-XML:project:1.0) plus a
 * `Sources/` folder with each document's plain text. This module is the
 * pure part — building the XML and source texts from ProjectData, and
 * reading them back — with zipping and dialogs in the main process.
 *
 * What travels: codes (hierarchy, color, description), documents as text
 * sources, coded passages and their codings, notes (attached to a passage,
 * document, code or the project), case attributes (as REFI Variables and
 * Cases, one Case per document), and clusters — as categories in the
 * codebook (nesting, color, definition) and as Sets (every code and note
 * member). What doesn't exist in the standard and is left behind on
 * export: boards and their layout, cluster links, note tags and note types,
 * quotes filed directly under a cluster.
 * Codes of kind "item" are marked through a Set named ITEMS_SET_NAME so a
 * Cadenza→Cadenza round trip keeps them.
 */

export const REFI_NAMESPACE = 'urn:QDA-XML:project:1.0'
export const ITEMS_SET_NAME = 'Cadenza: items'
const DEFAULT_COLOR = '#94a3b8'

// --- GUIDs -----------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** cyrb53 — a small, fast 53-bit string hash; three seeds give enough
 * bits for a UUID-shaped id. */
function hash53(text: string, seed: number): number {
  let h1 = 0xdeadbeef ^ seed
  let h2 = 0x41c6ce57 ^ seed
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return 4294967296 * (2097151 & h2) + (h1 >>> 0)
}

/** REFI requires UUID-shaped GUIDs; Cadenza ids are nanoids. A stable,
 * deterministic mapping (the same id always gives the same GUID, across
 * exports) — an id that already is a UUID (one that came in through
 * import) is kept, so a round trip preserves the other tool's GUIDs. */
export function toGuid(id: string): string {
  if (UUID_RE.test(id)) return id.toLowerCase()
  const hex = [0, 1, 2].map((seed) => hash53(id, seed).toString(16).padStart(14, '0')).join('')
  const h = hex.slice(0, 32).split('')
  h[12] = '4'
  h[16] = '8'
  const s = h.join('')
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`
}

// --- Export ----------------------------------------------------------------

type XmlNode = Record<string, unknown>

/** Written into a cluster Set's description: the GUID of the grouping code
 * that stands for the same cluster in the codebook (see buildQdpx), and
 * whether it's a question-cluster. Lines starting with "Cadenza:" are
 * Cadenza's own bookkeeping and are dropped from the definition on import. */
const CLUSTER_MARKER = 'Cadenza: cluster'
const QUESTION_MARKER = 'Cadenza: analytic question cluster'

/** Characters XML 1.0 doesn't allow at all, even escaped — control
 * characters (other than tab, line feed and carriage return), lone
 * surrogates, U+FFFE/U+FFFF. Text pasted from Word or PDFs can carry some
 * (a vertical tab for a manual line break, say), and a strict parser
 * rejects the whole file on the first one. */
export function stripIllegalXmlChars(value: unknown): string {
  return String(value).replace(
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
    ''
  )
}

export interface QdpxBundle {
  /** The project.qde XML document. */
  qde: string
  /** Files to put in the zip beside it, path → UTF-8 text (`Sources/<guid>.txt`). */
  sources: Record<string, string>
}

/** Gives each item a name no other item of the list shares, suffixing
 * repeats (“Name (2)”, “Name (3)”…). QualCoder stores documents, codes,
 * categories and journals in tables where a name must be unique: a repeated
 * document name makes its import fail outright, a repeated code or category
 * silently merges into the first one. */
function uniqueNames<T>(items: T[], idOf: (item: T) => string, nameOf: (item: T) => string): Map<string, string> {
  const taken = new Set<string>()
  const names = new Map<string, string>()
  for (const item of items) {
    const base = stripIllegalXmlChars(nameOf(item)).trim()
    let name = base
    for (let n = 2; taken.has(name); n++) name = `${base} (${n})`
    taken.add(name)
    names.set(idOf(item), name)
  }
  return names
}

/** A note, with its text both inline (PlainTextContent, which Cadenza reads)
 * and as a file (plainTextPath, which QualCoder needs to make it a journal
 * entry). */
function noteXml(note: NoteRecord, name: string, userGuid: string, sources: Record<string, string>): XmlNode {
  const guid = toGuid(note.id)
  sources[`Sources/${guid}.txt`] = note.question ? `${note.question}\n\n${note.answer}` : note.answer
  const node: XmlNode = {
    '@_guid': guid,
    '@_name': name,
    '@_plainTextPath': `internal://${guid}.txt`,
    '@_creatingUser': userGuid,
    '@_creationDateTime': note.createdAt,
    '@_modifiedDateTime': note.updatedAt
  }
  if (note.question) node.Description = note.question
  node.PlainTextContent = note.answer
  return node
}

export function buildQdpx(data: ProjectData, origin: string): QdpxBundle {
  const userGuid = toGuid(`user:${data.id}`)
  const now = new Date().toISOString()
  const noteRefs = (attachment: (n: NoteRecord) => boolean): XmlNode[] =>
    data.notes.filter(attachment).map((n) => ({ '@_targetGUID': toGuid(n.id) }))
  const documentNames = uniqueNames(data.documents, (d) => d.id, (d) => d.title || 'Document')
  const codeNames = uniqueNames(data.codes, (c) => c.id, (c) => c.name || 'Code')
  const clusterNames = uniqueNames(data.categories, (c) => c.id, (c) => c.name || 'Cluster')
  const noteNames = uniqueNames(data.notes, (n) => n.id, (n) => (n.question || n.answer).split('\n')[0].slice(0, 80) || 'Note')

  function codeXml(code: CodeNode): XmlNode {
    const node: XmlNode = {
      '@_guid': toGuid(code.id),
      '@_name': codeNames.get(code.id),
      '@_isCodable': 'true',
      '@_color': code.color
    }
    if (code.definition) node.Description = code.definition
    const refs = noteRefs((n) => n.attachedTo.kind === 'code' && n.attachedTo.codeId === code.id)
    if (refs.length) node.NoteRef = refs
    const children = data.codes.filter((c) => c.parentId === code.id).map(codeXml)
    if (children.length) node.Code = children
    return node
  }

  const attributeNames: string[] = []
  for (const d of data.documents) for (const k of Object.keys(d.attributes)) if (!attributeNames.includes(k)) attributeNames.push(k)
  const variableGuid = (name: string): string => toGuid(`variable:${name}`)

  const sources: Record<string, string> = {}
  const textSources: XmlNode[] = data.documents.map((document) => {
    const guid = toGuid(document.id)
    const text = joinParagraphs(document.paragraphs)
    // "Sources/", as QualCoder writes it (import looks it up either way).
    sources[`Sources/${guid}.txt`] = text
    const toCodePoints = codeUnitsToCodePoints(text)
    // One selection per distinct range, carrying every code and note on
    // any passage over it. Cadenza can hold two passages over the same
    // words; QualCoder allows one coding per code per range, and turns a
    // selection without codes into an annotation, of which a range may have
    // only one — a second one made its import fail. A passage with neither
    // codes nor notes carries nothing to exchange and is left out.
    const segmentsByRange = new Map<string, Segment[]>()
    for (const segment of data.segments) {
      if (segment.documentId !== document.id) continue
      const key = `${segment.start}:${segment.end}`
      segmentsByRange.set(key, [...(segmentsByRange.get(key) ?? []), segment])
    }
    const selections: XmlNode[] = []
    for (const group of segmentsByRange.values()) {
      const ids = new Set(group.map((s) => s.id))
      const codedWith = new Set<string>()
      const codings: XmlNode[] = []
      for (const coding of data.codings) {
        if (!ids.has(coding.segmentId) || codedWith.has(coding.codeId)) continue
        codedWith.add(coding.codeId)
        codings.push({
          '@_guid': toGuid(coding.id),
          '@_creatingUser': userGuid,
          '@_creationDateTime': coding.createdAt,
          CodeRef: { '@_targetGUID': toGuid(coding.codeId) }
        })
      }
      const attached = data.notes.filter((n) => n.attachedTo.kind === 'segment' && ids.has(n.attachedTo.segmentId))
      if (codings.length === 0 && attached.length === 0) continue
      const segment = group[0]
      const node: XmlNode = {
        '@_guid': toGuid(segment.id),
        '@_name': segment.text || 'Passage',
        '@_startPosition': toCodePoints(segment.start),
        '@_endPosition': toCodePoints(segment.end),
        '@_creatingUser': userGuid,
        '@_creationDateTime': data.createdAt
      }
      // The notes' text as the selection's memo: QualCoder shows it as the
      // coding memo, or as the annotation for a passage with no code.
      if (attached.length) node.Description = attached.map((n) => (n.question ? `${n.question}\n${n.answer}` : n.answer)).join('\n\n')
      if (codings.length) node.Coding = codings
      if (attached.length) node.NoteRef = attached.map((n) => ({ '@_targetGUID': toGuid(n.id) }))
      selections.push(node)
    }
    const node: XmlNode = {
      '@_guid': guid,
      '@_name': documentNames.get(document.id),
      '@_plainTextPath': `internal://${guid}.txt`,
      '@_creatingUser': userGuid,
      '@_creationDateTime': document.importedAt,
      '@_modifiedDateTime': document.importedAt
    }
    if (selections.length) node.PlainTextSelection = selections
    const refs = noteRefs((n) => n.attachedTo.kind === 'document' && n.attachedTo.documentId === document.id)
    if (refs.length) node.NoteRef = refs
    return node
  })

  const cases: XmlNode[] = data.documents.map((document) => {
    const node: XmlNode = { '@_guid': toGuid(`case:${document.id}`), '@_name': documentNames.get(document.id) }
    const values = Object.entries(document.attributes).map(([name, value]) => ({
      VariableRef: { '@_targetGUID': variableGuid(name) },
      TextValue: value
    }))
    if (values.length) node.VariableValue = values
    node.SourceRef = [{ '@_targetGUID': toGuid(document.id) }]
    return node
  })

  // Clusters travel twice, for two audiences. In the CodeBook, as codes
  // marked isCodable="false" with their sub-clusters and filed codes nested
  // inside — how QualCoder reads (and writes) categories, and how NVivo
  // folders and MAXQDA code groups are exchanged — so another tool opens the
  // project with its categories intact. A top-level code filed in several
  // clusters sits under the first one; a sub-code follows its parent code.
  // And as Sets, which carry what a codebook tree can't: notes filed in a
  // cluster, a code in several clusters, sub-codes filed directly, and the
  // question kind. A Set has its own GUID (two elements sharing one would
  // confuse tools that index GUIDs project-wide) and names the grouping it
  // belongs to in its description, so Cadenza's import merges the two back
  // into one cluster.
  const homeClusterByCode = new Map<string, string>()
  for (const category of data.categories) {
    for (const id of category.codeIds) {
      const code = data.codes.find((c) => c.id === id)
      if (code && code.parentId === null && !homeClusterByCode.has(id)) homeClusterByCode.set(id, category.id)
    }
  }
  function clusterXml(category: CategoryRecord): XmlNode {
    const node: XmlNode = { '@_guid': toGuid(category.id), '@_name': clusterNames.get(category.id), '@_isCodable': 'false' }
    if (/^#[0-9a-f]{6}$/i.test(category.color)) node['@_color'] = category.color
    if (category.definition) node.Description = category.definition
    const refs = noteRefs((n) => n.attachedTo.kind === 'category' && n.attachedTo.categoryId === category.id)
    if (refs.length) node.NoteRef = refs
    const children = [
      ...data.categories.filter((c) => c.parentCategoryId === category.id).map(clusterXml),
      ...data.codes.filter((c) => c.parentId === null && homeClusterByCode.get(c.id) === category.id).map(codeXml)
    ]
    if (children.length) node.Code = children
    return node
  }
  const codebook: XmlNode[] = [
    ...data.categories.filter((c) => !c.parentCategoryId).map(clusterXml),
    ...data.codes.filter((c) => c.parentId === null && !homeClusterByCode.has(c.id)).map(codeXml)
  ]

  const sets: XmlNode[] = data.categories.map((category) => {
    const node: XmlNode = { '@_guid': toGuid(`set:${category.id}`), '@_name': clusterNames.get(category.id) }
    const description = [
      category.definition,
      category.kind === 'question' ? QUESTION_MARKER : '',
      `${CLUSTER_MARKER} ${toGuid(category.id)}`
    ]
      .filter(Boolean)
      .join('\n')
    node.Description = description
    const codes = category.codeIds.filter((id) => data.codes.some((c) => c.id === id)).map((id) => ({ '@_targetGUID': toGuid(id) }))
    const notes = category.noteIds.filter((id) => data.notes.some((n) => n.id === id)).map((id) => ({ '@_targetGUID': toGuid(id) }))
    if (codes.length) node.MemberCode = codes
    if (notes.length) node.MemberNote = notes
    return node
  })
  const items = data.codes.filter((c) => c.kind === 'item')
  if (items.length) {
    sets.push({
      '@_guid': toGuid('set:cadenza-items'),
      '@_name': ITEMS_SET_NAME,
      Description: 'Codes Cadenza treats as inventory items rather than thematic codes.',
      MemberCode: items.map((c) => ({ '@_targetGUID': toGuid(c.id) }))
    })
  }

  // A note attached to a cluster is referenced from the cluster's grouping
  // code in the codebook (clusterXml), like any code's note.
  const projectNotes = data.notes.filter((n) => n.attachedTo.kind === 'project')
  const notes: XmlNode[] = data.notes.map((note) => noteXml(note, noteNames.get(note.id)!, userGuid, sources))

  const project: XmlNode = {
    '@_xmlns': REFI_NAMESPACE,
    '@_name': data.name,
    '@_origin': origin,
    '@_creatingUserGUID': userGuid,
    '@_creationDateTime': data.createdAt,
    '@_modifiedDateTime': data.updatedAt || now,
    Users: { User: [{ '@_guid': userGuid, '@_name': 'Cadenza user' }] },
    CodeBook: { Codes: { Code: codebook } }
  }
  if (attributeNames.length) {
    project.Variables = {
      Variable: attributeNames.map((name) => ({ '@_guid': variableGuid(name), '@_name': name, '@_typeOfVariable': 'Text' }))
    }
  }
  if (cases.length) project.Cases = { Case: cases }
  if (textSources.length) project.Sources = { TextSource: textSources }
  if (notes.length) project.Notes = { Note: notes }
  if (sets.length) project.Sets = { Set: sets }
  if (projectNotes.length) project.NoteRef = projectNotes.map((n) => ({ '@_targetGUID': toGuid(n.id) }))

  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    format: true,
    suppressEmptyNode: true,
    // By default the builder writes an attribute whose value is "true" as a
    // bare name (`isCodable` instead of `isCodable="true"`) — fine in HTML,
    // not well-formed XML. Cadenza's own lenient parser accepted it; a strict
    // one (Python's ElementTree, in QualCoder) rejects the whole file.
    suppressBooleanAttributes: false,
    attributeValueProcessor: (_name: string, value: unknown) => stripIllegalXmlChars(value),
    tagValueProcessor: (_name: string, value: unknown) => stripIllegalXmlChars(value)
  })
  const qde = `<?xml version="1.0" encoding="UTF-8"?>\n${builder.build({ Project: project })}`
  return { qde, sources }
}

// --- Import ----------------------------------------------------------------

export interface QdpxImportReport {
  documents: number
  codes: number
  codings: number
  notes: number
  clusters: number
  /** Sources or elements the standard allows that Cadenza can't take, with why. */
  skipped: string[]
}

const ARRAY_TAGS = new Set([
  'User', 'Code', 'Variable', 'Case', 'VariableValue', 'SourceRef', 'CodeRef', 'TextSource', 'PDFSource',
  'PictureSource', 'AudioSource', 'VideoSource', 'PlainTextSelection', 'Coding', 'NoteRef', 'Note', 'Set',
  'MemberCode', 'MemberSource', 'MemberNote', 'Representation'
])

/** Source text as Cadenza stores it, plus a function mapping a position in
 * the original text to the same place in the normalized one — REFI
 * selections index the file as written (CRLF line ends, stray blank lines
 * and all), and every one of them has to keep pointing at the same words. */
export function normalizeSourceText(raw: string): { text: string; mapOffset: (original: number) => number } {
  // Ranges of the original that are dropped, in order.
  const removed: Array<{ start: number; end: number }> = []
  const crPositions: number[] = []
  for (const m of raw.matchAll(/\r/g)) {
    crPositions.push(m.index)
    removed.push({ start: m.index, end: m.index + 1 })
  }
  // Runs of three or more line breaks (blank lines in between) collapse to
  // one paragraph break, and leading/trailing whitespace goes.
  const noCr = raw.replace(/\r/g, '')
  const toOriginal = (i: number): number => {
    // Position in `noCr` → position in `raw`: add back the CRs before it.
    let extra = 0
    for (const cr of crPositions) if (cr - extra <= i) extra++
    return i + extra
  }
  for (const m of noCr.matchAll(/\n{3,}/g)) removed.push({ start: toOriginal(m.index + 2), end: toOriginal(m.index + m[0].length) })
  const leading = noCr.match(/^\s+/)
  if (leading) removed.push({ start: 0, end: toOriginal(leading[0].length) })
  const trailing = noCr.match(/\s+$/)
  if (trailing) removed.push({ start: toOriginal(noCr.length - trailing[0].length), end: raw.length })
  removed.sort((a, b) => a.start - b.start)
  // Merge overlaps (a CR inside a collapsed run, say).
  const merged: Array<{ start: number; end: number }> = []
  for (const r of removed) {
    const last = merged[merged.length - 1]
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end)
    else merged.push({ ...r })
  }
  let text = ''
  let cursor = 0
  for (const r of merged) {
    text += raw.slice(cursor, r.start)
    cursor = r.end
  }
  text += raw.slice(cursor)
  const mapOffset = (original: number): number => {
    let dropped = 0
    for (const r of merged) {
      if (r.end <= original) dropped += r.end - r.start
      else if (r.start < original) return r.start - dropped
      else break
    }
    return Math.max(0, Math.min(text.length, original - dropped))
  }
  return { text, mapOffset }
}

/** REFI-QDA positions count characters (Unicode code points) — what
 * QualCoder's Python strings count — while JavaScript string offsets count
 * UTF-16 code units, where an emoji or other character outside the Basic
 * Multilingual Plane takes two. Identical for most text; without converting,
 * one emoji early in a transcript would shift every later passage by one.
 * These return a converter for offsets into `text`. */
export function codePointsToCodeUnits(text: string): (codePointOffset: number) => number {
  if (!/[\uD800-\uDBFF]/.test(text)) return (offset) => offset
  const units: number[] = []
  let unit = 0
  for (const char of text) {
    units.push(unit)
    unit += char.length
  }
  units.push(unit)
  return (offset) => units[Math.max(0, Math.min(offset, units.length - 1))]
}

export function codeUnitsToCodePoints(text: string): (codeUnitOffset: number) => number {
  if (!/[\uD800-\uDBFF]/.test(text)) return (offset) => offset
  return (offset) => [...text.slice(0, offset)].length
}

/**
 * The standard doesn't say whether a Windows line ending counts as one
 * character or two, and tools differ: QualCoder (Python, reading text
 * files in universal-newline mode) counts "\r\n" as one, so its positions
 * are relative to the text with carriage returns removed; a tool that
 * counts raw file content counts both. Both readings are tried, and the one
 * under which more selections cover exactly the text the file records for
 * them (a selection's `name`, which QualCoder and others set to the
 * selected words) wins. With no such evidence — or a tie — carriage
 * returns aren't counted, the common convention. Both readings end in the
 * same normalized text; only the offset mapping differs.
 */
function chooseSourceReading(
  raw: string,
  selections: XmlNode[]
): { text: string; mapOffset: (codePointOffset: number) => number } {
  const readings = [raw.replace(/\r\n?/g, '\n'), raw].map((source) => {
    const normalized = normalizeSourceText(source)
    const fromCodePoints = codePointsToCodeUnits(source)
    return {
      text: normalized.text,
      mapOffset: (offset: number): number => normalized.mapOffset(fromCodePoints(offset)),
      source,
      fromCodePoints
    }
  })
  if (readings[0].source === readings[1].source) return readings[0]
  const score = (reading: (typeof readings)[number]): number => {
    let matches = 0
    for (const selection of selections) {
      const expected = attr(selection, 'name')
      if (!expected) continue
      const start = reading.fromCodePoints(Number(attr(selection, 'startPosition')))
      const end = reading.fromCodePoints(Number(attr(selection, 'endPosition')))
      if (reading.source.slice(start, end) === expected) matches++
    }
    return matches
  }
  return score(readings[1]) > score(readings[0]) ? readings[1] : readings[0]
}

function asArray<T>(value: T | T[] | undefined): T[] {
  if (value === undefined || value === null) return []
  return Array.isArray(value) ? value : [value]
}
/** Numeric character references (`&#13;` for a carriage return is the
 * common one in other tools' exports) come through the parser untouched;
 * named entities it already decodes. */
function decodeCharRefs(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => String.fromCodePoint(Number(dec)))
}
function attr(node: XmlNode | undefined, name: string): string {
  const v = node?.[`@_${name}`]
  return v === undefined || v === null ? '' : decodeCharRefs(String(v))
}
function textOf(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'object') return textOf((value as XmlNode)['#text'])
  return decodeCharRefs(String(value))
}

/** Reads a .qdpx's project.qde (and its source texts, via `readSource`,
 * given the path inside the zip such as `Sources/<guid>.txt`) into
 * ProjectData. GUIDs are kept as ids. The result still needs
 * normalizeProjectData (default board, pinning) before use. */
export function parseQdpx(qde: string, readSource: (zipPath: string) => string | undefined): { data: ProjectData; report: QdpxImportReport } {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: false,
    isArray: (name) => ARRAY_TAGS.has(name)
  })
  const root = parser.parse(qde) as { Project?: XmlNode }
  const project = root.Project
  if (!project) throw new Error('Not a REFI-QDA project: no <Project> element in project.qde')
  const now = new Date().toISOString()
  const report: QdpxImportReport = { documents: 0, codes: 0, codings: 0, notes: 0, clusters: 0, skipped: [] }
  const guid = (s: string): string => s.trim().toLowerCase()

  // The codebook, recursively, with note refs. A Code marked
  // isCodable="false" is a grouping, not something passages are coded
  // with — it's how QualCoder exports its categories, and how NVivo and
  // MAXQDA export folders/code groups — so it becomes a cluster, nested
  // under the nearest grouping above it, and each code directly inside it
  // is filed under it. Codable codes keep their own parent/child hierarchy;
  // a code whose parent is a grouping is top-level in the codebook.
  const codes: CodeNode[] = []
  const categories: CategoryRecord[] = []
  const categoryById = new Map<string, CategoryRecord>()
  const noteAttachments = new Map<string, NoteAttachment>()
  const rememberNoteRefs = (node: XmlNode, attachment: NoteAttachment): void => {
    for (const ref of asArray(node.NoteRef as XmlNode[] | undefined)) {
      const target = guid(attr(ref, 'targetGUID'))
      if (target && !noteAttachments.has(target)) noteAttachments.set(target, attachment)
    }
  }
  const colorOf = (node: XmlNode): string =>
    /^#[0-9a-f]{6}$/i.test(attr(node, 'color')) ? attr(node, 'color') : DEFAULT_COLOR
  const walkCodes = (nodes: XmlNode[], parentCodeId: string | null, parentCategoryId: string | null): void => {
    for (const node of nodes) {
      const id = guid(attr(node, 'guid'))
      if (!id) continue
      const children = asArray(node.Code as XmlNode[] | undefined)
      if (attr(node, 'isCodable').toLowerCase() === 'false') {
        const category: CategoryRecord = {
          id,
          kind: 'theme',
          name: attr(node, 'name') || 'Untitled cluster',
          color: colorOf(node),
          definition: textOf(node.Description).trim(),
          codeIds: [],
          noteIds: [],
          segmentIds: [],
          parentCategoryId,
          createdAt: now
        }
        categories.push(category)
        categoryById.set(id, category)
        rememberNoteRefs(node, { kind: 'category', categoryId: id })
        walkCodes(children, null, id)
        continue
      }
      codes.push({
        id,
        kind: 'code',
        name: attr(node, 'name') || 'Untitled code',
        color: colorOf(node),
        definition: textOf(node.Description).trim(),
        parentId: parentCodeId,
        createdAt: now
      })
      if (parentCodeId === null && parentCategoryId) categoryById.get(parentCategoryId)!.codeIds.push(id)
      rememberNoteRefs(node, { kind: 'code', codeId: id })
      walkCodes(children, id, parentCategoryId)
    }
  }
  walkCodes(asArray(((project.CodeBook as XmlNode | undefined)?.Codes as XmlNode | undefined)?.Code as XmlNode[] | undefined), null, null)
  report.codes = codes.length
  const codeIds = new Set(codes.map((c) => c.id))

  // Sources → documents, selections → segments + codings.
  let codingsOnGroupings = 0
  const documents: DocumentRecord[] = []
  const segments: Segment[] = []
  const codings: Coding[] = []
  const sourcesNode = project.Sources as XmlNode | undefined
  const textLike: Array<{ node: XmlNode; kind: string }> = [
    ...asArray(sourcesNode?.TextSource as XmlNode[] | undefined).map((node) => ({ node, kind: 'TextSource' })),
    ...asArray(sourcesNode?.PDFSource as XmlNode[] | undefined).map((node) => ({ node, kind: 'PDFSource' }))
  ]
  for (const kind of ['PictureSource', 'AudioSource', 'VideoSource']) {
    for (const node of asArray(sourcesNode?.[kind] as XmlNode[] | undefined)) {
      report.skipped.push(`${kind.replace('Source', '')} source “${attr(node, 'name')}” — only text sources can be imported`)
    }
  }
  for (const { node, kind } of textLike) {
    const id = guid(attr(node, 'guid')) || nanoid()
    const name = attr(node, 'name') || 'Untitled document'
    // Text: the referenced plain-text file, else inline content; a PDF
    // source only if it carries a plain-text representation.
    let raw: string | undefined
    let selectionHost: XmlNode = node
    const path = attr(node, 'plainTextPath')
    if (path.startsWith('internal://')) raw = readSource(`Sources/${path.slice('internal://'.length)}`)
    if (raw === undefined && node.PlainTextContent !== undefined) raw = textOf(node.PlainTextContent)
    if (raw === undefined && kind === 'PDFSource') {
      const representation = asArray(node.Representation as XmlNode[] | undefined)[0]
      const rpath = attr(representation, 'plainTextPath')
      if (rpath.startsWith('internal://')) raw = readSource(`Sources/${rpath.slice('internal://'.length)}`)
      if (raw === undefined && representation?.PlainTextContent !== undefined) raw = textOf(representation.PlainTextContent)
      if (representation) selectionHost = representation
    }
    if (raw === undefined) {
      report.skipped.push(`${kind === 'PDFSource' ? 'PDF' : 'Text'} source “${name}” — its text is not in the file${path.startsWith('internal://') ? '' : path ? ' (external path)' : ''}`)
      continue
    }
    // A byte-order mark is an encoding marker, not text: positions never
    // count it (QualCoder's source files start with one).
    const withoutBom = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw
    const selections = asArray(selectionHost.PlainTextSelection as XmlNode[] | undefined)
    const { text, mapOffset } = chooseSourceReading(withoutBom, selections)
    documents.push({
      id,
      title: name,
      paragraphs: text.split('\n\n'),
      sourceFormat: kind === 'PDFSource' ? 'pdf' : 'txt',
      assetRelPath: null,
      importedAt: attr(node, 'creationDateTime') || now,
      attributes: {}
    })
    rememberNoteRefs(node, { kind: 'document', documentId: id })
    for (const selection of selections) {
      const sid = guid(attr(selection, 'guid')) || nanoid()
      const start = mapOffset(Number(attr(selection, 'startPosition')))
      const end = mapOffset(Number(attr(selection, 'endPosition')))
      if (!(end > start)) {
        report.skipped.push(`An empty passage in “${name}”`)
        continue
      }
      segments.push({ id: sid, documentId: id, start, end, text: text.slice(start, end) })
      rememberNoteRefs(selection, { kind: 'segment', segmentId: sid })
      for (const coding of asArray(selection.Coding as XmlNode[] | undefined)) {
        for (const ref of asArray(coding.CodeRef as XmlNode[] | undefined)) {
          const codeId = guid(attr(ref, 'targetGUID'))
          if (categoryById.has(codeId)) codingsOnGroupings++
          if (!codeIds.has(codeId)) continue
          codings.push({ id: guid(attr(coding, 'guid')) || nanoid(), segmentId: sid, codeId, createdAt: attr(coding, 'creationDateTime') || now })
        }
      }
    }
  }
  report.documents = documents.length
  report.codings = codings.length
  rememberNoteRefs(project, { kind: 'project' })

  // Cases and variables → document attributes.
  const variableNames = new Map<string, string>()
  for (const v of asArray((project.Variables as XmlNode | undefined)?.Variable as XmlNode[] | undefined)) {
    variableNames.set(guid(attr(v, 'guid')), attr(v, 'name'))
  }
  const documentById = new Map(documents.map((d) => [d.id, d]))
  for (const c of asArray((project.Cases as XmlNode | undefined)?.Case as XmlNode[] | undefined)) {
    const values: Record<string, string> = {}
    for (const vv of asArray(c.VariableValue as XmlNode[] | undefined)) {
      const ref = asArray(vv.VariableRef as XmlNode[] | undefined)[0] ?? (vv.VariableRef as XmlNode | undefined)
      const name = variableNames.get(guid(attr(ref, 'targetGUID')))
      if (!name) continue
      const value = ['TextValue', 'IntegerValue', 'FloatValue', 'DateValue', 'DateTimeValue', 'BooleanValue']
        .map((k) => vv[k])
        .find((v) => v !== undefined)
      values[name] = textOf(value).trim()
    }
    if (Object.keys(values).length === 0) continue
    for (const ref of asArray(c.SourceRef as XmlNode[] | undefined)) {
      const document = documentById.get(guid(attr(ref, 'targetGUID')))
      if (document) document.attributes = { ...document.attributes, ...values }
    }
  }

  // Notes.
  const notes: NoteRecord[] = []
  for (const node of asArray((project.Notes as XmlNode | undefined)?.Note as XmlNode[] | undefined)) {
    const id = guid(attr(node, 'guid')) || nanoid()
    // Inline text, or else the file it points to (how QualCoder writes journals).
    const path = attr(node, 'plainTextPath')
    const content =
      textOf(node.PlainTextContent) ||
      (path.startsWith('internal://') ? (readSource(`Sources/${path.slice('internal://'.length)}`) ?? '').replace(/^\uFEFF/, '') : '')
    const description = textOf(node.Description).trim()
    const answer = (content || description || attr(node, 'name')).trim()
    const question = content && description && description !== content.trim() ? description : null
    notes.push({
      id,
      question,
      answer,
      tags: [],
      noteCategoryId: null,
      attachedTo: noteAttachments.get(id) ?? { kind: 'project' },
      createdAt: attr(node, 'creationDateTime') || now,
      updatedAt: attr(node, 'modifiedDateTime') || attr(node, 'creationDateTime') || now
    })
  }
  report.notes = notes.length
  const noteIds = new Set(notes.map((n) => n.id))
  if (codingsOnGroupings > 0) {
    report.skipped.push(
      `${codingsOnGroupings} coding${codingsOnGroupings === 1 ? '' : 's'} applied to a category (a non-codable grouping) — only codes can code a passage`
    )
  }

  // Sets → clusters too, alongside the codebook's groupings above (the
  // "items" marker set flips code kinds instead). A Set Cadenza wrote for a
  // cluster that's also a grouping code merges into that cluster rather
  // than becoming a second one (see buildQdpx).
  for (const set of asArray((project.Sets as XmlNode | undefined)?.Set as XmlNode[] | undefined)) {
    const memberCodes = asArray(set.MemberCode as XmlNode[] | undefined).map((m) => guid(attr(m, 'targetGUID'))).filter((id) => codeIds.has(id))
    if (attr(set, 'name') === ITEMS_SET_NAME) {
      for (const code of codes) if (memberCodes.includes(code.id)) code.kind = 'item'
      continue
    }
    const memberNotes = asArray(set.MemberNote as XmlNode[] | undefined).map((m) => guid(attr(m, 'targetGUID'))).filter((id) => noteIds.has(id))
    const descriptionLines = textOf(set.Description).split('\n')
    const isQuestion = descriptionLines.some((line) => line.trim() === QUESTION_MARKER)
    const clusterGuid = descriptionLines
      .map((line) => line.trim())
      .find((line) => line.startsWith(`${CLUSTER_MARKER} `))
      ?.slice(CLUSTER_MARKER.length + 1)
      .trim()
      .toLowerCase()
    const definition = descriptionLines
      .filter((line) => !line.trim().startsWith('Cadenza:'))
      .join('\n')
      .trim()
    const existing = clusterGuid ? categoryById.get(clusterGuid) : undefined
    if (existing) {
      for (const id of memberCodes) if (!existing.codeIds.includes(id)) existing.codeIds.push(id)
      for (const id of memberNotes) if (!existing.noteIds.includes(id)) existing.noteIds.push(id)
      if (isQuestion) existing.kind = 'question'
      continue
    }
    categories.push({
      id: guid(attr(set, 'guid')) || nanoid(),
      kind: isQuestion ? 'question' : 'theme',
      name: attr(set, 'name') || 'Untitled cluster',
      color: DEFAULT_COLOR,
      definition,
      codeIds: memberCodes,
      noteIds: memberNotes,
      segmentIds: [],
      parentCategoryId: null,
      createdAt: now
    })
  }
  report.clusters = categories.length

  const data: ProjectData = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: nanoid(),
    name: attr(project, 'name') || 'Imported project',
    createdAt: attr(project, 'creationDateTime') || now,
    updatedAt: now,
    documents,
    segments,
    codes,
    codings,
    notes,
    noteCategories: [],
    categories,
    boards: [],
    boardItems: [],
    boardClusters: [],
    boardLinks: [],
    clusterLinks: []
  }
  return { data, report }
}
