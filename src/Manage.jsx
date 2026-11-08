import { useEffect, useMemo, useState } from 'react'
import { BackBar, Row } from './CategoryView.jsx'
import { placesIn } from './managePlaces.js'
import { supabase } from './supabase.js'

// Manage: tools for things shared across many books (Phase 2 step 4): Authors,
// Places, Borrowers and Export. Backups stay on the Mac.
function Manage({ copies, loans, onOpenPlace, onBack }) {
  const borrowerCount = loans.borrowers?.length
  const peopleCount = useMemo(() => new Set(copies.flatMap((c) => c.people.map((p) => p.author.id))).size, [copies])
  const placeCount = useMemo(() => placesIn(copies).length, [copies])
  return (
    <div className="manage">
      <BackBar onBack={onBack} label="Library" />
      <h2>Manage</h2>

      <h3 className="section-label">Shared across books</h3>
      <ul className="category-rows">
        <Row
          name="Authors"
          detail="Rename someone on every book"
          count={`${peopleCount.toLocaleString()} people`}
          onOpen={() => onOpenPlace('authors')}
        />
        <Row
          name="Places"
          detail="Rename or merge where books were acquired"
          count={`${placeCount.toLocaleString()} places`}
          onOpen={() => onOpenPlace('places')}
        />
        <Row
          name="Borrowers"
          detail="People you've lent books to"
          count={borrowerCount == null ? '' : `${borrowerCount} ${borrowerCount === 1 ? 'person' : 'people'}`}
          onOpen={() => onOpenPlace('borrowers')}
        />
      </ul>

      <h3 className="section-label">Export</h3>
      <ExportSheet libraryId={copies[0]?.library_id} />

      <h3 className="section-label">Backup and restore</h3>
      <p className="book-meta">
        These run on the Mac, which saves the snapshots to iCloud: <code>npm run backup</code> and{' '}
        <code>npm run restore</code>. The phone can't reach that folder.
      </p>
    </div>
  )
}

// The whole catalog as a spreadsheet (the same one `npm run export` makes).
// Two taps: the iPhone opens its Share menu only straight after a tap, and
// making the file takes longer than that allows.
function ExportSheet({ libraryId }) {
  const [state, setState] = useState({ step: 'ready' }) // ready → making → made | failed
  const { file, url } = state

  // The download link's address holds the file in memory; free it when done.
  useEffect(() => () => url && URL.revokeObjectURL(url), [url])

  async function make() {
    setState({ step: 'making' })
    try {
      // Loaded only when used: the spreadsheet code is large.
      const { makeSpreadsheet } = await import('./export/makeSpreadsheet.js')
      const made = await makeSpreadsheet(supabase, libraryId)
      setState({ step: 'made', ...made, url: URL.createObjectURL(made.file) })
    } catch (e) {
      setState({ step: 'failed', message: e.message })
    }
  }

  async function share() {
    try {
      await navigator.share({ files: [file], title: file.name })
    } catch (e) {
      // Closing the Share menu without picking anything isn't a problem.
      if (e.name !== 'AbortError') setState({ ...state, message: `Couldn't share it: ${e.message}` })
    }
  }

  if (state.step === 'made') {
    const canShare = navigator.canShare?.({ files: [file] })
    return (
      <>
        <p>
          {state.count.toLocaleString()} books in <strong>{file.name}</strong>
        </p>
        {canShare ? (
          <button className="primary" onClick={share}>
            Share spreadsheet…
          </button>
        ) : (
          <a className="primary button-link" href={url} download={file.name}>
            Save spreadsheet
          </a>
        )}
        {state.message && <p className="error">{state.message}</p>}
        <p className="book-meta">
          {canShare
            ? 'Pick Save to Files, AirDrop, Mail or an app such as Numbers.'
            : 'It goes to your Downloads folder.'}{' '}
          <button className="link" onClick={make}>
            Make it again
          </button>
        </p>
      </>
    )
  }
  return (
    <>
      <button className="primary" onClick={make} disabled={state.step === 'making' || !libraryId}>
        {state.step === 'making' ? 'Making the spreadsheet…' : 'Make spreadsheet'}
      </button>
      {state.step === 'failed' && <p className="error">Couldn't make it: {state.message}</p>}
      <p className="book-meta">
        One row per book, for Numbers, Excel or Google Sheets. It reads the library as it is now, including
        changes made on another phone.
      </p>
    </>
  )
}

export default Manage
