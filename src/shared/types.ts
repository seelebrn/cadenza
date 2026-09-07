// Core, method-agnostic data model.
//
// Philosophy: coding is one lens among several, not the privileged one.
// Notes/memos (optionally structured as an AQA-style question+answer),
// codes AND lightweight inventory "items", and the visual grouping board
// are all equally first-class ways to work with a segment of text — they
// all attach to the same underlying unit. A Category can itself represent
// an analytic question (Paillé & Mucchielli-style), not just a theme label.
//
// Whenever text is coded, memoed, or itemized, the verbatim quote is
// captured on the Segment at that moment (not just start/end offsets) so
// the exact quote survives even if the source document is later edited.

export type ISODateString = string

/** Raw bytes kept alongside project.json in the .qdaproj zip, keyed by their
 * path under the zip's assets/ folder (e.g. "documents/<id>.docx"). */
export type SerializedAssets = Record<string, Uint8Array>

/** 'code' = classic thematic coding; 'item' = lighter-weight inventory/
 * enumerative unit (e.g. "list the obstacles mentioned") — same mechanics
 * (hierarchy, color, merge, regrouping), different analytic intent. */
export type TagKind = 'code' | 'item'

export interface CodeNode {
  id: string
  kind: TagKind
  name: string
  color: string
  definition: string
  parentId: string | null
  createdAt: ISODateString
}

export type SourceFormat = 'docx' | 'odt' | 'txt' | 'xlsx' | 'manual'

export interface DocumentRecord {
  id: string
  title: string
  /** Normalized paragraphs; segment offsets are relative to their join — see joinParagraphs(). */
  paragraphs: string[]
  sourceFormat: SourceFormat
  /** Path of the original imported file's bytes within the project's assets, if kept. */
  assetRelPath: string | null
  importedAt: ISODateString
}

export interface ImportedDocument {
  document: DocumentRecord
  assetBytes: Uint8Array
}

export interface Segment {
  id: string
  documentId: string
  start: number
  end: number
  /** Verbatim snapshot of the source text at start:end, captured when the segment was created. */
  text: string
}

export interface Coding {
  id: string
  segmentId: string
  codeId: string
  createdAt: ISODateString
}

export type NoteAttachment =
  | { kind: 'segment'; segmentId: string }
  | { kind: 'document'; documentId: string }
  | { kind: 'code'; codeId: string }
  | { kind: 'category'; categoryId: string }
  | { kind: 'project' }

/**
 * A user-editable catalog entry for classifying notes — e.g. the
 * thematic/linguistic/conceptual remark types from comprehensive-interview
 * analysis (Kaufmann). Distinct from CategoryRecord below: this is a small,
 * flat, per-project list of note "kinds" with a color, not an emergent
 * grouping cluster. Optional — a note need not have one.
 */
export interface NoteCategoryDef {
  id: string
  name: string
  color: string
  createdAt: ISODateString
}

export interface NoteRecord {
  id: string
  /** The analytic question posed to the text (AQA-style), if any. */
  question: string | null
  answer: string
  tags: string[]
  /** Optional classification against ProjectData.noteCategories. */
  noteCategoryId: string | null
  attachedTo: NoteAttachment
  createdAt: ISODateString
  updatedAt: ISODateString
}

/** 'theme' = an emergent thematic cluster; 'question' = the category itself
 * *is* an analytic question (Paillé & Mucchielli AQA-style) — `name` holds
 * the question text, and codes/notes/segments filed under it are read as
 * answers or evidence rather than instances of a theme. */
export type CategoryKind = 'theme' | 'question'

export interface CategoryRecord {
  id: string
  kind: CategoryKind
  name: string
  color: string
  codeIds: string[]
  noteIds: string[]
  /** Raw quotes filed directly under this category without a Note wrapper. */
  segmentIds: string[]
  /** A superordinate category (IPA-style superordinate/subordinate themes) —
   * same hierarchy concept as CodeNode.parentId. On the board, nesting one
   * cluster inside another sets this. */
  parentCategoryId: string | null
  createdAt: ISODateString
}

export interface BoardItem {
  id: string
  boardId: string
  refType: 'code' | 'note' | 'segment'
  refId: string
  x: number
  y: number
}

/**
 * A visual frame on the board — *always* backed by a real CategoryRecord;
 * there is no separate "promote to category" step. name/color/membership
 * all come from the CategoryRecord (categoryId): dragging an item into the
 * frame adds it to that category directly, and renaming/recoloring the
 * category from anywhere (Categories view, another board) is instantly
 * reflected here, because it's the same record, not a copy kept in sync.
 * A category may have a cluster shape on several boards independently (or
 * none), since the same category can be visualized differently per board.
 */
export interface BoardCluster {
  id: string
  boardId: string
  categoryId: string
  x: number
  y: number
  width: number
  height: number
  createdAt: ISODateString
}

/** A direct connection between two board items, made by dragging one close
 * to the other (a "snap"); severable explicitly or by dragging them apart
 * again. Distinct from cluster membership — a link is a pairwise relation,
 * not a spatial grouping. */
export interface BoardLink {
  id: string
  boardId: string
  itemAId: string
  itemBId: string
  createdAt: ISODateString
}

export interface BoardRecord {
  id: string
  name: string
  /** The default board auto-shows every code and note (see boardOps.ts) —
   * exactly one board should have this set at a time. Other boards are
   * opt-in/curated: codes/notes/clusters only appear once explicitly added. */
  isDefault: boolean
}

export const PROJECT_SCHEMA_VERSION = 2

export interface ProjectData {
  schemaVersion: typeof PROJECT_SCHEMA_VERSION
  id: string
  name: string
  createdAt: ISODateString
  updatedAt: ISODateString
  documents: DocumentRecord[]
  segments: Segment[]
  codes: CodeNode[]
  codings: Coding[]
  notes: NoteRecord[]
  noteCategories: NoteCategoryDef[]
  categories: CategoryRecord[]
  boards: BoardRecord[]
  boardItems: BoardItem[]
  boardClusters: BoardCluster[]
  boardLinks: BoardLink[]
}

export interface RecentProjectEntry {
  filePath: string
  name: string
  lastOpenedAt: ISODateString
}
