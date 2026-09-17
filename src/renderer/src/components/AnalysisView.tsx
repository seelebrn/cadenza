import { useWorkspaceUiStore, type AnalysisTab } from '../store/workspaceUiStore'
import RetrievalView from './RetrievalView'
import SearchView from './SearchView'
import ClustersView from './ClustersView'
import ComparisonView from './ComparisonView'
import CooccurrenceView from './CooccurrenceView'

const TABS: Array<{ id: AnalysisTab; label: string }> = [
  { id: 'retrieval', label: 'Retrieval' },
  { id: 'search', label: 'Search' },
  { id: 'categories', label: 'Clusters' },
  { id: 'compare', label: 'Compare cases' },
  { id: 'cooccurrence', label: 'Co-occurrence' }
]

function AnalysisView(): JSX.Element {
  const analysisTab = useWorkspaceUiStore((s) => s.analysisTab)
  const setAnalysisTab = useWorkspaceUiStore((s) => s.setAnalysisTab)

  return (
    <div className="flex h-full flex-col">
      <div className="flex border-b border-slate-200 bg-white">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            className={`px-4 py-2 text-sm font-medium ${
              analysisTab === tab.id
                ? 'border-b-2 border-slate-900 text-slate-900'
                : 'text-slate-400 hover:text-slate-600'
            }`}
            onClick={() => setAnalysisTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-hidden">
        {analysisTab === 'retrieval' ? (
          <RetrievalView />
        ) : analysisTab === 'search' ? (
          <SearchView />
        ) : analysisTab === 'categories' ? (
          <ClustersView />
        ) : analysisTab === 'cooccurrence' ? (
          <CooccurrenceView />
        ) : (
          <ComparisonView />
        )}
      </div>
    </div>
  )
}

export default AnalysisView
