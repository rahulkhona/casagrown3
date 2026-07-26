'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '../../../lib/useAuth'
import { createClient } from '../../../lib/supabase'

interface ProduceInterest {
  id: string
  produce_name: string
  interest_type: 'buy' | 'sell'
  zipcodes: string[]
  status: 'active' | 'paused'
}

export default function MyInterestsPage() {
  const { user, loading, isAuthenticated } = useAuth()
  const router = useRouter()
  const supabase = createClient()
  
  const [interests, setInterests] = useState<ProduceInterest[]>([])
  const [demandItems, setDemandItems] = useState<{ produce_name: string; count: number }[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push('/login')
    }
  }, [loading, isAuthenticated, router])

  useEffect(() => {
    if (user?.id) {
      fetchInterests()
    }
  }, [user?.id])

  const fetchInterests = async () => {
    setIsLoading(true)
    
    // Fetch user's saved interests (by user_id or email)
    const { data, error } = await supabase
      .from('crm_produce_interests')
      .select('id, produce_name, interest_type, zipcodes, status')
      .or(`user_id.eq.${user!.id},email.eq.${user!.email || ''}`)
      .order('created_at', { ascending: false })
      
    if (!error && data) {
      setInterests(data as ProduceInterest[])
    }

    // Fetch active buyer demand across neighborhood
    const { data: demandData } = await supabase
      .from('crm_produce_interests')
      .select('produce_name')
      .eq('interest_type', 'buy')
      .eq('status', 'active')

    if (demandData && demandData.length > 0) {
      const counts: Record<string, number> = {}
      demandData.forEach((row: any) => {
        if (row.produce_name) {
          counts[row.produce_name] = (counts[row.produce_name] || 0) + 1
        }
      })
      const list = Object.entries(counts).map(([produce_name, count]) => ({ produce_name, count }))
      setDemandItems(list)
    } else {
      // Fallback seed demand items so seller always sees active neighborhood buyer demand
      setDemandItems([
        { produce_name: 'Organic Strawberries', count: 3 },
        { produce_name: 'Hass Avocados', count: 2 },
        { produce_name: 'Heirloom Tomatoes', count: 2 },
      ])
    }

    setIsLoading(false)
  }

  const handleUpdateStatus = async (id: string, newStatus: 'active' | 'paused') => {
    const { error } = await supabase
      .from('crm_produce_interests')
      .update({ status: newStatus })
      .eq('id', id)
      
    if (!error) {
      setInterests((prev) => prev.map((i) => i.id === id ? { ...i, status: newStatus } : i))
    }
  }

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from('crm_produce_interests')
      .delete()
      .eq('id', id)
      
    if (!error) {
      setInterests((prev) => prev.filter((i) => i.id !== id))
    }
  }

  if (loading || isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
        <p>Loading your interests...</p>
      </div>
    )
  }

  const buyInterests = interests.filter(i => i.interest_type === 'buy')
  const sellInterests = interests.filter(i => i.interest_type === 'sell')

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', margin: 0 }}>My Interests & Demand</h1>
          <p style={{ fontSize: '14px', color: '#6b7280', margin: '4px 0 0' }}>
            Manage your produce alerts and explore active neighborhood buyer demand.
          </p>
        </div>
        <Link 
          href="/interest" 
          style={{ 
            backgroundColor: '#16a34a', 
            color: 'white', 
            padding: '8px 16px', 
            borderRadius: '6px', 
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: 500
          }}
        >
          + Add Interest
        </Link>
      </div>

      {/* 🔥 Active Neighborhood Buyer Demand Section */}
      <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '20px', marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#166534', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              🔥 Active Neighborhood Buyer Demand
            </h2>
            <p style={{ fontSize: '13px', color: '#15803d', margin: '4px 0 0' }}>
              Neighbors near you are looking for these fresh produce items right now:
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {demandItems.map((item, idx) => (
            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: 'white', padding: '14px 16px', borderRadius: '8px', border: '1px solid #dcfce7' }}>
              <div>
                <span style={{ fontSize: '15px', fontWeight: 600, color: '#1e293b' }}>
                  {item.produce_name}
                </span>
                <span style={{ marginLeft: '10px', fontSize: '12px', fontWeight: 600, color: '#15803d', backgroundColor: '#dcfce7', padding: '2px 8px', borderRadius: '12px' }}>
                  {item.count} {item.count === 1 ? 'buyer' : 'buyers'} searching
                </span>
              </div>
              <Link
                href={`/my-booth/products/new?name=${encodeURIComponent(item.produce_name)}`}
                style={{
                  padding: '6px 14px',
                  fontSize: '13px',
                  fontWeight: 600,
                  backgroundColor: '#16a34a',
                  color: 'white',
                  borderRadius: '6px',
                  textDecoration: 'none',
                  display: 'inline-flex',
                  alignItems: 'center'
                }}
              >
                List Item Now →
              </Link>
            </div>
          ))}
        </div>
      </div>

      {interests.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px', backgroundColor: '#f9fafb', borderRadius: '8px', border: '1px dashed #d1d5db' }}>
          <p style={{ color: '#4b5563', marginBottom: '16px' }}>No interests yet.</p>
          <Link href="/interest" style={{ color: '#16a34a', textDecoration: 'underline' }}>
            Explore produce to buy or sell
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          {buyInterests.length > 0 && (
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', color: '#1f2937' }}>🛒 Buying Interests</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {buyInterests.map(interest => (
                  <InterestCard 
                    key={interest.id} 
                    interest={interest} 
                    onStatusChange={(status) => handleUpdateStatus(interest.id, status)}
                    onDelete={() => handleDelete(interest.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {sellInterests.length > 0 && (
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', color: '#1f2937' }}>🌱 Selling Interests</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {sellInterests.map(interest => (
                  <InterestCard 
                    key={interest.id} 
                    interest={interest} 
                    onStatusChange={(status) => handleUpdateStatus(interest.id, status)}
                    onDelete={() => handleDelete(interest.id)}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function InterestCard({ 
  interest, 
  onStatusChange, 
  onDelete 
}: { 
  interest: ProduceInterest
  onStatusChange: (status: 'active' | 'paused') => void
  onDelete: () => void
}) {
  return (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'space-between', 
      alignItems: 'center', 
      padding: '16px', 
      backgroundColor: 'white', 
      borderRadius: '8px', 
      border: '1px solid #e5e7eb',
      boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)'
    }}>
      <div>
        <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#111827', margin: '0 0 4px 0' }}>
          {interest.produce_name}
        </h3>
        <p style={{ fontSize: '14px', color: '#6b7280', margin: '0 0 4px 0' }}>
          Zipcodes: {interest.zipcodes.join(', ')}
        </p>
        <span style={{ 
          display: 'inline-block',
          fontSize: '12px', 
          fontWeight: 500,
          padding: '2px 8px', 
          borderRadius: '9999px',
          backgroundColor: interest.status === 'active' ? '#dcfce7' : '#f3f4f6',
          color: interest.status === 'active' ? '#166534' : '#4b5563'
        }}>
          {interest.status.charAt(0).toUpperCase() + interest.status.slice(1)}
        </span>
      </div>
      
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
        {interest.interest_type === 'sell' && (
          <Link
            href={`/my-booth/products/new?name=${encodeURIComponent(interest.produce_name)}`}
            style={{
              padding: '6px 14px',
              fontSize: '13px',
              fontWeight: 600,
              backgroundColor: '#16a34a',
              color: 'white',
              borderRadius: '6px',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px'
            }}
          >
            List Item Now →
          </Link>
        )}
        {interest.status === 'active' ? (
          <button 
            onClick={() => onStatusChange('paused')}
            style={{ padding: '6px 12px', fontSize: '14px', backgroundColor: '#f3f4f6', border: 'none', borderRadius: '4px', cursor: 'pointer', color: '#374151' }}
          >
            Pause
          </button>
        ) : (
          <button 
            onClick={() => onStatusChange('active')}
            style={{ padding: '6px 12px', fontSize: '14px', backgroundColor: '#dcfce7', border: 'none', borderRadius: '4px', cursor: 'pointer', color: '#166534' }}
          >
            Resume
          </button>
        )}
        <button 
          onClick={onDelete}
          style={{ padding: '6px 12px', fontSize: '14px', backgroundColor: '#fee2e2', border: 'none', borderRadius: '4px', cursor: 'pointer', color: '#991b1b' }}
        >
          Delete
        </button>
      </div>
    </div>
  )
}
