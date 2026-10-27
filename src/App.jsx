import { useEffect, useState } from 'react'
import Library from './Library.jsx'
import Scanner from './Scanner.jsx'
import SignIn from './SignIn.jsx'
import { supabase } from './supabase.js'
import { useCatalog } from './useCatalog.js'

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

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    // Keep `session` up to date when signing in or out.
    const { data } = supabase.auth.onAuthStateChange((_event, newSession) => setSession(newSession))
    return () => data.subscription.unsubscribe()
  }, [])

  if (session === undefined) return null
  if (session === null) return <SignIn />
  return <SignedInApp session={session} />
}

function SignedInApp({ session }) {
  // Which tab is showing right now.
  const [tab, setTab] = useState('library')
  const current = TABS.find((t) => t.id === tab)
  const { copies, error, updateCopy } = useCatalog()

  return (
    <div className="app">
      <main className="screen">
        <h1>{current.label}</h1>
        {tab === 'library' && <Library copies={copies} error={error} updateCopy={updateCopy} />}
        {tab === 'scan' && <Scanner />}
        {(tab === 'reading' || tab === 'pick') && <p className="placeholder">Coming soon.</p>}
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
