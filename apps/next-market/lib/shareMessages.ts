export function getRandomGreeting(): string {
  const greetings = [
    "Hey there!",
    "Hi!",
    "Hey!",
    "Hello!",
    "Hey! Check this out,"
  ]
  return greetings[Math.floor(Math.random() * greetings.length)]
}

export function getGlobalMarketShareMessage(): string {
  const variations = [
    "I've been using CasaGrown recently to buy amazing fresh produce directly from our neighbors' gardens. It's incredibly fresh and helps prevent food waste in our community. You've got to check this out!",
    "Have you seen CasaGrown? It's a local marketplace where neighbors share and sell fresh homegrown garden produce. I love it and wanted to share it with you!",
    "I recently discovered CasaGrown and it’s been amazing for finding fresh, local food right in our neighborhood. Check it out and see what's growing nearby!",
    "If you love fresh food, you should really check out CasaGrown. Neighbors are selling their excess garden produce—it's super fresh and local!"
  ]
  const text = variations[Math.floor(Math.random() * variations.length)]
  return `${getRandomGreeting()} ${text}\n\n👇 Click the link below to explore the market:\n`
}

export function getProductShareMessage(productName: string, priceText: string, deliveryText: string): string {
  const variations = [
    `Check out this fresh ${productName} I found on CasaGrown Market 🌱`,
    `Look at this amazing ${productName} available from a neighbor on CasaGrown! 🌿`,
    `I saw this fresh ${productName} grown right in our neighborhood on CasaGrown! 🍎`,
    `Just spotted this nice ${productName} on CasaGrown if anyone is looking for some!`
  ]
  const text = variations[Math.floor(Math.random() * variations.length)]
  return `${getRandomGreeting()} ${text}\n\n${priceText}\n\n${deliveryText}\n\n👇 Click the link below to view and purchase:\n`
}

export function getBoothProductShareMessage(productName: string, nextMarketLabel?: string): string {
  const variations = [
    `I just added fresh ${productName} to my booth!`,
    `Look what's fresh from my garden today! I listed ${productName} on my CasaGrown booth:`,
    `My CasaGrown booth is officially live! See what fresh produce I have available:`,
    `I've got excess ${productName} from the garden this week if anyone wants some! Check out my CasaGrown listing:`
  ]
  const text = variations[Math.floor(Math.random() * variations.length)]
  return `${getRandomGreeting()} ${text}\n\n👇 Click the link below to view and purchase for this ${nextMarketLabel || 'weekend'}:\n`
}

export function getCommunityInviteMessage(): string {
  const variations = [
    "Come hang out on the CasaGrown Community to talk local gardening and food! 🐝",
    "Join the conversation on CasaGrown Community! It's a great place to learn and chat. 🌱",
    "We're talking local gardening and produce on CasaGrown Community. Jump in and join us!"
  ]
  const text = variations[Math.floor(Math.random() * variations.length)]
  return `${getRandomGreeting()} ${text}\n\n👇 Click the link below to join the neighborhood chat:\n`
}

export function getCommunityMessageForwardMessage(truncatedMessage: string): string {
  const variations = [
    "Check out this conversation on CasaGrown Community:",
    "Someone just posted this on CasaGrown Community:",
    "I saw this post on CasaGrown Community and thought of you:"
  ]
  const text = variations[Math.floor(Math.random() * variations.length)]
  return `${getRandomGreeting()} ${text}\n\n💬 "${truncatedMessage.replace(/\n\nTap to view and purchase →/g, '')}"\n\n👇 Click here to view or join the conversation:\n`
}
