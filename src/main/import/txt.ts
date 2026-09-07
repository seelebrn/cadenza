import { splitIntoParagraphs } from '../../shared/text'

export function extractTxtParagraphs(rawText: string): string[] {
  return splitIntoParagraphs(rawText)
}
