// Core, method-agnostic data model. Analysis "modes" (coding, AQA-style
// question/answer notes, the visual grouping board, retrieval/matrix views)
// are all just views over these same records — see the plan for rationale.

export type ISODateString = string

export interface CodeNode {
  id: string
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
  /** Normalized paragraphs; segment offsets are relative to the joined text. */
  paragraphs: string[]
  sourceFormat: SourceFormat
  importedAt: ISODateString
}

export interface Segment {
  id: string
  documentId: string
  start: number
  end: number
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
  | { kind: 'project' }

export interface NoteRecord {
  id: string
  /** The analytic question posed to the text (AQA-style), if any. */
  question: string | null
  answer: string
  tags: string[]
  attachedTo: NoteAttachment
  createdAt: ISODateString
  updatedAt: ISODateString
}

export interface CategoryRecord {
  id: string
  name: string
  codeIds: string[]
  noteIds: string[]
}

export interface BoardItem {
  id: string
  boardId: string
  refType: 'code' | 'note'
  refId: string
  x: number
  y: number
  clusterId: string | null
}

export interface BoardRecord {
  id: string
  name: string
}

export const PROJECT_SCHEMA_VERSION = 1

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
  categories: CategoryRecord[]
  boards: BoardRecord[]
  boardItems: BoardItem[]
}

export interface RecentProjectEntry {
  filePath: string
  name: string
  lastOpenedAt: ISODateString
}
