// Builds the format-agnostic Report (see @shared/reportModel) the export
// dialog offers — one flexible document assembled from whichever sections
// the user checked, rather than several fixed, separately-triggered
// report types. Lives in renderer/src/lib (not @shared) because it needs
// buildClusterTree from this same directory — everything else it touches
// (@shared/codeTree, @shared/retrieval, @shared/comparison) is already
// pure/shared, this file just adds the tree-walking assembly on top.

import type { Report, ReportBlock } from '@shared/reportModel'
import type { CategoryRecord, NoteRecord, ProjectData } from '@shared/types'
import { buildTree } from './codebookTree'
import type { TreeNode } from './codebookTree'
import { buildClusterTree } from './clusterTree'
import type { ClusterTreeNode } from './clusterTree'
import { retrieveByCode } from '@shared/retrieval'
import { getSurroundingWords, joinParagraphs } from '@shared/text'
import { getCases, getCodeCaseMatrix } from '@shared/comparison'
import { flattenCodeTree } from '@shared/codeTree'

export interface ProjectReportOptions {
  includeCodes: boolean
  includeNotes: boolean
  includeComparison: boolean
  /** Applies to both the codebook and notes sections — the comparison
   * matrix has no quotes to attach it to. */
  includeVerbatim: boolean
  /** Words of surrounding context shown either side of a quote when
   * includeVerbatim is set; 0 = just the bare quote. */
  contextWords: number
  /** A project-wide instances-per-code table, shown before the codebook
   * section. Independent of includeVerbatim (a frequency count, not a
   * quote). */
  includeFrequency: boolean
}

// Matches the indentation convention already used for a flattened code
// list elsewhere (RetrievalView's <select>, the comparison matrix rows).
function indentedName(name: string, depth: number): string {
  return depth > 0 ? `${'—'.repeat(depth)} ${name}` : name
}

function quoteBlock(fullText: string | null, start: number, end: number, quote: string, contextWords: number): ReportBlock {
  if (contextWords > 0 && fullText !== null) {
    const ctx = getSurroundingWords(fullText, start, end, contextWords)
    const text = [ctx.before, `[${quote}]`, ctx.after].filter(Boolean).join(' ')
    return { kind: 'paragraph', text, style: 'quote' }
  }
  return { kind: 'paragraph', text: quote, style: 'quote' }
}

function buildFrequencySection(data: ProjectData): ReportBlock[] {
  const counts = new Map<string, number>()
  for (const coding of data.codings) counts.set(coding.codeId, (counts.get(coding.codeId) ?? 0) + 1)
  const rows = data.codes
    .map((c) => ({ name: c.name, count: counts.get(c.id) ?? 0 }))
    .sort((a, b) => b.count - a.count)
    .map((r) => [r.name, String(r.count)])
  return [
    { kind: 'heading', level: 2, text: 'Code frequency' },
    { kind: 'paragraph', text: 'How many times each code/item was applied across the whole project.', style: 'meta' },
    { kind: 'table', headers: ['Code / item', 'Instances'], rows }
  ]
}

function buildCodebookSection(data: ProjectData, includeVerbatim: boolean, contextWords: number): ReportBlock[] {
  const blocks: ReportBlock[] = [{ kind: 'heading', level: 2, text: 'Codebook' }]
  const documentById = new Map(data.documents.map((d) => [d.id, d]))
  const documentTextById = new Map(data.documents.map((d) => [d.id, joinParagraphs(d.paragraphs)]))

  function walk(node: TreeNode, depth: number): void {
    blocks.push({ kind: 'heading', level: 3, text: indentedName(node.name, depth), color: node.color })
    if (node.definition.trim()) blocks.push({ kind: 'paragraph', text: node.definition })
    if (includeVerbatim) {
      // Exactly this code, not its descendants (each descendant gets its
      // own heading and its own instances right below it in the walk).
      const instances = retrieveByCode(data, node.id, { includeDescendants: false })
      if (instances.length === 0 && node.children.length === 0) {
        blocks.push({ kind: 'paragraph', text: '(not yet applied to any passage)', style: 'meta' })
      }
      for (const instance of instances) {
        const doc = documentById.get(instance.documentId)
        blocks.push(
          quoteBlock(
            doc ? documentTextById.get(doc.id) ?? null : null,
            instance.segment.start,
            instance.segment.end,
            instance.segment.text,
            contextWords
          )
        )
        blocks.push({ kind: 'paragraph', text: instance.documentTitle, style: 'meta' })
      }
    }
    for (const child of node.children) walk(child, depth + 1)
  }

  const tree = buildTree(data.codes)
  if (tree.length === 0) blocks.push({ kind: 'paragraph', text: 'No codes yet.', style: 'meta' })
  for (const root of tree) walk(root, 0)
  return blocks
}

function noteBodyBlocks(note: NoteRecord): ReportBlock[] {
  const blocks: ReportBlock[] = []
  if (note.question) blocks.push({ kind: 'paragraph', text: `Q: ${note.question}` })
  blocks.push({ kind: 'paragraph', text: note.answer })
  return blocks
}

function noteVerbatimBlock(
  data: ProjectData,
  note: NoteRecord,
  contextWords: number,
  documentTextById: Map<string, string>
): ReportBlock | null {
  const attachedTo = note.attachedTo // stable local const — see the narrowing-pitfall notes elsewhere in this codebase
  if (attachedTo.kind !== 'segment') return null
  const segment = data.segments.find((s) => s.id === attachedTo.segmentId)
  if (!segment) return null
  return quoteBlock(documentTextById.get(segment.documentId) ?? null, segment.start, segment.end, segment.text, contextWords)
}

function buildNotesSection(data: ProjectData, includeVerbatim: boolean, contextWords: number): ReportBlock[] {
  const blocks: ReportBlock[] = [{ kind: 'heading', level: 2, text: 'Notes & clusters' }]
  const noteById = new Map(data.notes.map((n) => [n.id, n]))
  const documentTextById = new Map(data.documents.map((d) => [d.id, joinParagraphs(d.paragraphs)]))
  const clusteredNoteIds = new Set(data.categories.flatMap((c) => c.noteIds))

  function renderNote(note: NoteRecord): void {
    blocks.push(...noteBodyBlocks(note))
    if (includeVerbatim) {
      const quote = noteVerbatimBlock(data, note, contextWords, documentTextById)
      if (quote) blocks.push(quote)
    }
  }

  function walk(node: ClusterTreeNode, depth: number): void {
    const label = node.kind === 'question' ? `“${node.name}”` : node.name
    blocks.push({ kind: 'heading', level: 3, text: indentedName(label, depth), color: node.color })
    const notes = node.noteIds.map((id) => noteById.get(id)).filter((n): n is NoteRecord => Boolean(n))
    if (notes.length === 0 && node.children.length === 0) {
      blocks.push({ kind: 'paragraph', text: '(no notes filed here)', style: 'meta' })
    }
    for (const note of notes) renderNote(note)
    for (const child of node.children) walk(child, depth + 1)
  }

  const clusterTree = buildClusterTree(data.categories)
  if (clusterTree.length === 0) blocks.push({ kind: 'paragraph', text: 'No clusters yet.', style: 'meta' })
  for (const root of clusterTree) walk(root, 0)

  const unfiled = data.notes.filter((n) => !clusteredNoteIds.has(n.id))
  if (unfiled.length > 0) {
    blocks.push({ kind: 'heading', level: 3, text: 'Unfiled notes' })
    for (const note of unfiled) renderNote(note)
  }

  return blocks
}

function buildComparisonSection(data: ProjectData): ReportBlock[] {
  const cases = getCases(data)
  const flatCodes = flattenCodeTree(data.codes)
  if (cases.length === 0 || flatCodes.length === 0) {
    return [
      { kind: 'heading', level: 2, text: 'Cross-case comparison' },
      { kind: 'paragraph', text: 'Needs at least one document and one code.', style: 'meta' }
    ]
  }
  const cells = getCodeCaseMatrix(
    data,
    flatCodes.map((f) => f.code.id),
    true
  )
  const cellByKey = new Map(cells.map((c) => [`${c.codeId}:${c.documentId}`, c.count]))
  const headers = ['Code / item', ...cases.map((c) => c.documentTitle)]
  const rows = flatCodes.map(({ code, depth }) => [
    indentedName(code.name, depth),
    ...cases.map((c) => String(cellByKey.get(`${code.id}:${c.documentId}`) ?? 0))
  ])
  return [
    { kind: 'heading', level: 2, text: 'Cross-case comparison' },
    {
      kind: 'paragraph',
      text: 'Count of coded passages per code/item (rolled up with its sub-codes), per case (document).',
      style: 'meta'
    },
    { kind: 'table', headers, rows }
  ]
}

/** Assembles one Report from whichever sections are checked — the
 * flexible export dialog's whole "codebook / codebook+verbatim /
 * notes+clusters / notes+clusters+verbatim / cross-case comparison"
 * variant space all fall out of this one function and its options,
 * rather than being separate hardcoded report builders. */
export function buildProjectReport(data: ProjectData, options: ProjectReportOptions): Report {
  const blocks: ReportBlock[] = []
  if (options.includeCodes && options.includeFrequency) blocks.push(...buildFrequencySection(data))
  if (options.includeCodes) blocks.push(...buildCodebookSection(data, options.includeVerbatim, options.contextWords))
  if (options.includeNotes) blocks.push(...buildNotesSection(data, options.includeVerbatim, options.contextWords))
  if (options.includeComparison) blocks.push(...buildComparisonSection(data))
  if (blocks.length === 0) {
    blocks.push({ kind: 'paragraph', text: 'Nothing selected to export.', style: 'meta' })
  }
  return { title: `${data.name} — Report`, blocks }
}

// Also exported standalone — used by ExportView.tsx to gray out the
// "Include cross-case comparison" checkbox itself the same way
// ComparisonView.tsx does, so both explain "why is this disabled" the
// same way rather than drifting apart.
export function hasComparisonData(data: ProjectData): boolean {
  return data.documents.length > 0 && data.codes.length > 0
}
