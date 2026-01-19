import { useState, useEffect, useCallback } from 'react'
import { supabase, CalendarConnection, CalendarEvent, getGoogleOAuthUrl, getMicrosoftOAuthUrl } from '../lib/supabase'
import Calendar from '../components/Calendar'
import CalendarSidebar from '../components/CalendarSidebar'
import EventModal from '../components/EventModal'

export default function Dashboard() {
  const [calendars, setCalendars] = useState<CalendarConnection[]>([])
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [activeCalendarIds, setActiveCalendarIds] = useState<Set<string>>(new Set())
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [showProviderModal, setShowProviderModal] = useState(false)
  const [calendarToDelete, setCalendarToDelete] = useState<CalendarConnection | null>(null)

  // Fetch calendars and events
  const fetchData = useCallback(async () => {
    try {
      // Fetch calendar connections
      const { data: calendarsData, error: calendarsError } = await supabase
        .from('calendar_connections')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: true })

      if (calendarsError) throw calendarsError

      setCalendars(calendarsData || [])
      setActiveCalendarIds(new Set((calendarsData || []).map((c) => c.id)))

      // Fetch events with calendar info
      const { data: eventsData, error: eventsError } = await supabase
        .from('events')
        .select(`
          *,
          calendar_connections!inner(
            calendar_name,
            calendar_color,
            provider
          )
        `)
        .neq('status', 'cancelled')
        .order('start_time', { ascending: true })

      if (eventsError) throw eventsError

      setEvents(eventsData || [])
    } catch (error) {
      console.error('Error fetching data:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Handle calendar toggle
  function handleCalendarToggle(calendarId: string) {
    setActiveCalendarIds((prev) => {
      const next = new Set(prev)
      if (next.has(calendarId)) {
        next.delete(calendarId)
      } else {
        next.add(calendarId)
      }
      return next
    })
  }

  // Handle connect calendar - show provider selection modal
  function handleConnectCalendar() {
    setShowProviderModal(true)
  }

  // Handle connecting to a specific provider
  function handleConnectProvider(provider: 'google' | 'outlook') {
    const redirectUri = `${window.location.origin}/oauth/callback`
    if (provider === 'google') {
      window.location.href = getGoogleOAuthUrl(redirectUri)
    } else if (provider === 'outlook') {
      window.location.href = getMicrosoftOAuthUrl(redirectUri)
    }
    setShowProviderModal(false)
  }

  // Handle sync calendar - routes to correct function based on provider
  async function handleSyncCalendar(calendarId: string, provider: string) {
    setSyncing(calendarId)
    try {
      const functionName = provider === 'outlook' 
        ? 'sync-microsoft-calendar' 
        : 'sync-google-calendar'
      
      const { error } = await supabase.functions.invoke(functionName, {
        body: { calendar_connection_id: calendarId },
      })

      if (error) throw error

      // Refresh data after sync
      await fetchData()
    } catch (error) {
      console.error('Sync error:', error)
    } finally {
      setSyncing(null)
    }
  }

  // Handle delete calendar - show confirmation modal
  function handleDeleteCalendar(calendarId: string) {
    const calendar = calendars.find((c) => c.id === calendarId)
    if (calendar) {
      setCalendarToDelete(calendar)
    }
  }

  // Confirm and execute calendar deletion
  async function confirmDeleteCalendar() {
    if (!calendarToDelete) return

    setDeleting(calendarToDelete.id)
    setCalendarToDelete(null)

    try {
      const { error } = await supabase.functions.invoke('delete-calendar-connection', {
        body: { connection_id: calendarToDelete.id },
      })

      if (error) throw error

      // Refresh data after deletion
      await fetchData()
    } catch (error) {
      console.error('Delete error:', error)
    } finally {
      setDeleting(null)
    }
  }

  // Handle sign out
  async function handleSignOut() {
    await supabase.auth.signOut()
  }

  // Filter events by active calendars
  const filteredEvents = events.filter((event) =>
    activeCalendarIds.has(event.calendar_connection_id)
  )

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin" />
          <p className="text-surface-500 font-medium">Loading your calendars...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-surface-50 flex">
      {/* Sidebar */}
      <CalendarSidebar
        calendars={calendars}
        activeCalendarIds={activeCalendarIds}
        onToggleCalendar={handleCalendarToggle}
        onConnectCalendar={handleConnectCalendar}
        onSyncCalendar={handleSyncCalendar}
        onDeleteCalendar={handleDeleteCalendar}
        onSignOut={handleSignOut}
        syncingCalendarId={syncing}
        deletingCalendarId={deleting}
      />

      {/* Main content */}
      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-7xl mx-auto">
          <Calendar
            events={filteredEvents}
            onEventClick={setSelectedEvent}
          />
        </div>
      </main>

      {/* Event modal */}
      {selectedEvent && (
        <EventModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
        />
      )}

      {/* Provider selection modal */}
      {showProviderModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4">
            <h2 className="text-lg font-semibold text-surface-900 mb-4">
              Connect Calendar
            </h2>
            <p className="text-sm text-surface-500 mb-6">
              Choose a calendar provider to connect
            </p>
            <div className="space-y-3">
              {/* Google Calendar */}
              <button
                onClick={() => handleConnectProvider('google')}
                className="w-full flex items-center gap-4 p-4 rounded-xl border border-surface-200 
                         hover:border-surface-300 hover:bg-surface-50 transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-white border border-surface-200 
                              flex items-center justify-center">
                  <svg className="w-6 h-6" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                </div>
                <div className="flex-1 text-left">
                  <p className="font-medium text-surface-900">Google Calendar</p>
                  <p className="text-xs text-surface-500">Connect your Google account</p>
                </div>
                <svg className="w-5 h-5 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>

              {/* Microsoft Outlook */}
              <button
                onClick={() => handleConnectProvider('outlook')}
                className="w-full flex items-center gap-4 p-4 rounded-xl border border-surface-200 
                         hover:border-surface-300 hover:bg-surface-50 transition-colors"
              >
                <div className="w-10 h-10 rounded-lg bg-white border border-surface-200 
                              flex items-center justify-center">
                  <svg className="w-6 h-6" viewBox="0 0 24 24">
                    <path fill="#0078D4" d="M24 7.387v10.478c0 .23-.08.424-.238.576-.158.152-.354.228-.588.228h-8.174v-6.212l1.602 1.18a.369.369 0 00.477-.012l.012-.012 5.909-4.818v-.002c.168-.14.168-.37 0-.51l-.168-.138-.168.138-5.585 4.554-1.602-1.18-.477.348v-5.12h8.174c.234 0 .43.076.588.228.158.152.238.346.238.576z"/>
                    <path fill="#0078D4" d="M14.174 6.6v6.669l-1.602-1.18-.477.348v-5.837h-7.2a.6.6 0 00-.424.176.593.593 0 00-.176.424v11.4c0 .164.058.306.176.424a.593.593 0 00.424.176h7.2v-5.837l.477.348 1.602-1.18V19.2c0 .234-.076.43-.228.588a.794.794 0 01-.576.238H4.095a.794.794 0 01-.576-.238.782.782 0 01-.228-.588V6.6c0-.234.076-.43.228-.588a.782.782 0 01.576-.238h9.305c.234 0 .43.076.588.228.152.158.186.354.186.598z"/>
                    <path fill="#0078D4" d="M8.695 9.974a2.826 2.826 0 011.028.192c.322.128.6.308.835.54.234.232.418.508.55.828.133.32.2.67.2 1.049 0 .387-.067.742-.2 1.065a2.483 2.483 0 01-.55.844 2.522 2.522 0 01-.835.554 2.708 2.708 0 01-1.028.198 2.766 2.766 0 01-1.04-.198 2.566 2.566 0 01-.844-.554 2.536 2.536 0 01-.565-.844 2.808 2.808 0 01-.204-1.065c0-.379.068-.729.204-1.049.136-.32.324-.596.565-.828.24-.232.522-.412.844-.54.322-.128.67-.192 1.04-.192zm0 4.25c.295 0 .55-.112.765-.336.215-.224.322-.532.322-.924 0-.392-.107-.704-.322-.936a1.012 1.012 0 00-.765-.348c-.303 0-.562.116-.779.348-.216.232-.324.544-.324.936 0 .392.108.7.324.924.217.224.476.336.779.336z"/>
                  </svg>
                </div>
                <div className="flex-1 text-left">
                  <p className="font-medium text-surface-900">Microsoft Outlook</p>
                  <p className="text-xs text-surface-500">Connect your Microsoft account</p>
                </div>
                <svg className="w-5 h-5 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* Cancel button */}
            <button
              onClick={() => setShowProviderModal(false)}
              className="w-full mt-4 py-2.5 text-sm font-medium text-surface-600 
                       hover:text-surface-900 hover:bg-surface-100 rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {calendarToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4">
            {/* Warning icon */}
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>

            <h2 className="text-lg font-semibold text-surface-900 text-center mb-2">
              Disconnect Calendar?
            </h2>
            <p className="text-sm text-surface-500 text-center mb-6">
              Are you sure you want to disconnect{' '}
              <span className="font-medium text-surface-700">{calendarToDelete.calendar_name}</span>?
              This will remove all synced events from this calendar.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setCalendarToDelete(null)}
                className="flex-1 py-2.5 text-sm font-medium text-surface-600 
                         hover:text-surface-900 hover:bg-surface-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteCalendar}
                className="flex-1 py-2.5 text-sm font-medium text-white bg-red-600 
                         hover:bg-red-700 rounded-lg transition-colors"
              >
                Disconnect
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
