'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '../../../lib/useAuth'
import { createClient } from '../../../lib/supabase'
import SocialShareModal from '../../components/SocialShareModal'
import { getProduceImage } from '../../../lib/produceCatalog'

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
  const searchParams = useSearchParams()
  const supabase = createClient()
  
  const [interests, setInterests] = useState<ProduceInterest[]>([])
  const [demandItems, setDemandItems] = useState<{ produce_name: string; count: number }[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isShareModalOpen, setIsShareModalOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'interests' | 'demand'>(
    searchParams.get('tab') === 'demand' ? 'demand' : 'interests'
  )

  useEffect(() => {
    if (searchParams.get('tab') === 'demand') {
      setActiveTab('demand')
    }
  }, [searchParams])

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      router.push('/login')
    }
  }, [loading, isAuthenticated, router])

  const userId = user?.id
  const userEmail = user?.email

  useEffect(() => {
    fetchInterests()
  }, [userId, userEmail])

  const fetchInterests = async () => {
    setIsLoading(true)
    const guestEmail = typeof window !== 'undefined' ? localStorage.getItem('guest_email') : null
    const queryEmail = userEmail || guestEmail || ''

    try {
      const resp = await fetch(`/api/interest/list?user_id=${encodeURIComponent(userId || '')}&email=${encodeURIComponent(queryEmail)}`)
      const data = await resp.json()

      if (data?.success) {
        setInterests(data.interests || [])
        setDemandItems(data.demandItems || [])
      }
    } catch (err) {
      console.error('Error loading interests via API:', err)
    } finally {
      setIsLoading(false)
    }
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

      {/* Tab Switcher */}
      <div style={{ display: 'flex', gap: '12px', borderBottom: '1px solid #e5e7eb', marginBottom: '24px' }}>
        <button
          onClick={() => setActiveTab('interests')}
          style={{
            padding: '10px 16px',
            fontSize: '15px',
            fontWeight: 600,
            color: activeTab === 'interests' ? '#16a34a' : '#6b7280',
            borderBottom: activeTab === 'interests' ? '2.5px solid #16a34a' : '2.5px solid transparent',
            backgroundColor: 'transparent',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer'
          }}
        >
          📋 My Interests ({interests.length})
        </button>
        <button
          onClick={() => setActiveTab('demand')}
          style={{
            padding: '10px 16px',
            fontSize: '15px',
            fontWeight: 600,
            color: activeTab === 'demand' ? '#16a34a' : '#6b7280',
            borderBottom: activeTab === 'demand' ? '2.5px solid #16a34a' : '2.5px solid transparent',
            backgroundColor: 'transparent',
            borderTop: 'none',
            borderLeft: 'none',
            borderRight: 'none',
            cursor: 'pointer'
          }}
        >
          🔥 Neighborhood Demand ({demandItems.length})
        </button>
      </div>

      {activeTab === 'interests' ? (
        /* User Personal Interests Tab */
        interests.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '36px', backgroundColor: '#f9fafb', borderRadius: '12px', border: '1px dashed #d1d5db', marginBottom: '32px' }}>
            <p style={{ color: '#4b5563', marginBottom: '16px', fontSize: '15px', fontWeight: 500 }}>No saved interests yet.</p>
            <Link href="/interest" style={{ color: '#ffffff', backgroundColor: '#16a34a', padding: '10px 20px', borderRadius: '8px', textDecoration: 'none', fontWeight: 700, fontSize: '14px', display: 'inline-block' }}>
              + Explore & Add Interests
            </Link>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px', marginBottom: '32px' }}>
            {buyInterests.length > 0 && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#1f2937', margin: 0 }}>🛒 Buying Interests</h2>
                  <button
                    onClick={() => setIsShareModalOpen(true)}
                    style={{
                      backgroundColor: '#ffffff',
                      color: '#2563eb',
                      border: '1.5px solid #93c5fd',
                      borderRadius: '6px',
                      padding: '6px 14px',
                      fontSize: '13px',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '6px'
                    }}
                  >
                    📲 Share Wishlist with Neighbors
                  </button>
                </div>
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
        )
      ) : (
        /* Neighborhood Buyer Demand Tab */
        demandItems.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '36px', backgroundColor: '#f9fafb', borderRadius: '12px', border: '1px dashed #d1d5db' }}>
            <p style={{ color: '#4b5563', marginBottom: '8px', fontSize: '15px', fontWeight: 600 }}>
              No matching buyer demand for your selling interests yet.
            </p>
            <p style={{ color: '#6b7280', fontSize: '13px', marginBottom: '16px' }}>
              Add produce you grow under Selling Interests to match with active local buyer demand!
            </p>
            <Link href="/interest?scope=sell" style={{ color: '#ffffff', backgroundColor: '#16a34a', padding: '10px 20px', borderRadius: '8px', textDecoration: 'none', fontWeight: 700, fontSize: '14px', display: 'inline-block' }}>
              + Add Selling Interests
            </Link>
          </div>
        ) : (
          <div style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '12px', padding: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#166534', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  🔥 Active Neighborhood Buyer Demand
                </h2>
                <p style={{ fontSize: '13px', color: '#15803d', margin: '4px 0 0' }}>
                  Nearby buyers looking for items matching your selling interests:
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
                    href={`/create-listing?produce=${encodeURIComponent(item.produce_name)}`}
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
        )
      )}



      {/* Social Share Modal for Buyer Produce Wishlist */}
      {buyInterests.length > 0 && (
        <SocialShareModal
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          title="Share Wishlist with Neighbors"
          subtitle="Let local gardeners know what produce you're looking to buy!"
          entityName={buyInterests.map(i => i.produce_name).join(', ')}
          shareUrl={`${typeof window !== 'undefined' ? window.location.origin : 'https://casagrown.com'}/demand?ref=${(user as any)?.referral_code || user?.id || ''}`}
          shareMessage={(platform) => {
            const itemList = buyInterests.map(i => i.produce_name).join(', ')
            if (platform === 'whatsapp') {
              return `*Produce Wishlist Alert!* 🥦\n\nHey neighbors! I'm looking to buy fresh backyard harvest: *${itemList}* on CasaGrown.\n\nIf you have extra growing in your garden, list your harvest here so I can buy from you:\n`
            }
            if (platform === 'nextdoor' || platform === 'facebook') {
              return `Hey neighbors! I'm looking for fresh local garden produce (${itemList}). If you have extra in your backyard, list it on CasaGrown so neighbors can buy local!`
            }
            return `I'm searching for fresh local produce: ${itemList} on CasaGrown!`
          }}
          shareContext="buy_request"
          userId={user?.id}
          imageUrl={getProduceImage(buyInterests[0]?.produce_name)}
        />
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
            href={`/create-listing?produce=${encodeURIComponent(interest.produce_name)}`}
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
