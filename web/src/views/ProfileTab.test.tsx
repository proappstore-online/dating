import { useState } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { Profile } from '../types'
import { saveProfile } from '../lib/db'
import ProfileTab from './ProfileTab'

vi.mock('../lib/app', () => ({ app: { auth: { signOut: vi.fn() } } }))
vi.mock('../lib/db', () => ({ saveProfile: vi.fn() }))
vi.mock('../lib/prefs', () => ({
  DEFAULT_PREFS: { maxDistanceKm: 50, minAge: 18, maxAge: 40 },
  loadPrefs: async () => ({ maxDistanceKm: 50, minAge: 18, maxAge: 40 }),
  savePrefs: vi.fn(),
}))
vi.mock('../lib/realtime', () => ({
  getNotificationPermission: () => 'unsupported',
  requestNotificationPermission: vi.fn(),
}))
vi.mock('../lib/install', () => ({ useInstallPrompt: () => ({ canInstall: false }), isStandalone: () => true }))

const initial: Profile = {
  userId: 'test', displayName: 'Alex', dob: '1995-01-01', bio: 'Old bio',
  gender: 'woman', lookingFor: 'everyone', photos: ['/photo.jpg'],
  lat: 0, lng: 0, updatedAt: 0,
}
function ProfileScreen() {
  const [me, setMe] = useState(initial)
  return <ProfileTab me={me} onUpdated={setMe} onPrefsChanged={() => {}} onNavigate={() => {}} />
}
beforeEach(() => { vi.mocked(saveProfile).mockReset() })

it('shows the saved profile details immediately after editing', async () => {
  vi.mocked(saveProfile).mockResolvedValue(undefined)
  render(<ProfileScreen />)
  fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }))
  fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Avery' } })
  fireEvent.change(screen.getByLabelText('About you'), { target: { value: 'A new bio' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save profile' }))
  expect(await screen.findByRole('heading', { name: 'Avery' })).toBeVisible()
  expect(screen.getByText('A new bio')).toBeVisible()
  expect(saveProfile).toHaveBeenCalledWith(expect.objectContaining({ displayName: 'Avery', bio: 'A new bio' }))
})

it('keeps unsaved edits available when saving fails', async () => {
  vi.mocked(saveProfile).mockRejectedValue(new Error('Connection lost'))
  render(<ProfileScreen />)
  fireEvent.click(screen.getByRole('button', { name: 'Edit profile' }))
  fireEvent.change(screen.getByLabelText('Display name'), { target: { value: 'Avery' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save profile' }))
  expect(await screen.findByText('Save failed: Connection lost')).toBeVisible()
  expect(screen.getByLabelText('Display name')).toHaveValue('Avery')
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save profile' })).toBeEnabled())
})
