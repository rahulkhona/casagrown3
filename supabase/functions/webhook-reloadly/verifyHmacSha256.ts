// ── HMAC-SHA256 Signature Verification ──
export async function verifyHmacSha256(
    payload: string,
    signature: string,
    secret: string,
): Promise<boolean> {
    try {
        const key = await crypto.subtle.importKey(
            "raw",
            new TextEncoder().encode(secret),
            { name: "HMAC", hash: "SHA-256" },
            false,
            ["sign"],
        );
        const mac = await crypto.subtle.sign(
            "HMAC",
            key,
            new TextEncoder().encode(payload),
        );
        const computed = Array.from(new Uint8Array(mac))
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
        const expected = signature.replace(/^sha256=/, "");
        if (computed.length !== expected.length) return false;
        const a = new TextEncoder().encode(computed);
        const b = new TextEncoder().encode(expected);
        let result = 0;
        for (let i = 0; i < a.length; i++) result |= a[i] ^ b[i];
        return result === 0;
    } catch (e) {
        console.error("[WEBHOOK-RELOADLY] Signature verification error:", e);
        return false;
    }
}
