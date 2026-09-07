import { describe, expect, it } from 'vitest'
import { flattenCodeTree } from './codeTree'
import type { CodeNode } from './types'

function makeCode(id: string, parentId: string | null = null): CodeNode {
  return { id, kind: 'code', name: id, color: '#fff', definition: '', parentId, createdAt: '0' }
}

describe('flattenCodeTree', () => {
  it('flat list (no hierarchy) all at depth 0', () => {
    const codes = [makeCode('A'), makeCode('B')]
    expect(flattenCodeTree(codes)).toEqual([
      { code: codes[0], depth: 0 },
      { code: codes[1], depth: 0 }
    ])
  })

  it('a parent-before-children, depth-first ordering', () => {
    const a = makeCode('A')
    const b = makeCode('B', 'A')
    const c = makeCode('C', 'B')
    const d = makeCode('D', 'A')
    // Tree: A -> [B -> [C], D]
    const flat = flattenCodeTree([a, b, c, d])
    expect(flat.map((f) => f.code.id)).toEqual(['A', 'B', 'C', 'D'])
    expect(flat.map((f) => f.depth)).toEqual([0, 1, 2, 1])
  })

  it('multiple independent root trees each start at depth 0', () => {
    const rootA = makeCode('A')
    const childOfA = makeCode('childA', 'A')
    const rootB = makeCode('B')
    const flat = flattenCodeTree([rootA, childOfA, rootB])
    expect(flat.map((f) => ({ id: f.code.id, depth: f.depth }))).toEqual([
      { id: 'A', depth: 0 },
      { id: 'childA', depth: 1 },
      { id: 'B', depth: 0 }
    ])
  })

  it('an empty code list returns an empty result', () => {
    expect(flattenCodeTree([])).toEqual([])
  })
})
