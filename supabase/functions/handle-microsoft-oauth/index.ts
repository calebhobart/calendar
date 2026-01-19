import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface MicrosoftTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

interface MicrosoftCalendar {
  id: string;
  name: string;
  color?: string;
  isDefaultCalendar?: boolean;
  hexColor?: string;
}

interface MicrosoftCalendarListResponse {
  value: MicrosoftCalendar[];
}

interface MicrosoftUserInfo {
  mail?: string;
  userPrincipalName: string;
  displayName?: string;
}

// Map Microsoft calendar colors to hex values
const microsoftColorMap: Record<string, string> = {
  auto: "#0078d4",
  lightBlue: "#0078d4",
  lightGreen: "#107c10",
  lightOrange: "#ff8c00",
  lightGray: "#737373",
  lightYellow: "#ffb900",
  lightTeal: "#008272",
  lightPink: "#e3008c",
  lightBrown: "#8e562e",
  lightRed: "#d13438",
  maxColor: "#0078d4",
};

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
    const MICROSOFT_CLIENT_ID = Deno.env.get("MICROSOFT_CLIENT_ID");
    const MICROSOFT_CLIENT_SECRET = Deno.env.get("MICROSOFT_CLIENT_SECRET");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!MICROSOFT_CLIENT_ID || !MICROSOFT_CLIENT_SECRET) {
      return new Response(JSON.stringify({ error: "Microsoft credentials not configured" }), {
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
    const tokenResponse = await fetch(
      "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: MICROSOFT_CLIENT_ID,
          client_secret: MICROSOFT_CLIENT_SECRET,
          redirect_uri: redirect_uri || `${req.headers.get("origin")}/oauth/callback`,
          grant_type: "authorization_code",
        }),
      }
    );

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.text();
      console.error("Token exchange failed:", errorData);
      return new Response(JSON.stringify({ error: "Failed to exchange authorization code" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tokens: MicrosoftTokenResponse = await tokenResponse.json();

    // Get user's email from Microsoft
    const userInfoResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    if (!userInfoResponse.ok) {
      return new Response(JSON.stringify({ error: "Failed to get user info from Microsoft" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userInfo: MicrosoftUserInfo = await userInfoResponse.json();
    const microsoftEmail = userInfo.mail || userInfo.userPrincipalName;

    // Fetch user's calendar list from Microsoft
    const calendarListResponse = await fetch(
      "https://graph.microsoft.com/v1.0/me/calendars",
      {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      }
    );

    if (!calendarListResponse.ok) {
      return new Response(JSON.stringify({ error: "Failed to fetch calendars from Microsoft" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const calendarList: MicrosoftCalendarListResponse = await calendarListResponse.json();

    // Find default calendar or first calendar
    const defaultCalendar = calendarList.value.find((cal) => cal.isDefaultCalendar) || calendarList.value[0];

    if (!defaultCalendar) {
      return new Response(JSON.stringify({ error: "No calendars found in Microsoft account" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Calculate token expiration
    const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    // Determine calendar color
    const calendarColor = defaultCalendar.hexColor || 
      microsoftColorMap[defaultCalendar.color || "auto"] || 
      "#0078d4";

    // Check if this calendar is already connected
    const { data: existingConnection } = await supabaseAdmin
      .from("calendar_connections")
      .select("id")
      .eq("user_id", user.id)
      .eq("provider", "outlook")
      .eq("provider_account_id", microsoftEmail)
      .eq("provider_calendar_id", defaultCalendar.id)
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
          provider: "outlook",
          provider_account_id: microsoftEmail,
          provider_calendar_id: defaultCalendar.id,
          calendar_name: defaultCalendar.name || "Outlook Calendar",
          calendar_color: calendarColor,
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
        availableCalendars: calendarList.value.map((cal) => ({
          id: cal.id,
          name: cal.name,
          isDefault: cal.isDefaultCalendar || false,
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
