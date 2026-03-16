'use client'

import React, { createContext, useContext, useReducer, useEffect, type ReactNode } from 'react'

// ============================================================================
// Types
// ============================================================================

export interface User {
  id: string
  name: string
  email: string
  phone: string
  address: { street: string; city: string; state: string; zip: string }
  avatarUrl?: string
}

export interface MarketSchedule {
  dayOfWeek: number // 0=Sun, 6=Sat
  dayName: string
  openTime: string // "08:00"
  closeTime: string // "11:00"
}

export interface Booth {
  id: string
  ownerId: string
  ownerName: string
  name: string
  description: string
  decorativeTheme: 'rustic' | 'tropical' | 'minimal' | 'floral' | 'harvest' | 'cottage'
  aboutHtml: string
  inviteCode: string
  productCount: number
  rating: number
  totalSales: number
  createdAt: string
  // New fields
  headerImageUrl?: string
  isOpen?: boolean // seller manually opens/closes
  tagline?: string
  // Fulfillment defaults (overridable per product)
  offersDelivery?: boolean
  offersPickup?: boolean
  deliveryRadiusMiles?: number
  deliveryZipCodes?: string[]
  deliveryWindows?: { id: string; start: string; end: string }[]
  pickupWindows?: { id: string; start: string; end: string }[]
  pickupAddress?: string
  // Payment
  paymentMethod?: 'venmo' | 'charity' | 'automatic' | 'manual'
  venmoHandle?: string
  charityId?: string
  charityName?: string
  helperPasscode?: string
  // Helpers
  helpers?: { helperId?: string; email?: string; name?: string; status: 'pending' | 'accepted' | 'revoked' }[]
  // Product catalog (what they typically sell — names only)
  catalogItems?: string[]
}

export interface Product {
  id: string
  boothId: string
  boothName: string
  name: string
  description: string
  photos: string[]
  priceUsd: number
  unit: string
  category: string
  inventory: number
  offersDelivery?: boolean
  deliveryRadiusMiles?: number
  offersPickup?: boolean
  pickupAddress?: string
  deliveryWindows?: string[]
  pickupWindows?: string[]
  isActive: boolean
  status?: 'active' | 'draft' | 'expired' | 'inactive'
  harvestedAt?: string  // ISO datetime — when produce was harvested
  marketDate?: string // ISO date — products are scoped to a specific market session
}

export type OrderStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'delivering'
  | 'delivered'
  | 'confirmed'
  | 'disputed'
  | 'resolved'
  | 'cancelled'

export interface OrderItem {
  productId: string
  productName: string
  qty: number
  unitPrice: number
  couponDiscount: number
}

export interface Order {
  id: string
  buyerId: string
  buyerName: string
  sellerId: string
  sellerName: string
  boothId: string
  boothName: string
  items: OrderItem[]
  subtotal: number
  tax: number
  platformFee: number
  total: number
  status: OrderStatus
  deliveryType: 'delivery' | 'pickup'
  passcode: string
  proofPhotos: string[]
  disputeReason?: string
  disputePhotos?: string[]
  discountOffer?: number
  createdAt: string
  updatedAt: string
}

export interface Message {
  id: string
  senderId: string
  senderName: string
  text: string
  imageUrl?: string
  type: 'text' | 'system' | 'action'
  timestamp: string
}

export interface Conversation {
  id: string
  orderId: string
  buyerId: string
  buyerName: string
  sellerId: string
  sellerName: string
  boothName: string
  lastMessage: string
  lastMessageAt: string
  unread: number
  messages: Message[]
}

export interface Coupon {
  id: string
  boothId: string
  code: string
  discountType: 'percent' | 'fixed'
  discountValue: number
  expiresAt: string
  usesRemaining: number
  totalUses: number
}

export interface Earnings {
  available: number
  pending: number
  totalSales: number
  salesCount: number
  redeemed: number
}

export interface Invitation {
  id: string
  boothId: string
  boothName: string
  code: string
  url: string
}

export interface Notification {
  id: string
  title: string
  body: string
  type: 'order' | 'message' | 'market' | 'system'
  read: boolean
  createdAt: string
  link?: string
}

// ============================================================================
// State
// ============================================================================

export interface MarketState {
  user: User | null
  isAuthenticated: boolean
  hasAcceptedTerms: boolean
  booths: Booth[]
  products: Product[]
  orders: Order[]
  conversations: Conversation[]
  coupons: Coupon[]
  invitations: Invitation[]
  notifications: Notification[]
  earnings: Earnings
  marketSchedule: MarketSchedule[]
  productsNeverExpire: boolean
  toasts: { id: string; message: string; type: 'success' | 'error' | 'info' }[]
}

// ============================================================================
// Mock Photo URLs — Generated emoji placeholders
// ============================================================================

const PHOTO = (emoji: string, bg: string) =>
  `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="${bg}"/><text x="200" y="220" font-size="120" text-anchor="middle">${emoji}</text></svg>`)}`

// ============================================================================
// Initial Mock Data
// ============================================================================

const MOCK_USER: User = {
  id: 'user-1',
  name: 'Alex Rivera',
  email: 'alex@example.com',
  phone: '(555) 123-4567',
  address: { street: '742 Evergreen Terrace', city: 'San Jose', state: 'CA', zip: '95112' },
}

const MOCK_BOOTHS: Booth[] = [
  {
    id: 'booth-1', ownerId: 'user-2', ownerName: 'Maria Garcia',
    name: "Maria's Garden Fresh", description: 'Organic fruits and vegetables straight from my backyard garden.',
    decorativeTheme: 'floral', aboutHtml: '<p>I\'ve been growing organic produce in my backyard for over 15 years. My garden features heritage tomatoes, citrus trees, and seasonal vegetables. Everything is grown without pesticides using compost from my own bins.</p><p>🌱 Certified organic by my neighbors\' taste buds!</p>',
    inviteCode: 'MARIA2026', productCount: 5, rating: 4.8, totalSales: 142, createdAt: '2026-01-15',
  },
  {
    id: 'booth-2', ownerId: 'user-3', ownerName: 'James Chen',
    name: "Chen's Citrus Corner", description: 'Premium citrus from 30-year-old trees. Oranges, lemons, limes, and more.',
    decorativeTheme: 'tropical', aboutHtml: '<p>Our family has maintained these citrus trees for three decades. We have Meyer lemons, Valencia oranges, Persian limes, and ruby red grapefruit.</p>',
    inviteCode: 'CITRUS2026', productCount: 4, rating: 4.9, totalSales: 89, createdAt: '2026-02-01',
  },
  {
    id: 'booth-3', ownerId: 'user-4', ownerName: 'Sarah Johnson',
    name: "Sunny Side Bakes", description: 'Fresh baked goods using garden-fresh ingredients. Pies, jams, and breads.',
    decorativeTheme: 'cottage', aboutHtml: '<p>I bake everything fresh on market day mornings using ingredients from local gardens including my own. Sourdough started from a 5-year-old starter!</p>',
    inviteCode: 'SUNNY2026', productCount: 4, rating: 4.7, totalSales: 67, createdAt: '2026-02-10',
  },
]

const MOCK_PRODUCTS: Product[] = [
  // Maria's Garden Fresh
  {
    id: 'prod-1', boothId: 'booth-1', boothName: "Maria's Garden Fresh",
    name: 'Heritage Tomatoes', description: 'Mixed variety heritage tomatoes — Brandywine, Cherokee Purple, and Green Zebra. Vine-ripened for maximum flavor.',
    photos: ['/products/heritage-tomatoes.png'],
    priceUsd: 4.50, unit: 'basket', category: 'produce', inventory: 20,
    offersDelivery: true, deliveryRadiusMiles: 5, offersPickup: true,
    pickupAddress: '123 Garden Way, San Jose, CA',
    deliveryWindows: ['9:00 AM - 11:00 AM', '2:00 PM - 4:00 PM'],
    pickupWindows: ['8:00 AM - 11:00 AM'], isActive: true,
  },
  {
    id: 'prod-2', boothId: 'booth-1', boothName: "Maria's Garden Fresh",
    name: 'Fresh Basil Bunch', description: 'Aromatic Genovese basil, freshly cut. Perfect for pesto, caprese, or garnishing.',
    photos: ['/products/fresh-basil.png'],
    priceUsd: 3.00, unit: 'bunch', category: 'produce', inventory: 15,
    offersDelivery: true, deliveryRadiusMiles: 5, offersPickup: true,
    pickupAddress: '123 Garden Way, San Jose, CA',
    deliveryWindows: ['9:00 AM - 11:00 AM'], pickupWindows: ['8:00 AM - 11:00 AM'],
    isActive: true,
  },
  {
    id: 'prod-3', boothId: 'booth-1', boothName: "Maria's Garden Fresh",
    name: 'Organic Zucchini', description: 'Tender young zucchini, perfect size for grilling or spiralizing. No pesticides used.',
    photos: ['/products/organic-zucchini.png'],
    priceUsd: 2.50, unit: 'each', category: 'produce', inventory: 30,
    offersDelivery: true, deliveryRadiusMiles: 5, offersPickup: true,
    pickupAddress: '123 Garden Way, San Jose, CA',
    deliveryWindows: ['9:00 AM - 11:00 AM'], pickupWindows: ['8:00 AM - 11:00 AM'],
    isActive: true,
  },
  {
    id: 'prod-4', boothId: 'booth-1', boothName: "Maria's Garden Fresh",
    name: 'Bell Pepper Mix', description: 'Colorful mix of red, yellow, and green bell peppers. Crunchy and sweet.',
    photos: ['/products/bell-peppers.png'],
    priceUsd: 5.00, unit: '3-pack', category: 'produce', inventory: 12,
    offersDelivery: false, deliveryRadiusMiles: 0, offersPickup: true,
    pickupAddress: '123 Garden Way, San Jose, CA',
    deliveryWindows: [], pickupWindows: ['8:00 AM - 11:00 AM'],
    isActive: true,
  },
  {
    id: 'prod-5', boothId: 'booth-1', boothName: "Maria's Garden Fresh",
    name: 'Fresh Eggs', description: 'Free-range eggs from our backyard hens. Fed organic feed and garden scraps.',
    photos: ['/products/fresh-eggs.png'],
    priceUsd: 6.00, unit: 'dozen', category: 'eggs-dairy', inventory: 8,
    offersDelivery: true, deliveryRadiusMiles: 3, offersPickup: true,
    pickupAddress: '123 Garden Way, San Jose, CA',
    deliveryWindows: ['9:00 AM - 10:00 AM'], pickupWindows: ['8:00 AM - 11:00 AM'],
    isActive: true,
  },
  // Chen's Citrus Corner
  {
    id: 'prod-6', boothId: 'booth-2', boothName: "Chen's Citrus Corner",
    name: 'Meyer Lemons', description: 'Sweet, fragrant Meyer lemons from our 30-year-old tree. Perfect for baking and lemonade.',
    photos: ['/products/meyer-lemons.png'],
    priceUsd: 3.50, unit: 'bag (6)', category: 'produce', inventory: 40,
    offersDelivery: true, deliveryRadiusMiles: 8, offersPickup: true,
    pickupAddress: '456 Citrus Lane, San Jose, CA',
    deliveryWindows: ['8:30 AM - 10:30 AM'], pickupWindows: ['8:00 AM - 11:00 AM'],
    isActive: true,
  },
  {
    id: 'prod-7', boothId: 'booth-2', boothName: "Chen's Citrus Corner",
    name: 'Valencia Oranges', description: 'Juicy Valencia oranges — the best juicing orange. Naturally sweet with no seeds.',
    photos: ['/products/valencia-oranges.png'],
    priceUsd: 4.00, unit: 'bag (6)', category: 'produce', inventory: 50,
    offersDelivery: true, deliveryRadiusMiles: 8, offersPickup: true,
    pickupAddress: '456 Citrus Lane, San Jose, CA',
    deliveryWindows: ['8:30 AM - 10:30 AM'], pickupWindows: ['8:00 AM - 11:00 AM'],
    isActive: true,
  },
  {
    id: 'prod-8', boothId: 'booth-2', boothName: "Chen's Citrus Corner",
    name: 'Persian Limes', description: 'Tart and aromatic Persian limes. Essential for drinks, cooking, and garnishing.',
    photos: ['/products/persian-limes.png'],
    priceUsd: 3.00, unit: 'bag (8)', category: 'produce', inventory: 25,
    offersDelivery: true, deliveryRadiusMiles: 8, offersPickup: true,
    pickupAddress: '456 Citrus Lane, San Jose, CA',
    deliveryWindows: ['8:30 AM - 10:30 AM'], pickupWindows: ['8:00 AM - 11:00 AM'],
    isActive: true,
  },
  {
    id: 'prod-9', boothId: 'booth-2', boothName: "Chen's Citrus Corner",
    name: 'Ruby Red Grapefruit', description: 'Large, sweet Ruby Red grapefruit. Low acidity and beautiful pink flesh.',
    photos: ['/products/ruby-grapefruit.png'],
    priceUsd: 5.00, unit: 'each', category: 'produce', inventory: 18,
    offersDelivery: false, deliveryRadiusMiles: 0, offersPickup: true,
    pickupAddress: '456 Citrus Lane, San Jose, CA',
    deliveryWindows: [], pickupWindows: ['8:00 AM - 11:00 AM'],
    isActive: true,
  },
  // Sunny Side Bakes
  {
    id: 'prod-10', boothId: 'booth-3', boothName: "Sunny Side Bakes",
    name: 'Sourdough Loaf', description: 'Artisan sourdough made with a 5-year-old starter. Crusty outside, soft inside.',
    photos: ['/products/sourdough-loaf.png'],
    priceUsd: 8.00, unit: 'loaf', category: 'baked-goods', inventory: 10,
    offersDelivery: true, deliveryRadiusMiles: 4, offersPickup: true,
    pickupAddress: '789 Baker St, San Jose, CA',
    deliveryWindows: ['9:00 AM - 11:00 AM'], pickupWindows: ['8:00 AM - 10:00 AM'],
    isActive: true,
  },
  {
    id: 'prod-11', boothId: 'booth-3', boothName: "Sunny Side Bakes",
    name: 'Strawberry Jam', description: 'Homemade strawberry jam using garden strawberries. No artificial preservatives.',
    photos: ['/products/strawberry-jam.png'],
    priceUsd: 7.00, unit: 'jar', category: 'preserves', inventory: 15,
    offersDelivery: true, deliveryRadiusMiles: 4, offersPickup: true,
    pickupAddress: '789 Baker St, San Jose, CA',
    deliveryWindows: ['9:00 AM - 11:00 AM'], pickupWindows: ['8:00 AM - 10:00 AM'],
    isActive: true,
  },
  {
    id: 'prod-12', boothId: 'booth-3', boothName: "Sunny Side Bakes",
    name: 'Apple Pie', description: 'Classic apple pie with a flaky butter crust. Made with Granny Smith apples from next door.',
    photos: ['/products/apple-pie.png'],
    priceUsd: 15.00, unit: 'whole', category: 'baked-goods', inventory: 5,
    offersDelivery: false, deliveryRadiusMiles: 0, offersPickup: true,
    pickupAddress: '789 Baker St, San Jose, CA',
    deliveryWindows: [], pickupWindows: ['8:00 AM - 10:00 AM'],
    isActive: true,
  },
  {
    id: 'prod-13', boothId: 'booth-3', boothName: "Sunny Side Bakes",
    name: 'Herb Focaccia', description: 'Rosemary and olive oil focaccia. Light, fluffy, and golden. Perfect with any meal.',
    photos: ['/products/herb-focaccia.png'],
    priceUsd: 6.50, unit: 'half-sheet', category: 'baked-goods', inventory: 8,
    offersDelivery: true, deliveryRadiusMiles: 4, offersPickup: true,
    pickupAddress: '789 Baker St, San Jose, CA',
    deliveryWindows: ['9:00 AM - 11:00 AM'], pickupWindows: ['8:00 AM - 10:00 AM'],
    isActive: true,
  },
]

const MOCK_ORDERS: Order[] = [
  {
    id: 'order-1', buyerId: 'user-1', buyerName: 'Alex Rivera',
    sellerId: 'user-2', sellerName: 'Maria Garcia',
    boothId: 'booth-1', boothName: "Maria's Garden Fresh",
    items: [
      { productId: 'prod-1', productName: 'Heritage Tomatoes', qty: 2, unitPrice: 4.50, couponDiscount: 0 },
      { productId: 'prod-2', productName: 'Fresh Basil Bunch', qty: 1, unitPrice: 3.00, couponDiscount: 0 },
    ],
    subtotal: 12.00, tax: 1.11, platformFee: 0.60, total: 13.71,
    status: 'accepted', deliveryType: 'delivery', passcode: '847293',
    proofPhotos: [], createdAt: '2026-03-12T08:15:00Z', updatedAt: '2026-03-12T08:20:00Z',
  },
  {
    id: 'order-2', buyerId: 'user-1', buyerName: 'Alex Rivera',
    sellerId: 'user-3', sellerName: 'James Chen',
    boothId: 'booth-2', boothName: "Chen's Citrus Corner",
    items: [
      { productId: 'prod-6', productName: 'Meyer Lemons', qty: 3, unitPrice: 3.50, couponDiscount: 0 },
    ],
    subtotal: 10.50, tax: 0.97, platformFee: 0.53, total: 12.00,
    status: 'confirmed', deliveryType: 'pickup', passcode: '159374',
    proofPhotos: [], createdAt: '2026-03-11T09:00:00Z', updatedAt: '2026-03-11T09:45:00Z',
  },
]

const MOCK_CONVERSATIONS: Conversation[] = [
  {
    id: 'conv-1', orderId: 'order-1', buyerId: 'user-1', buyerName: 'Alex Rivera',
    sellerId: 'user-2', sellerName: 'Maria Garcia', boothName: "Maria's Garden Fresh",
    lastMessage: 'Your order has been accepted! I\'ll start preparing it.',
    lastMessageAt: '2026-03-12T08:20:00Z', unread: 1,
    messages: [
      { id: 'msg-1', senderId: 'system', senderName: 'System', text: 'Order #order-1 placed for Heritage Tomatoes (2 lb), Fresh Basil Bunch (1).', type: 'system', timestamp: '2026-03-12T08:15:00Z' },
      { id: 'msg-2', senderId: 'user-1', senderName: 'Alex Rivera', text: 'Hi Maria! Are the tomatoes ripe and ready? I\'m making bruschetta tonight.', type: 'text', timestamp: '2026-03-12T08:16:00Z' },
      { id: 'msg-3', senderId: 'user-2', senderName: 'Maria Garcia', text: 'Yes! Just picked them this morning. They\'re perfect for bruschetta! 🍅', type: 'text', timestamp: '2026-03-12T08:18:00Z' },
      { id: 'msg-4', senderId: 'system', senderName: 'System', text: 'Maria Garcia accepted the order.', type: 'system', timestamp: '2026-03-12T08:20:00Z' },
      { id: 'msg-5', senderId: 'user-2', senderName: 'Maria Garcia', text: 'Your order has been accepted! I\'ll start preparing it.', type: 'text', timestamp: '2026-03-12T08:20:30Z' },
    ],
  },
  {
    id: 'conv-2', orderId: 'order-2', buyerId: 'user-1', buyerName: 'Alex Rivera',
    sellerId: 'user-3', sellerName: 'James Chen', boothName: "Chen's Citrus Corner",
    lastMessage: 'Thanks for the amazing lemons! 🍋',
    lastMessageAt: '2026-03-11T09:45:00Z', unread: 0,
    messages: [
      { id: 'msg-6', senderId: 'system', senderName: 'System', text: 'Order #order-2 placed for Meyer Lemons (3 lb).', type: 'system', timestamp: '2026-03-11T09:00:00Z' },
      { id: 'msg-7', senderId: 'user-3', senderName: 'James Chen', text: 'Great choice! Come by anytime between 8 and 11.', type: 'text', timestamp: '2026-03-11T09:05:00Z' },
      { id: 'msg-8', senderId: 'system', senderName: 'System', text: 'Delivery confirmed. Order complete.', type: 'system', timestamp: '2026-03-11T09:40:00Z' },
      { id: 'msg-9', senderId: 'user-1', senderName: 'Alex Rivera', text: 'Thanks for the amazing lemons! 🍋', type: 'text', timestamp: '2026-03-11T09:45:00Z' },
    ],
  },
]

const MOCK_COUPONS: Coupon[] = [
  { id: 'coupon-1', boothId: 'booth-1', code: 'FRESH10', discountType: 'percent', discountValue: 10, expiresAt: '2026-04-01', usesRemaining: 50, totalUses: 100 },
  { id: 'coupon-2', boothId: 'booth-2', code: 'CITRUS5', discountType: 'fixed', discountValue: 5, expiresAt: '2026-03-31', usesRemaining: 20, totalUses: 20 },
]

const MOCK_NOTIFICATIONS: Notification[] = [
  { id: 'notif-1', title: 'Order Accepted', body: 'Maria Garcia accepted your order for Heritage Tomatoes.', type: 'order', read: false, createdAt: '2026-03-12T08:20:00Z', link: '/orders/order-1' },
  { id: 'notif-2', title: 'Market Opens Tomorrow', body: 'Saturday market opens at 8:00 AM. Browse fresh listings now!', type: 'market', read: true, createdAt: '2026-03-11T18:00:00Z', link: '/market' },
  { id: 'notif-3', title: 'New Message', body: 'James Chen sent you a message about your lemon order.', type: 'message', read: true, createdAt: '2026-03-11T09:05:00Z', link: '/chat/conv-2' },
]

const MARKET_SCHEDULE: MarketSchedule[] = [
  // During development: open every day 6 AM – 11 PM
  // In production, this would be loaded from a DB config (e.g., market_settings table)
  { dayOfWeek: 0, dayName: 'Sunday', openTime: '06:00', closeTime: '23:00' },
  { dayOfWeek: 1, dayName: 'Monday', openTime: '06:00', closeTime: '23:00' },
  { dayOfWeek: 2, dayName: 'Tuesday', openTime: '06:00', closeTime: '23:00' },
  { dayOfWeek: 3, dayName: 'Wednesday', openTime: '06:00', closeTime: '23:00' },
  { dayOfWeek: 4, dayName: 'Thursday', openTime: '06:00', closeTime: '23:00' },
  { dayOfWeek: 5, dayName: 'Friday', openTime: '06:00', closeTime: '23:00' },
  { dayOfWeek: 6, dayName: 'Saturday', openTime: '06:00', closeTime: '23:00' },
]

const initialState: MarketState = {
  user: null,
  isAuthenticated: false,
  hasAcceptedTerms: false,
  booths: MOCK_BOOTHS,
  products: MOCK_PRODUCTS,
  orders: MOCK_ORDERS,
  conversations: MOCK_CONVERSATIONS,
  coupons: MOCK_COUPONS,
  invitations: [],
  notifications: MOCK_NOTIFICATIONS,
  earnings: { available: 245.80, pending: 13.71, totalSales: 892.50, salesCount: 67, redeemed: 632.99 },
  marketSchedule: MARKET_SCHEDULE,
  productsNeverExpire: false,
  toasts: [],
}

// ============================================================================
// Actions
// ============================================================================

type Action =
  | { type: 'LOGIN'; payload: { email: string } }
  | { type: 'LOGOUT' }
  | { type: 'UPDATE_PROFILE'; payload: Partial<User> }
  | { type: 'CREATE_BOOTH'; payload: Omit<Booth, 'id' | 'productCount' | 'rating' | 'totalSales' | 'createdAt'> & { id?: string } }
  | { type: 'UPDATE_BOOTH'; payload: { id: string } & Partial<Booth> }
  | { type: 'ADD_PRODUCT'; payload: Omit<Product, 'id' | 'isActive'> }
  | { type: 'UPDATE_PRODUCT'; payload: { id: string } & Partial<Product> }
  | { type: 'DELETE_PRODUCT'; payload: string }
  | { type: 'PLACE_ORDER'; payload: Omit<Order, 'id' | 'status' | 'proofPhotos' | 'createdAt' | 'updatedAt'> }
  | { type: 'UPDATE_ORDER_STATUS'; payload: { orderId: string; status: OrderStatus; proofPhotos?: string[]; disputeReason?: string; disputePhotos?: string[]; discountOffer?: number } }
  | { type: 'SEND_MESSAGE'; payload: { conversationId: string; message: Omit<Message, 'id' | 'timestamp'> } }
  | { type: 'CREATE_CONVERSATION'; payload: Omit<Conversation, 'id' | 'messages' | 'lastMessage' | 'lastMessageAt' | 'unread'> }
  | { type: 'CREATE_COUPON'; payload: Omit<Coupon, 'id'> }
  | { type: 'DELETE_COUPON'; payload: string }
  | { type: 'ADD_TOAST'; payload: { message: string; type: 'success' | 'error' | 'info' } }
  | { type: 'REMOVE_TOAST'; payload: string }
  | { type: 'MARK_NOTIFICATION_READ'; payload: string }
  | { type: 'ACCEPT_TERMS' }
  | { type: 'LOAD_MARKET_CONFIG'; payload: { schedule: MarketSchedule[]; productsNeverExpire: boolean } }

let idCounter = 100

function reducer(state: MarketState, action: Action): MarketState {
  switch (action.type) {
    case 'LOGIN': {
      const user = { ...MOCK_USER, email: action.payload.email }
      return { ...state, user, isAuthenticated: true }
    }
    case 'LOGOUT':
      return { ...state, user: null, isAuthenticated: false, hasAcceptedTerms: false }

    case 'ACCEPT_TERMS':
      return { ...state, hasAcceptedTerms: true }

    case 'UPDATE_PROFILE':
      return { ...state, user: state.user ? { ...state.user, ...action.payload } : null }

    case 'CREATE_BOOTH': {
      const booth: Booth = {
        ...action.payload, id: `booth-${++idCounter}`,
        productCount: 0, rating: 5.0, totalSales: 0, createdAt: new Date().toISOString(),
      }
      // Auto-authenticate: if they created a booth, they're a valid user
      const user: User = state.user || { id: 'user-1', name: action.payload.ownerName, email: '', phone: '', address: { street: '', city: '', state: '', zip: '' } }
      return { ...state, booths: [...state.booths, booth], user, isAuthenticated: true }
    }
    case 'UPDATE_BOOTH':
      return { ...state, booths: state.booths.map(b => b.id === action.payload.id ? { ...b, ...action.payload } : b) }

    case 'ADD_PRODUCT': {
      const product: Product = { ...action.payload, id: `prod-${++idCounter}`, isActive: true }
      return {
        ...state, products: [...state.products, product],
        booths: state.booths.map(b => b.id === product.boothId ? { ...b, productCount: b.productCount + 1 } : b),
      }
    }
    case 'UPDATE_PRODUCT':
      return { ...state, products: state.products.map(p => p.id === action.payload.id ? { ...p, ...action.payload } : p) }
    case 'DELETE_PRODUCT': {
      const prod = state.products.find(p => p.id === action.payload)
      return {
        ...state, products: state.products.filter(p => p.id !== action.payload),
        booths: state.booths.map(b => b.id === prod?.boothId ? { ...b, productCount: Math.max(0, b.productCount - 1) } : b),
      }
    }

    case 'PLACE_ORDER': {
      const order: Order = {
        ...action.payload, id: `order-${++idCounter}`,
        status: 'pending', proofPhotos: [],
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      }
      // Reduce inventory
      const updatedProducts = state.products.map(p => {
        const item = order.items.find(i => i.productId === p.id)
        return item ? { ...p, inventory: Math.max(0, p.inventory - item.qty) } : p
      })
      return { ...state, orders: [...state.orders, order], products: updatedProducts }
    }
    case 'UPDATE_ORDER_STATUS': {
      const { orderId, status, proofPhotos, disputeReason, disputePhotos, discountOffer } = action.payload
      return {
        ...state,
        orders: state.orders.map(o => o.id === orderId
          ? { ...o, status, updatedAt: new Date().toISOString(),
              ...(proofPhotos && { proofPhotos }),
              ...(disputeReason && { disputeReason }),
              ...(disputePhotos && { disputePhotos }),
              ...(discountOffer !== undefined && { discountOffer }),
            }
          : o
        ),
      }
    }

    case 'SEND_MESSAGE': {
      const msg: Message = { ...action.payload.message, id: `msg-${++idCounter}`, timestamp: new Date().toISOString() }
      return {
        ...state,
        conversations: state.conversations.map(c => c.id === action.payload.conversationId
          ? { ...c, messages: [...c.messages, msg], lastMessage: msg.text, lastMessageAt: msg.timestamp }
          : c
        ),
      }
    }
    case 'CREATE_CONVERSATION': {
      const conv: Conversation = {
        ...action.payload, id: `conv-${++idCounter}`,
        messages: [], lastMessage: '', lastMessageAt: new Date().toISOString(), unread: 0,
      }
      return { ...state, conversations: [...state.conversations, conv] }
    }

    case 'CREATE_COUPON': {
      const coupon: Coupon = { ...action.payload, id: `coupon-${++idCounter}` }
      return { ...state, coupons: [...state.coupons, coupon] }
    }
    case 'DELETE_COUPON':
      return { ...state, coupons: state.coupons.filter(c => c.id !== action.payload) }

    case 'ADD_TOAST': {
      const toast = { ...action.payload, id: `toast-${++idCounter}` }
      return { ...state, toasts: [...state.toasts, toast] }
    }
    case 'REMOVE_TOAST':
      return { ...state, toasts: state.toasts.filter(t => t.id !== action.payload) }

    case 'MARK_NOTIFICATION_READ':
      return { ...state, notifications: state.notifications.map(n => n.id === action.payload ? { ...n, read: true } : n) }

    case 'LOAD_MARKET_CONFIG':
      return {
        ...state,
        marketSchedule: action.payload.schedule.length > 0 ? action.payload.schedule : state.marketSchedule,
        productsNeverExpire: action.payload.productsNeverExpire,
      }

    default:
      return state
  }
}

// ============================================================================
// Context
// ============================================================================

const MarketContext = createContext<{
  state: MarketState
  dispatch: React.Dispatch<Action>
} | null>(null)

export function MarketProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState)

  // Load market config from DB on mount
  useEffect(() => {
    import('../lib/supabase').then(({ createClient }) => {
      const supabase = createClient()
      supabase.rpc('get_market_config').then(({ data }) => {
        if (data) {
          const schedule: MarketSchedule[] = (data.schedule || []).map((s: any) => ({
            dayOfWeek: s.dayOfWeek,
            dayName: s.dayName,
            openTime: s.openTime,
            closeTime: s.closeTime,
          }))
          dispatch({
            type: 'LOAD_MARKET_CONFIG',
            payload: { schedule, productsNeverExpire: data.productsNeverExpire || false }
          })
        }
      })
    })
  }, [])

  return (
    <MarketContext.Provider value={{ state, dispatch }}>
      {children}
      {/* Global Toast Container */}
      {state.toasts.length > 0 && (
        <div className="toast-container">
          {state.toasts.map(t => (
            <div key={t.id} className={`toast toast-${t.type}`} onClick={() => dispatch({ type: 'REMOVE_TOAST', payload: t.id })}>
              {t.type === 'success' && '✓'} {t.type === 'error' && '✕'} {t.type === 'info' && 'ℹ'} {t.message}
            </div>
          ))}
        </div>
      )}
    </MarketContext.Provider>
  )
}

export function useMarket() {
  const ctx = useContext(MarketContext)
  if (!ctx) throw new Error('useMarket must be used within MarketProvider')
  return ctx
}

// ============================================================================
// Helpers
// ============================================================================

export function isMarketOpen(schedule: MarketSchedule[]): boolean {
  // TODO: re-enable with timezone support for production
  return true
  /*
  const now = new Date()
  const day = now.getDay()
  const time = now.getHours() * 100 + now.getMinutes()
  return schedule.some(s => {
    if (s.dayOfWeek !== day) return false
    const [oh, om] = s.openTime.split(':').map(Number)
    const [ch, cm] = s.closeTime.split(':').map(Number)
    return time >= oh * 100 + om && time < ch * 100 + cm
  })
  */
}

export function getNextMarketOpen(schedule: MarketSchedule[]): { dayName: string; openTime: string } | null {
  if (schedule.length === 0) return null
  const now = new Date()
  const currentDay = now.getDay()
  const currentTime = now.getHours() * 100 + now.getMinutes()
  // Find next opening
  for (let offset = 0; offset < 7; offset++) {
    const checkDay = (currentDay + offset) % 7
    const slot = schedule.find(s => s.dayOfWeek === checkDay)
    if (slot) {
      const [oh, om] = slot.openTime.split(':').map(Number)
      const openTime = oh * 100 + om
      if (offset === 0 && currentTime >= openTime) continue // already past today's opening
      return { dayName: slot.dayName, openTime: slot.openTime }
    }
  }
  return schedule[0] ? { dayName: schedule[0].dayName, openTime: schedule[0].openTime } : null
}

export function getNextMarketDate(schedule: MarketSchedule[]): { date: Date; dayName: string; openTime: string; closeTime: string } | null {
  if (schedule.length === 0) return null
  const now = new Date()
  const currentDay = now.getDay()
  const currentTime = now.getHours() * 100 + now.getMinutes()

  for (let offset = 0; offset < 7; offset++) {
    const checkDay = (currentDay + offset) % 7
    const slot = schedule.find(s => s.dayOfWeek === checkDay)
    if (slot) {
      const [oh, om] = slot.openTime.split(':').map(Number)
      const [ch, cm] = slot.closeTime.split(':').map(Number)
      const openMinutes = oh * 100 + om
      if (offset === 0 && currentTime >= openMinutes) {
        // If market is currently open or past, skip to next week
        const closeMinutes = ch * 100 + cm
        if (currentTime >= closeMinutes) continue
        // Still open — return today
      }
      const date = new Date(now)
      date.setDate(now.getDate() + offset)
      date.setHours(oh, om, 0, 0)
      return { date, dayName: slot.dayName, openTime: slot.openTime, closeTime: slot.closeTime }
    }
  }
  // Fallback: next week
  const slot = schedule[0]
  const daysUntil = ((slot.dayOfWeek - currentDay + 7) % 7) || 7
  const date = new Date(now)
  date.setDate(now.getDate() + daysUntil)
  const [oh, om] = slot.openTime.split(':').map(Number)
  date.setHours(oh, om, 0, 0)
  return { date, dayName: slot.dayName, openTime: slot.openTime, closeTime: slot.closeTime }
}

export function formatUsd(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

export function generatePasscode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString()
}
