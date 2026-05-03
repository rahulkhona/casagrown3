import Mustache from "npm:mustache";

export function buildTemplateModel(
  identity: any, 
  metadata: any, 
  dynamicModel: any = null
) {
  const fullName = identity?.full_name || identity?.name || 'Neighbor';
  const firstName = fullName !== 'Neighbor' ? fullName.split(' ')[0] : 'Neighbor';
  const lastName = fullName.includes(' ') ? fullName.substring(fullName.indexOf(' ') + 1) : null;

  return {
    name: fullName,
    full_name: fullName,
    first_name: firstName,
    last_name: lastName,
    email: identity?.email || '',
    zip_code: metadata?.zip_code || '',
    total_purchases: metadata?.total_purchases || 0,
    lifetime_spend: metadata?.lifetime_spend || 0,
    abandoned_cart_count: metadata?.abandoned_cart_count || 0,
    available_balance_usd: metadata?.available_balance_usd || 0,
    total_sales: metadata?.total_sales || 0,
    lifetime_revenue: metadata?.lifetime_revenue || 0,
    data_source: dynamicModel
  };
}

export function interpolateTemplate(content: string, model: any): string {
  if (!content) return '';
  return Mustache.render(content, model);
}
