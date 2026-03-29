export const BLOCKED_CONTENT = [
  { pattern: /\bf+u+c+k+\w*/i,              message: 'Please remove profanity from your message.' },
  { pattern: /\bsh[i!1]+t\b/i,               message: 'Please remove profanity from your message.' },
  { pattern: /\bmother\s*f/i,                message: 'Please remove profanity from your message.' },
  { pattern: /\bass+h+ol+e/i,                message: 'Please remove profanity from your message.' },
  { pattern: /\bb[i!1]+tch\b/i,              message: 'Please remove profanity from your message.' },
  { pattern: /\bc+u+n+t\b/i,                 message: 'Please remove profanity from your message.' },
  { pattern: /\bd[i!1]+ck\b/i,               message: 'Please remove profanity from your message.' },
  { pattern: /\bpussy\b/i,                   message: 'Please remove profanity from your message.' },
  { pattern: /\bcannabis\b|\bmarijuana\b|\bweed\b|\bthc\b|\bcbd\b/i,
                                              message: 'Cannabis and related topics are not allowed on CasaGrown.' },
  { pattern: /\bcocaine\b|\bheroin\b|\bmeth\b|\bfentanyl\b|\bxanax\b|\badderall\b/i,
                                              message: 'Controlled substances are not allowed on CasaGrown.' },
  { pattern: /\bgun\b|\bfirearm\b|\bammunition\b|\bbullet\b|\brifle\b|\bpistol\b/i,
                                              message: 'Weapons and firearms are not allowed on CasaGrown.' },
  { pattern: /\bknife\b|\bblade\b|\bsword\b|\bpepperspray\b/i,
                                              message: 'Weapons are not allowed on CasaGrown.' },
  { pattern: /\bkill\b|\bmurder\b|\bstab\b|\bshoot\b|\bbomb\b/i,
                                              message: 'Threats and violence are not allowed on CasaGrown.' },
  { pattern: /\bnude\b|\bnaked\b|\bporn\b|\bsex\b|\bxxxxx/i,
                                              message: 'Adult content is not allowed on CasaGrown.' },
]

export function checkTextForViolations(text: string): { isClean: boolean, error?: string } {
  const contentToCheck = text.toLowerCase()
  const blockedMatch = BLOCKED_CONTENT.find(b => b.pattern.test(contentToCheck))
  
  if (blockedMatch) {
    return { isClean: false, error: blockedMatch.message }
  }
  
  return { isClean: true }
}
