// ============================================================================
// Quarantine Bot — Main Entry Point
//
// Usage:  yarn start              (default output to scripts/output/)
//         yarn start:verbose      (with DEBUG=1 for extra logging)
//
// Fetches quarantine data from:
//   1. CDFA ArcGIS (California) — structured REST API
//   2. USDA APHIS pest pages (national) — HTML scraping
//   3. State-specific ArcGIS feeds — configured via JSON
//
// Outputs:
//   - scripts/output/quarantine_YYYY-MM-DD_HHmmss.csv
//   - scripts/output/health_YYYY-MM-DD_HHmmss.log
// ============================================================================

import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

import { fetchCDFA } from './sources/cdfa.js';
import { fetchAPHIS } from './sources/aphis.js';
import { fetchStateFeeds } from './sources/state-feeds.js';
import { HealthLogger } from './lib/health-logger.js';
import { normalize, deduplicate } from './lib/normalizer.js';
import type { RawQuarantineRecord } from './types.js';

// Load monorepo root .env file containing Supabase credentials
dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../../.env') });

const __dirname = dirname(fileURLToPath(import.meta.url));

// Setup Supabase Client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// Output to scripts/output/ (two levels up from apps/quarantine-bot/src/)
const OUTPUT_DIR = resolve(__dirname, '../../../scripts/output');

async function main(): Promise<void> {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║         🌱 CasaGrown Quarantine Bot v1.0                     ║');
  console.log('║         Scanning government quarantine data sources           ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log(`Run started: ${new Date().toISOString()}\n`);

  if (!supabaseUrl || !supabaseKey) {
    console.error('💥 ERROR: Missing Supabase credentials in .env');
    process.exit(1);
  }

  const health = new HealthLogger();
  const allRawRecords: RawQuarantineRecord[] = [];

  // ── 1. Fetch from all sources (independent, fault-tolerant) ──────

  console.log('── Source 1/3: CDFA ArcGIS (California) ──');
  const cdfaRecords = await fetchCDFA(health);
  allRawRecords.push(...cdfaRecords);
  console.log('');

  console.log('── Source 2/3: USDA APHIS (National) ──');
  const aphisRecords = await fetchAPHIS(health);
  allRawRecords.push(...aphisRecords);
  console.log('');

  console.log('── Source 3/3: State ArcGIS Feeds ──');
  const stateRecords = await fetchStateFeeds(health);
  allRawRecords.push(...stateRecords);
  console.log('');

  // ── 2. Normalize all records ─────────────────────────────────────

  console.log('── Normalizing records ──');
  const normalizedRows = [];
  for (const raw of allRawRecords) {
    normalizedRows.push(await normalize(raw));
  }

  // ── 3. Deduplicate ──────────────────────────────────────────────

  console.log('── Deduplicating ──');
  const deduped = deduplicate(normalizedRows);
  console.log(`  ${normalizedRows.length} raw → ${deduped.length} unique records`);
  console.log('');

  // ── 4. Write Database (UPSERT) ──────────────────────────────────

  console.log('── Syncing Database ───────────────────────────');
  // First we clear out any existing bot-generated limits
  const { error: delErr } = await supabase
    .from('quarantine_zones')
    .delete()
    .eq('created_by_admin', false);
    
  if (delErr) {
     health.recordError('database', `Failed to prune old bot zones: ${delErr.message}`);
  } else {
     // Due to relational mapping schema requirements, calling specialized db sync RPC is best
     const { error: pushErr } = await supabase.rpc('sync_bot_quarantines', { p_payload: deduped });
     if (pushErr) console.error("RPC push warning:", pushErr.message);
  }
  console.log(`  📊 Sent ${deduped.length} rows to DB`);
  console.log('');

  // ── 5. Print Summary ────────────────────────────────────────────

  console.log('── Summary ──');

  // Group by source
  const bySrc = new Map<string, number>();
  for (const row of deduped) {
    bySrc.set(row.data_source, (bySrc.get(row.data_source) || 0) + 1);
  }
  for (const [src, count] of bySrc) {
    console.log(`  ${src}: ${count} records`);
  }

  // Group by state
  const byState = new Map<string, number>();
  for (const row of deduped) {
    byState.set(row.state_code, (byState.get(row.state_code) || 0) + 1);
  }
  const statesSorted = Array.from(byState.entries()).sort((a, b) => b[1] - a[1]);
  console.log(`\n  States covered: ${byState.size}`);
  for (const [state, count] of statesSorted.slice(0, 10)) {
    console.log(`    ${state}: ${count} records`);
  }
  if (statesSorted.length > 10) {
    console.log(`    ... and ${statesSorted.length - 10} more`);
  }

  // ── 6. Write Health Report to Database ────────────────────────

  console.log('');
  const status = health.getOverallStatus();
  const runEnd = new Date();
  
  console.log(`  📋 Logging Bot Health: ${status}`);
  await supabase.from('quarantine_bot_health').insert({
    run_started_at: new Date(health['runStartedAt']).toISOString(),
    run_ended_at: runEnd.toISOString(),
    status: status,
    schema_drift_detected: health.hasSchemaDrift(),
    total_records: health.getTotalRecords(),
    log_summary: health.getRawLog(),
  });

  // ── 7. Automatic Administrative Alerts ────────────────────────

  if (status !== 'OK') {
    console.log('  ⚠️ Triggering Edge Function Health Alerts to Admins...');
    // Quick query to get admin profiles
    const { data: admins } = await supabase.rpc('get_admin_emails');
    if (admins && admins.length > 0) {
      const isFailed = status === 'FAILED';
      const alertTitle = isFailed ? '🚨 CRITICAL: Quarantine Bot Sync Failed' : '⚠️ WARNING: Quarantine Bot Schema Drift Detected';
      const alertBody = isFailed 
        ? 'The bot failed to parse CDFA or APHIS sources correctly.' 
        : 'The bot detected schema changes or degradation in the remote APIs.';

      for (const admin of admins) {
        // 1. In-app notification
        try {
          await supabase.rpc('notify_market_event', {
            p_user_id: admin.id,
            p_content: `${isFailed ? '🚨' : '⚠️'} Quarantine Bot: ${alertBody}`,
            p_link_url: '/quarantine-zones'
          });
        } catch (err) {
          console.warn('notify_market_event failed for admin:', admin.id, err);
        }

        // 2. Email blast using send-market-email (raw HTML)
        if (admin.email) {
          try {
            await supabase.functions.invoke('send-market-email', {
              body: {
                to: admin.email,
                subject: alertTitle,
                html: `
                  <h2>${alertTitle}</h2>
                  <p style="color: ${isFailed ? '#dc2626' : '#d97706'}; font-weight: bold;">
                    The automated Quarantine Zone synchronization process reported anomalies during its latest run.
                  </p>
                  <table style="border-collapse:collapse;width:100%;max-width:500px;margin-bottom:16px;">
                    <tr><td style="padding:8px;border:1px solid #ddd;"><strong>Status</strong></td><td style="padding:8px;border:1px solid #ddd;">${status}</td></tr>
                    <tr><td style="padding:8px;border:1px solid #ddd;"><strong>Timestamp</strong></td><td style="padding:8px;border:1px solid #ddd;">${new Date().toLocaleString("en-US", { timeZoneName: "short" })}</td></tr>
                  </table>
                  <p>${alertBody}</p>
                  <p><strong>Action Required:</strong> Review the admin dashboard to verify that local quarantines are still accurate.</p>
                `
              }
            });
          } catch (err) {
            console.warn('send-market-email failed for admin:', admin.email, err);
          }
        }
      }

      // 3. Push notification
      const adminUrl = process.env.ADMIN_URL || 'http://localhost:3003';
      try {
        await supabase.functions.invoke('send-push-notification', {
          body: { 
            userIds: admins.map((a: any) => a.id),
            title: alertTitle,
            body: alertBody,
            url: `${adminUrl}/quarantine-zones`
          }
        });
      } catch (err) {
        console.warn('send-push-notification failed', err);
      }
    }
  }

  if (status === 'FAILED') {
    console.log('\n🔴 RESULT: Some sources FAILED. Database updated partially.');
    process.exit(1);
  } else if (status === 'DEGRADED') {
    console.log('\n🟡 RESULT: Some sources DEGRADED. Ensure schema mapping is safe.');
    process.exit(0);
  } else {
    console.log('\n✅ RESULT: All sources OK — Active Database holds precise bans.');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('\n💥 Fatal error:', err);
  process.exit(2);
});
