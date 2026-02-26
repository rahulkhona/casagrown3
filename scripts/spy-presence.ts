import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function spyOnPresence() {
    const channelName = "app-presence:global";
    console.log(`Spying on ${channelName}...`);

    const channel = supabase.channel(channelName, {
        config: {
            presence: {
                key: "system-debug-spy",
            },
        },
    });

    channel
        .on("presence", { event: "sync" }, () => {
            console.log("SPY SYNC:", channel.presenceState());
        })
        .on("presence", { event: "join" }, ({ key, newPresences }) => {
            console.log("USER JOINED:", key, newPresences);
        })
        .on("presence", { event: "leave" }, ({ key, leftPresences }) => {
            console.log("USER LEFT:", key, leftPresences);
        })
        .subscribe(async (status, err) => {
            if (status === "SUBSCRIBED") {
                console.log("SPY ACTIVE! Waiting for users to join...");
                await channel.track({ online: true });
            } else {
                console.log("Spy subscription failed:", status, err);
            }
        });
}

spyOnPresence();
