/**
 * Legal document effective dates.
 * When either document is updated, bump its date here.
 * Any user whose tos_accepted_at is older than this will be
 * prompted to re-accept on their next login/page visit.
 */
export const TOS_EFFECTIVE_DATE = new Date('2026-05-28T00:00:00Z')

/**
 * Returns true if the user needs to (re)accept the ToS.
 * - tos_accepted_at is null → never accepted
 * - tos_accepted_at < TOS_EFFECTIVE_DATE → accepted an older version
 */
export function needsTosAcceptance(tosAcceptedAt: string | null | undefined): boolean {
  if (!tosAcceptedAt) return true
  return new Date(tosAcceptedAt) < TOS_EFFECTIVE_DATE
}
