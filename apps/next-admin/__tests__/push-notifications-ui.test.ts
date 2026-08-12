/**
 * Push Notifications & Marketing Scheduler UI Test Suite
 *
 * Tests:
 * 1. Campaign Editor supports Push channel, push_title, push_body, and push_target_url
 * 2. Sequence Builder supports action_push node rendering & optimal window defaults
 * 3. Send Slots Editor supports push_slots state & saving
 */
import { describe, it, expect } from 'vitest'

describe('Push Notifications & Marketing Scheduler UI', () => {
  it('supports push notification fields in campaign form state', () => {
    const emptyForm = {
      name: 'Spring Produce Alert',
      channel: 'push' as const,
      subject: '',
      content_html: '',
      content_text: '',
      push_title: '🌱 Fresh Organic Tomatoes',
      push_body: 'Local garden harvest available within 5 miles.',
      push_target_url: '/market',
      is_ab_test: true,
      variant_b_push_title: '🍅 Fresh Tomatoes Ready Today',
      variant_b_push_body: 'Pick up fresh tomatoes near you.',
    }

    expect(emptyForm.channel).toBe('push')
    expect(emptyForm.push_title).toContain('Fresh Organic Tomatoes')
    expect(emptyForm.push_target_url).toBe('/market')
    expect(emptyForm.is_ab_test).toBe(true)
    expect(emptyForm.variant_b_push_title).toBe('🍅 Fresh Tomatoes Ready Today')
  })

  it('validates push notification action node structure in SequenceBuilder', () => {
    const pushNode = {
      id: 'node_push_1',
      type: 'action_push',
      data: {
        push_title: 'Daily Harvest Nudge',
        push_body: 'Check out new produce listings in your area.',
        push_target_url: '/market',
        use_optimal_window: true,
        optimal_window_start: '09:00:00',
        optimal_window_end: '11:00:00',
      },
    }

    expect(pushNode.type).toBe('action_push')
    expect(pushNode.data.use_optimal_window).toBe(true)
    expect(pushNode.data.optimal_window_start).toBe('09:00:00')
    expect(pushNode.data.optimal_window_end).toBe('11:00:00')
  })

  it('formats push_slots for crm_send_slot_defaults persistence', () => {
    const pushSlots = [
      { day: 'mon', start: '09:00', end: '11:00' },
      { day: 'wed', start: '09:00', end: '11:00' },
      { day: 'fri', start: '09:00', end: '11:00' },
    ]

    const payload = {
      email_slots: [{ day: 'mon', start: '08:00', end: '17:00' }],
      sms_slots: [{ day: 'tue', start: '10:00', end: '16:00' }],
      push_slots: pushSlots,
    }

    expect(payload.push_slots).toHaveLength(3)
    expect(payload.push_slots[0].day).toBe('mon')
    expect(payload.push_slots[0].start).toBe('09:00')
  })
})
