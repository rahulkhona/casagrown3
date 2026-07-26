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

  let sentCount = 0;
  const pushUrl = (env('SUPABASE_URL') || 'http://host.docker.internal:54321') + '/functions/v1/send-push-notification';

  for (const matchGroup of matches) {
    const { recipient_email, recipient_name, is_user, user_id, lead_id, match_type, matches: items } = matchGroup;
    
    let subject = '';
    let htmlContent = '';
    
    // Helper function to resolve produce emoji
    const getProduceEmoji = (name: string) => {
      const lower = (name || '').toLowerCase()
      if (lower.includes('strawberry') || lower.includes('berries')) return '🍓'
      if (lower.includes('avocado')) return '🥑'
      if (lower.includes('lemon') || lower.includes('citrus')) return '🍋'
      if (lower.includes('tomato')) return '🍅'
      if (lower.includes('peach') || lower.includes('nectarine')) return '🍑'
      if (lower.includes('fig')) return '🫒'
      if (lower.includes('persimmon') || lower.includes('apple')) return '🍎'
      if (lower.includes('egg') || lower.includes('honey')) return '🍯'
      if (lower.includes('herb') || lower.includes('mint')) return '🌿'
      return '🌱'
    }

    if (match_type === 'seller') {
      subject = '🌱 Local Neighbors Want Your Fresh Produce! | CasaGrown'
      
      const produceCards = items.map((item: any) => `
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 18px; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between;">
          <div style="font-size: 16px; font-weight: 600; color: #1e293b;">
            <span style="font-size: 20px; margin-right: 8px;">${getProduceEmoji(item.produce_name)}</span>
            ${item.produce_name}
          </div>
          <span style="background-color: #dcfce7; color: #15803d; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.5px;">
            High Local Demand
          </span>
        </div>
      `).join('')
      
      const bodyHtml = `
        <p style="margin: 0 0 16px; font-size: 15px; color: #475569; line-height: 1.6;">
          Great news! Buyers in your immediate neighborhood are actively looking to purchase fresh homegrown produce that you grow.
        </p>

        <div style="margin: 20px 0;">
          ${produceCards}
        </div>

        <div style="background-color: #f0fdf4; border-left: 4px solid #22c55e; padding: 14px 16px; border-radius: 8px; margin-bottom: 24px;">
          <p style="margin: 0; font-size: 13px; color: #166534; font-weight: 500;">
            💡 <strong>Grower Tip:</strong> Listings posted within 24 hours of buyer interest requests receive up to <strong>3x faster sales</strong>.
          </p>
        </div>

        ${actionButton(`${siteUrl}/create-listing`, 'Create a Listing & Sell →')}
      `

      htmlContent = wrapInBrandedTemplate({
        title: 'Local Demand Alert',
        greeting: `Hi ${recipient_name || 'Grower'},`,
        bodyHtml: bodyHtml,
        headerEmoji: '🧺',
        headerGradient: 'linear-gradient(135deg, #14532d 0%, #15803d 50%, #22c55e 100%)',
      })

    } else {
      subject = '✨ Fresh Local Harvest Matches Near You! | CasaGrown'
      
      const produceCards = items.map((item: any) => `
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px 18px; margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between;">
          <div style="font-size: 16px; font-weight: 600; color: #1e293b;">
            <span style="font-size: 20px; margin-right: 8px;">${getProduceEmoji(item.produce_name)}</span>
            ${item.produce_name}
          </div>
          <span style="background-color: #e0f2fe; color: #0369a1; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.5px;">
            Fresh Harvest
          </span>
        </div>
      `).join('')
      
      const bodyHtml = `
        <p style="margin: 0 0 16px; font-size: 15px; color: #475569; line-height: 1.6;">
          Local growers in your area just posted new produce listings that match your saved produce interest alerts!
        </p>

        <div style="margin: 20px 0;">
          ${produceCards}
        </div>

        <div style="background-color: #f0f9ff; border-left: 4px solid #0284c7; padding: 14px 16px; border-radius: 8px; margin-bottom: 24px;">
          <p style="margin: 0; font-size: 13px; color: #075985; font-weight: 500;">
            🌿 <strong>100% Homegrown Guarantee:</strong> All produce on CasaGrown is harvested fresh by verified neighborhood stands.
          </p>
        </div>

        ${actionButton(`${siteUrl}/market?filter=my-interests`, 'Explore Produce Stands →')}
      `

      htmlContent = wrapInBrandedTemplate({
        title: 'Nearby Harvest Match',
        greeting: `Hi ${recipient_name || 'Neighbor'},`,
        bodyHtml: bodyHtml,
        headerEmoji: '🌾',
        headerGradient: 'linear-gradient(135deg, #064e3b 0%, #047857 50%, #10b981 100%)',
      })
    }
    
    // Send Email
    try {
      await sendBroadcastEmail(recipient_email, subject, htmlContent, env);
      
      // Log to crm_campaign_sends
      if (campaignId) {
        await supabase.from('crm_campaign_sends').insert({
          campaign_id: campaignId,
          recipient_type: is_user ? 'user' : 'lead',
          recipient_id: is_user ? user_id : lead_id,
          email: recipient_email,
          sent_at: new Date().toISOString()
        });
      }
      
      // Send Push
      if (is_user && user_id) {
        await fetch(pushUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': \`Bearer \${env('SUPABASE_SERVICE_ROLE_KEY')}\`
          },
          body: JSON.stringify({
            userId: user_id,
            title: subject,
            body: match_type === 'seller' ? 'List your produce now.' : 'Check the market for new produce.',
            data: { url: match_type === 'seller' ? '/create-listing' : '/market?filter=my-interests' }
          })
        }).catch(e => console.error('Push error:', e));
      }
      
      // Update match status
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
      
      sentCount++;
      
    } catch (err) {
      console.error('Failed to process match digest for', recipient_email, err);
    }
  }

  return jsonOk({ sent: sentCount }, corsHeaders);
})
