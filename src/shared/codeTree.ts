import type { CodeNode } from './types'

export interface FlattenedCode {
  code: CodeNode
  depth: number
}

/** Depth-first, parent-before-children flattening of the code hierarchy —
 * e.g. for rendering an indented <select> list (CodebookPanel's own tree
 * builder produces a nested shape instead, for recursive rendering — this
 * is a different consumer need). */
export function flattenCodeTree(codes: CodeNode[]): FlattenedCode[] {
  const byParent = new Map<string | null, CodeNode[]>()
  for (const code of codes) {
    const list = byParent.get(code.parentId) ?? []
    list.push(code)
    byParent.set(code.parentId, list)
  }

  const result: FlattenedCode[] = []
  function walk(parentId: string | null, depth: number): void {
    for (const code of byParent.get(parentId) ?? []) {
      result.push({ code, depth })
      walk(code.id, depth + 1)
    }
  }
  walk(null, 0)
  return result
}
