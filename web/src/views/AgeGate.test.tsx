import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AgeGate from './AgeGate'
import { app } from '../lib/app'

vi.mock('../lib/app', () => ({
  app: { auth: { setDateOfBirth: vi.fn(), signOut: vi.fn() } },
}))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 26, 12))
  vi.mocked(app.auth.setDateOfBirth).mockReset()
})
afterEach(() => vi.useRealTimers())

describe('18+ onboarding gate', () => {
  it('disables confirmation for missing, underage and future dates', () => {
    render(<AgeGate onSet={vi.fn()} />)
    const confirm = screen.getByRole('button', { name: 'Confirm date of birth' })
    expect(confirm).toBeDisabled()
    for (const value of ['2008-10-27', '2027-01-01']) {
      fireEvent.change(screen.getByLabelText('Date of birth'), { target: { value } })
      expect(confirm).toBeDisabled()
    }
    expect(app.auth.setDateOfBirth).not.toHaveBeenCalled()
  })

  it('accepts the eighteenth birthday and waits for the platform to save it', async () => {
    let finish!: () => void
    vi.mocked(app.auth.setDateOfBirth).mockImplementation(() => new Promise<void>(resolve => { finish = resolve }))
    const onSet = vi.fn()
    render(<AgeGate onSet={onSet} />)
    fireEvent.change(screen.getByLabelText('Date of birth'), { target: { value: '2008-10-26' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm date of birth' }))
    expect(app.auth.setDateOfBirth).toHaveBeenCalledWith('2008-10-26')
    expect(onSet).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Date of birth')).toBeDisabled()
    finish()
    await waitFor(() => expect(onSet).toHaveBeenCalledOnce())
  })

  it('shows a platform failure and allows a retry without completing onboarding', async () => {
    vi.mocked(app.auth.setDateOfBirth).mockRejectedValueOnce(new Error('Unable to save'))
    const onSet = vi.fn()
    render(<AgeGate onSet={onSet} />)
    fireEvent.change(screen.getByLabelText('Date of birth'), { target: { value: '2000-01-01' } })
    fireEvent.click(screen.getByRole('button', { name: 'Confirm date of birth' }))
    expect(await screen.findByText('Unable to save')).toBeVisible()
    expect(onSet).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Confirm date of birth' })).toBeEnabled()
  })
})
