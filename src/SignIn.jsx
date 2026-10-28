import { useState } from 'react'
import { supabase } from './supabase.js'

// Sign in with email + password. The autoComplete attributes let iPhone
// Keychain suggest and fill the password. New sign-ups are turned off in
// Supabase; accounts are added by hand there (Authentication → Users).
function SignIn() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    // On success, App notices the new session and shows the library.
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) setError(error.message)
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
      </form>

      {error && <p className="error">{error}</p>}
    </main>
  )
}

export default SignIn
