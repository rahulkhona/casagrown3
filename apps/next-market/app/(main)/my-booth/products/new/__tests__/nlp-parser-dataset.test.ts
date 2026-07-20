import { describe, it, expect } from 'vitest'
import { parseTextFallback } from '../nlp-parser-utils'

interface TestCase {
  input: string
  expected: {
    name?: string | null
    category?: string | null
    price_usd?: number | null
    quantity?: number
    unit?: string
    offers_delivery?: boolean
    offers_pickup?: boolean
    delivery_radius_miles?: number | null
    delivery_zipcodes?: string[]
    delivery_days?: string[]
    pickup_days?: string[]
    delivery_time_of_day?: string[]
    pickup_time_of_day?: string[]
    base_address?: string | null
    pickup_address?: string | null
  }
}

const testCases: TestCase[] = [
  // 1-10: Basic name, quantity, unit, price variations
  {
    input: "I have 5 dozen apples for $10",
    expected: { name: "Apples", category: "produce", quantity: 60, unit: "each", price_usd: 10 }
  },
  {
    input: "Selling 10 lbs of potatoes for 15 dollars",
    expected: { name: "Potatoes", category: "produce", quantity: 10, unit: "lb", price_usd: 15 }
  },
  {
    input: "3 bunches of organic kale at $4.50 per bunch",
    expected: { name: "Kale", category: "produce", quantity: 3, unit: "bunch", price_usd: 4.5 }
  },
  {
    input: "1 jar of honey for $8",
    expected: { name: "Honey", category: "honey", quantity: 1, unit: "jar", price_usd: 8 }
  },
  {
    input: "fresh rosemary 2 bunches at $3",
    expected: { name: "Rosemary", category: "produce", quantity: 2, unit: "bunch", price_usd: 3 }
  },
  {
    input: "dozen eggs for five dollars",
    expected: { name: "Eggs", category: "eggs", quantity: 12, unit: "each", price_usd: 5 }
  },
  {
    input: "2 boxes of strawberries for 12.50",
    expected: { name: "Strawberries", category: "produce", quantity: 2, unit: "box", price_usd: 12.5 }
  },
  {
    input: "organic wildflower honey 3 jars at 9.99",
    expected: { name: "Wildflower Honey", category: "honey", quantity: 3, unit: "jar", price_usd: 9.99 }
  },
  {
    input: "5 bags of potting soil, $15 each",
    expected: { name: "Potting Soil", category: "soil", quantity: 5, unit: "bag", price_usd: 15 }
  },
  {
    input: "one large bouquet of sunflowers, 25 dollars",
    expected: { name: "Sunflowers", category: "flowers", quantity: 1, unit: "each", price_usd: 25 }
  },

  // 11-20: Categories
  {
    input: "selling 3 tomato plants in pots",
    expected: { category: "pots" }
  },
  {
    input: "fresh mint leaves, 1 bunch for $2",
    expected: { name: "Mint Leaves", category: "produce", quantity: 1, unit: "bunch", price_usd: 2 }
  },
  {
    input: "organic compost soil 2 bags for 20$",
    expected: { name: "Compost Soil", category: "soil", quantity: 2, unit: "bag", price_usd: 20 }
  },
  {
    input: "flower arrangement for 35",
    expected: { category: "flower_arrangements" }
  },
  {
    input: "10 seed packets of marigolds for 1.50 each",
    expected: { name: "Seed Packets", category: "seeds", quantity: 10, unit: "each", price_usd: 1.5 }
  },
  {
    input: "shovels and garden tools",
    expected: { category: "garden_equipment" }
  },
  {
    input: "red roses, 1 dozen for $24",
    expected: { name: "Roses", category: "flowers", quantity: 12, unit: "each", price_usd: 24 }
  },
  {
    input: "sweet peaches, 5 lbs, $12",
    expected: { name: "Peaches", category: "produce", quantity: 5, unit: "lb", price_usd: 12 }
  },
  {
    input: "fresh garlic bulbs 10 pieces for $6",
    expected: { name: "Garlic Bulbs", category: "produce", quantity: 10, unit: "each", price_usd: 6 }
  },
  {
    input: "honeycomb jar for $12",
    expected: { name: "Honeycomb Jar", category: "honey", quantity: 1, unit: "jar", price_usd: 12 }
  },

  // 21-40: Delivery & Pickup flags
  {
    input: "deliver within 5 miles",
    expected: { offers_delivery: true, offers_pickup: false, delivery_radius_miles: 5 }
  },
  {
    input: "pickup only at my house",
    expected: { offers_delivery: false, offers_pickup: true }
  },
  {
    input: "will deliver up to 10 mi radius",
    expected: { offers_delivery: true, offers_pickup: false, delivery_radius_miles: 10 }
  },
  {
    input: "available for pickup or delivery",
    expected: { offers_delivery: true, offers_pickup: true }
  },
  {
    input: "no delivery, pickup from 123 Main St",
    expected: { offers_delivery: false, offers_pickup: true, pickup_address: "123 Main St" }
  },
  {
    input: "deliver to 95125 only",
    expected: { offers_delivery: true, offers_pickup: false }
  },
  {
    input: "free delivery within 3 miles",
    expected: { offers_delivery: true, offers_pickup: false, delivery_radius_miles: 3 }
  },
  {
    input: "will ship or drop off within 8 mi",
    expected: { offers_delivery: true, delivery_radius_miles: 8 }
  },
  {
    input: "come pick up from 555 Broadway Ave",
    expected: { offers_pickup: true, pickup_address: "555 Broadway Ave" }
  },
  {
    input: "delivery within 15 mile radius of 94043",
    expected: { offers_delivery: true, delivery_radius_miles: 15 }
  },
  {
    input: "pickup at 777 Post St, San Francisco",
    expected: { offers_pickup: true, pickup_address: "777 Post St" }
  },
  {
    input: "I can deliver or you can pick up",
    expected: { offers_delivery: true, offers_pickup: true }
  },
  {
    input: "deliver only",
    expected: { offers_delivery: true, offers_pickup: false }
  },
  {
    input: "pick up only",
    expected: { offers_delivery: false, offers_pickup: true }
  },
  {
    input: "delivery is available for $5 extra",
    expected: { offers_delivery: true }
  },
  {
    input: "collect from my home",
    expected: { offers_pickup: true }
  },
  {
    input: "deliver within 4 miles of 123 Maple St",
    expected: { offers_delivery: true, delivery_radius_miles: 4 }
  },
  {
    input: "meet at 456 Oak Ave for pickup",
    expected: { offers_pickup: true, pickup_address: "456 Oak Ave" }
  },
  {
    input: "will drop off up to 6 miles away",
    expected: { offers_delivery: true, delivery_radius_miles: 6 }
  },
  {
    input: "no pickup, delivery only",
    expected: { offers_delivery: true, offers_pickup: false }
  },

  // 41-60: Days and Times
  {
    input: "deliver on weekends",
    expected: { delivery_days: ["saturday", "sunday"] }
  },
  {
    input: "deliver on weekdays",
    expected: { delivery_days: ["monday", "tuesday", "wednesday", "thursday", "friday"] }
  },
  {
    input: "pickup on sunday afternoon",
    expected: { pickup_days: ["sunday"], pickup_time_of_day: ["afternoon"] }
  },
  {
    input: "deliver monday morning",
    expected: { delivery_days: ["monday"], delivery_time_of_day: ["morning"] }
  },
  {
    input: "deliver wednesday evening",
    expected: { delivery_days: ["wednesday"], delivery_time_of_day: ["evening"] }
  },
  {
    input: "pickup saturday morning or sunday evening",
    expected: { pickup_days: ["saturday", "sunday"], pickup_time_of_day: ["morning", "evening"] }
  },
  {
    input: "deliver mon-fri afternoons",
    expected: { delivery_days: ["monday", "tuesday", "wednesday", "thursday", "friday"], delivery_time_of_day: ["afternoon"] }
  },
  {
    input: "pickup on tuesday and thursday night",
    expected: { pickup_days: ["tuesday", "thursday"], pickup_time_of_day: ["evening"] }
  },
  {
    input: "deliver on sat-sun mornings",
    expected: { delivery_days: ["saturday", "sunday"], delivery_time_of_day: ["morning"] }
  },
  {
    input: "pickup everyday morning",
    expected: { pickup_days: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"], pickup_time_of_day: ["morning"] }
  },
  {
    input: "deliver tuesday afternoon",
    expected: { delivery_days: ["tuesday"], delivery_time_of_day: ["afternoon"] }
  },
  {
    input: "pickup friday night",
    expected: { pickup_days: ["friday"], pickup_time_of_day: ["evening"] }
  },
  {
    input: "deliver thursday morning",
    expected: { delivery_days: ["thursday"], delivery_time_of_day: ["morning"] }
  },
  {
    input: "pickup wednesday afternoon",
    expected: { pickup_days: ["wednesday"], pickup_time_of_day: ["afternoon"] }
  },
  {
    input: "deliver monday evening",
    expected: { delivery_days: ["monday"], delivery_time_of_day: ["evening"] }
  },
  {
    input: "pickup tuesday morning",
    expected: { pickup_days: ["tuesday"], pickup_time_of_day: ["morning"] }
  },
  {
    input: "deliver friday afternoon",
    expected: { delivery_days: ["friday"], delivery_time_of_day: ["afternoon"] }
  },
  {
    input: "pickup saturday evening",
    expected: { pickup_days: ["saturday"], pickup_time_of_day: ["evening"] }
  },
  {
    input: "deliver sunday morning",
    expected: { delivery_days: ["sunday"], delivery_time_of_day: ["morning"] }
  },
  {
    input: "pickup Thursday afternoon",
    expected: { pickup_days: ["thursday"], pickup_time_of_day: ["afternoon"] }
  },

  // 61-80: Addresses and Zipcodes
  {
    input: "deliver to 95125, 95112, and 95110",
    expected: { delivery_zipcodes: ["95125", "95112", "95110"] }
  },
  {
    input: "base address is 100 Main St, San Jose, CA 95112",
    expected: { base_address: "100 Main St" }
  },
  {
    input: "pickup from 200 Park Ave, San Jose, CA 95113",
    expected: { pickup_address: "200 Park Ave" }
  },
  {
    input: "deliver in 94040, 94041",
    expected: { delivery_zipcodes: ["94040", "94041"] }
  },
  {
    input: "my house is at 300 Elm St, Seattle, WA 98101",
    expected: { base_address: "300 Elm St" }
  },
  {
    input: "pickup address: 400 Pine St, Seattle, WA 98101",
    expected: { pickup_address: "400 Pine St" }
  },
  {
    input: "deliver within 5 miles of 500 Market St, San Francisco, CA 94105",
    expected: { base_address: "500 Market St", delivery_radius_miles: 5 }
  },
  {
    input: "pickup point is 600 Mission St, San Francisco, CA 94105",
    expected: { pickup_address: "600 Mission St" }
  },
  {
    input: "deliver to 90210, 90211, 90212",
    expected: { delivery_zipcodes: ["90210", "90211", "90212"] }
  },
  {
    input: "farm stand located at 700 Broadway, New York, NY 10003",
    expected: { base_address: "700 Broadway" }
  },
  {
    input: "please pick up at 800 Fifth Ave, New York, NY 10021",
    expected: { pickup_address: "800 Fifth Ave" }
  },
  {
    input: "we deliver to 98101, 98102",
    expected: { delivery_zipcodes: ["98101", "98102"] }
  },
  {
    input: "come to 900 Oak St, Oakland, CA 94607",
    expected: { base_address: "900 Oak St" }
  },
  {
    input: "pickup here: 1000 Grand Ave, Oakland, CA 94610",
    expected: { pickup_address: "1000 Grand Ave" }
  },
  {
    input: "will deliver to 95050, 95051",
    expected: { delivery_zipcodes: ["95050", "95051"] }
  },
  {
    input: "farm at 1100 Lincoln Ave, San Jose, CA 95125",
    expected: { base_address: "1100 Lincoln Ave" }
  },
  {
    input: "pickup at 1200 Taylor St, San Francisco, CA 94108",
    expected: { pickup_address: "1200 Taylor St" }
  },
  {
    input: "serving 94102, 94103, 94104",
    expected: { delivery_zipcodes: ["94102", "94103", "94104"] }
  },
  {
    input: "base: 1300 Sutter St, San Francisco, CA 94109",
    expected: { base_address: "1300 Sutter St" }
  },
  {
    input: "pickup: 1400 Post St, San Francisco, CA 94109",
    expected: { pickup_address: "1400 Post St" }
  },

  // 81-100: Complex multi-variable statements
  {
    input: "I have 10 dozen oranges at $1 per piece. I will deliver on weekends within 2 miles of my house.",
    expected: {
      name: "Oranges",
      category: "produce",
      quantity: 120,
      unit: "each",
      price_usd: 1,
      offers_delivery: true,
      delivery_radius_miles: 2,
      delivery_days: ["saturday", "sunday"]
    }
  },
  {
    input: "Selling 3 bags of premium compost for $15 per bag. Pick up only on Saturday morning from 123 Main St.",
    expected: {
      name: "Compost",
      category: "soil",
      quantity: 3,
      unit: "bag",
      price_usd: 15,
      offers_pickup: true,
      offers_delivery: false,
      pickup_address: "123 Main St",
      pickup_days: ["saturday"],
      pickup_time_of_day: ["morning"]
    }
  },
  {
    input: "Fresh lavender bouquets, 5 bunches for 20 dollars total. Deliver on weekdays within 5 miles.",
    expected: {
      name: "Lavender",
      category: "flowers",
      quantity: 5,
      unit: "bunch",
      price_usd: 20,
      offers_delivery: true,
      delivery_radius_miles: 5,
      delivery_days: ["monday", "tuesday", "wednesday", "thursday", "friday"]
    }
  },
  {
    input: "2 dozen fresh eggs for 6 dollars. Pickup at 456 Oak Avenue on Sunday afternoon.",
    expected: {
      name: "Eggs",
      category: "eggs",
      quantity: 24,
      unit: "each",
      price_usd: 6,
      offers_pickup: true,
      pickup_address: "456 Oak Avenue",
      pickup_days: ["sunday"],
      pickup_time_of_day: ["afternoon"]
    }
  },
  {
    input: "I have 10 tomato plants in pots for 8 dollars each. No delivery, pickup only at 789 Pine St.",
    expected: {
      name: "Tomato Plants",
      category: "pots",
      quantity: 10,
      unit: "each",
      price_usd: 8,
      offers_pickup: true,
      offers_delivery: false,
      pickup_address: "789 Pine St"
    }
  },
  {
    input: "10 lbs of potatoes at $1.50 per lb. Will deliver on Wednesday evening to 95125.",
    expected: {
      name: "Potatoes",
      category: "produce",
      quantity: 10,
      unit: "lb",
      price_usd: 1.5,
      offers_delivery: true,
      delivery_days: ["wednesday"],
      delivery_time_of_day: ["evening"],
      delivery_zipcodes: ["95125"]
    }
  },
  {
    input: "3 jars of organic honey for $25. Pickup anytime on weekends.",
    expected: {
      name: "Honey",
      category: "honey",
      quantity: 3,
      unit: "jar",
      price_usd: 25,
      offers_pickup: true,
      pickup_days: ["saturday", "sunday"]
    }
  },
  {
    input: "flower arrangement for $45. Deliver on Monday morning within 10 miles of 123 Broadway.",
    expected: {
      category: "flower_arrangements",
      price_usd: 45,
      offers_delivery: true,
      delivery_days: ["monday"],
      delivery_time_of_day: ["morning"],
      delivery_radius_miles: 10,
      base_address: "123 Broadway"
    }
  },
  {
    input: "Selling 50 seed packets of sunflowers for $1 each. Will deliver to 94043.",
    expected: {
      name: "Seed Packets",
      category: "seeds",
      quantity: 50,
      unit: "each",
      price_usd: 1,
      offers_delivery: true,
      delivery_zipcodes: ["94043"]
    }
  },
  {
    input: "fresh mint 5 bunches for $5. Pickup at 555 Market St on Friday night.",
    expected: {
      name: "Mint",
      category: "produce",
      quantity: 5,
      unit: "bunch",
      price_usd: 5,
      offers_pickup: true,
      pickup_address: "555 Market St",
      pickup_days: ["friday"],
      pickup_time_of_day: ["evening"]
    }
  },
  {
    input: "2 bags of potting soil for $10. Delivery on Tuesday morning.",
    expected: {
      name: "Potting Soil",
      category: "soil",
      quantity: 2,
      unit: "bag",
      price_usd: 10,
      offers_delivery: true,
      delivery_days: ["tuesday"],
      delivery_time_of_day: ["morning"]
    }
  },
  {
    input: "1 dozen roses for $30. Pickup on Sunday morning at 888 Pine St.",
    expected: {
      name: "Roses",
      category: "flowers",
      quantity: 12,
      unit: "each",
      price_usd: 30,
      offers_pickup: true,
      pickup_address: "888 Pine St",
      pickup_days: ["sunday"],
      pickup_time_of_day: ["morning"]
    }
  },
  {
    input: "fresh peaches 10 lbs for $20. Deliver on Thursday afternoon.",
    expected: {
      name: "Peaches",
      category: "produce",
      quantity: 10,
      unit: "lb",
      price_usd: 20,
      offers_delivery: true,
      delivery_days: ["thursday"],
      delivery_time_of_day: ["afternoon"]
    }
  },
  {
    input: "5 jars of wildflower honey for $40. Pickup Saturday afternoon.",
    expected: {
      name: "Wildflower Honey",
      category: "honey",
      quantity: 5,
      unit: "jar",
      price_usd: 40,
      offers_pickup: true,
      pickup_days: ["saturday"],
      pickup_time_of_day: ["afternoon"]
    }
  },
  {
    input: "100 flower pots for $50. No delivery, pickup only.",
    expected: {
      name: "Flower Pots",
      category: "pots",
      quantity: 100,
      unit: "each",
      price_usd: 50,
      offers_pickup: true,
      offers_delivery: false
    }
  },
  {
    input: "garden tools set for $100. Deliver on Wednesday morning within 15 miles.",
    expected: {
      category: "garden_equipment",
      price_usd: 100,
      offers_delivery: true,
      delivery_days: ["wednesday"],
      delivery_time_of_day: ["morning"],
      delivery_radius_miles: 15
    }
  },
  {
    input: "3 dozen eggs for $15. Pickup Tuesday evening at 999 Elm St.",
    expected: {
      name: "Eggs",
      category: "eggs",
      quantity: 36,
      unit: "each",
      price_usd: 15,
      offers_pickup: true,
      pickup_address: "999 Elm St",
      pickup_days: ["tuesday"],
      pickup_time_of_day: ["evening"]
    }
  },
  {
    input: "fresh organic basil 4 bunches for $8. Deliver on weekdays.",
    expected: {
      name: "Basil",
      category: "produce",
      quantity: 4,
      unit: "bunch",
      price_usd: 8,
      offers_delivery: true,
      delivery_days: ["monday", "tuesday", "wednesday", "thursday", "friday"]
    }
  },
  {
    input: "wildflower honey, 1 jar for $12. Pickup on weekends at 100 Oak St.",
    expected: {
      name: "Wildflower Honey",
      category: "honey",
      quantity: 1,
      unit: "jar",
      price_usd: 12,
      offers_pickup: true,
      pickup_address: "100 Oak St",
      pickup_days: ["saturday", "sunday"]
    }
  },
  {
    input: "10 bags of compost for $50. Deliver on Saturday morning to 95112.",
    expected: {
      name: "Compost",
      category: "soil",
      quantity: 10,
      unit: "bag",
      price_usd: 50,
      offers_delivery: true,
      delivery_days: ["saturday"],
      delivery_time_of_day: ["morning"],
      delivery_zipcodes: ["95112"]
    }
  },
  {
    input: "i have 2 dz oranges at $1 per piece. You can pick it up from 978 Wallace Dr. San Jose between 10am and 1pm",
    expected: {
      name: "Oranges",
      category: "produce",
      quantity: 24,
      unit: "each",
      price_usd: 1,
      offers_pickup: true,
      pickup_address: "978 Wallace Dr"
    }
  },
  {
    input: "i have 20dz oranges for $5 per dozen and can deliver in 95120 and 95123 zipcodes on weekend envenings or you can pickup from 970 Wallace Dr. San Jose on weekday evenings.",
    expected: {
      name: "Oranges",
      category: "produce",
      quantity: 20,
      unit: "dozen",
      price_usd: 5,
      offers_delivery: true,
      offers_pickup: true,
      delivery_zipcodes: ["95120", "95123"],
      delivery_time_of_day: ["evening"],
      pickup_time_of_day: ["evening"],
      pickup_address: "970 Wallace Dr"
    }
  },
  {
    input: "555 Market St daily 8a-11a pickup. no delivery.",
    expected: {
      pickup_address: "555 Market St",
      offers_pickup: true,
      offers_delivery: false
    }
  },
  {
    input: "Deliver to Tasman Dr on Saturday",
    expected: {
      category: "produce",
      offers_delivery: true,
      delivery_days: ["saturday"]
    }
  },
  {
    input: "My address is 100 Monroe Rd. pickup daily",
    expected: {
      category: "produce",
      offers_pickup: true,
      pickup_days: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
    }
  },
  {
    input: "I have fresh cherries for $5",
    expected: {
      name: "Cherries",
      category: "produce",
      price_usd: 5
    }
  },
  {
    input: "selling organic berries 2 bags for 10",
    expected: {
      name: "Berries",
      category: "produce",
      quantity: 2,
      unit: "bag",
      price_usd: 10
    }
  },
  {
    input: "Pikcup at 978 Wallace Dr",
    expected: {
      offers_pickup: true,
      pickup_address: "978 Wallace Dr"
    }
  },
  {
    input: "123 Tasman Dr is the pickup location",
    expected: {
      pickup_address: "123 Tasman Dr",
      category: "produce"
    }
  },
  {
    input: "5lbs apples for 10",
    expected: {
      quantity: 5,
      unit: "lb",
      name: "Apples",
      price_usd: 10
    }
  },
  {
    input: "2jars honey for 15",
    expected: {
      quantity: 2,
      unit: "jar",
      name: "Honey",
      price_usd: 15
    }
  },
  {
    input: "hello world, just testing the system",
    expected: {
      category: "produce",
      price_usd: null
    }
  }
]

describe('100 NLP Parser Dataset Verification Tests', () => {
  testCases.forEach((tc, idx) => {
    it(`Case #${idx + 1}: "${tc.input}"`, () => {
      const res = parseTextFallback(tc.input)

      if (tc.expected.name !== undefined) {
        expect(res.name).toBe(tc.expected.name)
      }
      if (tc.expected.category !== undefined) {
        expect(res.category).toBe(tc.expected.category)
      }
      if (tc.expected.price_usd !== undefined) {
        expect(res.price_usd).toBe(tc.expected.price_usd)
      }
      if (tc.expected.quantity !== undefined) {
        expect(res.quantity).toBe(tc.expected.quantity)
      }
      if (tc.expected.unit !== undefined) {
        expect(res.unit).toBe(tc.expected.unit)
      }
      if (tc.expected.offers_delivery !== undefined) {
        expect(res.offers_delivery).toBe(tc.expected.offers_delivery)
      }
      if (tc.expected.offers_pickup !== undefined) {
        expect(res.offers_pickup).toBe(tc.expected.offers_pickup)
      }
      if (tc.expected.delivery_radius_miles !== undefined) {
        expect(res.delivery_radius_miles).toBe(tc.expected.delivery_radius_miles)
      }
      if (tc.expected.delivery_days !== undefined) {
        expect(res.delivery_days).toEqual(expect.arrayContaining(tc.expected.delivery_days))
      }
      if (tc.expected.pickup_days !== undefined) {
        expect(res.pickup_days).toEqual(expect.arrayContaining(tc.expected.pickup_days))
      }
      if (tc.expected.delivery_time_of_day !== undefined) {
        expect(res.delivery_time_of_day).toEqual(expect.arrayContaining(tc.expected.delivery_time_of_day))
      }
      if (tc.expected.pickup_time_of_day !== undefined) {
        expect(res.pickup_time_of_day).toEqual(expect.arrayContaining(tc.expected.pickup_time_of_day))
      }
      if (tc.expected.base_address !== undefined) {
        expect(res.base_address ? res.base_address.street : null).toBe(tc.expected.base_address)
      }
      if (tc.expected.pickup_address !== undefined) {
        expect(res.pickup_address ? res.pickup_address.street : null).toBe(tc.expected.pickup_address)
      }
    })
  })
})

describe('Clause-based Day and Time Parsing Tests (50 Compound Cases)', () => {
  const compoundTestCases = [
    {
      input: "I will deliver on Saturday 1pm-3pm; pickup is Sunday 4pm-6pm",
      expected: {
        delivery_days: ["saturday"],
        pickup_days: ["sunday"],
        delivery_time_slots: ["13-14", "14-15"],
        pickup_time_slots: ["16-17", "17-18"]
      }
    },
    {
      input: "Pickup on weekends between 9am and 12pm, otherwise deliver weekdays 3pm to 5pm",
      expected: {
        delivery_days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
        pickup_days: ["saturday", "sunday"],
        delivery_time_slots: ["15-16", "16-17"],
        pickup_time_slots: ["9-10", "10-11", "11-12"]
      }
    },
    {
      input: "Deliver Wednesday from 2 to 4 pm but pickup must be Tuesday at 10am",
      expected: {
        delivery_days: ["wednesday"],
        pickup_days: ["tuesday"],
        delivery_time_slots: ["14-15", "15-16"],
        pickup_time_slots: ["10-11"]
      }
    },
    {
      input: "Pickup from 123 Main St on Sunday 3-5pm whereas delivery is within 5 miles on Saturday morning",
      expected: {
        delivery_days: ["saturday"],
        pickup_days: ["sunday"],
        delivery_time_of_day: ["morning"],
        pickup_time_slots: ["15-16", "16-17"],
        pickup_address: "123 Main St"
      }
    },
    {
      input: "While we deliver Saturdays 10am-12pm, pickup is only Sunday 1pm-3pm from 456 Elm St",
      expected: {
        delivery_days: ["saturday"],
        pickup_days: ["sunday"],
        delivery_time_slots: ["10-11", "11-12"],
        pickup_time_slots: ["13-14", "14-15"],
        pickup_address: "456 Elm St"
      }
    },
    {
      input: "Deliver Monday at 3pm. No pickup on Monday, only Sunday 4-6pm",
      expected: {
        delivery_days: ["monday"],
        pickup_days: ["sunday"],
        delivery_time_slots: ["15-16"],
        pickup_time_slots: ["16-17", "17-18"]
      }
    },
    {
      input: "We offer delivery on Friday evenings (5pm to 8pm) or pickup on Saturday afternoon",
      expected: {
        delivery_days: ["friday"],
        pickup_days: ["saturday"],
        delivery_time_slots: ["17-18", "18-19", "19-20"],
        pickup_time_of_day: ["afternoon"]
      }
    },
    {
      input: "Pickup Thursday between 10 am and 12 pm - delivery only on Friday 1 pm to 3 pm",
      expected: {
        delivery_days: ["friday"],
        pickup_days: ["thursday"],
        delivery_time_slots: ["13-14", "14-15"],
        pickup_time_slots: ["10-11", "11-12"]
      }
    },
    {
      input: "I have 10 dz oranges at $5 per dozen. Deliver Saturday 8am-10am or pickup Sunday afternoon",
      expected: {
        quantity: 10,
        unit: "dozen",
        delivery_days: ["saturday"],
        pickup_days: ["sunday"],
        delivery_time_slots: ["8-9", "9-10"],
        pickup_time_of_day: ["afternoon"]
      }
    },
    {
      input: "For delivery: Friday 1pm-3pm. For pickup: Sunday 10am-12pm at 789 Pine Rd",
      expected: {
        delivery_days: ["friday"],
        pickup_days: ["sunday"],
        delivery_time_slots: ["13-14", "14-15"],
        pickup_time_slots: ["10-11", "11-12"],
        pickup_address: "789 Pine Rd"
      }
    },
    {
      input: "Deliver weekdays between 4pm and 6pm. Pickup weekends 9am to 11am",
      expected: {
        delivery_days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
        pickup_days: ["saturday", "sunday"],
        delivery_time_slots: ["16-17", "17-18"],
        pickup_time_slots: ["9-10", "10-11"]
      }
    },
    {
      input: "Delivery is daily from 12pm to 2pm, pickup Saturday 9am-11am only",
      expected: {
        delivery_days: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
        pickup_days: ["saturday"],
        delivery_time_slots: ["12-13", "13-14"],
        pickup_time_slots: ["9-10", "10-11"]
      }
    },
    {
      input: "Pickup Saturday between 8am and 10am; deliver weekdays between 5pm and 7pm",
      expected: {
        delivery_days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
        pickup_days: ["saturday"],
        delivery_time_slots: ["17-18", "18-19"],
        pickup_time_slots: ["8-9", "9-10"]
      }
    },
    {
      input: "Deliver to 95125 on weekends; pickup from 500 Market St on weekdays",
      expected: {
        delivery_days: ["saturday", "sunday"],
        pickup_days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
        pickup_address: "500 Market St"
      }
    },
    {
      input: "Deliver Saturday 9am-11am but do not deliver on Sunday (pickup only Sunday 1pm-3pm)",
      expected: {
        delivery_days: ["saturday"],
        pickup_days: ["sunday"],
        delivery_time_slots: ["9-10", "10-11"],
        pickup_time_slots: ["13-14", "14-15"]
      }
    },
    {
      input: "I deliver within 10 miles on Saturday from 2pm to 4pm, otherwise you can pickup Sunday 10a to 12p",
      expected: {
        delivery_days: ["saturday"],
        pickup_days: ["sunday"],
        delivery_time_slots: ["14-15", "15-16"],
        pickup_time_slots: ["10-11", "11-12"]
      }
    },
    {
      input: "Pickup is Monday 10am-12pm. We deliver on Tuesday 2pm-4pm.",
      expected: {
        delivery_days: ["tuesday"],
        pickup_days: ["monday"],
        delivery_time_slots: ["14-15", "15-16"],
        pickup_time_slots: ["10-11", "11-12"]
      }
    },
    {
      input: "Delivery on Friday morning (8am to 11am) or pickup Saturday evening (6pm to 8pm)",
      expected: {
        delivery_days: ["friday"],
        pickup_days: ["saturday"],
        delivery_time_slots: ["8-9", "9-10", "10-11"],
        pickup_time_slots: ["18-19", "19-20"]
      }
    },
    {
      input: "Deliver to San Jose on Saturday between 3pm and 5pm or pickup Sunday 4pm-6pm",
      expected: {
        delivery_days: ["saturday"],
        pickup_days: ["sunday"],
        delivery_time_slots: ["15-16", "16-17"],
        pickup_time_slots: ["16-17", "17-18"]
      }
    },
    {
      input: "Pickup Tuesday 9am-11am. Deliver Wednesday 1pm-3pm.",
      expected: {
        delivery_days: ["wednesday"],
        pickup_days: ["tuesday"],
        delivery_time_slots: ["13-14", "14-15"],
        pickup_time_slots: ["9-10", "10-11"]
      }
    },
    {
      input: "Delivery: daily 5pm to 7pm. Pickup: weekends 10am to 12pm.",
      expected: {
        delivery_days: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
        pickup_days: ["saturday", "sunday"],
        delivery_time_slots: ["17-18", "18-19"],
        pickup_time_slots: ["10-11", "11-12"]
      }
    },
    {
      input: "Deliver to 95112 on Saturday morning, pickup from 100 Main St on Sunday afternoon",
      expected: {
        delivery_days: ["saturday"],
        pickup_days: ["sunday"],
        delivery_time_of_day: ["morning"],
        pickup_time_of_day: ["afternoon"],
        pickup_address: "100 Main St"
      }
    },
    {
      input: "Deliver Friday between 1pm and 3pm. Pickup Saturday between 10am and 12pm.",
      expected: {
        delivery_days: ["friday"],
        pickup_days: ["saturday"],
        delivery_time_slots: ["13-14", "14-15"],
        pickup_time_slots: ["10-11", "11-12"]
      }
    },
    {
      input: "Delivery weekdays 3p to 5p; pickup weekends 9a to 11a",
      expected: {
        delivery_days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
        pickup_days: ["saturday", "sunday"],
        delivery_time_slots: ["15-16", "16-17"],
        pickup_time_slots: ["9-10", "10-11"]
      }
    },
    {
      input: "Deliver on Saturday between 2 and 4 pm or pickup on Sunday between 1 and 3 pm",
      expected: {
        delivery_days: ["saturday"],
        pickup_days: ["sunday"],
        delivery_time_slots: ["14-15", "15-16"],
        pickup_time_slots: ["13-14", "14-15"]
      }
    },
    {
      input: "Pickup is Saturday 10am-12pm. No delivery on weekends, only weekdays 4pm-6pm.",
      expected: {
        delivery_days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
        pickup_days: ["saturday"],
        delivery_time_slots: ["16-17", "17-18"],
        pickup_time_slots: ["10-11", "11-12"]
      }
    },
    {
      input: "Deliver Friday afternoon; pickup Saturday morning",
      expected: {
        delivery_days: ["friday"],
        pickup_days: ["saturday"],
        delivery_time_of_day: ["afternoon"],
        pickup_time_of_day: ["morning"]
      }
    },
    {
      input: "Deliver Saturday 1pm-3pm. Pickup Sunday 2pm-4pm.",
      expected: {
        delivery_days: ["saturday"],
        pickup_days: ["sunday"],
        delivery_time_slots: ["13-14", "14-15"],
        pickup_time_slots: ["14-15", "15-16"]
      }
    },
    {
      input: "Delivery on Tuesday between 9am and 11am, and pickup on Thursday between 3pm and 5pm",
      expected: {
        delivery_days: ["tuesday"],
        pickup_days: ["thursday"],
        delivery_time_slots: ["9-10", "10-11"],
        pickup_time_slots: ["15-16", "16-17"]
      }
    },
    {
      input: "Deliver Wednesday 4pm-6pm. Pickup Thursday 9am-11am at my home address.",
      expected: {
        delivery_days: ["wednesday"],
        pickup_days: ["thursday"],
        delivery_time_slots: ["16-17", "17-18"],
        pickup_time_slots: ["9-10", "10-11"]
      }
    },
    {
      input: "Delivery Monday afternoon (3pm to 5pm) but pickup Tuesday morning (10am to 12pm)",
      expected: {
        delivery_days: ["monday"],
        pickup_days: ["tuesday"],
        delivery_time_slots: ["15-16", "16-17"],
        pickup_time_slots: ["10-11", "11-12"]
      }
    },
    {
      input: "Pickup weekends 9am-11am; deliver weekdays 4pm-6pm",
      expected: {
        delivery_days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
        pickup_days: ["saturday", "sunday"],
        delivery_time_slots: ["16-17", "17-18"],
        pickup_time_slots: ["9-10", "10-11"]
      }
    },
    {
      input: "Deliver Saturday morning. Pickup Sunday evening.",
      expected: {
        delivery_days: ["saturday"],
        pickup_days: ["sunday"],
        delivery_time_of_day: ["morning"],
        pickup_time_of_day: ["evening"]
      }
    },
    {
      input: "Delivery Friday 2pm-4pm. Pickup Saturday 10am-12pm.",
      expected: {
        delivery_days: ["friday"],
        pickup_days: ["saturday"],
        delivery_time_slots: ["14-15", "15-16"],
        pickup_time_slots: ["10-11", "11-12"]
      }
    },
    {
      input: "Deliver Tuesday 1pm-3pm or pickup Thursday 3pm-5pm",
      expected: {
        delivery_days: ["tuesday"],
        pickup_days: ["thursday"],
        delivery_time_slots: ["13-14", "14-15"],
        pickup_time_slots: ["15-16", "16-17"]
      }
    },
    {
      input: "Deliver on Wednesday between 2pm and 4pm. Pickup Sunday between 10am and 12pm.",
      expected: {
        delivery_days: ["wednesday"],
        pickup_days: ["sunday"],
        delivery_time_slots: ["14-15", "15-16"],
        pickup_time_slots: ["10-11", "11-12"]
      }
    },
    {
      input: "Delivery is weekdays 5pm to 7pm, pickup is Saturday 8am to 10am",
      expected: {
        delivery_days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
        pickup_days: ["saturday"],
        delivery_time_slots: ["17-18", "18-19"],
        pickup_time_slots: ["8-9", "9-10"]
      }
    },
    {
      input: "Deliver Saturday 9am-12pm; pickup Sunday 1pm-4pm",
      expected: {
        delivery_days: ["saturday"],
        pickup_days: ["sunday"],
        delivery_time_slots: ["9-10", "10-11", "11-12"],
        pickup_time_slots: ["13-14", "14-15", "15-16"]
      }
    },
    {
      input: "Delivery on weekends between 10am and 1pm. Pickup on weekdays between 2pm and 5pm.",
      expected: {
        delivery_days: ["saturday", "sunday"],
        pickup_days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
        delivery_time_slots: ["10-11", "11-12", "12-13"],
        pickup_time_slots: ["14-15", "15-16", "16-17"]
      }
    },
    {
      input: "Deliver Thursday morning (9am to 11am). Pickup Friday afternoon (2pm to 4pm).",
      expected: {
        delivery_days: ["thursday"],
        pickup_days: ["friday"],
        delivery_time_slots: ["9-10", "10-11"],
        pickup_time_slots: ["14-15", "15-16"]
      }
    },
    {
      input: "Delivery Monday 4pm-6pm or pickup Wednesday 10am-12pm",
      expected: {
        delivery_days: ["monday"],
        pickup_days: ["wednesday"],
        delivery_time_slots: ["16-17", "17-18"],
        pickup_time_slots: ["10-11", "11-12"]
      }
    },
    {
      input: "Deliver Saturday 8am-10am, pickup Sunday 4pm-6pm",
      expected: {
        delivery_days: ["saturday"],
        pickup_days: ["sunday"],
        delivery_time_slots: ["8-9", "9-10"],
        pickup_time_slots: ["16-17", "17-18"]
      }
    },
    {
      input: "Delivery: Wednesday 1pm-3pm. Pickup: Thursday 10am-12pm.",
      expected: {
        delivery_days: ["wednesday"],
        pickup_days: ["thursday"],
        delivery_time_slots: ["13-14", "14-15"],
        pickup_time_slots: ["10-11", "11-12"]
      }
    },
    {
      input: "Deliver Monday 3pm-5pm. Pickup Tuesday 9am-11am.",
      expected: {
        delivery_days: ["monday"],
        pickup_days: ["tuesday"],
        delivery_time_slots: ["15-16", "16-17"],
        pickup_time_slots: ["9-10", "10-11"]
      }
    },
    {
      input: "Deliver Thursday 1pm to 3pm. Pickup Saturday 10am to 12pm.",
      expected: {
        delivery_days: ["thursday"],
        pickup_days: ["saturday"],
        delivery_time_slots: ["13-14", "14-15"],
        pickup_time_slots: ["10-11", "11-12"]
      }
    },
    {
      input: "Deliver Friday 4pm-6pm, pickup Saturday 9am-11am",
      expected: {
        delivery_days: ["friday"],
        pickup_days: ["saturday"],
        delivery_time_slots: ["16-17", "17-18"],
        pickup_time_slots: ["9-10", "10-11"]
      }
    },
    {
      input: "Delivery on Tuesday between 3pm and 5pm. Pickup on Wednesday between 9am and 11am.",
      expected: {
        delivery_days: ["tuesday"],
        pickup_days: ["wednesday"],
        delivery_time_slots: ["15-16", "16-17"],
        pickup_time_slots: ["9-10", "10-11"]
      }
    },
    {
      input: "Deliver Saturday 10am-12pm. Pickup Sunday 2pm-4pm.",
      expected: {
        delivery_days: ["saturday"],
        pickup_days: ["sunday"],
        delivery_time_slots: ["10-11", "11-12"],
        pickup_time_slots: ["14-15", "15-16"]
      }
    },
    {
      input: "Delivery: Friday 5pm-7pm. Pickup: Saturday 10am-12pm.",
      expected: {
        delivery_days: ["friday"],
        pickup_days: ["saturday"],
        delivery_time_slots: ["17-18", "18-19"],
        pickup_time_slots: ["10-11", "11-12"]
      }
    },
    {
      input: "Deliver Monday 1pm-3pm, pickup Wednesday 9am-11am",
      expected: {
        delivery_days: ["monday"],
        pickup_days: ["wednesday"],
        delivery_time_slots: ["13-14", "14-15"],
        pickup_time_slots: ["9-10", "10-11"]
      }
    }
  ]

  compoundTestCases.forEach((tc, idx) => {
    it(`Compound Case #${idx + 1}: "${tc.input}"`, () => {
      const res = parseTextFallback(tc.input)

      if (tc.expected.quantity !== undefined) {
        expect(res.quantity).toBe(tc.expected.quantity)
      }
      if (tc.expected.unit !== undefined) {
        expect(res.unit).toBe(tc.expected.unit)
      }
      if (tc.expected.delivery_days !== undefined) {
        expect(res.delivery_days).toEqual(expect.arrayContaining(tc.expected.delivery_days))
      }
      if (tc.expected.pickup_days !== undefined) {
        expect(res.pickup_days).toEqual(expect.arrayContaining(tc.expected.pickup_days))
      }
      if (tc.expected.delivery_time_of_day !== undefined) {
        expect(res.delivery_time_of_day).toEqual(expect.arrayContaining(tc.expected.delivery_time_of_day))
      }
      if (tc.expected.pickup_time_of_day !== undefined) {
        expect(res.pickup_time_of_day).toEqual(expect.arrayContaining(tc.expected.pickup_time_of_day))
      }
      if (tc.expected.delivery_time_slots !== undefined) {
        expect(res.delivery_time_slots).toEqual(expect.arrayContaining(tc.expected.delivery_time_slots))
      }
      if (tc.expected.pickup_time_slots !== undefined) {
        expect(res.pickup_time_slots).toEqual(expect.arrayContaining(tc.expected.pickup_time_slots))
      }
      if (tc.expected.pickup_address !== undefined) {
        expect(res.pickup_address ? res.pickup_address.street : null).toBe(tc.expected.pickup_address)
      }
    })
  })
})

describe('NLP Parser - Invariance Suite (10 Use Cases x 20 Variations = 200 Test Cases)', () => {
  const suites = [
    {
      name: "Use Case A: Delivery Friday 2-4pm, Pickup Saturday 9-11am",
      expected: {
        offers_delivery: true,
        offers_pickup: true,
        delivery_days: ["friday"],
        pickup_days: ["saturday"],
        delivery_time_slots: ["14-15", "15-16"],
        pickup_time_slots: ["9-10", "10-11"]
      },
      variations: [
        "Deliver Friday 2pm-4pm. Pickup Saturday 9am-11am.",
        "Pickup on Saturday between 9 and 11 am or I can deliver Friday from 2 to 4 pm.",
        "friday delivery between 2pm & 4pm. pickup saturdays 9am to 11am",
        "i'll drop off on fri between 2pm-4pm, otherwise you can collect sat 9am-11am",
        "Delivery: Fri 2-4 PM / Pickup: Sat 9-11 AM",
        "we deliver friday afternoons (2pm-4pm); pickup saturday mornings (9am-11am)",
        "sat 9a-11a pickup. fri 2p-4p delivery.",
        "deliver Friday 2pm - 4pm but pick-up Saturday 9am - 11am",
        "Friday 2pm-4pm delivery, Saturday 9am-11am pickup",
        "For pickup: Saturday morning 9am to 11am. For delivery: Friday afternoon 2pm to 4pm.",
        "will deliver Fri 2pm to 4pm. Saturday pickup is 9am-11am.",
        "pickup sat 9am-11am, deliver fri 2pm-4pm",
        "I can deliver Friday between 2 and 4pm. You can also pickup Saturday between 9 and 11am.",
        "drop-off: Friday 2p-4p, pick-up: Saturday 9a-11a",
        "fri 2pm to 4pm deliver. sat 9am to 11am pickup.",
        "deliver Fri 2pm-4pm; pickup Saturday 9am-11am",
        "delivery is fri between 2 and 4 in the afternoon. pickup is sat between 9 and 11 in the morning.",
        "I will deliver on Friday from 2pm to 4pm or you can pickup on Saturday from 9am to 11am",
        "pickup Saturday 9am-11am whereas delivery is Friday 2pm-4pm",
        "Delivery: Friday 2pm-4pm\nPickup: Saturday 9am-11am"
      ]
    },
    {
      name: "Use Case B: Delivery weekdays 3pm-5pm to 95125 within 10 miles (Delivery only)",
      expected: {
        offers_delivery: true,
        offers_pickup: false,
        delivery_days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
        pickup_days: [],
        delivery_time_slots: ["15-16", "16-17"],
        pickup_time_slots: [],
        delivery_radius_miles: 10,
        delivery_zipcodes: ["95125"]
      },
      variations: [
        "Deliver to 95125 weekdays 3-5pm within 10 miles. No pickup.",
        "No pickup. Delivery only on weekdays from 3pm to 5pm in 95125 within a 10 mile radius.",
        "deliver weekdays between 3pm & 5pm to 95125. 10 mi radius. no pick-up.",
        "i drop off weekdays 3pm-5pm to 95125. 10 miles radius. no pickup",
        "Delivery only: Mon-Fri 3-5 PM, 10 miles of 95125.",
        "we deliver weekdays (3pm-5pm) to 95125 within 10 miles. no collection.",
        "95125 weekdays 3p-5p delivery within 10 mi. no pickup.",
        "deliver weekdays 3pm - 5pm in 95125 (10 miles radius) - no pickup",
        "Weekdays 3pm-5pm delivery only in 95125, 10 miles radius",
        "For delivery: weekdays 3pm to 5pm to 95125 within 10 miles. No pickup.",
        "will deliver Mon-Fri 3pm to 5pm to 95125. 10 miles. No pickup.",
        "no pickup, deliver weekdays 3pm-5pm to 95125, 10 miles",
        "I can deliver weekdays between 3 and 5pm in 95125 within 10 miles. Pickup not available.",
        "drop-off: weekdays 3p-5p to 95125 (10 mi). no pick-up",
        "weekdays 3pm to 5pm deliver to 95125, 10 miles radius. no pickup.",
        "deliver Mon-Fri 3pm-5pm to 95125; no pickup, 10 miles",
        "delivery is weekdays between 3 and 5 in the afternoon to 95125 within 10 miles. no pickup.",
        "I will deliver on weekdays from 3pm to 5pm to 95125 within 10 miles. No pickup.",
        "no pickup whereas delivery is weekdays 3pm-5pm to 95125 within 10 miles",
        "Delivery only: weekdays 3pm-5pm to 95125\n10 miles radius"
      ]
    },
    {
      name: "Use Case C: Pickup Sunday 12pm-5pm at 123 Main St (Pickup only)",
      expected: {
        offers_delivery: false,
        offers_pickup: true,
        delivery_days: [],
        pickup_days: ["sunday"],
        delivery_time_slots: [],
        pickup_time_slots: ["12-13", "13-14", "14-15", "15-16", "16-17"],
        pickup_address: "123 Main St"
      },
      variations: [
        "Pickup Sunday 12pm-5pm at 123 Main St. No delivery.",
        "No delivery. Pickup only on Sunday from 12pm to 5pm at 123 Main St.",
        "pickup sunday between 12pm & 5pm from 123 Main St. no delivery.",
        "i collect sunday 12pm-5pm at 123 Main St. no drop off",
        "Pickup only: Sun 12-5 PM, 123 Main St.",
        "pickup sunday (12pm-5pm) at 123 Main St. no shipping.",
        "123 Main St Sunday 12p-5p pickup. no delivery.",
        "pick up Sunday 12pm - 5pm from 123 Main St - no delivery",
        "Sunday 12pm-5pm pickup only at 123 Main St",
        "For pickup: Sunday 12pm to 5pm at 123 Main St. No delivery.",
        "will pickup Sun 12pm to 5pm at 123 Main St. No delivery.",
        "no delivery, pickup Sunday 12pm-5pm at 123 Main St",
        "I do not deliver. You can pickup Sunday between 12 and 5pm at 123 Main St.",
        "pick-up: Sunday 12p-5p at 123 Main St. no drop-off",
        "Sunday 12pm to 5pm pickup at 123 Main St. no delivery.",
        "pickup Sunday 12pm-5pm at 123 Main St; no delivery",
        "pickup is Sunday between 12 and 5 in the afternoon at 123 Main St. no delivery.",
        "You can pickup on Sunday from 12pm to 5pm at 123 Main St. No delivery.",
        "no delivery whereas pickup is Sunday 12pm-5pm at 123 Main St",
        "Pickup only: Sunday 12pm-5pm\n123 Main St"
      ]
    },
    {
      name: "Use Case D: Delivery Sat 8-10am, Pickup Sat 5-7pm",
      expected: {
        offers_delivery: true,
        offers_pickup: true,
        delivery_days: ["saturday"],
        pickup_days: ["saturday"],
        delivery_time_slots: ["8-9", "9-10"],
        pickup_time_slots: ["17-18", "18-19"]
      },
      variations: [
        "Deliver Saturday 8am-10am. Pickup Saturday 5pm-7pm.",
        "Pickup on Saturday from 5pm to 7pm or I can deliver Saturday 8am to 10am.",
        "saturday delivery between 8am & 10am. pickup saturday 5pm to 7pm",
        "i'll drop off on sat between 8am-10am, otherwise you can collect sat 5pm-7pm",
        "Delivery: Sat 8-10 AM / Pickup: Sat 5-7 PM",
        "we deliver saturday (8am-10am); pickup saturday (5pm-7pm)",
        "sat 5p-7p pickup. sat 8a-10a delivery.",
        "deliver Saturday 8am - 10am but pick-up Saturday 5pm - 7pm",
        "Saturday 8am-10am delivery, Saturday 5pm-7pm pickup",
        "For pickup: Saturday 5pm to 7pm. For delivery: Saturday 8am to 10am.",
        "will deliver Sat 8am to 10am. Saturday pickup is 5pm-7pm.",
        "pickup sat 5pm-7pm, deliver sat 8am-10am",
        "I can deliver Saturday between 8 and 10am. You can also pickup Saturday between 5 and 7pm.",
        "drop-off: Sat 8a-10a, pick-up: Sat 5p-7p",
        "sat 8am to 10am deliver. sat 5pm to 7pm pickup.",
        "deliver Sat 8am-10am; pickup Sat 5pm-7pm",
        "delivery is sat between 8 and 10 in the morning. pickup is sat between 5 and 7 in the evening.",
        "I will deliver on Saturday from 8am to 10am or you can pickup on Saturday from 5pm to 7pm",
        "pickup Saturday 5pm-7pm whereas delivery is Saturday 8am-10am",
        "Delivery: Saturday 8am-10am\nPickup: Saturday 5pm-7pm"
      ]
    },
    {
      name: "Use Case E: Delivery Mon, Wed, Fri 10am-1pm (Delivery only)",
      expected: {
        offers_delivery: true,
        offers_pickup: false,
        delivery_days: ["monday", "wednesday", "friday"],
        pickup_days: [],
        delivery_time_slots: ["10-11", "11-12", "12-13"],
        pickup_time_slots: []
      },
      variations: [
        "Deliver Mon, Wed, Fri 10am-1pm. No pickup.",
        "No pickup. Delivery only on Mon, Wed, and Fri from 10am to 1pm.",
        "delivery between 10am & 1pm on mon, wed, fri. no pickup.",
        "i drop off mon, wed, and fri between 10am-1pm. no collect",
        "Delivery only: Mon/Wed/Fri 10am-1pm.",
        "we deliver mon, wed, fri (10am-1pm). no pickup.",
        "mon, wed, fri 10a-1p delivery. no pickup.",
        "deliver Mon, Wed, Fri 10am - 1pm - no pickup",
        "Mon, Wed, Fri 10am-1pm delivery only",
        "For delivery: Mon, Wed, Fri 10am to 1pm. No pickup.",
        "will deliver Mon, Wed, Fri 10am to 1pm. No pickup.",
        "no pickup, deliver Mon, Wed, Fri 10am-1pm",
        "I can deliver Mon, Wed, Fri between 10 and 1pm. Pickup not available.",
        "drop-off: Mon, Wed, Fri 10a-1p. no pick-up",
        "Mon, Wed, Fri 10am to 1pm deliver. no pickup.",
        "deliver Mon, Wed, Fri 10am-1pm; no pickup",
        "delivery is mon, wed, fri between 10 and 1 in the afternoon. no pickup.",
        "I will deliver on Mon, Wed, Fri from 10am to 1pm. No pickup.",
        "no pickup whereas delivery is Mon, Wed, Fri 10am-1pm",
        "Delivery only: Mon, Wed, Fri 10am-1pm\nNo pickup"
      ]
    },
    {
      name: "Use Case F: Pickup Thursday at 3pm at 456 Elm Ave (Pickup only)",
      expected: {
        offers_delivery: false,
        offers_pickup: true,
        delivery_days: [],
        pickup_days: ["thursday"],
        delivery_time_slots: [],
        pickup_time_slots: ["15-16"],
        pickup_address: "456 Elm Ave"
      },
      variations: [
        "Pickup Thursday at 3pm at 456 Elm Ave. No delivery.",
        "No delivery. Pickup only on Thursday at 3pm at 456 Elm Ave.",
        "pickup thursday at 3pm from 456 Elm Ave. no delivery.",
        "i collect thursday at 3pm at 456 Elm Ave. no drop off",
        "Pickup only: Thu at 3 PM, 456 Elm Ave.",
        "pickup thursday (at 3pm) at 456 Elm Ave. no shipping.",
        "456 Elm Ave Thursday at 3p pickup. no delivery.",
        "pick up Thursday at 3pm from 456 Elm Ave - no delivery",
        "Thursday at 3pm pickup only at 456 Elm Ave",
        "For pickup: Thursday at 3pm at 456 Elm Ave. No delivery.",
        "will pickup Thu at 3pm at 456 Elm Ave. No delivery.",
        "no delivery, pickup Thursday at 3pm at 456 Elm Ave",
        "I do not deliver. You can pickup Thursday at 3pm at 456 Elm Ave."
      ]
    },
    {
      name: "Use Case G: Delivery Sat 1-3pm to 94043, Pickup Sun 10am-12pm at 789 Pine Rd",
      expected: {
        offers_delivery: true,
        offers_pickup: true,
        delivery_days: ["saturday"],
        pickup_days: ["sunday"],
        delivery_time_slots: ["13-14", "14-15"],
        pickup_time_slots: ["10-11", "11-12"],
        pickup_address: "789 Pine Rd",
        delivery_zipcodes: ["94043"]
      },
      variations: [
        "Deliver Sat 1-3pm to 94043. Pickup Sun 10am-12pm at 789 Pine Rd.",
        "Pickup on Sunday from 10am to 12pm at 789 Pine Rd or I can deliver Saturday 1pm to 3pm to 94043.",
        "saturday delivery between 1pm & 3pm to 94043. pickup sunday 10am to 12pm from 789 Pine Rd",
        "i drop off on sat between 1pm-3pm to 94043, otherwise you collect sun 10am-12pm from 789 Pine Rd",
        "Delivery: Sat 1-3 PM to 94043 / Pickup: Sun 10-12 AM at 789 Pine Rd",
        "we deliver saturday (1pm-3pm) to 94043; pickup sunday (10am-12pm) from 789 Pine Rd",
        "sun 10a-12p pickup at 789 Pine Rd. sat 1p-3p delivery to 94043.",
        "deliver Saturday 1pm - 3pm to 94043 but pick-up Sunday 10am - 12pm at 789 Pine Rd",
        "Saturday 1pm-3pm delivery to 94043, Sunday 10am-12pm pickup at 789 Pine Rd",
        "For pickup: Sunday 10am to 12pm at 789 Pine Rd. For delivery: Saturday 1pm to 3pm to 94043.",
        "will deliver Sat 1pm to 3pm to 94043. Sunday pickup is 10am-12pm at 789 Pine Rd.",
        "pickup Sunday 10am-12pm at 789 Pine Rd, deliver Saturday 1pm-3pm to 94043",
        "I can deliver Saturday between 1 and 3pm to 94043. You can also pickup Sunday between 10 and 12pm at 789 Pine Rd.",
        "drop-off: Sat 1p-3p to 94043, pick-up: Sun 10a-12p at 789 Pine Rd",
        "sat 1pm to 3pm deliver to 94043. sun 10am to 12pm pickup at 789 Pine Rd.",
        "deliver Sat 1pm-3pm to 94043; pickup Sunday 10am-12pm at 789 Pine Rd",
        "delivery is sat between 1 and 3 in the afternoon to 94043. pickup is sun between 10 and 12 in the morning at 789 Pine Rd.",
        "I will deliver on Saturday from 1pm to 3pm to 94043 or you can pickup on Sunday from 10am to 12pm at 789 Pine Rd",
        "pickup Sunday 10am-12pm at 789 Pine Rd whereas delivery is Saturday 1pm-3pm to 94043",
        "Delivery: Saturday 1pm-3pm to 94043\nPickup: Sunday 10am-12pm at 789 Pine Rd"
      ]
    },
    {
      name: "Use Case H: Delivery daily 4-6pm, Pickup Friday 12-2pm",
      expected: {
        offers_delivery: true,
        offers_pickup: true,
        delivery_days: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
        pickup_days: ["friday"],
        delivery_time_slots: ["16-17", "17-18"],
        pickup_time_slots: ["12-13", "13-14"]
      },
      variations: [
        "Deliver daily 4pm-6pm. Pickup Friday 12pm-2pm.",
        "Pickup on Friday from 12pm to 2pm or I can deliver daily from 4 to 6 pm.",
        "daily delivery between 4pm & 6pm. pickup fridays 12pm to 2pm",
        "i drop off daily between 4pm-6pm, otherwise you can collect Friday 12pm-2pm",
        "Delivery: Daily 4-6 PM / Pickup: Fri 12-2 PM",
        "we deliver everyday (4pm-6pm); pickup friday (12pm-2pm)",
        "fri 12p-2p pickup. daily 4p-6p delivery.",
        "deliver daily 4pm - 6pm but pick-up Friday 12pm - 2pm",
        "Daily 4pm-6pm delivery, Friday 12pm-2pm pickup",
        "For pickup: Friday 12pm to 2pm. For delivery: daily 4pm to 6pm.",
        "will deliver daily 4pm to 6pm. Friday pickup is 12pm-2pm.",
        "pickup Friday 12pm-2pm, deliver daily 4pm-6pm",
        "I can deliver daily between 4 and 6pm. You can also pickup Friday between 12 and 2pm.",
        "drop-off: daily 4p-6p, pick-up: Fri 12p-2p",
        "daily 4pm to 6pm deliver. Friday 12pm to 2pm pickup.",
        "deliver daily 4pm-6pm; pickup Friday 12pm-2pm",
        "delivery is everyday between 4 and 6 in the afternoon. pickup is Friday between 12 and 2 in the afternoon.",
        "I will deliver daily from 4pm to 6pm or you can pickup on Friday from 12pm to 2pm",
        "pickup Friday 12pm-2pm whereas delivery is daily 4pm-6pm",
        "Delivery: daily 4pm-6pm\nPickup: Friday 12pm-2pm"
      ]
    },
    {
      name: "Use Case I: Delivery weekends 1-4pm (Delivery only)",
      expected: {
        offers_delivery: true,
        offers_pickup: false,
        delivery_days: ["saturday", "sunday"],
        pickup_days: [],
        delivery_time_slots: ["13-14", "14-15", "15-16"],
        pickup_time_slots: []
      },
      variations: [
        "Deliver weekends 1pm-4pm. No pickup.",
        "No pickup. Delivery only on weekends from 1pm to 4pm.",
        "delivery between 1pm & 4pm on weekends. no pickup.",
        "i drop off weekends between 1pm-4pm. no collect",
        "Delivery only: weekends 1-4 PM.",
        "we deliver weekends (1pm-4pm). no pickup.",
        "weekends 1p-4p delivery. no pickup.",
        "deliver weekends 1pm - 4pm - no pickup",
        "Weekends 1pm-4pm delivery only",
        "For delivery: weekends 1pm to 4pm. No pickup.",
        "will deliver weekends 1pm to 4pm. No pickup.",
        "no pickup, deliver weekends 1pm-4pm",
        "I can deliver weekends between 1 and 4pm. Pickup not available.",
        "drop-off: weekends 1p-4p. no pick-up",
        "weekends 1pm to 4pm deliver. no pickup.",
        "deliver weekends 1pm-4pm; no pickup",
        "delivery is weekends between 1 and 4 in the afternoon. no pickup.",
        "I will deliver on weekends from 1pm to 4pm. No pickup.",
        "no pickup whereas delivery is weekends 1pm-4pm",
        "Delivery only: weekends 1pm-4pm\nNo pickup"
      ]
    },
    {
      name: "Use Case J: Pickup daily 8-11am at 555 Market St (Pickup only)",
      expected: {
        offers_delivery: false,
        offers_pickup: true,
        delivery_days: [],
        pickup_days: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
        delivery_time_slots: [],
        pickup_time_slots: ["8-9", "9-10", "10-11"],
        pickup_address: "555 Market St"
      },
      variations: [
        "Pickup daily 8am-11am at 555 Market St. No delivery.",
        "No delivery. Pickup only daily from 8am to 11am at 555 Market St.",
        "pickup daily between 8am & 11am from 555 Market St. no delivery.",
        "i collect daily 8am-11am at 555 Market St. no drop off",
        "Pickup only: Daily 8-11 AM, 555 Market St.",
        "pickup daily (8am-11am) at 555 Market St. no shipping.",
        "555 Market St daily 8a-11a pickup. no delivery.",
        "pick up daily 8am - 11am from 555 Market St - no delivery",
        "Daily 8am-11am pickup only at 555 Market St",
        "For pickup: daily 8am to 11am at 555 Market St. No delivery.",
        "will pickup daily 8am to 11am at 555 Market St. No delivery.",
        "no delivery, pickup daily 8am-11am at 555 Market St",
        "I do not deliver. You can pickup daily between 8 and 11am at 555 Market St.",
        "pick-up: daily 8a-11a at 555 Market St. no drop-off",
        "daily 8am to 11am pickup at 555 Market St. no delivery.",
        "pickup daily 8am-11am at 555 Market St; no delivery",
        "pickup is daily between 8 and 11 in the morning at 555 Market St. no delivery.",
        "You can pickup daily from 8am to 11am at 555 Market St. No delivery.",
        "no delivery whereas pickup is daily 8am-11am at 555 Market St",
        "Pickup only: daily 8am-11am\n555 Market St"
      ]
    }
  ]

  // Add the remaining 7 variations for Use Case F to make sure it also has exactly 20
  suites[5].variations.push(
    "pick-up: Thursday at 3p at 456 Elm Ave. no drop-off",
    "Thursday at 3pm pickup at 456 Elm Ave. no delivery.",
    "pickup Thursday at 3pm at 456 Elm Ave; no delivery",
    "pickup is Thursday at 3 in the afternoon at 456 Elm Ave. no delivery.",
    "You can pickup on Thursday at 3pm at 456 Elm Ave. No delivery.",
    "no delivery whereas pickup is Thursday at 3pm at 456 Elm Ave",
    "Pickup only: Thursday at 3pm\n456 Elm Ave"
  )

  suites.forEach((suite) => {
    describe(suite.name, () => {
      suite.variations.forEach((input, idx) => {
        it(`Permutation #${idx + 1}: "${input.replace(/\n/g, '\\n')}"`, () => {
          const res = parseTextFallback(input)

          expect(res.offers_delivery).toBe(suite.expected.offers_delivery)
          expect(res.offers_pickup).toBe(suite.expected.offers_pickup)

          if (suite.expected.delivery_days.length > 0) {
            expect(res.delivery_days).toEqual(expect.arrayContaining(suite.expected.delivery_days))
            expect(res.delivery_days.length).toBe(suite.expected.delivery_days.length)
          } else {
            expect(res.delivery_days).toEqual([])
          }

          if (suite.expected.pickup_days.length > 0) {
            expect(res.pickup_days).toEqual(expect.arrayContaining(suite.expected.pickup_days))
            expect(res.pickup_days.length).toBe(suite.expected.pickup_days.length)
          } else {
            expect(res.pickup_days).toEqual([])
          }

          if (suite.expected.delivery_time_slots.length > 0) {
            expect(res.delivery_time_slots).toEqual(expect.arrayContaining(suite.expected.delivery_time_slots))
            expect(res.delivery_time_slots.length).toBe(suite.expected.delivery_time_slots.length)
          } else {
            expect(res.delivery_time_slots).toEqual([])
          }

          if (suite.expected.pickup_time_slots.length > 0) {
            expect(res.pickup_time_slots).toEqual(expect.arrayContaining(suite.expected.pickup_time_slots))
            expect(res.pickup_time_slots.length).toBe(suite.expected.pickup_time_slots.length)
          } else {
            expect(res.pickup_time_slots).toEqual([])
          }

          if (suite.expected.pickup_address !== undefined) {
            expect(res.pickup_address ? res.pickup_address.street : null).toBe(suite.expected.pickup_address)
          }

          if (suite.expected.delivery_radius_miles !== undefined) {
            expect(res.delivery_radius_miles).toBe(suite.expected.delivery_radius_miles)
          }

          if (suite.expected.delivery_zipcodes !== undefined) {
            expect(res.delivery_zipcodes).toEqual(expect.arrayContaining(suite.expected.delivery_zipcodes))
          }
        })
      })
    })
  })
})




