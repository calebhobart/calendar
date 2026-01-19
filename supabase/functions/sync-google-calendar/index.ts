import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface GoogleEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  status: string;
  updated: string;
}

interface GoogleEventsResponse {
  items: GoogleEvent[];
  nextPageToken?: string;
}

interface CalendarConnection {
  id: string;
  user_id: string;
  provider_calendar_id: string;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: string | null;
}

interface DatabaseEvent {
  id: string;
  provider_event_id: string;
  provider_updated_at: string | null;
}

async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<{ access_token: string; expires_in: number } | null> {
  try {
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      console.error("Token refresh failed:", await response.text());
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error("Error refreshing token:", error);
    return null;
  }
}

async function fetchAllGoogleEvents(
  accessToken: string,
  calendarId: string,
  timeMin: string,
  timeMax: string
): Promise<GoogleEvent[]> {
  const allEvents: GoogleEvent[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
        calendarId
      )}/events`
    );
    url.searchParams.set("timeMin", timeMin);
    url.searchParams.set("timeMax", timeMax);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("maxResults", "2500");
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch events: ${await response.text()}`);
    }

    const data: GoogleEventsResponse = await response.json();
    allEvents.push(...(data.items || []));
    pageToken = data.nextPageToken;
  } while (pageToken);

  return allEvents;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { calendar_connection_id } = await req.json();

    if (!calendar_connection_id) {
      return new Response(
        JSON.stringify({ error: "calendar_connection_id required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get secrets from environment
    const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
    const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return new Response(
        JSON.stringify({ error: "Google credentials not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

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

    // Check if token is expired and refresh if needed
    let accessToken = calendarConnection.access_token;
    const tokenExpiresAt = calendarConnection.token_expires_at
      ? new Date(calendarConnection.token_expires_at)
      : null;

    if (tokenExpiresAt && tokenExpiresAt < new Date()) {
      if (!calendarConnection.refresh_token) {
        return new Response(
          JSON.stringify({
            error: "Token expired and no refresh token available",
          }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      const newTokens = await refreshAccessToken(
        calendarConnection.refresh_token,
        GOOGLE_CLIENT_ID,
        GOOGLE_CLIENT_SECRET
      );

      if (!newTokens) {
        return new Response(JSON.stringify({ error: "Failed to refresh token" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      accessToken = newTokens.access_token;
      const newExpiresAt = new Date(
        Date.now() + newTokens.expires_in * 1000
      ).toISOString();

      // Update tokens in DB
      await supabaseAdmin
        .from("calendar_connections")
        .update({
          access_token: accessToken,
          token_expires_at: newExpiresAt,
        })
        .eq("id", calendar_connection_id);
    }

    // Calculate time range: 30 days ago to 1 year ahead
    const timeMin = new Date();
    timeMin.setDate(timeMin.getDate() - 30);
    const timeMax = new Date();
    timeMax.setFullYear(timeMax.getFullYear() + 1);

    // Fetch events from Google Calendar
    const googleEvents = await fetchAllGoogleEvents(
      accessToken,
      calendarConnection.provider_calendar_id,
      timeMin.toISOString(),
      timeMax.toISOString()
    );

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

    // Process Google events
    const eventsToInsert: any[] = [];
    const eventsToUpdate: { id: string; data: any }[] = [];
    const googleEventIds = new Set<string>();

    for (const googleEvent of googleEvents) {
      googleEventIds.add(googleEvent.id);

      const isAllDay = !googleEvent.start.dateTime;
      const startTime = googleEvent.start.dateTime || googleEvent.start.date;
      const endTime = googleEvent.end.dateTime || googleEvent.end.date;

      const eventData = {
        user_id: user.id,
        calendar_connection_id: calendar_connection_id,
        provider_event_id: googleEvent.id,
        title: googleEvent.summary || "(No title)",
        description: googleEvent.description || null,
        location: googleEvent.location || null,
        start_time: startTime,
        end_time: endTime || null,
        is_all_day: isAllDay,
        timezone: googleEvent.start.timeZone || null,
        status: googleEvent.status === "cancelled" ? "cancelled" : "confirmed",
        provider_updated_at: googleEvent.updated,
      };

      const existingEvent = existingEventsMap.get(googleEvent.id);

      if (!existingEvent) {
        // New event
        eventsToInsert.push(eventData);
        eventsAdded++;
      } else {
        // Check if updated
        const existingUpdatedAt = existingEvent.provider_updated_at
          ? new Date(existingEvent.provider_updated_at)
          : null;
        const googleUpdatedAt = new Date(googleEvent.updated);

        if (!existingUpdatedAt || googleUpdatedAt > existingUpdatedAt) {
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

    // Find deleted events (in DB but not in Google)
    const eventsToDelete: string[] = [];
    for (const [providerEventId, existingEvent] of existingEventsMap) {
      if (!googleEventIds.has(providerEventId)) {
        eventsToDelete.push(existingEvent.id);
        eventsDeleted++;
      }
    }

    // Batch insert new events
    if (eventsToInsert.length > 0) {
      const { error: insertError } = await supabaseAdmin
        .from("events")
        .insert(eventsToInsert);

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
          total_events: googleEvents.length,
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
