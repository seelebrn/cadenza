import { useEffect } from 'react'
import { useProjectStore } from './store/projectStore'
import ProjectHome from './components/ProjectHome'
import ProjectShell from './components/ProjectShell'

function App(): JSX.Element {
  const data = useProjectStore((s) => s.data)
  const loadRecent = useProjectStore((s) => s.loadRecent)

  useEffect(() => {
    void loadRecent()
  }, [loadRecent])

  return (
    <div className="h-screen w-screen bg-slate-50 text-slate-800">
      {data ? <ProjectShell /> : <ProjectHome />}
    </div>
  )
}

export default App
