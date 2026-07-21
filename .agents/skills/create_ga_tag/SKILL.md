---
name: create-ga-tag
description: Automates the calculation, creation, and deployment of GA-prefixed release Git tags (e.g. GA1.53).
---

# Create GA Tag Skill

Use this skill to determine, create, and push GA-prefixed release Git tags for commits.

## 1. Retrieve Current Tags
Find the latest tag matching the pattern `GA1.*`.
- Command: `git tag` (filter for tags starting with `GA1.`)

## 2. Calculate the Next Version
- Parse the numeric suffix of the highest tag (e.g., if the highest tag is `GA1.52`, the suffix is `52`).
- Increment the suffix by 1 (e.g., `53`).
- The next tag name will be `GA1.53`.

## 3. Create the Git Tag
Create an annotated Git tag locally using:
- Command: `git tag -a GA1.<version> -m "Release version GA1.<version>: [Brief summary of commit changes]"`

## 4. Push the Tag
Push the newly created tag to origin:
- Command: `git push origin GA1.<version>`
