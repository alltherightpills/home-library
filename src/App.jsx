import { isAuthRetryableFetchError } from '@supabase/supabase-js'
import { useEffect, useMemo, useRef, useState } from 'react'
import Library from './Library.jsx'
import PasswordForm from './PasswordForm.jsx'
import ReadingTab from './ReadingTab.jsx'
import Scanner from './Scanner.jsx'
import SearchBox from './SearchBox.jsx'
import SignIn from './SignIn.jsx'
import { useReadings } from './readings.js'
import { lentOut } from './lending.js'
import { useLoans } from './useLoans.js'
import { useWishlist } from './useWishlist.js'
import { supabase } from './supabase.js'
import { useCatalog } from './useCatalog.js'
import { clearSaved } from './savedCopy.js'
import { loadQueue, saveQueue, waitingScans } from './scanQueue.js'
import { asOfText } from './useSaved.js'

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

// The sign-in kept on the phone, as the sign-in library stores it, or null.
function storedSignIn() {
  try {
    const kept = JSON.parse(localStorage.getItem(supabase.auth.storageKey))
    return kept?.user?.id ? kept : null
  } catch {
    return null
  }
}

function App() {
  // Who is signed in: undefined while checking, null if nobody.
  const [session, setSession] = useState(undefined)
  const [resetting, setResetting] = useState(arrivedToReset)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    // The sign-in pass lasts an hour and is renewed over the internet. With no
    // signal an expired one can't be renewed, and the sign-in library answers
    // "nobody" while keeping the sign-in on the phone (it renews it once there's
    // signal). So with no signal, the kept sign-in counts: the saved catalog
    // shows, and anything that needs the database says it needs signal.
    supabase.auth.getSession().then(({ data, error }) =>
      setSession(data.session ?? (isAuthRetryableFetchError(error) ? storedSignIn() : null)),
    )
    // Keep `session` up to date when signing in or out.
    const { data } = supabase.auth.onAuthStateChange((event, newSession) => {
      // The first answer is getSession's to give (above), so a "nobody" for
      // want of signal doesn't show the Sign in screen.
      if (event === 'INITIAL_SESSION' && !newSession) return
      // However it happens (Sign out, or a sign-in that has run out), the
      // phone's saved copy goes with it.
      if (event === 'SIGNED_OUT') clearSaved()
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
  // Books scanned since the app opened, newest first, after any kept from
  // before because they couldn't be looked up (the scan queue, step 7b).
  const [scans, setScans] = useState(() => loadQueue(session.user.id))
  const current = TABS.find((t) => t.id === tab)
  const refreshTick = useRefreshTick()
  const userId = session.user.id
  const { copies, categories, error, failed, syncedAt, updateCopy, updateCopies, updateWork, updateAuthor, mergeAuthors, removeCopy, addCopy } =
    useCatalog(userId, refreshTick)
  const readings = useReadings(userId, refreshTick)
  const loans = useLoans(userId, refreshTick)
  const wishlist = useWishlist(userId, refreshTick)
  // The queued scans still to deal with, kept on the phone as they change
  // (once the catalog is in, so an added book drops out).
  const waiting = useMemo(() => (copies ? waitingScans(scans, copies) : []), [scans, copies])
  useEffect(() => {
    if (copies) saveQueue(userId, waiting.map((s) => s.isbn))
  }, [userId, copies, waiting])

  // copy id → { name, lent_on } for the books out now (lists, Scan).
  const lentTo = useMemo(() => (loans.loans ? lentOut(loans.loans, loans.borrowers) : new Map()), [loans.loans, loans.borrowers])

  // The wish from the Wishlist screen's I bought it, for the Scan tab: one
  // with an ISBN is taken as a scan and its check form opens; one without asks
  // for the copy's barcode, with Add by hand filled in. Null otherwise.
  const [buying, setBuying] = useState(null)

  // Over to Scan from a Library screen, marking the step before as the
  // Library, so swiping back from Scan returns to that screen.
  function goToScan() {
    history.replaceState({ ...history.state, tab: 'library' }, '')
    history.pushState({ tab: 'scan' }, '')
    setTab('scan')
    window.scrollTo(0, 0)
  }

  // I bought it, on the Wishlist screen.
  function buy(wish) {
    setBuying(wish)
    goToScan()
  }

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
        {failed && copies && syncedAt && (
          <p className="offline-line">
            {navigator.onLine ? 'Can’t reach the database' : 'No signal'} · your library as of {asOfText(syncedAt)}
          </p>
        )}
        {tab === 'library' && !changingPassword && (
          <Library
            key={restarts.library}
            copies={copies}
            categories={categories}
            readings={readings}
            loans={loans}
            lentTo={lentTo}
            wishlist={wishlist}
            onBuy={buy}
            waitingCount={waiting.length}
            onOpenScan={goToScan}
            error={error}
            updateCopy={updateCopy}
            updateWork={updateWork}
            updateAuthor={updateAuthor}
            mergeAuthors={mergeAuthors}
            updateCopies={updateCopies}
            removeCopy={removeCopy}
            addCopy={addCopy}
            query={query}
            nav={libraryNav}
          />
        )}
        {tab === 'scan' && (
          <Scanner
            key={restarts.scan}
            copies={copies}
            lentTo={lentTo}
            wishlist={wishlist}
            categories={categories}
            scans={scans}
            setScans={setScans}
            onOpenBook={(id) => goToLibrary({ book: id })}
            addCopy={addCopy}
            buying={buying}
            onBuyingStarted={() => setBuying(null)}
            refreshTick={refreshTick}
          />
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
            {/* The saved copy goes too, so the next person here doesn't see this one's reading. */}
            <button className="link" onClick={() => clearSaved().then(() => supabase.auth.signOut())}>
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

// Changes when the app should load fresh data: back in the app after a minute
// or more away (the iPhone keeps it open for days), signal back, or the
// sign-in pass renewed (hourly while open, and the first chance after signal
// returns, since loads wait for a working pass).
function useRefreshTick() {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const bump = () => setTick((t) => t + 1)
    let hiddenAt = null
    const onVisibility = () => {
      if (document.hidden) hiddenAt = Date.now()
      else if (hiddenAt && Date.now() - hiddenAt > 60_000) bump()
    }
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('online', bump)
    const { data } = supabase.auth.onAuthStateChange((event) => event === 'TOKEN_REFRESHED' && bump())
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('online', bump)
      data.subscription.unsubscribe()
    }
  }, [])
  return tick
}

export default App
