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
  const current = TABS.find((t) => t.id === tab)
  const { copies, error, updateCopy, updateWork, removeCopy } = useCatalog()

  return (
    <div className="app">
      <main className="screen">
        <h1>{current.label}</h1>
        {notice && <p>{notice}</p>}
        {tab === 'library' && !changingPassword && (
          <Library
            copies={copies}
            error={error}
            updateCopy={updateCopy}
            updateWork={updateWork}
            removeCopy={removeCopy}
          />
        )}
        {tab === 'scan' && <Scanner />}
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
