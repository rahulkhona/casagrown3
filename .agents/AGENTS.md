# Workspace Rules

- **UI Development Workflow**: Always test UI changes locally (e.g., using the dev server or local emulator) and verify their visual layout/functionality before deploying to staging or pushing to remote repositories (Vercel, GitHub, etc.).
- **Production Environment Safety**: The Supabase project `fzdmszvfeewpwswlnfyk` (labeled "staging") is the live production system. **Never** deploy functions, run migrations, update environment secrets, or perform data modifications on this project without your explicit consent first.
