---
description: Rules for fixing bugs — always propose the right fix before implementing
---

# Bug Fix Approach

When encountering a bug or issue, **always present fix options to the user before implementing**:

1. **Diagnose the root cause first** — don't jump to a workaround
2. **Present options clearly**:
   - **Quick fix / workaround**: What it does, trade-offs, what it doesn't solve
   - **Right fix / root cause**: What it does, why it's better, any extra effort
3. **Ask the user which approach they prefer** before writing code
4. **Never implement a quick hack without explicit approval** — the user prefers robust, proper fixes

## Anti-patterns to avoid

- Removing code to work around a bug instead of fixing the underlying issue
- Adding try/catch to swallow errors instead of fixing why the error occurs
- Skipping a feature to avoid a bug instead of fixing the bug
- Implementing a workaround and pushing it before consulting the user

## Example

❌ Bad: "I removed the `home_location` update to avoid the PostGIS error"
✅ Good: "The error is caused by ambiguous geometry operators. Here are two options:
  - Option A (root cause): Fix the trigger's search_path
  - Option B (workaround): Skip setting home_location client-side
  Which do you prefer?"
