const SITE_URL = Deno.env.get("SITE_URL") ?? "https://casagrown.com";

/**
 * Wrap the given HTML body inside the standard CasaGrown email branding.
 * Includes dark-mode media queries, responsive tables, and standard headers.
 */
export function wrapInBrandedTemplate(opts: {
    title: string;
    greeting: string;
    bodyHtml: string;
    footer?: string;
    headerGradient?: string;
    headerEmoji?: string;
    headerTextColor?: string;
    headerSubtitleColor?: string;
}): string {
    const bgGradient = opts.headerGradient ?? "linear-gradient(135deg, #15803d 0%, #16a34a 50%, #22c55e 100%)";
    const headerIcon = opts.headerEmoji
        ? `<div style="font-size: 48px; margin-bottom: 8px;">${opts.headerEmoji}</div>`
        : `<div style="margin-bottom: 8px;"><img src="${SITE_URL}/logo.png" alt="CasaGrown" width="48" height="48" style="display: inline-block; width: 48px; height: 48px; object-fit: contain;" /></div>`;

    let html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${opts.title}</title>
<style>
body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
body { margin: 0; padding: 0; width: 100% !important; height: 100% !important; }
@media (prefers-color-scheme: dark) {
  .email-bg { background-color: #1a1a2e !important; }
  .email-card { background-color: #16213e !important; }
  .email-text, .email-text p, .email-text li { color: #e0e0e0 !important; }
  .email-subtext, .email-subtext p { color: #b0b0b0 !important; }
}
</style>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">

<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f4f7fa;" class="email-bg">
<tr>
<td align="center" style="padding: 40px 16px;">

<!-- Card -->
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 520px; background-color: #ffffff; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); overflow: hidden;" class="email-card">

<!-- Header -->
<tr>
<td style="background: ${bgGradient}; padding: 24px 32px 20px; text-align: center;">
${headerIcon}
<h1 style="margin: 0; font-size: 22px; font-weight: 700; color: ${opts.headerTextColor ?? '#ffffff'}; letter-spacing: -0.5px;">
${opts.title}
</h1>
<p style="margin: 8px 0 0; font-size: 12px; font-weight: 600; color: ${opts.headerSubtitleColor ?? 'rgba(255,255,255,0.9)'}; letter-spacing: 3px; text-transform: uppercase;">
FRESH &bull; LOCAL &bull; TRUSTED
</p>
</td>
</tr>

<!-- Body -->
<tr>
<td style="padding: 28px 32px 0;">
<p style="margin: 0 0 4px; font-size: 16px; font-weight: 600; color: #1a1a2e;" class="email-text">
${opts.greeting}
</p>
</td>
</tr>

<tr>
<td style="padding: 8px 32px 20px;" class="email-text">
${opts.bodyHtml}
</td>
</tr>

${
        opts.footer
            ? `
<tr>
<td style="padding: 0 32px 16px;">
<p style="margin: 0; font-size: 11px; color: #9ca3af; line-height: 1.5; font-style: italic;">
${opts.footer}
</p>
</td>
</tr>
`
            : ""
    }

<!-- Divider -->
<tr>
<td style="padding: 0 32px;">
<div style="height: 1px; background-color: #eee;"></div>
</td>
</tr>

<!-- Footer -->
<tr>
<td style="padding: 16px 32px 24px; text-align: center;">
<p style="margin: 0; font-size: 11px; color: #999999; line-height: 1.6;">
Fresh from Neighbors&rsquo; backyard 🌱<br />
This is an automated message. Please do not reply.
</p>
</td>
</tr>

</table>
</td>
</tr>
</table>

</body>
</html>`;

    // Strip trailing whitespace to prevent MIME =20 artifacts
    html = html.replace(/[ \t]+$/gm, "");
    return html;
}

/**
 * Renders a standardized info/stats table.
 */
export function infoCard(rows: Array<{ label: string; value: string }>): string {
    const rowsHtml = rows
        .map(
            (r) =>
                `<tr>
<td style="font-size: 13px; color: #6b7280; padding: 4px 0;">${r.label}</td>
<td style="font-size: 13px; color: #1f2937; text-align: right; padding: 4px 0; font-weight: 500;">${r.value}</td>
</tr>`,
        )
        .join("");

    return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background: #f0fdf4; border: 1px solid #dcfce7; border-radius: 10px; overflow: hidden; margin-top: 16px; margin-bottom: 16px;">
<tr><td style="padding: 16px 20px;">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%">
${rowsHtml}
</table>
</td></tr>
</table>`;
}

/**
 * Renders a standardized green CTA button.
 */
export function actionButton(label: string, url: string): string {
    return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top: 20px;">
<tr><td align="center">
<a href="${url}" style="display: inline-block; padding: 12px 32px; background: linear-gradient(135deg, #15803d, #22c55e); color: #ffffff; font-size: 14px; font-weight: 600; text-decoration: none; border-radius: 8px;">
${label}
</a>
</td></tr>
</table>`;
}
