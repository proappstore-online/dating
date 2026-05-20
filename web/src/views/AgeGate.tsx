import { useState } from 'react'
import { app } from '../lib/app'
import { ageFromDob } from '../lib/photos'

interface Props {
  onSet: () => void
}

/**
 * One-time platform DOB capture. Set via app.auth.setDateOfBirth — propagates
 * to every other app on the platform. Dating enforces 18+; the platform's
 * own floor is 13.
 */
export default function AgeGate({ onSet }: Props) {
  const [dob, setDob] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const age = ageFromDob(dob)
  const ready = age != null && age >= 18 && age <= 120

  async function handleConfirm() {
    if (!ready) return
    setSaving(true)
    setError(null)
    try {
      await app.auth.setDateOfBirth(dob)
      onSet()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 text-center">
      <div className="text-5xl mb-5">&#127874;</div>
      <h1 className="display-font text-3xl mb-2">When were you born?</h1>
      <p className="text-[var(--muted)] text-sm mb-8 max-w-xs">
        Set this once and every ProAppStore app gets it. You can&rsquo;t change it later, so be exact.
      </p>

      <input
        type="date"
        value={dob}
        onChange={(e) => setDob(e.target.value)}
        max={new Date().toISOString().slice(0, 10)}
        className="w-full max-w-xs rounded-xl border border-[var(--line)] bg-white px-4 py-3 text-base text-center"
      />
      {age != null && (
        <p className={`text-xs mt-2 ${age >= 18 && age <= 120 ? 'text-[var(--muted)]' : 'text-[var(--error)]'}`}>
          {age < 0 ? "That's in the future." :
            age < 18 ? `${age} — dating is 18+. Sorry.` :
            age > 120 ? "That doesn't look right." :
            `You'll be shown as age ${age}.`}
        </p>
      )}
      {error && <p className="text-[var(--error)] text-sm mt-3">{error}</p>}

      <button
        onClick={handleConfirm}
        disabled={!ready || saving}
        className="mt-8 rounded-full bg-[var(--accent)] text-white font-semibold px-8 py-3 disabled:opacity-40 active:scale-95 transition"
      >
        {saving ? 'Saving…' : 'Confirm'}
      </button>

      <button
        onClick={() => app.auth.signOut()}
        disabled={saving}
        className="mt-4 text-sm text-[var(--muted)] hover:text-[var(--ink)] underline disabled:opacity-50"
      >
        Sign out
      </button>
    </div>
  )
}
