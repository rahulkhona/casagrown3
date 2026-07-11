/**
 * cleanup-growbot-media
 *
 * Deletes growbot chat-media files older than 180 days from Supabase Storage.
 * Direct DELETE from storage.objects is blocked by Supabase's protect_delete()
 * trigger, so this edge function uses the Storage SDK instead.
 *
 * Triggered by pg_cron (daily at 4:00 AM UTC).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.6";
import { corsHeaders } from "../_shared/cors.ts";

const BUCKET = "chat-media";
const PREFIX = "growbot/";
const MAX_AGE_DAYS = 180;
const BATCH_SIZE = 100;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - MAX_AGE_DAYS);

    let totalDeleted = 0;
    let hasMore = true;
    let offset = 0;

    while (hasMore) {
      // List files in the growbot/ prefix
      const { data: files, error: listError } = await supabase.storage
        .from(BUCKET)
        .list(PREFIX.replace(/\/$/, ""), {
          limit: BATCH_SIZE,
          offset,
          sortBy: { column: "created_at", order: "asc" },
        });

      if (listError) {
        console.error("Error listing files:", listError.message);
        break;
      }

      if (!files || files.length === 0) {
        hasMore = false;
        break;
      }

      // Filter files older than cutoff
      const oldFiles = files.filter((f) => {
        if (!f.created_at) return false;
        return new Date(f.created_at) < cutoff;
      });

      if (oldFiles.length === 0) {
        // Files are sorted by created_at asc, so if none are old, we're done
        hasMore = false;
        break;
      }

      // Delete old files
      const paths = oldFiles.map((f) => `${PREFIX}${f.name}`);
      const { error: deleteError } = await supabase.storage
        .from(BUCKET)
        .remove(paths);

      if (deleteError) {
        console.error("Error deleting files:", deleteError.message);
        break;
      }

      totalDeleted += oldFiles.length;
      console.log(`Deleted ${oldFiles.length} files (total: ${totalDeleted})`);

      // If we got fewer old files than the batch, we've processed all old ones
      if (oldFiles.length < files.length) {
        hasMore = false;
      } else {
        // Don't increment offset since we deleted files, list from start again
        offset = 0;
      }
    }

    return new Response(
      JSON.stringify({ ok: true, deleted: totalDeleted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("cleanup-growbot-media error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
