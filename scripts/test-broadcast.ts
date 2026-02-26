import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

// Load .env.local
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Missing Supabase URL or Anon Key");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testBroadcast() {
    console.log("Connecting to realtime-delegations channel...");
    const channel = supabase.channel("realtime-delegations");

    channel.subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
            console.log("Subscribed! Sending broadcast...");
            const resp = await channel.send({
                type: "broadcast",
                event: "test_toast",
                payload: { msg: "Hello from Node script!" },
            });
            console.log("Broadcast response:", resp);

            setTimeout(() => {
                supabase.removeChannel(channel);
                process.exit(0);
            }, 1000);
        } else {
            console.log("Status: ", status);
        }
    });
}

testBroadcast();
