import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

describe('Auth Signup Trigger Safety', () => {
  it('guarantees handle_new_user database function body never references dropped incentive_rules table', () => {
    const migrationsDir = path.join(__dirname, '../../../../supabase/migrations')
    const migrationFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()

    // Find the latest migration defining handle_new_user
    const latestMigrationFile = migrationFiles.reverse().find(file => {
      const content = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
      return content.includes('FUNCTION public.handle_new_user')
    })

    expect(latestMigrationFile).toBeDefined()

    const latestContent = fs.readFileSync(path.join(migrationsDir, latestMigrationFile!), 'utf8')

    // Extract function body between AS $$ and $$;
    const functionBodyMatch = latestContent.match(/FUNCTION public\.handle_new_user[\s\S]*?AS \$\$([\s\S]*?)\$\$/i)
    expect(functionBodyMatch).not.toBeNull()

    const functionBody = functionBodyMatch![1]

    // Assert handle_new_user body does NOT contain incentive_rules
    expect(functionBody).not.toContain('incentive_rules')

    // Assert handle_new_user body DOES query campaign_rewards
    expect(functionBody).toContain('campaign_rewards')
  })
})
