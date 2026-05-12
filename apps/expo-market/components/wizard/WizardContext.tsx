import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../providers/AuthProvider';

export interface WizardState {
  photos: string[]; name: string; category: string; description: string; email: string;
  quantity: string; address: string; city: string; state_code: string;
  offersDelivery: boolean; offersPickup: boolean; deliveryRadius: number; pickupAddress: string;
  selectedDates: string[]; deliveryWindows: Record<string, string[]>; pickupWindows: Record<string, string[]>;
  harvestedAt: string; priceUsd: string; unit: string; isFree: boolean;
  fullName: string; phoneNumber: string; smsEnabled: boolean; agreedToTos: boolean;
  currentStep: number; isExistingUser: boolean | null; isPublished: boolean;
  publishedProductId: string | null; quarantineInfo: any;
}

const defaults: WizardState = {
  photos: [], name: '', category: '', description: '', email: '',
  quantity: '', address: '', city: '', state_code: '',
  offersDelivery: true, offersPickup: true, deliveryRadius: 5, pickupAddress: '',
  selectedDates: [], deliveryWindows: {}, pickupWindows: {},
  harvestedAt: '', priceUsd: '', unit: 'each', isFree: false,
  fullName: '', phoneNumber: '', smsEnabled: true, agreedToTos: false,
  currentStep: 1, isExistingUser: null, isPublished: false,
  publishedProductId: null, quarantineInfo: null,
};

interface WizardCtx {
  state: WizardState; isAuthenticated: boolean;
  updateState: (u: Partial<WizardState>) => void;
  nextStep: () => void; prevStep: () => void;
  saveProduct: (isDraft: boolean) => Promise<string | null>;
}

const Ctx = createContext<WizardCtx | undefined>(undefined);

const mapWindows = (ids: string[]) => ids.map(id => {
  const [start] = id.split('-');
  return { id, start: `${start}:00`, end: `${parseInt(start) + 2}:00` };
});

export function WizardProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WizardState>(defaults);
  const { user } = useAuth();
  const isAuthenticated = !!user;

  useEffect(() => {
    if (user?.email && !state.email) updateState({ email: user.email });
    if (user?.user_metadata?.full_name && !state.fullName) updateState({ fullName: user.user_metadata.full_name });
  }, [user]);

  const updateState = (u: Partial<WizardState>) => setState(p => ({ ...p, ...u }));

  const nextStep = () => setState(p => {
    let next = p.currentStep + 1;
    if (next === 4 && (isAuthenticated || p.isExistingUser)) next = 5;
    return { ...p, currentStep: Math.min(6, next) };
  });

  const prevStep = () => setState(p => {
    let prev = p.currentStep - 1;
    if (prev === 4 && (isAuthenticated || p.isExistingUser)) prev = 3;
    return { ...p, currentStep: Math.max(1, prev) };
  });

  const saveProduct = async (isDraft: boolean): Promise<string | null> => {
    const { data: userData } = await supabase.auth.getUser();
    const authUser = userData.user;
    if (!authUser) throw new Error('Not authenticated');

    // Ensure booth exists
    let boothId: string | null = null;
    const { data: existing } = await supabase.from('market_booths').select('id').eq('owner_id', authUser.id).single();
    if (existing) { boothId = existing.id; }
    else {
      const boothName = state.fullName ? `${state.fullName}'s Produce Stand` : 'My Produce Stand';
      const { data: newBooth, error: bErr } = await supabase.from('market_booths').insert({
        owner_id: authUser.id, name: boothName, status: 'published',
        offers_delivery: state.offersDelivery, offers_pickup: state.offersPickup,
        delivery_radius_miles: state.deliveryRadius,
        pickup_address: state.offersPickup ? state.pickupAddress || null : null,
        payment_method: 'automatic', decorative_theme: 'floral',
      }).select().single();
      if (bErr || !newBooth) throw new Error('Failed to create booth');
      boothId = newBooth.id;
    }

    // Upload photos
    const urls: string[] = [];
    for (let i = 0; i < state.photos.length; i++) {
      const res = await fetch(state.photos[i]);
      const blob = await res.blob();
      const path = `${authUser.id}/${Date.now()}_${i}.jpg`;
      await supabase.storage.from('product-photos').upload(path, blob, { upsert: true });
      const { data: u } = supabase.storage.from('product-photos').getPublicUrl(path);
      if (u?.publicUrl) urls.push(u.publicUrl);
    }

    // Insert product
    const { data: prod, error: pErr } = await supabase.from('market_products').insert({
      seller_id: authUser.id,
      market_date: state.selectedDates[0] || new Date().toISOString().split('T')[0],
      name: state.name.trim() || 'Untitled Draft',
      description: state.description.trim() || null,
      category: state.category || 'produce',
      price_usd: parseFloat(state.priceUsd || '0'),
      unit: state.unit || 'each',
      inventory: parseInt(state.quantity) || 0,
      photos: urls,
      harvested_at: state.harvestedAt ? new Date(state.harvestedAt + 'T12:00:00').toISOString() : null,
      is_active: !isDraft, is_draft: isDraft,
      delivery_radius_miles: state.deliveryRadius,
      pickup_address: state.offersPickup ? state.pickupAddress || null : null,
      window_dates: state.selectedDates,
    }).select('id').single();

    if (pErr || !prod) throw new Error('Failed to add product: ' + (pErr?.message || ''));
    if (!isDraft) {
      updateState({ isPublished: true, publishedProductId: prod.id });
      supabase.functions.invoke('moderate-listing', {
        body: { product_id: prod.id, seller_id: authUser.id, name: state.name.trim(), description: state.description.trim(), price_usd: parseFloat(state.priceUsd || '0'), category: state.category, photo_url: urls[0] || null },
      }).catch(() => {});
    }
    return prod.id;
  };

  return <Ctx.Provider value={{ state, isAuthenticated, updateState, nextStep, prevStep, saveProduct }}>{children}</Ctx.Provider>;
}

export function useWizard() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useWizard must be used within WizardProvider');
  return ctx;
}
