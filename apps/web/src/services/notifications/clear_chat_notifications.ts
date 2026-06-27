import { createAdminSupabaseClient } from "@kovari/api";

async function main() {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("type", "NEW_MESSAGE")
    .eq("is_read", false)
    .select("id");

  if (error) {
    console.error("Error marking chat notifications as read:", error);
  } else {
    console.log(`Successfully marked ${data?.length || 0} NEW_MESSAGE notifications as read.`);
  }
}

main().catch(console.error);
