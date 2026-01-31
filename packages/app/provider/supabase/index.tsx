import { createContext, useContext, ReactNode } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from '../../utils/supabase'

const SupabaseContext = createContext<SupabaseClient | undefined>(undefined)

export const SupabaseProvider = ({ children }: { children: ReactNode }) => {
  return (
    <SupabaseContext.Provider value={supabase}>
      {children}
    </SupabaseContext.Provider>
  )
}

export const useSupabase = () => {
  const context = useContext(SupabaseContext)
  if (context === undefined) {
    throw new Error('useSupabase must be used within a SupabaseProvider')
  }
  return context
}
