'use client'

import { use, useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useMarket, formatUsd } from '../../../../lib/store'
import styles from './page.module.css'

export default function ChatConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { state, dispatch } = useMarket()
  const conv = state.conversations.find(c => c.id === id)
  const order = conv ? state.orders.find(o => o.id === conv.orderId) : null
  const [text, setText] = useState('')
  const [passcodeInput, setPasscodeInput] = useState('')
  const [showRejectForm, setShowRejectForm] = useState(false)
  const [rejectReason, setRejectReason] = useState('Out of stock')
  const [customRejectReason, setCustomRejectReason] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const isSeller = conv?.sellerId === state.user?.id
  const isBuyer = conv?.buyerId === state.user?.id

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [conv?.messages.length])

  if (!conv) return <div className="container" style={{ padding: 80, textAlign: 'center' }}><h2>Conversation not found</h2><Link href="/chat" className="btn btn-primary" style={{ marginTop: 16 }}>Back to Chats</Link></div>

  const sendMessage = () => {
    if (!text.trim()) return
    dispatch({ type: 'SEND_MESSAGE', payload: { conversationId: id, message: { senderId: state.user!.id, senderName: state.user!.name, text, type: 'text' } } })
    setText('')
  }

  const sendSystemMessage = (msg: string) => {
    dispatch({ type: 'SEND_MESSAGE', payload: { conversationId: id, message: { senderId: 'system', senderName: 'System', text: msg, type: 'system' } } })
  }

  const handleAccept = () => {
    dispatch({ type: 'UPDATE_ORDER_STATUS', payload: { orderId: order!.id, status: 'accepted' } })
    sendSystemMessage(`${state.user!.name} accepted the order.`)
    dispatch({ type: 'ADD_TOAST', payload: { message: 'Order accepted ✓', type: 'success' } })
  }
  const handleReject = (reason: string) => {
    dispatch({ type: 'UPDATE_ORDER_STATUS', payload: { orderId: order!.id, status: 'rejected' } })
    sendSystemMessage(`${state.user!.name} rejected the order. Reason: ${reason}. Payment hold released.`)
    dispatch({ type: 'ADD_TOAST', payload: { message: 'Order rejected. Payment reversed.', type: 'info' } })
    setShowRejectForm(false)
  }
  const handleMarkDelivered = () => {
    dispatch({ type: 'UPDATE_ORDER_STATUS', payload: { orderId: order!.id, status: 'delivered', proofPhotos: ['proof.jpg'] } })
    sendSystemMessage(`${state.user!.name} marked the order as delivered. ${order!.deliveryType === 'delivery' ? 'Photo proof attached. Buyer has 2 hours to confirm or dispute.' : 'Awaiting pickup confirmation.'}`)
    dispatch({ type: 'ADD_TOAST', payload: { message: 'Marked as delivered', type: 'success' } })
  }
  const handleConfirmPickup = () => {
    if (passcodeInput !== order!.passcode) {
      dispatch({ type: 'ADD_TOAST', payload: { message: 'Invalid passcode', type: 'error' } })
      return
    }
    dispatch({ type: 'UPDATE_ORDER_STATUS', payload: { orderId: order!.id, status: 'confirmed' } })
    sendSystemMessage('Pickup confirmed with passcode. Order complete! 🎉')
    dispatch({ type: 'ADD_TOAST', payload: { message: 'Pickup confirmed! ✓', type: 'success' } })
    setPasscodeInput('')
  }
  const handleConfirmDelivery = () => {
    dispatch({ type: 'UPDATE_ORDER_STATUS', payload: { orderId: order!.id, status: 'confirmed' } })
    sendSystemMessage('Buyer confirmed delivery. Order complete! 🎉')
    dispatch({ type: 'ADD_TOAST', payload: { message: 'Delivery confirmed!', type: 'success' } })
  }
  const handleDispute = () => {
    dispatch({ type: 'UPDATE_ORDER_STATUS', payload: { orderId: order!.id, status: 'disputed', disputeReason: 'Issue with delivery' } })
    sendSystemMessage(`${state.user!.name} opened a dispute.`)
    dispatch({ type: 'ADD_TOAST', payload: { message: 'Dispute filed', type: 'info' } })
  }
  const handleOfferDiscount = () => {
    const amount = 2.00
    dispatch({ type: 'UPDATE_ORDER_STATUS', payload: { orderId: order!.id, status: 'disputed', discountOffer: amount } })
    sendSystemMessage(`${state.user!.name} offered a ${formatUsd(amount)} discount to settle the dispute.`)
  }
  const handleAcceptDiscount = () => {
    dispatch({ type: 'UPDATE_ORDER_STATUS', payload: { orderId: order!.id, status: 'resolved' } })
    sendSystemMessage(`${state.user!.name} accepted the discount offer. Dispute resolved.`)
    dispatch({ type: 'ADD_TOAST', payload: { message: 'Dispute resolved!', type: 'success' } })
  }
  const handleEscalate = () => {
    sendSystemMessage(`${state.user!.name} escalated the dispute to CasaGrown admin for review.`)
    dispatch({ type: 'ADD_TOAST', payload: { message: 'Dispute escalated to admin', type: 'info' } })
  }

  return (
    <div className={styles.chatPage}>
      {/* Header */}
      <div className={styles.chatHeader}>
        <button onClick={() => router.back()} className={styles.backBtn} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>←</button>
        <div className="avatar avatar-sm">{(isSeller ? conv.buyerName : conv.sellerName).charAt(0)}</div>
        <div style={{ flex: 1 }}>
          <strong style={{ fontSize: 14 }}>{isSeller ? conv.buyerName : conv.sellerName}</strong>
          <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>{conv.boothName}</div>
        </div>
        {order && (
          <span className={`badge ${order.status === 'confirmed' || order.status === 'resolved' ? 'badge-green' : order.status === 'disputed' ? 'badge-red' : 'badge-blue'}`}>
            {order.status}
          </span>
        )}
      </div>

      {/* Messages */}
      <div className={styles.messages}>
        {conv.messages.map(msg => (
          <div key={msg.id} className={`${styles.msgRow} ${msg.type === 'system' ? styles.msgSystem : msg.senderId === state.user?.id ? styles.msgSent : styles.msgReceived}`}>
            {msg.type === 'system' ? (
              <div className={styles.systemMsg}>{msg.text}</div>
            ) : (
              <div className={styles.bubble}>
                <div className={styles.bubbleSender}>{msg.senderName}</div>
                <div className={styles.bubbleText}>{msg.text}</div>
                <div className={styles.bubbleTime}>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Action Bar */}
      {order && (
        <div className={styles.actionBar}>
          {/* Seller actions */}
          {isSeller && order.status === 'pending' && (
            <div className={styles.actionGroup}>
              {!showRejectForm ? (
                <>
                  <button className="btn btn-primary btn-sm" onClick={handleAccept}>✓ Accept Order</button>
                  <button className="btn btn-danger btn-sm" onClick={() => setShowRejectForm(true)}>✕ Reject</button>
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 400 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-700)' }}>Reason for rejection:</span>
                  <select className="input" value={rejectReason} onChange={e => setRejectReason(e.target.value)} style={{ padding: '8px 12px' }}>
                    <option value="Out of stock">Out of stock</option>
                    <option value="Cannot fulfill at requested time">Cannot fulfill at requested time</option>
                    <option value="Item no longer available">Item no longer available</option>
                    <option value="Other">Other (please specify)</option>
                  </select>
                  {rejectReason === 'Other' && (
                    <input 
                      className="input" 
                      placeholder="Type reason here..." 
                      value={customRejectReason} 
                      onChange={e => setCustomRejectReason(e.target.value)} 
                    />
                  )}
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <button className="btn btn-danger btn-sm" onClick={() => {
                        const finalReason = rejectReason === 'Other' ? customRejectReason : rejectReason;
                        if (rejectReason === 'Other' && !finalReason.trim()) {
                           dispatch({ type: 'ADD_TOAST', payload: { message: 'Please provide a reason', type: 'error' } })
                           return;
                        }
                        handleReject(finalReason);
                    }}>Confirm Rejection</button>
                    <button className="btn btn-secondary btn-sm" onClick={() => setShowRejectForm(false)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )}
          {isSeller && order.status === 'accepted' && (
            <div className={styles.actionGroup}>
              <button className="btn btn-primary btn-sm" onClick={handleMarkDelivered}>📷 Mark Delivered</button>
            </div>
          )}
          {isSeller && order.status === 'accepted' && order.deliveryType === 'pickup' && (
            <div className={styles.actionGroup}>
              <input className="input" placeholder="Enter passcode" value={passcodeInput} onChange={e => setPasscodeInput(e.target.value)} style={{ maxWidth: 160, fontSize: 16, letterSpacing: 2, textAlign: 'center' }} />
              <button className="btn btn-primary btn-sm" onClick={handleConfirmPickup}>Verify Pickup</button>
            </div>
          )}
          {isSeller && order.status === 'disputed' && (
            <div className={styles.actionGroup}>
              <button className="btn btn-secondary btn-sm" onClick={handleOfferDiscount}>💵 Offer ${2} Discount</button>
            </div>
          )}
          {/* Buyer actions */}
          {isBuyer && order.status === 'delivered' && (
            <div className={styles.actionGroup}>
              <button className="btn btn-primary btn-sm" onClick={handleConfirmDelivery}>✓ Confirm Delivery</button>
              <button className="btn btn-danger btn-sm" onClick={handleDispute}>⚠️ Dispute</button>
            </div>
          )}
          {isBuyer && order.status === 'accepted' && order.deliveryType === 'pickup' && (
            <div className={styles.passcodeDisplay}>
              <span>Your pickup passcode:</span>
              <strong>{order.passcode}</strong>
            </div>
          )}
          {isBuyer && order.status === 'disputed' && order.discountOffer && (
            <div className={styles.actionGroup}>
              <span style={{ fontSize: 13, color: 'var(--gray-600)' }}>Seller offered {formatUsd(order.discountOffer)} discount</span>
              <button className="btn btn-primary btn-sm" onClick={handleAcceptDiscount}>Accept</button>
              <button className="btn btn-danger btn-sm" onClick={handleEscalate}>Escalate</button>
            </div>
          )}
        </div>
      )}

      {/* Input */}
      <div className={styles.inputBar}>
        <input
          className="input"
          placeholder="Type a message..."
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendMessage()}
        />
        <button className="btn btn-primary" onClick={sendMessage} disabled={!text.trim()}>Send</button>
      </div>
    </div>
  )
}
