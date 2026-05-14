-- Add ShoppingAssistant and FindFarmersMarkets skills to GrowBot

INSERT INTO growbot_skills (name, trigger_rules, schema_properties, backend_function, is_active)
VALUES 
(
  'ShoppingAssistant',
  'Call this tool when the user wants to buy produce or asks where to find specific items. Extracts the requested items and returns unified search results from CasaGrown, Commercial Farms (OFN), and Farmers Markets.',
  '[{"name": "items", "type": "array", "description": "Array of food items the user is looking to buy (e.g., [\"tomatoes\", \"basil\"])."}]',
  NULL,
  true
),
(
  'FindFarmersMarkets',
  'Call this tool when the user explicitly asks for nearby farmers markets.',
  '[{"name": "zipcode", "type": "string", "description": "Optional zipcode if the user provided one."}]',
  'usda-farmers-markets', -- Wait, the instructions say to just use the UI Card to handle it, or we can just redirect them to market. But let's just make the tool trigger the MultiSearchCard.
  true
)
ON CONFLICT (name) DO UPDATE 
SET trigger_rules = EXCLUDED.trigger_rules,
    schema_properties = EXCLUDED.schema_properties,
    backend_function = EXCLUDED.backend_function,
    is_active = EXCLUDED.is_active;

-- Update growbot rules to mention shopping
INSERT INTO growbot_rules (rule_text, is_active)
SELECT 'SHOPPING: When the user wants to buy produce or find where to buy something, ALWAYS call the ShoppingAssistant tool with the items they want. Never guess where they can buy it.', true
WHERE NOT EXISTS (
  SELECT 1 FROM growbot_rules WHERE rule_text LIKE '%ShoppingAssistant%'
);
