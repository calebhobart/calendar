import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import ICAL from "https://esm.sh/ical.js@1.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Map Windows timezone names to IANA timezone names
const windowsToIana: Record<string, string> = {
  "Eastern Standard Time": "America/New_York",
  "Eastern Daylight Time": "America/New_York",
  "Central Standard Time": "America/Chicago",
  "Central Daylight Time": "America/Chicago",
  "Mountain Standard Time": "America/Denver",
  "Mountain Daylight Time": "America/Denver",
  "Pacific Standard Time": "America/Los_Angeles",
  "Pacific Daylight Time": "America/Los_Angeles",
  "Alaska Standard Time": "America/Anchorage",
  "Hawaii-Aleutian Standard Time": "Pacific/Honolulu",
  "Atlantic Standard Time": "America/Halifax",
  "Newfoundland Standard Time": "America/St_Johns",
  "GMT Standard Time": "Europe/London",
  "W. Europe Standard Time": "Europe/Berlin",
  "Central European Standard Time": "Europe/Warsaw",
  "Romance Standard Time": "Europe/Paris",
  "Central Europe Standard Time": "Europe/Budapest",
  "E. Europe Standard Time": "Europe/Chisinau",
  "India Standard Time": "Asia/Kolkata",
  "China Standard Time": "Asia/Shanghai",
  "Tokyo Standard Time": "Asia/Tokyo",
  "AUS Eastern Standard Time": "Australia/Sydney",
  "UTC": "UTC",
  "Coordinated Universal Time": "UTC",
};

// Convert Windows timezone to IANA, or return as-is if already IANA
function convertTimezone(tz: string | null): string | null {
  if (!tz) return null;
  return windowsToIana[tz] || tz;
}

// Convert ICAL.Time to proper UTC ISO string, respecting the timezone
function icalTimeToUTC(icalTime: any, vevent: any): string {
  if (!icalTime) return new Date().toISOString();
  
  // Get the timezone from the property
  const prop = vevent.getFirstProperty("dtstart");
  const tzid = prop?.getParameter("tzid");
  const ianaZone = tzid ? (windowsToIana[tzid] || tzid) : null;
  
  // If it's a DATE (all-day event) without time, just use the date
  if (icalTime.isDate) {
    // All-day events: use noon UTC to avoid date shifting issues
    return `${icalTime.year}-${String(icalTime.month).padStart(2, '0')}-${String(icalTime.day).padStart(2, '0')}T12:00:00.000Z`;
  }
  
  // If there's no timezone, assume UTC or local
  if (!ianaZone) {
    return icalTime.toJSDate().toISOString();
  }
  
  // Extract the wall clock time components
  const year = icalTime.year;
  const month = icalTime.month;
  const day = icalTime.day;
  const hour = icalTime.hour;
  const minute = icalTime.minute;
  const second = icalTime.second || 0;
  
  try {
    // Create a formatter for the target timezone
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: ianaZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    
    // Create a date in UTC with the wall clock time
    const utcWallClock = Date.UTC(year, month - 1, day, hour, minute, second);
    
    // Get what time it is in the target timezone when UTC shows the wall clock time
    const utcDate = new Date(utcWallClock);
    
    // Format to get the timezone's representation
    const parts = formatter.formatToParts(utcDate);
    const tzYear = parseInt(parts.find(p => p.type === 'year')?.value || String(year));
    const tzMonth = parseInt(parts.find(p => p.type === 'month')?.value || String(month));
    const tzDay = parseInt(parts.find(p => p.type === 'day')?.value || String(day));
    const tzHour = parseInt(parts.find(p => p.type === 'hour')?.value || String(hour));
    const tzMinute = parseInt(parts.find(p => p.type === 'minute')?.value || String(minute));
    
    // Calculate the offset: difference between wall clock and what TZ shows
    // If wall clock is 10:00 and TZ shows 05:00, offset is +5 hours (EST)
    const wallClockMinutes = hour * 60 + minute;
    const tzMinutes = tzHour * 60 + tzMinute;
    
    // Handle day boundary crossings
    let offsetMinutes = wallClockMinutes - tzMinutes;
    if (tzDay < day || (tzDay === day && tzMonth < month)) {
      offsetMinutes += 24 * 60; // TZ is behind, add a day
    } else if (tzDay > day || (tzDay === day && tzMonth > month)) {
      offsetMinutes -= 24 * 60; // TZ is ahead, subtract a day
    }
    
    // Apply offset to get correct UTC time
    const correctUTC = new Date(utcWallClock + offsetMinutes * 60 * 1000);
    
    console.log(`Timezone conversion: ${year}-${month}-${day} ${hour}:${minute} ${ianaZone} -> ${correctUTC.toISOString()}`);
    
    return correctUTC.toISOString();
  } catch (e) {
    console.error("Timezone conversion error:", e, "falling back to toJSDate");
    return icalTime.toJSDate().toISOString();
  }
}

// Convert ICAL.Time for end date (uses dtend property)
function icalEndTimeToUTC(icalTime: any, vevent: any): string | null {
  if (!icalTime) return null;
  
  // Get the timezone from the dtend property
  const prop = vevent.getFirstProperty("dtend");
  const tzid = prop?.getParameter("tzid");
  const ianaZone = tzid ? (windowsToIana[tzid] || tzid) : null;
  
  // If it's a DATE (all-day event) without time
  if (icalTime.isDate) {
    return `${icalTime.year}-${String(icalTime.month).padStart(2, '0')}-${String(icalTime.day).padStart(2, '0')}T12:00:00.000Z`;
  }
  
  if (!ianaZone) {
    return icalTime.toJSDate().toISOString();
  }
  
  const year = icalTime.year;
  const month = icalTime.month;
  const day = icalTime.day;
  const hour = icalTime.hour;
  const minute = icalTime.minute;
  const second = icalTime.second || 0;
  
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: ianaZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    
    const utcWallClock = Date.UTC(year, month - 1, day, hour, minute, second);
    const utcDate = new Date(utcWallClock);
    const parts = formatter.formatToParts(utcDate);
    
    const tzDay = parseInt(parts.find(p => p.type === 'day')?.value || String(day));
    const tzHour = parseInt(parts.find(p => p.type === 'hour')?.value || String(hour));
    const tzMinute = parseInt(parts.find(p => p.type === 'minute')?.value || String(minute));
    const tzMonth = parseInt(parts.find(p => p.type === 'month')?.value || String(month));
    
    const wallClockMinutes = hour * 60 + minute;
    const tzMinutes = tzHour * 60 + tzMinute;
    
    let offsetMinutes = wallClockMinutes - tzMinutes;
    if (tzDay < day || (tzDay === day && tzMonth < month)) {
      offsetMinutes += 24 * 60;
    } else if (tzDay > day || (tzDay === day && tzMonth > month)) {
      offsetMinutes -= 24 * 60;
    }
    
    const correctUTC = new Date(utcWallClock + offsetMinutes * 60 * 1000);
    return correctUTC.toISOString();
  } catch (e) {
    console.error("End time timezone conversion error:", e);
    return icalTime.toJSDate().toISOString();
  }
}

// Pre-process ICS data to replace Windows timezone names with IANA names
function preprocessICS(icsData: string): string {
  let processed = icsData;
  for (const [windowsTz, ianaTz] of Object.entries(windowsToIana)) {
    // Replace in TZID parameters
    const tzidRegex = new RegExp(`TZID=${windowsTz.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'gi');
    processed = processed.replace(tzidRegex, `TZID=${ianaTz}`);
    
    // Replace in VTIMEZONE TZID property
    const vtimezoneRegex = new RegExp(`^TZID:${windowsTz.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'gim');
    processed = processed.replace(vtimezoneRegex, `TZID:${ianaTz}`);
  }
  return processed;
}

interface CalendarConnection {
  id: string;
  user_id: string;
  ics_feed_url: string | null;
}

interface DatabaseEvent {
  id: string;
  provider_event_id: string;
  provider_updated_at: string | null;
}

interface ParsedEvent {
  uid: string;
  title: string;
  description: string | null;
  location: string | null;
  start_time: string;
  end_time: string | null;
  is_all_day: boolean;
  timezone: string | null;
  status: "confirmed" | "tentative" | "cancelled";
  updated_at: string | null;
}

// Parse ICS data and expand recurring events
function parseICSEvents(
  icsData: string,
  timeMin: Date,
  timeMax: Date
): ParsedEvent[] {
  const events: ParsedEvent[] = [];
  
  try {
    console.log("Parsing ICS data, length:", icsData.length);
    
    // Pre-process to convert Windows timezone names to IANA
    const processedICS = preprocessICS(icsData);
    
    const jcalData = ICAL.parse(processedICS);
    const comp = new ICAL.Component(jcalData);
    const vevents = comp.getAllSubcomponents("vevent");
    console.log("Found VEVENT components:", vevents.length);

    for (const vevent of vevents) {
      try {
        const event = new ICAL.Event(vevent);
        
        // Get the recurrence-id if this is an exception to a recurring event
        const recurrenceId = vevent.getFirstPropertyValue("recurrence-id");
        const baseUid = event.uid || vevent.getFirstPropertyValue("uid");
        
        // Generate unique ID: for exceptions, append the recurrence-id date
        let eventUid = baseUid;
        if (recurrenceId && recurrenceId.toJSDate) {
          eventUid = `${baseUid}_${recurrenceId.toJSDate().toISOString()}`;
          console.log("Processing exception event:", eventUid, "summary:", event.summary);
        } else {
          console.log("Processing event:", eventUid, "summary:", event.summary);
        }
      
        // Check if this is a recurring event (but not an exception)
        if (event.isRecurring() && !recurrenceId) {
          // Expand recurring events within time window
          const iterator = event.iterator();
          let next = iterator.next();
          let instanceCount = 0;
          const maxInstances = 500; // Safety limit
          
          // Calculate duration from first occurrence for recurring events
          const startUTC = icalTimeToUTC(event.startDate, vevent);
          const endUTC = event.endDate ? icalEndTimeToUTC(event.endDate, vevent) : null;
          const durationMs = endUTC ? new Date(endUTC).getTime() - new Date(startUTC).getTime() : 0;

          while (next && instanceCount < maxInstances) {
            // Convert the occurrence time properly with timezone
            const occurrenceStartUTC = icalTimeToUTC(next, vevent);
            const occurrenceTime = new Date(occurrenceStartUTC);
            
            // Skip if before time window
            if (occurrenceTime < timeMin) {
              next = iterator.next();
              continue;
            }
            
            // Stop if after time window
            if (occurrenceTime > timeMax) {
              break;
            }

            // Calculate end time for this occurrence using duration
            const occurrenceEndUTC = durationMs > 0 
              ? new Date(occurrenceTime.getTime() + durationMs).toISOString()
              : null;

            // Create unique ID for this instance: UID + occurrence date
            const instanceId = `${event.uid}_${occurrenceStartUTC}`;

            events.push({
              uid: instanceId,
              title: event.summary || "(No title)",
              description: event.description || null,
              location: event.location || null,
              start_time: occurrenceStartUTC,
              end_time: occurrenceEndUTC,
              is_all_day: isAllDayEvent(vevent),
              timezone: convertTimezone(getTimezone(vevent)),
              status: mapStatus(event.status),
              updated_at: getLastModified(vevent),
            });

            instanceCount++;
            next = iterator.next();
          }
          console.log("Added", instanceCount, "recurring instances for:", event.uid);
        } else {
          // Non-recurring event (or exception to recurring event)
          if (!event.startDate) {
            console.log("Skipping event - no start date:", eventUid);
            continue;
          }

          // Convert start time with proper timezone handling
          const startTimeUTC = icalTimeToUTC(event.startDate, vevent);
          const startDate = new Date(startTimeUTC);

          // Skip if outside time window
          if (startDate < timeMin || startDate > timeMax) {
            console.log("Skipping event outside time window:", eventUid, startTimeUTC);
            continue;
          }

          // Convert end time with proper timezone handling
          const endTimeUTC = event.endDate ? icalEndTimeToUTC(event.endDate, vevent) : null;

          events.push({
            uid: eventUid,
            title: event.summary || "(No title)",
            description: event.description || null,
            location: event.location || null,
            start_time: startTimeUTC,
            end_time: endTimeUTC,
            is_all_day: isAllDayEvent(vevent),
            timezone: convertTimezone(getTimezone(vevent)),
            status: mapStatus(event.status),
            updated_at: getLastModified(vevent),
          });
          console.log("Added event:", eventUid, "start:", startTimeUTC);
        }
      } catch (eventError) {
        console.error("Error processing individual event:", eventError);
        // Continue with other events
      }
    }
  } catch (error) {
    console.error("Error parsing ICS events:", error);
    throw new Error(`Failed to parse ICS data: ${error.message}`);
  }

  console.log("Total events parsed:", events.length);
  return events;
}

// Check if event is an all-day event
function isAllDayEvent(vevent: ICAL.Component): boolean {
  const dtstart = vevent.getFirstProperty("dtstart");
  if (!dtstart) return false;
  
  // All-day events use DATE type, not DATE-TIME
  const value = dtstart.getParameter("value");
  return value === "date" || !dtstart.getFirstValue()?.hour;
}

// Get timezone from event
function getTimezone(vevent: ICAL.Component): string | null {
  const dtstart = vevent.getFirstProperty("dtstart");
  if (!dtstart) return null;
  
  return dtstart.getParameter("tzid") || null;
}

// Get last modified date from event
function getLastModified(vevent: ICAL.Component): string | null {
  const lastmod = vevent.getFirstPropertyValue("last-modified");
  if (lastmod && lastmod.toJSDate) {
    return lastmod.toJSDate().toISOString();
  }
  
  const dtstamp = vevent.getFirstPropertyValue("dtstamp");
  if (dtstamp && dtstamp.toJSDate) {
    return dtstamp.toJSDate().toISOString();
  }
  
  return null;
}

// Map ICS status to our status enum
function mapStatus(icsStatus: string | null): "confirmed" | "tentative" | "cancelled" {
  if (!icsStatus) return "confirmed";
  
  const status = icsStatus.toUpperCase();
  if (status === "CANCELLED") return "cancelled";
  if (status === "TENTATIVE") return "tentative";
  return "confirmed";
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { calendar_connection_id, ics_content } = await req.json();

    if (!calendar_connection_id) {
      return new Response(
        JSON.stringify({ error: "calendar_connection_id required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get environment variables
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    // Get user from authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authorization required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create Supabase clients
    const supabaseAdmin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    const supabaseClient = createClient(
      SUPABASE_URL!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // Get the current user
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();
    
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid user token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Load calendar connection from DB
    const { data: connection, error: connectionError } = await supabaseAdmin
      .from("calendar_connections")
      .select("*")
      .eq("id", calendar_connection_id)
      .eq("user_id", user.id)
      .single();

    if (connectionError || !connection) {
      return new Response(
        JSON.stringify({ error: "Calendar connection not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const calendarConnection = connection as CalendarConnection;

    // Get ICS data
    let icsData: string;

    if (calendarConnection.ics_feed_url) {
      // Fetch from URL
      try {
        const fetchUrl = calendarConnection.ics_feed_url.replace(/^webcal:\/\//i, "https://");
        
        const response = await fetch(fetchUrl, {
          headers: {
            "Accept": "text/calendar, application/calendar+xml, application/ics",
            "User-Agent": "Calendar-App/1.0",
          },
        });

        if (!response.ok) {
          return new Response(
            JSON.stringify({ error: `Failed to fetch ICS: ${response.status} ${response.statusText}` }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        icsData = await response.text();
      } catch (error) {
        return new Response(
          JSON.stringify({ error: `Failed to fetch ICS: ${error.message}` }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    } else if (ics_content) {
      // Use provided content (for file uploads during initial sync)
      icsData = ics_content;
    } else {
      return new Response(
        JSON.stringify({ 
          error: "Cannot sync: No ICS URL configured and no content provided. File-uploaded calendars cannot be re-synced." 
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Calculate time range: 30 days ago to 1 year ahead
    const timeMin = new Date();
    timeMin.setDate(timeMin.getDate() - 30);
    const timeMax = new Date();
    timeMax.setFullYear(timeMax.getFullYear() + 1);

    // Parse ICS events with recurring event expansion
    let parsedEvents: ParsedEvent[];
    try {
      parsedEvents = parseICSEvents(icsData, timeMin, timeMax);
    } catch (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Load existing events from DB for this calendar
    const { data: existingEvents, error: eventsError } = await supabaseAdmin
      .from("events")
      .select("id, provider_event_id, provider_updated_at")
      .eq("calendar_connection_id", calendar_connection_id);

    if (eventsError) {
      return new Response(
        JSON.stringify({ error: "Failed to load existing events" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const existingEventsMap = new Map<string, DatabaseEvent>(
      (existingEvents || []).map((e: DatabaseEvent) => [e.provider_event_id, e])
    );

    // Track sync results
    let eventsAdded = 0;
    let eventsUpdated = 0;
    let eventsDeleted = 0;

    // Process parsed events (deduplicate first)
    const eventsToInsert: any[] = [];
    const eventsToUpdate: { id: string; data: any }[] = [];
    const parsedEventIds = new Set<string>();
    const seenUids = new Set<string>(); // Track UIDs we've already processed

    for (const parsedEvent of parsedEvents) {
      // Skip if we've already processed this UID (deduplication)
      if (seenUids.has(parsedEvent.uid)) {
        console.log("Skipping duplicate UID:", parsedEvent.uid);
        continue;
      }
      seenUids.add(parsedEvent.uid);
      parsedEventIds.add(parsedEvent.uid);

      const eventData = {
        user_id: user.id,
        calendar_connection_id: calendar_connection_id,
        provider_event_id: parsedEvent.uid,
        title: parsedEvent.title,
        description: parsedEvent.description,
        location: parsedEvent.location,
        start_time: parsedEvent.start_time,
        end_time: parsedEvent.end_time,
        is_all_day: parsedEvent.is_all_day,
        timezone: parsedEvent.timezone,
        status: parsedEvent.status,
        provider_updated_at: parsedEvent.updated_at,
      };

      const existingEvent = existingEventsMap.get(parsedEvent.uid);

      if (!existingEvent) {
        // New event
        eventsToInsert.push(eventData);
        eventsAdded++;
      } else {
        // Check if updated
        const existingUpdatedAt = existingEvent.provider_updated_at
          ? new Date(existingEvent.provider_updated_at)
          : null;
        const parsedUpdatedAt = parsedEvent.updated_at
          ? new Date(parsedEvent.updated_at)
          : null;

        if (
          !existingUpdatedAt ||
          (parsedUpdatedAt && parsedUpdatedAt > existingUpdatedAt)
        ) {
          eventsToUpdate.push({
            id: existingEvent.id,
            data: {
              ...eventData,
              updated_at: new Date().toISOString(),
            },
          });
          eventsUpdated++;
        }
      }
    }

    // Find deleted events (in DB but not in parsed ICS)
    const eventsToDelete: string[] = [];
    for (const [providerEventId, existingEvent] of existingEventsMap) {
      if (!parsedEventIds.has(providerEventId)) {
        eventsToDelete.push(existingEvent.id);
        eventsDeleted++;
      }
    }

    // Batch upsert new events (handles duplicates gracefully)
    if (eventsToInsert.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from("events")
        .upsert(eventsToInsert, { 
          onConflict: 'calendar_connection_id,provider_event_id',
          ignoreDuplicates: false 
        });

      if (insertError) {
        console.error("Error inserting events:", insertError);
      }
    }

    // Update existing events
    for (const { id, data } of eventsToUpdate) {
      const { error: updateError } = await supabaseAdmin
        .from("events")
        .update(data)
        .eq("id", id);

      if (updateError) {
        console.error("Error updating event:", updateError);
      }
    }

    // Delete removed events
    if (eventsToDelete.length > 0) {
      const { error: deleteError } = await supabaseAdmin
        .from("events")
        .delete()
        .in("id", eventsToDelete);

      if (deleteError) {
        console.error("Error deleting events:", deleteError);
      }
    }

    // Update last_synced_at
    await supabaseAdmin
      .from("calendar_connections")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", calendar_connection_id);

    return new Response(
      JSON.stringify({
        success: true,
        sync_results: {
          events_added: eventsAdded,
          events_updated: eventsUpdated,
          events_deleted: eventsDeleted,
          total_events: parsedEvents.length,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
