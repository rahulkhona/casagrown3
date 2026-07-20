# NLP Parser 100-Input Test Results

This table lists all 100 test cases from the verification suite, showing the user input and the corresponding parsed values extracted by our local NLP parser.

| # | Input Text | Parsed Name | Category | Qty | Unit | Price ($) | Offers Del/PU | Street Address | City | State | Zip | Delivery Days | Delivery Times | Pickup Days | Pickup Times |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | "I have 5 dozen apples for $10" | **Apples** | `produce` | 60 | each | 10 | ✅ Del / ✅ PU | - | - | - | - | - | - | - | - |
| 2 | "Selling 10 lbs of potatoes for 15 dollars" | **Potatoes** | `produce` | 10 | lb | 15 | ✅ Del / ✅ PU | - | - | - | - | - | - | - | - |
| 3 | "3 bunches of organic kale at $4.50 per bunch" | **Kale** | `produce` | 3 | bunch | 4.5 | ✅ Del / ✅ PU | - | - | - | - | - | - | - | - |
| 4 | "1 jar of honey for $8" | **Honey** | `honey` | 1 | jar | 8 | ✅ Del / ✅ PU | - | - | - | - | - | - | - | - |
| 5 | "fresh rosemary 2 bunches at $3" | **Rosemary** | `produce` | 2 | bunch | 3 | ✅ Del / ✅ PU | - | - | - | - | - | - | - | - |
| 6 | "dozen eggs for five dollars" | **Eggs** | `eggs` | 12 | each | 5 | ✅ Del / ✅ PU | - | - | - | - | - | - | - | - |
| 7 | "2 boxes of strawberries for 12.50" | **Strawberries** | `produce` | 2 | box | 12.5 | ✅ Del / ✅ PU | - | - | - | - | - | - | - | - |
| 8 | "organic wildflower honey 3 jars at 9.99" | **Wildflower Honey** | `honey` | 3 | jar | 9.99 | ✅ Del / ✅ PU | - | - | - | - | - | - | - | - |
| 9 | "5 bags of potting soil, $15 each" | **Potting Soil** | `soil` | 5 | bag | 15 | ✅ Del / ✅ PU | - | - | - | - | - | - | - | - |
| 10 | "one large bouquet of sunflowers, 25 dollars" | **Sunflowers** | `flowers` | 1 | each | 25 | ✅ Del / ✅ PU | - | - | - | - | - | - | - | - |
| 11 | "selling 3 tomato plants in pots" | **Tomato Plants** | `pots` | 3 | each | - | ✅ Del / ✅ PU | - | - | - | - | - | - | - | - |
| 12 | "fresh mint leaves, 1 bunch for $2" | **Mint Leaves** | `produce` | 1 | bunch | 2 | ✅ Del / ✅ PU | - | - | - | - | - | - | - | - |
| 13 | "organic compost soil 2 bags for 20$" | **Compost Soil** | `soil` | 2 | bag | 20 | ✅ Del / ✅ PU | - | - | - | - | - | - | - | - |
| 14 | "flower arrangement for 35" | **Flower Arrangement** | `flower_arrangements` | 35 | each | - | ✅ Del / ✅ PU | - | - | - | - | - | - | - | - |
| 15 | "10 seed packets of marigolds for 1.50 each" | **Seed Packets** | `seeds` | 10 | each | 1.5 | ✅ Del / ✅ PU | - | - | - | - | - | - | - | - |
| 16 | "shovels and garden tools" | **Shovels** | `garden_equipment` | 1 | each | - | ✅ Del / ✅ PU | - | - | - | - | - | - | - | - |
| 17 | "red roses, 1 dozen for $24" | **Roses** | `flowers` | 12 | each | 24 | ✅ Del / ✅ PU | - | - | - | - | - | - | - | - |
| 18 | "sweet peaches, 5 lbs, $12" | **Peaches** | `produce` | 5 | lb | 12 | ✅ Del / ✅ PU | - | - | - | - | - | - | - | - |
| 19 | "fresh garlic bulbs 10 pieces for $6" | **Garlic Bulbs** | `produce` | 10 | each | 6 | ✅ Del / ✅ PU | - | - | - | - | - | - | - | - |
| 20 | "honeycomb jar for $12" | **Honeycomb Jar** | `honey` | 1 | jar | 12 | ✅ Del / ✅ PU | - | - | - | - | - | - | - | - |
| 21 | "deliver within 5 miles" | **Miles** | `produce` | 5 | each | - | ✅ Del / ❌ PU | - | - | - | - | - | - | - | - |
| 22 | "pickup only at my house" | **Pickup** | `produce` | 1 | each | - | ❌ Del / ✅ PU | - | - | - | - | - | - | - | - |
| 23 | "will deliver up to 10 mi radius" | **Mi** | `produce` | 10 | each | - | ✅ Del / ❌ PU | - | - | - | - | - | - | - | - |
| 24 | "available for pickup or delivery" | **Pickup** | `produce` | 1 | each | - | ✅ Del / ✅ PU | - | - | - | - | - | - | - | - |
| 25 | "no delivery, pickup from 123 Main St" | **Delivery** | `produce` | 123 | each | - | ❌ Del / ✅ PU | 123 Main St | - | - | - | - | - | - | - |
| 26 | "deliver to 95125 only" | **Fresh Produce** | `produce` | 1 | each | - | ✅ Del / ❌ PU | - | - | - | - | - | - | - | - |
| 27 | "free delivery within 3 miles" | **Delivery** | `produce` | 3 | each | - | ✅ Del / ❌ PU | - | - | - | - | - | - | - | - |
| 28 | "will ship or drop off within 8 mi" | **Drop** | `produce` | 8 | each | - | ✅ Del / ❌ PU | - | - | - | - | - | - | - | - |
| 29 | "come pick up from 555 Broadway Ave" | **Comb Pick Up** | `honey` | 1 | each | - | ❌ Del / ✅ PU | 555 Broadway Ave | - | - | - | - | - | - | - |
| 30 | "delivery within 15 mile radius of 94043" | **Delivery** | `produce` | 15 | each | - | ✅ Del / ❌ PU | - | - | - | - | - | - | - | - |
| 31 | "pickup at 777 Post St, San Francisco" | **Pickup** | `produce` | 777 | each | - | ❌ Del / ✅ PU | 777 Post St | San Francisco | - | - | - | - | - | - |
| 32 | "I can deliver or you can pick up" | **Fresh Produce** | `produce` | 1 | each | - | ✅ Del / ✅ PU | - | - | - | - | - | - | - | - |
| 33 | "deliver only" | **Fresh Produce** | `produce` | 1 | each | - | ✅ Del / ❌ PU | - | - | - | - | - | - | - | - |
| 34 | "pick up only" | **Fresh Produce** | `produce` | 1 | each | - | ❌ Del / ✅ PU | - | - | - | - | - | - | - | - |
| 35 | "delivery is available for $5 extra" | **Delivery** | `produce` | 1 | each | 5 | ✅ Del / ❌ PU | - | - | - | - | - | - | - | - |
| 36 | "collect from my home" | **Home** | `produce` | 1 | each | - | ❌ Del / ✅ PU | - | - | - | - | - | - | - | - |
| 37 | "deliver within 4 miles of 123 Maple St" | **Miles** | `produce` | 4 | each | - | ✅ Del / ❌ PU | 123 Maple St | - | - | - | - | - | - | - |
| 38 | "meet at 456 Oak Ave for pickup" | **Oak** | `produce` | 456 | each | - | ❌ Del / ✅ PU | 456 Oak Ave | - | - | - | - | - | - | - |
| 39 | "will drop off up to 6 miles away" | **Miles** | `produce` | 6 | each | - | ✅ Del / ❌ PU | - | - | - | - | - | - | - | - |
| 40 | "no pickup, delivery only" | **Pickup** | `produce` | 1 | each | - | ✅ Del / ❌ PU | - | - | - | - | - | - | - | - |
| 41 | "deliver on weekends" | **Weekends** | `produce` | 1 | each | - | ✅ Del / ❌ PU | - | - | - | - | saturday, sunday | - | - | - |
| 42 | "deliver on weekdays" | **Weekdays** | `produce` | 1 | each | - | ✅ Del / ❌ PU | - | - | - | - | monday, tuesday, wednesday, thursday, friday | - | - | - |
| 43 | "pickup on sunday afternoon" | **Pickup** | `produce` | 1 | each | - | ❌ Del / ✅ PU | - | - | - | - | - | - | sunday | afternoon |
| 44 | "deliver monday morning" | **Monday** | `produce` | 1 | each | - | ✅ Del / ❌ PU | - | - | - | - | monday | morning | - | - |
| 45 | "deliver wednesday evening" | **Wednesday** | `produce` | 1 | each | - | ✅ Del / ❌ PU | - | - | - | - | wednesday | evening | - | - |
| 46 | "pickup saturday morning or sunday evening" | **Pickup** | `produce` | 1 | each | - | ❌ Del / ✅ PU | - | - | - | - | - | - | saturday, sunday | morning, evening |
| 47 | "deliver mon-fri afternoons" | **Mon** | `produce` | 1 | each | - | ✅ Del / ❌ PU | - | - | - | - | monday, friday, tuesday, wednesday, thursday | afternoon | - | - |
| 48 | "pickup on tuesday and thursday night" | **Pickup** | `produce` | 1 | each | - | ❌ Del / ✅ PU | - | - | - | - | - | - | tuesday, thursday | evening |
| 49 | "deliver on sat-sun mornings" | **Sun** | `produce` | 1 | each | - | ✅ Del / ❌ PU | - | - | - | - | saturday, sunday | morning | - | - |
| 50 | "pickup everyday morning" | **Pickup** | `produce` | 1 | each | - | ❌ Del / ✅ PU | - | - | - | - | - | - | monday, tuesday, wednesday, thursday, friday, saturday, sunday | morning |
| 51 | "deliver tuesday afternoon" | **Tuesday** | `produce` | 1 | each | - | ✅ Del / ❌ PU | - | - | - | - | tuesday | afternoon | - | - |
| 52 | "pickup friday night" | **Pickup** | `produce` | 1 | each | - | ❌ Del / ✅ PU | - | - | - | - | - | - | friday | evening |
| 53 | "deliver thursday morning" | **Thursday** | `produce` | 1 | each | - | ✅ Del / ❌ PU | - | - | - | - | thursday | morning | - | - |
| 54 | "pickup wednesday afternoon" | **Pickup** | `produce` | 1 | each | - | ❌ Del / ✅ PU | - | - | - | - | - | - | wednesday | afternoon |
| 55 | "deliver monday evening" | **Monday** | `produce` | 1 | each | - | ✅ Del / ❌ PU | - | - | - | - | monday | evening | - | - |
| 56 | "pickup tuesday morning" | **Pickup** | `produce` | 1 | each | - | ❌ Del / ✅ PU | - | - | - | - | - | - | tuesday | morning |
| 57 | "deliver friday afternoon" | **Friday** | `produce` | 1 | each | - | ✅ Del / ❌ PU | - | - | - | - | friday | afternoon | - | - |
| 58 | "pickup saturday evening" | **Pickup** | `produce` | 1 | each | - | ❌ Del / ✅ PU | - | - | - | - | - | - | saturday | evening |
| 59 | "deliver sunday morning" | **Sunday** | `produce` | 1 | each | - | ✅ Del / ❌ PU | - | - | - | - | sunday | morning | - | - |
| 60 | "pickup Thursday afternoon" | **Pickup** | `produce` | 1 | each | - | ❌ Del / ✅ PU | - | - | - | - | - | - | thursday | afternoon |
| 61 | "deliver to 95125, 95112, and 95110" | **Fresh Produce** | `produce` | 1 | each | - | ✅ Del / ❌ PU | - | - | - | - | - | - | - | - |
| 62 | "base address is 100 Main St, San Jose, CA 95112" | **Vase Address** | `flower_arrangements` | 100 | each | - | ✅ Del / ✅ PU | 100 Main St | San Jose | CA | 95112 | - | - | - | - |
| 63 | "pickup from 200 Park Ave, San Jose, CA 95113" | **Pickup** | `produce` | 200 | each | - | ❌ Del / ✅ PU | 200 Park Ave | San Jose | CA | 95113 | - | - | - | - |
| 64 | "deliver in 94040, 94041" | **Fresh Produce** | `produce` | 1 | each | - | ✅ Del / ❌ PU | - | - | - | - | - | - | - | - |
| 65 | "my house is at 300 Elm St, Seattle, WA 98101" | **House** | `produce` | 300 | each | - | ✅ Del / ✅ PU | 300 Elm St | Seattle | WA | 98101 | - | - | - | - |
| 66 | "pickup address: 400 Pine St, Seattle, WA 98101" | **Pickup** | `produce` | 400 | each | - | ❌ Del / ✅ PU | 400 Pine St | Seattle | WA | 98101 | - | - | - | - |
| 67 | "deliver within 5 miles of 500 Market St, San Francisco, CA 94105" | **Miles** | `produce` | 5 | each | - | ✅ Del / ❌ PU | 500 Market St | San Francisco | CA | 94105 | - | - | - | - |
| 68 | "pickup point is 600 Mission St, San Francisco, CA 94105" | **Pickup** | `produce` | 600 | each | - | ❌ Del / ✅ PU | 600 Mission St | San Francisco | CA | 94105 | - | - | - | - |
| 69 | "deliver to 90210, 90211, 90212" | **Fresh Produce** | `produce` | 1 | each | - | ✅ Del / ❌ PU | - | - | - | - | - | - | - | - |
| 70 | "farm stand located at 700 Broadway, New York, NY 10003" | **Farm** | `produce` | 1 | each | - | ✅ Del / ✅ PU | 700 Broadway | New York | NY | 10003 | - | - | - | - |
| 71 | "please pick up at 800 Fifth Ave, New York, NY 10021" | **Fifth** | `produce` | 800 | each | - | ❌ Del / ✅ PU | 800 Fifth Ave | New York | NY | 10021 | - | - | - | - |
| 72 | "we deliver to 98101, 98102" | **Fresh Produce** | `produce` | 1 | each | - | ✅ Del / ❌ PU | - | - | - | - | - | - | - | - |
| 73 | "come to 900 Oak St, Oakland, CA 94607" | **Comb** | `honey` | 900 | each | - | ✅ Del / ✅ PU | 900 Oak St | Oakland | CA | 94607 | - | - | - | - |
| 74 | "pickup here: 1000 Grand Ave, Oakland, CA 94610" | **Herb** | `produce` | 1000 | each | - | ❌ Del / ✅ PU | 1000 Grand Ave | Oakland | CA | 94610 | - | - | - | - |
| 75 | "will deliver to 95050, 95051" | **Fresh Produce** | `produce` | 1 | each | - | ✅ Del / ❌ PU | - | - | - | - | - | - | - | - |
| 76 | "farm at 1100 Lincoln Ave, San Jose, CA 95125" | **Farm** | `produce` | 1100 | each | - | ✅ Del / ✅ PU | 1100 Lincoln Ave | San Jose | CA | 95125 | - | - | - | - |
| 77 | "pickup at 1200 Taylor St, San Francisco, CA 94108" | **Pickup** | `produce` | 1200 | each | - | ❌ Del / ✅ PU | 1200 Taylor St | San Francisco | CA | 94108 | - | - | - | - |
| 78 | "serving 94102, 94103, 94104" | **Fresh Produce** | `produce` | 1 | each | - | ✅ Del / ✅ PU | - | - | - | - | - | - | - | - |
| 79 | "base: 1300 Sutter St, San Francisco, CA 94109" | **Vase** | `flower_arrangements` | 1300 | each | - | ✅ Del / ✅ PU | 1300 Sutter St | San Francisco | CA | 94109 | - | - | - | - |
| 80 | "pickup: 1400 Post St, San Francisco, CA 94109" | **Pickup** | `produce` | 1400 | each | - | ❌ Del / ✅ PU | 1400 Post St | San Francisco | CA | 94109 | - | - | - | - |
| 81 | "I have 10 dozen oranges at $1 per piece. I will deliver on weekends within 2 miles of my house." | **Oranges** | `produce` | 120 | each | 1 | ✅ Del / ❌ PU | - | - | - | - | saturday, sunday | - | - | - |
| 82 | "Selling 3 bags of premium compost for $15 per bag. Pick up only on Saturday morning from 123 Main St." | **Compost** | `soil` | 3 | bag | 15 | ❌ Del / ✅ PU | 123 Main St | - | - | - | - | - | saturday | morning |
| 83 | "Fresh lavender bouquets, 5 bunches for 20 dollars total. Deliver on weekdays within 5 miles." | **Lavender** | `flowers` | 5 | bunch | 20 | ✅ Del / ❌ PU | - | - | - | - | monday, tuesday, wednesday, thursday, friday | - | - | - |
| 84 | "2 dozen fresh eggs for 6 dollars. Pickup at 456 Oak Avenue on Sunday afternoon." | **Eggs** | `eggs` | 24 | each | 6 | ❌ Del / ✅ PU | 456 Oak Avenue | - | - | - | - | - | sunday | afternoon |
| 85 | "I have 10 tomato plants in pots for 8 dollars each. No delivery, pickup only at 789 Pine St." | **Tomato Plants** | `pots` | 10 | each | 8 | ❌ Del / ✅ PU | 789 Pine St | - | - | - | - | - | - | - |
| 86 | "10 lbs of potatoes at $1.50 per lb. Will deliver on Wednesday evening to 95125." | **Potatoes** | `produce` | 10 | lb | 1.5 | ✅ Del / ❌ PU | - | - | - | - | wednesday | evening | - | - |
| 87 | "3 jars of organic honey for $25. Pickup anytime on weekends." | **Honey** | `honey` | 3 | jar | 25 | ❌ Del / ✅ PU | - | - | - | - | - | - | saturday, sunday | - |
| 88 | "flower arrangement for $45. Deliver on Monday morning within 10 miles of 123 Broadway." | **Flower Arrangement** | `flower_arrangements` | 10 | each | 45 | ✅ Del / ❌ PU | 123 Broadway | - | - | - | monday | morning | - | - |
| 89 | "Selling 50 seed packets of sunflowers for $1 each. Will deliver to 94043." | **Seed Packets** | `seeds` | 50 | each | 1 | ✅ Del / ❌ PU | - | - | - | - | - | - | - | - |
| 90 | "fresh mint 5 bunches for $5. Pickup at 555 Market St on Friday night." | **Mint** | `produce` | 5 | bunch | 5 | ❌ Del / ✅ PU | 555 Market St | - | - | - | - | - | friday | evening |
| 91 | "2 bags of potting soil for $10. Delivery on Tuesday morning." | **Potting Soil** | `soil` | 2 | bag | 10 | ✅ Del / ❌ PU | - | - | - | - | tuesday | morning | - | - |
| 92 | "1 dozen roses for $30. Pickup on Sunday morning at 888 Pine St." | **Roses** | `flowers` | 12 | each | 30 | ❌ Del / ✅ PU | 888 Pine St | - | - | - | - | - | sunday | morning |
| 93 | "fresh peaches 10 lbs for $20. Deliver on Thursday afternoon." | **Peaches** | `produce` | 10 | lb | 20 | ✅ Del / ❌ PU | - | - | - | - | thursday | afternoon | - | - |
| 94 | "5 jars of wildflower honey for $40. Pickup Saturday afternoon." | **Wildflower Honey** | `honey` | 5 | jar | 40 | ❌ Del / ✅ PU | - | - | - | - | - | - | saturday | afternoon |
| 95 | "100 flower pots for $50. No delivery, pickup only." | **Flower Pots** | `pots` | 100 | each | 50 | ❌ Del / ✅ PU | - | - | - | - | - | - | - | - |
| 96 | "garden tools set for $100. Deliver on Wednesday morning within 15 miles." | **Garden Tools Set** | `garden_equipment` | 15 | each | 100 | ✅ Del / ❌ PU | - | - | - | - | wednesday | morning | - | - |
| 97 | "3 dozen eggs for $15. Pickup Tuesday evening at 999 Elm St." | **Eggs** | `eggs` | 36 | each | 15 | ❌ Del / ✅ PU | 999 Elm St | - | - | - | - | - | tuesday | evening |
| 98 | "fresh organic basil 4 bunches for $8. Deliver on weekdays." | **Basil** | `produce` | 4 | bunch | 8 | ✅ Del / ❌ PU | - | - | - | - | monday, tuesday, wednesday, thursday, friday | - | - | - |
| 99 | "wildflower honey, 1 jar for $12. Pickup on weekends at 100 Oak St." | **Wildflower Honey** | `honey` | 1 | jar | 12 | ❌ Del / ✅ PU | 100 Oak St | - | - | - | - | - | saturday, sunday | - |
| 100 | "10 bags of compost for $50. Deliver on Saturday morning to 95112." | **Compost** | `soil` | 10 | bag | 50 | ✅ Del / ❌ PU | - | - | - | - | saturday | morning | - | - |
| 101 | "i have 2 dz oranges at $1 per piece. You can pick it up from 978 Wallace Dr. San Jose between 10am and 1pm" | **Oranges** | `produce` | 24 | each | 1 | ❌ Del / ✅ PU | 978 Wallace Dr | San Jose | - | - | - | - | monday, tuesday, wednesday, thursday, friday, saturday, sunday | morning, afternoon |
| 102 | "i have 20dz oranges for $5 per dozen and can deliver in 95120 and 95123 zipcodes on weekend envenings or you can pickup from 970 Wallace Dr. San Jose on weekday evenings." | **Oranges** | `produce` | 20 | dozen | 5 | ✅ Del / ✅ PU | 970 Wallace Dr | San Jose | - | - | saturday, sunday | evening | monday, tuesday, wednesday, thursday, friday | evening |
| 103 | "555 Market St daily 8a-11a pickup. no delivery." | **Market** | `produce` | 555 | each | - | ❌ Del / ✅ PU | 555 Market St | daily 8 a-11 a | - | - | - | - | monday, tuesday, wednesday, thursday, friday, saturday, sunday | morning |
| 104 | "Deliver to Tasman Dr on Saturday" | **Tasman** | `produce` | 1 | each | - | ✅ Del / ❌ PU | - | - | - | - | saturday | - | - | - |
| 105 | "My address is 100 Monroe Rd. pickup daily" | **Address** | `produce` | 100 | each | - | ❌ Del / ✅ PU | 100 Monroe Rd | - | - | - | - | - | monday, tuesday, wednesday, thursday, friday, saturday, sunday | - |
| 106 | "I have fresh cherries for $5" | **Cherries** | `produce` | 1 | each | 5 | ✅ Del / ✅ PU | - | - | - | - | - | - | - | - |
| 107 | "selling organic berries 2 bags for 10" | **Berries** | `produce` | 2 | bag | 10 | ✅ Del / ✅ PU | - | - | - | - | - | - | - | - |
| 108 | "Pikcup at 978 Wallace Dr" | **Pickup** | `produce` | 978 | each | - | ❌ Del / ✅ PU | 978 Wallace Dr | - | - | - | - | - | - | - |
| 109 | "123 Tasman Dr is the pickup location" | **Tasman** | `produce` | 123 | each | - | ❌ Del / ✅ PU | 123 Tasman Dr | is the | - | - | - | - | - | - |
| 110 | "5lbs apples for 10" | **Apples** | `produce` | 5 | lb | 10 | ✅ Del / ✅ PU | - | - | - | - | - | - | - | - |
| 111 | "2jars honey for 15" | **Honey** | `honey` | 2 | jar | 15 | ✅ Del / ✅ PU | - | - | - | - | - | - | - | - |
| 112 | "hello world, just testing the system" | **World** | `produce` | 1 | each | - | ✅ Del / ✅ PU | - | - | - | - | - | - | - | - |
