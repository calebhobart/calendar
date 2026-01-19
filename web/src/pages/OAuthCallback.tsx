import { useEffect, useState, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export default function OAuthCallback() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState('Processing...')
  const hasProcessed = useRef(false) // Guard against StrictMode double-call

  useEffect(() => {
    // Prevent duplicate processing (React StrictMode calls effects twice)
    if (hasProcessed.current) return
    hasProcessed.current = true

    async function handleCallback() {
      const code = searchParams.get('code')
      const errorParam = searchParams.get('error')
      const state = searchParams.get('state') // 'google' or 'microsoft'

      if (errorParam) {
        setError(`OAuth error: ${errorParam}`)
        return
      }

      if (!code) {
        setError('No authorization code received')
        return
      }

      // Determine provider from state parameter (default to google for backwards compatibility)
      const provider = state === 'microsoft' ? 'microsoft' : 'google'
      const providerLabel = provider === 'microsoft' ? 'Microsoft' : 'Google'

      try {
        setStatus(`Connecting your ${providerLabel} calendar...`)

        // Get the current session
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          setError('You must be logged in to connect a calendar')
          return
        }

        // Determine which Edge Functions to call based on provider
        const oauthFunctionName = provider === 'microsoft' 
          ? 'handle-microsoft-oauth' 
          : 'handle-google-oauth'
        const syncFunctionName = provider === 'microsoft' 
          ? 'sync-microsoft-calendar' 
          : 'sync-google-calendar'

        // Call the Edge Function to handle OAuth
        const { data, error: fnError } = await supabase.functions.invoke(
          oauthFunctionName,
          {
            body: {
              code,
              redirect_uri: `${window.location.origin}/oauth/callback`,
            },
          }
        )

        if (fnError) {
          throw new Error(fnError.message || 'Failed to connect calendar')
        }

        if (!data.success) {
          throw new Error(data.error || 'Failed to connect calendar')
        }

        setStatus('Calendar connected! Syncing events...')

        // Trigger initial sync
        const { error: syncError } = await supabase.functions.invoke(
          syncFunctionName,
          {
            body: {
              calendar_connection_id: data.calendar.id,
            },
          }
        )

        if (syncError) {
          console.error('Sync error:', syncError)
          // Don't throw - calendar is connected, sync can be retried
        }

        setStatus('Done! Redirecting...')
        
        // Redirect to dashboard after short delay
        setTimeout(() => {
          navigate('/', { replace: true })
        }, 1000)
      } catch (err) {
        console.error('OAuth callback error:', err)
        setError(err instanceof Error ? err.message : 'Failed to connect calendar')
      }
    }

    handleCallback()
  }, [searchParams, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-surface-50 via-primary-50/30 to-surface-100 p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-xl shadow-surface-200/50 p-8 text-center">
          {error ? (
            <>
              <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-4">
                <svg
                  className="w-8 h-8 text-red-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </div>
              <h2 className="text-xl font-semibold text-surface-900 mb-2">
                Connection Failed
              </h2>
              <p className="text-surface-500 mb-6">{error}</p>
              <button
                onClick={() => navigate('/', { replace: true })}
                className="px-6 py-2.5 rounded-xl font-semibold text-white
                         bg-primary-500 hover:bg-primary-600 
                         transition-all duration-200"
              >
                Go to Dashboard
              </button>
            </>
          ) : (
            <>
              <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-100 rounded-full mb-4">
                <div className="w-8 h-8 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
              </div>
              <h2 className="text-xl font-semibold text-surface-900 mb-2">
                {status}
              </h2>
              <p className="text-surface-500">Please wait while we set things up</p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
