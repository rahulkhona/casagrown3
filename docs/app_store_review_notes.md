# App Store Connect Review Notes (Guideline 5.1.1(v) Compliance)

Use the templates below when submitting the app to App Store Connect to ensure the reviewer understands our conditional account deletion implementation.

---

## 📝 1. Text to Copy-Paste into the "Notes" Field
Copy the text block below and paste it into the **App Review Information > Notes** text box in App Store Connect:

```text
Guideline 5.1.1(v) - Account Deletion Compliance Notes:

We have fully integrated in-app account deletion to satisfy Guideline 5.1.1(v). A direct deletion path is accessible in the navigation menu drawer (Menu > Delete Account), and is also available as a fallback button on the onboarding setup page.

To ensure complete user transparency and satisfy local legal regulations, our deletion system conditionally handles three user data paths depending on historical footprint:

* Case A (Brand New / Clean User): If the user has zero transactional or community footprint, initiating deletion completely erases all user profile data, settings, and authorization details. The user is signed out immediately and can re-register with the same email.
* Case B (Social Footprint Only): If the user has contributed posts or chat messages (but has no orders/financial transactions), their profile name is anonymized to "Deleted User" and their avatar is deleted to purge PII, while preserving conversation context for active neighbors.
* Case C (Transactional Footprint): If the user has past order history or account balances, their profile name is anonymized, but their contact info (email/phone), billing address, and transaction logs are retained strictly to comply with tax/accounting audits and food safety source traceability regulations.

Reviewer Credentials:
We have attached a visual guide in the "Attachments" section showing the visual interfaces for each of these three deletion flows. You may test the deletion flow natively using the provided test account credentials.
```

---

## 📁 2. Files to Upload to the "Attachment" Field
Upload the following screenshots (located in your repository at `/docs/delete_account_screenshots/`) as attachments so the reviewer can see the screen layouts for each case:

### iPhone 6.5" Viewport Attachments:
1. **Case A (Clean User):** `iphone65/08_delete_account.png`
2. **Case B (Social Footprint):** `iphone65/08_delete_account_social.png`
3. **Case C (Transactional Footprint):** `iphone65/08_delete_account_standard.png`

### iPad Pro 12.9" Viewport Attachments:
1. **Case A (Clean User):** `ipad129/08_delete_account.png`
2. **Case B (Social Footprint):** `ipad129/08_delete_account_social.png`
3. **Case C (Transactional Footprint):** `ipad129/08_delete_account_standard.png`
