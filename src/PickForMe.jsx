import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { coverUrl } from './useCatalog.js'
import {
  AUDIENCES,
  BLANK_ANSWERS,
  JUDGED,
  LENGTHS,
  drivenOptions,
  matches,
  notYetAssessed,
  pickOrder,
  pickPool,
  readAuthorIds,
  referenceId,
  surprising,
  whyText,
} from './pick.js'

// The Pick for me tab (handoff.md, "Pick for me"): every question on one
// screen, each optional, the count of matching books as you tap, then three
// picks with Replace and Shuffle. Surprise me ignores the questions. The rules
// are in pick.js.

const PICKS = 3
const AUDIENCE_KEY = 'pick:audience'

// The Audience row is remembered on the phone (owner's choice, 2026-11-20).
function savedAudience() {
  try {
    const saved = JSON.parse(localStorage.getItem(AUDIENCE_KEY))
    if (Array.isArray(saved) && saved.length && saved.every((a) => AUDIENCES.includes(a))) return saved
  } catch {
    // No saved choice, or the phone won't say: start with Adult.
  }
  return BLANK_ANSWERS.audience
}

function saveAudience(audience) {
  try {
    localStorage.setItem(AUDIENCE_KEY, JSON.stringify(audience))
  } catch {
    // Not remembered this time; the choice still works now.
  }
}

// One question: its name, then a row of buttons. Tapping the chosen answer
// again clears it.
function Question({ label, options, value, onChange }) {
  return (
    <div className="pick-question">
      <span className="pick-label">{label}</span>
      <span className="pick-options" role="group" aria-label={label}>
        {options.map((o) => (
          <button key={o.id} className={o.id === value ? 'chip active' : 'chip'} aria-pressed={o.id === value} onClick={() => onChange(o.id === value ? null : o.id)}>
            {o.label}
          </button>
        ))}
      </span>
    </div>
  )
}

function PickForMe({ copies, categories, readings, lentTo, onOpenBook, memory }) {
  // Coming back from a pick's book page, the answers, picks and scroll are as
  // they were: `memory` (App's) holds them while this screen is closed.
  const [kept] = useState(() => memory.recall())
  const [answers, setAnswers] = useState(() => kept?.answers ?? { ...BLANK_ANSWERS, audience: savedAudience() })
  // The picks showing, by book id: the order they come in, how far along it
  // they are, and whether they're Surprise me's. Null before Show picks.
  const [picks, setPicks] = useState(() => kept?.picks ?? null)
  // Read once when the screen opens; "the last 10 years" moves with it each January.
  const [thisYear] = useState(() => new Date().getFullYear())

  useEffect(() => {
    memory.remember({ answers, picks })
  }, [memory, answers, picks])
  useEffect(() => {
    const onScroll = () => memory.remember({ scrollY: window.scrollY })
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [memory])

  const pool = useMemo(
    () => (copies && readings.list ? pickPool(copies, { readings: readings.list, lentTo, categories }) : null),
    [copies, readings.list, lentTo, categories],
  )
  const context = useMemo(
    () => ({ categories, readAuthors: copies ? readAuthorIds(copies, readings.list) : new Set(), thisYear }),
    [categories, copies, readings.list, thisYear],
  )
  const matching = useMemo(() => (pool ? pool.filter((c) => matches(c, answers, context)) : []), [pool, answers, context])
  const unassessed = useMemo(
    () => (copies && readings.list ? notYetAssessed(copies, { readings: readings.list, categories }).length : 0),
    [copies, readings.list, categories],
  )
  const byId = useMemo(() => new Map((copies ?? []).map((c) => [c.id, c])), [copies])
  const ready = Boolean(pool)

  // Back where you were, once the books are there to scroll to.
  const restored = useRef(false)
  useLayoutEffect(() => {
    if (!ready || restored.current) return
    restored.current = true
    if (kept?.scrollY) window.scrollTo(0, kept.scrollY)
  }, [ready, kept])

  if (!pool) return <p className="placeholder">Loading your books…</p>

  const ids = (books) => books.map((c) => c.id)
  const booksOf = (list) => list.map((id) => byId.get(id)).filter(Boolean)

  // Changing an answer clears the picks, so they always match what's chosen.
  function answer(changes) {
    setAnswers((a) => ({ ...a, ...changes }))
    setPicks(null)
  }

  // Driven's buttons follow Kind, so a Driven answer the new Kind doesn't
  // offer is cleared rather than left filtering out of sight.
  function chooseMain(main) {
    const keep = drivenOptions(main, categories).some((o) => o.id === answers.driven)
    answer({ main, sub: null, ...(keep ? {} : { driven: null }) })
  }

  function toggleAudience(audience) {
    const on = answers.audience.includes(audience)
    // At least one stays on, or nothing could match.
    if (on && answers.audience.length === 1) return
    const next = AUDIENCES.filter((a) => (a === audience ? !on : answers.audience.includes(a)))
    saveAudience(next)
    answer({ audience: next })
  }

  function start(surprise) {
    const books = surprise ? pool.filter(surprising) : matching
    const order = ids(pickOrder(books, { waited: !surprise && answers.waited }))
    setPicks({ surprise, order, shown: order.slice(0, PICKS), next: PICKS, startedOver: false })
  }

  function shuffle() {
    const { surprise, order, next } = picks
    if (next >= order.length) {
      // Every match has been shown: start over in a new order.
      const fresh = ids(pickOrder(booksOf(order), { waited: !surprise && answers.waited }))
      setPicks({ surprise, order: fresh, shown: fresh.slice(0, PICKS), next: PICKS, startedOver: true })
    } else {
      setPicks({ ...picks, shown: order.slice(next, next + PICKS), next: next + PICKS, startedOver: false })
    }
  }

  function replace(index) {
    const { surprise, order, next, shown } = picks
    if (next < order.length) {
      setPicks({ ...picks, shown: shown.map((id, i) => (i === index ? order[next] : id)), next: next + 1, startedOver: false })
      return
    }
    // Every match has been shown: the others start over in a new order,
    // leaving out the books on screen now.
    const rest = ids(pickOrder(booksOf(order.filter((id) => !shown.includes(id))), { waited: !surprise && answers.waited }))
    if (!rest.length) return
    setPicks({ surprise, order: [...shown, ...rest], shown: shown.map((id, i) => (i === index ? rest[0] : id)), next: shown.length + 1, startedOver: true })
  }

  const mains = categories.filter((c) => !c.parent_id)
  const reference = referenceId(categories)
  const subs = answers.main ? categories.filter((c) => c.parent_id === answers.main && c.id !== reference) : []
  // Replace has something to offer unless every match is already on screen.
  const canReplace = picks ? picks.order.length > picks.shown.length : false

  return (
    <div className="pick-for-me">
      <div className="pick-question">
        <span className="pick-label">Audience</span>
        <span className="pick-options" role="group" aria-label="Audience">
          {AUDIENCES.map((a) => (
            <button key={a} className={answers.audience.includes(a) ? 'chip active' : 'chip'} aria-pressed={answers.audience.includes(a)} onClick={() => toggleAudience(a)}>
              {a}
            </button>
          ))}
        </span>
      </div>
      {/* Kind: every main category, or once one is chosen, just it (tap to
          start over) and its subcategories (owner's design, 2026-11-20). */}
      <div className="pick-question">
        <span className="pick-label">Kind</span>
        <span className="pick-options" role="group" aria-label="Kind">
          {answers.main ? (
            <>
              <button className="chip active" aria-pressed="true" onClick={() => chooseMain(null)}>
                {mains.find((c) => c.id === answers.main)?.name}
              </button>
              {subs.map((c) => (
                <button key={c.id} className={c.id === answers.sub ? 'chip active' : 'chip'} aria-pressed={c.id === answers.sub} onClick={() => answer({ sub: c.id === answers.sub ? null : c.id })}>
                  {c.name}
                </button>
              ))}
            </>
          ) : (
            mains.map((c) => (
              <button key={c.id} className="chip" aria-pressed="false" onClick={() => chooseMain(c.id)}>
                {c.name}
              </button>
            ))
          )}
        </span>
      </div>
      <Question label="Length" options={LENGTHS} value={answers.length} onChange={(length) => answer({ length })} />
      <Question
        label="Published"
        options={[
          { id: 'new', label: 'Last 10 years' },
          { id: 'old', label: 'Older' },
        ]}
        value={answers.published}
        onChange={(published) => answer({ published })}
      />
      <Question
        label="Author"
        options={[
          { id: 'known', label: 'Read before' },
          { id: 'new', label: 'New to me' },
        ]}
        value={answers.author}
        onChange={(author) => answer({ author })}
      />
      {JUDGED.map((q) => (
        <Question
          key={q.id}
          label={q.label}
          options={q.id === 'driven' ? drivenOptions(answers.main, categories) : q.options}
          value={answers[q.id]}
          onChange={(value) => answer({ [q.id]: value })}
        />
      ))}
      <Question
        label="Order"
        options={[{ id: 'waited', label: 'Longest waiting first' }]}
        value={answers.waited ? 'waited' : null}
        onChange={(v) => answer({ waited: v === 'waited' })}
      />

      <p className="pick-count">
        {matching.length.toLocaleString()} {matching.length === 1 ? 'book matches' : 'books match'}
      </p>
      {/* Until the assessment pass reaches them, these books pass View, Driven,
          Pace and Mood, so those narrow the list less than they will. */}
      {unassessed > 0 && (
        <p className="book-meta pick-unassessed">
          {unassessed.toLocaleString()} unread {unassessed === 1 ? 'book isn’t' : 'books aren’t'} assessed yet for View, Driven, Pace and Mood, so{' '}
          {unassessed === 1 ? 'it passes' : 'they pass'} those questions.
        </p>
      )}
      <div className="button-pair">
        <button className="primary" disabled={!matching.length} onClick={() => start(false)}>
          Show picks
        </button>
        <button className="secondary" onClick={() => start(true)}>
          Surprise me
        </button>
      </div>

      {picks && (
        <section className="picks" aria-live="polite">
          {picks.startedOver && <p className="book-meta">That was every match, so they start over in a new order.</p>}
          <ul className="book-list">
            {booksOf(picks.shown).map((c, i) => (
              <li key={c.id} className="pick">
                <button onClick={() => onOpenBook(c.id)}>
                  <span className="thumb">{coverUrl(c, 'M') && <img src={coverUrl(c, 'M')} alt="" loading="lazy" />}</span>
                  <span className="book-title">{c.title}</span>
                  <span className="book-meta">{c.byline}</span>
                  {c.work?.synopsis && <span className="pick-synopsis">{c.work.synopsis}</span>}
                  <span className="book-meta pick-why">{whyText(c, answers, { ...context, surprise: picks.surprise })}</span>
                </button>
                <button className="link pick-replace" disabled={!canReplace} onClick={() => replace(i)}>
                  Replace
                </button>
              </li>
            ))}
          </ul>
          <div className="button-pair pick-shuffle">
            <button className="secondary" onClick={shuffle} disabled={picks.order.length <= PICKS}>
              Shuffle
            </button>
          </div>
          {picks.order.length <= PICKS && <p className="book-meta">{picks.order.length === 1 ? 'That’s the only match.' : `Those are the only ${picks.order.length} matches.`}</p>}
        </section>
      )}
    </div>
  )
}

export default PickForMe
