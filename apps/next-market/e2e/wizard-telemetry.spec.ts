import { test, expect } from './fixtures';

test.describe('Multi-Wizard Telemetry E2E', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeEach(async ({ page }) => {
    // Disable sendBeacon so telemetry requests fallback to POST requests we can easily intercept
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'sendBeacon', { value: false, configurable: true, writable: true });
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. CREATE LISTING WIZARD (/create-listing)
  // ─────────────────────────────────────────────────────────────────────────────

  test('create-listing: should track main path and button clicks', async ({ page }) => {
    const trackEvents: any[] = [];
    page.on('request', request => {
      if (request.url().includes('/api/crm/track') && request.method() === 'POST') {
        const dataStr = request.postData();
        if (dataStr) {
          try {
            trackEvents.push(JSON.parse(dataStr));
          } catch (e) {}
        }
      }
    });

    await page.goto('/create-listing');
    await page.waitForLoadState('networkidle');

    // Fill Step 1 Basics (All fields)
    await page.locator('input[type="email"]').fill('telemetry-seller@example.com');
    await page.locator('input[placeholder="e.g. Organic Heirloom Tomatoes"]').fill('Fresh Golden Peaches');
    await page.locator('textarea[placeholder="Tell buyers about your produce..."]').fill('Freshly harvested golden peaches from the farm.');
    await page.locator('select').selectOption({ index: 1 });
    await page.locator('input[type="date"]').fill('2026-07-15');

    // Go next
    await page.getByRole('button', { name: 'Next →' }).click();

    // Fill Step 2 Fulfillment (All fields)
    await expect(page.locator('h2:has-text("How will buyers get it?")')).toBeVisible({ timeout: 15000 });
    await page.getByPlaceholder('Street Address').first().fill('100 Main St');
    await page.getByPlaceholder('City').first().fill('San Francisco');
    await page.getByPlaceholder('ST').first().fill('CA');
    await page.getByPlaceholder('ZIP').first().fill('94105');
    await page.getByText(/^Today/i).first().click();
    await page.getByText('Pickup Available').click(); // toggle pickup off

    // Go next
    await page.getByRole('button', { name: 'Next →' }).click();

    // Fill Step 3 Pricing (All fields)
    await expect(page.locator('h2:has-text("Set Your Price")')).toBeVisible({ timeout: 15000 });
    await page.locator('input[type="number"]').first().fill('12');
    await page.locator('input[type="number"]').last().fill('4.99');

    // Go next
    await page.getByRole('button', { name: 'Next →' }).click();

    // Verify reached Step 4 Verify
    await expect(page.locator('h2:has-text("Secure Your Listing")')).toBeVisible({ timeout: 15000 });

    // Validate wizard_step and field telemetry events are present
    expect(trackEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_type: 'wizard_step',
          page_slug: '/create-listing',
          event_data: expect.objectContaining({ step_index: 1 })
        }),
        expect.objectContaining({
          event_type: 'wizard_field_interact',
          page_slug: '/create-listing',
          event_data: expect.objectContaining({
            field: 'next_button',
            has_value: true
          })
        })
      ])
    );
  });

  test('create-listing: should track field-level abandonment', async ({ page }) => {
    const trackEvents: any[] = [];
    page.on('request', request => {
      if (request.url().includes('/api/crm/track') && request.method() === 'POST') {
        const dataStr = request.postData();
        if (dataStr) {
          try {
            trackEvents.push(JSON.parse(dataStr));
          } catch (e) {}
        }
      }
    });

    await page.goto('/create-listing');
    await page.waitForLoadState('networkidle');

    // Fill only email and product name (leave description, category, harvest date empty)
    await page.locator('input[type="email"]').fill('abandon-seller@example.com');
    await page.locator('input[placeholder="e.g. Organic Heirloom Tomatoes"]').fill('Incomplete Tomatoes');

    // Trigger blur on product name
    await page.locator('input[placeholder="e.g. Organic Heirloom Tomatoes"]').blur();

    // Navigate away to trigger abandonment tracking
    await page.goto('/');

    await expect.poll(() => trackEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_type: 'wizard_abandon',
          page_slug: '/create-listing',
          event_data: expect.objectContaining({
            last_step: 1,
            last_step_name: 'basics'
          })
        }),
        expect.objectContaining({
          event_type: 'wizard_field_interact',
          page_slug: '/create-listing',
          event_data: expect.objectContaining({
            field: 'product_name',
            has_value: true
          })
        }),
        expect.objectContaining({
          event_type: 'wizard_field_interact',
          page_slug: '/create-listing',
          event_data: expect.objectContaining({
            field: 'description',
            has_value: false
          })
        })
      ])
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. JOIN WIZARD (/join)
  // ─────────────────────────────────────────────────────────────────────────────

  test('join: should track main path and skip button', async ({ page }) => {
    const trackEvents: any[] = [];
    page.on('request', request => {
      if (request.url().includes('/api/crm/track') && request.method() === 'POST') {
        const dataStr = request.postData();
        if (dataStr) {
          try {
            trackEvents.push(JSON.parse(dataStr));
          } catch (e) {}
        }
      }
    });

    await page.goto('/join');
    await page.waitForLoadState('networkidle');

    // Fill Step 1 Profile (All fields)
    await page.locator('#join-name').fill('Alice Tester');
    await page.locator('#join-email').fill('alice@example.com');
    await page.locator('#join-street').fill('200 Main St');
    await page.locator('#join-city').fill('San Jose');
    await page.locator('#join-state').fill('CA');
    await page.locator('#join-zip').fill('95112');

    // Continue
    await page.getByRole('button', { name: 'Continue →' }).click();

    // Step 2 OTP
    await expect(page.locator('h2:has-text("Verify Your Email")')).toBeVisible({ timeout: 15000 });
    
    // Verify wizard_step and field telemetry events are present
    expect(trackEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_type: 'wizard_step',
          page_slug: '/join',
          event_data: expect.objectContaining({ step_index: 1 })
        }),
        expect.objectContaining({
          event_type: 'wizard_field_interact',
          page_slug: '/join',
          event_data: expect.objectContaining({
            field: 'next_button',
            has_value: true
          })
        })
      ])
    );
  });

  test('join: should track field-level abandonment', async ({ page }) => {
    const trackEvents: any[] = [];
    page.on('request', request => {
      if (request.url().includes('/api/crm/track') && request.method() === 'POST') {
        const dataStr = request.postData();
        if (dataStr) {
          try {
            trackEvents.push(JSON.parse(dataStr));
          } catch (e) {}
        }
      }
    });

    await page.goto('/join');
    await page.waitForLoadState('networkidle');

    // Fill name and email, but leave street/city/state/zip empty
    await page.locator('#join-name').fill('Bob Abandoner');
    await page.locator('#join-email').fill('bob@example.com');
    await page.locator('#join-email').blur();

    // Navigate away
    await page.goto('/');

    await expect.poll(() => trackEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_type: 'wizard_abandon',
          page_slug: '/join',
          event_data: expect.objectContaining({
            last_step: 1,
            last_step_name: 'profile'
          })
        }),
        expect.objectContaining({
          event_type: 'wizard_field_interact',
          page_slug: '/join',
          event_data: expect.objectContaining({
            field: 'full_name',
            has_value: true
          })
        }),
        expect.objectContaining({
          event_type: 'wizard_field_interact',
          page_slug: '/join',
          event_data: expect.objectContaining({
            field: 'zip_code',
            has_value: false
          })
        })
      ])
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. SELLER CALCULATOR WIZARD (/sell)
  // ─────────────────────────────────────────────────────────────────────────────

  test('sell: should track main path and calculations', async ({ page }) => {
    const trackEvents: any[] = [];
    page.on('request', request => {
      if (request.url().includes('/api/crm/track') && request.method() === 'POST') {
        const dataStr = request.postData();
        if (dataStr) {
          try {
            trackEvents.push(JSON.parse(dataStr));
          } catch (e) {}
        }
      }
    });

    await page.goto('/sell');
    await page.waitForLoadState('networkidle');

    // Step 1: Intro
    const introBtn = page.getByRole('button', { name: 'Get My Estimate →' });
    if (await introBtn.isVisible().catch(() => false)) {
      await introBtn.click();
    }

    // Step 2: Zipcode
    await expect(page.locator('h2:has-text("Where is your garden?")')).toBeVisible({ timeout: 30000 });
    await page.locator('input[placeholder="e.g. 90210"]').fill('95112');
    await page.getByRole('button', { name: 'Next →' }).click();

    // Step 3: Size
    await expect(page.locator('h2:has-text("How big is your growing space?")')).toBeVisible({ timeout: 30000 });
    await page.getByLabel('Large Backyard Garden').click();
    await page.getByRole('button', { name: 'Next →' }).click();

    // Step 4: Plants
    await expect(page.locator('h2:has-text("What plants are you growing?")')).toBeVisible({ timeout: 30000 });
    await page.getByLabel('Tomatoes').click();
    await page.getByRole('button', { name: 'Next →' }).click();

    // Step 5: Trees
    await expect(page.locator('h2:has-text("Any fruit trees?")')).toBeVisible({ timeout: 30000 });
    await page.getByLabel('Citrus (Lemons, Oranges)').click();
    await page.getByRole('button', { name: 'Estimate My Potential' }).click();

    // Step 7: Lead capture
    await expect(page.locator('h2:has-text("Your report is ready!")')).toBeVisible({ timeout: 30000 });
    
    // Verify wizard_step and field telemetry events are present
    expect(trackEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_type: 'wizard_step',
          page_slug: '/sell',
          event_data: expect.objectContaining({ step_index: 2 })
        }),
        expect.objectContaining({
          event_type: 'wizard_field_interact',
          page_slug: '/sell',
          event_data: expect.objectContaining({
            field: 'zipcode',
            has_value: true
          })
        })
      ])
    );
  });

  test('sell: should track field-level abandonment', async ({ page }) => {
    const trackEvents: any[] = [];
    page.on('request', request => {
      if (request.url().includes('/api/crm/track') && request.method() === 'POST') {
        const dataStr = request.postData();
        if (dataStr) {
          try {
            trackEvents.push(JSON.parse(dataStr));
          } catch (e) {}
        }
      }
    });

    await page.goto('/sell');
    await page.waitForLoadState('networkidle');

    // Step 1: Intro
    await page.locator('button:has-text("Estimate"), button:has-text("Get"), button:has-text("Calculate")').first().click();

    // Step 2: Zipcode
    await expect(page.locator('h2:has-text("Where is your garden?")')).toBeVisible({ timeout: 30000 });
    await page.locator('input[placeholder="e.g. 90210"]').fill('95112');
    await page.locator('input[placeholder="e.g. 90210"]').blur();

    // Navigate away
    await page.goto('/');

    await expect.poll(() => trackEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_type: 'wizard_abandon',
          page_slug: '/sell',
          event_data: expect.objectContaining({
            last_step: 2,
            last_step_name: 'zipcode'
          })
        }),
        expect.objectContaining({
          event_type: 'wizard_field_interact',
          page_slug: '/sell',
          event_data: expect.objectContaining({
            field: 'zipcode',
            has_value: true
          })
        })
      ])
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. NUTRITION LOSS CALCULATOR WIZARD (/check-nutrition-loss)
  // ─────────────────────────────────────────────────────────────────────────────

  test('nutrition: should track main path', async ({ page }) => {
    const trackEvents: any[] = [];
    page.on('request', request => {
      if (request.url().includes('/api/crm/track') && request.method() === 'POST') {
        const dataStr = request.postData();
        if (dataStr) {
          try {
            trackEvents.push(JSON.parse(dataStr));
          } catch (e) {}
        }
      }
    });

    await page.goto('/check-nutrition-loss');
    await page.waitForLoadState('networkidle');

    // Step 1: Intro
    await page.getByRole('button', { name: 'Check My Nutrition Loss →' }).click();

    // Step 2: Zipcode
    const zipHeading = page.locator('h2:has-text("Where are you located?")');
    if (await zipHeading.isVisible({ timeout: 5000 }).catch(() => false)) {
      await page.locator('input[placeholder="e.g. 95125"]').fill('95125');
      await page.getByRole('button', { name: 'Next →' }).click();
    }

    // Step 3: Produce
    await expect(page.locator('h2:has-text("What produce do you buy most?")')).toBeVisible({ timeout: 30000 });
    await page.getByLabel('Spinach').click();
    await page.getByRole('button', { name: 'Next →' }).click();

    // Step 4: Lead capture
    await expect(page.locator('h2:has-text("Your report is ready!")')).toBeVisible({ timeout: 30000 });

    // Verify wizard_step and field telemetry events are present
    expect(trackEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_type: 'wizard_step',
          page_slug: '/check-nutrition-loss',
          event_data: expect.objectContaining({ step_index: 2 })
        }),
        expect.objectContaining({
          event_type: 'wizard_field_interact',
          page_slug: '/check-nutrition-loss',
          event_data: expect.objectContaining({
            field: 'next_button',
            has_value: true
          })
        })
      ])
    );
  });

  test('nutrition: should track field-level abandonment', async ({ page }) => {
    const trackEvents: any[] = [];
    page.on('request', request => {
      if (request.url().includes('/api/crm/track') && request.method() === 'POST') {
        const dataStr = request.postData();
        if (dataStr) {
          try {
            trackEvents.push(JSON.parse(dataStr));
          } catch (e) {}
        }
      }
    });

    await page.goto('/check-nutrition-loss');
    await page.waitForLoadState('networkidle');

    // Step 1: Intro
    await page.getByRole('button', { name: 'Check My Nutrition Loss →' }).click();

    // Step 2: Zipcode
    const zipHeadingAbandon = page.locator('h2:has-text("Where are you located?")');
    if (await zipHeadingAbandon.isVisible({ timeout: 5000 }).catch(() => false)) {
      await page.locator('input[placeholder="e.g. 95125"]').fill('95125');
      await page.getByRole('button', { name: 'Next →' }).click();
    }

    // Step 3: Produce (leave spinach unselected)
    await expect(page.locator('h2:has-text("What produce do you buy most?")')).toBeVisible({ timeout: 30000 });

    // Navigate away
    await page.goto('/');

    await expect.poll(() => trackEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_type: 'wizard_abandon',
          page_slug: '/check-nutrition-loss',
          event_data: expect.objectContaining({
            last_step_name: 'produce'
          })
        }),
        expect.objectContaining({
          event_type: 'wizard_field_interact',
          page_slug: '/check-nutrition-loss',
          event_data: expect.objectContaining({
            field: 'selected_produce',
            has_value: false
          })
        })
      ])
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. PRO PROMOTION SIGNUP WIZARD (/p/[slug])
  // ─────────────────────────────────────────────────────────────────────────────

  test('pro-signup: should track main path and transitions', async ({ page }) => {
    const futureDate = new Date()
    futureDate.setMonth(futureDate.getMonth() + 1)
    await page.route('**/rest/v1/rpc/crm_get_landing_page_promotion*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'promo-123',
          name: 'Spring Harvest Combo Promo',
          description_html: '<p>Win big</p>',
          enrollment_deadline: futureDate.toISOString(),
          allow_existing_users: true,
          buyer_discounts: null,
          hero_image_url: null
        })
      });
    });

    await page.route('**/rest/v1/rpc/crm_check_promo_eligibility*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ eligible: true, is_registered: false })
      });
    });

    const trackEvents: any[] = [];
    page.on('request', request => {
      if (request.url().includes('/api/crm/track') && request.method() === 'POST') {
        const dataStr = request.postData();
        if (dataStr) {
          try {
            trackEvents.push(JSON.parse(dataStr));
          } catch (e) {}
        }
      }
    });

    await page.goto('/p/spring-giveaway-test');
    await page.waitForLoadState('networkidle');

    await page.locator('input[type="email"]').fill('pro-telemetry-seller@example.com');
    await page.locator('input[type="email"]').blur();

    await page.getByRole('button', { name: 'Continue to Claim' }).click();
    await expect(page.locator('h2:has-text("Setup Your Profile")')).toBeVisible({ timeout: 15000 });

    // Fill Step 2 Profile fields
    await page.getByPlaceholder('e.g. Oakridge Farms').fill('Telemetry Farm');
    await page.getByPlaceholder('e.g. Oakridge Farms').blur();

    await page.getByPlaceholder('Jane Doe').fill('Jane Telemetry');
    await page.getByPlaceholder('Jane Doe').blur();

    await page.getByPlaceholder('123 Farm Road').fill('456 Telemetry Rd');
    await page.getByPlaceholder('123 Farm Road').blur();

    await page.getByPlaceholder('City').fill('Telemetry City');
    await page.getByPlaceholder('City').blur();

    await page.getByPlaceholder('ST').fill('CA');
    await page.getByPlaceholder('ST').blur();

    await page.getByPlaceholder('12345').fill('94016');
    await page.getByPlaceholder('12345').blur();

    await page.getByPlaceholder('(555) 555-5555').fill('555-666-7777');
    await page.getByPlaceholder('(555) 555-5555').blur();

    // Check smsConsent toggle
    await page.locator('input[type="checkbox"]').first().click();

    expect(trackEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_type: 'wizard_step',
          page_slug: '/p/spring-giveaway-test',
          event_data: expect.objectContaining({ step_index: 1 })
        }),
        expect.objectContaining({
          event_type: 'wizard_field_interact',
          page_slug: '/p/spring-giveaway-test',
          event_data: expect.objectContaining({
            field: 'email',
            has_value: true
          })
        }),
        expect.objectContaining({
          event_type: 'wizard_field_interact',
          page_slug: '/p/spring-giveaway-test',
          event_data: expect.objectContaining({
            field: 'farm_name',
            has_value: true
          })
        }),
        expect.objectContaining({
          event_type: 'wizard_field_interact',
          page_slug: '/p/spring-giveaway-test',
          event_data: expect.objectContaining({
            field: 'full_name',
            has_value: true
          })
        }),
        expect.objectContaining({
          event_type: 'wizard_field_interact',
          page_slug: '/p/spring-giveaway-test',
          event_data: expect.objectContaining({
            field: 'street_address',
            has_value: true
          })
        }),
        expect.objectContaining({
          event_type: 'wizard_field_interact',
          page_slug: '/p/spring-giveaway-test',
          event_data: expect.objectContaining({
            field: 'city',
            has_value: true
          })
        }),
        expect.objectContaining({
          event_type: 'wizard_field_interact',
          page_slug: '/p/spring-giveaway-test',
          event_data: expect.objectContaining({
            field: 'state_code',
            has_value: true
          })
        }),
        expect.objectContaining({
          event_type: 'wizard_field_interact',
          page_slug: '/p/spring-giveaway-test',
          event_data: expect.objectContaining({
            field: 'zip_code',
            has_value: true
          })
        }),
        expect.objectContaining({
          event_type: 'wizard_field_interact',
          page_slug: '/p/spring-giveaway-test',
          event_data: expect.objectContaining({
            field: 'phone',
            has_value: true
          })
        }),
        expect.objectContaining({
          event_type: 'wizard_field_interact',
          page_slug: '/p/spring-giveaway-test',
          event_data: expect.objectContaining({
            field: 'sms_consent'
          })
        })
      ])
    );
  });

  test('pro-signup: should track field-level abandonment', async ({ page }) => {
    const futureDate = new Date()
    futureDate.setMonth(futureDate.getMonth() + 1)
    await page.route('**/rest/v1/rpc/crm_get_landing_page_promotion*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'promo-123',
          name: 'Spring Harvest Combo Promo',
          description_html: '<p>Win big</p>',
          enrollment_deadline: futureDate.toISOString(),
          allow_existing_users: true,
          buyer_discounts: null,
          hero_image_url: null
        })
      });
    });

    await page.route('**/rest/v1/rpc/crm_check_promo_eligibility*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ eligible: true, is_registered: false })
      });
    });

    const trackEvents: any[] = [];
    page.on('request', request => {
      if (request.url().includes('/api/crm/track') && request.method() === 'POST') {
        const dataStr = request.postData();
        if (dataStr) {
          try {
            trackEvents.push(JSON.parse(dataStr));
          } catch (e) {}
        }
      }
    });

    await page.goto('/p/spring-giveaway-test');
    await page.waitForLoadState('networkidle');

    await page.locator('input[type="email"]').fill('pro-abandon-seller@example.com');
    await page.locator('input[type="email"]').blur();

    await page.getByRole('button', { name: 'Continue to Claim' }).click();
    await expect(page.locator('h2:has-text("Setup Your Profile")')).toBeVisible({ timeout: 15000 });

    // Partially fill profile fields, leave address & phone empty
    await page.getByPlaceholder('e.g. Oakridge Farms').fill('Partial Farm');
    await page.getByPlaceholder('e.g. Oakridge Farms').blur();

    await page.getByPlaceholder('Jane Doe').fill('Jane Partial');
    await page.getByPlaceholder('Jane Doe').blur();

    await page.goto('/');

    await expect.poll(() => trackEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          event_type: 'wizard_abandon',
          page_slug: '/p/spring-giveaway-test',
          event_data: expect.objectContaining({
            last_step: 2,
            last_step_name: 'profile',
            field_states: expect.objectContaining({
              email: true,
              farmName: true,
              name: true,
              street: false,
              phone: false
            })
          })
        })
      ])
    );
  });
});
