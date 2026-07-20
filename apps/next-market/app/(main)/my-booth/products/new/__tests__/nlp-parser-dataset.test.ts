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


