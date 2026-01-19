import { useState, useRef, useEffect } from 'react'
import { CalendarConnection } from '../lib/supabase'

interface CalendarSidebarProps {
  calendars: CalendarConnection[]
  activeCalendarIds: Set<string>
  onToggleCalendar: (id: string) => void
  onConnectCalendar: () => void
  onSyncCalendar: (id: string, provider: string) => void
  onDeleteCalendar: (id: string) => void
  onSignOut: () => void
  syncingCalendarId: string | null
  deletingCalendarId: string | null
}

export default function CalendarSidebar({
  calendars,
  activeCalendarIds,
  onToggleCalendar,
  onConnectCalendar,
  onSyncCalendar,
  onDeleteCalendar,
  onSignOut,
  syncingCalendarId,
  deletingCalendarId,
}: CalendarSidebarProps) {
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuId(null)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function formatLastSynced(dateStr: string | null): string {
    if (!dateStr) return 'Never synced'
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  const providerLabels: Record<string, string> = {
    google: 'Google',
    outlook: 'Outlook',
    apple: 'Apple',
  }

  const providerColors: Record<string, string> = {
    google: '#4285f4',
    outlook: '#0078d4',
    apple: '#000000',
  }

  return (
    <aside className="w-72 bg-white border-r border-surface-200 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-surface-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary-500 rounded-xl flex items-center justify-center shadow-lg shadow-primary-500/30">
            <svg
              className="w-5 h-5 text-white"
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
          <div>
            <h1 className="font-semibold text-surface-900">Calendar</h1>
            <p className="text-xs text-surface-500">Multi-calendar view</p>
          </div>
        </div>
      </div>

      {/* Calendars list */}
      <div className="flex-1 overflow-auto p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-surface-500 uppercase tracking-wide">
            Calendars
          </h2>
          <button
            onClick={onConnectCalendar}
            className="p-1.5 text-surface-400 hover:text-primary-500 hover:bg-primary-50 
                     rounded-lg transition-colors"
            title="Connect calendar"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>

        {calendars.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 bg-surface-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-surface-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </div>
            <p className="text-sm text-surface-600 font-medium mb-1">No calendars</p>
            <p className="text-xs text-surface-400 mb-4">Connect a calendar to get started</p>
            <button
              onClick={onConnectCalendar}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium 
                       text-white bg-primary-500 rounded-lg hover:bg-primary-600 
                       transition-colors shadow-lg shadow-primary-500/30"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Connect Calendar
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {calendars.map((calendar) => {
              const isActive = activeCalendarIds.has(calendar.id)
              const isSyncing = syncingCalendarId === calendar.id
              const isDeleting = deletingCalendarId === calendar.id
              const isMenuOpen = openMenuId === calendar.id

              return (
                <div
                  key={calendar.id}
                  className={`p-3 rounded-xl border border-surface-100 hover:border-surface-200 
                           transition-colors bg-surface-50/50 ${isDeleting ? 'opacity-50' : ''}`}
                >
                  <div className="flex items-center gap-3">
                    {/* Toggle checkbox */}
                    <button
                      onClick={() => onToggleCalendar(calendar.id)}
                      disabled={isDeleting}
                      className={`w-5 h-5 rounded flex items-center justify-center transition-colors
                        ${isActive
                          ? 'text-white'
                          : 'border-2 border-surface-300 bg-white'
                        }`}
                      style={isActive ? { backgroundColor: calendar.calendar_color } : {}}
                    >
                      {isActive && (
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>

                    {/* Calendar info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-surface-900 truncate">
                          {calendar.calendar_name}
                        </p>
                        <span
                          className="text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase"
                          style={{
                            backgroundColor: `${providerColors[calendar.provider]}15`,
                            color: providerColors[calendar.provider],
                          }}
                        >
                          {providerLabels[calendar.provider]}
                        </span>
                      </div>
                      <p className="text-xs text-surface-400 mt-0.5">
                        {isDeleting ? 'Disconnecting...' : formatLastSynced(calendar.last_synced_at)}
                      </p>
                    </div>

                    {/* Three-dot menu */}
                    <div className="relative" ref={isMenuOpen ? menuRef : null}>
                      <button
                        onClick={() => setOpenMenuId(isMenuOpen ? null : calendar.id)}
                        disabled={isDeleting}
                        className="p-1.5 text-surface-400 hover:text-surface-600 hover:bg-surface-100 
                                 rounded-lg transition-colors disabled:opacity-50"
                        title="More options"
                      >
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <circle cx="12" cy="6" r="1.5" />
                          <circle cx="12" cy="12" r="1.5" />
                          <circle cx="12" cy="18" r="1.5" />
                        </svg>
                      </button>

                      {/* Dropdown menu */}
                      {isMenuOpen && (
                        <div className="absolute right-0 mt-1 w-40 bg-white rounded-lg shadow-lg 
                                      border border-surface-200 py-1 z-10">
                          {/* Sync now */}
                          <button
                            onClick={() => {
                              onSyncCalendar(calendar.id, calendar.provider)
                              setOpenMenuId(null)
                            }}
                            disabled={isSyncing}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-surface-700 
                                     hover:bg-surface-50 transition-colors disabled:opacity-50"
                          >
                            <svg
                              className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`}
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                              />
                            </svg>
                            {isSyncing ? 'Syncing...' : 'Sync now'}
                          </button>

                          {/* Divider */}
                          <div className="h-px bg-surface-100 my-1" />

                          {/* Disconnect */}
                          <button
                            onClick={() => {
                              onDeleteCalendar(calendar.id)
                              setOpenMenuId(null)
                            }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 
                                     hover:bg-red-50 transition-colors"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6"
                              />
                            </svg>
                            Disconnect
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Connect more calendars */}
        {calendars.length > 0 && (
          <button
            onClick={onConnectCalendar}
            className="w-full mt-4 p-3 rounded-xl border-2 border-dashed border-surface-200 
                     text-surface-400 hover:border-primary-300 hover:text-primary-500 
                     hover:bg-primary-50/50 transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            <span className="text-sm font-medium">Add calendar</span>
          </button>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-surface-100">
        <button
          onClick={onSignOut}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 
                   text-sm font-medium text-surface-600 hover:text-surface-900 
                   hover:bg-surface-100 rounded-lg transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
            />
          </svg>
          Sign out
        </button>
      </div>
    </aside>
  )
}
