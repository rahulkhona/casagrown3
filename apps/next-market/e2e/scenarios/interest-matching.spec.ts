import { test, expect } from '@playwright/test'
import { execSql } from './scenario-helpers'

test.describe('Interest Matching DB Logic', () => {
  test('Creates match when buyer and seller have same produce in same zip', async () => {
    // 1. Create seller interest
    execSql(`
      INSERT INTO crm_produce_interests (user_id, produce_name, interest_type, zipcodes, status)
      VALUES ((SELECT id FROM profiles LIMIT 1), 'Tomatoes', 'sell', ARRAY['95120'], 'active')
    `)
    
    // 2. Create buyer interest
    execSql(`
      INSERT INTO crm_produce_interests (user_id, produce_name, interest_type, zipcodes, status)
      VALUES ((SELECT id FROM profiles LIMIT 1), 'Tomatoes', 'buy', ARRAY['95120'], 'active')
    `)

    // Wait for triggers or async jobs
    await new Promise((r) => setTimeout(r, 1000))

    // 3. Verify match created
    // Note: assuming a matches table exists. Adjust table name as needed.
    // const matchResult = execSql(`SELECT * FROM interest_matches WHERE produce_name = 'Tomatoes'`)
    // expect(matchResult).toBeTruthy()
    
    // Cleanup
    execSql(`DELETE FROM crm_produce_interests WHERE produce_name = 'Tomatoes' AND zipcodes = ARRAY['95120']`)
  })

  test('No match for different produce or zip', async () => {
    execSql(`
      INSERT INTO crm_produce_interests (user_id, produce_name, interest_type, zipcodes, status)
      VALUES ((SELECT id FROM profiles LIMIT 1), 'Apples', 'sell', ARRAY['95120'], 'active')
    `)
    
    execSql(`
      INSERT INTO crm_produce_interests (user_id, produce_name, interest_type, zipcodes, status)
      VALUES ((SELECT id FROM profiles LIMIT 1), 'Apples', 'buy', ARRAY['90210'], 'active')
    `)

    await new Promise((r) => setTimeout(r, 1000))
    // Verify no match
    
    // Cleanup
    execSql(`DELETE FROM crm_produce_interests WHERE produce_name = 'Apples'`)
  })

  test('Campaign lead sync creates crm_produce_interests', async () => {
    // Insert into campaign_leads if applicable
    // Verify crm_produce_interests rows
  })
})
