// Prints the body of one version's section from CHANGELOG.md — everything
// between its "## [x.y.z]" heading and the next "## [" heading — for use as
// a GitHub release description. Exits with status 1 if there's no such
// section.
//
//   node scripts/release-notes.mjs 0.4.6
import { readFileSync } from 'node:fs'

const version = (process.argv[2] ?? '').replace(/^v/, '')
if (!version) {
  console.error('usage: node scripts/release-notes.mjs <version>')
  process.exit(2)
}

const lines = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8').split(/\r?\n/)
const start = lines.findIndex((line) => line.startsWith(`## [${version}]`))
if (start === -1) {
  console.error(`CHANGELOG.md has no section for ${version}`)
  process.exit(1)
}
const next = lines.findIndex((line, index) => index > start && line.startsWith('## ['))

// CHANGELOG.md is hard-wrapped for reading in an editor, but GitHub renders
// every single line break in a release description as a real break — so
// wrapped list items and paragraphs are joined back into single lines.
const joined = []
for (const line of lines.slice(start + 1, next === -1 ? lines.length : next)) {
  const previous = joined[joined.length - 1]
  const startsBlock = /^(#|- |\* |\d+\. |\||```)/.test(line)
  const continues =
    line.trim() !== '' && previous !== undefined && previous.trim() !== '' && !previous.startsWith('#') && !startsBlock
  if (continues) joined[joined.length - 1] = `${previous} ${line.trim()}`
  else joined.push(line)
}
const body = joined.join('\n').trim()
if (!body) {
  console.error(`CHANGELOG.md's section for ${version} is empty`)
  process.exit(1)
}
process.stdout.write(`${body}\n`)
