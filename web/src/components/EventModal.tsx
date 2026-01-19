import { useEffect, useCallback } from 'react'
import { CalendarEvent } from '../lib/supabase'

interface EventModalProps {
  event: CalendarEvent
  onClose: () => void
}

export default function EventModal({ event, onClose }: EventModalProps) {
  // Handle escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      }
    },
    [onClose]
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [handleKeyDown])

  // Format date/time
  function formatDateTime(dateStr: string, isAllDay: boolean): string {
    const date = new Date(dateStr)
    if (isAllDay) {
      return date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    }
    return date.toLocaleString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  function formatTimeRange(): string {
    const start = formatDateTime(event.start_time, event.is_all_day)
    if (!event.end_time) return start

    if (event.is_all_day) {
      const endDate = new Date(event.end_time)
      const startDate = new Date(event.start_time)
      // Check if same day
      if (endDate.toDateString() === startDate.toDateString()) {
        return start
      }
      return `${start} - ${formatDateTime(event.end_time, true)}`
    }

    const startDate = new Date(event.start_time)
    const endDate = new Date(event.end_time)

    // Same day
    if (startDate.toDateString() === endDate.toDateString()) {
      return `${start} - ${endDate.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
      })}`
    }

    return `${start} - ${formatDateTime(event.end_time, false)}`
  }

  const calendarColor = event.calendar_connections?.calendar_color || '#3788d8'
  const calendarName = event.calendar_connections?.calendar_name || 'Calendar'
  const providerName = event.calendar_connections?.provider || 'unknown'

  const providerIcon: Record<string, string> = {
    google: 'G',
    outlook: 'O',
    apple: 'A',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-surface-900/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Color bar */}
        <div
          className="h-2"
          style={{ backgroundColor: calendarColor }}
        />

        {/* Content */}
        <div className="p-6">
          {/* Header */}
          <div className="flex items-start justify-between gap-4 mb-6">
            <div className="flex-1 min-w-0">
              <h2 className="text-xl font-semibold text-surface-900 mb-1 truncate">
                {event.title}
              </h2>
              <div className="flex items-center gap-2 text-sm text-surface-500">
                <span
                  className="inline-flex items-center justify-center w-5 h-5 text-xs font-bold text-white rounded"
                  style={{ backgroundColor: calendarColor }}
                >
                  {providerIcon[providerName] || '?'}
                </span>
                <span>{calendarName}</span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-surface-400 hover:text-surface-600 hover:bg-surface-100 
                       rounded-lg transition-colors"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Details */}
          <div className="space-y-4">
            {/* Time */}
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-surface-100 rounded-lg">
                <svg className="w-5 h-5 text-surface-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12,6 12,12 16,14" />
                </svg>
              </div>
              <div className="flex-1 pt-2">
                <p className="text-surface-900 font-medium">{formatTimeRange()}</p>
                {event.is_all_day && (
                  <p className="text-sm text-surface-500 mt-0.5">All day</p>
                )}
              </div>
            </div>

            {/* Location */}
            {event.location && (
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-surface-100 rounded-lg">
                  <svg className="w-5 h-5 text-surface-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <div className="flex-1 pt-2">
                  <p className="text-surface-900">{event.location}</p>
                </div>
              </div>
            )}

            {/* Description */}
            {event.description && (
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center bg-surface-100 rounded-lg">
                  <svg className="w-5 h-5 text-surface-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                  </svg>
                </div>
                <div className="flex-1 pt-2">
                  <p className="text-surface-700 whitespace-pre-wrap break-words">
                    {event.description}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-surface-50 border-t border-surface-100">
          <div className="flex items-center justify-between">
            <p className="text-xs text-surface-400">
              Last updated: {new Date(event.updated_at).toLocaleDateString()}
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-surface-700 bg-white 
                       border border-surface-200 rounded-lg hover:bg-surface-50 
                       transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
