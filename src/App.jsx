import { useEffect, useState } from 'react'
import Library from './Library.jsx'
import PasswordForm from './PasswordForm.jsx'
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

// What a password reset email's link left in the address. Read now, because
// the sign-in library clears it from the address soon after the page loads.
const arrivedToReset = window.location.hash.includes('type=recovery')
const resetLinkFailed = window.location.hash.includes('error_code=')

function App() {
  // Who is signed in: undefined while checking, null if nobody.
  const [session, setSession] = useState(undefined)
  const [resetting, setResetting] = useState(arrivedToReset)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    // Keep `session` up to date when signing in or out.
    const { data } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession)
      if (event === 'PASSWORD_RECOVERY') setResetting(true)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  if (session === undefined) return null
  if (session === null) return <SignIn linkFailed={resetLinkFailed} />
  if (resetting) {
    return (
      <main className="screen">
        <PasswordForm
          email={session.user.email}
          onDone={() => {
            setResetting(false)
            setNotice('Your password is changed.')
          }}
        />
      </main>
    )
  }
  return <SignedInApp session={session} notice={notice} setNotice={setNotice} />
}

function SignedInApp({ session, notice, setNotice }) {
  // Which tab is showing right now.
  const [tab, setTab] = useState('library')
  const [changingPassword, setChangingPassword] = useState(false)
  // Books scanned since the app opened, newest first.
  const [scans, setScans] = useState([])
  const current = TABS.find((t) => t.id === tab)
  const { copies, categories, error, updateCopy, updateWork, removeCopy, addCopy } = useCatalog()

  // Swiping back from a book opened by scanning returns to the Scan tab.
  useEffect(() => {
    const onPop = (e) => {
      if (e.state?.tab === 'scan') setTab('scan')
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // Opens a book's page in the Library tab, marking the step before it as the
  // Scan tab. The Library tab reads the open book from the history when it starts.
  function openFromScan(id) {
    history.replaceState({ tab: 'scan' }, '')
    history.pushState({ book: id }, '')
    setTab('library')
  }

  return (
    <div className="app">
      <main className="screen">
        <h1>{current.label}</h1>
        {notice && <p>{notice}</p>}
        {tab === 'library' && !changingPassword && (
          <Library
            copies={copies}
            categories={categories}
            error={error}
            updateCopy={updateCopy}
            updateWork={updateWork}
            removeCopy={removeCopy}
          />
        )}
        {tab === 'scan' && (
          <Scanner copies={copies} categories={categories} scans={scans} setScans={setScans} onOpenBook={openFromScan} addCopy={addCopy} />
        )}
        {(tab === 'reading' || tab === 'pick') && <p className="placeholder">Coming soon.</p>}
        {tab === 'library' && changingPassword && (
          <PasswordForm
            email={session.user.email}
            askCurrent
            onCancel={() => setChangingPassword(false)}
            onDone={() => {
              setChangingPassword(false)
              setNotice('Your password is changed.')
            }}
          />
        )}
        {tab === 'library' && (
          <p className="diagnostic">
            Signed in as {session.user.email} ·{' '}
            <button className="link" onClick={() => setChangingPassword(true)}>
              Change password
            </button>{' '}
            ·{' '}
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
            onClick={() => {
              // Picking a tab by hand clears a Scan tab marker left by openFromScan,
              // so swiping back later doesn't jump to the Scan tab.
              if (history.state?.tab) history.replaceState(null, '')
              setTab(t.id)
            }}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  )
}

export default App
