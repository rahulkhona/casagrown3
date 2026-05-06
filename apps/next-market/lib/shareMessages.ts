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
      "🌱 I've been buying fresh produce from neighbors' gardens through CasaGrown and it's been amazing! Incredibly fresh, hyper-local, and helps reduce food waste in our community.",
      "🌿 I recently discovered CasaGrown — it's a local marketplace where neighbors sell their fresh homegrown produce. I've been loving it and wanted to share with the community!",
      "🍅 Anyone else into fresh, local food? I've been using CasaGrown to buy directly from nearby gardens and the quality is so much better than the store. Highly recommend!",
      "🥬 I found this great neighborhood marketplace called CasaGrown where I can buy garden-fresh fruits, veggies, and more from local growers. If you love fresh food, check it out!",
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
      `🌱 I just found fresh ${productName} on CasaGrown Market — grown right in our neighborhood! If anyone's looking for some, check it out.`,
      `🍎 Just spotted some amazing ${productName} on CasaGrown from a local grower. I love finding fresh produce this close to home!`,
      `🌿 Found some fresh ${productName} on CasaGrown and wanted to share in case anyone else is interested. Love supporting our local growers!`,
      `🥬 If anyone needs fresh ${productName}, I saw some on CasaGrown from a neighbor's garden. Super fresh and locally grown!`,
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
      `🌱 I just listed fresh ${productName} on my CasaGrown produce stand! Grown in my garden, available for delivery or pickup.`,
      `🌿 My garden is producing more than I can use! I just added ${productName} to my CasaGrown stand — available this ${nextMarketLabel || 'weekend'}.`,
      `🍅 Fresh from my garden — I've got ${productName} available on my CasaGrown stand if any neighbors are interested!`,
      `🥬 I'm growing more than I can eat! I've got fresh ${productName} on CasaGrown if anyone wants some.`,
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
      "🌱 I've been hanging out on CasaGrown Community and it's become my go-to for all things gardening! Neighbors share tips on growing, pest control, seasonal planting, recipes, and more. Plus there's CasaBot — an AI gardening assistant that can answer questions about soil, composting, what to plant this season, and how to deal with pests. Really helpful if you're a beginner or just want quick advice!",
      "🐝 If you're into gardening, cooking with fresh food, or just curious about what's growing locally — check out CasaGrown Community! It's a neighborhood chat where we share gardening tips, harvest photos, recipes, and help each other out. They also have CasaBot, an AI assistant that gives personalized gardening advice on everything from pest identification to planting schedules.",
      "🌿 I joined CasaGrown Community and I'm really enjoying it! It's a neighborhood space for gardening tips, fresh food talk, seasonal planting advice, and local produce recommendations. One of my favorite features is CasaBot — it's an AI gardening assistant you can ask about anything from composting to dealing with aphids. Great for beginners and experienced growers alike!",
    ]
    return `${pick(variations)}\n\n👇 Join the neighborhood chat:\n`
  }

  const variations = [
    "I've been using CasaGrown Community and it's awesome! It's a neighborhood chat where people share gardening tips, pest solutions, recipes, and seasonal planting advice. They also have CasaBot — an AI gardening assistant that can help with anything from soil questions to identifying plant problems. You should check it out! 🐝",
    "Come join CasaGrown Community! We talk about gardening, fresh produce, pest control, composting, and local food. Plus there's CasaBot — an AI assistant that gives gardening advice and suggestions on the spot. Really helpful for getting quick answers! 🌱",
    "I found this great neighborhood community on CasaGrown for gardening and fresh food talk! Neighbors share tips, seasonal advice, and recipes. And there's CasaBot — an AI gardening assistant that can answer your plant questions, suggest what to grow, and help with pest issues. 🌿"
  ]
  return `${getRandomGreeting()} ${pick(variations)}\n\n👇 Click the link below to join the neighborhood chat:\n`
}

export function getCommunityMessageForwardMessage(truncatedMessage: string, platform?: SharePlatformType): string {
  if (isCommunityPost(platform)) {
    const variations = [
      "I saw this interesting conversation on CasaGrown Community:",
      "Check out this post I found on CasaGrown Community:",
      "Came across this on CasaGrown Community and wanted to share:"
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
