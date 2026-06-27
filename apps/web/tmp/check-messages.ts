import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(__dirname, "../.env.local") });

async function check() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  
  const userId = "a1db0131-48ad-4a05-a66b-6e4179981c1a";
  
  console.log("Checking latest_conversations for user:", userId);
  const { data: convs, error } = await supabase
    .from("latest_conversations")
    .select("*")
    .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);
    
  if (error) {
    console.error("Error fetching conversations:", error);
  } else {
    console.log(`Found ${convs?.length} conversations:`, convs);
  }
}

check().catch(console.error);
