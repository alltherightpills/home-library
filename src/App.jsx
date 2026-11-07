import { useEffect, useRef, useState } from 'react'
import Library from './Library.jsx'
import PasswordForm from './PasswordForm.jsx'
import ReadingTab from './ReadingTab.jsx'
import Scanner from './Scanner.jsx'
import SearchBox from './SearchBox.jsx'
import SignIn from './SignIn.jsx'
import { useReadings } from './readings.js'
import { supabase } from './supabase.js'
import { useCatalog } from './useCatalog.js'

// The four tabs in the bottom bar (handoff.md, "The screens").
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
  // Bumped when a tab is tapped, so that tab's screens start over at its start
  // screen (React rebuilds a component whose `key` changes).
  const [restarts, setRestarts] = useState({})
  const [changingPassword, setChangingPassword] = useState(false)
  // Books scanned since the app opened, newest first.
  const [scans, setScans] = useState([])
  const current = TABS.find((t) => t.id === tab)
  const { copies, categories, error, updateCopy, updateWork, updateAuthor, removeCopy, addCopy } = useCatalog()
  const readings = useReadings()

  // The Library search, kept here so the bar can show on other tabs too.
  const [query, setQuery] = useState('')
  // The Library tab's own ways of moving between its screens (while it's showing).
  const libraryNav = useRef(null)

  // Swiping back from the Library tab, after leaving another tab for it, returns there.
  useEffect(() => {
    const onPop = (e) => {
      if (e.state?.tab) setTab(e.state.tab)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // Goes to a Library screen from another tab, marking the step before it as
  // that tab. The Library tab reads where to start from the history.
  function goToLibrary(state) {
    history.replaceState({ tab }, '')
    history.pushState(state, '')
    setTab('library')
  }

  // The search bar's moves: within the Library tab, or over to it from another.
  const nav = () => (tab === 'library' ? libraryNav.current : null)
  const searchOpenBook = (id) => (nav() ? nav().openBook(id) : goToLibrary({ book: id }))
  const searchOpenLabel = (kind, id) => (nav() ? nav().openPlace(kind, id) : goToLibrary({ place: { kind, id } }))
  // Typing shows the matching books on the Library's main screen, wherever you are.
  function search(text) {
    setQuery(text)
    if (!text.trim()) return
    if (nav()) nav().showResults()
    else goToLibrary({})
  }
  const showSearch = copies && tab !== 'scan' && !(tab === 'library' && changingPassword)

  return (
    <div className="app">
      <main className="screen">
        <h1>{current.label}</h1>
        {notice && <p>{notice}</p>}
        {tab === 'library' && !changingPassword && (
          <Library
            key={restarts.library}
            copies={copies}
            categories={categories}
            readings={readings}
            error={error}
            updateCopy={updateCopy}
            updateWork={updateWork}
            updateAuthor={updateAuthor}
            removeCopy={removeCopy}
            addCopy={addCopy}
            query={query}
            nav={libraryNav}
          />
        )}
        {tab === 'scan' && (
          <Scanner key={restarts.scan} copies={copies} categories={categories} scans={scans} setScans={setScans} onOpenBook={(id) => goToLibrary({ book: id })} addCopy={addCopy} />
        )}
        {tab === 'reading' && <ReadingTab key={restarts.reading} copies={copies} readings={readings} onOpenBook={(id) => goToLibrary({ book: id })} />}
        {tab === 'pick' && <p className="placeholder">Coming soon.</p>}
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

      {showSearch && (
        <SearchBox copies={copies} query={query} setQuery={search} onOpenBook={searchOpenBook} onOpenLabel={searchOpenLabel} />
      )}

      <nav className="tab-bar">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={t.id === tab ? 'tab active' : 'tab'}
            onClick={() => {
              // Picking a tab by hand clears a tab marker left by goToLibrary,
              // so swiping back later doesn't jump to that tab.
              if (history.state?.tab) history.replaceState(null, '')
              // A tab always opens on its start screen, even when it's the one
              // showing (owner's request). Anything half-typed there is dropped.
              // The Library reads where to start from the history, so it gets a
              // fresh step: swiping back from its start returns to where you were.
              if (t.id === 'library') {
                if (history.state?.book || history.state?.place) history.pushState({}, '')
                setChangingPassword(false)
              }
              setRestarts((r) => ({ ...r, [t.id]: (r[t.id] ?? 0) + 1 }))
              setTab(t.id)
              window.scrollTo(0, 0)
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
