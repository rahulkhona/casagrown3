export type SharePlatformType = 'whatsapp' | 'sms' | 'email' | 'facebook' | 'nextdoor' | 'copy' | 'native'

/** True for platforms where the message is a community/public post, not a 1:1 DM */
function isCommunityPost(platform?: SharePlatformType): boolean {
  return platform === 'facebook' || platform === 'nextdoor'
}

export function sanitizeDigest(digest: string | null | undefined): string {
  if (!digest) return ''

  // 1. Remove thought blocks and loose thought tags
  let clean = digest.replace(/<thought>[\s\S]*?<\/thought>/gi, '')
  clean = clean.replace(/<\/thought>/gi, '').replace(/<thought>/gi, '')
  clean = clean.replace(/Perfect\s*$/i, '')

  // 2. If it contains Draft 1, let's try to extract Draft 1
  const draft1Match = clean.match(/(?:^|\n)\s*(?:\*\s*)?(?:\*Draft\s*1\*|Draft\s*1)[:* -]*([\s\S]*?)(?=(?:\n\s*(?:\*\s*)?(?:\*Draft|Draft\s*[2-9]))|$)/i)
  if (draft1Match && draft1Match[1].trim()) {
    return draft1Match[1].trim()
  }

  // 3. Fallback: if it doesn't have "Draft 1" but has metadata lines like "* Output:", "* Activity:", let's strip those lines.
  const lines = clean.split('\n')
  const filteredLines = lines.filter(line => {
    const l = line.trim().toLowerCase()
    // Filter out metadata-like lines
    if (l.startsWith('* output:') || l.startsWith('output:') || 
        l.startsWith('* activity:') || l.startsWith('activity:') || 
        l.startsWith('* items:') || l.startsWith('items:') || 
        l.startsWith('* engagement:') || l.startsWith('engagement:') ||
        l.startsWith('draft ') || l.startsWith('*draft ')) {
      return false
    }
    return true
  })

  return filteredLines.join('\n').trim()
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

export function getGlobalMarketShareMessage(platform?: SharePlatformType, digest?: string | null): string {
  // If we have a fresh AI community digest, weave it into the invite
  const cleanDigest = sanitizeDigest(digest)
  if (cleanDigest) {
    if (platform === 'sms') {
      return `Check out what's fresh on CasaGrown! 🌱\n\n${cleanDigest}\n\n👇 Link:`
    }
    if (platform === 'email') {
      return `Hi neighbor,\n\nI wanted to share this fresh update from CasaGrown. Neighbors are sharing all kinds of amazing homegrown produce recently:\n\n${cleanDigest}\n\nIt's a great local marketplace to buy directly from nearby gardens.\n\n👇 Click the link below to explore the market:`
    }
    if (platform === 'whatsapp') {
      return `Hey neighbor! Here's what's fresh on CasaGrown right now:\n\n${cleanDigest}\n\nIt's a local marketplace where you can buy fresh produce from neighbors' gardens! 🌿\n\n👇 Explore here:`
    }
    if (isCommunityPost(platform)) {
      return `🌱 Here's what neighbors are buzzing about on CasaGrown:\n\n${cleanDigest}\n\nCasaGrown is a local marketplace where neighbors buy and sell fresh homegrown produce.\n\n👇 Explore what's growing near you:\n`
    }
    return `${getRandomGreeting()} Here's what's happening on CasaGrown right now:\n\n${cleanDigest}\n\nIt's a local marketplace where you can buy fresh produce from neighbors' gardens!\n\n👇 Click the link below to explore the market:\n`
  }

  if (platform === 'sms') {
    return "Check out what our neighbors are growing on CasaGrown! 🌱\n\n👇 Click here to see what's fresh:"
  }
  if (platform === 'email') {
    return "Hi neighbor,\n\nI've been using CasaGrown recently to buy amazing fresh produce directly from our neighbors' gardens. It's incredibly fresh, hyper-local, and helps prevent food waste in our community. I highly recommend checking it out!\n\n👇 Click the link below to explore what's growing nearby:"
  }
  if (platform === 'whatsapp') {
    return "Hey neighbor! Have you checked out CasaGrown? It's a local marketplace where neighbors sell their fresh homegrown garden produce. You've got to check it out! 🌿\n\n👇 Link below:"
  }
  if (platform === 'nextdoor') {
    return "🌱 Hi neighbors! I recently discovered CasaGrown — a local neighborhood marketplace where we can buy fresh homegrown produce directly from nearby gardens. I've been loving it and wanted to share with the community!\n\n👇 Explore what's growing near you:"
  }
  if (platform === 'facebook') {
    return "🍅 I've been using CasaGrown to buy fresh produce directly from local gardens and the quality is so much better than the store. Highly recommend checking out what's growing nearby!"
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

export function getCommunityInviteMessage(platform?: SharePlatformType, digest?: string | null): string {
  // If we have a fresh AI digest, use it for a dynamic, timely message
  const cleanDigest = sanitizeDigest(digest)
  if (cleanDigest) {
    if (platform === 'sms') {
      return `Check out what's buzzin' on CasaGrown Community chat! 🐝\n\n${cleanDigest}\n\n👇 Join us:`
    }
    if (platform === 'email') {
      return `Hi neighbor,\n\nI wanted to invite you to join the CasaGrown Community chat. Here's a quick look at what our local gardening neighbors are talking about recently:\n\n${cleanDigest}\n\n👇 Click the link below to join the conversation:`
    }
    if (platform === 'whatsapp') {
      return `Hey neighbor! Here's what's happening on the CasaGrown Community chat right now:\n\n${cleanDigest}\n\n👇 Join the neighborhood chat here:`
    }
    if (isCommunityPost(platform)) {
      return `🌱 Here's what neighbors are talking about on CasaGrown Community:\n\n${cleanDigest}\n\n👇 Join the neighborhood chat:\n`
    }
    return `${getRandomGreeting()} Here's what's happening on CasaGrown Community right now:\n\n${cleanDigest}\n\n👇 Click the link below to join the neighborhood chat:\n`
  }

  if (platform === 'sms') {
    return "Come join the CasaGrown neighborhood gardening chat! 🐝\n\n👇 Click here to join the group:"
  }
  if (platform === 'email') {
    return "Hi neighbor,\n\nI've been hanging out in the CasaGrown Community chat and it's been awesome! Neighbors share gardening tips, harvest photos, recipes, and seasonal planting advice. Plus, there's CasaBot — an AI gardening assistant that can help answer any gardening questions on the spot. Highly recommend joining!\n\n👇 Click the link below to join the chat:"
  }
  if (platform === 'whatsapp') {
    return "Hey neighbor! Come join the CasaGrown Community chat. We share gardening tips, local harvest photos, recipes, and help each other out! 🌿\n\n👇 Click here to join:"
  }
  if (platform === 'nextdoor') {
    return "🌱 Hi neighbors! I joined the CasaGrown Community chat and it's become my go-to for all things gardening. Neighbors are sharing tips, recipe ideas, and plant help. It's really helpful if you love fresh food or gardening!\n\n👇 Join the neighborhood chat:"
  }
  if (platform === 'facebook') {
    return "🌿 If you love gardening or cooking with fresh local food, check out the CasaGrown Community chat! It's a great neighborhood space for sharing tips, advice, and gardening help. Highly recommend joining!"
  }

  const variations = [
    "I've been using CasaGrown Community and it's awesome! It's a neighborhood chat where people share gardening tips, pest solutions, recipes, and seasonal planting advice. They also have CasaBot — an AI gardening assistant that can help with anything from soil questions to identifying plant problems. You should check it out! 🐝",
    "Come join CasaGrown Community! We talk about gardening, fresh produce, pest control, composting, and local food. Plus there's CasaBot — an AI assistant that gives gardening advice and suggestions on the spot. Really helpful for getting quick answers! 🌱",
    "I found this great neighborhood community on CasaGrown for gardening and fresh food talk! Neighbors share tips, seasonal advice, and recipes. And there's CasaBot — an AI gardening assistant that can answer your plant questions, suggest what to grow, and help with pest issues. 🌿"
  ]
  return `${getRandomGreeting()} ${pick(variations)}\n\n👇 Click the link below to join the group:`
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
