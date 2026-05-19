import { useState } from 'react'
import { blockUser, reportUser, unmatch, type ReportReason } from '../lib/db'

interface Props {
  meId: string
  otherId: string
  aId: string
  bId: string
  otherName: string
  onClose: () => void
  onDone: () => void
}

type Step = 'menu' | 'confirm-unmatch' | 'confirm-block' | 'report'

export default function SafetyMenu({ meId, otherId, aId, bId, otherName, onClose, onDone }: Props) {
  const [step, setStep] = useState<Step>('menu')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [reason, setReason] = useState<ReportReason>('inappropriate')
  const [note, setNote] = useState('')

  async function runUnmatch() {
    setBusy(true); setError(null)
    try { await unmatch(aId, bId); onDone() }
    catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }
  async function runBlock() {
    setBusy(true); setError(null)
    try { await blockUser(meId, otherId); onDone() }
    catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }
  async function runReport() {
    setBusy(true); setError(null)
    try {
      await reportUser(meId, otherId, reason, note.trim())
      await blockUser(meId, otherId)
      onDone()
    } catch (e) { setError((e as Error).message) }
    finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-end" onClick={onClose}>
      <div
        className="w-full bg-[var(--paper)] rounded-t-3xl p-5 pb-8"
        style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
        onClick={(e) => e.stopPropagation()}
      >
        {step === 'menu' && (
          <>
            <h2 className="display-font text-xl mb-1">{otherName}</h2>
            <p className="text-sm text-[var(--muted)] mb-5">Choose what to do.</p>
            <MenuRow label="Unmatch" desc="End this match. You can both swipe again later." onClick={() => setStep('confirm-unmatch')} />
            <MenuRow label="Block" desc="Hide each other permanently. They won't know." onClick={() => setStep('confirm-block')} danger />
            <MenuRow label="Report" desc="Flag this profile for review, then block." onClick={() => setStep('report')} danger />
            <button onClick={onClose} className="w-full mt-4 py-3 text-[var(--muted)]">Cancel</button>
          </>
        )}

        {step === 'confirm-unmatch' && (
          <Confirm
            title="Unmatch?"
            body={`Your conversation with ${otherName} will be deleted.`}
            cta="Unmatch"
            danger
            busy={busy}
            error={error}
            onCancel={() => setStep('menu')}
            onConfirm={runUnmatch}
          />
        )}

        {step === 'confirm-block' && (
          <Confirm
            title="Block?"
            body={`${otherName} won't see your profile and you won't see theirs. This is permanent.`}
            cta="Block"
            danger
            busy={busy}
            error={error}
            onCancel={() => setStep('menu')}
            onConfirm={runBlock}
          />
        )}

        {step === 'report' && (
          <>
            <h2 className="display-font text-xl mb-1">Report {otherName}</h2>
            <p className="text-sm text-[var(--muted)] mb-4">Help us keep this space safe.</p>
            <label className="block text-xs uppercase tracking-wider font-semibold text-[var(--muted)] mb-2">Reason</label>
            <div className="flex flex-wrap gap-2 mb-4">
              {(['inappropriate', 'spam', 'underage', 'harassment', 'fake', 'other'] as ReportReason[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setReason(r)}
                  className={`px-3 py-1.5 rounded-full text-sm border ${
                    reason === r
                      ? 'bg-[var(--ink)] text-[var(--paper)] border-[var(--ink)]'
                      : 'bg-white text-[var(--ink)] border-[var(--line)]'
                  }`}
                >
                  {reasonLabel(r)}
                </button>
              ))}
            </div>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional context"
              maxLength={500}
              rows={3}
              className="w-full rounded-xl border border-[var(--line)] bg-white px-3 py-2 text-sm resize-none mb-3"
            />
            {error && <p className="text-[var(--error)] text-sm mb-2">{error}</p>}
            <div className="flex gap-2">
              <button onClick={() => setStep('menu')} className="flex-1 py-3 rounded-full border border-[var(--line)]">Back</button>
              <button
                onClick={runReport}
                disabled={busy}
                className="flex-1 py-3 rounded-full bg-[var(--error)] text-white font-semibold disabled:opacity-50"
              >
                {busy ? 'Sending…' : 'Send report'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function MenuRow({
  label, desc, onClick, danger,
}: { label: string; desc: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-2xl active:bg-[var(--accent-soft)] transition flex flex-col`}
    >
      <span className={`font-semibold ${danger ? 'text-[var(--error)]' : ''}`}>{label}</span>
      <span className="text-xs text-[var(--muted)]">{desc}</span>
    </button>
  )
}

function Confirm({
  title, body, cta, danger, busy, error, onCancel, onConfirm,
}: {
  title: string; body: string; cta: string; danger?: boolean
  busy: boolean; error: string | null
  onCancel: () => void; onConfirm: () => void
}) {
  return (
    <>
      <h2 className="display-font text-xl mb-1">{title}</h2>
      <p className="text-sm text-[var(--muted)] mb-5">{body}</p>
      {error && <p className="text-[var(--error)] text-sm mb-2">{error}</p>}
      <div className="flex gap-2">
        <button onClick={onCancel} className="flex-1 py-3 rounded-full border border-[var(--line)]">Cancel</button>
        <button
          onClick={onConfirm}
          disabled={busy}
          className={`flex-1 py-3 rounded-full text-white font-semibold disabled:opacity-50 ${
            danger ? 'bg-[var(--error)]' : 'bg-[var(--ink)]'
          }`}
        >
          {busy ? '…' : cta}
        </button>
      </div>
    </>
  )
}

function reasonLabel(r: ReportReason): string {
  return {
    inappropriate: 'Inappropriate',
    spam: 'Spam',
    underage: 'Underage',
    harassment: 'Harassment',
    fake: 'Fake profile',
    other: 'Other',
  }[r]
}
