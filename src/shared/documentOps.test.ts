import { describe, expect, it } from 'vitest'
import {
  computePrefixSuffixDiff,
  deleteAttribute,
  editParagraph,
  getAttributeNames,
  getAttributeValues,
  removeDocumentAttribute,
  renameAttribute,
  renameDocument,
  setDocumentAttribute
} from './documentOps'
import type { DocumentRecord, ProjectData, Segment } from './types'

function makeDoc(id: string, paragraphs: string[]): DocumentRecord {
  return { id, title: 'Doc', paragraphs, sourceFormat: 'txt', assetRelPath: null, importedAt: '0', attributes: {} }
}

function makeData(overrides: Partial<ProjectData> = {}): ProjectData {
  return {
    schemaVersion: 2,
    id: 'p1',
    name: 'Project',
    createdAt: '0',
    updatedAt: '0',
    documents: [],
    segments: [],
    codes: [],
    codings: [],
    notes: [],
    noteCategories: [],
    categories: [],
    boards: [],
    boardItems: [],
    boardClusters: [],
    boardLinks: [],
    clusterLinks: [],
    ...overrides
  } as ProjectData
}

describe('computePrefixSuffixDiff', () => {
  it('finds the exact non-overlapping prefix/suffix around an inserted word', () => {
    // "Hello world" -> "Hello brave world": common prefix "Hello " (6),
    // common suffix "world" (5) — NOT 6, since prefix and suffix must not
    // overlap and greedily extending the suffix into the shared 'o' would
    // double-count a character already claimed by the prefix.
    expect(computePrefixSuffixDiff('Hello world', 'Hello brave world')).toEqual({ prefixLen: 6, suffixLen: 5 })
  })

  it('the whole string changing gives zero prefix and suffix', () => {
    expect(computePrefixSuffixDiff('abc', 'xyz')).toEqual({ prefixLen: 0, suffixLen: 0 })
  })

  it('identical strings: prefix consumes everything, suffix is 0 (no overlap)', () => {
    expect(computePrefixSuffixDiff('same', 'same')).toEqual({ prefixLen: 4, suffixLen: 0 })
  })

  it('a pure append only extends the prefix', () => {
    expect(computePrefixSuffixDiff('abc', 'abcdef')).toEqual({ prefixLen: 3, suffixLen: 0 })
  })

  it('a pure prepend only extends the suffix', () => {
    expect(computePrefixSuffixDiff('abc', 'xyzabc')).toEqual({ prefixLen: 0, suffixLen: 3 })
  })

  it('an empty new text has nothing to match', () => {
    expect(computePrefixSuffixDiff('abc', '')).toEqual({ prefixLen: 0, suffixLen: 0 })
  })
})

describe('editParagraph', () => {
  it('is a no-op if the document does not exist', () => {
    const data = makeData()
    expect(editParagraph(data, 'missing', 0, 'x')).toBe(data)
  })

  it('is a no-op if the paragraph index is out of range', () => {
    const data = makeData({ documents: [makeDoc('d1', ['only paragraph'])] })
    expect(editParagraph(data, 'd1', 5, 'x')).toBe(data)
  })

  it('is a no-op if the text is unchanged', () => {
    const data = makeData({ documents: [makeDoc('d1', ['same text'])] })
    expect(editParagraph(data, 'd1', 0, 'same text')).toBe(data)
  })

  it('updates the paragraph text', () => {
    const data = makeData({ documents: [makeDoc('d1', ['old text'])] })
    const next = editParagraph(data, 'd1', 0, 'new text')
    expect(next.documents[0].paragraphs[0]).toBe('new text')
  })

  it('a segment entirely BEFORE the edited hole is untouched', () => {
    // "Hello world" -> "Hello brave world", editing the single paragraph.
    // A segment on "Hello" (0-5) sits before the hole (after the shared
    // prefix "Hello ") and must not move at all.
    const segment: Segment = { id: 's1', documentId: 'd1', start: 0, end: 5, text: 'Hello' }
    const data = makeData({ documents: [makeDoc('d1', ['Hello world'])], segments: [segment] })
    const next = editParagraph(data, 'd1', 0, 'Hello brave world')
    expect(next.segments[0]).toMatchObject({ start: 0, end: 5, text: 'Hello' })
  })

  it('a segment entirely AFTER the edited hole shifts by the length delta', () => {
    // "world" was at offset 6-11 in "Hello world" (len 11). New text
    // "Hello brave world" is 18 chars, "brave " (6 chars) was inserted
    // right before "world" — so "world" shifts from 6 to 12.
    const segment: Segment = { id: 's1', documentId: 'd1', start: 6, end: 11, text: 'world' }
    const data = makeData({ documents: [makeDoc('d1', ['Hello world'])], segments: [segment] })
    const next = editParagraph(data, 'd1', 0, 'Hello brave world')
    expect(next.segments[0]).toMatchObject({ start: 12, end: 17, text: 'world' }) // verbatim text snapshot never rewritten
  })

  it('a segment in a LATER paragraph shifts by the whole delta, unconditionally', () => {
    const data = makeData({
      documents: [makeDoc('d1', ['short', 'second paragraph text'])],
      // "second paragraph text" starts at offset 5 (len of "short") + 2
      // (the \n\n join) = 7. A segment on "second" (7-13).
      segments: [{ id: 's1', documentId: 'd1', start: 7, end: 13, text: 'second' }]
    })
    const next = editParagraph(data, 'd1', 0, 'a much longer first paragraph') // +25 chars
    const delta = 'a much longer first paragraph'.length - 'short'.length
    expect(next.segments[0]).toMatchObject({ start: 7 + delta, end: 13 + delta, text: 'second' })
  })

  it('a segment in an EARLIER paragraph than the one being edited is untouched', () => {
    const data = makeData({
      documents: [makeDoc('d1', ['first paragraph', 'second'])],
      segments: [{ id: 's1', documentId: 'd1', start: 0, end: 5, text: 'first' }]
    })
    const next = editParagraph(data, 'd1', 1, 'a totally different second paragraph')
    expect(next.segments[0]).toMatchObject({ start: 0, end: 5, text: 'first' })
  })

  it('a segment OVERLAPPING the edited hole relocates by finding its verbatim text elsewhere in the new paragraph', () => {
    // Segment on "brave" didn't itself change, but the edit's prefix/suffix
    // heuristic can't rule out overlap since "brave" sits right where text
    // was inserted around it. It should find "brave" verbatim in the new
    // text and re-anchor there exactly, not just shift by delta.
    const segment: Segment = { id: 's1', documentId: 'd1', start: 6, end: 11, text: 'brave' }
    const data = makeData({ documents: [makeDoc('d1', ['Hello brave world'])], segments: [segment] })
    const next = editParagraph(data, 'd1', 0, 'Hello very brave old world')
    const newParagraph = next.documents[0].paragraphs[0]
    const expectedStart = newParagraph.indexOf('brave')
    expect(next.segments[0]).toMatchObject({ start: expectedStart, end: expectedStart + 5, text: 'brave' })
  })

  it('a segment overlapping the hole whose verbatim text is GONE clamps into valid bounds rather than erroring, keeping its original verbatim snapshot', () => {
    const segment: Segment = { id: 's1', documentId: 'd1', start: 6, end: 11, text: 'brave' }
    const data = makeData({ documents: [makeDoc('d1', ['Hello brave world'])], segments: [segment] })
    const next = editParagraph(data, 'd1', 0, 'Hello timid world') // "brave" no longer appears anywhere
    const clamped = next.segments[0]
    expect(clamped.text).toBe('brave') // verbatim snapshot never rewritten
    expect(clamped.start).toBeGreaterThanOrEqual(0)
    expect(clamped.end).toBeLessThanOrEqual(next.documents[0].paragraphs[0].length)
    expect(clamped.start).toBeLessThanOrEqual(clamped.end)
  })

  it('only touches segments in the edited document, leaving other documents alone', () => {
    const data = makeData({
      documents: [makeDoc('d1', ['a']), makeDoc('d2', ['b'])],
      segments: [{ id: 's1', documentId: 'd2', start: 0, end: 1, text: 'b' }]
    })
    const next = editParagraph(data, 'd1', 0, 'much longer a')
    expect(next.segments[0]).toMatchObject({ start: 0, end: 1 })
  })
})

describe('renameDocument', () => {
  it('only touches the targeted document', () => {
    const data = makeData({ documents: [makeDoc('d1', ['x']), makeDoc('d2', ['y'])] })
    const next = renameDocument(data, 'd1', 'New title')
    expect(next.documents.find((d) => d.id === 'd1')?.title).toBe('New title')
    expect(next.documents.find((d) => d.id === 'd2')?.title).toBe('Doc')
  })
})

describe('case attributes', () => {
  function withDocs(attrs: Array<Record<string, string>>): ProjectData {
    return makeData({
      documents: attrs.map((attributes, i) => ({
        id: `d${i}`,
        title: `Doc ${i}`,
        paragraphs: ['x'],
        sourceFormat: 'txt',
        assetRelPath: null,
        importedAt: `2020-01-0${i + 1}`,
        attributes
      }))
    })
  }

  it('setDocumentAttribute creates or updates one attribute on one document, trimming, ignoring an empty name', () => {
    let data = withDocs([{}, {}])
    data = setDocumentAttribute(data, 'd0', '  Role ', ' nurse ')
    expect(data.documents[0].attributes).toEqual({ Role: 'nurse' })
    expect(data.documents[1].attributes).toEqual({})
    data = setDocumentAttribute(data, 'd0', 'Role', 'manager')
    expect(data.documents[0].attributes).toEqual({ Role: 'manager' })
    expect(setDocumentAttribute(data, 'd0', '   ', 'x')).toBe(data)
    // An empty value still creates the attribute, so the column exists to fill in.
    data = setDocumentAttribute(data, 'd1', 'Role', '')
    expect(data.documents[1].attributes).toEqual({ Role: '' })
  })

  it('getAttributeNames is the union in first-seen order; getAttributeValues is distinct, non-empty, sorted numerically', () => {
    const data = withDocs([{ Role: 'nurse', Site: 'B' }, { Age: '10', Role: '' }, { Age: '9', Role: 'manager' }])
    expect(getAttributeNames(data)).toEqual(['Role', 'Site', 'Age'])
    expect(getAttributeValues(data, 'Role')).toEqual(['manager', 'nurse'])
    expect(getAttributeValues(data, 'Age')).toEqual(['9', '10'])
    expect(getAttributeValues(data, 'Nope')).toEqual([])
  })

  it('removeDocumentAttribute, renameAttribute and deleteAttribute', () => {
    let data = withDocs([{ Role: 'nurse', Site: 'A' }, { Role: 'manager' }, { Site: 'B', Job: 'x' }])
    data = removeDocumentAttribute(data, 'd0', 'Site')
    expect(data.documents[0].attributes).toEqual({ Role: 'nurse' })
    expect(removeDocumentAttribute(data, 'd1', 'Site').documents[1]).toBe(data.documents[1])

    data = renameAttribute(data, 'Role', 'Job')
    expect(data.documents[0].attributes).toEqual({ Job: 'nurse' })
    expect(data.documents[1].attributes).toEqual({ Job: 'manager' })
    // Merging into an existing name keeps that document's existing value.
    expect(data.documents[2].attributes).toEqual({ Site: 'B', Job: 'x' })
    expect(renameAttribute(data, 'Job', 'Job')).toBe(data)

    data = deleteAttribute(data, 'Job')
    expect(getAttributeNames(data)).toEqual(['Site'])
  })
})
