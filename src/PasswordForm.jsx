import { useState } from 'react'
import { supabase } from './supabase.js'

// Sets a new password for the signed-in person. Changing it from inside the app
// asks for the current one first; arriving from a reset email doesn't (that's
// the point), since the email link has already proved who this is.
function PasswordForm({ email, askCurrent, onDone, onCancel }) {
  const [current, setCurrent] = useState('')
  const [password, setPassword] = useState('')
  const [again, setAgain] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    if (password !== again) {
      setError("Those two passwords don't match.")
      return
    }
    setBusy(true)
    setError('')
    if (askCurrent) {
      const { error } = await supabase.auth.signInWithPassword({ email, password: current })
      if (error) {
        setError('That current password is not right.')
        setBusy(false)
        return
      }
    }
    const { error } = await supabase.auth.updateUser({ password })
    setBusy(false)
    if (error) setError(error.message)
    else onDone()
  }

  return (
    <div className="sign-in">
      <h2>Change password</h2>
      <p className="diagnostic">For {email}</p>

      <form onSubmit={submit}>
        {/* Tells iPhone Keychain which account this new password belongs to. */}
        <input type="text" autoComplete="username" value={email} readOnly hidden />
        {askCurrent && (
          <label>
            Current password
            <input
              type="password"
              autoComplete="current-password"
              required
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </label>
        )}
        <label>
          New password
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label>
          New password again
          <input
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={again}
            onChange={(e) => setAgain(e.target.value)}
          />
        </label>
        <button className="primary" disabled={busy}>
          {busy ? 'One moment…' : 'Save new password'}
        </button>
        {onCancel && (
          <button type="button" className="link" onClick={onCancel}>
            Cancel
          </button>
        )}
      </form>

      {error && <p className="error">{error}</p>}
    </div>
  )
}

export default PasswordForm
