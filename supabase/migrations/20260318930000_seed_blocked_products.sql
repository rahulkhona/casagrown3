-- ============================================================================
-- Migration: Seed Blocked Products — Prohibited Substances
-- Global bans (community_h3_index = NULL) for drug names and street slang.
-- Sources: DEA Slang Terms Reference (2018), NDTA 2024, state .gov resources.
-- ============================================================================

-- Helper: insert blocked product globally, skip duplicates
-- community_h3_index = NULL means the ban applies everywhere

-- ── MARIJUANA / CANNABIS ────────────────────────────────────────────────────
INSERT INTO blocked_products (product_name, reason) VALUES
  ('marijuana', 'Controlled substance — Schedule I'),
  ('cannabis', 'Controlled substance — Schedule I'),
  ('weed', 'Drug slang — marijuana'),
  ('pot', 'Drug slang — marijuana'),
  ('ganja', 'Drug slang — marijuana'),
  ('reefer', 'Drug slang — marijuana'),
  ('mary jane', 'Drug slang — marijuana'),
  ('chronic', 'Drug slang — marijuana'),
  ('dank', 'Drug slang — marijuana'),
  ('skunk', 'Drug slang — marijuana'),
  ('purple haze', 'Drug slang — marijuana'),
  ('kush', 'Drug slang — marijuana'),
  ('dabs', 'Drug slang — marijuana concentrate'),
  ('hash', 'Drug slang — marijuana concentrate'),
  ('hashish', 'Controlled substance — marijuana derivative'),
  ('edibles', 'Drug slang — marijuana edibles'),
  ('thc', 'Controlled substance — active ingredient in marijuana'),
  ('delta-8', 'Controlled substance — THC variant'),
  ('delta-9', 'Controlled substance — THC variant');


-- ── COCAINE ─────────────────────────────────────────────────────────────────
INSERT INTO blocked_products (product_name, reason) VALUES
  ('cocaine', 'Controlled substance — Schedule II'),
  ('coke', 'Drug slang — cocaine'),
  ('crack', 'Drug slang — crack cocaine'),
  ('crack cocaine', 'Controlled substance — Schedule II'),
  ('blow', 'Drug slang — cocaine'),
  ('snow', 'Drug slang — cocaine'),
  ('nose candy', 'Drug slang — cocaine'),
  ('white powder', 'Drug slang — cocaine'),
  ('8-ball', 'Drug slang — cocaine/crack'),
  ('rock', 'Drug slang — crack cocaine'),
  ('freebase', 'Drug slang — cocaine');


-- ── HEROIN ──────────────────────────────────────────────────────────────────
INSERT INTO blocked_products (product_name, reason) VALUES
  ('heroin', 'Controlled substance — Schedule I'),
  ('smack', 'Drug slang — heroin'),
  ('horse', 'Drug slang — heroin'),
  ('junk', 'Drug slang — heroin'),
  ('black tar', 'Drug slang — heroin'),
  ('brown sugar', 'Drug slang — heroin'),
  ('dragon', 'Drug slang — heroin'),
  ('dope', 'Drug slang — heroin/drugs'),
  ('skag', 'Drug slang — heroin');


-- ── METHAMPHETAMINE ─────────────────────────────────────────────────────────
INSERT INTO blocked_products (product_name, reason) VALUES
  ('methamphetamine', 'Controlled substance — Schedule II'),
  ('meth', 'Drug slang — methamphetamine'),
  ('crystal meth', 'Drug slang — methamphetamine'),
  ('crystal', 'Drug slang — methamphetamine'),
  ('ice', 'Drug slang — methamphetamine'),
  ('glass', 'Drug slang — methamphetamine'),
  ('crank', 'Drug slang — methamphetamine'),
  ('speed', 'Drug slang — methamphetamine/amphetamine'),
  ('tina', 'Drug slang — methamphetamine');


-- ── FENTANYL ────────────────────────────────────────────────────────────────
INSERT INTO blocked_products (product_name, reason) VALUES
  ('fentanyl', 'Controlled substance — Schedule II'),
  ('china girl', 'Drug slang — fentanyl'),
  ('china white', 'Drug slang — fentanyl'),
  ('apache', 'Drug slang — fentanyl'),
  ('murder 8', 'Drug slang — fentanyl'),
  ('jackpot', 'Drug slang — fentanyl'),
  ('goodfellas', 'Drug slang — fentanyl'),
  ('dance fever', 'Drug slang — fentanyl');


-- ── MDMA / ECSTASY ──────────────────────────────────────────────────────────
INSERT INTO blocked_products (product_name, reason) VALUES
  ('mdma', 'Controlled substance — Schedule I'),
  ('ecstasy', 'Drug slang — MDMA'),
  ('molly', 'Drug slang — MDMA'),
  ('x', 'Drug slang — MDMA/ecstasy'),
  ('xtc', 'Drug slang — MDMA/ecstasy');


-- ── LSD / HALLUCINOGENS ────────────────────────────────────────────────────
INSERT INTO blocked_products (product_name, reason) VALUES
  ('lsd', 'Controlled substance — Schedule I'),
  ('acid', 'Drug slang — LSD'),
  ('tabs', 'Drug slang — LSD'),
  ('blotter', 'Drug slang — LSD'),
  ('psilocybin', 'Controlled substance — Schedule I'),
  ('magic mushrooms', 'Drug slang — psilocybin mushrooms'),
  ('shrooms', 'Drug slang — psilocybin mushrooms'),
  ('peyote', 'Controlled substance — Schedule I'),
  ('mescaline', 'Controlled substance — Schedule I'),
  ('dmt', 'Controlled substance — Schedule I'),
  ('ayahuasca', 'Controlled substance — contains DMT');


-- ── PCP / KETAMINE / DISSOCIATIVES ─────────────────────────────────────────
INSERT INTO blocked_products (product_name, reason) VALUES
  ('pcp', 'Controlled substance — Schedule II'),
  ('angel dust', 'Drug slang — PCP'),
  ('ketamine', 'Controlled substance — Schedule III'),
  ('special k', 'Drug slang — ketamine');


-- ── PRESCRIPTION DRUGS (commonly abused) ───────────────────────────────────
INSERT INTO blocked_products (product_name, reason) VALUES
  ('oxycodone', 'Prescription drug — illegal to sell'),
  ('oxycontin', 'Prescription drug — illegal to sell'),
  ('percocet', 'Prescription drug — illegal to sell'),
  ('vicodin', 'Prescription drug — illegal to sell'),
  ('hydrocodone', 'Prescription drug — illegal to sell'),
  ('codeine', 'Prescription drug — illegal to sell'),
  ('morphine', 'Prescription drug — illegal to sell'),
  ('adderall', 'Prescription drug — illegal to sell'),
  ('ritalin', 'Prescription drug — illegal to sell'),
  ('xanax', 'Prescription drug — illegal to sell'),
  ('valium', 'Prescription drug — illegal to sell'),
  ('ambien', 'Prescription drug — illegal to sell'),
  ('lean', 'Drug slang — codeine/promethazine syrup'),
  ('purple drank', 'Drug slang — codeine/promethazine syrup'),
  ('sizzurp', 'Drug slang — codeine/promethazine syrup'),
  ('bars', 'Drug slang — Xanax'),
  ('percs', 'Drug slang — Percocet'),
  ('oxys', 'Drug slang — OxyContin'),
  ('blues', 'Drug slang — oxycodone/fentanyl pills'),
  ('m30', 'Drug slang — counterfeit oxycodone (often fentanyl)');

-- ── SYNTHETIC DRUGS ─────────────────────────────────────────────────────────
INSERT INTO blocked_products (product_name, reason) VALUES
  ('spice', 'Drug slang — synthetic cannabinoid'),
  ('k2', 'Drug slang — synthetic cannabinoid'),
  ('bath salts', 'Drug slang — synthetic cathinone'),
  ('flakka', 'Drug slang — synthetic cathinone'),
  ('ghb', 'Controlled substance — date rape drug'),
  ('rohypnol', 'Controlled substance — date rape drug'),
  ('roofies', 'Drug slang — Rohypnol'),
  ('steroids', 'Controlled substance — Schedule III'),
  ('hgh', 'Controlled substance — human growth hormone');


-- ── ALCOHOL ─────────────────────────────────────────────────────────────────
INSERT INTO blocked_products (product_name, reason) VALUES
  ('alcohol', 'Regulated product — requires license to sell'),
  ('beer', 'Regulated product — requires license to sell'),
  ('wine', 'Regulated product — requires license to sell'),
  ('liquor', 'Regulated product — requires license to sell'),
  ('moonshine', 'Regulated product — illegal to distill/sell without license'),
  ('vodka', 'Regulated product — requires license to sell'),
  ('whiskey', 'Regulated product — requires license to sell'),
  ('bourbon', 'Regulated product — requires license to sell'),
  ('tequila', 'Regulated product — requires license to sell'),
  ('rum', 'Regulated product — requires license to sell'),
  ('gin', 'Regulated product — requires license to sell'),
  ('brandy', 'Regulated product — requires license to sell'),
  ('cognac', 'Regulated product — requires license to sell'),
  ('champagne', 'Regulated product — requires license to sell'),
  ('sake', 'Regulated product — requires license to sell'),
  ('mezcal', 'Regulated product — requires license to sell'),
  ('absinthe', 'Regulated product — requires license to sell'),
  ('hennessy', 'Regulated product — alcohol brand'),
  ('jack daniels', 'Regulated product — alcohol brand'),
  ('jim beam', 'Regulated product — alcohol brand'),
  ('crown royal', 'Regulated product — alcohol brand'),
  ('grey goose', 'Regulated product — alcohol brand'),
  ('patron', 'Regulated product — alcohol brand'),
  ('budweiser', 'Regulated product — alcohol brand'),
  ('coors', 'Regulated product — alcohol brand'),
  ('miller', 'Regulated product — alcohol brand'),
  ('corona', 'Regulated product — alcohol brand'),
  ('modelo', 'Regulated product — alcohol brand'),
  ('white claw', 'Regulated product — alcohol brand'),
  ('truly', 'Regulated product — alcohol brand'),
  ('fireball', 'Regulated product — alcohol brand'),
  ('smirnoff', 'Regulated product — alcohol brand'),
  ('bacardi', 'Regulated product — alcohol brand'),
  ('jameson', 'Regulated product — alcohol brand'),
  ('everclear', 'Regulated product — alcohol brand'),
  ('hard seltzer', 'Regulated product — requires license to sell'),
  ('malt liquor', 'Regulated product — requires license to sell'),
  ('homebrew', 'Regulated product — illegal to sell without license');


-- ── TOBACCO / CIGARETTES ────────────────────────────────────────────────────
INSERT INTO blocked_products (product_name, reason) VALUES
  ('tobacco', 'Regulated product — requires license to sell'),
  ('cigarettes', 'Regulated product — requires license to sell'),
  ('cigars', 'Regulated product — requires license to sell'),
  ('cigarillos', 'Regulated product — requires license to sell'),
  ('chewing tobacco', 'Regulated product — requires license to sell'),
  ('snuff', 'Regulated product — requires license to sell'),
  ('dip', 'Regulated product — tobacco product'),
  ('nicotine', 'Regulated product — requires license to sell'),
  ('nicotine pouches', 'Regulated product — requires license to sell'),
  ('marlboro', 'Regulated product — cigarette brand'),
  ('camel', 'Regulated product — cigarette brand'),
  ('newport', 'Regulated product — cigarette brand'),
  ('pall mall', 'Regulated product — cigarette brand'),
  ('american spirit', 'Regulated product — cigarette brand'),
  ('lucky strike', 'Regulated product — cigarette brand'),
  ('swisher sweets', 'Regulated product — cigar brand'),
  ('backwoods', 'Regulated product — cigar brand'),
  ('dutch masters', 'Regulated product — cigar brand'),
  ('black and mild', 'Regulated product — cigar brand'),
  ('zyn', 'Regulated product — nicotine pouch brand'),
  ('skoal', 'Regulated product — tobacco brand'),
  ('copenhagen', 'Regulated product — tobacco brand'),
  ('grizzly', 'Regulated product — tobacco brand');


-- ── VAPING / E-CIGARETTES ───────────────────────────────────────────────────
INSERT INTO blocked_products (product_name, reason) VALUES
  ('vape', 'Regulated product — requires license to sell'),
  ('vape pen', 'Regulated product — requires license to sell'),
  ('vape juice', 'Regulated product — requires license to sell'),
  ('vape cartridge', 'Regulated product — requires license to sell'),
  ('e-cigarette', 'Regulated product — requires license to sell'),
  ('e-liquid', 'Regulated product — requires license to sell'),
  ('juul', 'Regulated product — vape brand'),
  ('juul pods', 'Regulated product — vape brand'),
  ('elf bar', 'Regulated product — vape brand'),
  ('puff bar', 'Regulated product — vape brand'),
  ('hyde', 'Regulated product — vape brand'),
  ('raz', 'Regulated product — vape brand'),
  ('lost mary', 'Regulated product — vape brand'),
  ('geek bar', 'Regulated product — vape brand'),
  ('smok', 'Regulated product — vape brand'),
  ('vuse', 'Regulated product — vape brand'),
  ('njoy', 'Regulated product — vape brand'),
  ('disposable vape', 'Regulated product — requires license to sell'),
  ('pod system', 'Regulated product — vape device'),
  ('mod', 'Regulated product — vape device');


-- ── FIREARMS / WEAPONS ──────────────────────────────────────────────────────
INSERT INTO blocked_products (product_name, reason) VALUES
  ('firearms', 'Prohibited — requires licensed dealer'),
  ('guns', 'Prohibited — requires licensed dealer'),
  ('gun', 'Prohibited — requires licensed dealer'),
  ('pistol', 'Prohibited — requires licensed dealer'),
  ('revolver', 'Prohibited — requires licensed dealer'),
  ('rifle', 'Prohibited — requires licensed dealer'),
  ('shotgun', 'Prohibited — requires licensed dealer'),
  ('ar-15', 'Prohibited — requires licensed dealer'),
  ('ak-47', 'Prohibited — requires licensed dealer'),
  ('handgun', 'Prohibited — requires licensed dealer'),
  ('ammunition', 'Prohibited — requires licensed dealer'),
  ('ammo', 'Prohibited — requires licensed dealer'),
  ('bullets', 'Prohibited — requires licensed dealer'),
  ('holster', 'Prohibited — firearm accessory'),
  ('silencer', 'Prohibited — NFA restricted item'),
  ('suppressor', 'Prohibited — NFA restricted item'),
  ('bump stock', 'Prohibited — federally banned'),
  ('explosives', 'Prohibited — federal law'),
  ('fireworks', 'Regulated product — varies by state'),
  ('switchblade', 'Prohibited — varies by state'),
  ('brass knuckles', 'Prohibited — varies by state'),
  ('pepper spray', 'Regulated product — varies by state'),
  ('taser', 'Regulated product — varies by state'),
  ('stun gun', 'Regulated product — varies by state');

