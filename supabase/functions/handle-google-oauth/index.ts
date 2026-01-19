import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

interface GoogleCalendar {
  id: string;
  summary: string;
  primary?: boolean;
  backgroundColor?: string;
}

interface GoogleCalendarListResponse {
  items: GoogleCalendar[];
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { code, redirect_uri } = await req.json();

    if (!code) {
      return new Response(JSON.stringify({ error: "Authorization code required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get secrets from environment
    const GOOGLE_CLIENT_ID = Deno.env.get("GOOGLE_CLIENT_ID");
    const GOOGLE_CLIENT_SECRET = Deno.env.get("GOOGLE_CLIENT_SECRET");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return new Response(JSON.stringify({ error: "Google credentials not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user from authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authorization required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create Supabase client with service role for admin operations
    const supabaseAdmin = createClient(
      SUPABASE_URL!,
      SUPABASE_SERVICE_ROLE_KEY!
    );

    // Create Supabase client with user's token for auth
    const supabaseClient = createClient(
      SUPABASE_URL!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: { headers: { Authorization: authHeader } },
      }
    );

    // Get the current user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid user token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Exchange authorization code for tokens
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirect_uri || `${req.headers.get("origin")}/oauth/callback`,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error("Token exchange failed:", errorData);
      return new Response(JSON.stringify({ error: "Failed to exchange authorization code" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tokens: GoogleTokenResponse = await tokenResponse.json();

    // Get user's email from Google
    const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userInfoResponse.ok) {
      return new Response(JSON.stringify({ error: "Failed to get user info from Google" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userInfo = await userInfoResponse.json();
    const googleEmail = userInfo.email;

    // Fetch user's calendar list from Google
    const calendarListResponse = await fetch(
      "https://www.googleapis.com/calendar/v3/users/me/calendarList",
      {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      }
    );

    if (!calendarListResponse.ok) {
      return new Response(JSON.stringify({ error: "Failed to fetch calendars from Google" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const calendarList: GoogleCalendarListResponse = await calendarListResponse.json();

    // Find primary calendar or first calendar
    const primaryCalendar = calendarList.items.find((cal) => cal.primary) || calendarList.items[0];

    if (!primaryCalendar) {
      return new Response(JSON.stringify({ error: "No calendars found in Google account" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Calculate token expiration
    const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    // Check if this calendar is already connected
    const { data: existingConnection } = await supabaseAdmin
      .from("calendar_connections")
      .select("id")
      .eq("user_id", user.id)
      .eq("provider", "google")
      .eq("provider_account_id", googleEmail)
      .eq("provider_calendar_id", primaryCalendar.id)
      .single();

    let calendarConnection;

    if (existingConnection) {
      // Update existing connection
      const { data, error } = await supabaseAdmin
        .from("calendar_connections")
        .update({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token || null,
          token_expires_at: tokenExpiresAt,
          is_active: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingConnection.id)
        .select()
        .single();

      if (error) {
        console.error("Error updating calendar connection:", error);
        return new Response(JSON.stringify({ error: "Failed to update calendar connection" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      calendarConnection = data;
    } else {
      // Create new calendar connection
      const { data, error } = await supabaseAdmin
        .from("calendar_connections")
        .insert({
          user_id: user.id,
          provider: "google",
          provider_account_id: googleEmail,
          provider_calendar_id: primaryCalendar.id,
          calendar_name: primaryCalendar.summary || "Google Calendar",
          calendar_color: primaryCalendar.backgroundColor || "#4285f4",
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token || null,
          token_expires_at: tokenExpiresAt,
          is_active: true,
        })
        .select()
        .single();

      if (error) {
        console.error("Error creating calendar connection:", error);
        return new Response(JSON.stringify({ error: "Failed to create calendar connection" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      calendarConnection = data;
    }

    // Return success with calendar info (excluding sensitive tokens)
    return new Response(
      JSON.stringify({
        success: true,
        calendar: {
          id: calendarConnection.id,
          name: calendarConnection.calendar_name,
          color: calendarConnection.calendar_color,
          provider: calendarConnection.provider,
          provider_account_id: calendarConnection.provider_account_id,
        },
        availableCalendars: calendarList.items.map((cal) => ({
          id: cal.id,
          name: cal.summary,
          primary: cal.primary || false,
        })),
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
