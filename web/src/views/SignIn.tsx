import { app } from '../lib/app'

export default function SignIn() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 text-center">
      <div className="text-7xl mb-6">&#10084;</div>
      <h1 className="display-font text-5xl mb-3">dating</h1>
      <p className="text-[var(--muted)] mb-10 max-w-xs">
        Swipe. Match. Talk. A small dating app on ProAppStore.
      </p>
      <button
        onClick={() => app.auth.signIn('github')}
        className="rounded-full bg-[var(--ink)] text-[var(--paper)] font-semibold px-8 py-3 active:scale-95 transition"
      >
        Sign in with GitHub
      </button>
      <p className="mt-6 text-xs text-[var(--muted)] max-w-xs">
        By signing in you confirm you&rsquo;re 18+ and agree to be kind.
      </p>
    </div>
  )
}
