-- Seed Data: Test booths and products in 95120 area for Browse Market testing
DO $$
DECLARE
  s1 UUID := '11111111-1111-1111-1111-111111111111';
  s2 UUID := '22222222-2222-2222-2222-222222222222';
  s3 UUID := '33333333-3333-3333-3333-333333333333';
  s4 UUID := '44444444-4444-4444-4444-444444444444';
  s5 UUID := '55555555-5555-5555-5555-555555555555';
BEGIN
  -- Auth users
  INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, role, aud,
    instance_id, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  VALUES
    (s1,'maria@test.local',crypt('test1234',gen_salt('bf')),now(),'authenticated','authenticated','00000000-0000-0000-0000-000000000000','{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()),
    (s2,'raj@test.local',crypt('test1234',gen_salt('bf')),now(),'authenticated','authenticated','00000000-0000-0000-0000-000000000000','{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()),
    (s3,'chen@test.local',crypt('test1234',gen_salt('bf')),now(),'authenticated','authenticated','00000000-0000-0000-0000-000000000000','{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()),
    (s4,'sofia@test.local',crypt('test1234',gen_salt('bf')),now(),'authenticated','authenticated','00000000-0000-0000-0000-000000000000','{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()),
    (s5,'james@test.local',crypt('test1234',gen_salt('bf')),now(),'authenticated','authenticated','00000000-0000-0000-0000-000000000000','{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now())
  ON CONFLICT (id) DO NOTHING;

  -- Update profiles (auth trigger already created them)
  UPDATE profiles SET full_name='Maria Garcia', email='maria@test.local', street_address='6449 Meridian Ave', city='San Jose', state_code='CA', zip_plus4='95120', home_location=ST_SetSRID(ST_MakePoint(-121.8825,37.2296),4326), profile_completed_at=now() WHERE id=s1;
  UPDATE profiles SET full_name='Raj Patel', email='raj@test.local', street_address='1086 Foxchase Dr', city='San Jose', state_code='CA', zip_plus4='95120', home_location=ST_SetSRID(ST_MakePoint(-121.8607,37.2250),4326), profile_completed_at=now() WHERE id=s2;
  UPDATE profiles SET full_name='Wei Chen', email='chen@test.local', street_address='1234 Hillsdale Ave', city='San Jose', state_code='CA', zip_plus4='95118', home_location=ST_SetSRID(ST_MakePoint(-121.8756,37.2523),4326), profile_completed_at=now() WHERE id=s3;
  UPDATE profiles SET full_name='Sofia Rossi', email='sofia@test.local', street_address='5920 Cahalan Ave', city='San Jose', state_code='CA', zip_plus4='95123', home_location=ST_SetSRID(ST_MakePoint(-121.8430,37.2390),4326), profile_completed_at=now() WHERE id=s4;
  UPDATE profiles SET full_name='James Nguyen', email='james@test.local', street_address='2100 Camden Ave', city='San Jose', state_code='CA', zip_plus4='95124', home_location=ST_SetSRID(ST_MakePoint(-121.9150,37.2530),4326), profile_completed_at=now() WHERE id=s5;

  -- Booths
  INSERT INTO market_booths (owner_id,name,description,decorative_theme,offers_delivery,offers_pickup,delivery_radius_miles,pickup_address,delivery_windows,pickup_windows,payment_method,pickup_location) VALUES
    (s1,'Maria''s Garden Fresh','Organic veggies from my backyard garden in Almaden. Grown with love, no pesticides!','floral',true,true,3,'6449 Meridian Ave, San Jose','[{"id":"8-10","start":"08:00","end":"10:00"},{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb,'[{"id":"8-10","start":"08:00","end":"10:00"}]'::jsonb,'automatic',ST_SetSRID(ST_MakePoint(-121.8825,37.2296),4326)),
    (s2,'Raj''s Tropical Orchard','Citrus and tropical fruits from my backyard orchard. Fresh-picked every market day!','tropical',true,true,5,'1086 Foxchase Dr, San Jose','[{"id":"8-10","start":"08:00","end":"10:00"}]'::jsonb,'[{"id":"8-10","start":"08:00","end":"10:00"},{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb,'automatic',ST_SetSRID(ST_MakePoint(-121.8607,37.2250),4326)),
    (s3,'Chen Family Farm Stand','Heritage vegetables and Asian greens. Growing specialty produce for 15 years.','harvest',false,true,0,'1234 Hillsdale Ave, San Jose','[]'::jsonb,'[{"id":"8-10","start":"08:00","end":"10:00"},{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb,'manual',ST_SetSRID(ST_MakePoint(-121.8756,37.2523),4326)),
    (s4,'Sofia''s Kitchen Garden','Homemade baked goods and fresh herbs from my Italian-style kitchen garden.','cottage',true,true,4,'5920 Cahalan Ave, San Jose','[{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb,'[{"id":"10-12","start":"10:00","end":"12:00"}]'::jsonb,'automatic',ST_SetSRID(ST_MakePoint(-121.8430,37.2390),4326)),
    (s5,'Herbs & Honey by James','Fresh-cut herbs, raw honey, and microgreens. Sustainably grown on my patio.','minimal',true,false,2,NULL,'[{"id":"8-10","start":"08:00","end":"10:00"}]'::jsonb,'[]'::jsonb,'automatic',ST_SetSRID(ST_MakePoint(-121.9150,37.2530),4326))
  ON CONFLICT (owner_id) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description, pickup_location=EXCLUDED.pickup_location, delivery_windows=EXCLUDED.delivery_windows, pickup_windows=EXCLUDED.pickup_windows;

  -- Products (with photos from /public/products/)
  INSERT INTO market_products (seller_id,market_date,name,description,category,price_usd,unit,inventory,photos,harvested_at) VALUES
    (s1,CURRENT_DATE,'Heritage Tomatoes','Mix of Brandywine, Cherokee Purple, and Green Zebra','vegetables',5.00,'basket',20,'{"/products/heritage-tomatoes.png"}',now()-interval '1 day'),
    (s1,CURRENT_DATE,'Fresh Basil Bunch','Fragrant Genovese basil, just picked','herbs',3.00,'bunch',15,'{"/products/fresh-basil.png"}',now()),
    (s1,CURRENT_DATE,'Organic Zucchini','Tender young zucchini from raised beds','vegetables',4.00,'bag',12,'{"/products/organic-zucchini.png"}',now()-interval '6 hours'),
    (s1,CURRENT_DATE,'Bell Pepper Mix','Red, yellow, and orange sweet peppers','vegetables',4.50,'bag',10,'{"/products/bell-peppers.png"}',now()-interval '1 day'),
    (s1,CURRENT_DATE,'Cherry Tomato Pint','Sweet Sungold and chocolate cherry tomatoes','vegetables',4.00,'pint',25,'{"/products/heritage-tomatoes.png"}',now()),
    (s2,CURRENT_DATE,'Meyer Lemons','Sweet-tart Meyer lemons, tree-ripened','fruits',3.50,'bag',30,'{"/products/meyer-lemons.png"}',now()-interval '2 days'),
    (s2,CURRENT_DATE,'Valencia Oranges','Juicy Valencia oranges, perfect for juicing','fruits',4.00,'bag',25,'{"/products/valencia-oranges.png"}',now()-interval '1 day'),
    (s2,CURRENT_DATE,'Persian Limes','Bright green limes from my backyard tree','fruits',3.00,'bag',20,'{"/products/persian-limes.png"}',now()),
    (s2,CURRENT_DATE,'Ruby Grapefruit','Deep red flesh, naturally sweet','fruits',5.00,'each',15,'{"/products/ruby-grapefruit.png"}',now()-interval '3 days'),
    (s2,CURRENT_DATE,'Kumquats','Tiny, zesty kumquats — eat them whole!','fruits',6.00,'pint',8,'{"/products/meyer-lemons.png"}',now()),
    (s3,CURRENT_DATE,'Baby Bok Choy','Tender baby bok choy, perfect for stir-fry','vegetables',3.50,'bunch',20,'{}',now()),
    (s3,CURRENT_DATE,'Chinese Long Beans','Crisp yard-long beans, freshly picked','vegetables',4.00,'bunch',15,'{}',now()-interval '6 hours'),
    (s3,CURRENT_DATE,'Daikon Radish','Large white daikon, great for soups and salads','vegetables',2.50,'each',12,'{}',now()-interval '1 day'),
    (s3,CURRENT_DATE,'Japanese Eggplant','Slender purple eggplant, no bitterness','vegetables',5.00,'bag',10,'{}',now()-interval '12 hours'),
    (s4,CURRENT_DATE,'Sourdough Loaf','Artisan sourdough, 24-hour ferment, crispy crust','baked',8.00,'loaf',6,'{"/products/sourdough-loaf.png"}',NULL),
    (s4,CURRENT_DATE,'Focaccia with Rosemary','Fluffy Italian focaccia topped with garden rosemary','baked',7.00,'half',8,'{"/products/herb-focaccia.png"}',NULL),
    (s4,CURRENT_DATE,'Strawberry Jam','Small-batch jam from local strawberries','preserved',6.50,'jar',10,'{"/products/strawberry-jam.png"}',NULL),
    (s4,CURRENT_DATE,'Fresh Rosemary','Woody sprigs of fragrant rosemary','herbs',2.00,'bunch',20,'{"/products/fresh-basil.png"}',now()),
    (s4,CURRENT_DATE,'Apple Cinnamon Pie','Homemade pie with Granny Smith apples','baked',12.00,'pie',3,'{"/products/apple-pie.png"}',NULL),
    (s5,CURRENT_DATE,'Raw Wildflower Honey','Pure raw honey from local hives, unfiltered','honey',12.00,'jar',8,'{"/products/strawberry-jam.png"}',NULL),
    (s5,CURRENT_DATE,'Microgreens Mix','Sunflower, radish, and pea shoot mix','herbs',5.00,'box',15,'{"/products/fresh-basil.png"}',now()),
    (s5,CURRENT_DATE,'Fresh Mint Bundle','Spearmint and peppermint, great for tea','herbs',2.50,'bunch',25,'{"/products/fresh-basil.png"}',now()),
    (s5,CURRENT_DATE,'Thai Basil','Aromatic Thai basil with purple stems','herbs',3.00,'bunch',18,'{"/products/fresh-basil.png"}',now()),
    (s5,CURRENT_DATE,'Lavender Sachets','Dried lavender from my garden, handmade sachets','flowers',4.00,'each',12,'{}',NULL);
END $$;
