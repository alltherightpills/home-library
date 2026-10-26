// Shared by the scripts in this folder: signing in from the terminal and
// reading whole tables.

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://fafbtvvrhopkhnlmekeu.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_7XO2aj5ml2ER7ikR2hGLsQ_SI8Wz4Zg'

// Typed text not yet used by a question (a paste can hold several answers).
let pending = ''

// Ask a question in the terminal; `hidden` stops the answer from showing.
export function ask(question, hidden = false) {
  return new Promise((resolve) => {
    process.stdout.write(question)
    const stdin = process.stdin
    let answer = ''
    stdin.setRawMode?.(true)
    stdin.setEncoding('utf8')
    // A paste arrives as one chunk of many characters, so handle each in turn.
    const onData = (chunk) => {
      const chars = [...chunk]
      for (let i = 0; i < chars.length; i++) {
        const ch = chars[i]
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode?.(false)
          stdin.pause()
          stdin.off('data', onData)
          pending = chars.slice(i + 1).join('').replace(/^\n/, '')
          process.stdout.write('\n')
          resolve(answer)
          return
        } else if (ch === '\u0003') {
          process.exit(1) // Ctrl-C
        } else if (ch === '\u007f' || ch === '\b') {
          // Backspace: remove the last character, and erase it on screen too.
          if (answer && !hidden) process.stdout.write('\b \b')
          answer = answer.slice(0, -1)
        } else {
          answer += ch
          if (!hidden) process.stdout.write(ch)
        }
      }
    }
    stdin.on('data', onData)
    if (pending) {
      const leftover = pending
      pending = ''
      onData(leftover)
    }
    if (stdin.listenerCount('data')) stdin.resume()
  })
}

// Asks for email and password, signs in, and returns the client and library id.
export async function signIn() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false },
  })
  const email = (await ask('Email: ')).trim()
  const password = await ask('Password (hidden): ', true)
  console.log(`(Received a ${password.length}-character password.)`)
  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
  if (signInError) throw new Error(`Sign-in failed: ${signInError.message}`)

  const { data: libraryId, error: libError } = await supabase.rpc('my_library')
  if (libError) throw libError
  return { supabase, libraryId }
}

// Fetch every row of a table in this library (the server returns 1,000 at a time).
export async function fetchAll(supabase, table, columns, libraryId) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from(table).select(columns).eq('library_id', libraryId).order(columns.split(',')[0].trim()).range(from, from + 999)
    if (error) throw error
    rows.push(...data)
    if (data.length < 1000) return rows
  }
}
