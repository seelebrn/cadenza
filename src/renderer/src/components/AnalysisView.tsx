import { useWorkspaceUiStore } from '../store/workspaceUiStore'
import RetrievalView from './RetrievalView'
import ClustersView from './ClustersView'

function AnalysisView(): JSX.Element {
  const analysisTab = useWorkspaceUiStore((s) => s.analysisTab)
  const setAnalysisTab = useWorkspaceUiStore((s) => s.setAnalysisTab)

  return (
    <div className="flex h-full flex-col">
      <div className="flex border-b border-slate-200 bg-white">
        <button
          className={`px-4 py-2 text-sm font-medium ${
            analysisTab === 'retrieval'
              ? 'border-b-2 border-slate-900 text-slate-900'
              : 'text-slate-400 hover:text-slate-600'
          }`}
          onClick={() => setAnalysisTab('retrieval')}
        >
          Retrieval
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium ${
            analysisTab === 'categories'
              ? 'border-b-2 border-slate-900 text-slate-900'
              : 'text-slate-400 hover:text-slate-600'
          }`}
          onClick={() => setAnalysisTab('categories')}
        >
          Clusters
        </button>
      </div>
      <div className="flex-1 overflow-hidden">
        {analysisTab === 'retrieval' ? <RetrievalView /> : <ClustersView />}
      </div>
    </div>
  )
}

export default AnalysisView
