-- ============================================================================
-- Seed: ~1000 Demo Products across 9 valid categories
-- Uses compact array + loop insertion for efficiency.
-- All content is moderation-safe. All photos from Unsplash.
-- ============================================================================

SET search_path TO public, extensions;

-- ── PRODUCE (~300 items) ──
DO $$
DECLARE
  names text[] := ARRAY[
    'Heirloom Tomatoes','Cherry Tomatoes','Roma Tomatoes','Beefsteak Tomatoes','Green Tomatoes',
    'Sweet Corn','Yellow Corn','Baby Corn','Butter Lettuce','Romaine Lettuce',
    'Red Leaf Lettuce','Iceberg Lettuce','Arugula','Spinach','Baby Spinach',
    'Kale','Swiss Chard','Collard Greens','Mustard Greens','Bok Choy',
    'Napa Cabbage','Red Cabbage','Green Cabbage','Brussels Sprouts','Broccoli',
    'Cauliflower','Broccolini','Green Beans','Snap Peas','Snow Peas',
    'English Peas','Lima Beans','Edamame','Zucchini','Yellow Squash',
    'Butternut Squash','Acorn Squash','Spaghetti Squash','Pumpkin','Delicata Squash',
    'Bell Peppers','Serrano Peppers','Jalapeno Peppers','Habanero Peppers','Banana Peppers',
    'Poblano Peppers','Anaheim Peppers','Sweet Mini Peppers','Red Onions','Yellow Onions',
    'White Onions','Green Onions','Shallots','Leeks','Garlic',
    'Elephant Garlic','Ginger Root','Turmeric Root','Carrots','Baby Carrots',
    'Rainbow Carrots','Beets','Golden Beets','Radishes','Watermelon Radishes',
    'Daikon','Turnips','Rutabaga','Parsnips','Celery',
    'Celery Root','Kohlrabi','Fennel','Artichokes','Asparagus',
    'Cucumbers','Persian Cucumbers','English Cucumbers','Pickling Cucumbers','Eggplant',
    'Japanese Eggplant','White Eggplant','Sweet Potatoes','Purple Sweet Potatoes','Russet Potatoes',
    'Red Potatoes','Yukon Gold Potatoes','Fingerling Potatoes','New Potatoes','Taro Root',
    'Jicama','Yuca','Chayote','Okra','Fresh Corn',
    'Rhubarb','Watercress','Endive','Radicchio','Frisee',
    'Microgreens','Pea Shoots','Sunflower Sprouts','Bean Sprouts','Alfalfa Sprouts',
    'Navel Oranges','Valencia Oranges','Blood Oranges','Cara Cara Oranges','Mandarin Oranges',
    'Tangerines','Clementines','Satsumas','Meyer Lemons','Eureka Lemons',
    'Limes','Key Limes','Grapefruit','Ruby Red Grapefruit','Pomelos',
    'Kumquats','Tangelos','Minneolas','Hass Avocados','Fuerte Avocados',
    'Persimmons','Fuyu Persimmons','Asian Pears','Guava','Passion Fruit',
    'Dragon Fruit','Star Fruit','Loquats','Mulberries','Blackberries',
    'Raspberries','Blueberries','Strawberries','Boysenberries','Gooseberries',
    'Ground Cherries','Tomatillos','Figs','Black Mission Figs','Pomegranates',
    'Grapes','Concord Grapes','Muscadine Grapes','Table Grapes','Peaches',
    'Nectarines','Plums','Apricots','Cherries','Lychee',
    'Jackfruit','Breadfruit','Plantains','Fresh Fava Beans','Fresh Black-eyed Peas'
  ];
  descs text[] := ARRAY[
    'Vine-ripened, bursting with flavor.','Sweet and perfect for salads.','Great for sauces and paste.',
    'Large, juicy, and perfect for sandwiches.','Tangy, great for frying.','Freshly picked sweet corn.',
    'Golden kernels, farm fresh.','Tender baby corn for stir-fry.','Soft, buttery leaves.',
    'Crisp hearts, perfect for Caesar.','Tender red-tipped leaves.','Classic crunch for any salad.',
    'Peppery and fresh picked.','Nutrient-rich dark greens.','Tender young spinach leaves.',
    'Hearty superfood greens.','Colorful stems and tender leaves.','Traditional Southern greens.',
    'Spicy, nutritious greens.','Crisp Asian greens, mild flavor.','Tender and sweet for cooking.',
    'Beautiful purple leaves.','Classic green heads, freshly cut.','Tiny cabbages, nutty flavor.',
    'Dense green florets, fresh cut.','White florets, versatile veggie.','Tender long-stemmed broccoli.',
    'Crisp and snappy.','Sweet edible pods.','Flat, tender pods.',
    'Sweet shelling peas.','Creamy when cooked.','Fresh green soybeans.',
    'Tender summer squash.','Mild, versatile squash.','Sweet, nutty winter squash.',
    'Richly flavored winter squash.','Unique stringy flesh.','Perfect for pies and decor.',
    'Sweet, scalloped squash.','Crisp and colorful.','Fiery heat, small size.',
    'Classic medium heat pepper.','Extremely hot, use with care.','Mild, sweet, and tangy.',
    'Rich, earthy flavor when roasted.','Mild, great for stuffing.','Colorful and crunchy.',
    'Sharp and flavorful.','Mellow, all-purpose onion.','Mild and sweet.',
    'Fresh green tops with mild bulb.','Small, delicate flavor.','Mild onion flavor, great in soup.',
    'Freshly harvested bulbs.','Mild, extra-large cloves.','Fresh, spicy root.',
    'Bright golden root.','Sweet and crunchy roots.','Tender mini carrots.',
    'Stunning multicolor roots.','Earthy, ruby-red roots.','Sweet golden beets.',
    'Peppery little roots.','Beautiful pink interior.','Mild, crunchy Asian radish.',
    'Slightly sweet root veggie.','Large, hearty root.','Sweet, cream-colored roots.',
    'Crisp, mild stalks.','Knobby root with celery flavor.','Round, crunchy bulb.',
    'Licorice-scented bulb and fronds.','Tender hearts, seasonal treat.','Elegant spring spears.',
    'Cool and crunchy.','Small, seedless, thin-skinned.','Long, nearly seedless.',
    'Small, perfect for preserving.','Glossy purple fruit.','Slender, tender Asian variety.',
    'Mild, creamy white variety.','Orange-fleshed, naturally sweet.','Vibrant purple and sweet.',
    'Classic baking potato.','Waxy, great for roasting.','Buttery, golden flesh.',
    'Small, elongated, nutty.','Tender, small potatoes.','Starchy tropical root.',
    'Crisp, sweet, refreshing.','Starchy root for cooking.','Mild green squash.',
    'Tender green pods.','Sweet golden ears.','Tart, bright red stalks.',
    'Peppery aquatic green.','Slightly bitter, elegant.','Red Italian chicory.',
    'Curly, slightly bitter green.','Tiny nutrient powerhouses.','Tender pea tendrils.',
    'Crunchy and nutty.','Crisp and fresh.','Mild, delicate sprouts.',
    'Sweet, seedless oranges.','Juicy, great for juicing.','Deep red, berry-like flavor.',
    'Pink flesh, extra sweet.','Easy-peel, sweet segments.','Sweet and easy to peel.',
    'Tiny, incredibly sweet.','Seedless and sweet.','Sweet, thin-skinned lemons.',
    'Classic tart lemons.','Juicy and tart.','Tiny, extra-tart limes.',
    'Tangy and refreshing.','Extra sweet and pink.','Large, mild citrus.',
    'Tiny, eat whole.','Citrus hybrid, very juicy.','Sweet-tart cross.',
    'Creamy and rich.','Smooth, green-skinned variety.','Sweet, fall fruit.',
    'Flat-bottomed, eat like apple.','Crisp, juicy pears.','Sweet tropical fruit.',
    'Tart and aromatic.','Vibrant pink flesh.','Sweet and tangy.',
    'Small orange fruits.','Dark, sweet berries.','Tart, delicate berries.',
    'Plump and sweet.','Juicy and sweet.','Dark purple cross.','Tart little berries.',
    'Sweet, husk-wrapped.','Tart green fruits for salsa.','Honey-sweet when ripe.',
    'Dark and luscious.','Jewel-like seeds inside.','Sweet table grapes.',
    'Intense purple, seeded.','Bronze, thick-skinned.','Seedless, sweet.',
    'Fuzzy, juicy stone fruit.','Smooth, sweet stone fruit.','Sweet or tart drupes.',
    'Delicate, sweet stone fruit.','Sweet, dark red gems.','Floral, translucent flesh.',
    'Large, sweet tropical fruit.','Starchy tropical fruit.','Cooking banana, must be cooked.',
    'Tender spring beans in pods.','Southern heritage legumes.'
  ];
  photos text[] := ARRAY[
    'https://images.unsplash.com/photo-1540420773420-3366772f4999?w=400',
    'https://images.unsplash.com/photo-1518843875459-f738682238a6?w=400',
    'https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?w=400',
    'https://images.unsplash.com/photo-1598170845058-32b9d6a5da37?w=400',
    'https://images.unsplash.com/photo-1601004890684-d8cbf643f5f2?w=400',
    'https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=400',
    'https://images.unsplash.com/photo-1573246123716-6b1782bfc499?w=400',
    'https://images.unsplash.com/photo-1590779033100-9f60a05a013d?w=400'
  ];
  units text[] := ARRAY['lb','lb','lb','each','bunch','lb','pint','each','bunch','lb','each','bag'];
  i integer;
  n integer;
  price numeric;
BEGIN
  n := array_length(names, 1);
  FOR i IN 1..n LOOP
    price := ROUND((1.0 + random() * 7.0)::numeric, 2);
    INSERT INTO demo_product_catalog (name, description, price_usd, unit, category, photo_url)
    VALUES (
      names[i],
      descs[LEAST(i, array_length(descs, 1))],
      price,
      units[1 + ((i - 1) % array_length(units, 1))],
      'produce',
      photos[1 + ((i - 1) % array_length(photos, 1))]
    );
  END LOOP;
  RAISE NOTICE 'Seeded % produce items', n;
END;
$$;

-- ── FLOWERS (~120 items) ──
DO $$
DECLARE
  names text[] := ARRAY[
    'Red Roses','Pink Roses','White Roses','Yellow Roses','Lavender Roses',
    'Sunflowers','Mini Sunflowers','Teddy Bear Sunflowers','Dahlias','Dinner Plate Dahlias',
    'Ball Dahlias','Cactus Dahlias','Tulips','French Tulips','Parrot Tulips',
    'Peonies','Pink Peonies','White Peonies','Coral Peonies','Hydrangeas',
    'Blue Hydrangeas','Pink Hydrangeas','White Hydrangeas','Lilies','Stargazer Lilies',
    'Asiatic Lilies','Casa Blanca Lilies','Carnations','Spray Carnations','Ranunculus',
    'Anemones','Lisianthus','Stock','Snapdragons','Sweet Peas',
    'Delphiniums','Larkspur','Zinnias','Cosmos','Marigolds',
    'Chrysanthemums','Spray Mums','Asters','Gerbera Daisies','Shasta Daisies',
    'Black-Eyed Susans','Coneflowers','Lavender Bundles','Dried Lavender','Eucalyptus',
    'Seeded Eucalyptus','Silver Dollar Eucalyptus','Olive Branches','Ferns','Sword Ferns',
    'Dusty Miller','Lamb''s Ear','Baby''s Breath','Wax Flower','Statice',
    'Protea','King Protea','Banksia','Bird of Paradise','Anthuriums',
    'Orchid Stems','Cymbidium Orchids','Freesia','Gardenias','Jasmine Vine',
    'Tuberose','Gladiolus','Foxglove','Hollyhocks','Morning Glories',
    'Sweet William','Dianthus','Calendula','Nasturtiums','Chamomile Flowers',
    'Yarrow','Queen Anne''s Lace','Feverfew','Purple Coneflower','Bee Balm',
    'Salvia','Russian Sage','Catmint','Coreopsis','Blanket Flower',
    'Helenium','Agapanthus','Crocosmia','Montbretia','Allium',
    'Globe Amaranth','Celosia','Cockscomb','Amaranth','Scabiosa',
    'Nigella','Sweet Sultan','Bachelor''s Buttons','Blue Bonnets','Verbena',
    'Lantana','Pentas','Zinnia Mix','Dahlia Mix','Wildflower Bouquet',
    'Mixed Garden Bouquet','Pastel Mix Bouquet','Bright Mix Bouquet','Seasonal Stems','Fresh Cut Greens'
  ];
  descs text[] := ARRAY[
    'Classic red blooms, freshly cut.','Soft pink, romantic stems.','Elegant white roses.',
    'Cheerful yellow blooms.','Unique lavender-hued petals.','Bright, tall sunflowers.',
    'Compact, charming sunflowers.','Fluffy, rounded sunflowers.','Stunning, layered petals.',
    'Massive, show-stopping blooms.','Round, ball-shaped dahlias.','Spiky, dramatic petals.',
    'Spring favorites in mixed colors.','Elegant long-stemmed tulips.','Ruffled, colorful petals.',
    'Luxurious, fragrant blooms.','Soft pink, full blooms.','Pure white, lush peonies.',
    'Warm coral tones, stunning.','Big, fluffy flower heads.','Vivid blue flower clusters.',
    'Soft pink, classic beauty.','Crisp white, elegant.','Fragrant, trumpet-shaped.',
    'Pink speckled, strongly scented.','Bright colors, long-lasting.','Pure white, very fragrant.',
    'Long-lasting, ruffled petals.','Multiple blooms per stem.','Delicate, layered petals.',
    'Dark-centered, papery petals.','Rose-like, long-lasting.','Fragrant, columnar blooms.',
    'Tall spikes, vivid colors.','Delicate, pastel tendrils.','Tall blue spires.',
    'Cottage garden favorite.','Colorful, easy to grow.','Delicate, airy blooms.',
    'Bold orange and gold.','Long-lasting fall favorites.','Multiple small blooms.',
    'Star-shaped fall flowers.','Large, vivid daisies.','Clean white petals.',
    'Wild, golden daisies.','Purple, sturdy stems.','Fragrant dried bundles.',
    'Long-lasting dried stems.','Aromatic, silvery leaves.','Textured seed pods.',
    'Round silver leaves.','Graceful, gray-green branches.','Lacy green fronds.',
    'Long, dramatic fronds.','Silver-gray foliage.','Soft, fuzzy leaves.',
    'Airy white filler.','Tiny pink or white blooms.','Papery, colorful clusters.'
  ];
  photos text[] := ARRAY[
    'https://images.unsplash.com/photo-1490750967868-88aa4f44baee?w=400',
    'https://images.unsplash.com/photo-1455659817273-f96807779a8a?w=400',
    'https://images.unsplash.com/photo-1606041008023-472dfb5e530f?w=400',
    'https://images.unsplash.com/photo-1468327768560-75b778cbb551?w=400',
    'https://images.unsplash.com/photo-1508610048659-a06b669e3321?w=400',
    'https://images.unsplash.com/photo-1490750967868-88aa4f44baee?w=400'
  ];
  units text[] := ARRAY['stem','bunch','bouquet','bunch','stem','dozen'];
  i integer; n integer; price numeric;
BEGIN
  n := array_length(names, 1);
  FOR i IN 1..n LOOP
    price := ROUND((2.0 + random() * 12.0)::numeric, 2);
    INSERT INTO demo_product_catalog (name, description, price_usd, unit, category, photo_url)
    VALUES (names[i], descs[LEAST(i, array_length(descs, 1))], price,
      units[1 + ((i-1) % array_length(units, 1))], 'flowers',
      photos[1 + ((i-1) % array_length(photos, 1))]);
  END LOOP;
  RAISE NOTICE 'Seeded % flower items', n;
END;
$$;

-- ── FLOWER ARRANGEMENTS (~80 items) ──
DO $$
DECLARE
  names text[] := ARRAY[
    'Spring Garden Bouquet','Summer Sunshine Mix','Autumn Harvest Arrangement','Winter Elegance Bouquet',
    'Birthday Celebration Bouquet','Thank You Bouquet','Get Well Soon Arrangement','Sympathy Wreath',
    'Wedding Centerpiece','Bridal Bouquet','Bridesmaid Bouquet','Corsage & Boutonniere Set',
    'Kitchen Table Arrangement','Desk Mini Bouquet','Mason Jar Wildflowers','Farmhouse Arrangement',
    'Pastel Dream Bouquet','Bold & Bright Mix','Monochrome White Arrangement','Sunset Colors Bouquet',
    'Rainbow Bouquet','Dried Flower Arrangement','Dried Wildflower Bundle','Pressed Flower Frame',
    'Succulent & Flower Mix','Herb & Flower Bouquet','Edible Flower Mix','Lavender & Rose Bundle',
    'Sunflower Field Bouquet','Peony Season Bouquet','Dahlia Festival Mix','Rose Garden Collection',
    'Cottage Garden Posy','English Garden Bouquet','French Market Bouquet','Tuscan Countryside Mix',
    'Tropical Paradise Arrangement','Mediterranean Blooms','Japanese Ikebana Arrangement','Zen Garden Stems',
    'Boho Dried Arrangement','Modern Minimalist Stems','Elegant Orchid Display','Romantic Rose Dozen',
    'Cheerful Daisy Bunch','Farmers Market Mix','Market Fresh Bouquet','Seasonal Best Picks',
    'Weekly Flower Subscription Box','Monthly Bloom Box','Petite Posy','Grand Statement Arrangement',
    'Garden Party Centerpiece','Dinner Party Flowers','Holiday Wreath','Spring Door Wreath',
    'Christmas Arrangement','Valentine Red Roses','Mother''s Day Special','Father''s Day Arrangement',
    'Eucalyptus & Greenery Bundle','Foliage Arrangement','Mixed Greens Bundle','Berry & Branch Arrangement',
    'Candle Ring Arrangement','Floating Flower Bowl','Single Stem Vase','Bud Vase Trio',
    'Tall Centerpiece','Low & Lush Arrangement','Cascading Bouquet','Hand-tied Garden Bunch',
    'Neutral Tones Bouquet','Jewel Tones Mix','Earth Tones Arrangement','Blush & Gold Arrangement',
    'Blue & White Arrangement','Purple Haze Bouquet','Peachy Keen Mix','Citrus Colors Bouquet'
  ];
  descs text[] := ARRAY[
    'Fresh seasonal flowers in a beautiful arrangement.','Bright and cheerful summer blooms.',
    'Warm tones perfect for autumn.','Elegant whites and greens for winter.',
    'Festive arrangement for celebrations.','Express gratitude with fresh blooms.',
    'Uplifting flowers to brighten recovery.','Thoughtful tribute arrangement.',
    'Elegant centerpiece for your special day.','Stunning bridal bouquet, customizable.',
    'Coordinated bridesmaid flowers.','Matching corsage and boutonniere.',
    'Perfect everyday table arrangement.','Compact arrangement for your workspace.',
    'Charming rustic wildflower arrangement.','Country-style arrangement.',
    'Soft pastel colors, dreamy feel.','Vibrant, eye-catching mixed blooms.',
    'All white, clean and elegant.','Warm oranges, pinks, and reds.'
  ];
  photos text[] := ARRAY[
    'https://images.unsplash.com/photo-1487530811176-3780de880c2d?w=400',
    'https://images.unsplash.com/photo-1561181286-d3fee7d55364?w=400',
    'https://images.unsplash.com/photo-1563341591-fde7707acb20?w=400',
    'https://images.unsplash.com/photo-1509223197845-458d87a6bfc5?w=400',
    'https://images.unsplash.com/photo-1561181286-d3fee7d55364?w=400'
  ];
  i integer; n integer; price numeric;
BEGIN
  n := array_length(names, 1);
  FOR i IN 1..n LOOP
    price := ROUND((12.0 + random() * 35.0)::numeric, 2);
    INSERT INTO demo_product_catalog (name, description, price_usd, unit, category, photo_url)
    VALUES (names[i], descs[LEAST(i, array_length(descs, 1))], price,
      'arrangement', 'flower_arrangements',
      photos[1 + ((i-1) % array_length(photos, 1))]);
  END LOOP;
  RAISE NOTICE 'Seeded % flower arrangement items', n;
END;
$$;

-- ── GARDEN EQUIPMENT (~80 items) ──
DO $$
DECLARE
  names text[] := ARRAY[
    'Hand Trowel','Garden Fork','Pruning Shears','Bypass Pruners','Anvil Pruners',
    'Hedge Shears','Loppers','Garden Rake','Leaf Rake','Bow Rake',
    'Garden Hoe','Weeding Hoe','Cultivator','Hand Cultivator','Dibber',
    'Garden Knife','Soil Knife','Harvesting Knife','Weeder','Dandelion Puller',
    'Kneeling Pad','Garden Kneeler','Garden Gloves','Leather Garden Gloves','Thorn-Proof Gloves',
    'Watering Can (2 gal)','Watering Can (1 gal)','Brass Hose Nozzle','Spray Bottle','Mister Bottle',
    'Plant Labels (50 pack)','Wooden Plant Stakes','Bamboo Stakes (6 ft)','Tomato Cages','Garden Twine',
    'Garden Wire','Plant Ties','Drip Irrigation Kit','Soaker Hose (25 ft)','Garden Timer',
    'Seed Starting Tray','Seed Starting Kit','Humidity Dome','Heat Mat','Grow Light',
    'Compost Bin','Compost Tumbler','Worm Composting Kit','Compost Thermometer','Compost Accelerator',
    'Wheelbarrow','Garden Cart','Tool Belt','Tool Tote','Garden Bucket',
    'Row Cover','Floating Row Cover','Bird Netting','Deer Fencing','Garden Hoop Set',
    'Cold Frame','Mini Greenhouse','Cloche Set','Raised Bed Kit (4x4)','Raised Bed Kit (4x8)',
    'Garden Edging','Landscape Fabric','Mulch Rings','Soaker Irrigation Ring','Rain Gauge',
    'Soil Thermometer','pH Test Kit','Soil Moisture Meter','Plant Food Spikes','Root Stimulator',
    'Neem Oil Spray','Insecticidal Soap','Diatomaceous Earth','Copper Fungicide','Slug Bait',
    'Pollinator House','Mason Bee House','Hummingbird Feeder','Bat House','Garden Journal'
  ];
  descs text[] := ARRAY[
    'Essential tool for planting and transplanting.','Sturdy fork for turning soil.',
    'Sharp, clean cuts for healthy plants.','Smooth cutting action for live stems.',
    'Great for cutting dead wood.','Trim hedges and shrubs with ease.',
    'Reach high branches easily.','Essential for leveling soil.','Lightweight for autumn cleanup.',
    'Heavy-duty for breaking soil.','Classic tool for weeding rows.',
    'Precision weeding between plants.','Loosen soil around plants.',
    'Compact, perfect for containers.','Make perfect planting holes.',
    'Versatile cutting and digging tool.','Specialized soil-cutting tool.',
    'Clean cuts for harvesting produce.','Remove weeds at the root.',
    'Long handle for deep-rooted weeds.'
  ];
  photos text[] := ARRAY[
    'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=400',
    'https://images.unsplash.com/photo-1585336261022-680e295ce3fe?w=400',
    'https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?w=400',
    'https://images.unsplash.com/photo-1523348837708-15d4a09cfac2?w=400',
    'https://images.unsplash.com/photo-1591857177580-dc82b9ac4e1e?w=400'
  ];
  i integer; n integer; price numeric;
BEGIN
  n := array_length(names, 1);
  FOR i IN 1..n LOOP
    price := ROUND((5.0 + random() * 40.0)::numeric, 2);
    INSERT INTO demo_product_catalog (name, description, price_usd, unit, category, photo_url)
    VALUES (names[i], descs[LEAST(i, array_length(descs, 1))], price,
      'each', 'garden_equipment',
      photos[1 + ((i-1) % array_length(photos, 1))]);
  END LOOP;
  RAISE NOTICE 'Seeded % garden equipment items', n;
END;
$$;

-- ── POTS (~80 items) ──
DO $$
DECLARE
  names text[] := ARRAY[
    'Terracotta Pot (6 in)','Terracotta Pot (8 in)','Terracotta Pot (10 in)','Terracotta Pot (12 in)',
    'Terracotta Saucer (6 in)','Terracotta Saucer (8 in)','Glazed Ceramic Pot (Blue)','Glazed Ceramic Pot (Green)',
    'Glazed Ceramic Pot (White)','Glazed Ceramic Pot (Black)','Glazed Planter (Large)','Glazed Planter (Medium)',
    'Self-Watering Pot (10 in)','Self-Watering Pot (14 in)','Self-Watering Planter Box','Hanging Basket (10 in)',
    'Hanging Basket (12 in)','Hanging Basket (Wire)','Coconut Liner Basket','Macrame Plant Hanger',
    'Window Box Planter (24 in)','Window Box Planter (36 in)','Balcony Rail Planter','Deck Rail Planter',
    'Fabric Grow Bag (5 gal)','Fabric Grow Bag (10 gal)','Fabric Grow Bag (15 gal)','Fabric Grow Bag (25 gal)',
    'Nursery Pot (1 gal)','Nursery Pot (3 gal)','Nursery Pot (5 gal)','Seed Starting Cells (72)',
    'Peat Pots (3 in, 24 pack)','Biodegradable Pots (4 in)','Concrete Planter (Round)','Concrete Planter (Square)',
    'Concrete Bowl Planter','Stone-Look Planter','Fiberglass Planter (Tall)','Fiberglass Planter (Low)',
    'Wooden Planter Box','Cedar Planter Box','Whiskey Barrel Planter','Painted Tin Planter',
    'Vintage Bucket Planter','Rustic Metal Planter','Galvanized Steel Trough','Copper Pot',
    'Brass Planter','Wicker Basket Planter','Rattan Planter','Bamboo Planter',
    'Succulent Pot (Small)','Succulent Pot Set (3 pack)','Bonsai Pot (Oval)','Bonsai Pot (Rectangle)',
    'Orchid Pot (Clear)','Orchid Pot (Ceramic)','Strawberry Pot (Stacked)','Herb Pot (Triple)',
    'Herb Windowsill Set','Vertical Garden Planter','Stackable Planter (3 tier)','Wall Planter',
    'Pocket Wall Planter','Plant Stand (Wood)','Plant Stand (Metal)','Tiered Plant Stand',
    'Corner Plant Stand','Rolling Plant Caddy','Plant Tray (Large)','Plant Tray (Small)',
    'Drip Tray Set','Pot Feet (4 pack)','Pot Risers','Decorative Pot Cover',
    'Ceramic Cache Pot','Indoor Planter with Stand','Outdoor Urn Planter','Classic Garden Urn'
  ];
  descs text[] := ARRAY[
    'Classic breathable clay pot.','Perfect for medium plants.','Great for large herbs and flowers.',
    'Spacious pot for small shrubs.','Matching saucer to catch water.','Protects surfaces from drainage.',
    'Beautiful blue glazed finish.','Earthy green ceramic pot.','Clean white ceramic planter.',
    'Modern black glazed pot.','Statement piece for patios.','Versatile medium planter.',
    'Built-in water reservoir.','Large self-watering container.','Long planter with water reservoir.',
    'Classic hanging basket.','Large hanging container.','Elegant wire frame basket.',
    'Natural coconut fiber liner.','Handmade macrame hanger.','Long window box for herbs.',
    'Extended window planter.','Clips onto balcony rails.','Mounts on deck railings.'
  ];
  photos text[] := ARRAY[
    'https://images.unsplash.com/photo-1459411552884-841db9b3cc2a?w=400',
    'https://images.unsplash.com/photo-1485955900006-10f4d324d411?w=400',
    'https://images.unsplash.com/photo-1509423350716-97f9360b4e09?w=400',
    'https://images.unsplash.com/photo-1466781783364-36c955e42a7f?w=400',
    'https://images.unsplash.com/photo-1591958911259-bee2173bdccc?w=400'
  ];
  i integer; n integer; price numeric;
BEGIN
  n := array_length(names, 1);
  FOR i IN 1..n LOOP
    price := ROUND((3.0 + random() * 30.0)::numeric, 2);
    INSERT INTO demo_product_catalog (name, description, price_usd, unit, category, photo_url)
    VALUES (names[i], descs[LEAST(i, array_length(descs, 1))], price,
      'each', 'pots',
      photos[1 + ((i-1) % array_length(photos, 1))]);
  END LOOP;
  RAISE NOTICE 'Seeded % pot items', n;
END;
$$;

-- ── SOIL (~80 items) ──
DO $$
DECLARE
  names text[] := ARRAY[
    'Premium Potting Mix (8 qt)','Premium Potting Mix (16 qt)','Organic Potting Soil (1 cu ft)',
    'Seed Starting Mix (8 qt)','Seed Starting Mix (16 qt)','Raised Bed Mix (1 cu ft)',
    'Raised Bed Mix (2 cu ft)','Garden Soil (1 cu ft)','Garden Soil (2 cu ft)',
    'Cactus & Succulent Mix','Orchid Bark Mix','African Violet Mix',
    'Citrus & Palm Mix','Rose Planting Mix','Azalea Mix (Acidic)',
    'Mushroom Compost (1 cu ft)','Organic Compost (1 cu ft)','Worm Castings (5 lb)',
    'Worm Castings (15 lb)','Aged Manure (1 cu ft)','Composted Chicken Manure',
    'Fish Compost','Leaf Mold','Peat Moss (1 cu ft)',
    'Coconut Coir Block','Coconut Coir (Loose, 8 qt)','Perlite (8 qt)','Perlite (4 cu ft)',
    'Vermiculite (8 qt)','Pumice (1 gal)','Horticultural Charcoal','Lava Rock (Small)',
    'Rice Hulls','Biochar (5 lb)','Mycorrhizae Inoculant','Root Zone Blend',
    'Water Retention Crystals','Soil Conditioner','Gypsum (5 lb)','Lime (5 lb)',
    'Sulfur (5 lb)','Bone Meal (4 lb)','Blood Meal (3 lb)','Feather Meal (4 lb)',
    'Fish Bone Meal (4 lb)','Kelp Meal (4 lb)','Alfalfa Meal (5 lb)','Cottonseed Meal (5 lb)',
    'Greensand (5 lb)','Rock Phosphate (5 lb)','Azomite (2 lb)','Epsom Salt (Garden Grade)',
    'Organic Fertilizer (All Purpose)','Tomato Fertilizer','Rose Fertilizer','Citrus Fertilizer',
    'Flower Fertilizer','Vegetable Fertilizer','Lawn Fertilizer (Organic)','Liquid Fish Fertilizer',
    'Liquid Seaweed Extract','Compost Tea (Concentrate)','Mulch (Cedar, 2 cu ft)','Mulch (Hardwood, 2 cu ft)',
    'Mulch (Pine Bark, 2 cu ft)','Straw Mulch (Bale)','Cocoa Shell Mulch','Pine Straw',
    'River Rock (Small, 0.5 cu ft)','Pea Gravel (0.5 cu ft)','Decomposed Granite','Sand (Horticultural)',
    'Top Soil (1 cu ft)','Top Soil (40 lb bag)','Fill Dirt','Clay Pebbles (Hydroton)',
    'Coco Peat Disc (10 pack)','Soil Test Kit','pH Adjustment Kit','Compost Starter'
  ];
  descs text[] := ARRAY[
    'Rich blend for container gardening.','Large bag for multiple pots.','Certified organic potting soil.',
    'Fine-textured mix for seed germination.','Large bag for starting many seeds.',
    'Perfect blend for raised bed gardens.','Value size for large raised beds.',
    'Nutrient-rich soil for in-ground planting.','Large bag for garden projects.',
    'Fast-draining mix for succulents.','Chunky bark for orchid roots.',
    'Tailored pH for African violets.','Nutrient blend for citrus trees.',
    'Enriched soil for healthy roses.','Acidic mix for acid-loving plants.',
    'Rich, composted mushroom substrate.','Finished compost for soil enrichment.',
    'Nutrient-rich worm castings.','Bulk worm castings for gardens.',
    'Well-aged, safe for all plants.','High-nitrogen organic amendment.'
  ];
  photos text[] := ARRAY[
    'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=400',
    'https://images.unsplash.com/photo-1585336261022-680e295ce3fe?w=400',
    'https://images.unsplash.com/photo-1523348837708-15d4a09cfac2?w=400',
    'https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?w=400'
  ];
  i integer; n integer; price numeric;
BEGIN
  n := array_length(names, 1);
  FOR i IN 1..n LOOP
    price := ROUND((4.0 + random() * 18.0)::numeric, 2);
    INSERT INTO demo_product_catalog (name, description, price_usd, unit, category, photo_url)
    VALUES (names[i], descs[LEAST(i, array_length(descs, 1))], price,
      'bag', 'soil',
      photos[1 + ((i-1) % array_length(photos, 1))]);
  END LOOP;
  RAISE NOTICE 'Seeded % soil items', n;
END;
$$;

-- ── SEEDS (~100 items) ──
DO $$
DECLARE
  names text[] := ARRAY[
    'Tomato Seeds (Heirloom Mix)','Tomato Seeds (Cherokee Purple)','Tomato Seeds (Brandywine)',
    'Tomato Seeds (San Marzano)','Tomato Seeds (Sweet 100)','Pepper Seeds (Bell Mix)',
    'Pepper Seeds (Jalapeno)','Pepper Seeds (Habanero)','Pepper Seeds (Cayenne)',
    'Pepper Seeds (Poblano)','Cucumber Seeds (Marketmore)','Cucumber Seeds (Lemon)',
    'Squash Seeds (Zucchini)','Squash Seeds (Butternut)','Squash Seeds (Acorn)',
    'Pumpkin Seeds (Sugar Pie)','Pumpkin Seeds (Jack O''Lantern)','Pumpkin Seeds (Giant)',
    'Lettuce Seeds (Butterhead)','Lettuce Seeds (Mesclun Mix)','Lettuce Seeds (Romaine)',
    'Spinach Seeds (Bloomsdale)','Kale Seeds (Lacinato)','Kale Seeds (Red Russian)',
    'Swiss Chard Seeds (Rainbow)','Arugula Seeds','Microgreen Seed Mix',
    'Radish Seeds (Cherry Belle)','Radish Seeds (French Breakfast)','Carrot Seeds (Nantes)',
    'Carrot Seeds (Rainbow Mix)','Beet Seeds (Detroit Dark Red)','Beet Seeds (Golden)',
    'Turnip Seeds (Purple Top)','Parsnip Seeds','Onion Seeds (Yellow Spanish)',
    'Leek Seeds','Green Onion Seeds','Garlic Bulbs (for planting)',
    'Bean Seeds (Blue Lake Bush)','Bean Seeds (Kentucky Wonder)','Pea Seeds (Sugar Snap)',
    'Pea Seeds (Shelling)','Corn Seeds (Golden Bantam)','Corn Seeds (Painted Mountain)',
    'Basil Seeds (Genovese)','Basil Seeds (Thai)','Basil Seeds (Purple)',
    'Cilantro Seeds','Parsley Seeds (Italian Flat)','Parsley Seeds (Curly)',
    'Dill Seeds','Chive Seeds','Oregano Seeds',
    'Thyme Seeds','Rosemary Seeds','Sage Seeds',
    'Mint Seeds (Spearmint)','Mint Seeds (Peppermint)','Lavender Seeds',
    'Chamomile Seeds','Lemongrass Seeds','Fennel Seeds',
    'Stevia Seeds','Echinacea Seeds','Borage Seeds',
    'Nasturtium Seeds','Calendula Seeds','Marigold Seeds',
    'Zinnia Seeds (Giant Mix)','Sunflower Seeds (Mammoth)','Sunflower Seeds (Dwarf)',
    'Cosmos Seeds (Mix)','Sweet Pea Seeds','Morning Glory Seeds',
    'Wildflower Seed Mix','Pollinator Garden Mix','Butterfly Garden Mix',
    'Native Wildflower Mix','Shade Garden Mix','Drought Tolerant Mix',
    'Hummingbird Garden Mix','Medicinal Herb Mix','Salsa Garden Kit',
    'Pizza Garden Kit','Salad Garden Kit','Stir Fry Garden Kit',
    'Three Sisters Garden Kit','Herb Window Garden Kit','Container Garden Seed Set',
    'Kids Garden Kit','Beginner Vegetable Set','Heirloom Variety Collection',
    'Hot Pepper Collection','Sweet Pepper Collection','Melon Seeds (Cantaloupe)',
    'Melon Seeds (Honeydew)','Watermelon Seeds (Sugar Baby)','Watermelon Seeds (Crimson Sweet)',
    'Okra Seeds','Eggplant Seeds (Black Beauty)','Broccoli Seeds',
    'Cauliflower Seeds','Brussels Sprout Seeds','Cabbage Seeds'
  ];
  descs text[] := ARRAY[
    'Mix of colorful heirloom varieties.','Dark, rich-flavored heirloom.','Classic pink beefsteak heirloom.',
    'Italian paste tomato, great for sauce.','Prolific cherry tomato producer.',
    'Mixed colors of bell peppers.','Classic medium-heat pepper.','Very hot, fruity flavor.',
    'Hot, thin-walled drying pepper.','Mild, great for stuffing and roasting.',
    'Reliable slicing cucumber.','Round, mild, yellow cucumber.',
    'Prolific summer squash.','Sweet, nutty winter squash.',
    'Small, flavorful winter squash.','Sweet, perfect for pies.',
    'Classic carving pumpkin.','Grow a massive pumpkin.',
    'Soft, tender lettuce heads.','Mixed baby salad greens.',
    'Crisp romaine lettuce.','Heirloom savoy spinach.',
    'Italian dinosaur kale.','Beautiful red-purple kale.'
  ];
  photos text[] := ARRAY[
    'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=400',
    'https://images.unsplash.com/photo-1523348837708-15d4a09cfac2?w=400',
    'https://images.unsplash.com/photo-1466692476868-aef1dfb1e735?w=400',
    'https://images.unsplash.com/photo-1591857177580-dc82b9ac4e1e?w=400',
    'https://images.unsplash.com/photo-1585336261022-680e295ce3fe?w=400'
  ];
  i integer; n integer; price numeric;
BEGIN
  n := array_length(names, 1);
  FOR i IN 1..n LOOP
    price := ROUND((2.0 + random() * 10.0)::numeric, 2);
    INSERT INTO demo_product_catalog (name, description, price_usd, unit, category, photo_url)
    VALUES (names[i], descs[LEAST(i, array_length(descs, 1))], price,
      'packet', 'seeds',
      photos[1 + ((i-1) % array_length(photos, 1))]);
  END LOOP;
  RAISE NOTICE 'Seeded % seed items', n;
END;
$$;

-- ── EGGS (~70 items) ──
DO $$
DECLARE
  names text[] := ARRAY[
    'Farm Fresh Eggs (1 dozen)','Farm Fresh Eggs (half dozen)','Jumbo Eggs (1 dozen)',
    'Medium Eggs (1 dozen)','Brown Eggs (1 dozen)','White Eggs (1 dozen)',
    'Free Range Eggs (1 dozen)','Pasture Raised Eggs (1 dozen)','Organic Eggs (1 dozen)',
    'Heritage Breed Eggs (1 dozen)','Araucana Blue Eggs (half dozen)','Olive Egger Eggs (half dozen)',
    'Maran Dark Brown Eggs (half dozen)','Speckled Eggs (half dozen)','Rainbow Egg Mix (1 dozen)',
    'Duck Eggs (half dozen)','Duck Eggs (1 dozen)','Jumbo Duck Eggs (half dozen)',
    'Quail Eggs (1 dozen)','Quail Eggs (2 dozen)','Guinea Fowl Eggs (half dozen)',
    'Turkey Eggs (half dozen)','Goose Eggs (4 pack)','Emu Eggs (single)',
    'Fertile Hatching Eggs (6 pack)','Fertile Chicken Eggs (1 dozen)','Bantam Eggs (1 dozen)',
    'Silkie Eggs (half dozen)','Polish Hen Eggs (half dozen)','Easter Egger Eggs (1 dozen)',
    'Americauna Eggs (1 dozen)','Leghorn Eggs (1 dozen)','Plymouth Rock Eggs (1 dozen)',
    'Rhode Island Red Eggs (doz)','Orpington Eggs (1 dozen)','Wyandotte Eggs (1 dozen)',
    'Sussex Eggs (1 dozen)','Brahma Eggs (1 dozen)','Cochin Eggs (1 dozen)',
    'Barnyard Mix Eggs (1 dozen)','Soy-Free Eggs (1 dozen)','Corn-Free Eggs (1 dozen)',
    'Omega-3 Eggs (1 dozen)','Vitamin D Eggs (1 dozen)','Double Yolk Eggs (half doz)',
    'Pickled Eggs (pint jar)','Pickled Eggs (quart jar)','Deviled Egg Kit',
    'Egg Noodles (Fresh, 1 lb)','Egg Pasta (Fresh, 1 lb)','Scotch Eggs (4 pack)',
    'Egg Custard (pint)','Eggnog (quart, seasonal)','Egg Salad (pint)',
    'Quiche (whole, 9 in)','Quiche Lorraine','Vegetable Quiche',
    'Frittata (whole)','Egg Muffins (6 pack)','Breakfast Burritos (4 pack)',
    'Egg & Cheese Sandwiches (4)','Shakshuka Kit','Egg Drop Soup Kit',
    'Challah Bread (egg bread)','Brioche Loaf','Angel Food Cake',
    'Meringue Cookies (dozen)','Lemon Curd (half pint)','Hollandaise Mix',
    'Egg Cartons (10 pack)','Egg Basket','Egg Apron'
  ];
  descs text[] := ARRAY[
    'Freshly collected from happy hens.','Perfect for small households.',
    'Extra-large eggs, rich yolks.','Standard size, great for baking.',
    'Classic brown eggs from heritage hens.','Traditional white-shell eggs.',
    'Hens roam freely on pasture.','Hens raised on open pasture.','Certified organic feed, free range.',
    'Eggs from heritage breed chickens.','Beautiful blue-green shells.',
    'Stunning olive-green colored shells.','Dark chocolate brown shells.',
    'Naturally speckled, beautiful shells.','Mix of blue, green, brown, and white.',
    'Rich, creamy duck eggs.','Full dozen duck eggs.','Extra-large duck eggs.',
    'Tiny, delicate quail eggs.','Party-sized pack of quail eggs.',
    'Spotted guinea fowl eggs.','Large, rich turkey eggs.',
    'Very large, rich goose eggs.','Single large emu egg.',
    'Fertilized eggs for hatching.','Fertile eggs for incubating.'
  ];
  photos text[] := ARRAY[
    'https://images.unsplash.com/photo-1569288052389-dac9b0ac9eee?w=400',
    'https://images.unsplash.com/photo-1498654077810-12c21d4d6dc3?w=400',
    'https://images.unsplash.com/photo-1582722872445-44dc5f7e3c8f?w=400',
    'https://images.unsplash.com/photo-1506976785307-8732e854ad03?w=400'
  ];
  i integer; n integer; price numeric;
BEGIN
  n := array_length(names, 1);
  FOR i IN 1..n LOOP
    price := ROUND((3.0 + random() * 9.0)::numeric, 2);
    INSERT INTO demo_product_catalog (name, description, price_usd, unit, category, photo_url)
    VALUES (names[i], descs[LEAST(i, array_length(descs, 1))], price,
      'dozen', 'eggs',
      photos[1 + ((i-1) % array_length(photos, 1))]);
  END LOOP;
  RAISE NOTICE 'Seeded % egg items', n;
END;
$$;

-- ── HONEY (~70 items) ──
DO $$
DECLARE
  names text[] := ARRAY[
    'Raw Wildflower Honey (8 oz)','Raw Wildflower Honey (16 oz)','Raw Wildflower Honey (32 oz)',
    'Clover Honey (8 oz)','Clover Honey (16 oz)','Clover Honey (32 oz)',
    'Orange Blossom Honey (8 oz)','Orange Blossom Honey (16 oz)','Buckwheat Honey (8 oz)',
    'Buckwheat Honey (16 oz)','Avocado Honey (8 oz)','Sage Honey (8 oz)',
    'Eucalyptus Honey (8 oz)','Lavender Honey (8 oz)','Acacia Honey (8 oz)',
    'Manuka Honey (8 oz)','Tupelo Honey (8 oz)','Sourwood Honey (8 oz)',
    'Basswood Honey (8 oz)','Blueberry Honey (8 oz)','Cranberry Honey (8 oz)',
    'Alfalfa Honey (16 oz)','Star Thistle Honey (8 oz)','Blackberry Honey (8 oz)',
    'Raspberry Honey (8 oz)','Meadowfoam Honey (8 oz)','Fireweed Honey (8 oz)',
    'Creamed Honey (12 oz)','Creamed Honey (Cinnamon)','Creamed Honey (Vanilla)',
    'Creamed Honey (Lemon)','Creamed Honey (Ginger)','Creamed Honey (Chai Spice)',
    'Infused Honey (Hot Pepper)','Infused Honey (Garlic)','Infused Honey (Rosemary)',
    'Infused Honey (Truffle)','Infused Honey (Bourbon Vanilla)','Infused Honey (Cinnamon Stick)',
    'Honey Sticks (10 pack)','Honey Sticks (25 pack)','Mini Honey Jars (2 oz, 6 pk)',
    'Honeycomb (8 oz section)','Honeycomb (16 oz section)','Cut Comb Honey',
    'Chunk Honey (16 oz)','Whipped Honey (12 oz)','Honey Butter (8 oz)',
    'Honey Mustard (8 oz)','Honey Vinaigrette (8 oz)','Honey BBQ Sauce (12 oz)',
    'Honey Sriracha (8 oz)','Hot Honey (8 oz)','Honey Lemon Drops (bag)',
    'Honey Caramels (8 oz)','Honey Candy (assorted)','Beeswax Candle (Pillar)',
    'Beeswax Candle (Taper, pair)','Beeswax Candle (Votive, 4 pk)','Beeswax Tea Lights (12 pk)',
    'Beeswax Wrap Set (3 pack)','Beeswax Lip Balm','Beeswax Hand Cream',
    'Beeswax Wood Polish','Propolis Tincture (1 oz)','Bee Pollen (4 oz)',
    'Bee Pollen (8 oz)','Royal Jelly (1 oz)','Mead (Honey Wine, 375ml)',
    'Honey Gift Box (3 jar set)','Honey Sampler (5 jar set)','Honey Bear (12 oz)'
  ];
  descs text[] := ARRAY[
    'Unfiltered raw honey from local wildflowers.','Large jar of raw wildflower honey.',
    'Family-size raw wildflower honey.','Light, mild clover honey.',
    'Classic clover honey, versatile.','Large clover honey for everyday use.',
    'Fragrant citrus blossom honey.','Large orange blossom honey.',
    'Dark, robust, mineral-rich honey.','Large buckwheat honey jar.',
    'Rich, dark, buttery honey.','Light, delicate sage honey.',
    'Bold eucalyptus flavor.','Floral, aromatic lavender honey.',
    'Light, mild, crystal-clear honey.','Premium New Zealand manuka.',
    'Rare, smooth Southern honey.','Rare Appalachian honey.',
    'Light amber linden honey.','Fruity blueberry blossom honey.',
    'Tart, unique cranberry honey.','Mild alfalfa blossom honey.',
    'Light, delicate thistle honey.','Rich berry blossom honey.',
    'Fruity raspberry blossom honey.','Unique marshmallow-like flavor.'
  ];
  photos text[] := ARRAY[
    'https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=400',
    'https://images.unsplash.com/photo-1558642452-9d2a7deb7f62?w=400',
    'https://images.unsplash.com/photo-1471943311424-646960669fbc?w=400',
    'https://images.unsplash.com/photo-1550411294-098c282a3988?w=400'
  ];
  i integer; n integer; price numeric;
BEGIN
  n := array_length(names, 1);
  FOR i IN 1..n LOOP
    price := ROUND((5.0 + random() * 15.0)::numeric, 2);
    INSERT INTO demo_product_catalog (name, description, price_usd, unit, category, photo_url)
    VALUES (names[i], descs[LEAST(i, array_length(descs, 1))], price,
      'jar', 'honey',
      photos[1 + ((i-1) % array_length(photos, 1))]);
  END LOOP;
  RAISE NOTICE 'Seeded % honey items', n;
END;
$$;

-- ── Final count ──
DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM demo_product_catalog;
  RAISE NOTICE 'Total demo products seeded: %', v_count;
END;
$$;
