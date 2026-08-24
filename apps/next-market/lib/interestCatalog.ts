export interface InterestCatalogItem {
  defaultPrice?: number
  defaultUnit?: string
  id: string
  name: string
  category: 'produce' | 'herbs' | 'flowers' | 'honey' | 'eggs' | 'seedlings' | 'plants'
  displayCategory: string
  image: string
  buyersCount: number
  sellersCount: number
  unit?: string
}

const SUPABASE_URL = (typeof process !== 'undefined' && process.env?.NEXT_PUBLIC_SUPABASE_URL) || 'http://127.0.0.1:54321'
const BUCKET = `${SUPABASE_URL}/storage/v1/object/public/interest-images`

export const EXHAUSTIVE_INTERESTS_CATALOG: InterestCatalogItem[] = [

  // ── CITRUS ──
  { id: 'lemons',      name: 'Lemons',      category: 'produce', displayCategory: 'Citrus', image: '/products/meyer-lemons.png',      buyersCount: 68, sellersCount: 24, defaultPrice: 0.75, defaultUnit: 'each' },
  { id: 'limes',       name: 'Limes',       category: 'produce', displayCategory: 'Citrus', image: '/products/persian-limes.png',     buyersCount: 52, sellersCount: 19, defaultPrice: 0.50, defaultUnit: 'each' },
  { id: 'oranges',     name: 'Oranges',     category: 'produce', displayCategory: 'Citrus', image: '/products/valencia-oranges.png',  buyersCount: 61, sellersCount: 22, defaultPrice: 2.00, defaultUnit: 'lb' },
  { id: 'grapefruit',  name: 'Grapefruit',  category: 'produce', displayCategory: 'Citrus', image: '/products/ruby-grapefruit.png',   buyersCount: 34, sellersCount: 11, defaultPrice: 1.50, defaultUnit: 'each' },
  { id: 'tangerines',  name: 'Tangerines',  category: 'produce', displayCategory: 'Citrus', image: `${BUCKET}/studio_tangerines.jpg`,  buyersCount: 41, sellersCount: 15, defaultPrice: 2.50, defaultUnit: 'lb' },
  { id: 'mandarins',   name: 'Mandarins',   category: 'produce', displayCategory: 'Citrus', image: `${BUCKET}/studio_mandarins.jpg`,   buyersCount: 45, sellersCount: 16, defaultPrice: 2.50, defaultUnit: 'lb' },
  { id: 'kumquats',    name: 'Kumquats',    category: 'produce', displayCategory: 'Citrus', image: `${BUCKET}/studio_kumquats.jpg`,    buyersCount: 18, sellersCount: 6,  defaultPrice: 4.00, defaultUnit: 'lb' },

  // ── VEGETABLES ──
  { id: 'heirloom_tomatoes', name: 'Tomatoes',        category: 'produce', displayCategory: 'Vegetables', image: '/products/heritage-tomatoes.png',         buyersCount: 84, sellersCount: 31, defaultPrice: 3.50, defaultUnit: 'lb' },
  { id: 'cherry_tomatoes',   name: 'Cherry Tomatoes', category: 'produce', displayCategory: 'Vegetables', image: `${BUCKET}/studio_cherry_tomatoes.jpg`,      buyersCount: 42, sellersCount: 16, defaultPrice: 3.50, defaultUnit: 'basket' },
  { id: 'sweet_peppers',     name: 'Bell Peppers',    category: 'produce', displayCategory: 'Vegetables', image: '/products/bell-peppers.png',               buyersCount: 45, sellersCount: 16, defaultPrice: 1.25, defaultUnit: 'each' },
  { id: 'hot_peppers',       name: 'Hot Peppers',     category: 'produce', displayCategory: 'Vegetables', image: `${BUCKET}/studio_hot_peppers.jpg`,          buyersCount: 39, sellersCount: 14, defaultPrice: 3.00, defaultUnit: 'basket' },
  { id: 'chilies',           name: 'Chilies',         category: 'produce', displayCategory: 'Vegetables', image: `${BUCKET}/studio_chilies.jpg`,              buyersCount: 28, sellersCount: 9,  defaultPrice: 3.00, defaultUnit: 'basket' },
  { id: 'cucumbers',         name: 'Cucumbers',       category: 'produce', displayCategory: 'Vegetables', image: `${BUCKET}/studio_cucumbers.jpg`,            buyersCount: 31, sellersCount: 11, defaultPrice: 1.00, defaultUnit: 'each' },
  { id: 'zucchini',          name: 'Zucchini',        category: 'produce', displayCategory: 'Vegetables', image: '/products/organic-zucchini.png',            buyersCount: 38, sellersCount: 14, defaultPrice: 1.75, defaultUnit: 'lb' },
  { id: 'yellow_squash',     name: 'Yellow Squash',   category: 'produce', displayCategory: 'Vegetables', image: `${BUCKET}/studio_yellow_squash.jpg`,        buyersCount: 21, sellersCount: 7,  defaultPrice: 1.75, defaultUnit: 'lb' },
  { id: 'eggplant',          name: 'Eggplant',        category: 'produce', displayCategory: 'Vegetables', image: `${BUCKET}/studio_eggplant.jpg`,             buyersCount: 18, sellersCount: 5,  defaultPrice: 2.00, defaultUnit: 'each' },
  { id: 'green_beans',       name: 'Green Beans',     category: 'produce', displayCategory: 'Vegetables', image: `${BUCKET}/studio_green_beans.jpg`,          buyersCount: 36, sellersCount: 12, defaultPrice: 3.50, defaultUnit: 'lb' },
  { id: 'snap_peas',         name: 'Snap Peas',       category: 'produce', displayCategory: 'Vegetables', image: `${BUCKET}/studio_snap_peas.jpg`,            buyersCount: 24, sellersCount: 8,  defaultPrice: 3.50, defaultUnit: 'lb' },
  { id: 'kale',              name: 'Kale',            category: 'produce', displayCategory: 'Vegetables', image: `${BUCKET}/studio_kale.jpg`,                 buyersCount: 42, sellersCount: 15, defaultPrice: 2.50, defaultUnit: 'bunch' },
  { id: 'collard_greens',    name: 'Collard Greens',  category: 'produce', displayCategory: 'Vegetables', image: `${BUCKET}/studio_collard_greens.jpg`,       buyersCount: 22, sellersCount: 7,  defaultPrice: 2.50, defaultUnit: 'bunch' },
  { id: 'lettuce',           name: 'Lettuce',         category: 'produce', displayCategory: 'Vegetables', image: `${BUCKET}/studio_lettuce.jpg`,              buyersCount: 30, sellersCount: 10, defaultPrice: 2.50, defaultUnit: 'each' },
  { id: 'spinach',           name: 'Spinach',         category: 'produce', displayCategory: 'Vegetables', image: `${BUCKET}/studio_spinach.jpg`,              buyersCount: 28, sellersCount: 9,  defaultPrice: 3.50, defaultUnit: 'lb' },
  { id: 'swiss_chard',       name: 'Swiss Chard',     category: 'produce', displayCategory: 'Vegetables', image: `${BUCKET}/studio_swiss_chard.jpg`,          buyersCount: 18, sellersCount: 5,  defaultPrice: 2.50, defaultUnit: 'bunch' },
  { id: 'carrots',           name: 'Carrots',         category: 'produce', displayCategory: 'Vegetables', image: `${BUCKET}/studio_carrots.jpg`,              buyersCount: 35, sellersCount: 12, defaultPrice: 2.50, defaultUnit: 'bunch' },
  { id: 'beets',             name: 'Beets',           category: 'produce', displayCategory: 'Vegetables', image: `${BUCKET}/studio_beets.jpg`,               buyersCount: 22, sellersCount: 7,  defaultPrice: 2.50, defaultUnit: 'bunch' },
  { id: 'radishes',          name: 'Radishes',        category: 'produce', displayCategory: 'Vegetables', image: `${BUCKET}/studio_radishes.jpg`,             buyersCount: 19, sellersCount: 6,  defaultPrice: 2.50, defaultUnit: 'bunch' },
  { id: 'potatoes',          name: 'Potatoes',        category: 'produce', displayCategory: 'Vegetables', image: `${BUCKET}/studio_potatoes.jpg`,             buyersCount: 40, sellersCount: 14, defaultPrice: 1.50, defaultUnit: 'lb' },
  { id: 'sweet_potatoes',    name: 'Sweet Potatoes',  category: 'produce', displayCategory: 'Vegetables', image: `${BUCKET}/studio_sweet_potatoes.jpg`,       buyersCount: 28, sellersCount: 9,  defaultPrice: 1.75, defaultUnit: 'lb' },
  { id: 'onions',            name: 'Onions',          category: 'produce', displayCategory: 'Vegetables', image: `${BUCKET}/studio_onions.jpg`,               buyersCount: 52, sellersCount: 18, defaultPrice: 1.50, defaultUnit: 'lb' },
  { id: 'scallions',         name: 'Scallions',       category: 'produce', displayCategory: 'Vegetables', image: `${BUCKET}/studio_scallions.jpg`,            buyersCount: 25, sellersCount: 8,  defaultPrice: 1.50, defaultUnit: 'bunch' },
  { id: 'garlic',            name: 'Garlic',          category: 'produce', displayCategory: 'Vegetables', image: `${BUCKET}/studio_garlic.jpg`,               buyersCount: 40, sellersCount: 14, defaultPrice: 1.00, defaultUnit: 'each' },
  { id: 'sweet_corn',        name: 'Sweet Corn',      category: 'produce', displayCategory: 'Vegetables', image: `${BUCKET}/studio_sweet_corn.jpg`,           buyersCount: 45, sellersCount: 15, defaultPrice: 0.75, defaultUnit: 'each' },
  { id: 'okra',              name: 'Okra',            category: 'produce', displayCategory: 'Vegetables', image: `${BUCKET}/studio_okra.jpg`,                 buyersCount: 16, sellersCount: 5,  defaultPrice: 3.50, defaultUnit: 'lb' },
  { id: 'pumpkins',          name: 'Pumpkins',        category: 'produce', displayCategory: 'Vegetables', image: `${BUCKET}/studio_pumpkins.jpg`,             buyersCount: 33, sellersCount: 11, defaultPrice: 5.00, defaultUnit: 'each' },
  { id: 'winter_squash',     name: 'Winter Squash',   category: 'produce', displayCategory: 'Vegetables', image: `${BUCKET}/studio_winter_squash.jpg`,        buyersCount: 20, sellersCount: 6,  defaultPrice: 1.50, defaultUnit: 'lb' },
  { id: 'broccoli',          name: 'Broccoli',        category: 'produce', displayCategory: 'Vegetables', image: `${BUCKET}/studio_broccoli.jpg`,             buyersCount: 27, sellersCount: 8,  defaultPrice: 2.50, defaultUnit: 'each' },
  { id: 'cauliflower',       name: 'Cauliflower',     category: 'produce', displayCategory: 'Vegetables', image: `${BUCKET}/studio_cauliflower.jpg`,          buyersCount: 19, sellersCount: 5,  defaultPrice: 3.00, defaultUnit: 'each' },
  { id: 'asparagus',         name: 'Asparagus',       category: 'produce', displayCategory: 'Vegetables', image: `${BUCKET}/studio_asparagus.jpg`,            buyersCount: 22, sellersCount: 6,  defaultPrice: 4.00, defaultUnit: 'bunch' },

  // ── FRUITS ──
  { id: 'avocados',          name: 'Avocados',        category: 'produce', displayCategory: 'Fruit', image: '/products/hass-avocado.jpg',    buyersCount: 55, sellersCount: 21, defaultPrice: 1.50, defaultUnit: 'each' },
  { id: 'figs',              name: 'Figs',            category: 'produce', displayCategory: 'Fruit', image: '/products/fresh-figs.jpg',      buyersCount: 38, sellersCount: 14, defaultPrice: 4.00, defaultUnit: 'lb' },
  { id: 'persimmons',        name: 'Persimmons',      category: 'produce', displayCategory: 'Fruit', image: '/products/persimmons.jpg',      buyersCount: 34, sellersCount: 12, defaultPrice: 1.50, defaultUnit: 'each' },
  { id: 'pomegranates',      name: 'Pomegranates',    category: 'produce', displayCategory: 'Fruit', image: '/products/pomegranates.jpg',    buyersCount: 29, sellersCount: 9,  defaultPrice: 2.00, defaultUnit: 'each' },
  { id: 'peaches',           name: 'Peaches',         category: 'produce', displayCategory: 'Fruit', image: '/products/peaches.jpg',         buyersCount: 46, sellersCount: 17, defaultPrice: 2.50, defaultUnit: 'lb' },
  { id: 'nectarines',        name: 'Nectarines',      category: 'produce', displayCategory: 'Fruit', image: `${BUCKET}/studio_nectarines.jpg`,    buyersCount: 38, sellersCount: 13, defaultPrice: 2.50, defaultUnit: 'lb' },
  { id: 'plums',             name: 'Plums',           category: 'produce', displayCategory: 'Fruit', image: `${BUCKET}/studio_plums.jpg`,         buyersCount: 31, sellersCount: 10, defaultPrice: 2.50, defaultUnit: 'lb' },
  { id: 'cherries',          name: 'Cherries',        category: 'produce', displayCategory: 'Fruit', image: `${BUCKET}/studio_cherries.jpg`,      buyersCount: 49, sellersCount: 15, defaultPrice: 4.50, defaultUnit: 'lb' },
  { id: 'apples',            name: 'Apples',          category: 'produce', displayCategory: 'Fruit', image: `${BUCKET}/studio_apples.jpg`,        buyersCount: 51, sellersCount: 19, defaultPrice: 2.00, defaultUnit: 'lb' },
  { id: 'pears',             name: 'Pears',           category: 'produce', displayCategory: 'Fruit', image: `${BUCKET}/studio_pears.jpg`,         buyersCount: 28, sellersCount: 8,  defaultPrice: 2.00, defaultUnit: 'lb' },
  { id: 'strawberries',      name: 'Strawberries',    category: 'produce', displayCategory: 'Fruit', image: `${BUCKET}/studio_strawberries.jpg`,  buyersCount: 62, sellersCount: 22, defaultPrice: 4.00, defaultUnit: 'lb' },
  { id: 'blueberries',       name: 'Blueberries',     category: 'produce', displayCategory: 'Fruit', image: `${BUCKET}/studio_blueberries.jpg`,   buyersCount: 54, sellersCount: 18, defaultPrice: 5.00, defaultUnit: 'lb' },
  { id: 'blackberries',      name: 'Blackberries',    category: 'produce', displayCategory: 'Fruit', image: `${BUCKET}/studio_blackberries.jpg`,  buyersCount: 45, sellersCount: 14, defaultPrice: 5.00, defaultUnit: 'lb' },
  { id: 'raspberries',       name: 'Raspberries',     category: 'produce', displayCategory: 'Fruit', image: `${BUCKET}/studio_raspberries.jpg`,   buyersCount: 38, sellersCount: 11, defaultPrice: 5.00, defaultUnit: 'lb' },
  { id: 'watermelon',        name: 'Watermelon',      category: 'produce', displayCategory: 'Fruit', image: `${BUCKET}/studio_watermelon.jpg`,    buyersCount: 43, sellersCount: 14, defaultPrice: 5.00, defaultUnit: 'each' },
  { id: 'cantaloupe',        name: 'Cantaloupe',      category: 'produce', displayCategory: 'Fruit', image: `${BUCKET}/studio_cantaloupe.jpg`,    buyersCount: 25, sellersCount: 8,  defaultPrice: 4.00, defaultUnit: 'each' },
  { id: 'honeydew',          name: 'Honeydew',        category: 'produce', displayCategory: 'Fruit', image: `${BUCKET}/studio_honeydew.jpg`,      buyersCount: 19, sellersCount: 6,  defaultPrice: 4.00, defaultUnit: 'each' },
  { id: 'grapes',            name: 'Grapes',          category: 'produce', displayCategory: 'Fruit', image: `${BUCKET}/studio_grapes.jpg`,        buyersCount: 37, sellersCount: 12, defaultPrice: 3.00, defaultUnit: 'lb' },
  { id: 'mangoes',           name: 'Mangoes',         category: 'produce', displayCategory: 'Fruit', image: `${BUCKET}/studio_mangoes.jpg`,       buyersCount: 40, sellersCount: 13, defaultPrice: 2.00, defaultUnit: 'each' },
  { id: 'passionfruit',      name: 'Passionfruit',    category: 'produce', displayCategory: 'Fruit', image: `${BUCKET}/studio_passionfruit.jpg`,  buyersCount: 22, sellersCount: 7,  defaultPrice: 1.50, defaultUnit: 'each' },
  { id: 'guavas',            name: 'Guavas',          category: 'produce', displayCategory: 'Fruit', image: `${BUCKET}/studio_guavas.jpg`,        buyersCount: 17, sellersCount: 5,  defaultPrice: 1.50, defaultUnit: 'each' },

  // ── HERBS ──
  { id: 'basil',      name: 'Basil',       category: 'herbs', displayCategory: 'Herbs', image: '/products/fresh-basil.png',          buyersCount: 45, sellersCount: 17, defaultPrice: 2.00, defaultUnit: 'bunch' },
  { id: 'mint',       name: 'Mint',        category: 'herbs', displayCategory: 'Herbs', image: `${BUCKET}/studio_mint.jpg`,           buyersCount: 35, sellersCount: 13, defaultPrice: 2.00, defaultUnit: 'bunch' },
  { id: 'rosemary',   name: 'Rosemary',    category: 'herbs', displayCategory: 'Herbs', image: `${BUCKET}/studio_rosemary.jpg`,       buyersCount: 38, sellersCount: 14, defaultPrice: 2.00, defaultUnit: 'bunch' },
  { id: 'thyme',      name: 'Thyme',       category: 'herbs', displayCategory: 'Herbs', image: `${BUCKET}/studio_thyme.jpg`,          buyersCount: 22, sellersCount: 7,  defaultPrice: 2.00, defaultUnit: 'bunch' },
  { id: 'parsley',    name: 'Parsley',     category: 'herbs', displayCategory: 'Herbs', image: `${BUCKET}/studio_parsley.jpg`,        buyersCount: 32, sellersCount: 11, defaultPrice: 1.50, defaultUnit: 'bunch' },
  { id: 'cilantro',   name: 'Cilantro',    category: 'herbs', displayCategory: 'Herbs', image: `${BUCKET}/studio_cilantro.jpg`,       buyersCount: 42, sellersCount: 16, defaultPrice: 1.50, defaultUnit: 'bunch' },
  { id: 'oregano',    name: 'Oregano',     category: 'herbs', displayCategory: 'Herbs', image: `${BUCKET}/studio_oregano.jpg`,        buyersCount: 25, sellersCount: 8,  defaultPrice: 2.00, defaultUnit: 'bunch' },
  { id: 'sage',       name: 'Sage',        category: 'herbs', displayCategory: 'Herbs', image: `${BUCKET}/studio_sage.jpg`,           buyersCount: 18, sellersCount: 5,  defaultPrice: 2.00, defaultUnit: 'bunch' },
  { id: 'chives',     name: 'Chives',      category: 'herbs', displayCategory: 'Herbs', image: `${BUCKET}/studio_chives.jpg`,         buyersCount: 20, sellersCount: 6,  defaultPrice: 2.00, defaultUnit: 'bunch' },
  { id: 'dill',       name: 'Dill',        category: 'herbs', displayCategory: 'Herbs', image: `${BUCKET}/studio_dill.jpg`,           buyersCount: 16, sellersCount: 5,  defaultPrice: 2.00, defaultUnit: 'bunch' },
  { id: 'lavender',   name: 'Lavender',    category: 'herbs', displayCategory: 'Herbs', image: `${BUCKET}/studio_lavender.jpg`,       buyersCount: 31, sellersCount: 10, defaultPrice: 3.00, defaultUnit: 'bunch' },

  // ── FLOWERS ──
  { id: 'sunflowers', name: 'Sunflowers',    category: 'flowers', displayCategory: 'Flowers', image: `${BUCKET}/studio_sunflowers.jpg`,  buyersCount: 54, sellersCount: 20, defaultPrice: 8.00, defaultUnit: 'bunch' },
  { id: 'dahlias',    name: 'Dahlias',       category: 'flowers', displayCategory: 'Flowers', image: `${BUCKET}/studio_dahlias.jpg`,     buyersCount: 39, sellersCount: 14, defaultPrice: 10.00, defaultUnit: 'bunch' },
  { id: 'zinnias',    name: 'Zinnias',       category: 'flowers', displayCategory: 'Flowers', image: `${BUCKET}/studio_zinnias.jpg`,     buyersCount: 31, sellersCount: 11, defaultPrice: 8.00, defaultUnit: 'bunch' },

  // ── HONEY & EGGS ──
  { id: 'raw_honey',      name: 'Raw Wildflower Honey',  category: 'honey', displayCategory: 'Honey & Eggs', image: `${BUCKET}/studio_raw_honey.jpg`,      buyersCount: 76, sellersCount: 25, defaultPrice: 12.00, defaultUnit: 'jar' },
  { id: 'honeycomb',      name: 'Fresh Honeycomb',       category: 'honey', displayCategory: 'Honey & Eggs', image: `${BUCKET}/studio_honeycomb.jpg`,      buyersCount: 32, sellersCount: 9,  defaultPrice: 15.00, defaultUnit: 'box' },
  { id: 'chicken_eggs',   name: 'Pastured Chicken Eggs', category: 'eggs',  displayCategory: 'Honey & Eggs', image: '/products/fresh-eggs.png',            buyersCount: 92, sellersCount: 38, defaultPrice: 6.00, defaultUnit: 'dozen' },
  { id: 'duck_eggs',      name: 'Duck Eggs',             category: 'eggs',  displayCategory: 'Honey & Eggs', image: `${BUCKET}/studio_duck_eggs.jpg`,      buyersCount: 28, sellersCount: 8,  defaultPrice: 8.00, defaultUnit: 'dozen' },
  { id: 'quail_eggs',     name: 'Quail Eggs',            category: 'eggs',  displayCategory: 'Honey & Eggs', image: `${BUCKET}/studio_quail_eggs.jpg`,     buyersCount: 21, sellersCount: 6,  defaultPrice: 5.00, defaultUnit: 'dozen' },

  // ── STARTER PLANTS ──
  { id: 'tomato_seedling',  name: 'Tomato Seedling',       category: 'seedlings', displayCategory: 'Starter Plants', image: `${BUCKET}/studio_tomato_seedling.jpg`,   buyersCount: 45, sellersCount: 16, defaultPrice: 4.00, defaultUnit: 'each' },
  { id: 'pepper_seedling',  name: 'Pepper Seedling',       category: 'seedlings', displayCategory: 'Starter Plants', image: `${BUCKET}/studio_pepper_seedling.jpg`,   buyersCount: 38, sellersCount: 14, defaultPrice: 4.00, defaultUnit: 'each' },
  { id: 'lemon_sapling',    name: 'Lemon Tree Sapling',    category: 'plants',    displayCategory: 'Starter Plants', image: `${BUCKET}/studio_lemon_sapling.jpg`,     buyersCount: 29, sellersCount: 10, defaultPrice: 25.00, defaultUnit: 'each' },
  { id: 'fig_sapling',      name: 'Fig Tree Sapling',      category: 'plants',    displayCategory: 'Starter Plants', image: `${BUCKET}/studio_fig_sapling.jpg`,       buyersCount: 24, sellersCount: 8,  defaultPrice: 25.00, defaultUnit: 'each' },
  { id: 'avocado_sapling',  name: 'Avocado Tree Sapling',  category: 'plants',    displayCategory: 'Starter Plants', image: `${BUCKET}/studio_avocado_sapling.jpg`,   buyersCount: 22, sellersCount: 7,  defaultPrice: 30.00, defaultUnit: 'each' },
]

export function getInterestImage(name?: string): string {
  if (!name) return '/images/produce_placeholder.jpg'
  const normalized = name.toLowerCase().trim()
  const found = EXHAUSTIVE_INTERESTS_CATALOG.find(
    p => p.name.toLowerCase() === normalized || p.id === normalized
  )
  return found?.image || '/images/produce_placeholder.jpg'
}
