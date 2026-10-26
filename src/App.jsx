import { useEffect, useState } from 'react'
import Scanner from './Scanner.jsx'
import SignIn from './SignIn.jsx'
import { supabase } from './supabase.js'

// The four tabs in the bottom bar (handoff section 4).
const TABS = [
  { id: 'library', label: 'Library' },
  { id: 'reading', label: 'Reading' },
  { id: 'scan', label: 'Scan' },
  { id: 'pick', label: 'Pick for me' },
]

function App() {
  // Who is signed in: undefined while checking, null if nobody.
  const [session, setSession] = useState(undefined)
  // Which tab is showing right now.
  const [tab, setTab] = useState('library')
  const current = TABS.find((t) => t.id === tab)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    // Keep `session` up to date when signing in or out.
    const { data } = supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession))
    return () => data.subscription.unsubscribe()
  }, [])

  if (session === undefined) return null
  if (session === null) return <SignIn />

  return (
    <div className="app">
      <main className="screen">
        <h1>{current.label}</h1>
        {tab === 'scan' ? <Scanner /> : <p className="placeholder">Coming soon.</p>}
        {tab === 'library' && (
          <p className="diagnostic">
            Signed in as {session.user.email} ·{' '}
            <button className="link" onClick={() => supabase.auth.signOut()}>
              Sign out
            </button>
          </p>
        )}
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
