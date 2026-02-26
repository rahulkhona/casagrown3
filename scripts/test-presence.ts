import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function testRealtime() {
    console.log("Connecting to app-presence:global channel...");

    const channel = supabase.channel("app-presence:global", {
        config: {
            presence: {
                key: "debug-user-id",
            },
        },
    });

    channel
        .on("presence", { event: "sync" }, () => {
            console.log("Presence sync:", channel.presenceState());
        })
        .subscribe(async (status, err) => {
            console.log("Subscribe status:", status, err);
            if (status === "SUBSCRIBED") {
                console.log("Successfully subscribed! Tracking presence...");
                const trackStatus = await channel.track({ online: true });
                console.log("Track status:", trackStatus);

                // Keep alive for 5 seconds
                setTimeout(() => {
                    console.log("Closing channel...");
                    supabase.removeChannel(channel);
                }, 5000);
            }
        });
}

testRealtime();
