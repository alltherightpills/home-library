import { useState } from 'react'
import { supabase } from './supabase.js'

// Sign in with an emailed code (not a link: on iPhone, a link opens in Safari
// instead of the home-screen app, so the app would never see the sign-in).
function SignIn() {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState('email') // email | code
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function sendCode(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.signInWithOtp({ email: email.trim() })
    setBusy(false)
    if (error) setError(error.message)
    else setStep('code')
  }

  async function checkCode(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email',
    })
    setBusy(false)
    // On success, App notices the new session and shows the library.
    if (error) setError(error.message)
  }

  return (
    <main className="screen sign-in">
      <h1>Home Library</h1>

      {step === 'email' ? (
        <form onSubmit={sendCode}>
          <label>
            Email
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <button className="primary" disabled={busy}>
            {busy ? 'Sending…' : 'Send code'}
          </button>
        </form>
      ) : (
        <form onSubmit={checkCode}>
          <p>We emailed a code to {email}. Enter it below.</p>
          <label>
            Code
            <input
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          <button className="primary" disabled={busy}>
            {busy ? 'Checking…' : 'Sign in'}
          </button>
          <button type="button" className="link" onClick={() => setStep('email')}>
            Use a different email
          </button>
        </form>
      )}

      {error && <p className="error">{error}</p>}
    </main>
  )
}

export default SignIn
