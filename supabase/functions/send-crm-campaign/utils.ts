/**
 * Extracts and prepares the standard Mustache template model for a recipient.
 * Ensures fallbacks like 'Neighbor' for first_name are applied consistently.
 */
export function buildTemplateModel(name: string | null, dynamicModel: any = null) {
  const firstName = (name ? name.split(' ')[0] : null) || 'Neighbor';
  const lastName = name && name.includes(' ') ? name.substring(name.indexOf(' ') + 1) : null;
  
  return {
    name,
    first_name: firstName,
    last_name: lastName,
    data_source: dynamicModel
  };
}
