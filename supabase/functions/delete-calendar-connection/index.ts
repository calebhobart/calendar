import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { connection_id } = await req.json();

    if (!connection_id) {
      return new Response(
        JSON.stringify({ error: "Connection ID required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get secrets from environment
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    // Get user from authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization required" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Create Supabase client with service role for admin operations
    const supabaseAdmin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);

    // Create Supabase client with user's token for auth
    const supabaseClient = createClient(
      SUPABASE_URL!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: { headers: { Authorization: authHeader } },
      }
    );

    // Get the current user
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid user token" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Fetch the calendar connection (verify ownership and get tokens)
    const { data: connection, error: fetchError } = await supabaseAdmin
      .from("calendar_connections")
      .select("*")
      .eq("id", connection_id)
      .eq("user_id", user.id)
      .single();

    if (fetchError || !connection) {
      return new Response(
        JSON.stringify({ error: "Calendar connection not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Attempt to revoke OAuth token based on provider
    let revokeError: string | null = null;

    if (connection.provider === "google" && connection.access_token) {
      // Revoke Google token
      try {
        const revokeResponse = await fetch(
          `https://oauth2.googleapis.com/revoke?token=${connection.access_token}`,
          { method: "POST" }
        );

        if (!revokeResponse.ok) {
          // Log but don't fail - token may already be expired/revoked
          console.warn(
            "Google token revocation failed:",
            await revokeResponse.text()
          );
          revokeError = "Token revocation failed (token may already be expired)";
        }
      } catch (error) {
        console.warn("Google token revocation error:", error);
        revokeError = "Token revocation request failed";
      }
    } else if (connection.provider === "outlook" && connection.access_token) {
      // Revoke Microsoft token - Microsoft uses a different approach
      // We'll try to revoke the refresh token if available, otherwise just proceed
      try {
        // Microsoft doesn't have a simple token revocation endpoint like Google
        // The best approach is to use the /me/revokeSignInSessions endpoint
        // which revokes all sessions for the user (more aggressive)
        // For a gentler approach, we just delete locally and let the token expire
        
        // Attempt to revoke sign-in sessions (this is optional and may require admin consent)
        const revokeResponse = await fetch(
          "https://graph.microsoft.com/v1.0/me/revokeSignInSessions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${connection.access_token}`,
            },
          }
        );

        if (!revokeResponse.ok) {
          // This endpoint often requires specific permissions, so don't fail
          console.warn(
            "Microsoft session revocation failed:",
            await revokeResponse.text()
          );
          revokeError = "Session revocation failed (may require additional permissions)";
        }
      } catch (error) {
        console.warn("Microsoft token revocation error:", error);
        revokeError = "Token revocation request failed";
      }
    }

    // Delete the calendar connection (events will cascade delete)
    const { error: deleteError } = await supabaseAdmin
      .from("calendar_connections")
      .delete()
      .eq("id", connection_id)
      .eq("user_id", user.id);

    if (deleteError) {
      console.error("Error deleting calendar connection:", deleteError);
      return new Response(
        JSON.stringify({ error: "Failed to delete calendar connection" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Return success
    return new Response(
      JSON.stringify({
        success: true,
        message: "Calendar disconnected successfully",
        warning: revokeError, // Include any token revocation warnings
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
