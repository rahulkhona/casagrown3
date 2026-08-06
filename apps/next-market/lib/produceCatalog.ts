export interface ProduceItem {
  id: string
  name: string
  category: 'produce' | 'flowers' | 'flower_arrangements' | 'garden_equipment' | 'pots' | 'soil' | 'seeds' | 'seedlings' | 'plants' | 'eggs' | 'honey'
  displayCategory: string
  image: string
  buyersCount: number
  sellersCount: number
  unit: string
}

// Master Top 100 Popular Backyard Produce & Garden Catalog
export const EXHAUSTIVE_US_PRODUCE: ProduceItem[] = [
  // ── CITRUS & SUBTROPICAL ──
  { id: 'lemons', name: 'Lemons', category: 'produce', displayCategory: 'Fresh Produce', image: '/products/meyer-lemons.png', buyersCount: 34, sellersCount: 12, unit: 'lb' },
  { id: 'limes', name: 'Limes', category: 'produce', displayCategory: 'Fresh Produce', image: '/products/persian-limes.png', buyersCount: 32, sellersCount: 9, unit: 'lb' },
  { id: 'oranges', name: 'Oranges', category: 'produce', displayCategory: 'Fresh Produce', image: '/products/valencia-oranges.png', buyersCount: 50, sellersCount: 16, unit: 'bag' },
  { id: 'grapefruit', name: 'Grapefruit', category: 'produce', displayCategory: 'Fresh Produce', image: '/products/ruby-grapefruit.png', buyersCount: 14, sellersCount: 4, unit: 'bag' },
  { id: 'tangerines', name: 'Tangerines', category: 'produce', displayCategory: 'Fresh Produce', image: '/images/produce_placeholder.jpg', buyersCount: 25, sellersCount: 8, unit: 'bag' },
  { id: 'mandarins', name: 'Mandarins', category: 'produce', displayCategory: 'Fresh Produce', image: '/images/produce_placeholder.jpg', buyersCount: 22, sellersCount: 7, unit: 'bag' },
  { id: 'kumquats', name: 'Kumquats', category: 'produce', displayCategory: 'Fresh Produce', image: '/images/produce_placeholder.jpg', buyersCount: 11, sellersCount: 3, unit: 'pint' },

  // ── TOP VEGETABLES ──
  { id: 'tomatoes', name: 'Heirloom Tomatoes', category: 'produce', displayCategory: 'Fresh Produce', image: '/products/heritage-tomatoes.png', buyersCount: 81, sellersCount: 34, unit: 'lb' },
  { id: 'cherry_tomatoes', name: 'Cherry Tomatoes', category: 'produce', displayCategory: 'Fresh Produce', image: '/images/produce_placeholder.jpg', buyersCount: 42, sellersCount: 16, unit: 'pint' },
  { id: 'sweet_peppers', name: 'Sweet Bell Peppers', category: 'produce', displayCategory: 'Fresh Produce', image: '/products/bell-peppers.png', buyersCount: 45, sellersCount: 16, unit: 'lb' },
  { id: 'hot_peppers', name: 'Hot Peppers', category: 'produce', displayCategory: 'Fresh Produce', image: '/images/produce_placeholder.jpg', buyersCount: 39, sellersCount: 14, unit: 'lb' },
  { id: 'chilies', name: 'Chilies', category: 'produce', displayCategory: 'Fresh Produce', image: '/images/produce_placeholder.jpg', buyersCount: 28, sellersCount: 9, unit: 'lb' },
  { id: 'cucumbers', name: 'Cucumbers', category: 'produce', displayCategory: 'Fresh Produce', image: '/images/produce_placeholder.jpg', buyersCount: 31, sellersCount: 11, unit: 'lb' },
  { id: 'zucchini', name: 'Zucchini', category: 'produce', displayCategory: 'Fresh Produce', image: '/products/organic-zucchini.png', buyersCount: 38, sellersCount: 14, unit: 'lb' },
  { id: 'yellow_squash', name: 'Yellow Summer Squash', category: 'produce', displayCategory: 'Fresh Produce', image: '/images/produce_placeholder.jpg', buyersCount: 21, sellersCount: 7, unit: 'lb' },
  { id: 'eggplant', name: 'Globe Eggplant', category: 'produce', displayCategory: 'Fresh Produce', image: '/images/produce_placeholder.jpg', buyersCount: 18, sellersCount: 5, unit: 'lb' },
  { id: 'green_beans', name: 'Green Beans', category: 'produce', displayCategory: 'Fresh Produce', image: '/images/produce_placeholder.jpg', buyersCount: 36, sellersCount: 12, unit: 'lb' },
  { id: 'peas', name: 'Snap Peas', category: 'produce', displayCategory: 'Fresh Produce', image: '/images/produce_placeholder.jpg', buyersCount: 24, sellersCount: 8, unit: 'lb' },
  { id: 'kale', name: 'Kale', category: 'produce', displayCategory: 'Fresh Produce', image: '/images/produce_placeholder.jpg', buyersCount: 42, sellersCount: 15, unit: 'bunch' },
  { id: 'collard_greens', name: 'Collard Greens', category: 'produce', displayCategory: 'Fresh Produce', image: '/images/produce_placeholder.jpg', buyersCount: 22, sellersCount: 7, unit: 'bunch' },
  { id: 'lettuce', name: 'Lettuce', category: 'produce', displayCategory: 'Fresh Produce', image: '/images/produce_placeholder.jpg', buyersCount: 30, sellersCount: 10, unit: 'head' },
  { id: 'spinach', name: 'Spinach', category: 'produce', displayCategory: 'Fresh Produce', image: '/images/produce_placeholder.jpg', buyersCount: 28, sellersCount: 9, unit: 'lb' },
  { id: 'swiss_chard', name: 'Swiss Chard', category: 'produce', displayCategory: 'Fresh Produce', image: '/images/produce_placeholder.jpg', buyersCount: 18, sellersCount: 5, unit: 'bunch' },
  { id: 'carrots', name: 'Carrots', category: 'produce', displayCategory: 'Fresh Produce', image: '/images/produce_placeholder.jpg', buyersCount: 35, sellersCount: 12, unit: 'bunch' },
  { id: 'beets', name: 'Beets', category: 'produce', displayCategory: 'Fresh Produce', image: '/images/produce_placeholder.jpg', buyersCount: 22, sellersCount: 7, unit: 'bunch' },
  { id: 'radishes', name: 'Radishes', category: 'produce', displayCategory: 'Fresh Produce', image: '/images/produce_placeholder.jpg', buyersCount: 19, sellersCount: 6, unit: 'bunch' },
  { id: 'potatoes', name: 'Potatoes', category: 'produce', displayCategory: 'Fresh Produce', image: '/images/produce_placeholder.jpg', buyersCount: 40, sellersCount: 14, unit: 'lb' },
  { id: 'sweet_potatoes', name: 'Sweet Potatoes', category: 'produce', displayCategory: 'Fresh Produce', image: '/images/produce_placeholder.jpg', buyersCount: 28, sellersCount: 9, unit: 'lb' },
  { id: 'onions', name: 'Onions', category: 'produce', displayCategory: 'Fresh Produce', image: '/images/produce_placeholder.jpg', buyersCount: 52, sellersCount: 18, unit: 'bunch' },
  { id: 'scallions', name: 'Scallions', category: 'produce', displayCategory: 'Fresh Produce', image: '/images/produce_placeholder.jpg', buyersCount: 25, sellersCount: 8, unit: 'bunch' },
  { id: 'garlic', name: 'Garlic', category: 'produce', displayCategory: 'Fresh Produce', image: '/images/produce_placeholder.jpg', buyersCount: 40, sellersCount: 14, unit: 'head' },
  { id: 'sweet_corn', name: 'Sweet Corn', category: 'produce', displayCategory: 'Fresh Produce', image: '/images/produce_placeholder.jpg', buyersCount: 45, sellersCount: 15, unit: 'dozen' },
  { id: 'okra', name: 'Okra', category: 'produce', displayCategory: 'Fresh Produce', image: '/images/produce_placeholder.jpg', buyersCount: 16, sellersCount: 5, unit: 'lb' },
  { id: 'pumpkins', name: 'Pumpkins', category: 'produce', displayCategory: 'Fresh Produce', image: '/images/produce_placeholder.jpg', buyersCount: 33, sellersCount: 11, unit: 'item' },
  { id: 'winter_squash', name: 'Winter Squash', category: 'produce', displayCategory: 'Fresh Produce', image: '/images/produce_placeholder.jpg', buyersCount: 20, sellersCount: 6, unit: 'item' },
  { id: 'broccoli', name: 'Broccoli', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1584270354949-c26b0d5b4a0c?w=600&auto=format&fit=crop&q=80', buyersCount: 27, sellersCount: 8, unit: 'head' },
  { id: 'cauliflower', name: 'Cauliflower', category: 'produce', displayCategory: 'Fresh Produce', image: '/images/produce_placeholder.jpg', buyersCount: 19, sellersCount: 5, unit: 'head' },
  { id: 'asparagus', name: 'Asparagus', category: 'produce', displayCategory: 'Fresh Produce', image: '/images/produce_placeholder.jpg', buyersCount: 22, sellersCount: 6, unit: 'bunch' },

  // ── TOP FRUITS & BERRIES ──
  { id: 'avocados', name: 'Hass Avocados', category: 'produce', displayCategory: 'Fresh Produce', image: '/products/hass-avocado.jpg', buyersCount: 55, sellersCount: 21, unit: 'bag' },
  { id: 'figs', name: 'Figs', category: 'produce', displayCategory: 'Fresh Produce', image: '/products/fresh-figs.jpg', buyersCount: 38, sellersCount: 14, unit: 'basket' },
  { id: 'persimmons', name: 'Persimmons', category: 'produce', displayCategory: 'Fresh Produce', image: '/products/persimmons.jpg', buyersCount: 34, sellersCount: 12, unit: 'bag' },
  { id: 'pomegranates', name: 'Pomegranates', category: 'produce', displayCategory: 'Fresh Produce', image: '/products/pomegranates.jpg', buyersCount: 29, sellersCount: 9, unit: 'item' },
  { id: 'peaches', name: 'Peaches', category: 'produce', displayCategory: 'Fresh Produce', image: '/products/peaches.jpg', buyersCount: 46, sellersCount: 17, unit: 'lb' },
  { id: 'nectarines', name: 'Nectarines', category: 'produce', displayCategory: 'Fresh Produce', image: '/images/produce_placeholder.jpg', buyersCount: 38, sellersCount: 13, unit: 'lb' },
  { id: 'plums', name: 'Plums', category: 'produce', displayCategory: 'Fresh Produce', image: '/images/produce_placeholder.jpg', buyersCount: 31, sellersCount: 10, unit: 'lb' },
  { id: 'cherries', name: 'Cherries', category: 'produce', displayCategory: 'Fresh Produce', image: '/images/produce_placeholder.jpg', buyersCount: 49, sellersCount: 15, unit: 'lb' },
  { id: 'apples', name: 'Apples', category: 'produce', displayCategory: 'Fresh Produce', image: '/images/produce_placeholder.jpg', buyersCount: 51, sellersCount: 19, unit: 'bag' },
  { id: 'pears', name: 'Pears', category: 'produce', displayCategory: 'Fresh Produce', image: '/images/produce_placeholder.jpg', buyersCount: 28, sellersCount: 8, unit: 'bag' },
  { id: 'strawberries', name: 'Strawberries', category: 'produce', displayCategory: 'Fresh Produce', image: '/images/produce_placeholder.jpg', buyersCount: 62, sellersCount: 22, unit: 'flat' },
  { id: 'blueberries', name: 'Blueberries', category: 'produce', displayCategory: 'Fresh Produce', image: '/images/produce_placeholder.jpg', buyersCount: 54, sellersCount: 18, unit: 'pint' },
  { id: 'blackberries', name: 'Blackberries', category: 'produce', displayCategory: 'Fresh Produce', image: '/images/produce_placeholder.jpg', buyersCount: 45, sellersCount: 14, unit: 'pint' },
  { id: 'raspberries', name: 'Raspberries', category: 'produce', displayCategory: 'Fresh Produce', image: '/images/produce_placeholder.jpg', buyersCount: 38, sellersCount: 11, unit: 'pint' },
  { id: 'watermelon', name: 'Watermelon', category: 'produce', displayCategory: 'Fresh Produce', image: '/images/produce_placeholder.jpg', buyersCount: 43, sellersCount: 14, unit: 'item' },
  { id: 'melons', name: 'Cantaloupe & Melons', category: 'produce', displayCategory: 'Fresh Produce', image: '/images/produce_placeholder.jpg', buyersCount: 25, sellersCount: 8, unit: 'item' },
  { id: 'grapes', name: 'Grapes', category: 'produce', displayCategory: 'Fresh Produce', image: '/images/produce_placeholder.jpg', buyersCount: 32, sellersCount: 9, unit: 'lb' },
  { id: 'mangoes', name: 'Mangoes', category: 'produce', displayCategory: 'Fresh Produce', image: '/images/produce_placeholder.jpg', buyersCount: 39, sellersCount: 10, unit: 'item' },
  { id: 'passionfruit', name: 'Passionfruit', category: 'produce', displayCategory: 'Fresh Produce', image: '/images/produce_placeholder.jpg', buyersCount: 24, sellersCount: 7, unit: 'item' },
  { id: 'guavas', name: 'Guavas', category: 'produce', displayCategory: 'Fresh Produce', image: '/images/produce_placeholder.jpg', buyersCount: 18, sellersCount: 5, unit: 'item' },

  // ── HERBS ──
  { id: 'basil', name: 'Fresh Basil', category: 'produce', displayCategory: 'Fresh Produce', image: '/products/fresh-basil.png', buyersCount: 45, sellersCount: 17, unit: 'bunch' },
  { id: 'mint', name: 'Fresh Mint', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1628556270448-4d4e4148e1b1?w=600&auto=format&fit=crop&q=80', buyersCount: 35, sellersCount: 13, unit: 'bunch' },
  { id: 'rosemary', name: 'Rosemary', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1515586000433-45406d8e6662?w=600&auto=format&fit=crop&q=80', buyersCount: 38, sellersCount: 14, unit: 'bunch' },
  { id: 'thyme', name: 'Thyme', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1599940824399-b87987ceb72a?w=600&auto=format&fit=crop&q=80', buyersCount: 22, sellersCount: 7, unit: 'bunch' },
  { id: 'parsley', name: 'Parsley', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1588879460618-9249e7d947d1?w=600&auto=format&fit=crop&q=80', buyersCount: 32, sellersCount: 11, unit: 'bunch' },
  { id: 'cilantro', name: 'Cilantro', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1600857544200-b2f666a9a2ec?w=600&auto=format&fit=crop&q=80', buyersCount: 42, sellersCount: 16, unit: 'bunch' },
  { id: 'oregano', name: 'Oregano', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1608686207856-001b95cf60ca?w=600&auto=format&fit=crop&q=80', buyersCount: 25, sellersCount: 8, unit: 'bunch' },
  { id: 'sage', name: 'Sage', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1594313016519-640ed47407ea?w=600&auto=format&fit=crop&q=80', buyersCount: 18, sellersCount: 5, unit: 'bunch' },
  { id: 'chives', name: 'Chives', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?w=600&auto=format&fit=crop&q=80', buyersCount: 20, sellersCount: 6, unit: 'bunch' },
  { id: 'dill', name: 'Dill', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=600&auto=format&fit=crop&q=80', buyersCount: 16, sellersCount: 5, unit: 'bunch' },
  { id: 'lavender', name: 'Lavender', category: 'produce', displayCategory: 'Fresh Produce', image: 'https://images.unsplash.com/photo-1528183429752-a97d0bf99b5a?w=600&auto=format&fit=crop&q=80', buyersCount: 33, sellersCount: 10, unit: 'bundle' },

  // ── FLOWERS ──
  { id: 'cut_flowers', name: 'Fresh Cut Garden Flowers', category: 'flowers', displayCategory: 'Flowers', image: 'https://images.unsplash.com/photo-1563241527-3004b7be0ffd?w=600&auto=format&fit=crop&q=80', buyersCount: 39, sellersCount: 12, unit: 'bunch' },
  { id: 'sunflowers', name: 'Sunflowers', category: 'flowers', displayCategory: 'Flowers', image: 'https://images.unsplash.com/photo-1597848212624-a19eb35e2651?w=600&auto=format&fit=crop&q=80', buyersCount: 48, sellersCount: 18, unit: 'bunch' },
  { id: 'dahlias', name: 'Fresh Dahlias & Zinnias', category: 'flowers', displayCategory: 'Flowers', image: 'https://images.unsplash.com/photo-1508610048659-a06b669e3321?w=600&auto=format&fit=crop&q=80', buyersCount: 31, sellersCount: 9, unit: 'bunch' },

  // ── FLOWER ARRANGEMENTS (No Photo Available Stock Graphic) ──
  { id: 'flower_arrangements', name: 'Artisanal Flower Arrangements', category: 'flower_arrangements', displayCategory: 'Flower Arrangements', image: '/images/produce_placeholder.jpg', buyersCount: 29, sellersCount: 8, unit: 'arrangement' },

  // ── HONEY ──
  { id: 'raw_honey', name: 'Raw Wildflower Honey', category: 'honey', displayCategory: 'Honey', image: 'https://images.unsplash.com/photo-1558642452-9d2a7deb7f62?w=600&auto=format&fit=crop&q=80', buyersCount: 65, sellersCount: 22, unit: 'jar' },
  { id: 'honeycomb', name: 'Fresh Honeycomb', category: 'honey', displayCategory: 'Honey', image: 'https://images.unsplash.com/photo-1558642452-9d2a7deb7f62?w=600&auto=format&fit=crop&q=80', buyersCount: 28, sellersCount: 7, unit: 'item' },

  // ── PLANTS & SEEDLINGS ──
  { id: 'veg_seedlings', name: 'Vegetable & Tomato Seedlings', category: 'seedlings', displayCategory: 'Plants & Seedlings', image: 'https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?w=600&auto=format&fit=crop&q=80', buyersCount: 44, sellersCount: 16, unit: 'tray' },
  { id: 'herb_plants', name: 'Potted Herb Starter Plants', category: 'plants', displayCategory: 'Plants & Seedlings', image: 'https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?w=600&auto=format&fit=crop&q=80', buyersCount: 37, sellersCount: 14, unit: 'pot' },
  { id: 'berry_bushes', name: 'Berry Bushes & Strawberry Starters', category: 'plants', displayCategory: 'Plants & Seedlings', image: 'https://images.unsplash.com/photo-1518531933037-91b2f5f229cc?w=600&auto=format&fit=crop&q=80', buyersCount: 31, sellersCount: 9, unit: 'plant' },
  { id: 'fruit_trees', name: 'Fruit Tree Saplings (Citrus/Fig/Avocado)', category: 'plants', displayCategory: 'Plants & Seedlings', image: 'https://images.unsplash.com/photo-1513836279014-a89f7a76ae86?w=600&auto=format&fit=crop&q=80', buyersCount: 26, sellersCount: 7, unit: 'tree' },

  // ── SEEDS ──
  { id: 'heirloom_veg_seeds', name: 'Heirloom Vegetable Seeds', category: 'seeds', displayCategory: 'Seeds', image: 'https://images.unsplash.com/photo-1470240731273-7821a6eeb6bd?w=600&auto=format&fit=crop&q=80', buyersCount: 35, sellersCount: 12, unit: 'pack' },
  { id: 'herb_seeds', name: 'Herb & Medicinal Seeds', category: 'seeds', displayCategory: 'Seeds', image: 'https://images.unsplash.com/photo-1470240731273-7821a6eeb6bd?w=600&auto=format&fit=crop&q=80', buyersCount: 28, sellersCount: 9, unit: 'pack' },
  { id: 'wildflower_seeds', name: 'Wildflower & Pollinator Seeds', category: 'seeds', displayCategory: 'Seeds', image: 'https://images.unsplash.com/photo-1470240731273-7821a6eeb6bd?w=600&auto=format&fit=crop&q=80', buyersCount: 31, sellersCount: 10, unit: 'pack' },

  // ── EGGS ──
  { id: 'chicken_eggs', name: 'Pastured Chicken Eggs', category: 'eggs', displayCategory: 'Eggs', image: '/products/fresh-eggs.png', buyersCount: 74, sellersCount: 26, unit: 'dozen' },
  { id: 'duck_eggs', name: 'Duck Eggs', category: 'eggs', displayCategory: 'Eggs', image: 'https://images.unsplash.com/photo-1569288052389-dac9b01c9c05?w=600&auto=format&fit=crop&q=80', buyersCount: 41, sellersCount: 15, unit: 'dozen' },
  { id: 'quail_eggs', name: 'Fresh Quail Eggs', category: 'eggs', displayCategory: 'Eggs', image: 'https://images.unsplash.com/photo-1516467508483-a7212febe31a?w=600&auto=format&fit=crop&q=80', buyersCount: 33, sellersCount: 11, unit: 'carton' },

  // ── GARDEN EQUIPMENT & SUPPLIES (No Photo Available Stock Graphic) ──
  { id: 'gardening_supplies', name: 'Organic Gardening Supplies & Soil', category: 'garden_equipment', displayCategory: 'Gardening Supplies', image: '/images/produce_placeholder.jpg', buyersCount: 22, sellersCount: 5, unit: 'bag' },
]

export function getProduceImage(name?: string): string {
  if (!name) return '/images/produce_placeholder.jpg'
  const normalized = name.toLowerCase().trim()
  
  if (normalized.includes('zucchini') || normalized.includes('squash')) return '/products/organic-zucchini.png'
  if (normalized.includes('grapefruit')) return '/products/ruby-grapefruit.png'
  if (normalized.includes('orange')) return '/products/valencia-oranges.png'
  if (normalized.includes('lemon')) return '/products/meyer-lemons.png'
  if (normalized.includes('lime')) return '/products/persian-limes.png'
  if (normalized.includes('tomato')) return '/products/heritage-tomatoes.png'
  if (normalized.includes('pepper')) return '/products/bell-peppers.png'
  if (normalized.includes('basil') || normalized.includes('herb')) return '/products/fresh-basil.png'
  if (normalized.includes('egg')) return '/products/fresh-eggs.png'
  if (normalized.includes('strawberry') || normalized.includes('berry')) return '/products/strawberry-jam.png'
  if (normalized.includes('fig')) return '/products/fresh-figs.jpg'
  if (normalized.includes('avocado')) return '/products/hass-avocado.jpg'
  if (normalized.includes('persimmon')) return '/products/persimmons.jpg'
  if (normalized.includes('pomegranate')) return '/products/pomegranates.jpg'
  if (normalized.includes('peach') || normalized.includes('nectarine')) return '/products/peaches.jpg'
  if (normalized.includes('bread') || normalized.includes('sourdough')) return '/products/sourdough-loaf.png'

  const exactMatch = EXHAUSTIVE_US_PRODUCE.find(
    (item) => item.name.toLowerCase() === normalized || item.id === normalized
  )
  if (exactMatch?.image) return exactMatch.image

  const partialMatch = EXHAUSTIVE_US_PRODUCE.find(
    (item) => item.name.toLowerCase().includes(normalized) || normalized.includes(item.name.toLowerCase())
  )
  if (partialMatch?.image) return partialMatch.image

  return '/images/produce_placeholder.jpg'
}

export function getProduceFamilies(name?: string): string[] {
  if (!name) return []
  const norm = name.toLowerCase().trim()
  const families: string[] = []

  // Citrus tree family (includes lemons, limes, oranges, grapefruit, tangerines, citrus)
  if (norm.includes('citrus') || norm.includes('lemon') || norm.includes('lime') || norm.includes('orange') || norm.includes('grapefruit') || norm.includes('mandarin') || norm.includes('tangerine')) {
    families.push('citrus', 'lemons', 'limes', 'oranges', 'grapefruit')
  }

  // Stone fruit family (includes peaches, nectarines, plums, cherries, apricots)
  if (norm.includes('stone fruit') || norm.includes('peach') || norm.includes('nectarine') || norm.includes('plum') || norm.includes('cherry') || norm.includes('apricot')) {
    families.push('stone_fruit', 'peaches', 'plums', 'cherries')
  }

  // Berries & Vines family (includes strawberries, blueberries, blackberries, raspberries, grapes)
  if (norm.includes('berry') || norm.includes('berries') || norm.includes('vine') || norm.includes('strawberry') || norm.includes('blueberry') || norm.includes('blackberry') || norm.includes('grape')) {
    families.push('berries', 'strawberries', 'blueberries', 'blackberries', 'grapes')
  }

  // Apples & Pears family
  if (norm.includes('apple') || norm.includes('pear') || norm.includes('pome')) {
    families.push('apples', 'pears')
  }

  // Tomatoes
  if (norm.includes('tomato')) {
    families.push('tomatoes')
  }

  // Peppers
  if (norm.includes('pepper') || norm.includes('chili') || norm.includes('chile') || norm.includes('jalapeno')) {
    families.push('peppers')
  }

  // Avocados
  if (norm.includes('avocado')) {
    families.push('avocados')
  }

  // Zucchini & Squash
  if (norm.includes('zucchini') || norm.includes('squash')) {
    families.push('zucchini')
  }

  // Figs
  if (norm.includes('fig')) {
    families.push('figs')
  }

  if (families.length === 0) {
    families.push(norm)
  }

  return Array.from(new Set(families))
}

export function normalizeProduceFamily(name?: string): string {
  const families = getProduceFamilies(name)
  return families[0] || ''
}
