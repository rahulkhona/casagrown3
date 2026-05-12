/**
 * CartProvider — Client-side shopping cart backed by AsyncStorage.
 *
 * Mirrors the next-market useCart hook (localStorage) but adapted for
 * React Native using AsyncStorage. No database table required.
 */

import React, {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/* ── Types ──────────────────────────────────────────────────────── */

export interface CartProduct {
  id: string;
  name: string;
  price_usd: number;
  unit: string;
  inventory: number;
  photos?: string[];
  category?: string;
}

export interface CartBooth {
  id: string;
  name: string;
  offers_delivery: boolean;
  offers_pickup: boolean;
}

export interface CartItem {
  product: CartProduct;
  booth: CartBooth;
  qty: number;
  fulfillmentMode: 'delivery' | 'pickup';
  unavailable?: 'sold_out' | 'insufficient' | 'inactive';
  latestInventory?: number;
  latestPrice?: number;
}

export interface BoothGroup {
  booth: CartBooth;
  items: CartItem[];
  subtotal: number;
  availableItemCount: number;
}

/* ── State & Actions ────────────────────────────────────────────── */

interface CartState {
  items: CartItem[];
  lastUpdated: number;
}

type CartAction =
  | { type: 'ADD_ITEM'; product: CartProduct; booth: CartBooth; qty: number; fulfillmentMode?: 'delivery' | 'pickup' }
  | { type: 'REMOVE_ITEM'; productId: string }
  | { type: 'UPDATE_QTY'; productId: string; qty: number }
  | { type: 'UPDATE_FULFILLMENT'; productId: string; mode: 'delivery' | 'pickup' }
  | { type: 'CLEAR_CART' }
  | { type: 'CLEAR_BOOTH'; boothId: string }
  | { type: 'REFRESH_ITEMS'; updates: Array<{ id: string; inventory: number; price_usd: number; is_active: boolean }> }
  | { type: 'LOAD'; state: CartState };

const STORAGE_KEY = 'casagrown_cart';

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'ADD_ITEM': {
      const defaultMode = action.fulfillmentMode || (action.booth.offers_pickup ? 'pickup' : 'delivery');
      const existing = state.items.findIndex(i => i.product.id === action.product.id);
      let items: CartItem[];
      if (existing >= 0) {
        items = state.items.map((item, idx) =>
          idx === existing ? { ...item, qty: action.qty, unavailable: undefined } : item
        );
      } else {
        items = [...state.items, {
          product: action.product,
          booth: action.booth,
          qty: action.qty,
          fulfillmentMode: defaultMode,
        }];
      }
      return { items, lastUpdated: Date.now() };
    }

    case 'REMOVE_ITEM':
      return { items: state.items.filter(i => i.product.id !== action.productId), lastUpdated: Date.now() };

    case 'UPDATE_QTY':
      return {
        items: state.items.map(i =>
          i.product.id === action.productId
            ? { ...i, qty: Math.max(1, action.qty), unavailable: undefined }
            : i
        ),
        lastUpdated: Date.now(),
      };

    case 'UPDATE_FULFILLMENT':
      return {
        items: state.items.map(i =>
          i.product.id === action.productId
            ? { ...i, fulfillmentMode: action.mode, unavailable: undefined }
            : i
        ),
        lastUpdated: Date.now(),
      };

    case 'CLEAR_CART':
      return { items: [], lastUpdated: Date.now() };

    case 'CLEAR_BOOTH':
      return { items: state.items.filter(i => i.booth.id !== action.boothId), lastUpdated: Date.now() };

    case 'REFRESH_ITEMS': {
      const updateMap = new Map(action.updates.map(u => [u.id, u]));
      const items = state.items.map(item => {
        const update = updateMap.get(item.product.id);
        if (!update) return item;
        let unavailable: CartItem['unavailable'];
        if (!update.is_active) unavailable = 'inactive';
        else if (update.inventory === 0) unavailable = 'sold_out';
        else if (update.inventory < item.qty) unavailable = 'insufficient';
        return {
          ...item,
          latestInventory: update.inventory,
          latestPrice: update.price_usd,
          unavailable,
        };
      });
      return { ...state, items };
    }

    case 'LOAD':
      return action.state;

    default:
      return state;
  }
}

const initialState: CartState = { items: [], lastUpdated: 0 };

/* ── Context ────────────────────────────────────────────────────── */

interface CartContextValue {
  items: CartItem[];
  itemCount: number;
  boothGroups: BoothGroup[];
  addItem: (product: CartProduct, booth: CartBooth, qty: number, fulfillmentMode?: 'delivery' | 'pickup') => void;
  removeItem: (productId: string) => void;
  updateQty: (productId: string, qty: number) => void;
  updateFulfillment: (productId: string, mode: 'delivery' | 'pickup') => void;
  clearCart: () => void;
  clearBooth: (boothId: string) => void;
  refreshItems: (updates: Array<{ id: string; inventory: number; price_usd: number; is_active: boolean }>) => void;
  getItemQty: (productId: string) => number;
}

const CartContext = createContext<CartContextValue | null>(null);

/* ── Provider ───────────────────────────────────────────────────── */

export function CartProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, initialState);

  // Load from AsyncStorage on mount
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as CartState;
          if (parsed.items?.length > 0) {
            dispatch({ type: 'LOAD', state: parsed });
          }
        } catch {}
      }
    }).catch(() => {});
  }, []);

  // Persist to AsyncStorage on changes
  useEffect(() => {
    if (state.lastUpdated > 0) {
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
    }
  }, [state]);

  // Computed: group items by booth
  const boothGroups: BoothGroup[] = (() => {
    const map = new Map<string, BoothGroup>();
    for (const item of state.items) {
      let group = map.get(item.booth.id);
      if (!group) {
        group = { booth: item.booth, items: [], subtotal: 0, availableItemCount: 0 };
        map.set(item.booth.id, group);
      }
      group.items.push(item);
      if (!item.unavailable) {
        const price = item.latestPrice ?? item.product.price_usd;
        group.subtotal += price * item.qty;
        group.availableItemCount++;
      }
    }
    return Array.from(map.values());
  })();

  const addItem = useCallback((product: CartProduct, booth: CartBooth, qty: number, fulfillmentMode?: 'delivery' | 'pickup') => {
    dispatch({ type: 'ADD_ITEM', product, booth, qty, fulfillmentMode });
  }, []);
  const removeItem = useCallback((productId: string) => dispatch({ type: 'REMOVE_ITEM', productId }), []);
  const updateQty = useCallback((productId: string, qty: number) => dispatch({ type: 'UPDATE_QTY', productId, qty }), []);
  const updateFulfillment = useCallback((productId: string, mode: 'delivery' | 'pickup') => dispatch({ type: 'UPDATE_FULFILLMENT', productId, mode }), []);
  const clearCart = useCallback(() => {
    dispatch({ type: 'CLEAR_CART' });
    AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
  }, []);
  const clearBooth = useCallback((boothId: string) => dispatch({ type: 'CLEAR_BOOTH', boothId }), []);
  const refreshItems = useCallback((updates: Array<{ id: string; inventory: number; price_usd: number; is_active: boolean }>) => {
    dispatch({ type: 'REFRESH_ITEMS', updates });
  }, []);
  const getItemQty = useCallback((productId: string) => {
    return state.items.find(i => i.product.id === productId)?.qty ?? 0;
  }, [state.items]);

  return (
    <CartContext.Provider value={{
      items: state.items,
      itemCount: state.items.length,
      boothGroups,
      addItem,
      removeItem,
      updateQty,
      updateFulfillment,
      clearCart,
      clearBooth,
      refreshItems,
      getItemQty,
    }}>
      {children}
    </CartContext.Provider>
  );
}

/* ── Hook ───────────────────────────────────────────────────────── */

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within <CartProvider>');
  return ctx;
}
