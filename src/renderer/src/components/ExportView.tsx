import { useState } from 'react'
import { useProjectStore } from '../store/projectStore'
import type { ReportExportFormat } from '@shared/api'
import { buildProjectReport, hasComparisonData } from '../lib/reportBuilders'

const FORMATS: { value: ReportExportFormat; label: string }[] = [
  { value: 'docx', label: 'Word (.docx)' },
  { value: 'html', label: 'HTML (.html)' },
  { value: 'pdf', label: 'PDF (.pdf)' }
]

/** Phase 8's report exporter — one flexible dialog rather than several
 * fixed report types: which checkboxes are on decides what ends up in the
 * single resulting document (buildProjectReport assembles it), so every
 * combination the user might want — codebook alone, codebook + verbatim,
 * notes + clusters, notes + clusters + verbatim, cross-case comparison,
 * or any mix of those — falls out of the same mechanism instead of being
 * a separate button per combination. */
function ExportView(): JSX.Element | null {
  const data = useProjectStore((s) => s.data)

  const [includeCodes, setIncludeCodes] = useState(true)
  const [includeNotes, setIncludeNotes] = useState(false)
  const [includeComparison, setIncludeComparison] = useState(false)
  const [includeVerbatim, setIncludeVerbatim] = useState(false)
  const [contextWords, setContextWords] = useState(15)
  const [includeFrequency, setIncludeFrequency] = useState(false)
  const [format, setFormat] = useState<ReportExportFormat>('docx')
  const [status, setStatus] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)

  if (!data) return null

  const comparisonAvailable = hasComparisonData(data)
  const nothingSelected = !includeCodes && !includeNotes && !includeComparison

  async function handleExport(): Promise<void> {
    if (!data) return
    setStatus(null)
    setIsExporting(true)
    try {
      const report = buildProjectReport(data, {
        includeCodes,
        includeNotes,
        includeComparison: includeComparison && comparisonAvailable,
        includeVerbatim,
        contextWords: includeVerbatim ? Math.max(0, contextWords) : 0,
        includeFrequency
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
        Pick what to include — everything checked below lands in one document.
      </p>

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
        this dialog only covers the codebook/notes/comparison content.
      </p>
    </div>
  )
}

export default ExportView
