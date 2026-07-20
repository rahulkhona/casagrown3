import nlp from 'compromise'
import compromiseNumbers from 'compromise-numbers'
nlp.plugin(compromiseNumbers)

export interface AddressFields {
  street: string
  city: string
  state: string
  zip: string
}

export interface ParsedListingData {
  name: string | null
  category: string | null
  description: string
  quantity: number
  unit: string
  price_usd: number | null
  offers_delivery: boolean
  offers_pickup: boolean
  delivery_radius_miles: number | null
  delivery_zipcodes: string[]
  delivery_days: string[]
  pickup_days: string[]
  delivery_time_of_day: string[]
  pickup_time_of_day: string[]
  pickup_address: AddressFields | null
  base_address: AddressFields | null
}

// Decompose address string to structured AddressFields
export const decomposeAddress = (addressStr: string): AddressFields => {
  if (!addressStr) return { street: '', city: '', state: '', zip: '' }
  const zipMatch = addressStr.match(/\b\d{5}\b/)
  const zip = zipMatch ? zipMatch[0] : ''
  let remaining = addressStr.replace(/\b\d{5}\b/, '').trim()
  const stateRegex = /\b(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|California|Oregon|Washington)\b/i
  const stateMatch = remaining.match(stateRegex)
  let state = stateMatch ? stateMatch[1].toUpperCase() : ''
  if (state.toLowerCase() === 'california') state = 'CA'
  if (state.toLowerCase() === 'oregon') state = 'OR'
  if (state.toLowerCase() === 'washington') state = 'WA'
  remaining = remaining.replace(stateRegex, '').trim().replace(/,\s*$/, '').trim()
  const parts = remaining.split(',')
  let street = ''
  let city = ''
  if (parts.length > 1) {
    city = parts[parts.length - 1].trim()
    street = parts.slice(0, -1).join(',').trim()
  } else {
    const streetRegex = /\b(street|st|avenue|ave|road|rd|drive|dr|court|ct|lane|ln|way|circle|cir)\b/i
    const match = remaining.match(streetRegex)
    if (match && match.index !== undefined) {
      const cutIdx = match.index + match[0].length
      street = remaining.substring(0, cutIdx).trim()
      city = remaining.substring(cutIdx).trim().replace(/^,\s*/, '').trim()
    } else {
      street = remaining
    }
  }
  return { street, city, state, zip }
}

// New compromise-based client-side NLP parser
export const parseTextFallback = (text: string): ParsedListingData => {
  const doc = nlp(text)
  const normalized = text.toLowerCase()

  // 1. Normalize numbers (e.g. "three dozen" -> "3 dozen")
  doc.numbers().toNumber()
  const cleanText = doc.text()

  const result: ParsedListingData = {
    name: null,
    category: null,
    description: text,
    quantity: 1,
    unit: 'each',
    price_usd: null,
    offers_delivery: false,
    offers_pickup: false,
    delivery_radius_miles: null,
    delivery_zipcodes: [],
    delivery_days: [],
    pickup_days: [],
    delivery_time_of_day: [],
    pickup_time_of_day: [],
    pickup_address: null,
    base_address: null
  }

  // 2. Quantity & Unit extraction
  let qty = 1
  let unit = 'each'
  let foundQtyUnit = false

  const VALID_UNITS: Record<string, string> = {
    dozen: 'dozen', doz: 'dozen', dz: 'dozen',
    bunch: 'bunch', bunches: 'bunch',
    jar: 'jar', jars: 'jar',
    loaf: 'loaf', loaves: 'loaf',
    bag: 'bag', bags: 'bag',
    box: 'box', boxes: 'box',
    basket: 'basket', baskets: 'box',
    flat: 'flat', flats: 'flat',
    pint: 'pint', pints: 'pint',
    lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
    piece: 'each', pieces: 'each',
    packet: 'each', packets: 'each',
    bouquet: 'each', bouquets: 'each',
    set: 'each', sets: 'each'
  }

  // Tokenize text preserving decimals
  const tokens = normalized.split(/[^a-zA-Z0-9$.]+/).filter(Boolean).map(w => w.replace(/\.+$/, ''))

  if (!foundQtyUnit) {
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]
      const cleaned = token.replace(/[^0-9.]/g, '')
      if (!cleaned || cleaned === '.') continue
      const valNum = parseFloat(cleaned)
      if (isNaN(valNum)) continue

      if (i < tokens.length - 1) {
        const nextWord = tokens[i + 1]
        if (VALID_UNITS[nextWord]) {
          qty = valNum
          unit = VALID_UNITS[nextWord]
          foundQtyUnit = true
          break
        }
      }
    }
  }

  // If not found via unit suffix, find the first numeric value that is not price, zip, or address
  if (!foundQtyUnit) {
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i]
      const cleaned = token.replace(/[^0-9.]/g, '')
      if (!cleaned || cleaned === '.') continue
      const valNum = parseFloat(cleaned)
      if (isNaN(valNum)) continue

      // Ignore if it's a price (e.g. contains $ or is followed by "dollar")
      if (token.includes('$') || (i < tokens.length - 1 && tokens[i + 1] === 'dollar') || (i < tokens.length - 1 && tokens[i + 1] === 'dollars')) {
        continue
      }
      // Ignore zipcodes (5-digit numbers)
      if (/^\d{5}$/.test(token)) {
        continue
      }
      // Ignore street numbers in addresses
      if (i < tokens.length - 1) {
        const nextWord = tokens[i + 1]
        const streetSuffixes = ['street', 'st', 'avenue', 'ave', 'road', 'rd', 'drive', 'dr', 'court', 'ct', 'lane', 'ln', 'way', 'circle', 'cir', 'broadway', 'highway', 'hwy', 'place', 'pl', 'square', 'sq', 'parkway', 'pkwy']
        if (streetSuffixes.includes(nextWord)) {
          continue
        }
      }

      qty = valNum
      unit = 'each'
      break
    }
  }

  // Fallback to search for unit word if still each
  if (!foundQtyUnit && unit === 'each') {
    const unitWords = ['dozen', 'bunch', 'bunches', 'jar', 'jars', 'loaf', 'loaves', 'bag', 'bags', 'box', 'boxes', 'basket', 'baskets', 'flat', 'flats', 'pint', 'pints', 'lb', 'lbs', 'pound', 'pounds']
    for (const u of unitWords) {
      const regex = new RegExp('\\b' + u + '\\b', 'i')
      if (regex.test(normalized)) {
        unit = VALID_UNITS[u] || 'each'
        break
      }
    }
  }

  // Check if "dozen" is specified without a preceding number as a fallback
  if (!foundQtyUnit && /\b(a\s+)?dozen\b/i.test(normalized) && !/\d+\s+dozen/i.test(normalized)) {
    qty = 12
    unit = 'each'
    foundQtyUnit = true
  }

  // Convert dozen to 12 each
  if (unit === 'dozen') {
    qty = qty * 12
    unit = 'each'
  }

  result.quantity = qty
  result.unit = unit

  // 3. Price extraction
  let price: number | null = null
  
  // Try to find dollar sign first (e.g. $25, $9.99, $ 3)
  const regPrice = cleanText.match(/\$\s*(\d+(?:\.\d{0,2})?)/)
  if (regPrice) {
    price = parseFloat(regPrice[1])
  } else {
    // Try to find value + "dollar(s)" or "usd"
    const valueDollars = doc.match('#Value (dollar|dollars|usd)')
    if (valueDollars.found) {
      const priceStr = valueDollars.match('#Value').first().text().replace(/[^0-9.]/g, '')
      price = parseFloat(priceStr) || null
    } else {
      // Find the last value or a decimal value
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i]
        const cleaned = token.replace(/[^0-9.]/g, '')
        if (!cleaned || cleaned === '.') continue
        const valNum = parseFloat(cleaned)
        if (isNaN(valNum)) continue

        const isDecimal = cleaned.includes('.')
        const isPrecededByPricePrep = i > 0 && (tokens[i - 1] === 'at' || tokens[i - 1] === 'for')
        // Make sure it's not a zip code or a quantity
        if ((isDecimal || isPrecededByPricePrep) && !/^\d{5}$/.test(token) && valNum !== qty) {
          price = valNum
          break
        }
      }
    }
  }
  result.price_usd = price

  // 4. Product Name & Category mapping
  const CATEGORY_TAGS: Record<string, string[]> = {
    seeds: ['seed', 'seeds', 'pod'],
    flowers_specific: ['rose', 'marigold', 'tulip', 'lavender', 'sunflower', 'dahlia', 'orchid', 'geranium'],
    flower_arrangements: ['bouquet', 'arrangement', 'vase'],
    garden_equipment: ['tool', 'tools', 'shovel', 'hose', 'shears', 'rake'],
    soil: ['soil', 'compost', 'mulch', 'dirt'],
    pots: ['pot', 'pots', 'planter', 'container'],
    honey: ['honey', 'comb', 'wildflower', 'honeycomb'],
    eggs: ['egg', 'eggs'],
    flowers_generic: ['flower'],
    produce: ['lemon', 'tomato', 'orange', 'apple', 'lettuce', 'basil', 'mint', 'peach', 'chili', 'onion', 'garlic', 'plum', 'grape', 'fig', 'berry', 'cherry', 'squash', 'herb', 'kale', 'rosemary', 'strawberry', 'cucumbers?', 'carrots?', 'spinach']
  }

  // Helper to clean up the product name
  const cleanProductName = (name: string, keyword: string): string => {
    let cleaned = name.trim()
    // Remove leading numbers and spaces
    cleaned = cleaned.replace(/^[0-9\s]+/, '')
    // Remove leading quantities/units
    cleaned = cleaned.replace(/^(dozen|dz|doz|bags?|jars?|bunches?|lbs?|pounds?|box(es)?|packets?|pieces?|bouquets?|sets?)\s*(of)?\s*/i, '')
    // Remove trailing quantities/units
    cleaned = cleaned.replace(/\b(bouquets?|bunches?)$/i, '')
    // Remove common leading words/adjectives repeatedly
    let prev
    do {
      prev = cleaned
      cleaned = cleaned.replace(/^(a|an|the|fresh|organic|premium|large|small|some|selling|have|red|yellow|white|pink|green|blue|purple|sweet|wild)\s+/i, '')
    } while (cleaned !== prev)
    
    // Strip trailing/leading punctuation & whitespace
    cleaned = cleaned.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, "").trim()
    
    if (!cleaned || cleaned.length < 2) {
      cleaned = keyword
    }
    
    // Title Case
    return cleaned.replace(/\b\w/g, c => c.toUpperCase())
  }

  // Find all matches and their indices
  const matches: Array<{ category: string; keyword: string; index: number }> = []
  for (const [catName, keywords] of Object.entries(CATEGORY_TAGS)) {
    for (const keyword of keywords) {
      const regex = new RegExp('\\b' + keyword + '(s|es)?\\b', 'i')
      const matchInfo = normalized.match(regex)
      if (matchInfo && matchInfo.index !== undefined) {
        matches.push({
          category: catName,
          keyword: keyword,
          index: matchInfo.index
        })
      }
    }
  }

  // Sort matches by their appearance order in the text
  matches.sort((a, b) => a.index - b.index)

  if (matches.length > 0) {
    // Determine category using the priority order defined by CATEGORY_TAGS keys
    const priorityOrder = Object.keys(CATEGORY_TAGS)
    let bestCategoryMatch = matches[0]
    let bestPriority = priorityOrder.length
    for (const m of matches) {
      const prio = priorityOrder.indexOf(m.category)
      if (prio < bestPriority) {
        bestPriority = prio
        bestCategoryMatch = m
      }
    }
    
    // Map internal category name to public category name
    let finalCategory = bestCategoryMatch.category
    if (finalCategory === 'flowers_specific' || finalCategory === 'flowers_generic') {
      finalCategory = 'flowers'
    }
    result.category = finalCategory

    // Filter out generic keywords for primary keyword selection (only if there are other, more specific keywords)
    const GENERIC_KEYWORDS = new Set(['bouquet', 'arrangement', 'vase', 'pot', 'pots', 'planter', 'container', 'packet', 'packets', 'bag', 'bags', 'jar', 'jars', 'tool', 'tools', 'shovel', 'hose', 'shears', 'rake', 'compost', 'mulch', 'dirt', 'flower'])
    
    let primaryMatch = matches[0]
    if (matches.length > 1 && GENERIC_KEYWORDS.has(primaryMatch.keyword)) {
      // Find the first non-generic match
      const nonGeneric = matches.find(m => !GENERIC_KEYWORDS.has(m.keyword))
      if (nonGeneric) {
        primaryMatch = nonGeneric
      }
    }
    const keyword = primaryMatch.keyword

    // Tokenize text to find surrounding words
    const words = normalized.split(/[^a-zA-Z0-9']+/).filter(Boolean)
    const keywordIdx = words.findIndex(w => w.includes(keyword))

    const nameWords: string[] = []
    if (keywordIdx !== -1) {
      nameWords.push(words[keywordIdx])

      // Excluded words list
      const EXCLUDED_WORDS = new Set([
        'i', 'have', 'selling', 'for', 'at', 'with', 'only', 'no', 'will', 'deliver', 'pickup', 'on', 'in', 'to', 'my', 'our', 'your', 'the', 'a', 'an', 'of', 'and', 'is', 'are', 'by', 'from', 'within', 'miles', 'mile', 'radius', 'each', 'total', 'per', 'piece', 'pieces', 'anytime', 'weekends', 'weekdays', 'saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'morning', 'afternoon', 'evening', 'night', 'here', 'there', 'we', 'you', 'me', 'us', 'them'
      ])

      // Expand left
      let leftIdx = keywordIdx - 1
      while (leftIdx >= 0) {
        const w = words[leftIdx]
        if (EXCLUDED_WORDS.has(w) || /^\d+$/.test(w)) {
          break
        }
        nameWords.unshift(w)
        leftIdx--
      }

      // Expand right
      let rightIdx = keywordIdx + 1
      while (rightIdx < words.length) {
        const w = words[rightIdx]
        if (EXCLUDED_WORDS.has(w) || /^\d+$/.test(w)) {
          break
        }
        nameWords.push(w)
        rightIdx++
      }
    }

    const rawName = nameWords.length > 0 ? nameWords.join(' ') : keyword
    result.name = cleanProductName(rawName, keyword)
  } else {
    // Fallback if no keywords matched
    const firstNoun = doc.nouns().first().text()
    result.name = firstNoun ? cleanProductName(firstNoun, 'Fresh Produce') : 'Fresh Produce'
    result.category = 'produce'
  }

  // 5. Physical Address extraction
  const addrRegex = /\b(\d+)\s+([a-zA-Z0-9']+\s+){0,4}\b(street|st|avenue|ave|road|rd|drive|dr|court|ct|lane|ln|way|circle|cir|broadway|highway|hwy|place|pl|square|sq|parkway|pkwy)\b/i
  const addressMatch = normalized.match(addrRegex)
  if (addressMatch) {
    let matchedText = text.substring(addressMatch.index!)
    // Clean up leading radius/mile patterns (only whole words to avoid mission/mint)
    matchedText = matchedText.replace(/^\d+\s*(miles?|mi)\b\s*(of)?\s*/i, '')
    
    // Cut off at prepositions or clause boundaries
    const cutRegex = /\b(on|at|within|for|will|no|during|from|deliver|pickup|pick|collect|to)\b/i
    const matchCut = matchedText.match(cutRegex)
    if (matchCut && matchCut.index !== undefined && matchCut.index > 0) {
      matchedText = matchedText.substring(0, matchCut.index).trim()
    }
    const stopIdx = matchedText.search(/[.!?\r\n]/)
    if (stopIdx !== -1) {
      matchedText = matchedText.substring(0, stopIdx).trim()
    }

    const resolvedAddr = decomposeAddress(matchedText)
    const isPickupContext = doc.has('(pickup|pick up|collect|from)')
    if (isPickupContext) {
      result.pickup_address = resolvedAddr
      result.offers_pickup = true
    } else {
      result.base_address = resolvedAddr
      result.offers_delivery = true
    }
  }

  // 6. Zipcodes & Radius extraction
  const zipcodesList: string[] = []
  const valObjs = doc.match('#Value').json() as any[]
  valObjs.forEach((o: any) => {
    const txt = (o.text || '').trim()
    if (/^\b\d{5}\b$/.test(txt)) {
      zipcodesList.push(txt)
    }
  })
  if (zipcodesList.length > 0) result.delivery_zipcodes = zipcodesList

  const radiusMatch = doc.match('#Value (mile|miles|mi)')
  if (radiusMatch.found) {
    const valText = radiusMatch.match('#Value').first().text()
    result.delivery_radius_miles = parseInt(valText.replace(/[^0-9]/g, '')) || null
  }

  // 7. Days & Times extraction
  const daysOfWeek = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  const weekdayMatch = /(weekday|weekdays|mon-fri|monday-friday|mon to fri)/i.test(normalized)
  const weekendMatch = /(weekend|weekends|sat-sun|saturday-sunday|sat to sun)/i.test(normalized)
  const everydayMatch = /(everyday|every day|daily|all week)/i.test(normalized)

  if (everydayMatch) {
    if (normalized.includes('deliver') || !normalized.includes('pickup')) result.delivery_days = [...daysOfWeek]
    if (normalized.includes('pickup') || normalized.includes('pick up') || !normalized.includes('deliver')) result.pickup_days = [...daysOfWeek]
  } else {
    daysOfWeek.forEach(day => {
      if (normalized.includes(day)) {
        if (normalized.includes('deliver') || !normalized.includes('pickup')) result.delivery_days.push(day)
        if (normalized.includes('pickup') || normalized.includes('pick up') || !normalized.includes('deliver')) result.pickup_days.push(day)
      }
    })

    if (weekendMatch) {
      const weekendDays = ['saturday', 'sunday']
      weekendDays.forEach(day => {
        if (!result.delivery_days.includes(day) && (normalized.includes('deliver') || !normalized.includes('pickup'))) {
          result.delivery_days.push(day)
        }
        if (!result.pickup_days.includes(day) && (normalized.includes('pickup') || normalized.includes('pick up') || !normalized.includes('deliver'))) {
          result.pickup_days.push(day)
        }
      })
    }
    if (weekdayMatch) {
      const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday']
      weekdays.forEach(day => {
        if (!result.delivery_days.includes(day) && (normalized.includes('deliver') || !normalized.includes('pickup'))) {
          result.delivery_days.push(day)
        }
        if (!result.pickup_days.includes(day) && (normalized.includes('pickup') || normalized.includes('pick up') || !normalized.includes('deliver'))) {
          result.pickup_days.push(day)
        }
      })
    }
  }

  // Scan for explicit hours to infer categories
  const timeRegex = /\b(\d{1,2})(?::\d{2})?\s*(am|pm)\b/gi
  const inferredTimes = new Set<string>()
  let timeMatch: RegExpExecArray | null
  while ((timeMatch = timeRegex.exec(normalized)) !== null) {
    let hour = parseInt(timeMatch[1])
    const meridian = timeMatch[2].toLowerCase()
    if (meridian === 'pm' && hour < 12) hour += 12
    if (meridian === 'am' && hour === 12) hour = 0
    if (hour >= 8 && hour < 12) inferredTimes.add('morning')
    else if (hour >= 12 && hour < 17) inferredTimes.add('afternoon')
    else if (hour >= 17 && hour < 21) inferredTimes.add('evening')
  }

  // Also handle range patterns like "between 1 and 3 pm"
  const rangeMatch = normalized.match(/\b(?:between|from)\s+(\d{1,2})\s+(?:and|to|-)\s+(\d{1,2})\s*(am|pm)\b/i)
  if (rangeMatch) {
    const meridian = rangeMatch[3].toLowerCase()
    let h1 = parseInt(rangeMatch[1])
    let h2 = parseInt(rangeMatch[2])
    if (meridian === 'pm') {
      if (h1 < 12) h1 += 12
      if (h2 < 12) h2 += 12
    } else {
      if (h1 === 12) h1 = 0
      if (h2 === 12) h2 = 0
    }
    const hours = [h1, h2]
    hours.forEach(hour => {
      if (hour >= 8 && hour < 12) inferredTimes.add('morning')
      else if (hour >= 12 && hour < 17) inferredTimes.add('afternoon')
      else if (hour >= 17 && hour < 21) inferredTimes.add('evening')
    })
  }

  const times = ['morning', 'afternoon', 'evening', 'night']
  times.forEach(t => {
    if (normalized.includes(t) || inferredTimes.has(t)) {
      if (normalized.includes('deliver') || !normalized.includes('pickup')) {
        const cat = t === 'night' ? 'evening' : t
        if (!result.delivery_time_of_day.includes(cat)) result.delivery_time_of_day.push(cat)
      }
      if (normalized.includes('pickup') || normalized.includes('pick up') || !normalized.includes('deliver')) {
        const cat = t === 'night' ? 'evening' : t
        if (!result.pickup_time_of_day.includes(cat)) result.pickup_time_of_day.push(cat)
      }
    }
  })

  // Defaults for offers_delivery and offers_pickup
  if (!normalized.includes('deliver') && !normalized.includes('pickup') && !normalized.includes('pick up')) {
    result.offers_pickup = true
    result.offers_delivery = true
  } else {
    if (normalized.includes('deliver')) result.offers_delivery = true
    if (normalized.includes('pickup') || normalized.includes('pick up')) result.offers_pickup = true

    // Explicit negations/exclusions
    if (normalized.includes('no pickup') || normalized.includes('no pick up') || normalized.includes('delivery only') || normalized.includes('deliver only')) {
      result.offers_pickup = false
    }
    if (normalized.includes('no delivery') || normalized.includes('no deliver') || normalized.includes('pickup only') || normalized.includes('pick up only') || normalized.includes('pickup at') || normalized.includes('pick up at')) {
      result.offers_delivery = false
    }
  }

  return result
}
