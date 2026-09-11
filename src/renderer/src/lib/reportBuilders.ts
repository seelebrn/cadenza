// Builds the format-agnostic Report (see @shared/reportModel) the export
// dialog offers — one flexible document assembled from whichever sections
// the user checked, rather than several fixed, separately-triggered
// report types. Lives in renderer/src/lib (not @shared) because it needs
// buildClusterTree from this same directory — everything else it touches
// (@shared/codeTree, @shared/retrieval, @shared/comparison) is already
// pure/shared, this file just adds the tree-walking assembly on top.

import type { Report, ReportBlock } from '@shared/reportModel'
import type { CategoryRecord, DocumentRecord, NoteRecord, ProjectData } from '@shared/types'
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
    if (node.definition.trim()) blocks.push({ kind: 'paragraph', text: node.definition })
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

// ---------------------------------------------------------------------------
// Results draft — a deliberately different kind of export from
// buildProjectReport above. That one is an *inventory* (everything filed
// under every code/cluster, for reference). This one is a *drafting aid*:
// it reorganizes the same coded material around whichever axis the writer
// picks — by theme, by case, or by question — as a skeleton they still have
// to interpret and write into, not a finished analysis. Two things are
// deliberate, not incidental:
//   - no generated prose, ever. It only rearranges what the user already
//     wrote (quotes, their own notes) — never summarizes or paraphrases it.
//   - raw evidence (quotes) and the writer's own analytic notes are always
//     shown as visually separate blocks under a heading, never merged into
//     one paragraph, so the boundary between "what the data says" and
//     "what I think it means" stays visible on the page.
// The axis is a required, explicit choice (not auto-detected from the
// project's method) — which axis fits the analysis is itself a
// methodological decision the app shouldn't make on the writer's behalf.

export type ResultsDraftAxis = 'theme' | 'case' | 'question'

export interface ResultsDraftOptions {
  axis: ResultsDraftAxis
  /** The writer's own analytic notes/memos, shown under their own
   * "My analytic notes" heading, separate from the "Excerpts" heading. */
  includeNotes: boolean
  /** A plain "N excerpts · M cases" line per heading — a volume marker for
   * spotting a thin theme, not a claim about validity or agreement. */
  includeCounts: boolean
  contextWords: number
}

const RESULTS_DRAFT_PROMPT: Record<ResultsDraftAxis, string> = {
  theme: '[Interpretation to write — what does this theme contribute to the research question?]',
  case: '[Interpretation to write — what characterizes this case?]',
  question: '[Interpretation to write — what does this evidence suggest as an answer?]'
}

const RESULTS_DRAFT_AXIS_LABEL: Record<ResultsDraftAxis, string> = {
  theme: 'by theme',
  case: 'by case',
  question: 'by question'
}

interface DraftQuote {
  documentId: string
  documentTitle: string
  start: number
  end: number
  text: string
}

/** Every quote filed under a category, whether via a member code (rolled up
 * with that code's own sub-codes — a member code stands in for its whole
 * branch here, same reasoning as the cross-case matrix) or filed directly
 * as a raw segment, plus that category's own notes, chronological oldest
 * first (the order a questioning pass or memo trail was actually written
 * in). */
function categoryEvidence(
  data: ProjectData,
  node: CategoryRecord,
  documentById: Map<string, DocumentRecord>
): { quotes: DraftQuote[]; notes: NoteRecord[] } {
  const quotes: DraftQuote[] = []
  for (const codeId of node.codeIds) {
    for (const r of retrieveByCode(data, codeId, { includeDescendants: true })) {
      quotes.push({
        documentId: r.documentId,
        documentTitle: r.documentTitle,
        start: r.segment.start,
        end: r.segment.end,
        text: r.segment.text
      })
    }
  }
  const segmentById = new Map(data.segments.map((s) => [s.id, s]))
  for (const segmentId of node.segmentIds) {
    const segment = segmentById.get(segmentId)
    if (!segment) continue
    quotes.push({
      documentId: segment.documentId,
      documentTitle: documentById.get(segment.documentId)?.title ?? '(deleted document)',
      start: segment.start,
      end: segment.end,
      text: segment.text
    })
  }
  quotes.sort((a, b) => a.documentTitle.localeCompare(b.documentTitle) || a.start - b.start)

  const noteById = new Map(data.notes.map((n) => [n.id, n]))
  const notes = node.noteIds
    .map((id) => noteById.get(id))
    .filter((n): n is NoteRecord => Boolean(n))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))

  return { quotes, notes }
}

/** Renders one category's evidence — shared by the "by theme" and "by
 * question" axes below, which differ only in which nodes of the cluster
 * tree they walk, not in what gets shown for each one. `level` is the
 * heading level for this node itself (2-4, already clamped by the caller);
 * its "Excerpts"/"My analytic notes" sub-headings sit one level deeper,
 * clamped at 4 (docx/html headings only go that deep). */
function renderCategoryDraftBlocks(
  data: ProjectData,
  node: CategoryRecord,
  depth: number,
  level: 2 | 3 | 4,
  axis: ResultsDraftAxis,
  options: ResultsDraftOptions,
  documentById: Map<string, DocumentRecord>
): ReportBlock[] {
  const blocks: ReportBlock[] = []
  const label = node.kind === 'question' ? `“${node.name}”` : node.name
  blocks.push({ kind: 'heading', level, text: indentedName(label, depth), color: node.color })
  if (node.definition.trim()) blocks.push({ kind: 'paragraph', text: node.definition })

  const { quotes, notes } = categoryEvidence(data, node, documentById)
  const subLevel: 3 | 4 = level === 4 ? 4 : ((level + 1) as 3 | 4)

  if (options.includeCounts) {
    const cases = new Set(quotes.map((q) => q.documentId)).size
    blocks.push({
      kind: 'paragraph',
      text: `${quotes.length} excerpt${quotes.length === 1 ? '' : 's'} · ${cases} case${cases === 1 ? '' : 's'}`,
      style: 'meta'
    })
  }

  if (quotes.length === 0 && notes.length === 0) {
    blocks.push({ kind: 'paragraph', text: '(nothing filed here yet)', style: 'meta' })
  } else {
    if (quotes.length > 0) {
      blocks.push({ kind: 'heading', level: subLevel, text: 'Excerpts' })
      for (const q of quotes) {
        const fullText = documentById.get(q.documentId)
          ? joinParagraphs(documentById.get(q.documentId)!.paragraphs)
          : null
        blocks.push(quoteBlock(fullText, q.start, q.end, q.text, options.contextWords))
        blocks.push({ kind: 'paragraph', text: q.documentTitle, style: 'meta' })
      }
    }
    if (options.includeNotes && notes.length > 0) {
      blocks.push({ kind: 'heading', level: subLevel, text: 'My analytic notes' })
      for (const note of notes) blocks.push(...noteBodyBlocks(note))
    }
  }

  blocks.push({ kind: 'paragraph', text: RESULTS_DRAFT_PROMPT[axis], style: 'meta' })
  return blocks
}

function buildResultsDraftByTheme(data: ProjectData, options: ResultsDraftOptions): ReportBlock[] {
  const documentById = new Map(data.documents.map((d) => [d.id, d]))
  const tree = buildClusterTree(data.categories)
  if (tree.length === 0) {
    return [{ kind: 'paragraph', text: 'No clusters yet — group codes/notes into clusters first.', style: 'meta' }]
  }
  const blocks: ReportBlock[] = []
  function walk(node: ClusterTreeNode, depth: number): void {
    blocks.push(...renderCategoryDraftBlocks(data, node, depth, Math.min(depth + 2, 4) as 2 | 3 | 4, 'theme', options, documentById))
    for (const child of node.children) walk(child, depth + 1)
  }
  for (const root of tree) walk(root, 0)
  return blocks
}

// Every category can carry notes/codes/quotes regardless of its `kind`, so
// this walks the *whole* cluster tree (a question nested under a theme
// still surfaces) but only renders nodes actually marked kind: 'question'
// — a filtered view for an AQA-style question log, as opposed to the
// inclusive "by theme" axis above.
function buildResultsDraftByQuestion(data: ProjectData, options: ResultsDraftOptions): ReportBlock[] {
  const documentById = new Map(data.documents.map((d) => [d.id, d]))
  const tree = buildClusterTree(data.categories)
  const blocks: ReportBlock[] = []
  let rendered = 0
  function walk(node: ClusterTreeNode, depth: number): void {
    if (node.kind === 'question') {
      blocks.push(
        ...renderCategoryDraftBlocks(data, node, depth, Math.min(depth + 2, 4) as 2 | 3 | 4, 'question', options, documentById)
      )
      rendered++
    }
    for (const child of node.children) walk(child, depth + 1)
  }
  for (const root of tree) walk(root, 0)
  if (rendered === 0) {
    blocks.push({
      kind: 'paragraph',
      text: 'No question-clusters yet — an AQA-style question is a cluster whose "kind" is set to question.',
      style: 'meta'
    })
  }
  return blocks
}

// Case-first, rather than theme-first: preserves each interview's own
// internal logic (Kaufmann-style close reading) before any cross-case
// comparison — which is already covered separately by the cross-case
// comparison report/view, not duplicated here.
function buildResultsDraftByCase(data: ProjectData, options: ResultsDraftOptions): ReportBlock[] {
  const cases = getCases(data)
  if (cases.length === 0) {
    return [{ kind: 'paragraph', text: 'No documents yet.', style: 'meta' }]
  }
  const flatCodes = flattenCodeTree(data.codes)
  const blocks: ReportBlock[] = []

  for (const kase of cases) {
    blocks.push({ kind: 'heading', level: 2, text: kase.documentTitle })
    const doc = data.documents.find((d) => d.id === kase.documentId)
    const fullText = doc ? joinParagraphs(doc.paragraphs) : null

    const codeBlocks: ReportBlock[] = []
    let totalExcerpts = 0
    for (const { code, depth } of flatCodes) {
      const instances = retrieveByCode(data, code.id, { includeDescendants: false }).filter(
        (r) => r.documentId === kase.documentId
      )
      if (instances.length === 0) continue
      totalExcerpts += instances.length
      codeBlocks.push({ kind: 'heading', level: 3, text: indentedName(code.name, depth), color: code.color })
      for (const instance of instances) {
        codeBlocks.push(
          quoteBlock(fullText, instance.segment.start, instance.segment.end, instance.segment.text, options.contextWords)
        )
      }
    }

    if (options.includeCounts) {
      blocks.push({
        kind: 'paragraph',
        text: `${totalExcerpts} excerpt${totalExcerpts === 1 ? '' : 's'}`,
        style: 'meta'
      })
    }
    blocks.push(...(codeBlocks.length > 0 ? codeBlocks : [{ kind: 'paragraph', text: '(no coded passages in this case yet)', style: 'meta' } as ReportBlock]))

    if (options.includeNotes) {
      const caseNotes = data.notes
        .filter((n) => {
          const at = n.attachedTo
          if (at.kind === 'document') return at.documentId === kase.documentId
          if (at.kind === 'segment') return data.segments.find((s) => s.id === at.segmentId)?.documentId === kase.documentId
          return false
        })
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      if (caseNotes.length > 0) {
        blocks.push({ kind: 'heading', level: 3, text: 'My analytic notes' })
        for (const note of caseNotes) blocks.push(...noteBodyBlocks(note))
      }
    }

    blocks.push({ kind: 'paragraph', text: RESULTS_DRAFT_PROMPT.case, style: 'meta' })
  }
  return blocks
}

/** The results-draft export's entry point — see the block comment above
 * for why this is a separate report builder from buildProjectReport rather
 * than another checkbox in it. */
export function buildResultsDraftReport(data: ProjectData, options: ResultsDraftOptions): Report {
  const blocks =
    options.axis === 'theme'
      ? buildResultsDraftByTheme(data, options)
      : options.axis === 'case'
        ? buildResultsDraftByCase(data, options)
        : buildResultsDraftByQuestion(data, options)
  return { title: `${data.name} — Results draft (${RESULTS_DRAFT_AXIS_LABEL[options.axis]})`, blocks }
}
