export type Gender = 'woman' | 'man' | 'nonbinary'
export type LookingFor = 'women' | 'men' | 'everyone'

export interface Profile {
  userId: string
  displayName: string
  dob: string
  bio: string
  gender: Gender
  lookingFor: LookingFor
  photos: string[]
  lat: number | null
  lng: number | null
  updatedAt: number
}

export type SwipeDirection = 'left' | 'right'

export interface Swipe {
  swiperId: string
  targetId: string
  direction: SwipeDirection
  createdAt: number
}

export interface Match {
  aId: string
  bId: string
  createdAt: number
}

export interface Message {
  id: string
  matchA: string
  matchB: string
  senderId: string
  body: string
  createdAt: number
}

export interface Candidate extends Profile {
  distanceKm: number | null
}

export type View =
  | { name: 'signin' }
  | { name: 'onboarding' }
  | { name: 'discover' }
  | { name: 'matches' }
  | { name: 'chat'; aId: string; bId: string; otherName: string }
  | { name: 'profile' }
