import type { ProjectData } from './types'
import { getParagraphStartOffsets } from './text'

/** Full-text search across every document's paragraphs — the "find every
 * place this word or phrase occurs, in context, and code it from there"
 * step most coding passes lean on. Pure: the view decides what to do with
 * a hit (jump to it, code its sentence). */

export interface SearchOptions {
  /** Default false: "Reunion" finds "réunion". */
  matchCase?: boolean
  /** Default false: "cat" also finds "category". */
  wholeWord?: boolean
  /** Default true: "reunion" finds "réunion" (and vice versa) — accents,
   * cedillas and the like are ignored, which is what French transcripts
   * need. Offsets always refer to the original text. */
  ignoreAccents?: boolean
  /** Restrict to these documents; all documents when omitted. */
  documentIds?: string[]
}

export interface SearchHit {
  documentId: string
  documentTitle: string
  paragraphIndex: number
  /** The match itself, as global offsets into the document's joined text —
   * the same coordinates Segment.start/end use, so a hit can become an
   * active span or a coded segment directly. */
  start: number
  end: number
  match: string
  /** Up to CONTEXT_CHARS of the same paragraph either side of the match,
   * for showing the hit in context; `beforeClipped`/`afterClipped` say
   * whether there was more. */
  before: string
  after: string
  beforeClipped: boolean
  afterClipped: boolean
  /** The sentence the match sits in (global offsets) — a more useful unit
   * to code than a lone word. */
  sentence: { start: number; end: number; text: string }
  /** Codes already applied to any passage overlapping the match. */
  codeIds: string[]
}

export const CONTEXT_CHARS = 80

/** Maps a string to its accent-stripped form, plus a table from each folded
 * character position back to the original one — folding can drop
 * characters (combining marks), so positions in the folded text can't be
 * used on the original directly. `indexMap[i]` is the original index of
 * folded character i; `indexMap[folded.length]` is `text.length`. */
export function foldAccents(text: string): { folded: string; indexMap: number[] } {
  let folded = ''
  const indexMap: number[] = []
  let i = 0
  for (const char of text) {
    const stripped = char.normalize('NFD').replace(/\p{M}/gu, '')
    for (const _ of stripped) indexMap.push(i)
    folded += stripped
    i += char.length
  }
  indexMap.push(text.length)
  return { folded, indexMap }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** The sentence containing [localStart, localEnd) within one paragraph —
 * from just after the previous sentence-ending punctuation (or the
 * paragraph start) to the next one (or the paragraph end), trimmed. */
export function sentenceAround(paragraph: string, localStart: number, localEnd: number): { start: number; end: number } {
  const terminator = /[.!?…]/
  let start = localStart
  while (start > 0) {
    const previous = paragraph[start - 1]
    if (terminator.test(previous) && /\s/.test(paragraph[start] ?? ' ')) break
    start--
  }
  let end = localEnd
  while (end < paragraph.length) {
    if (terminator.test(paragraph[end]) && /\s/.test(paragraph[end + 1] ?? ' ')) {
      end++
      break
    }
    end++
  }
  while (start < end && /\s/.test(paragraph[start])) start++
  while (end > start && /\s/.test(paragraph[end - 1])) end--
  return { start, end }
}

/** Accent-folded paragraphs, kept per document text: folding is the costly
 * part of a search, and the same paragraphs are searched again on every
 * keystroke. Keyed by the paragraphs array itself, which is replaced (never
 * mutated) when a document's text changes. */
const foldedParagraphsCache = new WeakMap<string[], { folded: string; indexMap: number[] }[]>()
function foldedParagraphs(paragraphs: string[]): { folded: string; indexMap: number[] }[] {
  let folded = foldedParagraphsCache.get(paragraphs)
  if (!folded) foldedParagraphsCache.set(paragraphs, (folded = paragraphs.map(foldAccents)))
  return folded
}

export function searchDocuments(data: ProjectData, query: string, options: SearchOptions = {}): SearchHit[] {
  const term = query.trim()
  if (!term) return []
  const ignoreAccents = options.ignoreAccents ?? true
  const documentFilter = options.documentIds ? new Set(options.documentIds) : null

  const folded = ignoreAccents ? foldAccents(term).folded : term
  const core = escapeRegExp(folded)
  const pattern = options.wholeWord ? `(?<![\\p{L}\\p{N}])${core}(?![\\p{L}\\p{N}])` : core
  const regex = new RegExp(pattern, `gu${options.matchCase ? '' : 'i'}`)

  const codeIdsBySegment = new Map<string, string[]>()
  for (const coding of data.codings) {
    const codeIds = codeIdsBySegment.get(coding.segmentId)
    if (codeIds) codeIds.push(coding.codeId)
    else codeIdsBySegment.set(coding.segmentId, [coding.codeId])
  }

  const hits: SearchHit[] = []
  for (const document of data.documents) {
    if (documentFilter && !documentFilter.has(document.id)) continue
    const paragraphStarts = getParagraphStartOffsets(document.paragraphs)
    const documentSegments = data.segments.filter((s) => s.documentId === document.id && codeIdsBySegment.has(s.id))
    const folded = ignoreAccents ? foldedParagraphs(document.paragraphs) : null

    document.paragraphs.forEach((paragraph, paragraphIndex) => {
      const haystack = folded ? folded[paragraphIndex] : { folded: paragraph, indexMap: null }
      // Only the coded passages reaching into this paragraph can be on a hit in it.
      const paragraphStart = paragraphStarts[paragraphIndex]
      const paragraphEnd = paragraphStart + paragraph.length
      let paragraphSegments: typeof documentSegments | null = null
      regex.lastIndex = 0
      let found: RegExpExecArray | null
      while ((found = regex.exec(haystack.folded)) !== null) {
        if (found[0].length === 0) {
          regex.lastIndex++
          continue
        }
        const localStart = haystack.indexMap ? haystack.indexMap[found.index] : found.index
        const localEnd = haystack.indexMap ? haystack.indexMap[found.index + found[0].length] : found.index + found[0].length
        const base = paragraphStarts[paragraphIndex]
        const start = base + localStart
        const end = base + localEnd
        const sentence = sentenceAround(paragraph, localStart, localEnd)
        paragraphSegments ??= documentSegments.filter((s) => s.start < paragraphEnd && s.end > paragraphStart)
        const codeIds = new Set<string>()
        for (const segment of paragraphSegments) {
          if (segment.start < end && segment.end > start) {
            for (const codeId of codeIdsBySegment.get(segment.id)!) codeIds.add(codeId)
          }
        }
        hits.push({
          documentId: document.id,
          documentTitle: document.title,
          paragraphIndex,
          start,
          end,
          match: paragraph.slice(localStart, localEnd),
          before: paragraph.slice(Math.max(0, localStart - CONTEXT_CHARS), localStart),
          after: paragraph.slice(localEnd, localEnd + CONTEXT_CHARS),
          beforeClipped: localStart > CONTEXT_CHARS,
          afterClipped: paragraph.length - localEnd > CONTEXT_CHARS,
          sentence: {
            start: base + sentence.start,
            end: base + sentence.end,
            text: paragraph.slice(sentence.start, sentence.end)
          },
          codeIds: [...codeIds]
        })
      }
    })
  }
  return hits
}
