'use client'
import React from 'react'
import { ShoppingBag, Wrench, Leaf, BookOpen, Send, Sparkles } from 'lucide-react'

// ─── Shared Components ───────────────────────────────────────────────

export function ActionChips({ actions, onActionClick }: { actions?: string[], onActionClick?: (action: string) => void }) {
  if (!actions || actions.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid #f3f4f6' }}>
      {actions.map((action, idx) => (
        <button
          key={idx}
          onClick={() => onActionClick && onActionClick(action)}
          style={{
            padding: '6px 14px',
            borderRadius: 20,
            border: '1px solid #bbf7d0',
            background: 'white',
            color: '#166534',
            fontWeight: 600,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          {action}
        </button>
      ))}
    </div>
  );
}

// ─── Legacy Hardcoded Cards (kept for rich UX on known types) ────────

export function SellerWizardCard({ data, onActionClick }: { data: any, onActionClick?: (action: string) => void }) {
  const handlePostClick = () => {
    const params = new URLSearchParams({ title: data.title || '', price: data.price || '', description: data.description || '' });
    window.location.href = `/my-booth/products/new?${params.toString()}`;
  };
  return (
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 16, background: 'white', marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <ShoppingBag size={18} color="#16a34a" />
        <span style={{ fontWeight: 700, color: '#14532d', fontSize: 15 }}>Listing Draft</span>
      </div>
      <div style={{ background: '#f9fafb', borderRadius: 8, padding: 12, marginBottom: 12 }}>
        <div style={{ fontWeight: 700, color: '#111827', fontSize: 15 }}>{data.title || 'Untitled Item'}</div>
        <div style={{ color: '#16a34a', fontWeight: 700, fontSize: 15 }}>${data.price || '0.00'}</div>
        <div style={{ color: '#6b7280', marginTop: 6, fontSize: 13 }}>{data.description || 'No description provided.'}</div>
      </div>
      <button
        onClick={handlePostClick}
        style={{ width: '100%', padding: '10px 0', background: '#16a34a', color: 'white', border: 'none', borderRadius: 8, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
      >
        Continue to Post
      </button>
      <ActionChips actions={data.suggested_next_actions} onActionClick={onActionClick} />
    </div>
  );
}

export function DiagnosisCard({ data, onActionClick }: { data: any, onActionClick?: (action: string) => void }) {
  return (
    <div style={{ border: '1px solid #fecaca', borderRadius: 12, padding: 16, background: '#fff5f5', marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Wrench size={18} color="#dc2626" />
        <span style={{ fontWeight: 700, color: '#7f1d1d', fontSize: 15 }}>Plant Diagnosis</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ color: '#7f1d1d' }}><strong>Diagnosis:</strong> {data.diagnosis}</div>
        <div style={{ color: '#7f1d1d' }}><strong>Urgency:</strong> {data.urgency}</div>
        <div style={{ background: 'white', borderRadius: 8, padding: 12, marginTop: 6 }}>
          <div style={{ fontWeight: 700, color: '#374151', marginBottom: 4 }}>Remedy Plan:</div>
          <div style={{ color: '#4b5563', fontSize: 13, whiteSpace: 'pre-wrap' }}>{data.remedy_plan}</div>
        </div>
      </div>
      <ActionChips actions={data.suggested_next_actions} onActionClick={onActionClick} />
    </div>
  );
}

export function PlantGuideCard({ data, onActionClick }: { data: any, onActionClick?: (action: string) => void }) {
  return (
    <div style={{ border: '1px solid #bbf7d0', borderRadius: 12, padding: 16, background: '#f0fdf4', marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Leaf size={18} color="#16a34a" />
        <span style={{ fontWeight: 700, color: '#14532d', fontSize: 15 }}>{data.plant_name}</span>
      </div>
      <div style={{ background: 'white', borderRadius: 8, padding: 12 }}>
        <div style={{ fontWeight: 700, color: '#374151', marginBottom: 4 }}>Care Instructions:</div>
        <div style={{ color: '#4b5563', fontSize: 13 }}>{data.care_instructions}</div>
        {data.companion_plants && data.companion_plants.length > 0 && (
          <>
            <div style={{ fontWeight: 700, color: '#374151', marginTop: 10, marginBottom: 4 }}>Companion Plants:</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {data.companion_plants.map((p: string, i: number) => (
                <span key={i} style={{ background: '#dcfce7', color: '#166534', padding: '2px 10px', borderRadius: 12, fontSize: 12 }}>{p}</span>
              ))}
            </div>
          </>
        )}
      </div>
      <ActionChips actions={data.suggested_next_actions} onActionClick={onActionClick} />
    </div>
  );
}

export function RecipeCard({ data, onActionClick }: { data: any, onActionClick?: (action: string) => void }) {
  return (
    <div style={{ border: '1px solid #fed7aa', borderRadius: 12, padding: 16, background: '#fff7ed', marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <BookOpen size={18} color="#ea580c" />
        <span style={{ fontWeight: 700, color: '#7c2d12', fontSize: 15 }}>{data.recipe_name}</span>
      </div>
      <div style={{ background: 'white', borderRadius: 8, padding: 12 }}>
        <div style={{ fontWeight: 700, color: '#374151', marginBottom: 4 }}>Ingredients:</div>
        <div style={{ paddingLeft: 8 }}>
          {data.ingredients?.map((ing: string, i: number) => (
            <div key={i} style={{ color: '#4b5563', fontSize: 13 }}>• {ing}</div>
          ))}
        </div>
        <div style={{ fontWeight: 700, color: '#374151', marginTop: 10, marginBottom: 4 }}>Instructions:</div>
        <div style={{ color: '#4b5563', fontSize: 13, whiteSpace: 'pre-wrap' }}>{data.instructions}</div>
      </div>
      <ActionChips actions={data.suggested_next_actions} onActionClick={onActionClick} />
    </div>
  );
}

export function BroadcastBuyRequestCard({ data, onActionClick }: { data: any, onActionClick?: (action: string) => void }) {
  return (
    <div style={{ border: '1px solid #bfdbfe', borderRadius: 12, padding: 16, background: '#eff6ff', marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <Send size={18} color="#2563eb" />
        <span style={{ fontWeight: 700, color: '#1e3a8a', fontSize: 15 }}>Buy Request Broadcasted</span>
      </div>
      <div style={{ background: 'white', borderRadius: 8, padding: 12 }}>
        <div style={{ color: '#4b5563', fontSize: 13 }}>
          Your request for <strong>{data.plant_name}</strong> has been broadcasted to neighbors who might have it.
        </div>
        <div style={{ color: '#9ca3af', fontSize: 12, marginTop: 4 }}>Urgency: {data.urgency || 'Normal'}</div>
      </div>
      <ActionChips actions={data.suggested_next_actions} onActionClick={onActionClick} />
    </div>
  );
}

export function ShoppingResultsCard({ data, onActionClick }: { data: any, onActionClick?: (action: string) => void }) {
  return (
    <div style={{ border: '1px solid #bbf7d0', borderRadius: 12, padding: 16, background: '#f0fdf4', marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <ShoppingBag size={18} color="#16a34a" />
        <span style={{ fontWeight: 700, color: '#14532d', fontSize: 15 }}>Local Market Search</span>
      </div>
      <div style={{ background: 'white', borderRadius: 8, padding: 12 }}>
        <div style={{ fontWeight: 700, color: '#374151', marginBottom: 4 }}>Searching for:</div>
        <div style={{ color: '#4b5563', fontSize: 13, marginBottom: 8 }}>{data.search_intent}</div>
        
        {data.stores && (
          <>
            <div style={{ fontWeight: 700, color: '#374151', marginBottom: 4 }}>Results:</div>
            <div style={{ color: '#4b5563', fontSize: 13 }}>{data.stores}</div>
          </>
        )}
        {data.backend_results && !data.stores && (
          <>
            <div style={{ fontWeight: 700, color: '#374151', marginBottom: 4 }}>Results:</div>
            <div style={{ color: '#4b5563', fontSize: 13 }}>
              {typeof data.backend_results === 'string' ? data.backend_results : JSON.stringify(data.backend_results)}
            </div>
          </>
        )}
      </div>
      <ActionChips actions={data.suggested_next_actions} onActionClick={onActionClick} />
    </div>
  );
}

export function GrowSuggestionCard({ data, onActionClick }: { data: any, onActionClick?: (action: string) => void }) {
  // suggestions may be a string or an array from the AI
  const suggestionList: string[] = Array.isArray(data.suggestions)
    ? data.suggestions.map((s: any) => (typeof s === 'string' ? s : s.name || JSON.stringify(s)))
    : typeof data.suggestions === 'string'
    ? data.suggestions.split(/,\s*/).map((s: string) => s.trim()).filter(Boolean)
    : [];

  return (
    <div style={{ border: '1px solid #bbf7d0', borderRadius: 12, padding: 16, background: '#f0fdf4', marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 18 }}>🌱</span>
        <span style={{ fontWeight: 700, color: '#14532d', fontSize: 15 }}>What to Grow</span>
        {data.season && <span style={{ marginLeft: 'auto', fontSize: 12, color: '#16a34a', background: '#dcfce7', padding: '2px 8px', borderRadius: 10 }}>{data.season}</span>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {suggestionList.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'white', borderRadius: 8, padding: '8px 12px' }}>
            <span style={{ color: '#16a34a', fontWeight: 700 }}>·</span>
            <span style={{ color: '#374151', fontSize: 14 }}>{s}</span>
          </div>
        ))}
      </div>
      <ActionChips actions={data.suggested_next_actions} onActionClick={onActionClick} />
    </div>
  );
}

// ─── Dynamic Generic Card (for any new tool added via Admin) ─────────

/** Keys to exclude from the generic card's key-value display */
const HIDDEN_KEYS = new Set(['suggested_next_actions', 'user_id', 'backend_results']);

/** Convert a camelCase or snake_case key into a readable label */
function humanizeKey(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/** Render a single value intelligently */
function renderValue(value: any): React.ReactNode {
  if (value === null || value === undefined) return <span style={{ color: '#9ca3af' }}>—</span>;
  if (typeof value === 'boolean') return value ? '✅ Yes' : '❌ No';
  if (Array.isArray(value)) {
    if (value.length === 0) return <span style={{ color: '#9ca3af' }}>None</span>;
    // Array of strings → pill chips
    if (value.every(v => typeof v === 'string')) {
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 2 }}>
          {value.map((v, i) => (
            <span key={i} style={{ background: '#e0e7ff', color: '#3730a3', padding: '2px 8px', borderRadius: 10, fontSize: 12 }}>{v}</span>
          ))}
        </div>
      );
    }
    // Array of objects → compact list
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {value.map((item, i) => (
          <div key={i} style={{ fontSize: 13, color: '#4b5563' }}>
            {typeof item === 'object' ? Object.values(item).filter(Boolean).join(' — ') : String(item)}
          </div>
        ))}
      </div>
    );
  }
  if (typeof value === 'object') {
    return <span style={{ fontSize: 12, color: '#6b7280' }}>{JSON.stringify(value)}</span>;
  }
  return String(value);
}

export function DynamicToolCard({ action, onActionClick }: { action: any, onActionClick?: (action: string) => void }) {
  const data = action.data || {};
  const displayEntries = Object.entries(data).filter(([key]) => !HIDDEN_KEYS.has(key));
  
  // If there's a backend_results field, show it prominently
  const backendResults = data.backend_results;

  return (
    <div style={{ border: '1px solid #c7d2fe', borderRadius: 12, padding: 16, background: '#eef2ff', marginTop: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Sparkles size={18} color="#6366f1" />
        <span style={{ fontWeight: 700, color: '#312e81', fontSize: 15 }}>
          {humanizeKey(action.type)}
        </span>
      </div>
      
      {/* Key-Value pairs */}
      <div style={{ background: 'white', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {displayEntries.map(([key, value]) => (
          <div key={key}>
            <div style={{ fontWeight: 600, color: '#374151', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
              {humanizeKey(key)}
            </div>
            <div style={{ color: '#4b5563', fontSize: 14 }}>
              {renderValue(value)}
            </div>
          </div>
        ))}
      </div>

      {/* Backend results section */}
      {backendResults && (
        <div style={{ background: 'white', borderRadius: 8, padding: 12, marginTop: 8, borderLeft: '3px solid #6366f1' }}>
          <div style={{ fontWeight: 600, color: '#374151', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
            Results
          </div>
          <div style={{ color: '#4b5563', fontSize: 13 }}>
            {typeof backendResults === 'string' ? backendResults : renderValue(backendResults)}
          </div>
        </div>
      )}

      <ActionChips actions={data.suggested_next_actions} onActionClick={onActionClick} />
    </div>
  );
}

// ─── Main Router ─────────────────────────────────────────────────────

/** Internal/silent tools that should not render a visible card */
const SILENT_TOOLS = new Set(['UserMemoryCard']);

export default function DynamicUICardRenderer({ action, onActionClick }: { action: any, onActionClick?: (a: string) => void }) {
  // Silent tools: executed by the backend but invisible to the user
  if (SILENT_TOOLS.has(action.type)) {
    return null;
  }

  // Known legacy cards with rich, custom UX
  switch (action.type) {
    case 'SellerWizardCard':        return <SellerWizardCard data={action.data} onActionClick={onActionClick} />;
    case 'DiagnosisCard':           return <DiagnosisCard data={action.data} onActionClick={onActionClick} />;
    case 'PlantGuideCard':          return <PlantGuideCard data={action.data} onActionClick={onActionClick} />;
    case 'RecipeCard':              return <RecipeCard data={action.data} onActionClick={onActionClick} />;
    case 'BroadcastBuyRequestCard': return <BroadcastBuyRequestCard data={action.data} onActionClick={onActionClick} />;
    case 'GrowSuggestionCard':      return <GrowSuggestionCard data={action.data} onActionClick={onActionClick} />;
    case 'ShoppingResultsCard':     return <ShoppingResultsCard data={action.data} onActionClick={onActionClick} />;

    // All new tools added via Admin → render dynamically
    default:
      return <DynamicToolCard action={action} onActionClick={onActionClick} />;
  }
}
