/**
 * Supabase auth helper for Playwright E2E tests.
 *
 * Signs in via the Supabase GoTrue REST API using email + password
 * (the test users seeded by seed.sql have passwords set).
 * Returns the session tokens needed to authenticate requests.
 */

const SUPABASE_URL = process.env.SUPABASE_URL || "http://127.0.0.1:54321";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

export interface AuthSession {
    access_token: string;
    refresh_token: string;
    user: {
        id: string;
        email: string;
    };
}

/**
 * Sign in a test user via Supabase email+password.
 *
 * This bypasses the OTP flow entirely and gives us a JWT we can inject
 * directly into the browser's localStorage so the app considers us logged in.
 */
export async function signInWithPassword(
    email: string,
    password: string,
): Promise<AuthSession> {
    const res = await fetch(
        `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                apikey: SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({ email, password }),
        },
    );

    if (!res.ok) {
        const body = await res.text();
        throw new Error(
            `Supabase sign-in failed (${res.status}): ${body}`,
        );
    }

    const data = await res.json();
    return {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        user: {
            id: data.user.id,
            email: data.user.email,
        },
    };
}

/**
 * Get the OTP code from Supabase's local Mailpit email testing service.
 * Mailpit replaced Inbucket in newer Supabase versions.
 */
export async function getOtpFromInbucket(
    email: string,
): Promise<string> {
    const MAILPIT_URL = "http://127.0.0.1:54324";

    // List all messages from Mailpit
    const listRes = await fetch(`${MAILPIT_URL}/api/v1/messages`);
    const data = await listRes.json();
    const messages = data.messages || [];

    if (!messages.length) {
        throw new Error(`No messages in Mailpit`);
    }

    // Find the latest message sent to this email
    const msg = messages.find(
        (m: { To: Array<{ Address: string }> }) =>
            m.To?.some((to: { Address: string }) => to.Address === email),
    );

    if (!msg) {
        throw new Error(
            `No Mailpit message found for ${email}`,
        );
    }

    // Extract 6-digit OTP from the Snippet field
    const otpMatch = msg.Snippet?.match(/\b(\d{6})\b/);
    if (otpMatch) {
        return otpMatch[1];
    }

    // Fallback: fetch the full message body
    const msgRes = await fetch(
        `${MAILPIT_URL}/api/v1/message/${msg.ID}`,
    );
    const fullMsg = await msgRes.json();
    const bodyMatch = fullMsg.Text?.match(/\b(\d{6})\b/);
    if (!bodyMatch) {
        throw new Error(
            `Could not find OTP in Mailpit message for ${email}`,
        );
    }
    return bodyMatch[1];
}

/** Well-known test credentials from seed.sql */
export const TEST_SELLER = {
    email: "seller@test.local",
    password: "TestPassword123!",
    userId: "a1111111-1111-1111-1111-111111111111",
};

export const TEST_BUYER = {
    email: "buyer@test.local",
    password: "TestPassword123!",
    userId: "b2222222-2222-2222-2222-222222222222",
};
