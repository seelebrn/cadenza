import { describe, expect, it } from 'vitest'
import {
  buildQdpx,
  codePointsToCodeUnits,
  codeUnitsToCodePoints,
  ITEMS_SET_NAME,
  normalizeSourceText,
  parseQdpx,
  toGuid
} from './refiQda'
import { joinParagraphs } from './text'
import type { ProjectData } from './types'

function makeData(overrides: Partial<ProjectData> = {}): ProjectData {
  return {
    schemaVersion: 2, id: 'proj1', name: 'Étude & co', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z',
    documents: [], segments: [], codes: [], codings: [], notes: [], noteCategories: [], categories: [],
    boards: [], boardItems: [], boardClusters: [], boardLinks: [], clusterLinks: [],
    ...overrides
  } as ProjectData
}

const sample = makeData({
  documents: [
    { id: 'd1', title: 'Interview 1', paragraphs: ['Il parle de la réunion.', 'Puis <de> la "charge" & travail.'], sourceFormat: 'docx', assetRelPath: null, importedAt: '2026-01-01T10:00:00.000Z', attributes: { Role: 'nurse', Site: 'A' } },
    { id: 'd2', title: 'Interview 2', paragraphs: ['Deuxième entretien.'], sourceFormat: 'txt', assetRelPath: null, importedAt: '2026-01-01T11:00:00.000Z', attributes: { Role: 'manager' } }
  ],
  codes: [
    { id: 'c1', kind: 'code', name: 'Work', color: '#ff0000', definition: 'About work', parentId: null, createdAt: '0' },
    { id: 'c2', kind: 'code', name: 'Load', color: '#00ff00', definition: '', parentId: 'c1', createdAt: '0' },
    { id: 'c3', kind: 'item', name: 'Obstacle', color: '#0000ff', definition: '', parentId: null, createdAt: '0' }
  ],
  segments: [
    { id: 's1', documentId: 'd1', start: 15, end: 22, text: 'réunion' },
    { id: 's2', documentId: 'd1', start: 25, end: 56, text: 'Puis <de> la "charge" & travail' },
    { id: 's3', documentId: 'd2', start: 0, end: 8, text: 'Deuxième' }
  ],
  codings: [
    { id: 'k1', segmentId: 's1', codeId: 'c1', createdAt: '2026-01-01T12:00:00.000Z' },
    { id: 'k2', segmentId: 's2', codeId: 'c2', createdAt: '2026-01-01T12:00:00.000Z' },
    { id: 'k3', segmentId: 's2', codeId: 'c3', createdAt: '2026-01-01T12:00:00.000Z' }
  ],
  notes: [
    { id: 'n1', question: 'Why now?', answer: 'Because of the merger.', tags: ['t'], noteCategoryId: null, attachedTo: { kind: 'segment', segmentId: 's1' }, createdAt: '2026-01-01T13:00:00.000Z', updatedAt: '2026-01-01T13:00:00.000Z' },
    { id: 'n2', question: null, answer: 'Overall impression.', tags: [], noteCategoryId: null, attachedTo: { kind: 'document', documentId: 'd2' }, createdAt: '2026-01-01T13:00:00.000Z', updatedAt: '2026-01-01T13:00:00.000Z' },
    { id: 'n3', question: null, answer: 'Code memo.', tags: [], noteCategoryId: null, attachedTo: { kind: 'code', codeId: 'c1' }, createdAt: '2026-01-01T13:00:00.000Z', updatedAt: '2026-01-01T13:00:00.000Z' },
    { id: 'n4', question: null, answer: 'Project-level thought.', tags: [], noteCategoryId: null, attachedTo: { kind: 'project' }, createdAt: '2026-01-01T13:00:00.000Z', updatedAt: '2026-01-01T13:00:00.000Z' }
  ],
  categories: [
    { id: 'cat1', kind: 'theme', name: 'Pressure', color: '#abc', definition: 'A theme', codeIds: ['c1', 'c2'], noteIds: ['n2'], segmentIds: [], parentCategoryId: null, createdAt: '0' }
  ]
})

describe('toGuid', () => {
  it('is deterministic, UUID-shaped, and keeps an existing UUID', () => {
    expect(toGuid('abc')).toBe(toGuid('abc'))
    expect(toGuid('abc')).not.toBe(toGuid('abd'))
    expect(toGuid('abc')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(toGuid('9C6AB5B4-1F41-4C6D-9F66-9E6D34F4A7B1')).toBe('9c6ab5b4-1f41-4c6d-9f66-9e6d34f4a7b1')
  })
})

describe('buildQdpx → parseQdpx round trip', () => {
  const bundle = buildQdpx(sample, 'Cadenza test')
  const readSource = (path: string): string | undefined => bundle.sources[path]
  const { data: back, report } = parseQdpx(bundle.qde, readSource)

  it('writes one plain-text source per document, the joined text exactly', () => {
    expect(Object.keys(bundle.sources)).toHaveLength(2)
    expect(bundle.sources[`sources/${toGuid('d1')}.txt`]).toBe(joinParagraphs(sample.documents[0].paragraphs))
    expect(bundle.qde).toContain('urn:QDA-XML:project:1.0')
    expect(bundle.qde).toContain('&amp;')
  })

  it('brings back documents with their text, attributes, and title', () => {
    expect(report.documents).toBe(2)
    expect(back.name).toBe('Étude & co')
    const d1 = back.documents.find((d) => d.title === 'Interview 1')!
    expect(joinParagraphs(d1.paragraphs)).toBe(joinParagraphs(sample.documents[0].paragraphs))
    expect(d1.attributes).toEqual({ Role: 'nurse', Site: 'A' })
    expect(back.documents.find((d) => d.title === 'Interview 2')!.attributes).toEqual({ Role: 'manager' })
  })

  it('brings back the code tree with colors, definitions, and item kinds', () => {
    const byName = new Map(back.codes.map((c) => [c.name, c]))
    expect(byName.get('Work')).toMatchObject({ color: '#ff0000', definition: 'About work', parentId: null, kind: 'code' })
    expect(byName.get('Load')!.parentId).toBe(byName.get('Work')!.id)
    expect(byName.get('Obstacle')!.kind).toBe('item')
    // The marker set is consumed, not turned into a cluster.
    expect(back.categories.some((c) => c.name === ITEMS_SET_NAME)).toBe(false)
  })

  it('brings back every coded passage pointing at the same words, with its codings', () => {
    expect(back.segments).toHaveLength(3)
    for (const original of sample.segments) {
      const doc = back.documents.find((d) => d.title === sample.documents.find((x) => x.id === original.documentId)!.title)!
      const segment = back.segments.find((s) => s.documentId === doc.id && s.text === original.text)!
      expect(segment, original.text).toBeDefined()
      expect(joinParagraphs(doc.paragraphs).slice(segment.start, segment.end)).toBe(original.text)
    }
    expect(report.codings).toBe(3)
    const load = back.codes.find((c) => c.name === 'Load')!
    const obstacle = back.codes.find((c) => c.name === 'Obstacle')!
    const s2 = back.segments.find((s) => s.text.startsWith('Puis'))!
    expect(back.codings.filter((k) => k.segmentId === s2.id).map((k) => k.codeId).sort()).toEqual([load.id, obstacle.id].sort())
  })

  it('brings back notes with their question, and attached where they were', () => {
    expect(report.notes).toBe(4)
    const byAnswer = new Map(back.notes.map((n) => [n.answer, n]))
    const segmentNote = byAnswer.get('Because of the merger.')!
    expect(segmentNote.question).toBe('Why now?')
    expect(segmentNote.attachedTo.kind).toBe('segment')
    expect(byAnswer.get('Overall impression.')!.attachedTo).toEqual({ kind: 'document', documentId: back.documents.find((d) => d.title === 'Interview 2')!.id })
    expect(byAnswer.get('Code memo.')!.attachedTo).toEqual({ kind: 'code', codeId: back.codes.find((c) => c.name === 'Work')!.id })
    expect(byAnswer.get('Project-level thought.')!.attachedTo).toEqual({ kind: 'project' })
  })

  it('brings back clusters as sets with their code and note members', () => {
    expect(report.clusters).toBe(1)
    const cluster = back.categories[0]
    expect(cluster.name).toBe('Pressure')
    expect(cluster.definition).toBe('A theme')
    expect(cluster.codeIds.sort()).toEqual([toGuid('c1'), toGuid('c2')].sort())
    expect(cluster.noteIds).toEqual([toGuid('n2')])
  })

  it('keeps the GUIDs of codes, sources, passages, codings, notes and sets across a second round trip', () => {
    // (Cases and the user are regenerated: Cadenza has no ids of its own for them.)
    const again = buildQdpx(back, 'Cadenza test')
    for (const id of ['c1', 'c2', 'c3', 'd1', 'd2', 's1', 's2', 's3', 'k1', 'k2', 'k3', 'n1', 'n2', 'n3', 'n4', 'cat1']) {
      expect(again.qde, id).toContain(`guid="${toGuid(id)}"`)
    }
  })
})

describe('parseQdpx on a file from another tool', () => {
  // CRLF line ends, a blank-line run, leading whitespace, inline text
  // content instead of a sources/ file, a PDF source with a text
  // representation, an audio source, a case with an integer variable.
  const raw = '\r\n\r\nFirst para.\r\nStill first.\r\n\r\n\r\n\r\nSecond para here.\r\n'
  const qde = `<?xml version="1.0"?>
<Project xmlns="urn:QDA-XML:project:1.0" name="Other tool export">
  <CodeBook><Codes>
    <Code guid="11111111-1111-4111-8111-111111111111" name="Alpha" isCodable="true" color="#123456"/>
  </Codes></CodeBook>
  <Variables><Variable guid="33333333-3333-4333-8333-333333333333" name="Age" typeOfVariable="Integer"/></Variables>
  <Cases><Case guid="44444444-4444-4444-8444-444444444444" name="P1">
    <VariableValue><VariableRef targetGUID="33333333-3333-4333-8333-333333333333"/><IntegerValue>42</IntegerValue></VariableValue>
    <SourceRef targetGUID="22222222-2222-4222-8222-222222222222"/>
  </Case></Cases>
  <Sources>
    <TextSource guid="22222222-2222-4222-8222-222222222222" name="Inline one">
      <PlainTextContent>${raw.replace(/\r/g, '&#13;')}</PlainTextContent>
      <PlainTextSelection guid="55555555-5555-4555-8555-555555555555" name="Still" startPosition="${raw.indexOf('Still')}" endPosition="${raw.indexOf('Still') + 5}">
        <Coding guid="66666666-6666-4666-8666-666666666666"><CodeRef targetGUID="11111111-1111-4111-8111-111111111111"/></Coding>
      </PlainTextSelection>
      <PlainTextSelection guid="57555555-5555-4555-8555-555555555555" name="Second" startPosition="${raw.indexOf('Second')}" endPosition="${raw.indexOf('Second') + 6}"/>
    </TextSource>
    <PDFSource guid="77777777-7777-4777-8777-777777777777" name="Scan"><Representation guid="78777777-7777-4777-8777-777777777777" plainTextPath="internal://scan.txt"/></PDFSource>
    <AudioSource guid="88888888-8888-4888-8888-888888888888" name="Recording" path="internal://a.mp3"/>
  </Sources>
</Project>`
  const { data, report } = parseQdpx(qde, (path) => (path === 'sources/scan.txt' ? 'Scanned text.' : undefined))

  it('normalizes line ends and blank runs while every selection still points at the same words', () => {
    const doc = data.documents.find((d) => d.title === 'Inline one')!
    expect(doc.paragraphs).toEqual(['First para.\nStill first.', 'Second para here.'])
    const full = joinParagraphs(doc.paragraphs)
    const texts = data.segments.filter((s) => s.documentId === doc.id).map((s) => full.slice(s.start, s.end))
    expect(texts).toEqual(['Still', 'Second'])
    expect(data.segments.find((s) => s.text === 'Still')!.text).toBe('Still')
  })

  it('reads a PDF source through its text representation, skips audio with a reason, and maps an integer variable', () => {
    expect(report.documents).toBe(2)
    expect(data.documents.find((d) => d.title === 'Scan')).toMatchObject({ sourceFormat: 'pdf', paragraphs: ['Scanned text.'] })
    expect(report.skipped).toEqual(['Audio source “Recording” — only text sources can be imported'])
    expect(data.documents.find((d) => d.title === 'Inline one')!.attributes).toEqual({ Age: '42' })
    expect(data.codings).toHaveLength(1)
    expect(data.codes[0]).toMatchObject({ id: '11111111-1111-4111-8111-111111111111', color: '#123456' })
  })

  it('refuses something that is not a REFI project', () => {
    expect(() => parseQdpx('<Nope/>', () => undefined)).toThrow(/REFI-QDA/)
  })
})

describe('normalizeSourceText', () => {
  it('maps offsets through CR removal, blank-run collapsing, and trimming', () => {
    const raw = '\r\n\r\nAb\r\ncd\r\n\r\n\r\n\r\nEf\r\n'
    const { text, mapOffset } = normalizeSourceText(raw)
    expect(text).toBe('Ab\ncd\n\nEf')
    for (const word of ['Ab', 'cd', 'Ef']) {
      const start = raw.indexOf(word)
      expect(text.slice(mapOffset(start), mapOffset(start + word.length))).toBe(word)
    }
    // A position inside a dropped range lands at the range's start.
    expect(text.slice(mapOffset(1), mapOffset(1))).toBe('')
    expect(mapOffset(raw.length)).toBe(text.length)
  })

  it('leaves clean text alone', () => {
    const { text, mapOffset } = normalizeSourceText('One.\n\nTwo.')
    expect(text).toBe('One.\n\nTwo.')
    expect(mapOffset(6)).toBe(6)
  })
})

describe('parseQdpx: non-codable codes are categories (QualCoder, NVivo folders, MAXQDA groups)', () => {
  // Reported with a QualCoder 3.8.2 export: its categories came in as codes,
  // and their codes as sub-codes. QualCoder writes a category as a Code
  // with isCodable="false", nested as deep as the category tree goes.
  const g = (n: number): string => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
  const qde = `<?xml version="1.0" encoding="utf-8"?>
<Project xmlns="urn:QDA-XML:project:1.0" name="QualCoder style" origin="QualCoder 3.8.2">
  <CodeBook><Codes>
    <Code guid="${g(1)}" name="04 Barri&#xE8;res" isCodable="false">
      <Description>Obstacles to research</Description>
      <NoteRef targetGUID="${g(90)}"/>
      <Code guid="${g(2)}" name="B : Peu d&#x27;encadrement" isCodable="true" color="#880E4F">
        <Code guid="${g(3)}" name="Sub-code" isCodable="true" color="#111111"/>
      </Code>
      <Code guid="${g(4)}" name="B - Environnement" isCodable="false">
        <Code guid="${g(5)}" name="B - Au sein du service" isCodable="false">
          <Code guid="${g(6)}" name="Etab : pas de temps" isCodable="true" color="#222222"/>
        </Code>
        <Code guid="${g(7)}" name="Env code" isCodable="true"/>
      </Code>
    </Code>
    <Code guid="${g(8)}" name="Top-level code" isCodable="true" color="#333333"/>
  </Codes></CodeBook>
  <Sources>
    <TextSource guid="${g(20)}" name="Doc">
      <PlainTextContent>Hello world here.</PlainTextContent>
      <PlainTextSelection guid="${g(21)}" startPosition="0" endPosition="5">
        <Coding guid="${g(22)}"><CodeRef targetGUID="${g(6)}"/></Coding>
        <Coding guid="${g(23)}"><CodeRef targetGUID="${g(4)}"/></Coding>
      </PlainTextSelection>
    </TextSource>
  </Sources>
  <Notes><Note guid="${g(90)}" name="memo"><PlainTextContent>About barriers.</PlainTextContent></Note></Notes>
</Project>`
  const { data, report } = parseQdpx(qde, () => undefined)
  const byName = (name: string): { id: string } => [...data.codes, ...data.categories].find((x) => x.name === name)!

  it('turns every non-codable code into a cluster, keeping the category tree', () => {
    expect(data.categories.map((c) => c.name).sort()).toEqual(['04 Barrières', 'B - Au sein du service', 'B - Environnement'])
    const top = data.categories.find((c) => c.name === '04 Barrières')!
    const env = data.categories.find((c) => c.name === 'B - Environnement')!
    const service = data.categories.find((c) => c.name === 'B - Au sein du service')!
    expect(top.parentCategoryId).toBeNull()
    expect(env.parentCategoryId).toBe(top.id)
    expect(service.parentCategoryId).toBe(env.id)
    expect(top.definition).toBe('Obstacles to research')
    expect(report.clusters).toBe(3)
    expect(data.codes.some((c) => c.name === '04 Barrières')).toBe(false)
  })

  it('files each code under the category directly above it; codes under categories are top-level codes', () => {
    const top = data.categories.find((c) => c.name === '04 Barrières')!
    const env = data.categories.find((c) => c.name === 'B - Environnement')!
    const service = data.categories.find((c) => c.name === 'B - Au sein du service')!
    expect(top.codeIds).toEqual([byName("B : Peu d'encadrement").id])
    expect(env.codeIds).toEqual([byName('Env code').id])
    expect(service.codeIds).toEqual([byName('Etab : pas de temps').id])
    for (const name of ["B : Peu d'encadrement", 'Env code', 'Etab : pas de temps', 'Top-level code']) {
      expect(data.codes.find((c) => c.name === name)!.parentId, name).toBeNull()
    }
    // A codable code under a codable code keeps its hierarchy, and isn't
    // filed separately (it comes along with its parent).
    expect(data.codes.find((c) => c.name === 'Sub-code')!.parentId).toBe(byName("B : Peu d'encadrement").id)
    expect(report.codes).toBe(5)
  })

  it('keeps codings on codes, reports a coding that pointed at a category, and attaches a category note to the cluster', () => {
    expect(data.codings.map((c) => c.codeId)).toEqual([byName('Etab : pas de temps').id])
    expect(report.skipped).toEqual(['1 coding applied to a category (a non-codable grouping) — only codes can code a passage'])
    expect(data.notes[0].attachedTo).toEqual({ kind: 'category', categoryId: byName('04 Barrières').id })
  })
})

describe('REFI-QDA positions are characters, not UTF-16 code units', () => {
  it('converts both ways, and is the identity for text without astral characters', () => {
    const plain = 'Élève à côté'
    expect(codePointsToCodeUnits(plain)(5)).toBe(5)
    expect(codeUnitsToCodePoints(plain)(5)).toBe(5)
    const withEmoji = 'ok 😀 then word'
    // "word" starts at code unit 11 but character 10.
    expect(withEmoji.indexOf('word')).toBe(11)
    expect(codeUnitsToCodePoints(withEmoji)(11)).toBe(10)
    expect(codePointsToCodeUnits(withEmoji)(10)).toBe(11)
  })

  it('a passage after an emoji round-trips to the same words, with character positions in the XML', () => {
    const data = makeData({
      documents: [{ id: 'd', title: 'T', paragraphs: ['Hi 😀 there, some words here.'], sourceFormat: 'txt', assetRelPath: null, importedAt: '0', attributes: {} }],
      codes: [{ id: 'c', kind: 'code', name: 'C', color: '#000000', definition: '', parentId: null, createdAt: '0' }],
      segments: [{ id: 's', documentId: 'd', start: 13, end: 23, text: 'some words' }],
      codings: [{ id: 'k', segmentId: 's', codeId: 'c', createdAt: '0' }]
    })
    expect('Hi 😀 there, some words here.'.slice(13, 23)).toBe('some words')
    const bundle = buildQdpx(data, 't')
    expect(bundle.qde).toContain('startPosition="12"')
    expect(bundle.qde).toContain('endPosition="22"')
    const { data: back } = parseQdpx(bundle.qde, (p) => bundle.sources[p])
    const doc = back.documents[0]
    const seg = back.segments[0]
    expect(joinParagraphs(doc.paragraphs).slice(seg.start, seg.end)).toBe('some words')
  })
})

describe('parseQdpx: how a source file with Windows line endings is counted', () => {
  // QualCoder reads text files in universal-newline mode, so its positions
  // count "\r\n" as one character; its source files also start with a BOM.
  // Reported: a QualCoder project's 1,303 passages all came in a few
  // characters early.
  const raw = '\uFEFFWEBVTT\r\n\r\n[02]: Du coup, je suis Charlotte.\r\nPar exemple... en clinique, on se pose une question.\r\n'
  const lf = raw.slice(1).replace(/\r\n/g, '\n')
  const passage = 'en clinique'
  const start = lf.indexOf(passage)

  function importWith(startPosition: number, endPosition: number, name: string): string {
    const qde = `<Project xmlns="urn:QDA-XML:project:1.0" name="x">
      <CodeBook><Codes><Code guid="11111111-1111-4111-8111-111111111111" name="C" isCodable="true"/></Codes></CodeBook>
      <Sources><TextSource guid="22222222-2222-4222-8222-222222222222" name="charlotte.docx" plainTextPath="internal://t.txt">
        <PlainTextSelection guid="33333333-3333-4333-8333-333333333333" name="${name}" startPosition="${startPosition}" endPosition="${endPosition}">
          <Coding guid="44444444-4444-4444-8444-444444444444"><CodeRef targetGUID="11111111-1111-4111-8111-111111111111"/></Coding>
        </PlainTextSelection>
      </TextSource></Sources></Project>`
    const { data } = parseQdpx(qde, (p) => (p === 'sources/t.txt' ? raw : undefined))
    const full = joinParagraphs(data.documents[0].paragraphs)
    return full.slice(data.segments[0].start, data.segments[0].end)
  }

  it('QualCoder-style positions (BOM not counted, CRLF as one) land on the recorded words', () => {
    expect(importWith(start, start + passage.length, passage)).toBe(passage)
  })

  it('positions counting both characters of each CRLF also land, when the recorded words say so', () => {
    const rawStart = raw.slice(1).indexOf(passage)
    expect(rawStart).toBeGreaterThan(start)
    expect(importWith(rawStart, rawStart + passage.length, passage)).toBe(passage)
  })

  it('with no recorded words to go by, CRLF counts as one (the common convention)', () => {
    expect(importWith(start, start + passage.length, '')).toBe(passage)
  })
})
