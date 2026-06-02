/**
 * Shared Twilio Verify API helper for Supabase Edge Functions.
 *
 * Uses the Twilio Verify API (v2) instead of raw Messages API.
 * Verify handles OTP generation, delivery, and fraud detection.
 * No "From" number required — Verify manages its own senders.
 *
 * Env vars required:
 *   TWILIO_ACCOUNT_SID                    — Twilio Account SID
 *   TWILIO_AUTH_TOKEN                      — Twilio Auth Token
 *   TWILIO_VERIFY_SERVICE_SID             — Verify Service SID (OTP only)
 *   TWILIO_FROM_NUMBER                     — Transactional SMS sender (order alerts)
 *   TWILIO_MARKETING_MESSAGING_SERVICE_SID — 10DLC approved Messaging Service for marketing SMS
 *
 * Twilio Verify magic numbers (test credentials):
 *   +15005550006  → approved (success)
 *   +15005550001  → invalid number
 *   +15005550009  → unreachable
 */

const VERIFY_BASE = "https://verify.twilio.com/v2";

interface VerifyResult {
    success: boolean;
    status?: string; // "pending", "approved", "canceled"
    sid?: string;
    error?: string;
}

/**
 * Start a phone verification — sends an OTP via SMS.
 * Twilio generates and delivers the code; we don't store it.
 */
export async function startVerification(
    to: string,
    channel: "sms" | "call" = "sms",
): Promise<VerifyResult> {
    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const serviceSid = Deno.env.get("TWILIO_VERIFY_SERVICE_SID");

    if (!accountSid || !authToken || !serviceSid) {
        console.warn("⚠️ Twilio Verify not configured. Mocking SMS OTP for local testing.")
        return { success: true, status: "pending" }
    }

    const url = `${VERIFY_BASE}/Services/${serviceSid}/Verifications`;
    const credentials = btoa(`${accountSid}:${authToken}`);

    const params = new URLSearchParams();
    params.set("To", to);
    params.set("Channel", channel);

    try {
        const res = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Basic ${credentials}`,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: params.toString(),
        });

        const data = await res.json();

        if (res.ok) {
            return { success: true, status: data.status, sid: data.sid };
        }

        return {
            success: false,
            error: data.message || `Twilio Verify error (${res.status})`,
        };
    } catch (err) {
        return {
            success: false,
            error: `Network error: ${(err as Error).message}`,
        };
    }
}

/**
 * Check a verification code — validates the OTP the user entered.
 * Returns status "approved" on success, "pending" if code is wrong.
 */
export async function checkVerification(
    to: string,
    code: string,
): Promise<VerifyResult> {
    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const serviceSid = Deno.env.get("TWILIO_VERIFY_SERVICE_SID");

    if (!accountSid || !authToken || !serviceSid) {
        console.warn("⚠️ Twilio Verify not configured. Mocking SMS OTP bypass.")
        if (code === "123456") {
            return { success: true, status: "approved", sid: "mock-sid-local" }
        }
        return { success: false, status: "pending", error: "Use 123456 for local testing" }
    }

    const url = `${VERIFY_BASE}/Services/${serviceSid}/VerificationCheck`;
    const credentials = btoa(`${accountSid}:${authToken}`);

    const params = new URLSearchParams();
    params.set("To", to);
    params.set("Code", code);

    try {
        const res = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Basic ${credentials}`,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: params.toString(),
        });

        const data = await res.json();

        if (res.ok && data.status === "approved") {
            return { success: true, status: "approved", sid: data.sid };
        }

        if (res.ok && data.status === "pending") {
            return { success: false, status: "pending", error: "Invalid code" };
        }

        return {
            success: false,
            status: data.status,
            error: data.message || `Verification failed (${data.status})`,
        };
    } catch (err) {
        return {
            success: false,
            error: `Network error: ${(err as Error).message}`,
        };
    }
}

/**
 * Validate E.164 phone number format.
 * Must start with + followed by 7-15 digits.
 */
export function isValidE164(phone: string): boolean {
    return /^\+[1-9]\d{6,14}$/.test(phone);
}

/**
 * Send a transactional SMS via Twilio Messages API.
 * Uses TWILIO_FROM_NUMBER as the sender.
 */
export async function sendSms(
    to: string,
    body: string,
): Promise<{ success: boolean; error?: string }> {
    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const fromNumber = Deno.env.get("TWILIO_FROM_NUMBER");

    if (!accountSid || !authToken || !fromNumber) {
        return {
            success: false,
            error:
                "Twilio Messages API not configured (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER)",
        };
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const credentials = btoa(`${accountSid}:${authToken}`);

    const params = new URLSearchParams();
    params.set("To", to);
    params.set("From", fromNumber);
    params.set("Body", body);

    try {
        const res = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Basic ${credentials}`,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: params.toString(),
        });

        const data = await res.json();

        if (res.ok) {
            return { success: true };
        }

        return {
            success: false,
            error: data.message || `Twilio SMS error (${res.status})`,
        };
    } catch (err) {
        return {
            success: false,
            error: `Network error: ${(err as Error).message}`,
        };
    }
}

/**
 * Send a marketing SMS via Twilio Messaging Service (10DLC).
 * Uses TWILIO_MARKETING_MESSAGING_SERVICE_SID — the approved 10DLC
 * Messaging Service registered for marketing campaigns.
 * Twilio handles opt-outs (STOP/UNSTOP) and 10DLC compliance automatically.
 */
export async function sendMarketingSms(
    to: string,
    body: string,
): Promise<{ success: boolean; error?: string }> {
    const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
    const messagingServiceSid = Deno.env.get("TWILIO_MARKETING_MESSAGING_SERVICE_SID");

    if (!accountSid || !authToken || !messagingServiceSid) {
        return {
            success: false,
            error: "Marketing SMS not configured — set TWILIO_MARKETING_MESSAGING_SERVICE_SID in Supabase secrets",
        };
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const credentials = btoa(`${accountSid}:${authToken}`);

    const params = new URLSearchParams();
    params.set("To", to);
    params.set("MessagingServiceSid", messagingServiceSid); // routes via 10DLC registered campaign
    params.set("Body", body);

    try {
        const res = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Basic ${credentials}`,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: params.toString(),
        });

        const data = await res.json();

        if (res.ok) {
            return { success: true };
        }

        return {
            success: false,
            error: data.message || `Twilio marketing SMS error (${res.status})`,
        };
    } catch (err) {
        return {
            success: false,
            error: `Network error: ${(err as Error).message}`,
        };
    }
}

interface ProvisionedPhone {
    success: boolean;
    phoneNumber?: string;
    phoneSid?: string;
    subaccountSid?: string;
    subaccountToken?: string;
    error?: string;
}

/** Create a new Twilio Subaccount for an Elite Seller */
export async function createTwilioSubaccount(
    friendlyName: string,
): Promise<{ success: boolean; sid?: string; authToken?: string; error?: string }> {
    const mainSid = Deno.env.get("TWILIO_ACCOUNT_SID");
    const mainToken = Deno.env.get("TWILIO_AUTH_TOKEN");

    if (!mainSid || !mainToken || mainSid.startsWith("mock_")) {
        console.log(`[MOCK TWILIO] Created subaccount for: ${friendlyName}`);
        return {
            success: true,
            sid: `ACsubaccount_mock_${Date.now()}`,
            authToken: `mock_auth_token_${Date.now()}`,
        };
    }

    const url = `https://api.twilio.com/2010-04-01/Accounts.json`;
    const credentials = btoa(`${mainSid}:${mainToken}`);

    const params = new URLSearchParams();
    params.set("FriendlyName", friendlyName);

    try {
        const res = await fetch(url, {
            method: "POST",
            headers: {
                Authorization: `Basic ${credentials}`,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: params.toString(),
        });
        const data = await res.json();
        if (res.ok) {
            return { success: true, sid: data.sid, authToken: data.auth_token };
        }
        return { success: false, error: data.message || "Failed to create Twilio subaccount" };
    } catch (err) {
        return { success: false, error: (err as Error).message };
    }
}

/** Search, Purchase, and Register a new WhatsApp-enabled number on a subaccount */
export async function provisionWhatsAppNumber(
    subaccountSid: string,
    subaccountToken: string,
    areaCode = "844", // Default to Toll-Free for easy instant verification
): Promise<ProvisionedPhone> {
    if (subaccountSid.startsWith("ACsubaccount_mock_")) {
        const mockLocal = `+1${areaCode}555${String(Math.floor(1000 + Math.random() * 9000))}`;
        console.log(`[MOCK TWILIO] Provisioned local phone number ${mockLocal} (area ${areaCode}) on subaccount ${subaccountSid}`);
        return {
            success: true,
            phoneNumber: mockLocal,
            phoneSid: `PNphone_mock_${Date.now()}`,
            subaccountSid,
            subaccountToken,
        };
    }

    const credentials = btoa(`${subaccountSid}:${subaccountToken}`);

    try {
        // 1. Search for available local numbers matching the area code
        let searchUrl = `https://api.twilio.com/2010-04-01/Accounts/${subaccountSid}/AvailablePhoneNumbers/US/Local.json?AreaCode=${areaCode}&SmsEnabled=true&VoiceEnabled=true&Limit=1`;
        let searchRes = await fetch(searchUrl, {
            headers: { Authorization: `Basic ${credentials}` },
        });

        if (!searchRes.ok) {
            throw new Error(`Failed to search local numbers: ${await searchRes.text()}`);
        }

        let searchData = await searchRes.json();
        let availableNumber = searchData.available_phone_numbers?.[0];

        // Fallback: if no local number found, try nearby area codes then toll-free
        if (!availableNumber) {
            console.log(`[TWILIO] No local numbers for area code ${areaCode}, trying toll-free fallback`);
            searchUrl = `https://api.twilio.com/2010-04-01/Accounts/${subaccountSid}/AvailablePhoneNumbers/US/TollFree.json?SmsEnabled=true&Limit=1`;
            searchRes = await fetch(searchUrl, {
                headers: { Authorization: `Basic ${credentials}` },
            });
            if (!searchRes.ok) {
                throw new Error(`Failed to search toll-free numbers: ${await searchRes.text()}`);
            }
            searchData = await searchRes.json();
            availableNumber = searchData.available_phone_numbers?.[0];
        }

        if (!availableNumber) {
            throw new Error("No available phone numbers found matching criteria");
        }

        const targetPhone = availableNumber.phone_number;

        // 2. Purchase the phone number
        const purchaseUrl = `https://api.twilio.com/2010-04-01/Accounts/${subaccountSid}/IncomingPhoneNumbers.json`;
        const purchaseParams = new URLSearchParams();
        purchaseParams.set("PhoneNumber", targetPhone);
        
        // Configure SMS Webhook pointing to our new WhatsApp Edge Function
        const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/whatsapp-webhook`;
        purchaseParams.set("SmsUrl", webhookUrl);
        purchaseParams.set("SmsMethod", "POST");

        const purchaseRes = await fetch(purchaseUrl, {
            method: "POST",
            headers: {
                Authorization: `Basic ${credentials}`,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: purchaseParams.toString(),
        });

        if (!purchaseRes.ok) {
            throw new Error(`Failed to purchase phone number: ${await purchaseRes.text()}`);
        }

        const purchaseData = await purchaseRes.json();

        // 3. Register as a WhatsApp Sender (Toll-Free numbers can be WhatsApp enabled instantly via Meta)
        // Note: For custom WABA numbers, Meta handles number enablement via the Cloud API registration
        // flow when connected in connect-facebook. Here, we track the successfully provisioned Twilio resources.

        return {
            success: true,
            phoneNumber: purchaseData.phone_number,
            phoneSid: purchaseData.sid,
            subaccountSid,
            subaccountToken,
        };

    } catch (err) {
        console.error("[TWILIO-PROVISION] Error provisioning number:", err);
        return { success: false, error: (err as Error).message };
    }
}

/** Release/Cancel a purchased phone number to stop charges */
export async function releasePhoneNumber(
    subaccountSid: string,
    subaccountToken: string,
    phoneSid: string,
): Promise<{ success: boolean; error?: string }> {
    if (subaccountSid.startsWith("ACsubaccount_mock_") || phoneSid.startsWith("PNphone_mock_")) {
        console.log(`[MOCK TWILIO] Released phone number ${phoneSid} on subaccount ${subaccountSid}`);
        return { success: true };
    }

    const credentials = btoa(`${subaccountSid}:${subaccountToken}`);
    const url = `https://api.twilio.com/2010-04-01/Accounts/${subaccountSid}/IncomingPhoneNumbers/${phoneSid}.json`;

    try {
        const res = await fetch(url, {
            method: "DELETE",
            headers: { Authorization: `Basic ${credentials}` },
        });

        if (res.ok || res.status === 404) {
            // 404 means already deleted
            console.log(`[TWILIO] Successfully released phone number ${phoneSid}`);
            return { success: true };
        }

        const errText = await res.text();
        console.error(`[TWILIO] Failed to release phone number ${phoneSid}: ${errText}`);
        return { success: false, error: errText };
    } catch (err) {
        return { success: false, error: (err as Error).message };
    }
}

