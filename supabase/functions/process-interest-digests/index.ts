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
    
    if (match_type === 'seller') {
      subject = 'Buyers are looking for your produce!';
      
      const produceList = items.map((item: any) => `<li>${item.produce_name}</li>`).join('');
      
      const innerHtml = `
        <h2>Hi ${recipient_name || 'Grower'},</h2>
        <p>Buyers in your area are actively searching for produce you grow. We have active alerts for:</p>
        <ul>${produceList}</ul>
        ${actionButton(`${siteUrl}/create-listing`, 'Create a Listing')}
      `;
      htmlContent = wrapInBrandedTemplate(innerHtml, subject, siteUrl);
      
    } else {
      subject = 'New produce available in your area!';
      
      const produceList = items.map((item: any) => `<li>${item.produce_name}</li>`).join('');
      
      const innerHtml = `
        <h2>Hi ${recipient_name || 'Neighbor'},</h2>
        <p>Sellers have just listed produce you're interested in:</p>
        <ul>${produceList}</ul>
        ${actionButton(`${siteUrl}/market?filter=my-interests`, 'View Market')}
      `;
      htmlContent = wrapInBrandedTemplate(innerHtml, subject, siteUrl);
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
