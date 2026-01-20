import { useState, useRef } from 'react'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import interactionPlugin from '@fullcalendar/interaction'
import { EventClickArg } from '@fullcalendar/core'
import { CalendarEvent } from '../lib/supabase'

type ViewType = 'dayGridMonth' | 'timeGridWeek' | 'timeGridDay'

interface CalendarProps {
  events: CalendarEvent[]
  onEventClick: (event: CalendarEvent) => void
}

export default function Calendar({ events, onEventClick }: CalendarProps) {
  const calendarRef = useRef<FullCalendar>(null)
  const [currentView, setCurrentView] = useState<ViewType>('dayGridMonth')

  // Transform events for FullCalendar
  const calendarEvents = events.map((event) => ({
    id: event.id,
    title: event.title,
    start: event.start_time,
    end: event.end_time || undefined,
    allDay: event.is_all_day,
    backgroundColor: event.calendar_connections?.calendar_color || '#3788d8',
    borderColor: event.calendar_connections?.calendar_color || '#3788d8',
    extendedProps: {
      originalEvent: event,
    },
  }))

  function handleEventClick(info: EventClickArg) {
    const originalEvent = info.event.extendedProps.originalEvent as CalendarEvent
    onEventClick(originalEvent)
  }

  function handleViewChange(view: ViewType) {
    setCurrentView(view)
    calendarRef.current?.getApi().changeView(view)
  }

  function handleToday() {
    calendarRef.current?.getApi().today()
  }

  function handlePrev() {
    calendarRef.current?.getApi().prev()
  }

  function handleNext() {
    calendarRef.current?.getApi().next()
  }

  const viewOptions: { value: ViewType; label: string }[] = [
    { value: 'dayGridMonth', label: 'Month' },
    { value: 'timeGridWeek', label: 'Week' },
    { value: 'timeGridDay', label: 'Day' },
  ]

  return (
    <div className="bg-white rounded-2xl shadow-lg shadow-surface-200/50 p-6">
      {/* Custom header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={handleToday}
            className="px-4 py-2 text-sm font-medium text-surface-700 bg-surface-100 
                     hover:bg-surface-200 rounded-lg transition-colors"
          >
            Today
          </button>
          <div className="flex items-center gap-1">
            <button
              onClick={handlePrev}
              className="p-2 text-surface-500 hover:text-surface-700 hover:bg-surface-100 
                       rounded-lg transition-colors"
              aria-label="Previous"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={handleNext}
              className="p-2 text-surface-500 hover:text-surface-700 hover:bg-surface-100 
                       rounded-lg transition-colors"
              aria-label="Next"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-1 p-1 bg-surface-100 rounded-lg">
          {viewOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => handleViewChange(option.value)}
              className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all duration-200
                ${currentView === option.value
                  ? 'bg-white text-surface-900 shadow-sm'
                  : 'text-surface-500 hover:text-surface-700'
                }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar */}
      <FullCalendar
        ref={calendarRef}
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView={currentView}
        events={calendarEvents}
        eventClick={handleEventClick}
        headerToolbar={false}
        height="auto"
        dayMaxEvents={3}
        nowIndicator={true}
        weekends={true}
        slotMinTime="06:00:00"
        slotMaxTime="22:00:00"
        allDaySlot={true}
        expandRows={true}
        stickyHeaderDates={true}
        eventDisplay="block"
        eventTimeFormat={{
          hour: 'numeric',
          minute: '2-digit',
          meridiem: 'short',
        }}
        slotLabelFormat={{
          hour: 'numeric',
          minute: '2-digit',
          meridiem: 'short',
        }}
        views={{
          dayGridMonth: {
            dayHeaderFormat: { weekday: 'short' }, // Just "Sun", "Mon", etc.
          },
          timeGridWeek: {
            dayHeaderFormat: { weekday: 'short', month: 'numeric', day: 'numeric', omitCommas: true },
          },
          timeGridDay: {
            dayHeaderFormat: { weekday: 'long', month: 'long', day: 'numeric' },
          },
        }}
      />

      {/* Empty state */}
      {events.length === 0 && (
        <div className="text-center py-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-surface-100 rounded-full mb-4">
            <svg
              className="w-8 h-8 text-surface-400"
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
          <h3 className="text-lg font-semibold text-surface-900 mb-1">No events</h3>
          <p className="text-surface-500">
            Connect a calendar to see your events here
          </p>
        </div>
      )}
    </div>
  )
}
