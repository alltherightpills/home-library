import { useState } from 'react'
import Scanner from './Scanner.jsx'

// The four tabs in the bottom bar (handoff section 4).
const TABS = [
  { id: 'library', label: 'Library' },
  { id: 'reading', label: 'Reading' },
  { id: 'scan', label: 'Scan' },
  { id: 'pick', label: 'Pick for me' },
]

function App() {
  // Which tab is showing right now.
  const [tab, setTab] = useState('library')
  const current = TABS.find((t) => t.id === tab)

  return (
    <div className="app">
      <main className="screen">
        <h1>{current.label}</h1>
        {tab === 'scan' ? <Scanner /> : <p className="placeholder">Coming soon.</p>}
      </main>

      <nav className="tab-bar">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={t.id === tab ? 'tab active' : 'tab'}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  )
}

export default App
