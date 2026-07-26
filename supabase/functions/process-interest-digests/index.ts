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
    
    // Helper function to resolve high-res produce image URL
    const getProduceImage = (name: string) => {
      const lower = (name || '').toLowerCase()
      if (lower.includes('strawberry') || lower.includes('berries')) return 'https://images.unsplash.com/photo-1464965911861-746a04b4bca6?w=400&auto=format&fit=crop&q=80'
      if (lower.includes('avocado')) return 'https://images.unsplash.com/photo-1523049673857-eb18f1d7b578?w=400&auto=format&fit=crop&q=80'
      if (lower.includes('lemon') || lower.includes('citrus')) return 'https://images.unsplash.com/photo-1534706936160-d5ee67737249?w=400&auto=format&fit=crop&q=80'
      if (lower.includes('tomato')) return 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=400&auto=format&fit=crop&q=80'
      if (lower.includes('peach') || lower.includes('nectarine')) return 'https://images.unsplash.com/photo-1647413627916-24e680a133db?w=400&auto=format&fit=crop&q=80'
      if (lower.includes('fig')) return 'https://images.unsplash.com/photo-1601379327928-1fed57e437c6?w=400&auto=format&fit=crop&q=80'
      if (lower.includes('persimmon')) return 'https://images.unsplash.com/photo-1604882737321-e693746f504d?w=400&auto=format&fit=crop&q=80'
      if (lower.includes('orange')) return 'https://images.unsplash.com/photo-1611080626919-7cf5a9dbab5b?w=400&auto=format&fit=crop&q=80'
      if (lower.includes('pepper')) return 'https://images.unsplash.com/photo-1563565375-f3fdfdbefa83?w=400&auto=format&fit=crop&q=80'
      if (lower.includes('egg') || lower.includes('honey')) return 'https://images.unsplash.com/photo-1587486913049-53fc88980cfc?w=400&auto=format&fit=crop&q=80'
      return `${siteUrl}/images/produce_placeholder.jpg`
    }

    // Render 2-column image card grid
    const renderProduceGrid = (itemsList: any[]) => {
      const gridCards = itemsList.map((item: any) => `
        <td align="center" style="padding: 6px; width: 50%; vertical-align: top;">
          <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.04); text-align: center;">
            <img src="${getProduceImage(item.produce_name)}" alt="${item.produce_name}" style="width: 100%; height: 110px; object-fit: cover; display: block;" />
            <div style="padding: 10px 8px; font-size: 13px; font-weight: 700; color: #1e293b; line-height: 1.3;">
              ${item.produce_name}
            </div>
          </div>
        </td>
      `).join('')

      return `
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin: 16px 0 20px;">
          <tr>
            ${gridCards}
          </tr>
        </table>
      `
    }

    if (match_type === 'seller') {
      subject = '🌱 Local Neighbors Want Your Fresh Produce! | CasaGrown'
      
      const bodyHtml = `
        <p style="margin: 0 0 14px; font-size: 15px; color: #475569; line-height: 1.6;">
          Great news! Buyers in your immediate neighborhood are actively looking to purchase fresh homegrown produce that you grow:
        </p>

        ${renderProduceGrid(items)}

        <div style="background-color: #f0fdf4; border-left: 4px solid #22c55e; padding: 12px 16px; border-radius: 8px; margin-bottom: 20px;">
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
      
      const bodyHtml = `
        <p style="margin: 0 0 14px; font-size: 15px; color: #475569; line-height: 1.6;">
          Local growers in your area just posted new produce listings that match your saved produce interest alerts:
        </p>

        ${renderProduceGrid(items)}

        <div style="background-color: #f0f9ff; border-left: 4px solid #0284c7; padding: 12px 16px; border-radius: 8px; margin-bottom: 20px;">
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
