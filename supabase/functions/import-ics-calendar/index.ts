import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import ICAL from "https://esm.sh/ical.js@1.5.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ICSImportRequest {
  ics_url?: string;
  ics_content?: string;
  calendar_name: string;
  calendar_color?: string;
}

// Validate and parse ICS data to ensure it's a valid calendar
function validateICSData(icsData: string): { valid: boolean; error?: string; eventCount: number } {
  try {
    const jcalData = ICAL.parse(icsData);
    const comp = new ICAL.Component(jcalData);
    
    if (comp.name !== "vcalendar") {
      return { valid: false, error: "Invalid ICS format: not a VCALENDAR", eventCount: 0 };
    }
    
    const events = comp.getAllSubcomponents("vevent");
    return { valid: true, eventCount: events.length };
  } catch (error) {
    return { valid: false, error: `Failed to parse ICS: ${error.message}`, eventCount: 0 };
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body: ICSImportRequest = await req.json();
    const { ics_url, ics_content, calendar_name, calendar_color } = body;

    // Validate required fields
    if (!ics_url && !ics_content) {
      return new Response(
        JSON.stringify({ error: "Either ics_url or ics_content is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!calendar_name || calendar_name.trim() === "") {
      return new Response(
        JSON.stringify({ error: "calendar_name is required" }),
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

    // Fetch or use provided ICS data
    let icsData: string;
    
    if (ics_url) {
      // Fetch ICS from URL
      try {
        // Handle webcal:// protocol by converting to https://
        const fetchUrl = ics_url.replace(/^webcal:\/\//i, "https://");
        
        const response = await fetch(fetchUrl, {
          headers: {
            "Accept": "text/calendar, application/calendar+xml, application/ics",
            "User-Agent": "Calendar-App/1.0",
          },
        });

        if (!response.ok) {
          return new Response(
            JSON.stringify({ error: `Failed to fetch ICS from URL: ${response.status} ${response.statusText}` }),
            {
              status: 400,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }

        icsData = await response.text();
      } catch (error) {
        return new Response(
          JSON.stringify({ error: `Failed to fetch ICS from URL: ${error.message}` }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    } else {
      icsData = ics_content!;
    }

    // Validate ICS data
    const validation = validateICSData(icsData);
    if (!validation.valid) {
      return new Response(
        JSON.stringify({ error: validation.error }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Generate a unique provider_account_id for ICS calendars
    // Use URL for URL-based calendars, or a generated ID for file uploads
    const providerAccountId = ics_url 
      ? ics_url 
      : `file-upload-${Date.now()}-${Math.random().toString(36).substring(7)}`;

    // Check if this calendar URL is already connected (for URL-based calendars)
    if (ics_url) {
      const { data: existingConnection } = await supabaseAdmin
        .from("calendar_connections")
        .select("id, calendar_name")
        .eq("user_id", user.id)
        .eq("provider", "apple")
        .eq("ics_feed_url", ics_url)
        .single();

      if (existingConnection) {
        return new Response(
          JSON.stringify({ 
            error: `This calendar URL is already connected as "${existingConnection.calendar_name}"` 
          }),
          {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }

    // Create calendar connection
    const { data: calendarConnection, error: insertError } = await supabaseAdmin
      .from("calendar_connections")
      .insert({
        user_id: user.id,
        provider: "apple",
        provider_account_id: providerAccountId,
        provider_calendar_id: null,
        calendar_name: calendar_name.trim(),
        calendar_color: calendar_color || "#a855f7", // Purple default for ICS
        access_token: "ics-no-auth-required", // Placeholder, not used for ICS
        refresh_token: null,
        token_expires_at: null,
        ics_feed_url: ics_url || null,
        is_active: true,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error creating calendar connection:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to create calendar connection" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Return success with calendar info
    return new Response(
      JSON.stringify({
        success: true,
        calendar: {
          id: calendarConnection.id,
          name: calendarConnection.calendar_name,
          color: calendarConnection.calendar_color,
          provider: calendarConnection.provider,
          is_url_based: !!ics_url,
          event_count: validation.eventCount,
        },
        // Include ICS content for file uploads so sync can use it
        ics_content: ics_url ? undefined : icsData,
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
