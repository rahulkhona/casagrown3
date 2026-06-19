'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useMarketStatus } from '../../../lib/useMarketStatus'
import { ENABLE_ELITE } from '../../../lib/featureFlags'
import { createClient } from '../../../lib/supabase'
import styles from './page.module.css'

type Tier = 'pro' | 'elite' | null

interface Section {
  id: string
  icon: string
  title: string
  tier: Tier
  content: React.ReactNode
}

const SECTIONS: Section[] = [
  // ─── GETTING STARTED ───
  {
    id: 'getting-started',
    icon: '🏠',
    title: 'Getting Started',
    tier: null,
    content: (
      <>
        <p>Welcome to CasaGrown! Here&apos;s how to set up your account and start using the platform.</p>
        <h4>Creating Your Profile</h4>
        <ol>
          <li><strong>Sign up</strong> with your email address — you&apos;ll receive a one-time verification code</li>
          <li><strong>Enter your name</strong> — this is how other users will see you</li>
          <li><strong>Add your address</strong> — tap <em>&quot;📍 Use My Location&quot;</em> for automatic GPS detection, or type it in manually. Your address is validated via USPS and used to match you with nearby stands</li>
          <li><strong>Upload a profile photo</strong> — tap the camera icon to take a photo or choose from your gallery. You can crop and position it</li>
        </ol>
        <p className={styles.tip}>💡 <strong>Important:</strong> Your exact address is never shown to other users. It&apos;s used only to find stands near you and for delivery coordination.</p>
        <h4>Phone & Notifications</h4>
        <ul>
          <li><strong>Add your phone number</strong> — verify it with a one-time code for SMS notifications</li>
          <li><strong>Enable push notifications</strong> — get alerted when the market opens, when you receive orders, and when someone messages you</li>
          <li><strong>SMS notifications</strong> — opt in to receive text messages for important updates</li>
        </ul>
        <h4>Navigating the App</h4>
        <p>The bottom navigation bar has four main tabs:</p>
        <ul>
          <li>🛍️ <strong>Market</strong> — Browse and buy produce from neighbors</li>
          <li>📦 <strong>Orders</strong> — Track purchases and manage incoming orders</li>
          <li>💬 <strong>Messages</strong> — Direct messages with buyers and sellers</li>
          <li>👥 <strong>Community</strong> — Neighborhood chat with fellow growers</li>
        </ul>
        <p>The ☰ menu (top right) gives you access to your stands, earnings, profile, wallet, and more.</p>
      </>
    ),
  },
  // ─── MARKET SCHEDULE ───
  {
    id: 'schedule',
    icon: '📅',
    title: 'Market Schedule & Hours',
    tier: null,
    content: (
      <>
        <p>The market is open <strong>every Saturday and Sunday from 8:00 AM to 11:00 AM</strong> (your local time).</p>
        <p><strong>Why limited hours?</strong> Fresher produce, fairer access, and a true community shopping experience — just like a real farmers market. We&apos;ll notify you before the market opens!</p>
        <ul>
          <li>Browse stands and place orders during market hours</li>
          <li>Sellers can list products anytime — they&apos;ll go live when the market opens</li>
          <li>Orders placed during market hours are fulfilled the same day</li>
          <li>A countdown timer on the Market page shows when the next market opens</li>
        </ul>
      </>
    ),
  },
  // ─── BROWSING THE MARKET ───
  {
    id: 'browsing',
    icon: '🛍️',
    title: 'Browsing the Market',
    tier: null,
    content: (
      <>
        <p>The Market page is your starting point for finding fresh produce from neighbors.</p>
        <h4>Finding Stands Near You</h4>
        <ol>
          <li><strong>Enter your address</strong> or tap <em>&quot;📍 Use My Location&quot;</em> to find stands nearby</li>
          <li>Stands are sorted by distance — the closest appear first</li>
          <li>Each stand card shows the stand name, distance from you, product count, and seller rating</li>
        </ol>
        <h4>Search & Filters</h4>
        <ul>
          <li><strong>Text search</strong> — search for specific produce (e.g., &quot;tomatoes&quot;, &quot;basil&quot;)</li>
          <li><strong>Fulfillment type</strong> — filter by All, Delivery only, or Pickup only</li>
          <li><strong>Distance</strong> — adjust the mile radius slider to find stands within your preferred range</li>
          <li><strong>Price range</strong> — set minimum and maximum price</li>
          <li><strong>Categories</strong> — filter by produce, baked goods, preserved items, flowers, garden equipment, seeds, eggs, honey, and more</li>
        </ul>
        <h4>Stand Details</h4>
        <p>Tap any stand card to see its full listing — product photos, descriptions, prices, available quantities, and fulfillment options (pickup or delivery with distance range).</p>
        <p className={styles.tip}>💡 <strong>Tip:</strong> Follow your favorite stands to get notified when they list new products!</p>
      </>
    ),
  },
  // ─── PLACING AN ORDER ───
  {
    id: 'ordering',
    icon: '🛒',
    title: 'Placing an Order',
    tier: null,
    content: (
      <>
        <p>CasaGrown connects you directly with neighbors who grow. <strong>No middlemen, no markup</strong> — just fresh produce from down the street.</p>
        <h4>How to Order</h4>
        <ol>
          <li><strong>Browse a stand</strong> — tap on a stand to see available products</li>
          <li><strong>Add items to cart</strong> — select quantities for each product you want</li>
          <li><strong>Choose fulfillment</strong> — pick up at the seller&apos;s location or request delivery (if offered)</li>
          <li><strong>Review your cart</strong> — you can order from multiple stands in a single checkout</li>
          <li><strong>Pay securely</strong> — all payments are handled through Stripe. Your card is <strong>only charged upon delivery confirmation</strong>, not when you place the order</li>
        </ol>
        <h4>Multi-Stand Orders</h4>
        <p>You can add items from multiple stands to your cart. Each stand receives its own order and coordinates delivery or pickup with you separately.</p>
        <h4>After You Order</h4>
        <p>Once your order is placed, the seller is notified immediately. You can track the status in the <strong>📦 Orders</strong> tab and coordinate pickup details via the order chat.</p>
      </>
    ),
  },
  // ─── ORDER MANAGEMENT ───
  {
    id: 'order-management',
    icon: '📦',
    title: 'Order Management',
    tier: null,
    content: (
      <>
        <p>The <strong>Orders</strong> tab shows all your purchases (as a buyer) and incoming orders (as a seller). Orders are organized into tabs so you always know what needs attention.</p>
        <h4>Orders Tabs</h4>
        <ul>
          <li>🔔 <strong>Needs Action</strong> — orders that require your attention (new orders to fulfill as a seller, deliveries to confirm as a buyer, active disputes)</li>
          <li>📦 <strong>Delivered</strong> — orders the seller has fulfilled and provided proof for</li>
          <li>⚠️ <strong>Disputed</strong> — orders with reported issues being resolved</li>
          <li>✅ <strong>Completed</strong> — finished orders (confirmed, cancelled, or resolved)</li>
        </ul>
        <p>You can also filter by role — <strong>🛒 Buying</strong>, <strong>🏪 Selling</strong>, or <strong>🤝 Helping</strong> (if you&apos;re a stand helper).</p>

        <h4>For Sellers: Fulfilling Orders</h4>
        <p>When you receive a new order, you&apos;ll get a notification and it appears in your <strong>Needs Action</strong> tab. Open the order and you have two options:</p>
        <ol>
          <li><strong>Fulfill the order:</strong>
            <ul>
              <li>For <strong>delivery orders</strong> — tap <em>&quot;📦 Mark Delivered&quot;</em></li>
              <li>For <strong>pickup orders</strong> — tap <em>&quot;📸 Provide Pickup Proof&quot;</em></li>
              <li>You&apos;ll be prompted to <strong>take at least one photo</strong> as proof of delivery/pickup. The photo is automatically geotagged with your GPS location and timestamp</li>
              <li>For deliveries, include both the items AND the door/gate in the photo. If your GPS is far from the buyer&apos;s address, a warning will appear</li>
            </ul>
          </li>
          <li><strong>Decline the order</strong> — tap <em>&quot;✕ Decline Order&quot;</em> and select a reason (out of stock, cannot fulfill, item unavailable, or other). The buyer is notified automatically</li>
        </ol>

        <h4>For Buyers: Confirming Receipt</h4>
        <p>After the seller marks your order as delivered, you&apos;ll see two options:</p>
        <ul>
          <li><strong>&quot;✓ Confirm Delivery&quot;</strong> (or &quot;✓ Confirm Pickup&quot;) — tap this to complete the order. You&apos;ll be prompted to rate the seller</li>
          <li><strong>Auto-confirm timer</strong> — if you don&apos;t take action, the order automatically completes after the countdown (shown as &quot;⏰ Auto-confirms in...&quot;)</li>
        </ul>

        <h4>Reporting Issues (Disputes)</h4>
        <p>If something went wrong with your order, tap <strong>&quot;Report Issue&quot;</strong> instead of confirming. You can report:</p>
        <ul>
          <li>📦 <strong>Not Delivered</strong> — you never received the order</li>
          <li>🔢 <strong>Quantity Mismatch</strong> — items are missing (you&apos;ll enter the quantity received and attach a photo)</li>
          <li>❌ <strong>Wrong Item</strong> — you received a different product (photo required)</li>
          <li>👎 <strong>Poor Quality</strong> — items arrived damaged or spoiled (photo recommended)</li>
        </ul>

        <h4>How Disputes Are Resolved</h4>
        <ol>
          <li>Your dispute is submitted and marked <em>&quot;🔍 Under Review&quot;</em></li>
          <li>The seller is notified and can proactively offer a <strong>full or partial refund</strong></li>
          <li>You can <strong>accept the refund</strong> or wait for staff to review (typically 24–48 hours)</li>
          <li>You can also <strong>withdraw your dispute</strong> if the issue is resolved directly with the seller</li>
          <li>Both buyer and seller can exchange messages within the dispute thread</li>
        </ol>

        <h4>Order Chat</h4>
        <p>Every order has a built-in chat thread. Tap <em>&quot;📋 Order Notes&quot;</em> on any order to send messages to the buyer or seller — coordinate pickup times, ask questions, or share updates. Unread messages show a badge on the button.</p>
      </>
    ),
  },
  // ─── MESSAGES & DMs ───
  {
    id: 'messages',
    icon: '💬',
    title: 'Messages & Direct Chat',
    tier: null,
    content: (
      <>
        <p>The <strong>Messages</strong> tab is your unified inbox for all direct conversations — CasaGrown DMs, Facebook Messenger, Instagram, and WhatsApp — all in one place.</p>
        <h4>GrowBot (Pinned)</h4>
        <p>GrowBot is always pinned at the top of your inbox with a yellow highlight and an <strong>AI</strong> badge. Tap it to chat with GrowBot about gardening, marketplace tips, or anything else.</p>
        <h4>Channel Badges</h4>
        <p>Every conversation in your inbox is clearly labeled so you know where the message originated:</p>
        <ul>
          <li><strong>CasaGrown DMs</strong> — no badge, shows the neighbor&apos;s avatar and name</li>
          <li><strong>📱 Messenger</strong> — blue badge next to the name, blue avatar background. These are customers messaging your Facebook Page</li>
          <li><strong>📸 Instagram</strong> — pink badge next to the name, pink avatar background. These are customers reaching out via Instagram DMs</li>
          <li><strong>🟢 WhatsApp</strong> — green badge next to the name, green avatar background. These are customers messaging your WhatsApp Business number</li>
        </ul>
        <p>All channel types are sorted together by most recent activity, so your most urgent conversations are always at the top.</p>
        <h4>Starting a New Chat</h4>
        <ul>
          <li>Tap <strong>&quot;+ New Chat&quot;</strong> at the top right to search for and message any CasaGrown user</li>
          <li>Tap a seller&apos;s profile from their stand to start a DM</li>
          <li>Use the order chat (📋 Order Notes) for order-specific questions</li>
        </ul>
        <h4>Search &amp; Filter</h4>
        <p>Use the search bar at the top of your inbox to quickly find conversations by name. Unread conversations are highlighted with a green background and a red unread badge.</p>
      </>
    ),
  },
  // ─── GROWBOT AI ASSISTANT ───
  {
    id: 'growbot',
    icon: '🤖',
    title: 'GrowBot AI Assistant',
    tier: null,
    content: (
      <>
        <p><strong>GrowBot</strong> is your personal AI gardening and marketplace assistant, available to all CasaGrown users.</p>
        <h4>How to Access GrowBot</h4>
        <ul>
          <li>Tap the <strong>&quot;Ask GrowBot&quot;</strong> floating button (bottom-right of the Market page)</li>
          <li>Or mention <strong>@GrowBot</strong> in Community chat to ask questions publicly</li>
        </ul>
        <h4>What GrowBot Can Do</h4>
        <ul>
          <li><strong>Hyper-local gardening tips</strong> — planting advice tailored to your exact USDA zone, soil type, and microclimate</li>
          <li><strong>Seasonal guidance</strong> — know exactly what to plant and when for your neighborhood</li>
          <li><strong>Pest &amp; disease help</strong> — describe symptoms or <strong>send a photo</strong> for GrowBot to analyze</li>
          <li><strong>Harvest timing</strong> — learn when your fruits and vegetables are at peak ripeness</li>
          <li><strong>Marketplace help</strong> — get tips on product descriptions, stand optimization, and selling strategies</li>
        </ul>
        <h4>Using the GrowBot Chat</h4>
        <ul>
          <li><strong>Ask in plain language</strong> — no gardening jargon needed. Just type your question</li>
          <li><strong>Send photos</strong> — upload a photo of your plant, pest, or produce for GrowBot to analyze</li>
          <li><strong>Follow-up chips</strong> — after each response, GrowBot suggests related follow-up questions you can tap to continue the conversation</li>
          <li><strong>Multiple topics</strong> — start new conversation topics to keep different subjects organized</li>
          <li><strong>Rate responses</strong> — thumbs up/down on any response to help GrowBot improve</li>
        </ul>
        <p className={styles.tip}>💡 <strong>Try asking:</strong> &quot;When should I plant tomatoes in my area?&quot; or send a photo with &quot;What&apos;s eating my basil leaves?&quot;</p>
      </>
    ),
  },
  // ─── SELLING: BOOTH SETUP ───
  {
    id: 'selling',
    icon: '🧺',
    title: 'Selling: Stand Setup & Listings',
    tier: null,
    content: (
      <>
        <p>Got a garden, fruit tree, or even a few extra herbs? <strong>Turn your harvest into income</strong> instead of letting it go to waste.</p>
        <h4>Creating Your Stand</h4>
        <ol>
          <li>Open the ☰ menu and tap <strong>&quot;My Produce Stands&quot;</strong></li>
          <li>Tap <strong>&quot;🌱 Create My Produce Stand&quot;</strong></li>
          <li>Give your stand a name and description</li>
          <li>Upload a cover photo — this is the banner image buyers see</li>
          <li>Set your fulfillment options — pickup, delivery (with distance range), or both</li>
        </ol>
        <h4>Adding Products</h4>
        <ol>
          <li>From your stand card, tap <strong>&quot;➕ Add Listing&quot;</strong></li>
          <li>Upload clear, well-lit photos — they&apos;re the #1 factor in getting orders</li>
          <li>Set a price and choose units (lb, bunch, each, pint, quart, etc.)</li>
          <li>Set the available quantity</li>
          <li>Add a description — mention if produce is organic, heirloom, or freshly picked</li>
        </ol>
        <h4>Product Catalog</h4>
        <p>Pro and Elite users have access to the <strong>📦 Product Catalog</strong> — a centralized inventory manager where you can create and maintain your full product library. Add products to the catalog once, then quickly list them to any of your stands without re-entering details each time. Access it from the &quot;📦 Manage Product Catalog&quot; button on your My Produce Stands page.</p>
        <h4>Managing Your Stand</h4>
        <p>Your stand card on the &quot;My Produce Stands&quot; page shows your status (● Active or ● Inactive), product count, and fulfillment modes. You can:</p>
        <ul>
          <li><strong>👁️ View</strong> — see your stand as buyers see it</li>
          <li><strong>✏️ Edit</strong> — update stand name, description, photo, or fulfillment settings</li>
          <li><strong>🔗 Share</strong> — share your stand via WhatsApp, Nextdoor, Facebook, SMS, Email, or copy a link</li>
          <li><strong>Update availability regularly</strong> so buyers see accurate stock</li>
        </ul>
        <h4>Helpers</h4>
        <p>You can invite helpers to assist with your stand. Helpers can see your orders, add listings, and chat with buyers on your behalf. They&apos;ll see your stand in their &quot;Stands I Help With&quot; section with a 🤝 Helper badge.</p>
      </>
    ),
  },
  // ─── EARNINGS & PAYOUTS ───
  {
    id: 'earnings',
    icon: '💰',
    title: 'Earnings & Payouts',
    tier: null,
    content: (
      <>
        <p>Track all your financial activity in the <strong>Earnings &amp; Activity</strong> page (accessible from the ☰ menu).</p>
        <h4>How Settlement Works</h4>
        <p>CasaGrown uses a <strong>market netting</strong> system. At settlement time, we calculate for each user: <em>sales − purchases − fees ± refunds = net earnings</em>. If you both buy and sell, your purchases are automatically deducted from your earnings — fewer transactions, less hassle.</p>
        <h4>Your Dashboard</h4>
        <p>The earnings page shows summary cards for:</p>
        <ul>
          <li>💰 <strong>Available</strong> — ready to cash out (with a &quot;Payout →&quot; button)</li>
          <li>⏳ <strong>Processing</strong> — payouts in transit to your bank or PayPal</li>
          <li>📦 <strong>Unsettled</strong> — orders awaiting nightly settlement</li>
          <li>🔒 <strong>Held for Purchases</strong> — amounts reserved for your pending orders</li>
          <li>Total Sales and Total Purchases with order counts</li>
        </ul>
        <h4>Cashing Out</h4>
        <ul>
          <li><strong>Stripe Connect (preferred)</strong> — link your bank account for direct deposits. Fast, secure, and automatic</li>
          <li><strong>PayPal</strong> — link your PayPal email and cash out anytime (1–3 business day processing)</li>
          <li><strong>Gift cards</strong> — redeem earnings for popular retailer gift cards</li>
          <li><strong>Donate to charity</strong> — contribute earnings to local food banks and community gardens</li>
          <li><strong>Auto-payout</strong> — set up automatic payouts so your earnings are sent without lifting a finger</li>
        </ul>
        <h4>Activity &amp; Receipts</h4>
        <p>Use the date filters (This Month, Year to Date, All Time, or a custom range) and the Activity tab to see every transaction. Tap any transaction to view the full receipt with price breakdown, and rate completed orders with 1–5 stars.</p>
      </>
    ),
  },
  // ─── COMMUNITY ───
  {
    id: 'community',
    icon: '👥',
    title: 'Community Chat',
    tier: null,
    content: (
      <>
        <p><strong>Community</strong> is your neighborhood chat — a place to connect with local growers and food enthusiasts.</p>
        <h4>What You Can Do</h4>
        <ul>
          <li>Share gardening tips, harvest photos, and recipes</li>
          <li>Ask questions about growing produce</li>
          <li>Coordinate with neighbors for bulk orders or seed swaps</li>
          <li>React to posts with emoji reactions</li>
          <li>Reply to specific messages in threads</li>
          <li>Edit or delete your own messages</li>
        </ul>
        <h4>Neighborhood-Based</h4>
        <p>Community conversations are organized by your geographic neighborhood. You&apos;ll see posts from people near you, making connections local and relevant.</p>
        <h4>Asking GrowBot in Community</h4>
        <p>Mention <strong>@GrowBot</strong> in any community message to get AI-powered gardening advice visible to everyone. Reply to a GrowBot message to ask follow-up questions.</p>
        <h4>Quick Actions</h4>
        <p>Use the suggestion chips at the top to quickly start actions like &quot;Sell&quot; (jump to listing creation) or &quot;Find&quot; (search for items within the community).</p>
        <p className={styles.tip}>💡 <strong>Tip:</strong> Introduce yourself when you join! Neighbors love knowing who&apos;s growing what nearby.</p>
      </>
    ),
  },
  // ─── SAFETY & TRUST ───
  {
    id: 'safety',
    icon: '🛡️',
    title: 'Safety & Trust',
    tier: null,
    content: (
      <>
        <p>Your neighbors are real people, and we treat this community with care.</p>
        <h4>Payment Protection</h4>
        <ul>
          <li><strong>Card charged on delivery only</strong> — your card is authorized when you order but only charged when the seller confirms delivery with photo proof</li>
          <li><strong>Secure payments</strong> — Stripe handles all transactions. We never see your card details</li>
          <li><strong>Dispute support</strong> — report any issue and our team resolves it within 24–48 hours</li>
        </ul>
        <h4>Address Privacy</h4>
        <ul>
          <li>Your exact address is <strong>never shown publicly</strong></li>
          <li>Stand locations appear as approximate neighborhoods, not exact addresses</li>
          <li>Your address is only shared with a seller during active delivery, or with a buyer when you approve pickup</li>
        </ul>
        <h4>Custom Pickup &amp; Touchless Options</h4>
        <ul>
          <li>Set a <strong>custom pickup location</strong> for each order — meet at your porch, a nearby corner, or any spot you prefer</li>
          <li><strong>Touchless pickup</strong> — the seller leaves the order at a designated spot, you pick up at your convenience</li>
          <li>Coordinate timing and location via in-app order chat</li>
        </ul>
        <h4>Community Standards</h4>
        <ul>
          <li><strong>Ratings &amp; reviews</strong> — rate your experience after each purchase (1–5 stars with optional review)</li>
          <li><strong>Report concerns</strong> — flag any product, message, or community post that feels off</li>
          <li><strong>Content moderation</strong> — messages are checked before sending to maintain a respectful community</li>
        </ul>
      </>
    ),
  },
  // ─── GROWBOT AUTO-REPLY ─── PRO
  {
    id: 'growbot-auto',
    icon: '🚜',
    title: 'GrowBot Auto-Reply',
    tier: 'pro',
    content: (
      <>
        <p>GrowBot Auto-Reply handles full customer conversations on your behalf so you can focus on growing. When buyers message you, GrowBot carries on a <strong>natural, multi-turn conversation</strong> — answering questions about your products, availability, pickup details, and more — all based on your stand info and custom instructions.</p>
        <h4>How It Works</h4>
        <ol>
          <li>A buyer sends you a message on any connected channel (CasaGrown DMs, Facebook Messenger, Instagram, or WhatsApp)</li>
          <li>GrowBot reads the conversation context, your product listings, and your custom instructions</li>
          <li>It responds naturally — not just once, but <strong>continuing the conversation</strong> as long as the buyer has questions. GrowBot handles follow-ups, answers about pricing, coordinates pickup times, and more</li>
          <li>You&apos;ll see a countdown timer <em>&quot;⏱️&quot;</em> showing when GrowBot will respond if you don&apos;t step in first. You can <strong>cancel</strong> the auto-reply at any time</li>
        </ol>
        <h4>Reviewing &amp; Taking Over</h4>
        <p>Open any conversation in the <strong>Messages</strong> tab to see what GrowBot has been saying on your behalf. You can:</p>
        <ul>
          <li><strong>Review the full conversation</strong> — see every message GrowBot sent and what the buyer replied</li>
          <li><strong>Take over anytime</strong> — as soon as you send a manual reply, GrowBot <strong>pauses</strong> and lets you handle it. It resumes only if you stop replying</li>
          <li><strong>Edit before sending</strong> — use the suggestion bar to modify GrowBot&apos;s draft before it goes out</li>
        </ul>
        <h4>Configuring GrowBot</h4>
        <p>Access GrowBot settings from your subscription management page. You can configure:</p>
        <ul>
          <li><strong>Auto-reply delay</strong> — from instant to 15 minutes. Set a longer delay if you prefer to reply personally first</li>
          <li><strong>Channel toggles</strong> — enable/disable GrowBot for each channel (CasaGrown DMs, Facebook Messenger, Instagram DMs, WhatsApp)</li>
          <li><strong>Custom instructions</strong> — add specific context like &quot;Always mention our Saturday pickup is at the farmers market. We don&apos;t deliver on Sundays.&quot; These instructions guide GrowBot&apos;s tone and content across all channels</li>
        </ul>
        <p className={styles.tip}>💡 <strong>Note:</strong> Even when auto-reply is disabled, GrowBot suggestions still appear in your DMs for you to review and send manually with one tap.</p>
      </>
    ),
  },
  // ─── FACEBOOK INTEGRATION ─── PRO
  {
    id: 'facebook',
    icon: '📘',
    title: 'Facebook Integration',
    tier: 'pro',
    content: (
      <>
        <p>Connect your Facebook Page to CasaGrown and automate your social selling.</p>
        <h4>Features</h4>
        <ul>
          <li><strong>Catalog Sync</strong> — your CasaGrown product listings are automatically synced to your Facebook Page catalog</li>
          <li><strong>Auto-Posting</strong> — new listings and updates are automatically posted to your Facebook Page and local groups</li>
          <li><strong>DM Auto-Replies</strong> — GrowBot responds to buyer messages on Facebook Messenger. These conversations appear in your CasaGrown Messages inbox</li>
          <li><strong>Comment Auto-Replies</strong> — GrowBot detects buying intent in post comments and sends private checkout DMs</li>
          <li><strong>Marketplace Spreadsheet</strong> — download a CSV file from your stand and bulk-upload your listings to Facebook Marketplace (see the Marketplace section below for step-by-step instructions)</li>
        </ul>
        <h4>Setup</h4>
        <p>Connect your Facebook Page from the subscription management page. You&apos;ll authorize CasaGrown to post and respond on your behalf. You can disconnect at any time.</p>
      </>
    ),
  },
  // ─── FACEBOOK MARKETPLACE SPREADSHEET ─── PRO
  {
    id: 'marketplace-csv',
    icon: '🏪',
    title: 'Facebook Marketplace Listings',
    tier: 'pro',
    content: (
      <>
        <p>Expand your reach by listing your products on <strong>Facebook Marketplace</strong> — one of the largest local selling platforms. CasaGrown generates a ready-to-upload spreadsheet so you can bulk-list all your products in minutes.</p>

        <h4>Step 1: Download Your Marketplace Spreadsheet</h4>
        <ol>
          <li>Go to <strong>My Produce Stands</strong> (☰ menu → My Produce Stands)</li>
          <li>Find the stand you want to list on Marketplace</li>
          <li>Tap the <strong>&quot;📥 Marketplace CSV&quot;</strong> button on the stand card</li>
          <li>A CSV file will download to your device with all your active products pre-formatted for Facebook</li>
        </ol>
        <p className={styles.tip}>💡 <strong>Tip:</strong> The spreadsheet includes your product names, descriptions, prices, availability, and direct purchase links back to CasaGrown. When buyers click the link in your Marketplace listing, they land directly on the product page to complete their purchase.</p>

        <h4>Step 2: Upload to Facebook Commerce Manager</h4>
        <ol>
          <li>Go to <a href="https://business.facebook.com/commerce" target="_blank" rel="noopener noreferrer">Meta Commerce Manager</a> in your browser</li>
          <li>Select your <strong>Catalog</strong> (or create one if you don&apos;t have one yet)</li>
          <li>Click <strong>&quot;Add Items&quot;</strong> → <strong>&quot;Data Feed&quot;</strong> → <strong>&quot;Upload Once&quot;</strong></li>
          <li>Upload the CSV file you downloaded from CasaGrown</li>
          <li>Facebook will validate the file — review any warnings and click <strong>&quot;Upload&quot;</strong></li>
          <li>Wait a few minutes for Facebook to process your listings</li>
        </ol>

        <h4>Step 3: Add Photos Manually</h4>
        <p>While the spreadsheet includes your primary product image URL, Facebook Marketplace listings look best with <strong>multiple high-quality photos</strong>. After uploading:</p>
        <ol>
          <li>Go to your catalog in Commerce Manager</li>
          <li>Click on each product listing</li>
          <li>Tap <strong>&quot;Edit&quot;</strong> → scroll to the <strong>Images</strong> section</li>
          <li>Upload additional photos — we recommend <strong>3–5 photos per item</strong> showing:
            <ul>
              <li>Close-up of the produce</li>
              <li>The full harvest/display</li>
              <li>Size reference (next to a hand or common object)</li>
              <li>Any packaging or delivery setup</li>
            </ul>
          </li>
          <li>Click <strong>&quot;Save&quot;</strong></li>
        </ol>
        <p className={styles.tip}>💡 <strong>Photo tips:</strong> Use natural lighting, clean backgrounds, and show your produce at its freshest. Listings with 3+ photos get significantly more views on Marketplace.</p>

        <h4>Step 4: Publish to Marketplace</h4>
        <ol>
          <li>In Commerce Manager, go to <strong>&quot;Shops&quot;</strong> → <strong>&quot;Facebook Marketplace&quot;</strong></li>
          <li>Enable Marketplace as a sales channel for your catalog</li>
          <li>Your products will appear on Facebook Marketplace with your location automatically</li>
          <li>Buyers can find you by searching for produce in their area</li>
        </ol>

        <h4>Keeping Listings Updated</h4>
        <ul>
          <li><strong>When you update products on CasaGrown</strong> (price, inventory, description), download a fresh CSV and re-upload to keep Marketplace in sync</li>
          <li><strong>When a product sells out</strong>, the listing will show as &quot;out of stock&quot; in the next CSV upload</li>
          <li>You can also manually edit individual listings directly in Commerce Manager</li>
        </ul>

        <h4>How Buyers Reach You</h4>
        <p>Each Marketplace listing includes a <strong>direct link back to CasaGrown</strong>. When a buyer clicks your listing, they&apos;re taken to your product page where they can:</p>
        <ul>
          <li>View all photos and details</li>
          <li>Select pickup or delivery</li>
          <li>Complete the purchase securely via Stripe</li>
          <li>Message you directly via GrowBot</li>
        </ul>
        <p>If a buyer messages you on Messenger from your Marketplace listing, GrowBot automatically recognizes which product they&apos;re asking about and responds with relevant details and a purchase link.</p>
      </>
    ),
  },
  // ─── INSTAGRAM INTEGRATION ─── ELITE
  {
    id: 'instagram',
    icon: '📸',
    title: 'Instagram Integration',
    tier: 'elite',
    content: (
      <>
        <p>Extend your reach to Instagram with automated posting and customer engagement.</p>
        <h4>Features</h4>
        <ul>
          <li><strong>Auto-Posting</strong> — your product listings are automatically shared as Instagram posts</li>
          <li><strong>Catalog Sync</strong> — keep your Instagram shop in sync with your CasaGrown inventory</li>
          <li><strong>DM Auto-Replies</strong> — GrowBot handles Instagram Direct Messages from potential buyers</li>
          <li><strong>Comment Auto-Replies</strong> — detect buying intent in post comments and engage automatically</li>
          <li><strong>Video Auto-Posts</strong> — automatically create and publish Reels and Stories from your product photos</li>
        </ul>
      </>
    ),
  },
  // ─── WHATSAPP INTEGRATION ─── ELITE
  {
    id: 'whatsapp',
    icon: '📱',
    title: 'WhatsApp Integration',
    tier: 'elite',
    content: (
      <>
        <p>Reach customers on WhatsApp with a dedicated business phone number provisioned for your account.</p>
        <h4>Features</h4>
        <ul>
          <li><strong>Dedicated Business Phone</strong> — a WhatsApp Business number is provisioned and managed for you</li>
          <li><strong>Catalog Sync</strong> — your CasaGrown products appear in your WhatsApp Business catalog</li>
          <li><strong>DM Auto-Replies</strong> — GrowBot responds to customer messages on WhatsApp</li>
        </ul>
        <p>WhatsApp conversations appear in your CasaGrown Messages inbox alongside DMs and other channels.</p>
      </>
    ),
  },
  // ─── GOOGLE MAPS ─── ELITE
  {
    id: 'google-maps',
    icon: '📍',
    title: 'Google Maps / Places',
    tier: 'elite',
    content: (
      <>
        <p>Increase your visibility by posting your produce listings to Google Maps and Google Places, making it easy for local customers to discover you through Google Search.</p>
      </>
    ),
  },
  // ─── MULTI-BOOTH MANAGEMENT ─── PRO
  {
    id: 'multi-stand',
    icon: '🏪',
    title: 'Multi-Stand Management',
    tier: 'pro',
    content: (
      <>
        <p>Scale your selling operation by running multiple stands from a single account.</p>
        <h4>How It Works</h4>
        <ul>
          <li><strong>Lite</strong> — 1 stand</li>
          <li><strong>Pro</strong> — up to 3 stands</li>
          <li><strong>Elite</strong> — unlimited stands</li>
        </ul>
        <p>Each stand has its own name, branding, products, and fulfillment settings. This is useful if you sell different categories (e.g., produce in one stand, baked goods in another) or serve different neighborhoods.</p>
        <h4>Stand Actions</h4>
        <ul>
          <li><strong>Archive</strong> — temporarily hide a stand from the market without deleting it</li>
          <li><strong>Reactivate</strong> — bring an archived stand back to the market</li>
        </ul>
        <p>Your &quot;My Produce Stands&quot; page shows how many stands you have active vs. your plan limit.</p>
      </>
    ),
  },
  // ─── FEEDBACK & SUPPORT ───
  {
    id: 'support',
    icon: '🐛',
    title: 'Feedback & Support',
    tier: null,
    content: (
      <>
        <p>We&apos;re here to help and your feedback directly shapes what we build next.</p>
        <h4>Reporting Bugs &amp; Requesting Features</h4>
        <ul>
          <li>Tap the <strong>🐛 bug icon</strong> in the top navigation bar</li>
          <li>Choose a type: <strong>Bug</strong>, <strong>Feature Request</strong>, or <strong>Support</strong></li>
          <li>A screenshot of the current page is <strong>automatically captured</strong> and attached</li>
          <li>Describe the issue and tap <strong>&quot;Submit Report&quot;</strong></li>
        </ul>
        <h4>Other Ways to Get Help</h4>
        <ul>
          <li><strong>Contact Support</strong> — available from the ☰ menu under &quot;Support &amp; Legal&quot;</li>
          <li><strong>Email</strong> — reach us at <a href="mailto:support@casagrown.com">support@casagrown.com</a></li>
        </ul>
        <p>Every report is read by our team. 💚</p>
      </>
    ),
  },
]

function GuideContent() {
  const { neverCloses } = useMarketStatus()
  const searchParams = useSearchParams()
  const planParam = searchParams?.get('plan') || null

  const getInitialSections = (): Set<string> => {
    if (planParam === 'elite') return new Set(['getting-started', 'growbot', 'growbot-auto', 'instagram', 'whatsapp', 'multi-stand', 'marketplace-csv'])
    if (planParam === 'pro') return new Set(['getting-started', 'growbot', 'growbot-auto', 'facebook', 'multi-stand', 'marketplace-csv'])
    return new Set(['getting-started', 'browsing'])
  }

  const [openSections, setOpenSections] = useState<Set<string>>(getInitialSections)
  const [hasTutorials, setHasTutorials] = useState(false)

  useEffect(() => {
    const checkTutorials = async () => {
      try {
        const supabase = createClient()
        const { data, error } = await supabase
          .from('tutorial_sections')
          .select('id')
          .eq('is_published', true)
          .limit(1)
        if (!error && data && data.length > 0) {
          setHasTutorials(true)
        }
      } catch (err) {
        console.error('Error checking tutorials in guide:', err)
      }
    }
    checkTutorials()
  }, [])

  useEffect(() => {
    setOpenSections(getInitialSections())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planParam])

  const toggle = (id: string) => {
    setOpenSections(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const visibleSections = SECTIONS.filter(s => {
    if (s.id === 'schedule' && neverCloses) return false
    // Hide Elite-only sections when Elite is not enabled
    // (pro_testers access is handled by the plan param check below)
    if (s.tier === 'elite' && !ENABLE_ELITE && planParam !== 'elite') return false
    return true
  })

  const renderBadge = (tier: 'pro' | 'elite') => (
    <span className={tier === 'pro' ? styles.badgePro : styles.badgeElite}>
      {tier.toUpperCase()}
    </span>
  )

  // Dynamic CTA based on plan
  let primaryCtaText = ENABLE_ELITE ? 'Explore Pro & Elite Plans' : 'Explore Pro Plans'
  let primaryCtaHref = '/pro'
  if (planParam === 'pro') {
    primaryCtaText = 'Upgrade to Elite'
    primaryCtaHref = '/pro'
  } else if (planParam === 'elite') {
    primaryCtaText = 'Configure Your Suite'
    primaryCtaHref = '/pro-manage'
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>
          <span className={styles.titleIcon}>📖</span>
          User Guide
        </h1>
        <p className={styles.subtitle}>
          Everything you need to know about CasaGrown Market
        </p>
      </div>

      {/* Video Tutorials Callout */}
      {hasTutorials && (
        <div className={styles.videoCallout}>
          <span>🎥</span>
          <span>
            Prefer watching over reading? Check out our{' '}
            <Link href="/tutorials" className={styles.videoCalloutLink}>
              Video Tutorials
            </Link>
            !
          </span>
        </div>
      )}

      {/* Table of Contents */}
      <nav className={styles.toc}>
        {visibleSections.map(s => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className={`${styles.tocItem} ${openSections.has(s.id) ? styles.tocItemActive : ''}`}
            onClick={e => { e.preventDefault(); toggle(s.id) }}
          >
            <span>{s.icon}</span>
            <span>{s.title}</span>
            {s.tier && renderBadge(s.tier)}
          </a>
        ))}
      </nav>

      {/* Accordion Sections */}
      <div className={styles.sections}>
        {visibleSections.map(section => (
          <div key={section.id} id={section.id} className={styles.section}>
            <button
              className={`${styles.sectionHeader} ${openSections.has(section.id) ? styles.sectionHeaderOpen : ''}`}
              onClick={() => toggle(section.id)}
            >
              <div className={styles.sectionTitle}>
                <span className={styles.sectionIcon}>{section.icon}</span>
                <span>{section.title}</span>
                {section.tier && renderBadge(section.tier)}
              </div>
              <span className={`${styles.chevron} ${openSections.has(section.id) ? styles.chevronOpen : ''}`}>
                ▼
              </span>
            </button>
            {openSections.has(section.id) && (
              <div className={styles.sectionContent}>
                {section.content}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Tier note */}
      <p className={styles.tierNote}>
        Features marked with <span className={styles.badgePro}>PRO</span>{ENABLE_ELITE && <>{' '}or{' '}
        <span className={styles.badgeElite}>ELITE</span></>} require a paid subscription.
      </p>

      {/* Bottom CTA */}
      <div className={styles.bottomCta}>
        <p>Ready to get started?</p>
        <div className={styles.ctaGroup}>
          <Link href={primaryCtaHref} className={styles.ctaButton}>
            {primaryCtaText} →
          </Link>
          <Link href="/market" className={styles.ctaButtonSecondary}>
            Browse the Market 🧺
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function GuidePage() {
  return (
    <Suspense fallback={
      <div className={styles.page}>
        <div className={styles.header}>
          <h1 className={styles.title}>
            <span className={styles.titleIcon}>📖</span>
            User Guide
          </h1>
          <p className={styles.subtitle}>Loading…</p>
        </div>
      </div>
    }>
      <GuideContent />
    </Suspense>
  )
}
