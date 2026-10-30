import { useState } from 'react'
import { supabase } from './supabase.js'

// Sign in with email + password. The autoComplete attributes let iPhone
// Keychain suggest and fill the password. New sign-ups are turned off in
// Supabase; accounts are added by hand there (Authentication → Users).
function SignIn({ linkFailed }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(linkFailed ? 'That reset link has expired or was already used. Ask for a new one below.' : '')
  const [message, setMessage] = useState('')

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    // On success, App notices the new session and shows the library.
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) setError(error.message)
    setBusy(false)
  }

  // Emails a link back to this app, which opens the new-password form.
  async function forgot() {
    if (!email.trim()) {
      setError('Enter your email above first.')
      return
    }
    setBusy(true)
    setError('')
    setMessage('')
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin + import.meta.env.BASE_URL,
    })
    if (error) setError(error.message)
    else setMessage('If that address has an account, a reset email is on its way. It may land in spam.')
    setBusy(false)
  }

  return (
    <main className="screen sign-in">
      <h1>Home Library</h1>

      <form onSubmit={submit}>
        <label>
          Email
          <input
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            minLength={8}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button className="primary" disabled={busy}>
          {busy ? 'One moment…' : 'Sign in'}
        </button>
        <button type="button" className="link" disabled={busy} onClick={forgot}>
          Forgot password?
        </button>
      </form>

      {error && <p className="error">{error}</p>}
      {message && <p>{message}</p>}
    </main>
  )
}

export default SignIn
