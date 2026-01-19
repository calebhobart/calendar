import { useState } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setMessage(null)

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        })
        if (error) throw error
        setMessage('Check your email for the confirmation link!')
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })
        if (error) throw error
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-surface-50 via-primary-50/30 to-surface-100 p-4">
      <div className="w-full max-w-md">
        {/* Logo and header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-500 rounded-2xl shadow-lg shadow-primary-500/30 mb-4">
            <svg
              className="w-8 h-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-surface-900">Calendar</h1>
          <p className="text-surface-500 mt-1">
            {isSignUp ? 'Create your account' : 'Welcome back'}
          </p>
        </div>

        {/* Form card */}
        <div className="bg-white rounded-2xl shadow-xl shadow-surface-200/50 p-8">
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Email field */}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-surface-700 mb-1.5"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 rounded-xl border border-surface-200 
                         focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10
                         transition-all duration-200 outline-none
                         placeholder:text-surface-400"
                placeholder="you@example.com"
              />
            </div>

            {/* Password field */}
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-surface-700 mb-1.5"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full px-4 py-3 rounded-xl border border-surface-200 
                         focus:border-primary-500 focus:ring-4 focus:ring-primary-500/10
                         transition-all duration-200 outline-none
                         placeholder:text-surface-400"
                placeholder="••••••••"
              />
            </div>

            {/* Error message */}
            {error && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-100">
                <p className="text-sm text-red-600">{error}</p>
              </div>
            )}

            {/* Success message */}
            {message && (
              <div className="p-3 rounded-xl bg-green-50 border border-green-100">
                <p className="text-sm text-green-600">{message}</p>
              </div>
            )}

            {/* Submit button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 rounded-xl font-semibold text-white
                       bg-primary-500 hover:bg-primary-600 
                       focus:outline-none focus:ring-4 focus:ring-primary-500/30
                       disabled:opacity-50 disabled:cursor-not-allowed
                       transition-all duration-200 shadow-lg shadow-primary-500/30"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {isSignUp ? 'Creating account...' : 'Signing in...'}
                </span>
              ) : isSignUp ? (
                'Create account'
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          {/* Toggle sign up / sign in */}
          <div className="mt-6 text-center">
            <p className="text-surface-500">
              {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(!isSignUp)
                  setError(null)
                  setMessage(null)
                }}
                className="font-semibold text-primary-600 hover:text-primary-700 transition-colors"
              >
                {isSignUp ? 'Sign in' : 'Sign up'}
              </button>
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-surface-400 text-sm mt-6">
          Aggregate all your calendars in one place
        </p>
      </div>
    </div>
  )
}
