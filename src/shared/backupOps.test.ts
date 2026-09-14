import { describe, expect, it } from 'vitest'
import { pickBackupsToPrune, shouldCreateBackup } from './backupOps'

describe('shouldCreateBackup', () => {
  it('always creates a backup when none exists yet', () => {
    expect(shouldCreateBackup(null, new Date('2026-01-01T00:00:00Z'), 60_000)).toBe(true)
  })

  it('skips when the most recent backup is younger than the minimum interval', () => {
    const mostRecent = '2026-01-01T00:00:00Z'
    const now = new Date('2026-01-01T00:00:30Z') // 30s later, interval is 60s
    expect(shouldCreateBackup(mostRecent, now, 60_000)).toBe(false)
  })

  it('creates a new backup once the minimum interval has elapsed', () => {
    const mostRecent = '2026-01-01T00:00:00Z'
    const now = new Date('2026-01-01T00:01:00Z') // exactly 60s later
    expect(shouldCreateBackup(mostRecent, now, 60_000)).toBe(true)
  })

  it('creates a new backup well past the minimum interval', () => {
    const mostRecent = '2026-01-01T00:00:00Z'
    const now = new Date('2026-01-01T01:00:00Z')
    expect(shouldCreateBackup(mostRecent, now, 60_000)).toBe(true)
  })
})

describe('pickBackupsToPrune', () => {
  function entry(fileName: string, createdAt: string) {
    return { fileName, createdAt }
  }

  it('prunes nothing when at or under the cap', () => {
    const entries = [entry('a', '2026-01-01T00:00:00Z'), entry('b', '2026-01-01T00:01:00Z')]
    expect(pickBackupsToPrune(entries, 2)).toEqual([])
    expect(pickBackupsToPrune(entries, 5)).toEqual([])
  })

  it('prunes exactly the oldest entries beyond the cap', () => {
    const entries = [
      entry('oldest', '2026-01-01T00:00:00Z'),
      entry('middle', '2026-01-01T00:01:00Z'),
      entry('newest', '2026-01-01T00:02:00Z')
    ]
    expect(pickBackupsToPrune(entries, 1)).toEqual(['oldest', 'middle'])
    expect(pickBackupsToPrune(entries, 2)).toEqual(['oldest'])
  })

  it('is unaffected by input order — always prunes by actual age, not array position', () => {
    const entries = [
      entry('newest', '2026-01-01T00:02:00Z'),
      entry('oldest', '2026-01-01T00:00:00Z'),
      entry('middle', '2026-01-01T00:01:00Z')
    ]
    expect(pickBackupsToPrune(entries, 1)).toEqual(['oldest', 'middle'])
  })

  it('prunes everything when the cap is 0', () => {
    const entries = [entry('a', '2026-01-01T00:00:00Z'), entry('b', '2026-01-01T00:01:00Z')]
    expect(pickBackupsToPrune(entries, 0)).toEqual(['a', 'b'])
  })

  it('returns an empty array for an empty backup list', () => {
    expect(pickBackupsToPrune([], 20)).toEqual([])
  })
})
