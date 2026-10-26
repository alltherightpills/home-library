import { useState } from 'react'
import { supabase } from './supabase.js'

// Sign in with email + password. The autoComplete attributes let iPhone
// Keychain suggest, save, and fill the password.
function SignIn() {
  const [mode, setMode] = useState('signIn') // signIn | signUp
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const signingUp = mode === 'signUp'

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    setMessage('')
    const credentials = { email: email.trim(), password }

    if (signingUp) {
      const { data, error } = await supabase.auth.signUp({
        ...credentials,
        options: { emailRedirectTo: 'https://alltherightpills.github.io/home-library/' },
      })
      if (error) setError(error.message)
      // No session yet means Supabase wants the email address confirmed first.
      else if (!data.session) {
        setMessage(
          'Check your email and tap the confirmation link. Then come back here and sign in.',
        )
        setMode('signIn')
      }
    } else {
      // On success, App notices the new session and shows the library.
      const { error } = await supabase.auth.signInWithPassword(credentials)
      if (error) setError(error.message)
    }
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
            autoComplete={signingUp ? 'new-password' : 'current-password'}
            minLength={8}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button className="primary" disabled={busy}>
          {busy ? 'One moment…' : signingUp ? 'Create account' : 'Sign in'}
        </button>
        <button
          type="button"
          className="link"
          onClick={() => {
            setMode(signingUp ? 'signIn' : 'signUp')
            setError('')
            setMessage('')
          }}
        >
          {signingUp ? 'I already have an account' : 'First time? Create an account'}
        </button>
      </form>

      {message && <p>{message}</p>}
      {error && <p className="error">{error}</p>}
    </main>
  )
}

export default SignIn
