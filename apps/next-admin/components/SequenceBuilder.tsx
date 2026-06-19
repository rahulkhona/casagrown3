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
  
  // Trust & Support
  { name: 'total_disputes_initiated', label: 'Disputes Initiated', inputType: 'number', valueEditorType: 'text', optGroup: 'Trust & Safety' },
  { name: 'total_escalations_created', label: 'Escalations Created', inputType: 'number', valueEditorType: 'text', optGroup: 'Trust & Safety' },
  
  // CRM Tracking
  { name: 'active_campaigns_enrolled', label: 'Active Campaigns', inputType: 'number', valueEditorType: 'text', optGroup: 'CRM Health' },
  { name: 'lifetime_campaigns_enrolled', label: 'Lifetime Campaigns', inputType: 'number', valueEditorType: 'text', optGroup: 'CRM Health' },
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
    default: return 'Start: Manual / Snapshot';
  }
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
  const isLocked = sequence?.status === 'active'

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
      
      if (seqRes.data && seqRes.data.length > 0) {
        setSequence(seqRes.data[0])
        setTriggerEvent(seqRes.data[0].trigger_event || '')
        if (seqRes.data[0].definition?.nodes?.length > 0) {
          const safeNodes = seqRes.data[0].definition.nodes.map((n: any, idx: number) => {
            const nodeType = n.data?.type || n.type;
            let label = n.data?.label || nodeType;
            let bgColor = 'white';
            let border = '1px solid #d1d5db';
            let color = '#374151';

            if (nodeType === 'action_email') { label = n.data?.label || '✉️ Send Email'; border = '2px solid #3b82f6'; }
            else if (nodeType === 'action_sms') { label = n.data?.label || '💬 Send SMS'; border = '2px solid #10b981'; }
            else if (nodeType === 'wait') { 
              const d = n.data?.delayDays || 0;
              const h = n.data?.delayHours || 0;
              const m = n.data?.delayMinutes || 0;
              label = n.data?.label || `⏳ Wait ${d}d ${h}h ${m}m`; 
              bgColor = '#fef3c7'; 
              border = '1px solid #f59e0b'; 
            }
            else if (nodeType === 'condition') { 
              label = n.data?.label || '🔀 Condition'; 
              bgColor = '#e0e7ff'; 
              border = '1px solid #6366f1'; 
            }
            
            if (n.id === 'start' || nodeType === 'input') {
              label = getTriggerLabel(seqRes.data[0].trigger_event || '', n.data.audienceId, audRes.data || []);
              bgColor = '#10b981';
              color = 'white';
              border = 'none';
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
    if (isLocked) return;
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
  }, [isLocked, nodes, setEdges]);

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
      
      let label = type
      let bgColor = 'white'
      let border = '1px solid #d1d5db'
      
      if (type === 'action_email') { label = '✉️ Send Email'; border = '2px solid #3b82f6' }
      if (type === 'action_sms') { label = '💬 Send SMS'; border = '2px solid #10b981' }
      if (type === 'wait') { label = '⏳ Wait'; bgColor = '#fef3c7'; border = '1px solid #f59e0b' }
      if (type === 'condition') { label = '🔀 Condition'; bgColor = '#e0e7ff'; border = '1px solid #6366f1' }

      const newNode: Node = {
        id: `${type}_${Date.now()}`,
        type: 'default',
        position,
        data: { 
          label, 
          type, 
          subject: '', html: '', text: '', // for actions
          delayDays: 0, delayHours: 0, delayMinutes: 0, // for wait
          query: initialQuery // for condition
        },
        style: { background: bgColor, border, borderRadius: '8px', padding: '10px' }
      }

      setNodes((nds) => nds.concat(newNode))
    },
    [reactFlowInstance, setNodes],
  )

  const handleNodeClick = (event: React.MouseEvent, node: Node) => {
    setSelectedNode(node)
    
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
          newData.label = `⏳ Wait ${d}d ${h}h ${m}m`
        } else if (n.data.type === 'condition') {
          newData.query = conditionConfig.query
          const flatFields = queryFields.flatMap((g: any) => g.options)
          newData.label = `🔀 ${formatQueryString(conditionConfig.query, flatFields)}`
        } else if (n.id === 'start') {
          newData.label = getTriggerLabel(triggerEvent, n.data.audienceId as string, audiences)
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
    
    await adminApi.update('crm_sequences', { definition, trigger_event: triggerEvent || null }, { eq: { id: sequenceId } })

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
    
    const { error } = await adminApi.update('crm_sequences', { name: sequence.name, definition, trigger_event: triggerEvent || null }, { eq: { id: sequenceId } })
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
          {isLocked ? (
            <>
              <button disabled style={{ padding: '8px 16px', background: '#dcfce7', color: '#166534', border: '1px solid #bbf7d0', borderRadius: 6, fontWeight: 600 }}>Active - Structural Edits Locked</button>
              <button onClick={handleDeactivate} style={{ padding: '8px 16px', background: '#fff1f2', color: '#be123c', border: '1px solid #fecdd3', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>Deactivate</button>
            </>
          ) : (
            <button onClick={handleActivate} style={{ padding: '8px 16px', background: '#10b981', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>Activate Sequence</button>
          )}
          <button onClick={handleSaveSequence} disabled={saving} style={{ padding: '8px 16px', background: '#1a2e1a', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>
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
        {!isLocked && (
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
          </div>
        )}

        {/* CANVAS */}
        <div style={{ flex: 1, position: 'relative' }} ref={reactFlowWrapper}>
          <ReactFlowProvider>
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={isLocked ? undefined : onNodesChange}
              onEdgesChange={isLocked ? undefined : onEdgesChange}
              onConnect={isLocked ? undefined : onConnect}
              onInit={setReactFlowInstance}
              onDrop={isLocked ? undefined : onDrop}
              onDragOver={isLocked ? undefined : onDragOver}
              onNodeClick={handleNodeClick}
              onPaneClick={handlePaneClick}
              onEdgeDoubleClick={isLocked ? undefined : onEdgeDoubleClick}
              nodesDraggable={!isLocked}
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
                    </select>
                    <p style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '8px', lineHeight: 1.5 }}>
                      Choose what automatically kicks off this sequence. If you want this sequence to only trigger from a specific Solo Campaign blast or an Audience Snapshot, choose Manual.
                    </p>
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
                      </select>
                      <p style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '8px', lineHeight: 1.5 }}>
                        Select the audience to enroll when this sequence is triggered manually.
                      </p>
                    </div>
                  )}

                  {!isLocked && (
                    <button onClick={saveSelectedNode} style={{ padding: '10px', background: '#10b981', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', marginTop: 16 }}>Apply Trigger Configuration</button>
                  )}
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
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: 8 }}>
                    The system will evaluate this logic against the user's CRM metadata. If true, they go down the "true" path. Make sure to connect "true" and "false" edges.
                  </div>
                </div>
              )}
            </div>
            
            <div style={{ padding: '16px 20px', borderTop: '1px solid #e5e7eb', background: '#f9fafb' }}>
              <button onClick={saveSelectedNode} style={{ width: '100%', padding: '10px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>
                Save Node configuration
              </button>
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
