import {
    jsonOk,
    serveWithCors,
} from "../_shared/serve-with-cors.ts";
import { sendPushNotification } from "../_shared/push-notify.ts";

/**
 * send-market-reminders — Supabase Edge Function
 *
 * Called by pg_cron every 5 minutes.
 * 1. Finds market_reminders where remind_at <= now() and sent_at IS NULL
 * 2. For each user, also loads their product_reminders (product names)
 * 3. Collapses into ONE push per user
 * 4. Marks market_reminders as sent, deletes product_reminders
 *
 * Authorized via service_role key only.
 */

serveWithCors(async (req, { supabase, corsHeaders, env }) => {
    // Only allow service_role calls (from pg_cron)
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    const isServiceRole = token === env("SUPABASE_SERVICE_ROLE_KEY");
    if (!isServiceRole) {
        return jsonOk(
            { error: "Service role required" },
            corsHeaders,
            401,
        );
    }

    // 1. Find due market reminders
    const { data: dueReminders, error: remErr } = await supabase
        .from("market_reminders")
        .select("id, user_id, reminder_minutes")
        .is("sent_at", null)
        .lte("remind_at", new Date().toISOString())
        .limit(200);

    if (remErr) {
        console.error("Failed to fetch market reminders:", remErr.message);
        return jsonOk({ error: remErr.message }, corsHeaders, 500);
    }

    if (!dueReminders || dueReminders.length === 0) {
        return jsonOk({ sent: 0, message: "No due reminders" }, corsHeaders);
    }

    // Unique user IDs from market reminders
    const userIds = [...new Set(dueReminders.map((r) => r.user_id))];

    // 2. Load product reminders for these users
    const { data: productReminders } = await supabase
        .from("product_reminders")
        .select("id, user_id, product_id, market_products(name)")
        .in("user_id", userIds);

    // Group product names by user_id
    const productsByUser: Record<string, { names: string[]; ids: string[] }> =
        {};
    if (productReminders) {
        for (const pr of productReminders) {
            if (!productsByUser[pr.user_id]) {
                productsByUser[pr.user_id] = { names: [], ids: [] };
            }
            const productName =
                (pr.market_products as unknown as { name: string })?.name ||
                "an item";
            productsByUser[pr.user_id].names.push(productName);
            productsByUser[pr.user_id].ids.push(pr.id);
        }
    }

    // 3. Send collapsed push per user
    let sent = 0;
    let failed = 0;
    const sentReminderIds: string[] = [];
    const deletedProductIds: string[] = [];

    for (const userId of userIds) {
        const userReminders = dueReminders.filter((r) => r.user_id === userId);
        const minutes = userReminders[0]?.reminder_minutes ?? 30;
        const products = productsByUser[userId];

        // Build collapsed message
        let title = "🌱 CasaGrown Market";
        let body: string;

        if (products && products.names.length > 0) {
            const count = products.names.length;
            if (count === 1) {
                body =
                    `Market opens in ${minutes} min! ${products.names[0]} you saved is available.`;
            } else {
                const listed = products.names.slice(0, 3).join(", ");
                const suffix = count > 3 ? ` and ${count - 3} more` : "";
                body =
                    `Market opens in ${minutes} min! ${count} items you saved are available: ${listed}${suffix}.`;
            }
        } else {
            body = `Market opens in ${minutes} minutes! Fresh produce from your neighbors awaits.`;
        }

        try {
            await sendPushNotification(supabase, {
                userIds: [userId],
                title,
                body,
                url: "/market",
                tag: "market-reminder",
            });
            sent++;
        } catch (err) {
            console.error(`Failed to send reminder to ${userId}:`, err);
            failed++;
        }

        // Collect IDs for batch update
        sentReminderIds.push(...userReminders.map((r) => r.id));
        if (products) {
            deletedProductIds.push(...products.ids);
        }
    }

    // 4. Mark market reminders as sent
    if (sentReminderIds.length > 0) {
        await supabase
            .from("market_reminders")
            .update({ sent_at: new Date().toISOString() })
            .in("id", sentReminderIds);
    }

    // 5. Delete fired product reminders
    if (deletedProductIds.length > 0) {
        await supabase
            .from("product_reminders")
            .delete()
            .in("id", deletedProductIds);
    }

    console.log(
        `🔔 Reminders: sent=${sent}, failed=${failed}, users=${userIds.length}, products_cleared=${deletedProductIds.length}`,
    );

    return jsonOk({
        sent,
        failed,
        users: userIds.length,
        products_cleared: deletedProductIds.length,
    }, corsHeaders);
});
