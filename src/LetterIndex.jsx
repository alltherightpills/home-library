import { useEffect, useRef, useState } from 'react'
import { INDEX_LETTERS, nearestLetter } from './letters.js'

// The A–Z strip down the right edge of a long list (the iPhone calls it a
// section index): tap a letter, or slide a thumb along it, to jump there.
// `starts` is from letterStarts(); the list's items carry data-letter on the
// first of each letter. Wrap the list in this so the strip finds them. The
// strip is a column beside the list that sticks below the back bar (CSS
// `position: sticky`, so Safari moves it with the scrolling, smoothly): at the
// top of a screen it starts level with the list, clear of the buttons above.
function Lettered({ starts, children }) {
  if (!starts) return children
  return (
    <div className="lettered">
      {children}
      <LetterIndex present={new Set(starts.values())} />
    </div>
  )
}

// How far off the letters a reading can be and still count (a thumb sliding
// past the ends); anything further is a glitch and is ignored.
const SLACK = 60
// Safari sometimes reports the finger in the wrong place for a moment while the
// list scrolls under it (a jump to A or Z and back). A leap of more than this
// many letters in one move waits for the next reading to agree.
const LEAP = 6
const AGREE = 2 // how close (in letters) the next reading must be

function LetterIndex({ present }) {
  const strip = useRef(null)
  const [showing, setShowing] = useState(null) // the big letter while touching
  const lastJump = useRef(null)
  // Fixed when the finger goes down: where the letters run from and to, plus
  // the last letter position read and a leap waiting to be confirmed.
  const touch = useRef(null)
  const letters = INDEX_LETTERS

  // Which letter position is under the finger: the letters sit in the middle
  // of the strip, so this measures from the first letter to the last.
  function positionAt(y) {
    const { top, bottom } = touch.current
    if (y < top - SLACK || y > bottom + SLACK) return null
    const i = Math.floor(((y - top) / (bottom - top)) * letters.length)
    return Math.min(letters.length - 1, Math.max(0, i))
  }

  function jump(y) {
    const t = touch.current
    const i = positionAt(y)
    if (i === null) return
    if (t.last !== null && Math.abs(i - t.last) > LEAP) {
      // A leap: go there only once a second reading lands near it.
      const confirmed = t.leap !== null && Math.abs(i - t.leap) <= AGREE
      t.leap = confirmed ? null : i
      if (!confirmed) return
    } else {
      t.leap = null
    }
    t.last = i
    const letter = nearestLetter(letters[i], present)
    setShowing(letter)
    if (!letter || letter === lastJump.current) return
    lastJump.current = letter
    // Only this list's items: the strip sits beside them.
    strip.current.parentElement.querySelector(`[data-letter="${letter}"]`)?.scrollIntoView({ block: 'start' })
  }

  function end() {
    touch.current = null
    setShowing(null)
    lastJump.current = null
  }

  // While a finger is down, a lift anywhere ends it. iOS sometimes lets go of
  // the strip's hold on the touch without saying it lifted, which left the big
  // letter stuck on screen.
  useEffect(() => {
    if (!showing) return
    const events = ['pointerup', 'pointercancel', 'touchend', 'touchcancel']
    for (const name of events) window.addEventListener(name, end)
    return () => {
      for (const name of events) window.removeEventListener(name, end)
    }
  }, [showing])

  return (
    <>
      <nav
        ref={strip}
        className="letter-index"
        aria-label="Jump to a letter"
        onPointerDown={(e) => {
          const spans = strip.current.children
          touch.current = {
            top: spans[0].getBoundingClientRect().top,
            bottom: spans[spans.length - 1].getBoundingClientRect().bottom,
            last: null,
            leap: null,
          }
          // Keep receiving the finger's moves even when it slides off the strip.
          e.currentTarget.setPointerCapture(e.pointerId)
          jump(e.clientY)
        }}
        onPointerMove={(e) => touch.current && jump(e.clientY)}
        onPointerUp={end}
        onPointerCancel={end}
        onLostPointerCapture={end}
      >
        {letters.map((l) => (
          <span key={l} className={present.has(l) ? undefined : 'absent'}>
            {l}
          </span>
        ))}
      </nav>
      {showing && (
        <div className="letter-bubble" aria-hidden="true">
          {showing}
        </div>
      )}
    </>
  )
}

export default Lettered
