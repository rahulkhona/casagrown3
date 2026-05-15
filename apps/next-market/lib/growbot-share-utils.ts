/**
 * GrowBot sharing utilities — extracted for testability.
 *
 * summarizeActions: Converts action card data into readable plain text
 * for social sharing when the AI responds with tool cards only (no msg.text).
 *
 * buildPollShareMessage: Constructs the full social share message for a poll.
 */

/** Extract readable plain text from GrowBot action cards */
export function summarizeActions(actions?: any[]): string {
  if (!actions || actions.length === 0) return ''
  return actions.map((a: any) => {
    const d = a.data || {}
    switch (a.type) {
      case 'DiagnosisCard':
        return `🔬 Diagnosis: ${d.diagnosis || 'Unknown'}\nUrgency: ${d.urgency || 'N/A'}\n\nRemedy Plan:\n${d.remedy_plan || d.remedyPlan || ''}`
      case 'PlantIdentificationCard':
        return `🌿 Plant: ${d.common_name || d.commonName || d.name || 'Unknown'}\nScientific: ${d.scientific_name || d.scientificName || 'N/A'}\n\n${d.description || d.care_tips || d.careTips || ''}`
      case 'RecipeCard':
        return `🍽️ Recipe: ${d.name || d.title || 'Recipe'}\n\n${d.description || ''}\n\nIngredients:\n${Array.isArray(d.ingredients) ? d.ingredients.join('\n') : d.ingredients || ''}`
      default:
        return ''
    }
  }).filter(Boolean).join('\n\n')
}

/** Build the share message for a GrowBot poll */
export function buildPollShareMessage(question: string, answer: string, actions?: any[]): string {
  const answerText = answer?.trim() || summarizeActions(actions)
  const plainAnswer = answerText
    .replace(/\*\*(.*?)\*\*/g, '$1')  // bold
    .replace(/\*(.*?)\*/g, '$1')       // italic
    .replace(/^[\s]*[-*]\s/gm, '• ')   // bullets
    .replace(/^#{1,3}\s+/gm, '')       // headings
    .trim()
  const truncatedAnswer = plainAnswer.length > 500 ? plainAnswer.slice(0, 500) + '…' : plainAnswer

  return `🌱 I asked GrowBot: "${question}"

Here's what GrowBot said:
${truncatedAnswer}

🗳️ Do you think this advice is accurate? Vote here:`
}
