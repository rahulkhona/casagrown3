import { serveWithCors, jsonOk, jsonError } from '../_shared/serve-with-cors.ts'
import { sendBroadcastEmail } from '../_shared/postmark.ts'
import { wrapInBrandedTemplate, actionButton } from '../_shared/email-templates.ts'

// Mustache render helper
function renderTemplate(template: string, view: any) {
  let result = template;
  for (const key in view) {
    if (Object.prototype.hasOwnProperty.call(view, key)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, view[key]);
    }
  }
  return result;
}

serveWithCors(async (req, { supabase, env, corsHeaders, siteUrl }) => {
  const body = await req.json().catch(() => ({ action: 'send_digests' }))
  
  if (body.action !== 'send_digests') {
    return jsonOk({ error: 'Unknown action: ' + body.action }, corsHeaders)
  }

  // RPC reads admin-configured send windows from crm_send_slot_defaults
  // and filters recipients whose local time falls within today's email slot
  const { data: matches, error } = await supabase.rpc('get_unnotified_interest_matches');

  if (error) {
    console.error('Failed to get interest matches:', error);
    return jsonError(error, corsHeaders);
  }

  if (!matches || matches.length === 0) {
    return jsonOk({ sent: 0, message: 'No matches for current send window' }, corsHeaders);
  }

  // Get or Create Campaign
  let campaignId = null;
  const { data: camp } = await supabase.from('crm_campaigns').select('id').eq('system_alias', 'interest_digests').single();
  if (camp) {
    campaignId = camp.id;
  } else {
    const { data: newCamp } = await supabase.from('crm_campaigns').insert({
      system_alias: 'interest_digests',
      name: 'Algorithm: Interest Matches',
      subject: 'Your CasaGrown Match Digest',
      channel: 'email',
      status: 'sending'
    }).select('id').single();
    campaignId = newCamp?.id;
  }

  const userGroups: Record<string, any[]> = {};
  for (const matchGroup of matches) {
    if (!userGroups[matchGroup.recipient_email]) {
      userGroups[matchGroup.recipient_email] = [];
    }
    userGroups[matchGroup.recipient_email].push(matchGroup);
  }

  let sentCount = 0;
  const pushUrl = (env('SUPABASE_URL') || 'http://host.docker.internal:54321') + '/functions/v1/send-push-notification';

  // Load interest catalog images from our own storage bucket via interest_image_overrides
  const { data: imageOverrides } = await supabase
    .from('interest_image_overrides')
    .select('item_id, image_url')
    .not('image_url', 'is', null);

  // Build lookup: normalized produce name -> storage URL
  // item_id is stored as e.g. 'strawberries', 'avocado_sapling', 'cherry_tomatoes'
  const imageMap = new Map<string, string>();
  for (const row of (imageOverrides || [])) {
    if (row.item_id && row.image_url) {
      imageMap.set(row.item_id.toLowerCase().replace(/[^a-z0-9]/g, '_'), row.image_url);
    }
  }

  // Resolve produce image from our interest_image_overrides catalog
  const getProduceImage = (name: string): string => {
    const normalized = (name || '').toLowerCase().replace(/[^a-z0-9]/g, '_');
    // Direct match (e.g. 'strawberries' -> 'strawberries')
    if (imageMap.has(normalized)) return imageMap.get(normalized)!;
    // Partial match: find any key that contains the normalized word or vice versa
    for (const [key, url] of imageMap) {
      if (key.includes(normalized) || normalized.includes(key)) return url;
    }
    return `${siteUrl}/images/produce_placeholder.jpg`;
  }

  // 3-tier image fallback: storage URL → placeholder → null (name only)
  // Placeholder is HEAD-checked once at startup (not per item).
  const placeholderUrl = `${siteUrl}/images/produce_placeholder.jpg`;

  const placeholderReachable = await (async () => {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 2000);
      const r = await fetch(placeholderUrl, { method: 'HEAD', signal: ctrl.signal });
      clearTimeout(t);
      return r.ok;
    } catch { return false; }
  })();

  // Returns: verified storage URL | verified placeholder URL | null (no image)
  const verifyImageUrl = async (url: string): Promise<string | null> => {
    // Tier 1: try the storage/catalog URL
    if (url && url !== placeholderUrl) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 2000);
        const res = await fetch(url, { method: 'HEAD', signal: ctrl.signal });
        clearTimeout(t);
        if (res.ok) return url;
      } catch { /* fall through */ }
    }
    // Tier 2: try placeholder (already checked at startup)
    if (placeholderReachable) return placeholderUrl;
    // Tier 3: no image available — caller will render name-only card
    return null;
  }

  // Render 2-column image card grid — async so we can verify each image URL
  // before baking it into the HTML. Broken storage URLs are substituted with
  // the placeholder server-side, so the email always has a working src.
  const renderProduceGrid = async (itemsList: any[], match_type: string): Promise<string> => {
    const gridCards = await Promise.all(itemsList.map(async (item: any) => {
      const distanceLabel = item.distance_miles != null
        ? `~${Number(item.distance_miles).toFixed(1)} mi away`
        : item.matched_zipcode
          ? `ZIP ${item.matched_zipcode}`
          : null
          
      const prefix = match_type === 'seller' ? 'Buyer is ' : 'Listed '
      const suffix = match_type === 'seller' ? '' : ' from you'
      const labelHtml = distanceLabel
        ? `<div style="font-size: 12px; color: #64748b; margin-top: 4px; font-weight: 500;">${prefix}${distanceLabel}${suffix}</div>`
        : ''

      // 3-tier fallback: storage URL → placeholder → null (name-only card)
      const imgSrc = await verifyImageUrl(getProduceImage(item.produce_name))
      const imgHtml = imgSrc
        ? `<img src="${imgSrc}" alt="${item.produce_name}" width="100%" height="110" style="width: 100%; height: 110px; object-fit: cover; display: block;" />`
        : `<div style="height: 24px;"></div>` // spacer so card isn't flush when name-only

      return `
      <td align="center" style="padding: 6px; width: 50%; vertical-align: top;">
        <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.04); text-align: center;">
          ${imgHtml}
          <div style="padding: 10px 8px; font-size: 13px; font-weight: 700; color: #1e293b; line-height: 1.3;">
            ${item.produce_name}
            ${labelHtml}
          </div>
        </div>
      </td>
    `
    }))

    return `
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin: 16px 0 20px;">
        <tr>
          ${gridCards}
        </tr>
      </table>
    `
  }

  // Helper function to build character-safe produce string
  const getProduceText = (itemsList: any[]) => {
    const names = itemsList.map((i: any) => i.produce_name).filter(Boolean)
    if (names.length === 1) return names[0]
    return 'produce'
  }

  for (const email of Object.keys(userGroups)) {
    const groups = userGroups[email];
    const { recipient_name, is_user, user_id, lead_id } = groups[0];
    
    let subject = 'Your CasaGrown Match Digest';
    let pushTitle = 'CasaGrown Match Digest';
    let pushBody = 'You have new activity nearby on CasaGrown.';
    let pushUrlPath = '/market';

    let hasSeller = false;
    let hasBuyer = false;
    let combinedBodyHtml = '';

    for (const mg of groups) {
      const { match_type, matches: items } = mg;
      const itemText = getProduceText(items);

      if (match_type === 'seller') {
        hasSeller = true;
        subject = items.length === 1 
          ? `🌱 Buyers want your ${itemText}! | CasaGrown` 
          : `🌱 Local neighbors are looking for your produce! | CasaGrown`;
        pushTitle = `🌱 Local demand for your produce!`;
        pushBody = `Buyers near you are searching for your produce. Tap to see active local demand!`;
        pushUrlPath = '/my-interests?tab=demand&utm_source=push&utm_medium=interest_digest&utm_campaign=interest_matches&utm_content=seller_demand';

        combinedBodyHtml += `
          <div style="margin-bottom: 30px;">
            <h2 style="font-size: 18px; color: #1e293b; margin-top: 0; margin-bottom: 10px;">Demand Signal</h2>
            <p style="margin: 0 0 14px; font-size: 15px; color: #475569; line-height: 1.6;">
              Great news! Buyers in your immediate neighborhood are actively looking to purchase fresh homegrown produce that you grow:
            </p>

            ${await renderProduceGrid(items, match_type)}

            <div style="background-color: #f0fdf4; border-left: 4px solid #22c55e; padding: 12px 16px; border-radius: 8px; margin-bottom: 20px;">
              <p style="margin: 0; font-size: 13px; color: #166534; font-weight: 500;">
                💡 <strong>Grower Tip:</strong> Listings posted within 24 hours of buyer interest requests receive up to <strong>3x faster sales</strong>.
              </p>
            </div>

            ${actionButton(`${siteUrl}/my-interests?tab=demand&utm_source=email&utm_medium=interest_digest&utm_campaign=interest_matches&utm_content=seller_demand`, 'View Active Buyer Demand →')}
          </div>
        `;
      } else {
        hasBuyer = true;
        subject = `Your neighbors have listed produce that you want | CasaGrown`;
        pushTitle = items.length === 1
          ? `✨ Fresh ${itemText} listed nearby!`
          : `✨ Fresh produce listed nearby!`;
        pushBody = `Your neighbors just listed items on your wishlist. Tap to browse!`;
        pushUrlPath = '/market?filter=my-interests&utm_source=push&utm_medium=interest_digest&utm_campaign=interest_matches&utm_content=buyer_match';

        combinedBodyHtml += `
          <div style="margin-bottom: 30px;">
            <h2 style="font-size: 18px; color: #1e293b; margin-top: 0; margin-bottom: 10px;">Match Alert</h2>
            <p style="margin: 0 0 14px; font-size: 15px; color: #475569; line-height: 1.6;">
              Local growers in your area just posted new produce listings that match your saved produce interest alerts:
            </p>

            ${await renderProduceGrid(items, match_type)}

            <div style="background-color: #f0f9ff; border-left: 4px solid #0284c7; padding: 12px 16px; border-radius: 8px; margin-bottom: 20px;">
              <p style="margin: 0; font-size: 13px; color: #075985; font-weight: 500;">
                🌿 <strong>100% Homegrown Guarantee:</strong> All produce on CasaGrown is harvested fresh by verified neighborhood stands.
              </p>
            </div>

            ${actionButton(`${siteUrl}/market?filter=my-interests&utm_source=email&utm_medium=interest_digest&utm_campaign=interest_matches&utm_content=buyer_match`, 'Explore Produce Stands →')}
          </div>
        `;
      }
    }

    if (hasSeller && hasBuyer) {
      subject = 'New Matches & Demand in your neighborhood | CasaGrown';
      pushTitle = 'New Activity in Your Area!';
      pushBody = 'You have new produce matches and demand nearby. Tap to view.';
      pushUrlPath = '/market';
    }

    const htmlContent = wrapInBrandedTemplate({
      title: 'Local Activity Digest',
      greeting: `Hi ${recipient_name || 'Neighbor'},`,
      bodyHtml: combinedBodyHtml,
      headerEmoji: '🧺',
      headerGradient: 'linear-gradient(135deg, #14532d 0%, #15803d 50%, #22c55e 100%)',
    });
    
    // Send Email
    try {
      await sendBroadcastEmail(email, subject, htmlContent, env);
      
      // Log to crm_campaign_sends
      if (campaignId) {
        await supabase.from('crm_campaign_sends').insert({
          campaign_id: campaignId,
          recipient_type: is_user ? 'user' : 'lead',
          recipient_id: is_user ? user_id : lead_id,
          email: email,
          sent_at: new Date().toISOString()
        });
      }
      
      // Send Push Notification
      if (is_user && user_id) {
        await fetch(pushUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env('SUPABASE_SERVICE_ROLE_KEY')}`
          },
          body: JSON.stringify({
            userId: user_id,
            title: pushTitle,
            body: pushBody,
            data: { url: pushUrlPath }
          })
        }).catch(e => console.error('Push error:', e));
      }
      
      // Update match status for all groups processed for this user
      for (const mg of groups) {
        const { match_type, matches: items } = mg;
        const matchIds = items.map((item: any) => item.match_id);
        if (match_type === 'seller') {
          await supabase.from('crm_interest_matches')
            .update({ notified_seller_at: new Date().toISOString() })
            .in('id', matchIds);
        } else {
          await supabase.from('crm_interest_matches')
            .update({ notified_buyer_at: new Date().toISOString() })
            .in('id', matchIds);
        }
      }
      
      sentCount++;
      
    } catch (err) {
      console.error('Failed to process match digest for', email, err);
    }
  }

  return jsonOk({ sent: sentCount }, corsHeaders);
})
