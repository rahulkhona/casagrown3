export type SharePlatformType = 'whatsapp' | 'sms' | 'email' | 'facebook' | 'nextdoor' | 'copy' | 'native'

/** True for platforms where the message is a community/public post, not a 1:1 DM */
function isCommunityPost(platform?: SharePlatformType): boolean {
  return platform === 'facebook' || platform === 'nextdoor'
}

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

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

export function getGlobalMarketShareMessage(platform?: SharePlatformType): string {
  if (isCommunityPost(platform)) {
    const variations = [
      "🌱 Fresh, locally-grown produce from your neighbors' gardens is now available in our neighborhood through CasaGrown! Incredibly fresh, hyper-local, and helps reduce food waste.",
      "🌿 Did you know neighbors near us are growing and selling fresh produce? CasaGrown makes it easy to buy directly from local gardens. Worth checking out!",
      "🍅 If you love fresh food and supporting local growers, check out CasaGrown — a neighborhood marketplace for homegrown produce. I've been really impressed with the quality!",
      "🥬 Our neighborhood has a local produce marketplace called CasaGrown where neighbors sell their garden-fresh fruits, veggies, and more. Great way to eat fresh and support local!",
    ]
    return `${pick(variations)}\n\n👇 Explore what's growing near you:\n`
  }

  const variations = [
    "I've been using CasaGrown recently to buy amazing fresh produce directly from our neighbors' gardens. It's incredibly fresh and helps prevent food waste in our community. You've got to check this out!",
    "Have you seen CasaGrown? It's a local marketplace where neighbors share and sell fresh homegrown garden produce. I love it and wanted to share it with you!",
    "I recently discovered CasaGrown and it's been amazing for finding fresh, local food right in our neighborhood. Check it out and see what's growing nearby!",
    "If you love fresh food, you should really check out CasaGrown. Neighbors are selling their excess garden produce—it's super fresh and local!"
  ]
  return `${getRandomGreeting()} ${pick(variations)}\n\n👇 Click the link below to explore the market:\n`
}

export function getProductShareMessage(productName: string, priceText: string, deliveryText: string, platform?: SharePlatformType): string {
  if (isCommunityPost(platform)) {
    const variations = [
      `🌱 Fresh ${productName} available from a local grower in our neighborhood on CasaGrown!`,
      `🍎 Anyone looking for fresh ${productName}? Just spotted this on CasaGrown — grown right in our neighborhood!`,
      `🌿 Local ${productName} alert! A neighbor is selling fresh, homegrown ${productName} on CasaGrown.`,
      `🥬 If you love fresh produce, there's ${productName} available from a nearby garden on CasaGrown!`,
    ]
    return `${pick(variations)}\n\n${priceText}\n${deliveryText}\n\n👇 View details and order:\n`
  }

  const variations = [
    `Check out this fresh ${productName} I found on CasaGrown Market 🌱`,
    `Look at this amazing ${productName} available from a neighbor on CasaGrown! 🌿`,
    `I saw this fresh ${productName} grown right in our neighborhood on CasaGrown! 🍎`,
    `Just spotted this nice ${productName} on CasaGrown if anyone is looking for some!`
  ]
  return `${getRandomGreeting()} ${pick(variations)}\n\n${priceText}\n\n${deliveryText}\n\n👇 Click the link below to view and purchase:\n`
}

export function getBoothProductShareMessage(productName: string, nextMarketLabel?: string, platform?: SharePlatformType): string {
  if (isCommunityPost(platform)) {
    const variations = [
      `🌱 Fresh ${productName} just listed on my CasaGrown produce stand! Grown locally, available for delivery or pickup.`,
      `🌿 My garden is producing! I just added ${productName} to my CasaGrown produce stand — homegrown and available this ${nextMarketLabel || 'weekend'}.`,
      `🍅 Fresh from my garden to your table — ${productName} is now available on my CasaGrown stand! Come check out what I'm growing.`,
      `🥬 Growing more than I can eat! I've got fresh ${productName} available on CasaGrown if any neighbors are interested.`,
    ]
    return `${pick(variations)}\n\n👇 View and order for this ${nextMarketLabel || 'weekend'}:\n`
  }

  const variations = [
    `I just added fresh ${productName} to my produce stand!`,
    `Look what's fresh from my garden today! I listed ${productName} on my CasaGrown produce stand:`,
    `My CasaGrown produce stand is officially live! See what fresh produce I have available:`,
    `I've got excess ${productName} from the garden this week if anyone wants some! Check out my CasaGrown listing:`
  ]
  return `${getRandomGreeting()} ${pick(variations)}\n\n👇 Click the link below to view and purchase for this ${nextMarketLabel || 'weekend'}:\n`
}

export function getCommunityInviteMessage(platform?: SharePlatformType): string {
  if (isCommunityPost(platform)) {
    const variations = [
      "🐝 There's a neighborhood community chat on CasaGrown where locals discuss gardening, share tips, and talk about fresh produce. Great way to connect with fellow growers!",
      "🌱 If you're into gardening or fresh local food, check out CasaGrown Community — a neighborhood chat where we share tips, recipes, and what's growing.",
      "🌿 Our neighborhood has a community on CasaGrown for talking about local gardening, recipes, and fresh food. Come join the conversation!"
    ]
    return `${pick(variations)}\n\n👇 Join the neighborhood chat:\n`
  }

  const variations = [
    "Come hang out on the CasaGrown Community to talk local gardening and food! 🐝",
    "Join the conversation on CasaGrown Community! It's a great place to learn and chat. 🌱",
    "We're talking local gardening and produce on CasaGrown Community. Jump in and join us!"
  ]
  return `${getRandomGreeting()} ${pick(variations)}\n\n👇 Click the link below to join the neighborhood chat:\n`
}

export function getCommunityMessageForwardMessage(truncatedMessage: string, platform?: SharePlatformType): string {
  if (isCommunityPost(platform)) {
    const variations = [
      "Interesting conversation happening on CasaGrown Community:",
      "Check out this post from our neighborhood on CasaGrown Community:",
      "Our neighbors are talking about this on CasaGrown Community:"
    ]
    return `${pick(variations)}\n\n💬 "${truncatedMessage.replace(/\n\nTap to view and purchase →/g, '')}"\n\n👇 View the full conversation:\n`
  }

  const variations = [
    "Check out this conversation on CasaGrown Community:",
    "Someone just posted this on CasaGrown Community:",
    "I saw this post on CasaGrown Community and thought of you:"
  ]
  return `${getRandomGreeting()} ${pick(variations)}\n\n💬 "${truncatedMessage.replace(/\n\nTap to view and purchase →/g, '')}"\n\n👇 Click here to view or join the conversation:\n`
}
