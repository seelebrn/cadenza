import { useEffect, useState } from 'react'

const REPO = 'https://github.com/seelebrn/cadenza'

/** Two links that open a prefilled GitHub issue in the OS browser (the
 * main process routes every external link there). The body carries the
 * app version and platform, so a report says which build it's about
 * without the reporter having to look. Shown on the home screen and the
 * Export tab — the only feedback path there is, since the app never
 * talks to a server on its own. */
function FeedbackLink(): JSX.Element {
  const [environment, setEnvironment] = useState('')
  useEffect(() => {
    let cancelled = false
    window.api.app
      .info()
      .then((info) => {
        if (!cancelled) setEnvironment(`Cadenza ${info.version} · ${info.platform} ${info.arch}`)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  const issueUrl = (template: string, body: string): string =>
    `${REPO}/issues/new?template=${template}&body=${encodeURIComponent(body)}`
  const bugBody = `**What happened**\n\n\n**What you expected**\n\n\n**Steps to reproduce**\n1. \n2. \n\n---\n${environment}`
  const ideaBody = `**What would help, and in which part of your analysis**\n\n\n---\n${environment}`

  return (
    <p className="text-xs text-slate-400">
      Found a problem or missing something?{' '}
      <a className="text-slate-500 underline hover:text-slate-800" href={issueUrl('bug_report.md', bugBody)} target="_blank" rel="noreferrer">
        Report a bug
      </a>
      {' · '}
      <a className="text-slate-500 underline hover:text-slate-800" href={issueUrl('feature_request.md', ideaBody)} target="_blank" rel="noreferrer">
        Suggest something
      </a>
      {' — opens GitHub in your browser.'}
    </p>
  )
}

export default FeedbackLink
