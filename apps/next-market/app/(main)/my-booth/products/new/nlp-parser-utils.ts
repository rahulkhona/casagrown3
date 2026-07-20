let nlpInstance: any = null
const getNlp = () => {
  if (!nlpInstance) {
    const winkNLP = require('wink-nlp')
    const model = require('wink-eng-lite-web-model')
    nlpInstance = winkNLP(model)
  }
  return nlpInstance
}

const numberWords: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, a: 1, an: 1
}

const parseNumericValue = (text: string): number | null => {
  const cleaned = text.trim().toLowerCase()
  if (numberWords[cleaned] !== undefined) {
    return numberWords[cleaned]
  }
  const val = parseFloat(cleaned.replace(/[^0-9.]/g, ''))
  return isNaN(val) ? null : val
}
const getLevenshteinDistance = (a: string, b: string): number => {
  const matrix: number[][] = []
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          Math.min(
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          )
        )
      }
    }
  }
  return matrix[b.length][a.length]
}

const hasFuzzyMatch = (clause: string, target: string): boolean => {
  const daysSet = new Set(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'])
  const words = clause.toLowerCase().split(/[^a-z]+/)
  return words.some(w => {
    if (w === target) return true
    if (w.replace(/s$/, '') === target) return true
    if (daysSet.has(w) || daysSet.has(w.replace(/s$/, ''))) return false
    const dist = getLevenshteinDistance(w, target)
    const limit = target.length > 5 ? 2 : 1
    return dist <= limit
  })
}
const PARSER_VOCABULARY = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun',
  'weekday', 'weekdays', 'weekend', 'weekends',
  'morning', 'afternoon', 'evening', 'night',
  'dozen', 'dz', 'doz', 'bag', 'bags', 'jar', 'jars', 'bunch', 'bunches',
  'lb', 'lbs', 'pound', 'pounds', 'box', 'boxes', 'packet', 'packets',
  'piece', 'pieces', 'bouquet', 'bouquets', 'set', 'sets',
  'seed', 'seeds', 'pod', 'rose', 'marigold', 'tulip', 'lavender', 'sunflower', 'dahlia', 'orchid', 'geranium',
  'bouquet', 'arrangement', 'vase', 'tool', 'tools', 'shovel', 'hose', 'shears', 'rake',
  'soil', 'compost', 'mulch', 'dirt', 'pot', 'pots', 'planter', 'container',
  'honey', 'comb', 'wildflower', 'honeycomb', 'egg', 'eggs', 'flower',
  'lemon', 'tomato', 'orange', 'apple', 'lettuce', 'basil', 'mint', 'peach', 'chili', 'onion', 'garlic', 'plum', 'grape', 'fig', 'berry', 'cherry', 'squash', 'herb', 'kale', 'rosemary', 'strawberry', 'cucumber', 'cucumbers', 'carrot', 'carrots', 'spinach', 'potato', 'potatoes', 'plant', 'plants'
]

const spellCorrectText = (text: string): string => {
  const words = text.split(/(\b[a-zA-Z]+\b)/)
  let wordCount = 0
  const corrected = words.map(w => {
    if (!/^[a-zA-Z]+$/.test(w)) return w
    
    const isFirstWord = (wordCount === 0)
    wordCount++
    
    const isCapitalized = (w.charAt(0) === w.charAt(0).toUpperCase())
    const lower = w.toLowerCase()

    if (lower === 'house' || lower === 'home') return w
    if (PARSER_VOCABULARY.includes(lower)) return w
    
    // Correctly check if singular forms exist in vocabulary (handling -s and -es)
    if (lower.endsWith('s')) {
      const w1 = lower.slice(0, -1)
      const w2 = lower.slice(0, -2)
      if (PARSER_VOCABULARY.includes(w1) || PARSER_VOCABULARY.includes(w2)) {
        return w
      }
    }
    
    if (isCapitalized && !isFirstWord) {
      return w
    }

    let bestWord = w
    let bestDist = Infinity
    for (const vocabWord of PARSER_VOCABULARY) {
      if (Math.abs(lower.length - vocabWord.length) > 2) continue
      const dist = getLevenshteinDistance(lower, vocabWord)
      if (dist < bestDist) {
        bestDist = dist
        bestWord = vocabWord
      }
    }
    const limit = w.length > 5 ? 2 : (w.length >= 4 ? 1 : 0)
    if (bestDist <= limit) {
      if (isCapitalized && isFirstWord) {
        const allowedStart = new Set(['pickup', 'deliver', 'selling', 'have', 'we', 'you', 'please', 'i', 'saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun', 'everyday', 'daily'])
        if (!allowedStart.has(bestWord)) {
          return w
        }
      }
      return isCapitalized
        ? bestWord.charAt(0).toUpperCase() + bestWord.slice(1)
        : bestWord
    }
    return w
  })
  return corrected.join('')
}

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
  delivery_time_slots: string[]
  pickup_time_slots: string[]
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
  const spellCorrected = spellCorrectText(text)
  const preprocessed = spellCorrected
    .replace(/(\d+)([a-zA-Z]+)/g, '$1 $2')
    .replace(/\b(st|ave|rd|dr|ln|ct|pl|sq|blvd|hwy|apt|ste)\.(?!\s*(?:on|at|within|for|will|no|during|from|deliver|delivery|pickup|pick|collect|to|between|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun|weekday|weekend|weekdays|weekends|i|we|you|they|he|she|it|please|our|your|the|a|an)\b)/gi, '$1')
  const nlpInstance = getNlp()
  const its = nlpInstance.its
  const doc = nlpInstance.readDoc(preprocessed)
  const normalized = preprocessed.toLowerCase()
  const cleanText = doc.out()

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
    delivery_time_slots: [],
    pickup_time_slots: [],
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
      const valNum = parseNumericValue(token)
      if (valNum === null || isNaN(valNum)) continue

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
      const valNum = parseNumericValue(token)
      if (valNum === null || isNaN(valNum)) continue

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

  // Convert dozen to 12 each unless priced per dozen
  if (unit === 'dozen') {
    const isPricedPerDozen = /per\s+dozen/i.test(normalized) || /\/dozen/i.test(normalized) || /\/doz/i.test(normalized) || /\/dz/i.test(normalized)
    if (!isPricedPerDozen) {
      qty = qty * 12
      unit = 'each'
    }
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
    const tokensList = doc.tokens().out(its.normal)
    const posList = doc.tokens().out(its.pos)
    let foundPrice = false
    for (let i = 0; i < tokensList.length - 1; i++) {
      if (posList[i] === 'NUM' || numberWords[tokensList[i]] !== undefined) {
        const nextWord = tokensList[i + 1]
        if (nextWord === 'dollar' || nextWord === 'dollars' || nextWord === 'usd') {
          const val = parseNumericValue(doc.tokens().itemAt(i).out(its.value))
          if (val !== null) {
            price = val
            foundPrice = true
            break
          }
        }
      }
    }

    if (!foundPrice) {
      // Find the last value or a decimal value
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i]
        const valNum = parseNumericValue(token)
        if (valNum === null || isNaN(valNum)) continue

        const isDecimal = token.includes('.')
        const isPrecededByPricePrep = i > 0 && (tokens[i - 1] === 'at' || tokens[i - 1] === 'for')
        
        // Make sure it's not a street address number
        let isAddressNum = false
        const streetSuffixes = ['street', 'st', 'avenue', 'ave', 'road', 'rd', 'drive', 'dr', 'court', 'ct', 'lane', 'ln', 'way', 'circle', 'cir', 'broadway', 'highway', 'hwy', 'place', 'pl', 'square', 'sq', 'parkway', 'pkwy']
        if (i < tokens.length - 1 && streetSuffixes.includes(tokens[i + 1])) {
          isAddressNum = true
        }
        if (i < tokens.length - 2 && streetSuffixes.includes(tokens[i + 2])) {
          isAddressNum = true
        }

        // Make sure it's not a zip code, quantity, or address number
        if ((isDecimal || isPrecededByPricePrep) && !/^\d{5}$/.test(token) && valNum !== qty && !isAddressNum) {
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

  const ALL_CATEGORY_KEYWORDS = new Set(Object.values(CATEGORY_TAGS).flat().map(k => k.replace(/[?*+()\[\]\\^$|{}]/g, '')))

  const findFuzzyKeywordMatch = (text: string, keyword: string): { index: number; matchedWord: string } | null => {
    const regex = /[a-zA-Z]+/g
    let match
    while ((match = regex.exec(text)) !== null) {
      const word = match[0].toLowerCase()
      const wordIndex = match.index
      if (word === 'house' || word === 'home') {
        continue
      }
      if (word === keyword || word.replace(/s$/, '') === keyword) {
        return { index: wordIndex, matchedWord: match[0] }
      }
      
      // If the word matches another valid category keyword exactly, do not fuzzy match it to this one
      if (ALL_CATEGORY_KEYWORDS.has(word) || ALL_CATEGORY_KEYWORDS.has(word.replace(/s$/, ''))) {
        continue
      }

      const dist = getLevenshteinDistance(word, keyword)
      const limit = keyword.length > 5 ? 2 : 1
      if (dist <= limit) {
        return { index: wordIndex, matchedWord: match[0] }
      }
    }
    return null
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

  // Find all matches and their indices (including fuzzy matches for typos)
  const matches: Array<{ category: string; keyword: string; index: number }> = []
  for (const [catName, keywords] of Object.entries(CATEGORY_TAGS)) {
    for (const keyword of keywords) {
      const fuzzyMatch = findFuzzyKeywordMatch(normalized, keyword)
      if (fuzzyMatch) {
        matches.push({
          category: catName,
          keyword: keyword,
          index: fuzzyMatch.index
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
    const unitNouns = new Set(['lbs', 'lb', 'pound', 'pounds', 'dozen', 'doz', 'dz', 'box', 'boxes', 'bag', 'bags', 'jar', 'jars', 'bunch', 'bunches', 'loaf', 'loaves', 'basket', 'baskets', 'flat', 'flats', 'pint', 'pints', 'piece', 'pieces', 'packet', 'packets', 'bouquet', 'bouquets', 'set', 'sets', 'dollar', 'dollars'])
    const nouns = doc.tokens().filter((t: any) => {
      const pos = t.out(its.pos)
      const val = t.out(its.normal)
      return (pos === 'NOUN' || pos === 'PROPN') && !unitNouns.has(val)
    })
    const firstNoun = nouns.length() > 0 ? nouns.itemAt(0).out(its.value) : null
    result.name = firstNoun ? cleanProductName(firstNoun, 'Fresh Produce') : 'Fresh Produce'
    result.category = 'produce'
  }

  // 5. Physical Address extraction
  const addrRegex = /\b(\d+)\s+(?!(?:am|pm|a|p)\b)([a-zA-Z0-9']+\s+){0,4}\b(street|st|avenue|ave|road|rd|drive|dr|court|ct|lane|ln|way|circle|cir|broadway|highway|hwy|place|pl|square|sq|parkway|pkwy)\b/i
  const addressMatch = normalized.match(addrRegex)
  if (addressMatch) {
    let matchedText = preprocessed.substring(addressMatch.index!)
    // Clean up leading radius/mile patterns (only whole words to avoid mission/mint)
    matchedText = matchedText.replace(/^\d+\s*(miles?|mi)\b\s*(of)?\s*/i, '')
    
    // Cut off at prepositions or clause boundaries
    const cutRegex = /\b(on|at|within|for|will|no|during|from|deliver|delivery|pickup|pick|collect|to|between|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun|weekday|weekend|weekdays|weekends)\b/i
    const matchCut = matchedText.match(cutRegex)
    if (matchCut && matchCut.index !== undefined && matchCut.index > 0) {
      matchedText = matchedText.substring(0, matchCut.index).trim()
    }
    const stopIdx = matchedText.search(/[.!?\r\n]/)
    if (stopIdx !== -1) {
      matchedText = matchedText.substring(0, stopIdx).trim()
    }

    const resolvedAddr = decomposeAddress(matchedText)
    const isPickupContext = /(pickup|pick\s*(?:[a-zA-Z'-]+\s*){0,2}up|collect|from)/i.test(normalized)
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
  const zipMatches = normalized.match(/\b\d{5}\b/g)
  if (zipMatches) {
    zipMatches.forEach((z) => {
      if (!zipcodesList.includes(z)) {
        zipcodesList.push(z)
      }
    })
  }
  if (zipcodesList.length > 0) result.delivery_zipcodes = zipcodesList

  const tokensList = doc.tokens().out(its.normal)
  const posList = doc.tokens().out(its.pos)
  for (let i = 0; i < tokensList.length - 1; i++) {
    if (posList[i] === 'NUM' || numberWords[tokensList[i]] !== undefined) {
      const nextWord = tokensList[i + 1].replace(/\.+$/, '')
      if (nextWord === 'mile' || nextWord === 'miles' || nextWord === 'mi') {
        const val = parseNumericValue(doc.tokens().itemAt(i).out(its.value))
        if (val !== null) {
          result.delivery_radius_miles = val
          break
        }
      }
    }
  }

  // 7. Days & Times extraction (Clause-based context routing)
  const daysOfWeek = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  const dayAbbrevs: Record<string, string> = {
    mon: 'monday', tue: 'tuesday', wed: 'wednesday', thu: 'thursday', fri: 'friday', sat: 'saturday', sun: 'sunday'
  }
  const clauses = normalized.split(/\s*(?:\b(?:or|but|otherwise|whereas|while|although)\b|;|[.,!?\r\n]|\s+-\s+(?!\s*\d+)|(?<!\d)\s*\/\s*(?!\d)|\band\b(?=\s*(?:you\s+can\s+)?(?:deliver|pickup|pick\s+up|collect|drop|from)))\s*/i).filter(Boolean)

  let currentContext = { isDelivery: true, isPickup: true }

  clauses.forEach(clause => {
    // Identify clause context
    let isDelivery = /(deliver|drop off|drop-off|ship|send)/i.test(clause)
    let isPickup = /(pickup|pick\s*(?:[a-zA-Z'-]+\s*){0,2}up|collect|at my house|my home)/i.test(clause)
    
    if (isDelivery || isPickup) {
      currentContext = { isDelivery, isPickup }
    } else {
      isDelivery = currentContext.isDelivery
      isPickup = currentContext.isPickup
    }

    // Extract days from this clause
    const clauseDays: string[] = []
    const everydayMatch = /(everyday|every day|daily|all week)/i.test(clause)
    const weekendMatch = /(weekend|weekends|sat-sun|saturday-sunday|sat to sun)/i.test(clause)
    const weekdayMatch = /(weekday|weekdays|mon-fri|monday-friday|mon to fri)/i.test(clause)

    if (everydayMatch) {
      clauseDays.push(...daysOfWeek)
    } else {
      daysOfWeek.forEach(day => {
        if (hasFuzzyMatch(clause, day)) {
          clauseDays.push(day)
        }
      })
      Object.entries(dayAbbrevs).forEach(([abbrev, fullDay]) => {
        const regex = new RegExp('\\b' + abbrev + '\\b', 'i')
        if (regex.test(clause)) {
          if (!clauseDays.includes(fullDay)) clauseDays.push(fullDay)
        }
      })
      if (weekendMatch) {
        ['saturday', 'sunday'].forEach(day => {
          if (!clauseDays.includes(day)) clauseDays.push(day)
        })
      }
      if (weekdayMatch) {
        ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'].forEach(day => {
          if (!clauseDays.includes(day)) clauseDays.push(day)
        })
      }
    }

    if (isDelivery) {
      clauseDays.forEach(d => {
        if (!result.delivery_days.includes(d)) result.delivery_days.push(d)
      })
    }
    if (isPickup) {
      clauseDays.forEach(d => {
        if (!result.pickup_days.includes(d)) result.pickup_days.push(d)
      })
    }

    // Extract time categories & slots from this clause
    const clauseInferredTimes = new Set<string>()
    const clauseExplicitSlots: string[] = []

    const timeRegex = /\b(\d{1,2})(?::\d{2})?\s*(am|pm|a|p)\b/gi
    let timeMatch: RegExpExecArray | null
    while ((timeMatch = timeRegex.exec(clause)) !== null) {
      let hour = parseInt(timeMatch[1])
      const meridian = timeMatch[2].toLowerCase()
      if (meridian === 'p' || meridian === 'a') {
        const matchIndex = timeMatch.index
        const precedingText = clause.substring(Math.max(0, matchIndex - 10), matchIndex)
        const hasPreposition = /\b(at|around|by|from|to)\s*$/i.test(precedingText)
        if (!hasPreposition) {
          continue
        }
      }
      let actualHour = hour
      if ((meridian === 'pm' || meridian === 'p') && hour < 12) actualHour += 12
      if ((meridian === 'am' || meridian === 'a') && hour === 12) actualHour = 0
      
      if (actualHour >= 8 && actualHour < 12) clauseInferredTimes.add('morning')
      else if (actualHour >= 12 && actualHour < 17) clauseInferredTimes.add('afternoon')
      else if (actualHour >= 17 && actualHour < 21) clauseInferredTimes.add('evening')
      
      clauseExplicitSlots.push(`${actualHour}-${actualHour + 1}`)
    }

    const timeOfDayTimeRegex = /\b(\d{1,2})\s*(?:o'clock)?\s*in\s*the\s*(morning|afternoon|evening|night)\b/gi
    let todtMatch: RegExpExecArray | null
    while ((todtMatch = timeOfDayTimeRegex.exec(clause)) !== null) {
      let hour = parseInt(todtMatch[1])
      const period = todtMatch[2].toLowerCase()
      let actualHour = hour
      if ((period === 'afternoon' || period === 'evening' || period === 'night') && hour < 12) {
        actualHour += 12
      }
      if (period === 'morning' && hour === 12) {
        actualHour = 0
      }
      clauseExplicitSlots.push(`${actualHour}-${actualHour + 1}`)
    }

    const rangeMatch = clause.match(/\b(?:between|from\s+)?(\d{1,2})\s*(am|pm|a|p)?\s*(?:and|to|-|&)\s*(\d{1,2})\s*(am|pm|a|p)?\b/i)
    const clauseRangeSlots: string[] = []
    if (rangeMatch) {
      let h1 = parseInt(rangeMatch[1])
      const meridian1 = rangeMatch[2] ? rangeMatch[2].toLowerCase() : null
      let h2 = parseInt(rangeMatch[3])
      let meridian2 = rangeMatch[4] ? rangeMatch[4].toLowerCase() : null
      
      // If second meridian is missing, infer from clause context
      if (!meridian2) {
        if (/(afternoon|evening|night|\bpm\b|\bp\b)/i.test(clause)) {
          meridian2 = 'pm'
        } else {
          meridian2 = 'am'
        }
      }
      
      if (meridian1) {
        if ((meridian1 === 'pm' || meridian1 === 'p') && h1 < 12) h1 += 12
        if ((meridian1 === 'am' || meridian1 === 'a') && h1 === 12) h1 = 0
      } else {
        // Fallback: use meridian 2 if meridian 1 is not specified
        // But if h2 is 12 and meridian2 is pm, do NOT default a smaller h1 to pm (since 10 to 12pm means 10am to 12pm)
        // Also if h1 > h2 and meridian2 is pm, do NOT default to pm (since 10 to 1pm means 10am to 1pm)
        if ((h2 === 12 && (meridian2 === 'pm' || meridian2 === 'p')) || (h1 > h2 && (meridian2 === 'pm' || meridian2 === 'p'))) {
          // Keep h1 as AM
        } else {
          if ((meridian2 === 'pm' || meridian2 === 'p') && h1 < 12) h1 += 12
          if ((meridian2 === 'am' || meridian2 === 'a') && h1 === 12) h1 = 0
        }
      }
      
      if ((meridian2 === 'pm' || meridian2 === 'p') && h2 < 12) h2 += 12
      if ((meridian2 === 'am' || meridian2 === 'a') && h2 === 12) {
        if (h1 >= 12) {
          h2 = 24 // 12 AM as midnight
        } else {
          h2 = 12 // 12 AM as noon
        }
      }
      
      const start = Math.min(h1, h2)
      const end = Math.max(h1, h2)
      for (let h = start; h < end; h++) {
        clauseRangeSlots.push(`${h}-${h + 1}`)
        if (h >= 8 && h < 12) clauseInferredTimes.add('morning')
        else if (h >= 12 && h < 17) clauseInferredTimes.add('afternoon')
        else if (h >= 17 && h < 21) clauseInferredTimes.add('evening')
      }
    }

    const resolvedSlots = clauseRangeSlots.length > 0 ? clauseRangeSlots : clauseExplicitSlots
    if (resolvedSlots.length > 0) {
      if (isDelivery) {
        resolvedSlots.forEach(s => {
          if (!result.delivery_time_slots.includes(s)) result.delivery_time_slots.push(s)
        })
      }
      if (isPickup) {
        resolvedSlots.forEach(s => {
          if (!result.pickup_time_slots.includes(s)) result.pickup_time_slots.push(s)
        })
      }
    }

    const times = ['morning', 'afternoon', 'evening', 'night']
    times.forEach(t => {
      if (hasFuzzyMatch(clause, t) || clauseInferredTimes.has(t)) {
        const cat = t === 'night' ? 'evening' : t
        if (isDelivery && !result.delivery_time_of_day.includes(cat)) {
          result.delivery_time_of_day.push(cat)
        }
        if (isPickup && !result.pickup_time_of_day.includes(cat)) {
          result.pickup_time_of_day.push(cat)
        }
      }
    })
  })

  // Defaults for offers_delivery and offers_pickup
  const hasDelivery = /(deliver|drop off|drop-off|ship|send)/i.test(normalized)
  const hasPickup = /(pickup|pick\s*(?:[a-zA-Z'-]+\s*){0,2}up|collect)/i.test(normalized)

  if (!hasDelivery && !hasPickup) {
    result.offers_pickup = true
    result.offers_delivery = true
  } else {
    result.offers_delivery = hasDelivery
    result.offers_pickup = hasPickup

    // Explicit negations/exclusions
    const dayTimeFollowPattern = `(?!\\s+(?:on|during|for|in|at)?\\s*(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|weekend|weekday|mon|tue|wed|thu|fri|sat|sun|daily|everyday|weekdays|weekends))`
    
    const noPickupRegex = new RegExp(
      `(?:\\bno\\s+pickup\\b|\\bno\\s+pick\\s+up\\b|\\bno\\s+pick-up\\b|\\bno\\s+collect[a-z]*\\b|\\bpickup\\s+not\\s+available\\b|\\bpick\\s+up\\s+not\\s+available\\b|\\bdelivery\\s+only\\b|\\bdeliver\\s+only\\b|\\bdrop-off\\s+only\\b|\\bdrop\\s+off\\s+only\\b)${dayTimeFollowPattern}`,
      'i'
    )
    
    const noDeliveryRegex = new RegExp(
      `(?:\\bno\\s+delivery\\b|\\bno\\s+deliver\\b|\\bno\\s+drop\\s+off\\b|\\bno\\s+drop-off\\b|\\bno\\s+shipping\\b|\\bno\\s+ship\\b|\\bpickup\\s+only\\b|\\bpick\\s+up\\s+only\\b|\\bpick-up\\s+only\\b|\\bcollect\\s+only\\b|\\bdelivery\\s+not\\s+available\\b|\\bdeliver\\s+not\\s+available\\b|\\bdo\\s+not\\s+deliver\\b)${dayTimeFollowPattern}`,
      'i'
    )
    
    if (noPickupRegex.test(normalized)) {
      result.offers_pickup = false
    }
    if (noDeliveryRegex.test(normalized)) {
      result.offers_delivery = false
    }
  }

  // Clear fields if fulfillment type is disabled
  if (!result.offers_delivery) {
    result.delivery_days = []
    result.delivery_time_slots = []
    result.delivery_time_of_day = []
    result.delivery_radius_miles = null
    result.delivery_zipcodes = []
  } else {
    // If times are specified but no days are matched, default delivery to everyday
    if (result.delivery_days.length === 0 && (result.delivery_time_slots.length > 0 || result.delivery_time_of_day.length > 0)) {
      result.delivery_days = [...daysOfWeek]
    }
  }

  if (!result.offers_pickup) {
    result.pickup_days = []
    result.pickup_time_slots = []
    result.pickup_time_of_day = []
    result.pickup_address = null
  } else {
    // If times are specified but no days are matched, default pickup to everyday
    if (result.pickup_days.length === 0 && (result.pickup_time_slots.length > 0 || result.pickup_time_of_day.length > 0)) {
      result.pickup_days = [...daysOfWeek]
    }
  }

  return result
}
