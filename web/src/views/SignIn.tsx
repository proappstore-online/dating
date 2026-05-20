import { useState } from 'react'
import { app } from '../lib/app'

type Mode = 'choose' | 'email' | 'email-sent'

export default function SignIn() {
  const [mode, setMode] = useState<Mode>('choose')
  const [email, setEmail] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function sendMagicLink() {
    const trimmed = email.trim().toLowerCase()
    if (!trimmed.includes('@')) {
      setError('That doesn’t look like an email.')
      return
    }
    setSending(true)
    setError(null)
    try {
      await app.auth.signInWithEmail(trimmed)
      setMode('email-sent')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 text-center">
      <div className="text-7xl mb-6">&#10084;</div>
      <h1 className="display-font text-5xl mb-3">dating</h1>
      <p className="text-[var(--muted)] mb-10 max-w-xs">
        Swipe. Match. Talk. A small dating app on ProAppStore.
      </p>

      {mode === 'choose' && (
        <div className="w-full max-w-xs flex flex-col gap-3">
          <button
            onClick={() => app.auth.signIn('google')}
            className="rounded-full bg-[var(--ink)] text-[var(--paper)] font-semibold px-8 py-3 active:scale-95 transition flex items-center justify-center gap-2"
          >
            <GoogleGlyph />
            Continue with Google
          </button>
          <button
            onClick={() => { setError(null); setMode('email') }}
            className="rounded-full border border-[var(--line)] font-medium px-8 py-3 active:scale-95 transition"
          >
            Continue with email
          </button>
        </div>
      )}

      {mode === 'email' && (
        <form
          onSubmit={(e) => { e.preventDefault(); sendMagicLink() }}
          className="w-full max-w-xs flex flex-col gap-3"
        >
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoFocus
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="rounded-full border border-[var(--line)] bg-white px-5 py-3 text-base text-center"
          />
          {error && <p className="text-[var(--error)] text-sm">{error}</p>}
          <button
            type="submit"
            disabled={sending || !email.trim()}
            className="rounded-full bg-[var(--ink)] text-[var(--paper)] font-semibold px-8 py-3 disabled:opacity-40 active:scale-95 transition"
          >
            {sending ? 'Sending…' : 'Email me a link'}
          </button>
          <button
            type="button"
            onClick={() => { setError(null); setMode('choose') }}
            className="text-sm text-[var(--muted)] active:opacity-60"
          >
            Back
          </button>
        </form>
      )}

      {mode === 'email-sent' && (
        <div className="w-full max-w-xs">
          <div className="text-4xl mb-3">&#128231;</div>
          <p className="font-semibold mb-1">Check your inbox.</p>
          <p className="text-sm text-[var(--muted)] mb-6">
            We sent a sign-in link to <strong>{email}</strong>. Click it to come back here.
          </p>
          <button
            onClick={() => { setMode('choose'); setEmail('') }}
            className="text-sm text-[var(--muted)] underline active:opacity-60"
          >
            Use a different email
          </button>
        </div>
      )}

      <p className="mt-8 text-xs text-[var(--muted)] max-w-xs">
        By signing in you confirm you&rsquo;re 18+ and agree to be kind.
      </p>
    </div>
  )
}

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#FFC107" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z"/>
      <path fill="#4CAF50" d="M9 18c2.43 0 4.46-.8 5.95-2.18l-2.9-2.26c-.8.54-1.83.86-3.05.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.32A9 9 0 0 0 9 18z"/>
      <path fill="#1976D2" d="M3.97 10.72A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.04l3.01-2.32z"/>
      <path fill="#E53935" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59A9 9 0 0 0 9 0 9 9 0 0 0 .96 4.96l3.01 2.32C4.68 5.16 6.66 3.58 9 3.58z"/>
    </svg>
  )
}
