import { useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import type { ReportExportFormat } from '@shared/api'
import { buildProjectReport, buildResultsDraftReport, hasComparisonData } from '../lib/reportBuilders'
import type { ResultsDraftAxis } from '../lib/reportBuilders'

const FORMATS: { value: ReportExportFormat; label: string }[] = [
  { value: 'docx', label: 'Word (.docx)' },
  { value: 'html', label: 'HTML (.html)' },
  { value: 'pdf', label: 'PDF (.pdf)' }
]

const DRAFT_AXES: { value: ResultsDraftAxis; label: string; hint: string }[] = [
  { value: 'theme', label: 'By theme', hint: 'One section per cluster, quotes gathered from every case — Reflexive TA, IPA.' },
  { value: 'case', label: 'By case', hint: "One section per document, keeping each case's own internal logic — Kaufmann." },
  { value: 'question', label: 'By question', hint: 'One section per question-cluster, answer-notes in the order written — AQA.' }
]

type ExportMode = 'standard' | 'draft'

/** Phase 8's report exporter, plus the results-draft mode added afterward.
 * Two genuinely different mental models share this dialog: the standard
 * report is an *inventory* (check some boxes, get everything filed under
 * them, for reference); the results draft is a *drafting aid* that
 * reorganizes the same material around an axis the writer must pick
 * themselves (buildResultsDraftReport's own comment says why it's not
 * auto-detected) into a skeleton still waiting for their interpretation —
 * different enough in kind that bolting it on as more checkboxes next to
 * "include comparison" would have muddled both. */
function ExportView(): JSX.Element | null {
  const data = useProjectStore((s) => s.data)

  const [mode, setMode] = useState<ExportMode>('standard')

  const [includeCodes, setIncludeCodes] = useState(true)
  const [includeNotes, setIncludeNotes] = useState(false)
  const [includeComparison, setIncludeComparison] = useState(false)
  const [includeVerbatim, setIncludeVerbatim] = useState(false)
  const [contextWords, setContextWords] = useState(15)
  const [includeFrequency, setIncludeFrequency] = useState(false)

  const [draftAxis, setDraftAxis] = useState<ResultsDraftAxis>('theme')
  const [draftIncludeNotes, setDraftIncludeNotes] = useState(true)
  const [draftIncludeCounts, setDraftIncludeCounts] = useState(true)
  const [draftContextWords, setDraftContextWords] = useState(15)

  const [format, setFormat] = useState<ReportExportFormat>('docx')
  const [status, setStatus] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)

  if (!data) return null

  const comparisonAvailable = hasComparisonData(data)
  const nothingSelected = mode === 'standard' && !includeCodes && !includeNotes && !includeComparison

  async function handleExport(): Promise<void> {
    if (!data) return
    setStatus(null)
    setIsExporting(true)
    try {
      const report =
        mode === 'standard'
          ? buildProjectReport(data, {
              includeCodes,
              includeNotes,
              includeComparison: includeComparison && comparisonAvailable,
              includeVerbatim,
              contextWords: includeVerbatim ? Math.max(0, contextWords) : 0,
              includeFrequency
            })
          : buildResultsDraftReport(data, {
              axis: draftAxis,
              includeNotes: draftIncludeNotes,
              includeCounts: draftIncludeCounts,
              contextWords: Math.max(0, draftContextWords)
            })
      const savedPath = await window.api.export.report(report, format, data.name)
      setStatus(savedPath ? `Exported to ${savedPath}` : null)
    } catch (e) {
      setStatus(`Export failed: ${(e as Error).message}`)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl overflow-auto p-6">
      <h2 className="mb-1 text-lg font-semibold text-slate-800">Export a report</h2>
      <p className="mb-4 text-sm text-slate-500">
        {mode === 'standard'
          ? 'Pick what to include — everything checked below lands in one document.'
          : "A skeleton organized around one axis, not a finished analysis — quotes and your own notes, kept visually apart, with space left for the interpretation only you can write."}
      </p>

      <div className="mb-4 flex gap-1 rounded border border-slate-200 bg-slate-50 p-1 text-sm">
        <button
          className={`flex-1 rounded px-3 py-1.5 font-medium ${mode === 'standard' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
          onClick={() => setMode('standard')}
        >
          Standard report
        </button>
        <button
          className={`flex-1 rounded px-3 py-1.5 font-medium ${mode === 'draft' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
          onClick={() => setMode('draft')}
        >
          Results draft
        </button>
      </div>

      {mode === 'draft' ? (
        <div className="space-y-3 rounded border border-slate-200 p-4">
          <fieldset className="space-y-1.5">
            <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">Organize by</legend>
            {DRAFT_AXES.map((a) => (
              <label key={a.value} className="flex items-start gap-2 text-sm">
                <input
                  type="radio"
                  className="mt-0.5"
                  name="draft-axis"
                  checked={draftAxis === a.value}
                  onChange={() => setDraftAxis(a.value)}
                />
                <span>
                  {a.label}
                  <span className="block text-xs text-slate-400">{a.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>

          <div className="border-t border-slate-100 pt-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draftIncludeNotes}
                onChange={(e) => setDraftIncludeNotes(e.target.checked)}
              />
              Include my analytic notes (shown separately from the quotes)
            </label>
            <label className="mt-1.5 flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={draftIncludeCounts}
                onChange={(e) => setDraftIncludeCounts(e.target.checked)}
              />
              Show a plain excerpt/case count per section
            </label>
            <label className="mt-1.5 flex items-center gap-2 text-xs text-slate-500">
              Words of surrounding context per quote:
              <input
                type="number"
                min={0}
                className="w-16 rounded border border-slate-300 px-1.5 py-0.5"
                value={draftContextWords}
                onChange={(e) => setDraftContextWords(Number(e.target.value))}
              />
            </label>
          </div>
        </div>
      ) : (
        <div className="space-y-3 rounded border border-slate-200 p-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={includeCodes} onChange={(e) => setIncludeCodes(e.target.checked)} />
            Codebook (codes/items, with their hierarchy and definitions)
          </label>
          {includeCodes && (
            <label className="ml-6 flex items-center gap-2 text-xs text-slate-500">
              <input
                type="checkbox"
                checked={includeFrequency}
                onChange={(e) => setIncludeFrequency(e.target.checked)}
              />
              Include a code-frequency table (instances per code, project-wide)
            </label>
          )}

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={includeNotes} onChange={(e) => setIncludeNotes(e.target.checked)} />
            Notes, grouped by the clusters they're filed under
          </label>

          <label
            className={`flex items-center gap-2 text-sm ${comparisonAvailable ? '' : 'text-slate-300'}`}
            title={comparisonAvailable ? undefined : 'Needs at least one document and one code'}
          >
            <input
              type="checkbox"
              checked={includeComparison}
              disabled={!comparisonAvailable}
              onChange={(e) => setIncludeComparison(e.target.checked)}
            />
            Cross-case comparison (codes × cases table)
          </label>

          <div className="border-t border-slate-100 pt-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={includeVerbatim}
                disabled={!includeCodes && !includeNotes}
                onChange={(e) => setIncludeVerbatim(e.target.checked)}
              />
              Include verbatim quotes (for codebook and/or notes above)
            </label>
            {includeVerbatim && (
              <label className="ml-6 mt-1.5 flex items-center gap-2 text-xs text-slate-500">
                Words of surrounding context per quote:
                <input
                  type="number"
                  min={0}
                  className="w-16 rounded border border-slate-300 px-1.5 py-0.5"
                  value={contextWords}
                  onChange={(e) => setContextWords(Number(e.target.value))}
                />
                <span className="text-slate-400">(0 = just the bare quote)</span>
              </label>
            )}
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center gap-3">
        <select
          className="rounded border border-slate-300 px-2 py-1.5 text-sm"
          value={format}
          onChange={(e) => setFormat(e.target.value as ReportExportFormat)}
        >
          {FORMATS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <button
          className="rounded bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-40"
          disabled={nothingSelected || isExporting}
          onClick={() => void handleExport()}
        >
          {isExporting ? 'Exporting…' : 'Export'}
        </button>
      </div>

      {status && <p className="mt-3 text-sm text-slate-600">{status}</p>}

      <p className="mt-6 text-xs text-slate-400">
        For a visual export of a board's spatial layout, use "Export as PDF" from the Board tab's toolbar instead —
        this dialog only covers written report content.
      </p>
    </div>
  )
}

export default ExportView
