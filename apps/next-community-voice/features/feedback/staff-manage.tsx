'use client'

import { useState, useEffect } from 'react'
import { YStack, XStack, Text, Button, Card, Input, Separator, Spinner, Image, useMedia } from 'tamagui'
import { useRouter } from 'next/navigation'
import { colors } from '@casagrown/app/design-tokens'
import { ArrowLeft, Plus, Trash2, Shield, UserCog, Headphones, X, Check, AlertTriangle } from '@tamagui/lucide-icons'
import {
  fetchStaffMembers,
  addStaffMember,
  updateStaffRoles,
  removeStaffMember,
  StaffMember,
  StaffRole,
} from './feedback-service'

const ALL_ROLES: { key: StaffRole; label: string; icon: any; color: string; bg: string }[] = [
  { key: 'admin', label: 'Admin', icon: Shield, color: colors.red[700], bg: colors.red[100] },
  { key: 'moderator', label: 'Moderator', icon: UserCog, color: colors.purple[700], bg: colors.purple[100] },
  { key: 'support', label: 'Support', icon: Headphones, color: colors.blue[700], bg: colors.blue[100] },
] as const

export function StaffManage() {
  const router = useRouter()
  const media = useMedia()
  const isDesktop = !media.sm

  const [staff, setStaff] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)
  const [showAddForm, setShowAddForm] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newRoles, setNewRoles] = useState<StaffRole[]>(['support'])
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [editingRoles, setEditingRoles] = useState<string | null>(null)
  const [editRoles, setEditRoles] = useState<StaffRole[]>([])

  useEffect(() => {
    loadStaff()
  }, [])

  const loadStaff = async () => {
    setLoading(true)
    const data = await fetchStaffMembers()
    setStaff(data)
    setLoading(false)
  }

  const handleAdd = async () => {
    if (!newEmail.trim() || !newEmail.includes('@')) {
      setAddError('Please enter a valid email address')
      return
    }
    if (newRoles.length === 0) {
      setAddError('Please select at least one role')
      return
    }
    setAddError('')
    setAdding(true)
    const { data, error } = await addStaffMember(newEmail, newRoles)
    setAdding(false)
    if (data) {
      setStaff([...staff, data])
      setNewEmail('')
      setNewRoles(['support'])
      setShowAddForm(false)
    } else {
      setAddError(error || 'Failed to add staff member')
    }
  }

  const handleRemove = async (id: string) => {
    const success = await removeStaffMember(id)
    if (success) {
      setStaff(staff.filter(s => s.id !== id))
    }
    setConfirmDelete(null)
  }

  const handleSaveRoles = async (id: string) => {
    if (editRoles.length === 0) return
    const success = await updateStaffRoles(id, editRoles)
    if (success) {
      setStaff(staff.map(s => s.id === id ? { ...s, roles: editRoles } : s))
    }
    setEditingRoles(null)
  }

  const toggleRole = (role: StaffRole, roles: StaffRole[], setRoles: (r: StaffRole[]) => void) => {
    if (roles.includes(role)) {
      if (roles.length > 1) setRoles(roles.filter(r => r !== role))
    } else {
      setRoles([...roles, role])
    }
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  return (
    <YStack flex={1} backgroundColor={colors.green[50]} padding={isDesktop ? '$4' : '$3'}>
      {/* Header */}
      <YStack gap="$3" marginBottom="$4">
        <Button
          icon={ArrowLeft}
          chromeless
          onPress={() => router.push('/staff/dashboard')}
          alignSelf="flex-start"
          paddingLeft="$0"
        >
          <Text color={colors.gray[600]}>Back to Dashboard</Text>
        </Button>

        <XStack justifyContent="space-between" alignItems="center">
          <YStack>
            <Text fontSize="$7" fontWeight="700" color={colors.green[800]}>Manage Staff</Text>
            <Text color={colors.gray[500]} fontWeight="400" fontSize="$3">Add, remove, and manage staff access</Text>
          </YStack>
          <Button
            backgroundColor={colors.green[600]}
            size="$3"
            icon={<Plus size={16} color="white" />}
            onPress={() => setShowAddForm(!showAddForm)}
            pressStyle={{ backgroundColor: colors.green[700] }}
          >
            <Text color="white" fontWeight="600">Add Staff</Text>
          </Button>
        </XStack>
      </YStack>

      {/* Add Staff Form */}
      {showAddForm && (
        <Card padding="$4" marginBottom="$3" backgroundColor="white" borderWidth={1} borderColor={colors.green[200]} borderRadius="$4">
          <YStack gap="$3">
            <Text fontWeight="600" color={colors.gray[800]} fontSize="$4">Add New Staff Member</Text>

            <YStack gap="$2">
              <Text fontSize="$2" color={colors.gray[500]} fontWeight="500">EMAIL ADDRESS</Text>
              <Input
                placeholder="staff@company.com"
                value={newEmail}
                onChangeText={setNewEmail}
                size="$4"
                borderRadius="$3"
                borderWidth={1}
                borderColor={colors.gray[300]}
                autoCapitalize="none"
                fontWeight="400"
                style={{ fontWeight: 400 }}
              />
            </YStack>

            <YStack gap="$2">
              <Text fontSize="$2" color={colors.gray[500]} fontWeight="500">ROLES</Text>
              <XStack gap="$2" flexWrap="wrap">
                {ALL_ROLES.map(r => (
                  <Button
                    key={r.key}
                    size="$3"
                    backgroundColor={newRoles.includes(r.key) ? r.bg as any : colors.gray[100]}
                    borderWidth={2}
                    borderColor={newRoles.includes(r.key) ? r.color as any : 'transparent'}
                    borderRadius="$3"
                    onPress={() => toggleRole(r.key, newRoles, setNewRoles)}
                    icon={<r.icon size={14} color={newRoles.includes(r.key) ? r.color : colors.gray[500]} />}
                  >
                    <Text color={newRoles.includes(r.key) ? r.color as any : colors.gray[600]} fontWeight="500">{r.label}</Text>
                  </Button>
                ))}
              </XStack>
            </YStack>

            {addError ? (
              <XStack backgroundColor={colors.red[100]} padding="$2" borderRadius="$2" gap="$2" alignItems="center">
                <AlertTriangle size={14} color={colors.red[600]} />
                <Text color={colors.red[700]} fontSize="$3">{addError}</Text>
              </XStack>
            ) : null}

            <XStack gap="$2" justifyContent="flex-end">
              <Button size="$3" chromeless onPress={() => { setShowAddForm(false); setAddError('') }}>
                <Text color={colors.gray[600]}>Cancel</Text>
              </Button>
              <Button
                size="$3"
                backgroundColor={colors.green[600]}
                onPress={handleAdd}
                disabled={adding}
                pressStyle={{ backgroundColor: colors.green[700] }}
              >
                {adding ? <Spinner size="small" color="white" /> : <Text color="white" fontWeight="600">Add Member</Text>}
              </Button>
            </XStack>
          </YStack>
        </Card>
      )}

      {/* Staff List */}
      {loading ? (
        <YStack padding="$8" alignItems="center">
          <Spinner size="large" color={colors.green[600]} />
        </YStack>
      ) : staff.length === 0 ? (
        <Card padding="$6" backgroundColor="white" borderRadius="$4" alignItems="center" gap="$2">
          <Shield size={32} color={colors.gray[300]} />
          <Text color={colors.gray[500]} fontWeight="500">No staff members</Text>
          <Text color={colors.gray[400]} fontSize="$3">Add the first staff member above</Text>
        </Card>
      ) : (
        <YStack gap="$2">
          {/* Column Headers */}
          {isDesktop && (
            <XStack paddingHorizontal="$4" paddingVertical="$2" gap="$3">
              <Text flex={2} fontSize="$2" color={colors.gray[500]} fontWeight="600">EMAIL</Text>
              <Text flex={2} fontSize="$2" color={colors.gray[500]} fontWeight="600">ROLES</Text>
              <Text flex={1} fontSize="$2" color={colors.gray[500]} fontWeight="600">STATUS</Text>
              <Text flex={1} fontSize="$2" color={colors.gray[500]} fontWeight="600">ADDED</Text>
              <Text width={80} fontSize="$2" color={colors.gray[500]} fontWeight="600" textAlign="right">ACTIONS</Text>
            </XStack>
          )}

          {staff.map(member => (
            <Card
              key={member.id}
              padding="$4"
              backgroundColor="white"
              borderRadius="$3"
              borderWidth={1}
              borderColor={member.roles.includes('admin') ? colors.red[100] : colors.gray[200]}
            >
              {isDesktop ? (
                // Desktop: row layout
                <XStack gap="$3" alignItems="center">
                  <Text flex={2} fontSize="$4" fontWeight="500" color={colors.gray[800]}>{member.email}</Text>

                  <XStack flex={2} gap="$1" flexWrap="wrap">
                    {editingRoles === member.id ? (
                      ALL_ROLES.map(r => (
                        <Button
                          key={r.key}
                          size="$2"
                          backgroundColor={editRoles.includes(r.key) ? r.bg as any : colors.gray[100]}
                          borderWidth={1}
                          borderColor={editRoles.includes(r.key) ? r.color as any : 'transparent'}
                          borderRadius="$2"
                          onPress={() => toggleRole(r.key, editRoles, setEditRoles)}
                        >
                          <Text fontSize="$2" color={editRoles.includes(r.key) ? r.color as any : colors.gray[500]}>{r.label}</Text>
                        </Button>
                      ))
                    ) : (
                      member.roles.map(role => {
                        const r = ALL_ROLES.find(ar => ar.key === role)!
                        return (
                          <XStack key={role} backgroundColor={r.bg as any} paddingHorizontal="$2" paddingVertical="$1" borderRadius="$2" alignItems="center" gap="$1">
                            <r.icon size={10} color={r.color} />
                            <Text fontSize="$2" color={r.color as any} fontWeight="600">{r.label}</Text>
                          </XStack>
                        )
                      })
                    )}
                  </XStack>

                  <XStack flex={1}>
                    <Text fontSize="$3" color={member.user_id ? colors.green[600] : colors.gray[400]} fontWeight="500">
                      {member.user_id ? '● Linked' : '○ Pending'}
                    </Text>
                  </XStack>

                  <Text flex={1} fontSize="$3" color={colors.gray[500]}>{formatDate(member.granted_at)}</Text>

                  <XStack width={80} justifyContent="flex-end" gap="$1">
                    {editingRoles === member.id ? (
                      <>
                        <Button size="$2" chromeless icon={<Check size={16} color={colors.green[600]} />} onPress={() => handleSaveRoles(member.id)} />
                        <Button size="$2" chromeless icon={<X size={16} color={colors.gray[500]} />} onPress={() => setEditingRoles(null)} />
                      </>
                    ) : (
                      <>
                        <Button size="$2" chromeless icon={<UserCog size={16} color={colors.gray[500]} />} onPress={() => { setEditingRoles(member.id); setEditRoles([...member.roles]) }} />
                        {confirmDelete === member.id ? (
                          <Button size="$2" backgroundColor={colors.red[500]} borderRadius="$2" onPress={() => handleRemove(member.id)}>
                            <Text fontSize="$1" color="white" fontWeight="600">Confirm</Text>
                          </Button>
                        ) : (
                          <Button size="$2" chromeless icon={<Trash2 size={16} color={colors.red[400]} />} onPress={() => setConfirmDelete(member.id)} />
                        )}
                      </>
                    )}
                  </XStack>
                </XStack>
              ) : (
                // Mobile: stacked layout
                <YStack gap="$2">
                  <Text fontSize="$4" fontWeight="500" color={colors.gray[800]}>{member.email}</Text>
                  <XStack gap="$1" flexWrap="wrap">
                    {member.roles.map(role => {
                      const r = ALL_ROLES.find(ar => ar.key === role)!
                      return (
                        <XStack key={role} backgroundColor={r.bg as any} paddingHorizontal="$2" paddingVertical="$1" borderRadius="$2" alignItems="center" gap="$1">
                          <r.icon size={10} color={r.color} />
                          <Text fontSize="$2" color={r.color as any} fontWeight="600">{r.label}</Text>
                        </XStack>
                      )
                    })}
                  </XStack>
                  <XStack justifyContent="space-between" alignItems="center">
                    <XStack gap="$2" alignItems="center">
                      <Text fontSize="$2" color={member.user_id ? colors.green[600] : colors.gray[400]}>
                        {member.user_id ? '● Linked' : '○ Pending'}
                      </Text>
                      <Text fontSize="$2" color={colors.gray[400]}>• {formatDate(member.granted_at)}</Text>
                    </XStack>
                    <XStack gap="$1">
                      <Button size="$2" chromeless icon={<UserCog size={14} color={colors.gray[500]} />} onPress={() => { setEditingRoles(member.id); setEditRoles([...member.roles]) }} />
                      {confirmDelete === member.id ? (
                        <Button size="$2" backgroundColor={colors.red[500]} borderRadius="$2" onPress={() => handleRemove(member.id)}>
                          <Text fontSize="$1" color="white" fontWeight="600">Confirm</Text>
                        </Button>
                      ) : (
                        <Button size="$2" chromeless icon={<Trash2 size={14} color={colors.red[400]} />} onPress={() => setConfirmDelete(member.id)} />
                      )}
                    </XStack>
                  </XStack>

                  {editingRoles === member.id && (
                    <YStack gap="$2" padding="$2" backgroundColor={colors.gray[50]} borderRadius="$2">
                      <Text fontSize="$2" fontWeight="500" color={colors.gray[600]}>Edit Roles:</Text>
                      <XStack gap="$2" flexWrap="wrap">
                        {ALL_ROLES.map(r => (
                          <Button
                            key={r.key}
                            size="$2"
                            backgroundColor={editRoles.includes(r.key) ? r.bg as any : colors.gray[100]}
                            borderWidth={1}
                            borderColor={editRoles.includes(r.key) ? r.color as any : 'transparent'}
                            borderRadius="$2"
                            onPress={() => toggleRole(r.key, editRoles, setEditRoles)}
                          >
                            <Text fontSize="$2" color={editRoles.includes(r.key) ? r.color as any : colors.gray[500]}>{r.label}</Text>
                          </Button>
                        ))}
                      </XStack>
                      <XStack gap="$2" justifyContent="flex-end">
                        <Button size="$2" chromeless onPress={() => setEditingRoles(null)}>
                          <Text color={colors.gray[500]} fontSize="$2">Cancel</Text>
                        </Button>
                        <Button size="$2" backgroundColor={colors.green[600]} borderRadius="$2" onPress={() => handleSaveRoles(member.id)}>
                          <Text color="white" fontSize="$2" fontWeight="600">Save</Text>
                        </Button>
                      </XStack>
                    </YStack>
                  )}
                </YStack>
              )}
            </Card>
          ))}
        </YStack>
      )}

      {/* Info Note */}
      <Card padding="$3" marginTop="$3" backgroundColor={colors.blue[100]} borderRadius="$3">
        <XStack gap="$2" alignItems="flex-start">
          <Shield size={16} color={colors.blue[700]} marginTop={2} />
          <YStack flex={1}>
            <Text fontSize="$3" color={colors.blue[700]} fontWeight="500">How staff access works</Text>
            <Text fontSize="$2" color={colors.blue[700]} fontWeight="400" marginTop="$1">
              Add staff by email address. When they sign in (email or social login), the system matches their email to grant access. Status shows "Pending" until their first login, then "Linked".
            </Text>
          </YStack>
        </XStack>
      </Card>
    </YStack>
  )
}
