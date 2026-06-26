'use client'

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import {
  ReactFlow,
  ReactFlowProvider,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  MarkerType,
  type Connection,
  type Edge,
  type Node
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { createClient } from '@supabase/supabase-js'
import CampaignMessageEditor, { CampaignFormState } from './CampaignMessageEditor'
import TrackingUrlBuilder from './TrackingUrlBuilder'
import { useRouter } from 'next/navigation'
import { adminApi } from '../lib/adminApi'
import AiQueryChat from './AiQueryChat'
import { QueryBuilder, Field, RuleGroupType } from 'react-querybuilder'
import 'react-querybuilder/dist/query-builder.css'

const booleanValues = [
  { name: 'true', label: 'True' },
  { name: 'false', label: 'False' }
]

const queryBuilderFields: Field[] = [
  // Macros
  { 
    name: 'user_macro_state', 
    label: 'Predefined User State', 
    inputType: 'select', 
    valueEditorType: 'select', 
    optGroup: 'Predefined States',
    values: [
      { name: 'signup_completed', label: 'Signup Completed (TOS + Profile)' },
      { name: 'signup_abandoned', label: 'Signup Abandoned (Incomplete)' }
    ]
  },
  
  // Identity & Comms
  { 
    name: 'recipient_type', 
    label: 'Account Type', 
    inputType: 'select', 
    valueEditorType: 'select', 
    optGroup: 'Identity & Preferences',
    values: [
      { name: 'user', label: 'Registered User' },
      { name: 'lead', label: 'Guest Lead' }
    ]
  },
  { name: 'has_signed_tos', label: 'Signed TOS', inputType: 'select', valueEditorType: 'select', values: booleanValues, optGroup: 'Identity & Preferences' },
  { name: 'has_completed_profile', label: 'Profile Completed', inputType: 'select', valueEditorType: 'select', values: booleanValues, optGroup: 'Identity & Preferences' },
  { name: 'has_only_email', label: 'Has Only Email', inputType: 'select', valueEditorType: 'select', values: booleanValues, optGroup: 'Identity & Preferences' },
  { name: 'has_only_phone', label: 'Has Only Phone Number', inputType: 'select', valueEditorType: 'select', values: booleanValues, optGroup: 'Identity & Preferences' },
  { name: 'has_both_email_and_phone', label: 'Has Both Email and Phone', inputType: 'select', valueEditorType: 'select', values: booleanValues, optGroup: 'Identity & Preferences' },
  { name: 'days_since_last_active', label: 'Days Since Last Active', inputType: 'number', valueEditorType: 'text', optGroup: 'Engagement & Retention' },
  { name: 'profile_completed_at', label: 'Profile Completed At', inputType: 'text', valueEditorType: 'text', optGroup: 'Engagement & Retention' },
  { name: 'email_enabled', label: 'Email Enabled', inputType: 'select', valueEditorType: 'select', values: booleanValues, optGroup: 'Identity & Preferences' },
  { name: 'sms_enabled', label: 'SMS Enabled', inputType: 'select', valueEditorType: 'select', values: booleanValues, optGroup: 'Identity & Preferences' },
  { name: 'is_banned', label: 'Is Banned', inputType: 'select', valueEditorType: 'select', values: booleanValues, optGroup: 'Identity & Preferences' },
  { name: 'is_ghosted', label: 'Is Ghosted', inputType: 'select', valueEditorType: 'select', values: booleanValues, optGroup: 'Identity & Preferences' },
  
  // Attribution (Static)
  { 
    name: 'utm_source', 
    label: 'UTM Source', 
    inputType: 'select', 
    valueEditorType: 'select', 
    optGroup: 'Attribution & Sources',
    values: [
      { name: '', label: 'Any/Unknown' },
      { name: 'facebook', label: 'Facebook' },
      { name: 'instagram', label: 'Instagram' },
      { name: 'tiktok', label: 'TikTok' },
      { name: 'google', label: 'Google Ads' },
      { name: 'newsletter', label: 'Newsletter' },
      { name: 'affiliate', label: 'Affiliate' },
      { name: 'nextdoor', label: 'Nextdoor' },
      { name: 'reddit', label: 'Reddit' },
      { name: 'qr_code', label: 'QR Code / Print' },
      { name: 'organic', label: 'Organic Search' }
    ]
  },
  
  // Geography
  { name: 'zip_code', label: 'Zip Code', inputType: 'text', optGroup: 'Location' },
  { name: 'state_code', label: 'State Code', inputType: 'text', optGroup: 'Location' },
  { name: 'country_code', label: 'Country Code', inputType: 'text', optGroup: 'Location' },
  
  // Balances
  { name: 'available_balance_usd', label: 'Available Balance ($)', inputType: 'number', valueEditorType: 'text', optGroup: 'Financials' },
  { name: 'total_earned_usd', label: 'Total Earned ($)', inputType: 'number', valueEditorType: 'text', optGroup: 'Financials' },
  { name: 'lifetime_credits_consumed', label: 'Credits Consumed', inputType: 'number', valueEditorType: 'text', optGroup: 'Financials' },
  
  // Buyer Metrics
  { name: 'total_purchases', label: 'Lifetime Purchases', inputType: 'number', valueEditorType: 'text', optGroup: 'Buyer Activity' },
  { name: 'lifetime_spend', label: 'Lifetime Spend ($)', inputType: 'number', valueEditorType: 'text', optGroup: 'Buyer Activity' },
  { name: 'ytd_purchases', label: 'YTD Purchases', inputType: 'number', valueEditorType: 'text', optGroup: 'Buyer Activity' },
  { name: 'mtd_purchases', label: 'MTD Purchases', inputType: 'number', valueEditorType: 'text', optGroup: 'Buyer Activity' },
  { name: 'buyer_avg_rating', label: 'Buyer Avg Rating', inputType: 'number', valueEditorType: 'text', optGroup: 'Buyer Activity' },
  
  // Seller Metrics
  { name: 'total_sales', label: 'Lifetime Sales', inputType: 'number', valueEditorType: 'text', optGroup: 'Seller Activity' },
  { name: 'lifetime_revenue', label: 'Lifetime Revenue ($)', inputType: 'number', valueEditorType: 'text', optGroup: 'Seller Activity' },
  { name: 'ytd_sales', label: 'YTD Sales', inputType: 'number', valueEditorType: 'text', optGroup: 'Seller Activity' },
  { name: 'mtd_sales', label: 'MTD Sales', inputType: 'number', valueEditorType: 'text', optGroup: 'Seller Activity' },
  { name: 'seller_avg_rating', label: 'Seller Avg Rating', inputType: 'number', valueEditorType: 'text', optGroup: 'Seller Activity' },
  { name: 'payout_verified', label: 'Payout Verified', inputType: 'select', valueEditorType: 'select', values: booleanValues, optGroup: 'Seller Activity' },
  { name: 'total_posts_created', label: 'Posts Created', inputType: 'number', valueEditorType: 'text', optGroup: 'Seller Activity' },
  { name: 'has_created_listings', label: 'Has Created At Least 1 Listing', inputType: 'select', valueEditorType: 'select', values: booleanValues, optGroup: 'Seller Activity' },
  
  // Trust & Support
  { name: 'total_disputes_initiated', label: 'Disputes Initiated', inputType: 'number', valueEditorType: 'text', optGroup: 'Trust & Safety' },
  { name: 'total_escalations_created', label: 'Escalations Created', inputType: 'number', valueEditorType: 'text', optGroup: 'Trust & Safety' },
  
  // CRM Tracking
  { name: 'active_campaigns_enrolled', label: 'Active Campaigns', inputType: 'number', valueEditorType: 'text', optGroup: 'CRM Health' },
  { name: 'lifetime_campaigns_enrolled', label: 'Lifetime Campaigns', inputType: 'number', valueEditorType: 'text', optGroup: 'CRM Health' },

  // Message Engagement (populated from crm_campaign_sends in sequence context)
  { name: 'last_email_opened', label: 'Last Email Was Opened', inputType: 'select', valueEditorType: 'select', values: booleanValues, optGroup: 'Message Engagement' },
  { name: 'last_email_clicked', label: 'Last Email Was Clicked', inputType: 'select', valueEditorType: 'select', values: booleanValues, optGroup: 'Message Engagement' },
  { name: 'last_email_bounced', label: 'Last Email Bounced', inputType: 'select', valueEditorType: 'select', values: booleanValues, optGroup: 'Message Engagement' },
  { name: 'last_email_delivered', label: 'Last Email Delivered', inputType: 'select', valueEditorType: 'select', values: booleanValues, optGroup: 'Message Engagement' },
  { name: 'last_sms_delivered', label: 'Last SMS Delivered', inputType: 'select', valueEditorType: 'select', values: booleanValues, optGroup: 'Message Engagement' },
  { name: 'last_sms_bounced', label: 'Last SMS Bounced', inputType: 'select', valueEditorType: 'select', values: booleanValues, optGroup: 'Message Engagement' },
  { name: 'emails_opened_count', label: 'Emails Opened Count', inputType: 'number', valueEditorType: 'text', optGroup: 'Message Engagement' },
  { name: 'emails_clicked_count', label: 'Emails Clicked Count', inputType: 'number', valueEditorType: 'text', optGroup: 'Message Engagement' },
  { name: 'emails_bounced_count', label: 'Emails Bounced Count', inputType: 'number', valueEditorType: 'text', optGroup: 'Message Engagement' },
  { name: 'total_sends_in_sequence', label: 'Total Sends in Sequence', inputType: 'number', valueEditorType: 'text', optGroup: 'Message Engagement' },
]

const formatQueryString = (query: any, fields: any[]): string => {
  if (!query || !query.rules || query.rules.length === 0) return 'Empty Condition';
  
  const formattedRules = query.rules.map((rule: any) => {
    if ('rules' in rule) {
      return `(${formatQueryString(rule, fields)})`;
    }
    const fieldDef = fields.find((f:any) => f.name === rule.field);
    const fieldLabel = fieldDef ? fieldDef.label : rule.field;
    
    let valueLabel = rule.value;
    if (fieldDef?.values) {
      const valDef = fieldDef.values.find((v:any) => v.name === rule.value || String(v.name) === String(rule.value));
      if (valDef) valueLabel = valDef.label;
    }
    
    return `${fieldLabel} ${rule.operator} ${valueLabel}`;
  });

  return formattedRules.join(` ${query.combinator.toUpperCase()} `);
};

// ─── Rich Node Label Builder ────────────────────────────────────────────────
// Generates a React element with:
//   1. Title line (icon + type or custom userLabel)
//   2. Summary lines (1-3 lines of config detail, always visible)
//   3. Hover tooltip (full detail on mouseover)
const buildNodeLabel = (nodeType: string, data: any, flatFields?: any[]): React.ReactNode => {
  let icon = '';
  let title = nodeType;
  let summaryLines: string[] = [];
  let tooltipLines: string[] = [];

  const userLabel = data?.userLabel;

  switch (nodeType) {
    case 'action_email': {
      icon = '✉️';
      title = userLabel || 'Send Email';
      if (data?.postmark_template_alias) {
        summaryLines.push(`Template: ${data.postmark_template_alias}`);
      } else if (data?.subject) {
        summaryLines.push(`Subject: ${data.subject.length > 45 ? data.subject.slice(0, 42) + '...' : data.subject}`);
        tooltipLines.push(`Subject: ${data.subject}`);
      }
      if (data?.data_source_id) summaryLines.push(`📊 Data source attached`);
      if (data?.html) tooltipLines.push(`HTML body: ${data.html.length} chars`);
      if (data?.text) tooltipLines.push(`Text body: ${data.text.length > 80 ? data.text.slice(0, 77) + '...' : data.text}`);
      break;
    }
    case 'action_sms': {
      icon = '💬';
      title = userLabel || 'Send SMS';
      if (data?.text) {
        const preview = data.text.length > 50 ? data.text.slice(0, 47) + '...' : data.text;
        summaryLines.push(preview);
        tooltipLines.push(`Message: ${data.text}`);
      }
      if (data?.data_source_id) summaryLines.push(`📊 Data source attached`);
      break;
    }
    case 'wait': {
      icon = '⏳';
      const d = data?.delayDays || 0;
      const h = data?.delayHours || 0;
      const m = data?.delayMinutes || 0;
      const parts = [];
      if (d > 0) parts.push(`${d} day${d > 1 ? 's' : ''}`);
      if (h > 0) parts.push(`${h} hr${h > 1 ? 's' : ''}`);
      if (m > 0) parts.push(`${m} min`);
      title = userLabel || `Wait ${parts.length > 0 ? parts.join(' ') : '0m'}`;
      break;
    }
    case 'condition': {
      if (data?.conditionMode === 'ai') {
        icon = '🤖';
        title = userLabel || 'AI Condition';
        if (data?.aiExplanation) {
          const expl = data.aiExplanation;
          summaryLines.push(expl.length > 55 ? expl.slice(0, 52) + '...' : expl);
          tooltipLines.push(`Explanation: ${expl}`);
        }
        if (data?.aiSql) tooltipLines.push(`SQL: ${data.aiSql}`);
      } else {
        icon = '🔀';
        title = userLabel || 'Condition';
        const query = data?.query;
        if (query?.rules?.length > 0 && flatFields) {
          const rules = query.rules;
          const combinator = (query.combinator || 'and').toUpperCase();
          summaryLines.push(`${combinator} · ${rules.length} rule${rules.length > 1 ? 's' : ''}`);
          // Show first 2 rules
          const formatRule = (rule: any): string => {
            if ('rules' in rule) return `(${rule.rules.length} sub-rules)`;
            const fieldDef = flatFields.find((f: any) => f.name === rule.field);
            const fieldLabel = fieldDef ? fieldDef.label : rule.field;
            let valueLabel = rule.value;
            if (fieldDef?.values) {
              const valDef = fieldDef.values.find((v: any) => v.name === rule.value || String(v.name) === String(rule.value));
              if (valDef) valueLabel = valDef.label;
            }
            return `${fieldLabel} ${rule.operator} ${valueLabel}`;
          };
          for (let i = 0; i < Math.min(2, rules.length); i++) {
            summaryLines.push(`• ${formatRule(rules[i])}`);
          }
          if (rules.length > 2) summaryLines.push(`• +${rules.length - 2} more...`);
          // Full rules for tooltip
          tooltipLines.push(`Condition: ${combinator}`);
          rules.forEach((r: any) => tooltipLines.push(`  • ${formatRule(r)}`));
        }
      }
      break;
    }
    case 'wait_for_slot': {
      icon = '🕐';
      title = userLabel || 'Wait for Optimal Slot';
      const slots = data?.slots || [];
      const preset = data?.slotPreset;
      if (preset && preset !== 'custom') {
        summaryLines.push(`${preset === 'email' ? '📧' : '💬'} ${preset.charAt(0).toUpperCase() + preset.slice(1)} preset · ${slots.length} window${slots.length !== 1 ? 's' : ''}`);
      } else if (slots.length > 0) {
        summaryLines.push(`⚙️ Custom · ${slots.length} window${slots.length !== 1 ? 's' : ''}`);
      } else {
        summaryLines.push(`No slots configured`);
      }
      // Show first 2 slot windows
      for (let i = 0; i < Math.min(2, slots.length); i++) {
        const s = slots[i];
        const dayStr = s.day || (s.days?.join(', ')) || '';
        summaryLines.push(`• ${dayStr} ${s.start}–${s.end}`);
      }
      if (slots.length > 2) summaryLines.push(`• +${slots.length - 2} more...`);
      // Full slots for tooltip
      if (slots.length > 0) {
        tooltipLines.push(`Send Windows:`);
        slots.forEach((s: any) => {
          const dayStr = s.day || (s.days?.join(', ')) || '';
          tooltipLines.push(`  ${dayStr}: ${s.start} – ${s.end}`);
        });
      }
      break;
    }
    case 'fork': {
      icon = '🔱';
      title = userLabel || 'Fork (Parallel)';
      break;
    }
    case 'join': {
      icon = '🔗';
      title = userLabel || 'Join (Wait for All)';
      break;
    }
    case 'terminal': {
      icon = '🛑';
      title = userLabel || 'Terminal (End)';
      summaryLines.push('End of flow sequence');
      break;
    }
  }

  const hasTooltip = tooltipLines.length > 0;
  const tooltipText = tooltipLines.join('\n');

  return React.createElement('div', {
    style: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 120, maxWidth: 220, position: 'relative' },
    title: hasTooltip ? tooltipText : undefined
  },
    data?.dryRunCount !== undefined && React.createElement('div', {
      style: {
        position: 'absolute',
        top: -24,
        right: -10,
        background: '#10b981',
        color: 'white',
        fontSize: '0.7rem',
        fontWeight: 700,
        padding: '2px 6px',
        borderRadius: '10px',
        boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
        zIndex: 10
      }
    }, `${data.dryRunCount} reached`),
    React.createElement('div', {
      style: { fontWeight: 600, fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
    }, `${icon} ${title}`),
    ...summaryLines.map((line, i) =>
      React.createElement('div', {
        key: i,
        style: {
          fontSize: '0.72rem',
          color: '#6b7280',
          lineHeight: 1.3,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }
      }, line)
    )
  );
};

const initialQuery: RuleGroupType = { combinator: 'and', rules: [{ field: 'email_enabled', operator: '=', value: 'true' }] }

const getTriggerLabel = (val: string, audienceId?: string, audiences?: any[]) => {
  if (!val || val === '') {
    if (audienceId && audiences) {
      const aud = audiences.find(a => a.id === audienceId);
      if (aud) return `Start: Manual (${aud.name})`;
    }
    return 'Start: Manual / Snapshot';
  }
  
  switch (val) {
    case 'lead.created': return 'Start: New Lead Created';
    case 'user.first_login': return 'Start: First Time Login';
    case 'market_orders.purchase_completed': return 'Start: Purchase Order Completed';
    case 'market_orders.sale_completed': return 'Start: Sale Order Completed';
    case 'ai_condition': return 'Start: AI Condition';
    default: return 'Start: Manual / Snapshot';
  }
}

// ── Lightweight SQL formatter ──────────────────────────────────
function formatSql(sql: string): string {
  if (!sql) return sql;
  let s = sql.replace(/\s+/g, ' ').trim();
  s = s.replace(/\b(FROM|WHERE|JOIN|LEFT JOIN|RIGHT JOIN|INNER JOIN|FULL JOIN|CROSS JOIN|ON|ORDER BY|GROUP BY|HAVING|LIMIT|OFFSET|UNION ALL|UNION|EXCEPT|INTERSECT)\b/gi, '\n$1');
  s = s.replace(/^SELECT\s+(DISTINCT\s+)?/i, (match) => 'SELECT ' + (match.includes('DISTINCT') ? 'DISTINCT\n  ' : '\n  '));
  s = s.replace(/\b(AND|OR)\b/gi, '\n  $1');
  const fromIdx = s.search(/\nFROM\b/i);
  if (fromIdx > 0) {
    const selectPart = s.substring(0, fromIdx);
    const rest = s.substring(fromIdx);
    const formattedSelect = selectPart.replace(/,\s*/g, ',\n  ');
    s = formattedSelect + rest;
  }
  return s;
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

const initialNodes: Node[] = [
  {
    id: 'start',
    type: 'input',
    data: { label: 'Start (Trigger)' },
    position: { x: 250, y: 50 },
    deletable: false,
    style: { background: '#10b981', color: 'white', border: 'none', borderRadius: '8px', padding: '10px 20px', fontWeight: 'bold' }
  },
]

export default function SequenceBuilder({ sequenceId }: { sequenceId: string }) {
  const router = useRouter()
  const reactFlowWrapper = useRef<HTMLDivElement>(null)
  
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const [reactFlowInstance, setReactFlowInstance] = useState<any>(null)
  
  const [sequence, setSequence] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toastMsg, setToastMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [dryRunLoading, setDryRunLoading] = useState(false)
  const [dryRunResults, setDryRunResults] = useState<any>(null)
  const [isSimulationMode, setIsSimulationMode] = useState(false)
  const isLocked = sequence?.status === 'active'
  const isCanvasLocked = isLocked || isSimulationMode
  const isSidebarDisabled = isLocked || isSimulationMode

  // Sidebar state
  const [selectedNode, setSelectedNode] = useState<Node | null>(null)
  
  // Modals state for editing
  const [dataSources, setDataSources] = useState<any[]>([])
  
  // Editor form state matching CampaignMessageEditor
  const [editorForm, setEditorForm] = useState<CampaignFormState>({
    name: '',
    channel: 'email',
    subject: '',
    content_html: '',
    content_text: '',
    postmark_template_alias: '',
    test_emails: '',
    data_source_id: ''
  })
  const [templateMode, setTemplateMode] = useState(false)
  const [emailModalOpen, setEmailModalOpen] = useState(false)
  const [waitConfig, setWaitConfig] = useState({ days: '0', hours: '0', minutes: '0' })
  const [conditionConfig, setConditionConfig] = useState({ query: initialQuery })
  const [triggerEvent, setTriggerEvent] = useState('')
  const [audiences, setAudiences] = useState<any[]>([])
  const [landingPages, setLandingPages] = useState<any[]>([])
  const [promotions, setPromotions] = useState<any[]>([])
  const [allSequences, setAllSequences] = useState<any[]>([])
  const [testEmails, setTestEmails] = useState<string>('')
  const [testPhones, setTestPhones] = useState<string>('')
  const [testing, setTesting] = useState(false)
  // AI condition trigger state
  const [aiConditionPrompt, setAiConditionPrompt] = useState('')
  const [aiConditionSql, setAiConditionSql] = useState('')
  const [aiConditionExplanation, setAiConditionExplanation] = useState('')
  const [aiConditionLoading, setAiConditionLoading] = useState(false)
  const [aiConditionError, setAiConditionError] = useState('')
  // AI condition node state
  const [conditionNodeMode, setConditionNodeMode] = useState<'rules' | 'ai'>('rules')
  const [conditionAiPrompt, setConditionAiPrompt] = useState('')
  const [conditionAiSql, setConditionAiSql] = useState('')
  const [conditionAiExplanation, setConditionAiExplanation] = useState('')
  const [conditionAiLoading, setConditionAiLoading] = useState(false)
  const [conditionAiError, setConditionAiError] = useState('')
  // Wait for Optimal Slot state
  const [slotConfig, setSlotConfig] = useState<{ slots: Array<{ day?: string, days?: string[], start: string, end: string }>, preset: string }>({ slots: [], preset: 'email' })
  const [sendSlotDefaults, setSendSlotDefaults] = useState<any>(null)
  // Backfill on activation state
  const [backfillOnActivate, setBackfillOnActivate] = useState(false)
  // User label state for custom node naming
  const [userLabel, setUserLabel] = useState('')

  const queryFields = useMemo(() => {
    const flatFields = [
      ...queryBuilderFields,
      {
        name: 'signup_source',
        label: 'Signup Source',
        inputType: 'select',
        valueEditorType: 'select',
        optGroup: 'Attribution & Sources',
        values: [
          { name: '', label: 'Any/Unknown' },
          { name: 'sell', label: 'Core: Seller Onboarding (/sell)' },
          { name: 'check-nutrition-loss', label: 'Core: Nutrition Drop (/check-nutrition-loss)' },
          ...landingPages.map(lp => ({ name: lp.slug, label: `Landing Page: ${lp.title}` }))
        ]
      },
      {
        name: 'utm_campaign',
        label: 'UTM Campaign',
        inputType: 'select',
        valueEditorType: 'select',
        optGroup: 'Attribution & Sources',
        values: [
          { name: '', label: 'Any/Unknown' },
          ...promotions.map(p => ({ name: p.id, label: `Promo: ${p.name}` }))
        ]
      },
      {
        name: 'audience_id',
        label: 'User is in Audience',
        inputType: 'select',
        valueEditorType: 'select',
        optGroup: 'Target Audiences',
        values: audiences.map(a => ({ name: a.id, label: a.name }))
      },
      {
        name: 'enrolled_promotion_ids',
        label: 'Enrolled in Promotion',
        inputType: 'select',
        valueEditorType: 'select',
        operators: [{ name: 'contains', label: 'is' }, { name: 'doesNotContain', label: 'is not' }],
        optGroup: 'CRM Health',
        values: promotions.map(p => ({ name: p.id, label: p.name }))
      },
      {
        name: 'enrolled_sequence_ids',
        label: 'Enrolled in Sequence',
        inputType: 'select',
        valueEditorType: 'select',
        operators: [{ name: 'contains', label: 'is' }, { name: 'doesNotContain', label: 'is not' }],
        optGroup: 'CRM Health',
        values: allSequences.map(s => ({ name: s.id, label: s.name }))
      }
    ]

    const groups: Record<string, { label: string; options: any[] }> = {}
    flatFields.forEach(f => {
      const gName = (f as any).optGroup || 'Other'
      if (!groups[gName]) groups[gName] = { label: gName, options: [] }
      groups[gName].options.push(f)
    })

    return Object.values(groups) as any
  }, [audiences, landingPages, promotions, allSequences])

  useEffect(() => {
    const fetchData = async () => {
      const [seqRes, dsRes, audRes, lpRes, promoRes, allSeqsRes] = await Promise.all([
        adminApi.select('crm_sequences', '*', { eq: { id: sequenceId } }),
        adminApi.select('crm_data_sources', 'id, name, rpc_name'),
        adminApi.select('crm_audiences', 'id, name, audience_rpc_name'),
        adminApi.select('crm_landing_pages', 'id, slug, title', { eq: { is_active: true } }),
        adminApi.select('crm_promotions', 'id, name, landing_page_id'),
        adminApi.select('crm_sequences', 'id, name')
      ])
      
      if (lpRes.data) setLandingPages(lpRes.data)
      if (promoRes.data) setPromotions(promoRes.data)
      if (allSeqsRes.data) setAllSequences(allSeqsRes.data)

      // Fetch send slot defaults
      const slotDefaultsRes = await adminApi.select('crm_send_slot_defaults', '*')
      if (slotDefaultsRes.data && slotDefaultsRes.data.length > 0) {
        setSendSlotDefaults(slotDefaultsRes.data[0])
      }
      
      if (seqRes.data && seqRes.data.length > 0) {
        setSequence(seqRes.data[0])
        setTriggerEvent(seqRes.data[0].trigger_event || '')
        setTestEmails((seqRes.data[0].test_emails || []).join(', '))
        setTestPhones((seqRes.data[0].test_phones || []).join(', '))
        setBackfillOnActivate(seqRes.data[0].backfill_on_activate || false)
        // Restore AI condition state from start node if applicable
        if (seqRes.data[0].trigger_event === 'ai_condition' && seqRes.data[0].definition?.nodes) {
          const startNode = seqRes.data[0].definition.nodes.find((n: any) => n.id === 'start')
          if (startNode?.data) {
            if (startNode.data.conditionPrompt) setAiConditionPrompt(startNode.data.conditionPrompt)
            if (startNode.data.conditionSql) setAiConditionSql(startNode.data.conditionSql)
            if (startNode.data.conditionExplanation) setAiConditionExplanation(startNode.data.conditionExplanation)
          }
        }
        if (seqRes.data[0].definition?.nodes?.length > 0) {
          const safeNodes = seqRes.data[0].definition.nodes.map((n: any, idx: number) => {
            const nodeType = n.data?.type || n.type;
            let bgColor = 'white';
            let border = '1px solid #d1d5db';
            let color = '#374151';

            if (nodeType === 'action_email') { border = '2px solid #3b82f6'; }
            else if (nodeType === 'action_sms') { border = '2px solid #10b981'; }
            else if (nodeType === 'wait') { bgColor = '#fef3c7'; border = '1px solid #f59e0b'; }
            else if (nodeType === 'condition') { bgColor = '#e0e7ff'; border = '1px solid #6366f1'; }
            else if (nodeType === 'wait_for_slot') { bgColor = '#fdf4ff'; border = '2px solid #a855f7'; }
            else if (nodeType === 'fork') { bgColor = '#f0fdf4'; border = '2px solid #22c55e'; }
            else if (nodeType === 'join') { bgColor = '#f0fdf4'; border = '2px solid #16a34a'; }

            let label: React.ReactNode;
            if (n.id === 'start' || nodeType === 'input') {
              label = getTriggerLabel(seqRes.data[0].trigger_event || '', n.data.audienceId, audRes.data || []);
              bgColor = '#10b981';
              color = 'white';
              border = 'none';
            } else {
              label = buildNodeLabel(nodeType, n.data, queryBuilderFields);
            }

            return {
              ...n,
              type: n.id === 'start' ? 'input' : 'default',
              position: n.position || { x: 250, y: 150 + (idx * 100) },
              data: {
                ...n.data,
                type: nodeType,
                label
              },
              style: n.style || { background: bgColor, color, border, borderRadius: '8px', padding: '10px', fontWeight: (n.id === 'start' ? 'bold' : 'normal') }
            };
          });
          setNodes(safeNodes)
          if (seqRes.data[0].definition?.edges) {
            setEdges(seqRes.data[0].definition.edges)
          }
        } else {
          // Brand new sequence, ensure initial nodes reflect the correct trigger
          setNodes(nds => nds.map(n => {
            if (n.id === 'start') {
              return { ...n, data: { ...n.data, label: getTriggerLabel(seqRes.data[0].trigger_event || '', n.data.audienceId as string, audRes.data || []) } }
            }
            return n
          }))
        }
      }
      if (dsRes.data) setDataSources(dsRes.data)
      if (audRes.data) setAudiences(audRes.data)
      
      setLoading(false)
    }
    fetchData()
  }, [sequenceId, setNodes, setEdges])

  const onConnect = useCallback(
    (params: Connection | Edge) => {
      setEdges((eds) => {
        let label: string | undefined = undefined;
        
        // If connecting FROM a condition node, label the edges as True/False
        const sourceNode = nodes.find(n => n.id === params.source);
        if (sourceNode?.data?.type === 'terminal') {
          return eds; // Terminal nodes cannot have outbound links
        }
        if (sourceNode?.data?.type === 'condition') {
          const existingOutboundEdges = eds.filter(e => e.source === params.source);
          if (existingOutboundEdges.length === 0) {
            label = 'true';
          } else if (existingOutboundEdges.length === 1) {
            label = existingOutboundEdges[0].label === 'true' ? 'false' : 'true';
          } else {
            // Can't have more than 2 edges from a condition
            return eds;
          }
        }

        // Fork nodes: allow exactly 2 outbound edges (like condition but without labels)
        if (sourceNode?.data?.type === 'fork') {
          const existingOutboundEdges = eds.filter(e => e.source === params.source);
          if (existingOutboundEdges.length >= 2) {
            return eds; // Can't have more than 2 edges from a fork
          }
        }
        
        return addEdge({ 
          ...params, 
          type: 'smoothstep', 
          markerEnd: { type: MarkerType.ArrowClosed },
          label,
          labelStyle: { fill: '#374151', fontWeight: 700, fontSize: 12 },
          labelBgStyle: { fill: 'white', stroke: '#e5e7eb', strokeWidth: 1, rx: 4, ry: 4 },
          labelBgPadding: [4, 4]
        } as any, eds);
      })
    },
    [setEdges, nodes],
  )

  const onEdgeDoubleClick = useCallback((event: React.MouseEvent, edge: Edge) => {
    if (isCanvasLocked) return;
    const sourceNode = nodes.find(n => n.id === edge.source);
    if (sourceNode?.data?.type === 'condition') {
      setEdges(eds => eds.map(e => {
        if (e.id === edge.id) {
          const newLabel = e.label === 'true' ? 'false' : 'true';
          return { ...e, label: newLabel };
        }
        return e;
      }));
    }
  }, [isCanvasLocked, nodes, setEdges]);

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()

      const type = event.dataTransfer.getData('application/reactflow')
      if (typeof type === 'undefined' || !type) return
      if (!reactFlowInstance) return

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })
      
      let bgColor = 'white'
      let border = '1px solid #d1d5db'
      
      if (type === 'action_email') { border = '2px solid #3b82f6' }
      if (type === 'action_sms') { border = '2px solid #10b981' }
      if (type === 'wait') { bgColor = '#fef3c7'; border = '1px solid #f59e0b' }
      if (type === 'condition') { bgColor = '#e0e7ff'; border = '1px solid #6366f1' }
      if (type === 'wait_for_slot') { bgColor = '#fdf4ff'; border = '2px solid #a855f7' }
      if (type === 'fork') { bgColor = '#f0fdf4'; border = '2px solid #22c55e' }
      if (type === 'join') { bgColor = '#f0fdf4'; border = '2px solid #16a34a' }
      if (type === 'terminal') { bgColor = '#fee2e2'; border = '2px solid #ef4444' }

      const nodeData: any = { 
        type, 
        subject: '', html: '', text: '', // for actions
        delayDays: 0, delayHours: 0, delayMinutes: 0, // for wait
        query: initialQuery, // for condition
        slots: type === 'wait_for_slot' ? (sendSlotDefaults?.email_slots || []) : undefined, // for wait_for_slot
        slotPreset: type === 'wait_for_slot' ? 'email' : undefined
      }
      nodeData.label = buildNodeLabel(type, nodeData)

      const newNode: Node = {
        id: `${type}_${Date.now()}`,
        type: 'default',
        position,
        data: nodeData,
        style: { background: bgColor, border, borderRadius: '8px', padding: '10px' }
      }

      setNodes((nds) => nds.concat(newNode))
    },
    [reactFlowInstance, setNodes, sendSlotDefaults],
  )

  const runSimulation = async () => {
    try {
      setDryRunLoading(true)
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/dry-run-sequence`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
          },
          body: JSON.stringify({ sequence_id: sequenceId }),
        }
      )
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Simulation failed')
      
      setDryRunResults(data.nodes || {})
      setIsSimulationMode(true)
      
      setNodes(nds => nds.map(n => {
        const countData = data.nodes?.[n.id];
        const count = countData ? countData.count : 0;
        
        const newData = { ...n.data, dryRunCount: count } as any;
        const flatFields = queryFields.flatMap((g: any) => g.options)
        if (n.id !== 'start') {
          newData.label = buildNodeLabel(n.data.type as string, newData, flatFields)
        } else {
          const baseLabel = getTriggerLabel(triggerEvent, n.data.audienceId as string, audiences)
          newData.label = React.createElement('div', { style: { position: 'relative' } },
            React.createElement('div', {
              style: {
                position: 'absolute',
                top: -24,
                right: -10,
                background: '#10b981',
                color: 'white',
                fontSize: '0.7rem',
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: '10px',
                boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
                zIndex: 10
              }
            }, `${count} reached`),
            React.createElement('div', null, baseLabel)
          )
        }
        return { ...n, data: newData }
      }))
      
      setToastMsg('Simulation complete! Distribution counts are visible on all nodes.')
      setTimeout(() => setToastMsg(''), 4000)
    } catch (err: any) {
      setErrorMsg(`Simulation failed: ${err.message}`)
      setTimeout(() => setErrorMsg(''), 4000)
    } finally {
      setDryRunLoading(false)
    }
  }

  const clearSimulation = () => {
    setIsSimulationMode(false)
    setDryRunResults(null)
    setNodes(nds => nds.map(n => {
      const cleanData = { ...n.data } as any;
      delete cleanData.dryRunCount;
      if (n.id !== 'start') {
        const flatFields = queryFields.flatMap((g: any) => g.options)
        cleanData.label = buildNodeLabel(n.data.type as string, cleanData, flatFields)
      } else {
        cleanData.label = getTriggerLabel(triggerEvent, n.data.audienceId as string, audiences)
      }
      return { ...n, data: cleanData }
    }))
    setSelectedNode(null)
  }

  const exportToCSV = (nodeId: string, nodeLabel: string, recipients: any[]) => {
    if (!recipients || recipients.length === 0) return
    const headers = ['Recipient ID', 'Name', 'Email', 'Phone', 'Type']
    const rows = recipients.map(r => [
      r.id,
      r.name,
      r.email || '',
      r.phone || '',
      r.recipient_type
    ])
    
    const csvContent = [
      headers.join(','),
      ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
    ].join('\n')
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.setAttribute('href', url)
    const sanitizedLabel = nodeLabel.toLowerCase().replace(/[^a-z0-9]+/g, '_')
    link.setAttribute('download', `dry_run_${sanitizedLabel}_recipients.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const handleNodeClick = (event: React.MouseEvent, node: Node) => {
    setSelectedNode(node)
    setUserLabel((node.data.userLabel as string) || '')
    
    if (node.data.type === 'action_email' || node.data.type === 'action_sms') {
      setEditorForm({
        name: '',
        channel: node.data.type === 'action_email' ? 'email' : 'sms',
        subject: (node.data.subject as string) || '',
        content_html: (node.data.html as string) || '',
        content_text: (node.data.text as string) || '',
        postmark_template_alias: (node.data.postmark_template_alias as string) || '',
        test_emails: '',
        data_source_id: (node.data.data_source_id as string) || ''
      })
      setTemplateMode(!!node.data.postmark_template_alias)
    } else if (node.data.type === 'wait') {
      setWaitConfig({ 
        days: String(node.data.delayDays ?? 0), 
        hours: String(node.data.delayHours ?? 0),
        minutes: String(node.data.delayMinutes ?? 0)
      })
    } else if (node.data.type === 'condition') {
      setConditionConfig({ query: (node.data.query as any) || initialQuery })
      if (node.data.conditionMode === 'ai') {
        setConditionNodeMode('ai')
        setConditionAiPrompt((node.data.aiPrompt as string) || '')
        setConditionAiSql((node.data.aiSql as string) || '')
        setConditionAiExplanation((node.data.aiExplanation as string) || '')
      } else {
        setConditionNodeMode('rules')
        setConditionAiPrompt('')
        setConditionAiSql('')
        setConditionAiExplanation('')
      }
    } else if (node.data.type === 'wait_for_slot') {
      setSlotConfig({
        slots: (node.data.slots as any[]) || [],
        preset: (node.data.slotPreset as string) || 'email'
      })
    }
  }

  const handlePaneClick = () => {
    setSelectedNode(null)
  }

  const saveSelectedNode = async () => {
    if (!selectedNode) return

    let finalNodes = [...nodes]

    finalNodes = finalNodes.map(n => {
      if (n.id === selectedNode.id) {
        let newData = { ...n.data }
        
        if (n.data.type === 'action_email' || n.data.type === 'action_sms') {
          newData.subject = templateMode ? null : editorForm.subject
          newData.html = templateMode ? null : editorForm.content_html
          newData.text = editorForm.content_text
          newData.postmark_template_alias = templateMode ? editorForm.postmark_template_alias : null
          newData.data_source_id = editorForm.data_source_id || null
        } else if (n.data.type === 'wait') {
          const d = parseInt(waitConfig.days) || 0;
          const h = parseInt(waitConfig.hours) || 0;
          const m = parseInt(waitConfig.minutes) || 0;
          newData.delayDays = d;
          newData.delayHours = h;
          newData.delayMinutes = m;
        } else if (n.data.type === 'condition') {
          if (conditionNodeMode === 'ai') {
            newData.conditionMode = 'ai'
            newData.aiPrompt = conditionAiPrompt
            newData.aiSql = conditionAiSql
            newData.aiExplanation = conditionAiExplanation
          } else {
            newData.conditionMode = 'rules'
            newData.query = conditionConfig.query
          }
        } else if (n.data.type === 'wait_for_slot') {
          newData.slots = slotConfig.slots;
          newData.slotPreset = slotConfig.preset;
        } else if (n.id === 'start') {
          newData.label = getTriggerLabel(triggerEvent, n.data.audienceId as string, audiences)
        }

        // Persist userLabel and rebuild rich label for non-start nodes
        if (n.id !== 'start') {
          newData.userLabel = userLabel || n.data.userLabel || ''
          const flatFields = queryFields.flatMap((g: any) => g.options)
          newData.label = buildNodeLabel(n.data.type as string, newData, flatFields)
        }
        
        return { ...n, data: newData }
      }
      return n
    })
    
    setNodes(finalNodes)
    
    // Auto-save to database
    setToastMsg('Saving configuration...')
    const dbNodes = finalNodes.map(n => {
      const { style, ...rest } = n
      const cleanData = { ...rest.data }
      delete cleanData.label
      return { ...rest, data: cleanData }
    })

    const definition = {
      nodes: dbNodes,
      edges,
      startNodeId: 'start'
    }
    
    const parsedEmails = testEmails.split(',').map(e => e.trim()).filter(Boolean)
    const parsedPhones = testPhones.split(',').map(p => p.trim()).filter(Boolean)

    await adminApi.update('crm_sequences', { 
      definition, 
      trigger_event: triggerEvent || null,
      test_emails: parsedEmails,
      test_phones: parsedPhones,
      backfill_on_activate: backfillOnActivate
    }, { eq: { id: sequenceId } })

    setToastMsg('Node saved locally and auto-saved to database draft.')
    setTimeout(() => setToastMsg(''), 3000)
  }

  const handleSaveSequence = async () => {
    setSaving(true)
    
    // Strip UI-specific elements (style, labels) before persisting to database
    // This ensures styles are always derived from node types dynamically, preventing stale DB states.
    const dbNodes = nodes.map(n => {
      const { style, ...rest } = n
      const cleanData = { ...rest.data }
      delete cleanData.label
      return { ...rest, data: cleanData }
    })

    const definition = {
      nodes: dbNodes,
      edges,
      startNodeId: 'start'
    }
    
    const parsedEmails = testEmails.split(',').map(e => e.trim()).filter(Boolean)
    const parsedPhones = testPhones.split(',').map(p => p.trim()).filter(Boolean)

    const { error } = await adminApi.update('crm_sequences', { 
      name: sequence.name, 
      definition, 
      trigger_event: triggerEvent || null,
      test_emails: parsedEmails,
      test_phones: parsedPhones,
      backfill_on_activate: backfillOnActivate
    }, { eq: { id: sequenceId } })
    setSaving(false)
    if (error) {
      setErrorMsg(`Error saving: ${error}`)
      setTimeout(() => setErrorMsg(''), 5000)
    } else {
      setToastMsg('Sequence saved successfully.')
      setTimeout(() => setToastMsg(''), 3000)
    }
  }
  
  const handleActivate = async () => {
    if (!confirm('Are you sure you want to activate this sequence? Structural changes (adding/removing nodes) will be locked.')) return
    
    setSaving(true)
    const { error } = await adminApi.update('crm_sequences', { status: 'active' }, { eq: { id: sequenceId } })
    setSaving(false)
    if (error) {
      setErrorMsg(`Error activating: ${error}`)
      setTimeout(() => setErrorMsg(''), 5000)
    } else {
      setSequence({ ...sequence, status: 'active' })
      setToastMsg('Sequence activated!')
      setTimeout(() => setToastMsg(''), 3000)

      // Trigger backfill if checkbox was checked
      if (backfillOnActivate && triggerEvent && triggerEvent !== '' && triggerEvent !== 'ai_condition') {
        try {
          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
          const { data: sessionData } = await supabase.auth.getSession()
          const token = sessionData?.session?.access_token
          await fetch(`${supabaseUrl}/functions/v1/enroll-in-sequence`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ sequence_id: sequenceId, backfill: true })
          })
          setToastMsg('Sequence activated and backfill started!')
        } catch (err) {
          console.error('Backfill error:', err)
          setToastMsg('Sequence activated! (Backfill may have failed)')
        }
      }
    }
  }

  const handleDeactivate = async () => {
    if (!confirm('Are you sure you want to deactivate this sequence? Modifying structural logic may break users currently progressing through this campaign.')) return
    
    setSaving(true)
    const { error } = await adminApi.update('crm_sequences', { status: 'draft' }, { eq: { id: sequenceId } })
    setSaving(false)
    if (error) {
      setErrorMsg(`Error deactivating: ${error}`)
      setTimeout(() => setErrorMsg(''), 5000)
    } else {
      setSequence({ ...sequence, status: 'draft' })
      setToastMsg('Sequence deactivated to draft state.')
      setTimeout(() => setToastMsg(''), 3000)
    }
  }

  const handleTriggerTest = async () => {
    const emails = testEmails.split(',').map(e => e.trim()).filter(Boolean)
    const phones = testPhones.split(',').map(p => p.trim()).filter(Boolean)
    if (emails.length === 0 && phones.length === 0) {
      alert('Please enter at least one test email or phone number.')
      return
    }

    setTesting(true)
    setToastMsg('Saving test contacts...')
    try {
      await adminApi.update('crm_sequences', { 
        test_emails: emails,
        test_phones: phones
      }, { eq: { id: sequenceId } })

      setToastMsg('Preparing test leads...')
      const recipients: { recipient_type: 'lead', recipient_id: string }[] = []

      for (const email of emails) {
        const { data: existingLeads } = await supabase.from('crm_leads').select('id').eq('email', email)
        let leadId = existingLeads?.[0]?.id
        if (leadId) {
          await supabase.from('crm_leads').update({ accepts_email: true, accepts_sms: true }).eq('id', leadId)
        } else {
          const { data: newLead, error: insertError } = await supabase.from('crm_leads').insert({
            name: `Test Lead (${email})`,
            email: email,
            accepts_email: true,
            accepts_sms: true,
            metadata: { is_test: true }
          }).select('id').single()
          if (insertError) throw new Error(`Failed to create lead for ${email}: ${insertError.message}`)
          leadId = newLead.id
        }
        recipients.push({ recipient_type: 'lead', recipient_id: leadId })
      }

      for (const phone of phones) {
        const { data: existingLeads } = await supabase.from('crm_leads').select('id').eq('phone', phone)
        let leadId = existingLeads?.[0]?.id
        if (leadId) {
          await supabase.from('crm_leads').update({ accepts_email: true, accepts_sms: true }).eq('id', leadId)
        } else {
          const { data: newLead, error: insertError } = await supabase.from('crm_leads').insert({
            name: `Test Lead (${phone})`,
            phone: phone,
            accepts_email: true,
            accepts_sms: true,
            metadata: { is_test: true }
          }).select('id').single()
          if (insertError) throw new Error(`Failed to create lead for ${phone}: ${insertError.message}`)
          leadId = newLead.id
        }
        recipients.push({ recipient_type: 'lead', recipient_id: leadId })
      }

      setToastMsg('Enrolling test leads...')
      const enrollRes = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/enroll-in-sequence`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
          },
          body: JSON.stringify({ sequence_id: sequenceId, recipients, reset: true, is_test: true }),
          signal: AbortSignal.timeout(60000),
        }
      )
      const enrollData = await enrollRes.json()
      if (!enrollRes.ok) {
        throw new Error(enrollData.error || 'Failed to enroll leads')
      }

      setToastMsg('Executing sequence step...')
      const processRes = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/process-sequence-step`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
          },
          body: JSON.stringify({ sequence_id: sequenceId, is_test: true }),
          signal: AbortSignal.timeout(120000),
        }
      )
      const processData = await processRes.json()
      if (!processRes.ok) {
        throw new Error(processData.error || 'Failed to process sequence step')
      }

      setToastMsg('✅ Test run triggered successfully!')
      setTimeout(() => setToastMsg(''), 4000)
    } catch (err: any) {
      const msg = err.name === 'TimeoutError' 
        ? 'Request timed out — the sequence may still be processing. Check your inbox in a few minutes.'
        : (err.message || 'An error occurred during testing')
      setErrorMsg(msg)
      setTimeout(() => setErrorMsg(''), 8000)
    } finally {
      setTesting(false)
    }
  }

  // Send ALL messages in the drip sequence at once (skipping wait delays)
  const handleTestRunAll = async () => {
    const emails = testEmails.split(',').map(e => e.trim()).filter(Boolean)
    const phones = testPhones.split(',').map(p => p.trim()).filter(Boolean)
    if (emails.length === 0 && phones.length === 0) {
      alert('Please enter at least one test email or phone number.')
      return
    }

    setTesting(true)
    setToastMsg('Saving test contacts...')
    try {
      await adminApi.update('crm_sequences', { 
        test_emails: emails,
        test_phones: phones
      }, { eq: { id: sequenceId } })

      setToastMsg('Preparing test leads...')
      const recipients: { recipient_type: 'lead', recipient_id: string }[] = []

      for (const email of emails) {
        const { data: existingLeads } = await supabase.from('crm_leads').select('id').eq('email', email)
        let leadId = existingLeads?.[0]?.id
        if (leadId) {
          await supabase.from('crm_leads').update({ accepts_email: true, accepts_sms: true }).eq('id', leadId)
        } else {
          const { data: newLead, error: insertError } = await supabase.from('crm_leads').insert({
            name: `Test Lead (${email})`,
            email: email,
            accepts_email: true,
            accepts_sms: true,
            metadata: { is_test: true }
          }).select('id').single()
          if (insertError) throw new Error(`Failed to create lead for ${email}: ${insertError.message}`)
          leadId = newLead.id
        }
        recipients.push({ recipient_type: 'lead', recipient_id: leadId })
      }

      for (const phone of phones) {
        const { data: existingLeads } = await supabase.from('crm_leads').select('id').eq('phone', phone)
        let leadId = existingLeads?.[0]?.id
        if (leadId) {
          await supabase.from('crm_leads').update({ accepts_email: true, accepts_sms: true }).eq('id', leadId)
        } else {
          const { data: newLead, error: insertError } = await supabase.from('crm_leads').insert({
            name: `Test Lead (${phone})`,
            phone: phone,
            accepts_email: true,
            accepts_sms: true,
            metadata: { is_test: true }
          }).select('id').single()
          if (insertError) throw new Error(`Failed to create lead for ${phone}: ${insertError.message}`)
          leadId = newLead.id
        }
        recipients.push({ recipient_type: 'lead', recipient_id: leadId })
      }

      setToastMsg('Enrolling test leads...')
      const enrollRes = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/enroll-in-sequence`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
          },
          body: JSON.stringify({ sequence_id: sequenceId, recipients, reset: true, is_test: true }),
          signal: AbortSignal.timeout(60000),
        }
      )
      const enrollData = await enrollRes.json()
      if (!enrollRes.ok) {
        throw new Error(enrollData.error || 'Failed to enroll leads')
      }

      setToastMsg('📨 Sending all test messages (this may take a few minutes for large sequences)...')
      // Fire-and-forget: don't await the response. The edge function will
      // process all nodes and send messages in the background.
      fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/process-sequence-step`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
          },
          body: JSON.stringify({ sequence_id: sequenceId, test_run_all: true, is_test: true }),
        }
      ).catch(() => {}) // Silently ignore any network errors — messages are already being sent

      setToastMsg('✅ Test run triggered! Messages will arrive in your inbox over the next few minutes.')
      setTimeout(() => setToastMsg(''), 8000)
    } catch (err: any) {
      const msg = err.name === 'TimeoutError' 
        ? 'Request timed out — the sequence may still be processing. Check your inbox in a few minutes.'
        : (err.message || 'An error occurred during testing')
      setErrorMsg(msg)
      setTimeout(() => setErrorMsg(''), 8000)
    } finally {
      setTesting(false)
    }
  }


  const toast = (msg: string) => {
    console.log(msg)
  }

  if (loading) return <div style={{ padding: 24 }}>Loading builder...</div>
  if (!sequence) return <div style={{ padding: 24 }}>Sequence not found.</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)' }}>
      <style>{`
        .queryBuilder .rule {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }
        .queryBuilder .rule select, .queryBuilder .rule input {
          flex: 1;
          min-width: 120px;
          max-width: 100%;
        }
      `}</style>
      {/* HEADER */}
      <div style={{ padding: '16px 24px', background: 'white', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <button onClick={() => router.push('/crm/sequences')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: '0.9rem', marginBottom: 4 }}>← Back to Sequences</button>
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <input 
              value={sequence.name || ''} 
              onChange={e => setSequence({ ...sequence, name: e.target.value })}
              style={{ margin: 0, fontSize: '1.4rem', fontWeight: 'bold', border: 'none', background: 'transparent', outline: 'none', width: 'auto', minWidth: '350px', borderBottom: '1px dashed #d1d5db', padding: '0 0 2px 0' }}
              placeholder="Sequence Name"
            />
            <span style={{ fontSize: '0.8rem', padding: '2px 8px', borderRadius: 12, background: isLocked ? '#dcfce7' : '#f3f4f6', color: isLocked ? '#166534' : '#374151', marginLeft: 12, verticalAlign: 'middle' }}>{sequence.status.toUpperCase()}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          {isSimulationMode ? (
            <button onClick={clearSimulation} style={{ padding: '8px 16px', background: '#be123c', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>
              Exit Simulation
            </button>
          ) : (
            <button 
              onClick={runSimulation} 
              disabled={dryRunLoading} 
              style={{ 
                padding: '8px 16px', 
                background: '#4f46e5', 
                color: 'white', 
                border: 'none', 
                borderRadius: 6, 
                fontWeight: 600, 
                cursor: dryRunLoading ? 'not-allowed' : 'pointer',
                opacity: dryRunLoading ? 0.7 : 1
              }}
            >
              {dryRunLoading ? 'Simulating...' : '🔍 Dry Run'}
            </button>
          )}
          {isLocked ? (
            <>
              <button disabled style={{ padding: '8px 16px', background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0', borderRadius: 6, fontWeight: 600 }}>Active - Structural Edits Locked</button>
              <button onClick={handleDeactivate} style={{ padding: '8px 16px', background: '#fff1f2', color: '#be123c', border: '1px solid #fecdd3', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>Deactivate</button>
            </>
          ) : (
            <button onClick={handleActivate} disabled={isSimulationMode} style={{ padding: '8px 16px', background: '#10b981', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, cursor: isSimulationMode ? 'not-allowed' : 'pointer', opacity: isSimulationMode ? 0.5 : 1 }}>Activate Sequence</button>
          )}
          <button onClick={handleSaveSequence} disabled={saving || isSimulationMode} style={{ padding: '8px 16px', background: '#1a2e1a', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, cursor: isSimulationMode ? 'not-allowed' : 'pointer', opacity: isSimulationMode ? 0.5 : 1 }}>
            {saving ? 'Saving...' : 'Save Sequence'}
          </button>
        </div>
      </div>

      {/* INLINE TOASTS / ERRORS */}
      {(toastMsg || errorMsg) && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, padding: '16px 24px',
          background: errorMsg ? '#fef2f2' : '#dcfce7', color: errorMsg ? '#b91c1c' : '#166534',
          borderRadius: 8, boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)',
          zIndex: 9999, fontWeight: 500,
          border: `1px solid ${errorMsg ? '#f87171' : '#bbf7d0'}`
        }}>
          {errorMsg || toastMsg}
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* LEFT SIDEBAR (Palette) */}
        {!isCanvasLocked && (
          <div style={{ width: 250, background: '#f9fafb', borderRight: '1px solid #e5e7eb', padding: '20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '1rem', color: '#374151' }}>Node Types</h3>
            <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: '0 0 16px 0' }}>Drag nodes onto the canvas.</p>
            
            <div draggable onDragStart={(e) => e.dataTransfer.setData('application/reactflow', 'action_email')} style={{ padding: '12px', background: 'white', border: '1px solid #d1d5db', borderRadius: 8, cursor: 'grab', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
              ✉️ Send Email
            </div>
            <div draggable onDragStart={(e) => e.dataTransfer.setData('application/reactflow', 'action_sms')} style={{ padding: '12px', background: 'white', border: '1px solid #d1d5db', borderRadius: 8, cursor: 'grab', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
              💬 Send SMS
            </div>
            <div draggable onDragStart={(e) => e.dataTransfer.setData('application/reactflow', 'wait')} style={{ padding: '12px', background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 8, cursor: 'grab', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
              ⏳ Wait Delay
            </div>
            <div draggable onDragStart={(e) => e.dataTransfer.setData('application/reactflow', 'condition')} style={{ padding: '12px', background: '#e0e7ff', border: '1px solid #6366f1', borderRadius: 8, cursor: 'grab', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
              🔀 Condition Split
            </div>
            <div draggable onDragStart={(e) => e.dataTransfer.setData('application/reactflow', 'wait_for_slot')} style={{ padding: '12px', background: '#fdf4ff', border: '2px solid #a855f7', borderRadius: 8, cursor: 'grab', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
              🕐 Wait for Optimal Slot
            </div>
            <div draggable onDragStart={(e) => e.dataTransfer.setData('application/reactflow', 'fork')} style={{ padding: '12px', background: '#f0fdf4', border: '2px solid #22c55e', borderRadius: 8, cursor: 'grab', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
              🔱 Fork (Parallel)
            </div>
            <div draggable onDragStart={(e) => e.dataTransfer.setData('application/reactflow', 'join')} style={{ padding: '12px', background: '#f0fdf4', border: '2px solid #16a34a', borderRadius: 8, cursor: 'grab', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
              🔗 Join (Wait for All)
            </div>
            <div draggable onDragStart={(e) => e.dataTransfer.setData('application/reactflow', 'terminal')} style={{ padding: '12px', background: '#fee2e2', border: '2px solid #ef4444', borderRadius: 8, cursor: 'grab', display: 'flex', alignItems: 'center', gap: 8, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
              🛑 Terminal (End)
            </div>
          </div>
        )}

        {/* CANVAS */}
        <div style={{ flex: 1, position: 'relative' }} ref={reactFlowWrapper}>
          <ReactFlowProvider>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={isCanvasLocked ? undefined : onNodesChange}
              onEdgesChange={isCanvasLocked ? undefined : onEdgesChange}
              onConnect={isCanvasLocked ? undefined : onConnect}
              onInit={setReactFlowInstance}
              onDrop={isCanvasLocked ? undefined : onDrop}
              onDragOver={isCanvasLocked ? undefined : onDragOver}
              onNodeClick={handleNodeClick}
              onPaneClick={handlePaneClick}
              onEdgeDoubleClick={isCanvasLocked ? undefined : onEdgeDoubleClick}
              nodesDraggable={!isCanvasLocked}
              elementsSelectable={true}
              fitView
            >
              <Controls />
              <Background color="#ccc" gap={16} />
            </ReactFlow>
          </ReactFlowProvider>
        </div>

        {/* RIGHT SIDEBAR (Config) */}
        {selectedNode && (
          <div style={{ width: 500, background: 'white', borderLeft: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f9fafb' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem' }}>Configure: {selectedNode.id === 'start' ? 'Trigger Event' : selectedNode.data.label as string}</h3>
              <button onClick={() => setSelectedNode(null)} style={{ background: 'none', border: 'none', fontSize: '1.2rem', cursor: 'pointer', color: '#6b7280' }}>×</button>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
              {isSimulationMode && (
                <div style={{ padding: '16px', background: '#ecfdf5', border: '1px solid #10b981', borderRadius: 8, marginBottom: 16 }}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: '0.95rem', color: '#065f46', display: 'flex', alignItems: 'center', gap: 6 }}>
                    🟢 Simulation Results
                  </h4>
                  <p style={{ fontSize: '0.85rem', color: '#047857', margin: '0 0 12px 0' }}>
                    Recipients reaching this node: <strong>{dryRunResults?.[selectedNode.id]?.count || 0}</strong>
                  </p>
                  
                  {dryRunResults?.[selectedNode.id]?.recipients && dryRunResults[selectedNode.id].recipients.length > 0 ? (
                    <>
                      <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #d1d5db', borderRadius: 6, marginBottom: 12, background: 'white' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
                          <thead>
                            <tr style={{ background: '#f3f4f6' }}>
                              <th style={{ padding: '6px 12px', borderBottom: '1px solid #e5e7eb' }}>Name</th>
                              <th style={{ padding: '6px 12px', borderBottom: '1px solid #e5e7eb' }}>Email/Phone</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dryRunResults[selectedNode.id].recipients.slice(0, 5).map((r: any, idx: number) => (
                              <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                <td style={{ padding: '6px 12px', fontWeight: 500 }}>{r.name}</td>
                                <td style={{ padding: '6px 12px', color: '#4b5563' }}>{r.email || r.phone || ''}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      
                      <button
                        onClick={() => exportToCSV(
                          selectedNode.id,
                          (selectedNode.data.userLabel as string) || (selectedNode.id === 'start' ? 'Start Trigger' : selectedNode.data.type as string),
                          dryRunResults[selectedNode.id].recipients
                        )}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          background: '#10b981',
                          color: 'white',
                          border: 'none',
                          borderRadius: 6,
                          fontSize: '0.85rem',
                          fontWeight: 600,
                          cursor: 'pointer'
                        }}
                      >
                        Export Recipients to CSV
                      </button>
                    </>
                  ) : (
                    <p style={{ fontSize: '0.8rem', color: '#065f46', fontStyle: 'italic', margin: 0 }}>
                      No recipients reached this node during the simulation.
                    </p>
                  )}
                </div>
              )}

              {/* Node Label — available for all non-start nodes */}
              {selectedNode.id !== 'start' && (
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: '#374151', marginBottom: 4 }}>Node Label <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span></label>
                  <input
                    type="text"
                    value={userLabel}
                    onChange={e => setUserLabel(e.target.value)}
                    placeholder="e.g. Welcome Email, Exclude inactive leads..."
                    disabled={isSidebarDisabled}
                    style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.85rem' }}
                  />
                  <p style={{ fontSize: '0.78rem', color: '#9ca3af', marginTop: 4, lineHeight: 1.4 }}>
                    Custom name shown on the node card. Leave blank for auto-generated labels.
                  </p>
                </div>
              )}

              {selectedNode.id === 'start' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div className="crm-field">
                    <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, color: '#374151' }}>Sequence Trigger Event</label>
                    <select 
                      value={triggerEvent} 
                      onChange={e => {
                        const val = e.target.value
                        setTriggerEvent(val)
                        setNodes(nds => nds.map(n => {
                          if (n.id === 'start') {
                            return { ...n, data: { ...n.data, triggerEvent: val, label: getTriggerLabel(val, n.data.audienceId as string, audiences) } }
                          }
                          return n
                        }))
                      }} 
                      style={{ padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db', width: '100%', fontSize: '0.95rem' }}
                      disabled={isLocked}
                    >
                      <option value="">Manual / Audience Snapshot</option>
                      <option value="lead.created">New Lead Created</option>
                      <option value="user.first_login">First Time Login</option>
                      <option value="market_orders.purchase_completed">Purchase Order Completed</option>
                      <option value="market_orders.sale_completed">Sale Order Completed</option>
                      <option value="ai_condition">🤖 AI Condition (describe in plain English)</option>
                    </select>
                    <p style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '8px', lineHeight: 1.5 }}>
                      Choose what automatically kicks off this sequence. If you want this sequence to only trigger from a specific Solo Campaign blast or an Audience Snapshot, choose Manual.
                    </p>
                    {triggerEvent && triggerEvent !== '' && triggerEvent !== 'ai_condition' && (
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: '0.85rem', color: '#374151', cursor: 'pointer' }}>
                        <input 
                          type="checkbox" 
                          checked={backfillOnActivate}
                          onChange={(e) => setBackfillOnActivate(e.target.checked)}
                          disabled={isLocked}
                          style={{ 
                            width: 16, 
                            height: 16, 
                            cursor: 'pointer',
                            accentColor: '#10b981',
                            appearance: 'checkbox',
                            WebkitAppearance: 'checkbox',
                            MozAppearance: 'checkbox'
                          }}
                        />
                        Backfill existing recipients on activation
                      </label>
                    )}
                  </div>
                  
                  {triggerEvent === '' && (
                    <div className="crm-field">
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, color: '#374151' }}>Target Audience Snapshot</label>
                      <select 
                        value={selectedNode.data.audienceId as string || ''} 
                        onChange={e => {
                          const newAudienceId = e.target.value;
                          setNodes(nds => nds.map(n => {
                            if (n.id === 'start') {
                              return { ...n, data: { ...n.data, audienceId: newAudienceId, label: getTriggerLabel(triggerEvent, newAudienceId, audiences) } }
                            }
                            return n
                          }))
                          setSelectedNode(prev => prev ? { ...prev, data: { ...prev.data, audienceId: newAudienceId } } : null)
                        }} 
                        style={{ padding: '10px', borderRadius: '6px', border: '1px solid #d1d5db', width: '100%', fontSize: '0.95rem' }}
                        disabled={isLocked}
                      >
                        <option value="">Select an audience...</option>
                        {audiences.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                        <option value="__ai_query__">🤖 AI Query — describe in plain English</option>
                      </select>
                      <p style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '8px', lineHeight: 1.5 }}>
                        Select the audience to enroll when this sequence is triggered manually, or use AI to describe a custom audience.
                      </p>
                      {selectedNode.data.audienceId === '__ai_query__' && (
                        <div style={{ marginTop: '12px' }}>
                          <AiQueryChat
                            compact
                            disabled={isLocked}
                            initialSql={selectedNode.data.snapshotAiSql as string || undefined}
                            initialExplanation={selectedNode.data.snapshotAiExplanation as string || undefined}
                            placeholder='Describe your snapshot audience… (e.g. "all leads that have not signed up for an account yet")'
                            onSqlChange={(sql) => {
                              setNodes(nds => nds.map(n => n.id === 'start' ? { ...n, data: { ...n.data, snapshotAiSql: sql } } : n))
                              setSelectedNode(prev => prev ? { ...prev, data: { ...prev.data, snapshotAiSql: sql } } : null)
                            }}
                            onExplanationChange={(expl) => {
                              setNodes(nds => nds.map(n => n.id === 'start' ? { ...n, data: { ...n.data, snapshotAiExplanation: expl } } : n))
                              setSelectedNode(prev => prev ? { ...prev, data: { ...prev.data, snapshotAiExplanation: expl } } : null)
                            }}
                          />
                        </div>
                      )}
                    </div>
                  )}

                  {triggerEvent === 'ai_condition' && (
                    <div className="crm-field">
                      <label style={{ display: 'block', marginBottom: '8px', fontWeight: 600, color: '#374151' }}>AI Enrollment Condition</label>
                      <p style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '12px', lineHeight: 1.5 }}>
                        Describe who should be enrolled. The AI will generate a SQL query that runs every 15 minutes to find new matches.
                      </p>
                      <AiQueryChat
                        compact
                        disabled={isLocked}
                        initialSql={aiConditionSql || undefined}
                        initialExplanation={aiConditionExplanation || undefined}
                        placeholder='e.g. "leads from California who signed up in the last 30 days and have not been contacted"'
                        onSqlChange={(sql) => {
                          setAiConditionSql(sql)
                          setNodes(nds => nds.map(n => {
                            if (n.id === 'start') {
                              return { ...n, data: { ...n.data, conditionSql: sql } }
                            }
                            return n
                          }))
                        }}
                        onExplanationChange={(expl) => {
                          setAiConditionExplanation(expl)
                          setNodes(nds => nds.map(n => {
                            if (n.id === 'start') {
                              return { ...n, data: { ...n.data, conditionExplanation: expl } }
                            }
                            return n
                          }))
                        }}
                      />
                    </div>
                  )}

                  {!isLocked && (
                    <button onClick={saveSelectedNode} style={{ padding: '10px', background: '#10b981', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', marginTop: 16 }}>Apply Trigger Configuration</button>
                  )}

                  {/* Test Sequence Card */}
                  <div style={{ borderTop: '1px solid #e5e7eb', marginTop: 20, paddingTop: 20 }}>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '0.95rem', fontWeight: 700, color: '#1f2937' }}>
                      🧪 Test Sequence
                    </h4>
                    
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 10, padding: 16 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#4b5563', marginBottom: 4 }}>
                          Test Email Addresses (comma-separated)
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. test@social.com, admin@test.com"
                          value={testEmails}
                          onChange={e => setTestEmails(e.target.value)}
                          style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid #d1d5db', width: '100%', fontSize: '0.88rem' }}
                        />
                      </div>

                      <div>
                        <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#4b5563', marginBottom: 4 }}>
                          Test Phone Numbers (comma-separated)
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. +15550100, +15550200"
                          value={testPhones}
                          onChange={e => setTestPhones(e.target.value)}
                          style={{ padding: '8px 10px', borderRadius: '6px', border: '1px solid #d1d5db', width: '100%', fontSize: '0.88rem' }}
                        />
                      </div>

                      {sequence.status === 'active' || sequence.status === 'draft' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {sequence.status === 'draft' && (
                            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: 12, fontSize: '0.82rem', color: '#1e40af', lineHeight: 1.4, marginBottom: 4 }}>
                              ℹ️ <strong>Draft Mode</strong>: You can test the sequence structure and send messages to test contacts before activating.
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={handleTriggerTest}
                            disabled={testing}
                            style={{
                              padding: '10px',
                              background: '#4f46e5',
                              color: 'white',
                              border: 'none',
                              borderRadius: 6,
                              fontWeight: 600,
                              cursor: testing ? 'not-allowed' : 'pointer',
                              opacity: testing ? 0.7 : 1,
                              fontSize: '0.9rem',
                            }}
                          >
                            {testing ? 'Executing Test Run...' : '⚡ Test Next Step'}
                          </button>
                          <button
                            type="button"
                            onClick={handleTestRunAll}
                            disabled={testing}
                            style={{
                              padding: '10px',
                              background: 'linear-gradient(135deg, #059669, #10b981)',
                              color: 'white',
                              border: 'none',
                              borderRadius: 6,
                              fontWeight: 600,
                              cursor: testing ? 'not-allowed' : 'pointer',
                              opacity: testing ? 0.7 : 1,
                              fontSize: '0.9rem',
                            }}
                          >
                            {testing ? 'Sending All Messages...' : '📨 Send All Test Messages'}
                          </button>
                          <p style={{ margin: 0, fontSize: '0.75rem', color: '#6b7280', lineHeight: 1.4 }}>
                            <strong>Test Next Step</strong> processes one node at a time.<br />
                            <strong>Send All</strong> skips wait delays and sends every email &amp; SMS at once — check your inbox to verify the full drip before going live.
                          </p>
                        </div>
                      ) : (
                        <div style={{ background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 8, padding: 12, fontSize: '0.82rem', color: '#92400e', lineHeight: 1.4 }}>
                          ⚠️ <strong>Sequence is Archived</strong>. You cannot trigger a test run.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {(selectedNode.data.type === 'action_email' || selectedNode.data.type === 'action_sms') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <p style={{ fontSize: '0.9rem', color: '#4b5563', lineHeight: 1.5, margin: 0 }}>Configure the message content that will be sent when a user reaches this node.</p>
                  
                  {editorForm.subject && (
                    <div style={{ padding: 12, background: '#f3f4f6', borderRadius: 6, fontSize: '0.85rem', color: '#374151' }}>
                      <strong>Subject:</strong> {editorForm.subject}
                    </div>
                  )}
                  
                  <button 
                    onClick={() => setEmailModalOpen(true)} 
                    style={{ padding: '12px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    Open Message Editor Modal
                  </button>

                  {selectedNode.data.type === 'action_email' && testEmails.trim() && (
                    <button
                      disabled={testing}
                      onClick={async () => {
                        const emails = testEmails.split(',').map(e => e.trim()).filter(Boolean)
                        if (emails.length === 0) { alert('Add test email addresses first.'); return }
                        if (!editorForm.subject || !editorForm.content_html) { alert('This node has no email content yet. Open the editor and add content first.'); return }
                        setTesting(true)
                        setToastMsg(`Sending test email for "${selectedNode.data.label || 'this node'}"...`)
                        try {
                          // Send each test email via the admin API route
                          for (const email of emails) {
                            const res = await fetch('/api/crm/send-test-email', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                to: email,
                                subject: `[TEST] ${editorForm.subject}`,
                                html_body: editorForm.content_html,
                                text_body: editorForm.content_text || '',
                              }),
                            })
                            if (!res.ok) {
                              const data = await res.json().catch(() => ({}))
                              throw new Error(data.error || `Failed sending to ${email} (${res.status})`)
                            }
                          }
                          setToastMsg(`✅ Test email sent to ${emails.join(', ')}`)
                          setTimeout(() => setToastMsg(''), 5000)
                        } catch (err: any) {
                          setErrorMsg(err.message || 'Failed to send test email')
                          setTimeout(() => setErrorMsg(''), 5000)
                        } finally {
                          setTesting(false)
                        }
                      }}
                      style={{ padding: '10px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                    >
                      📧 Send Test Email to {testEmails.split(',').filter(e => e.trim()).length} recipient(s)
                    </button>
                  )}
                  
                  {!isLocked && (
                    <button onClick={saveSelectedNode} style={{ padding: '10px', background: '#10b981', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', marginTop: 16 }}>Save Node Configuration</button>
                  )}
                </div>
              )}

              {selectedNode.data.type === 'wait' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: 4 }}>Wait Days</label>
                    <input type="number" min="0" value={waitConfig.days} onChange={e => setWaitConfig(w => ({ ...w, days: e.target.value }))} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6 }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: 4 }}>Wait Hours</label>
                    <input type="number" min="0" max="23" value={waitConfig.hours} onChange={e => setWaitConfig(w => ({ ...w, hours: e.target.value }))} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6 }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: 4 }}>Wait Minutes</label>
                    <input type="number" min="0" max="59" value={waitConfig.minutes} onChange={e => setWaitConfig(w => ({ ...w, minutes: e.target.value }))} style={{ width: '100%', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6 }} />
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: 8 }}>
                    The sequence will pause for exactly this duration before proceeding to the next node.
                  </div>
                  {!isLocked && (
                    <button onClick={saveSelectedNode} style={{ padding: '10px', background: '#10b981', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', marginTop: 16 }}>Save Node Configuration</button>
                  )}
                </div>
              )}

              {selectedNode.data.type === 'condition' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Mode Toggle */}
                  <div style={{ display: 'flex', gap: 0, borderRadius: 8, overflow: 'hidden', border: '1px solid #d1d5db' }}>
                    <button
                      onClick={() => setConditionNodeMode('rules')}
                      style={{ flex: 1, padding: '8px 16px', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', background: conditionNodeMode === 'rules' ? '#3b82f6' : '#f9fafb', color: conditionNodeMode === 'rules' ? 'white' : '#374151' }}
                    >
                      📋 Rules
                    </button>
                    <button
                      onClick={() => setConditionNodeMode('ai')}
                      style={{ flex: 1, padding: '8px 16px', border: 'none', borderLeft: '1px solid #d1d5db', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem', background: conditionNodeMode === 'ai' ? '#7c3aed' : '#f9fafb', color: conditionNodeMode === 'ai' ? 'white' : '#374151' }}
                    >
                      🤖 AI
                    </button>
                  </div>

                  {conditionNodeMode === 'rules' && (
                    <div>
                      <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: 4 }}>Condition Logic</label>
                      <div style={{ border: '1px solid #d1d5db', borderRadius: 6, padding: '12px', background: 'white' }}>
                        <QueryBuilder 
                          key={selectedNode.id}
                          fields={queryFields} 
                          defaultQuery={conditionConfig.query as any} 
                          onQueryChange={(q) => setConditionConfig({ query: q })} 
                        />
                      </div>
                      <div style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: 8 }}>
                        The system will evaluate this logic against the user's CRM metadata. If true, they go down the "true" path. Make sure to connect "true" and "false" edges.
                      </div>
                    </div>
                  )}

                  {conditionNodeMode === 'ai' && (
                    <div className="crm-field">
                      <p style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '12px', lineHeight: 1.5 }}>
                        Describe the condition in plain English. The AI will generate a SQL query to check if each recipient matches.
                      </p>
                      <AiQueryChat
                        compact
                        disabled={isLocked}
                        initialSql={conditionAiSql || undefined}
                        initialExplanation={conditionAiExplanation || undefined}
                        placeholder='e.g. "leads from California who signed up in the last 30 days"'
                        contextHint="This is a condition branch in a drip campaign sequence. Generate a query that returns the users/leads matching the described condition. The system will check if the current recipient appears in the results to route them to the TRUE or FALSE branch."
                        examplePrompts={[
                          { label: 'Leads without accounts', prompt: 'All leads that have not signed up for an account yet' },
                          { label: 'Facebook leads', prompt: 'Leads that came from Facebook ads' },
                          { label: 'Active buyers', prompt: 'Users who have purchased something in the last 30 days' },
                        ]}
                        onSqlChange={(sql) => setConditionAiSql(sql)}
                        onExplanationChange={(expl) => setConditionAiExplanation(expl)}
                      />
                    </div>
                  )}
                </div>
              )}

              {selectedNode.data.type === 'wait_for_slot' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <p style={{ fontSize: '0.9rem', color: '#4b5563', lineHeight: 1.5, margin: 0 }}>
                    Configure time windows when messages should be sent. The sequence will wait until the next matching slot before proceeding.
                  </p>

                  {/* Preset selector */}
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: 8 }}>Slot Preset</label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {['email', 'sms', 'custom'].map(preset => (
                        <button
                          key={preset}
                          onClick={() => {
                            setSlotConfig(prev => ({
                              ...prev,
                              preset,
                              slots: preset === 'email' ? (sendSlotDefaults?.email_slots || []) 
                                   : preset === 'sms' ? (sendSlotDefaults?.sms_slots || []) 
                                   : prev.slots
                            }))
                          }}
                          style={{
                            flex: 1, padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6,
                            cursor: 'pointer', fontWeight: 600, fontSize: '0.82rem',
                            background: slotConfig.preset === preset ? '#a855f7' : '#f9fafb',
                            color: slotConfig.preset === preset ? 'white' : '#374151'
                          }}
                        >
                          {preset === 'email' ? '📧 Email Default' : preset === 'sms' ? '💬 SMS Default' : '⚙️ Custom'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Slot list */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>Send Windows</label>
                    {slotConfig.slots.length === 0 ? (
                      <p style={{ fontSize: '0.82rem', color: '#9ca3af', fontStyle: 'italic' }}>No slots configured. Messages will send immediately.</p>
                    ) : (
                      <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                          <thead>
                            <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                              <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#4b5563' }}>Day</th>
                              <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#4b5563' }}>Start</th>
                              <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#4b5563' }}>End</th>
                              {slotConfig.preset === 'custom' && <th style={{ width: 40 }}></th>}
                            </tr>
                          </thead>
                          <tbody>
                            {slotConfig.slots.map((slot, idx) => {
                              const currentDay = slot.day || slot.days?.[0] || 'mon';
                              return (
                                <tr key={idx} style={{ borderBottom: '1px solid #f3f4f6' }}>
                                  <td style={{ padding: '6px 12px' }}>
                                    <select
                                      value={currentDay}
                                      onChange={(e) => {
                                        if (slotConfig.preset !== 'custom') return;
                                        setSlotConfig(prev => ({
                                          ...prev,
                                          slots: prev.slots.map((s, i) => i === idx ? { ...s, day: e.target.value, days: undefined } : s)
                                        }))
                                      }}
                                      disabled={slotConfig.preset !== 'custom'}
                                      style={{ width: '100%', padding: '6px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.85rem', background: 'white' }}
                                    >
                                      <option value="mon">Monday</option>
                                      <option value="tue">Tuesday</option>
                                      <option value="wed">Wednesday</option>
                                      <option value="thu">Thursday</option>
                                      <option value="fri">Friday</option>
                                      <option value="sat">Saturday</option>
                                      <option value="sun">Sunday</option>
                                    </select>
                                  </td>
                                  <td style={{ padding: '6px 12px' }}>
                                    <input
                                      type="time"
                                      value={slot.start}
                                      onChange={(e) => {
                                        if (slotConfig.preset !== 'custom') return;
                                        setSlotConfig(prev => ({
                                          ...prev,
                                          slots: prev.slots.map((s, i) => i === idx ? { ...s, start: e.target.value } : s)
                                        }))
                                      }}
                                      disabled={slotConfig.preset !== 'custom'}
                                      style={{ width: '100%', padding: '6px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.85rem' }}
                                    />
                                  </td>
                                  <td style={{ padding: '6px 12px' }}>
                                    <input
                                      type="time"
                                      value={slot.end}
                                      onChange={(e) => {
                                        if (slotConfig.preset !== 'custom') return;
                                        setSlotConfig(prev => ({
                                          ...prev,
                                          slots: prev.slots.map((s, i) => i === idx ? { ...s, end: e.target.value } : s)
                                        }))
                                      }}
                                      disabled={slotConfig.preset !== 'custom'}
                                      style={{ width: '100%', padding: '6px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: '0.85rem' }}
                                    />
                                  </td>
                                  {slotConfig.preset === 'custom' && (
                                    <td style={{ padding: '6px 12px', textAlign: 'center' }}>
                                      <button
                                        onClick={() => setSlotConfig(prev => ({ ...prev, slots: prev.slots.filter((_, i) => i !== idx) }))}
                                        style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1rem' }}
                                      >
                                        ✕
                                      </button>
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {slotConfig.preset === 'custom' && (
                      <button
                        onClick={() => setSlotConfig(prev => ({ ...prev, slots: [...prev.slots, { day: 'mon', start: '09:00', end: '17:00' }] }))}
                        style={{ padding: '8px', border: '2px dashed #d1d5db', borderRadius: 6, background: 'transparent', cursor: 'pointer', fontSize: '0.85rem', color: '#6b7280', marginTop: 4 }}
                      >
                        + Add Send Window
                      </button>
                    )}
                  </div>

                  {!isLocked && (
                    <button onClick={saveSelectedNode} style={{ padding: '10px', background: '#a855f7', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', marginTop: 8 }}>Save Slot Configuration</button>
                  )}
                </div>
              )}

              {selectedNode.data.type === 'fork' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ padding: 16, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8 }}>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '0.95rem', color: '#166534' }}>🔱 Fork (Parallel Execution)</h4>
                    <p style={{ fontSize: '0.85rem', color: '#4b5563', lineHeight: 1.6, margin: 0 }}>
                      A fork node splits the sequence into <strong>two parallel paths</strong>. Both outbound branches execute simultaneously for each recipient.
                    </p>
                    <ul style={{ fontSize: '0.82rem', color: '#4b5563', lineHeight: 1.6, margin: '8px 0 0 0', paddingLeft: 20 }}>
                      <li>Connect exactly 2 outbound edges</li>
                      <li>Both paths run in parallel</li>
                      <li>Use a <strong>Join</strong> node downstream to wait for both paths to complete</li>
                    </ul>
                  </div>
                </div>
              )}

              {selectedNode.data.type === 'join' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ padding: 16, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8 }}>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '0.95rem', color: '#14532d' }}>🔗 Join (Wait for All)</h4>
                    <p style={{ fontSize: '0.85rem', color: '#4b5563', lineHeight: 1.6, margin: 0 }}>
                      A join node waits for <strong>all inbound paths</strong> to complete before the sequence continues. Place this after a Fork node to synchronize parallel branches.
                    </p>
                    <ul style={{ fontSize: '0.82rem', color: '#4b5563', lineHeight: 1.6, margin: '8px 0 0 0', paddingLeft: 20 }}>
                      <li>Accepts multiple inbound edges</li>
                      <li>Waits until every inbound branch has reached this point</li>
                      <li>Then continues to the next node</li>
                    </ul>
                  </div>
                </div>
              )}

              {selectedNode.data.type === 'terminal' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ padding: 16, background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8 }}>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '0.95rem', color: '#991b1b' }}>🛑 Terminal (End of Sequence)</h4>
                    <p style={{ fontSize: '0.85rem', color: '#4b5563', lineHeight: 1.6, margin: 0 }}>
                      A terminal node marks the final step of a sequence flow branch.
                    </p>
                    <ul style={{ fontSize: '0.82rem', color: '#4b5563', lineHeight: 1.6, margin: '8px 0 0 0', paddingLeft: 20 }}>
                      <li>Marks the completion of this sequence path</li>
                      <li>Cannot have any outbound links/edges</li>
                      <li>Accepts inbound connections from other nodes</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
            
            <div style={{ padding: '16px 20px', borderTop: '1px solid #e5e7eb', background: '#f9fafb' }}>
              {isSimulationMode ? (
                <button onClick={clearSimulation} style={{ width: '100%', padding: '10px', background: '#be123c', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>
                  Exit Simulation Mode
                </button>
              ) : (
                <button onClick={saveSelectedNode} style={{ width: '100%', padding: '10px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>
                  Save Node configuration
                </button>
              )}
            </div>
          </div>
        )}
      </div>
      {/* MODALS */}
      {emailModalOpen && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '40px' }}>
          <div style={{ background: 'white', borderRadius: '12px', width: '100%', maxWidth: '1000px', height: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f9fafb' }}>
              <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Message Editor</h2>
              <button onClick={() => setEmailModalOpen(false)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#6b7280' }}>×</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
              <CampaignMessageEditor
                form={editorForm}
                setForm={setEditorForm}
                templateMode={templateMode}
                setTemplateMode={setTemplateMode}
                dataSources={dataSources}
                supabase={supabase}
                toast={toast}
                showChannelSelector={false}
                showTestAndDataFields={false}
                showDesignModeSelector={false}
              />

              {/* Tracking URL Builder — compact mode inside the drip step editor */}
              <TrackingUrlBuilder
                compact
                defaultMedium={editorForm.channel === 'email' ? 'email' : 'sms'}
                defaultCampaign={sequence?.name?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || ''}
                sequenceId={sequenceId}
                nodeId={selectedNode?.id}
              />
            </div>
            <div style={{ padding: '16px 24px', borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'flex-end', background: '#f9fafb' }}>
              <button onClick={() => { setEmailModalOpen(false); saveSelectedNode(); }} style={{ padding: '10px 24px', background: '#10b981', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>
                Done & Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
