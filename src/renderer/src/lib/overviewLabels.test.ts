import { describe, expect, it } from 'vitest'
import { layoutOverviewLabels, wrapText, type OverviewLabelInput } from './overviewLabels'

// Every character is 0.5em wide.
const measure = (text: string, fontPx: number): number => text.length * fontPx * 0.5

function box(id: string, x: number, y: number, width: number, height: number, depth: number, text: string): OverviewLabelInput {
  return { id, x, y, width, height, depth, text }
}

describe('wrapText', () => {
  it('keeps a short name on one line', () => {
    expect(wrapText('Charge de travail', 200, 10, measure)).toEqual({ lines: ['Charge de travail'], complete: true })
  })

  it('wraps onto a second line instead of cutting', () => {
    // 5px per character: 60px holds 12 characters.
    expect(wrapText('Organisation de l’hôpital', 60, 10, measure)).toEqual({
      lines: ['Organisation', 'de l’hôpital'],
      complete: true
    })
  })

  it('cuts the second line with an ellipsis when two lines are not enough', () => {
    const { lines, complete } = wrapText('Le corps et la vie hors du travail', 60, 10, measure)
    expect(lines).toHaveLength(2)
    expect(lines[1].endsWith('…')).toBe(true)
    expect(complete).toBe(false)
  })
})

describe('layoutOverviewLabels', () => {
  it('names clusters of any depth when they fit on screen', () => {
    const labels = layoutOverviewLabels(
      [
        box('root', 0, 0, 4000, 3000, 0, 'Conditions de travail'),
        box('child', 100, 600, 2000, 1500, 1, 'Charge'),
        box('grandchild', 200, 1200, 1500, 700, 2, 'Rythme')
      ],
      0.1,
      measure
    )
    expect(labels.map((l) => l.id)).toEqual(['root', 'child', 'grandchild'])
  })

  it('leaves out a nested name its cluster is too small to hold whole', () => {
    const labels = layoutOverviewLabels(
      [box('root', 0, 0, 4000, 3000, 0, 'Root'), box('tiny', 100, 600, 300, 300, 2, 'A rather long cluster name')],
      0.1,
      measure
    )
    expect(labels.map((l) => l.id)).toEqual(['root'])
  })

  it('always names a top-level cluster, even a small one', () => {
    const labels = layoutOverviewLabels([box('root', 0, 0, 200, 200, 0, 'Notes de terrain')], 0.05, measure)
    expect(labels.map((l) => l.id)).toEqual(['root'])
  })

  it('never lets the names of small stacked top-level clusters cover each other', () => {
    // Ten short top-level clusters, one under the other, 30px apart on screen.
    const inputs = Array.from({ length: 10 }, (_, i) => box(`r${i}`, 0, i * 500, 1500, 400, 0, `Cluster number ${i}`))
    const labels = layoutOverviewLabels(inputs, 0.06, measure)
    expect(labels.length).toBeGreaterThan(0)
    for (const a of labels)
      for (const b of labels) {
        if (a === b) continue
        const ay = a.y * 0.06
        const by = b.y * 0.06
        const disjoint = ay + a.heightPx <= by || by + b.heightPx <= ay || a.x * 0.06 + a.widthPx <= b.x * 0.06 || b.x * 0.06 + b.widthPx <= a.x * 0.06
        expect(disjoint).toBe(true)
      }
  })

  it('slides a child name below its parent’s instead of covering it', () => {
    // The child's corner sits right under the parent's corner.
    const labels = layoutOverviewLabels(
      [box('root', 0, 0, 6000, 4000, 0, 'Conditions de travail'), box('child', 20, 40, 3000, 2000, 1, 'Charge de travail')],
      0.06,
      measure
    )
    const root = labels.find((l) => l.id === 'root')!
    const child = labels.find((l) => l.id === 'child')!
    expect(child.y * 0.06).toBeGreaterThanOrEqual(root.y * 0.06 + root.heightPx)
  })

  it('shows the detail line only where it has room', () => {
    const roomy = layoutOverviewLabels(
      [{ ...box('a', 0, 0, 3000, 3000, 1, 'Encadrement'), detail: '12 codes · 4 notes' }],
      0.1,
      measure
    )
    expect(roomy[0].detail).toBe('12 codes · 4 notes')
    const cramped = layoutOverviewLabels(
      [{ ...box('a', 0, 0, 3000, 380, 1, 'Encadrement'), detail: '12 codes · 4 notes' }],
      0.1,
      measure
    )
    expect(cramped[0].detail).toBeUndefined()
  })
})
