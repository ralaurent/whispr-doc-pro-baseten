"use client"

import { createContext, useContext, ReactNode, useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { getGuestSession } from "@/lib/guest-session"

export interface Organization {
  id: string
  name: string
  slug?: string
  isPersonal: boolean
}

export interface OrganizationContextType {
  userId: string | null
  userEmail: string | null
  organizations: Organization[]
  currentOrganizationId: string | null
  currentOrganization: Organization | null
  loading: boolean
  setCurrentOrganizationId: (orgId: string) => void
  addOrganization: (org: Organization) => void
}

const OrganizationContext = createContext<OrganizationContextType | undefined>(undefined)

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null)
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [organizations, setOrganizations] = useState<Organization[]>([])
  const [currentOrganizationId, setCurrentOrganizationId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  // Initialize from Supabase auth
  useEffect(() => {
    const initUser = async () => {
      try {
        // Guest session bypasses real authentication.
        const guestSession = getGuestSession()
        const user = guestSession
          ? guestSession.user
          : (await supabase.auth.getUser()).data.user

        if (!user) {
          setLoading(false)
          return
        }

        setUserId(user.id)
        setUserEmail(user.email || null)

        // Create personal org for user
        const personalOrg: Organization = {
          id: "personal",
          name: "Personal",
          isPersonal: true,
        }

        // TODO: Fetch user's organizations from Supabase if org management is implemented
        // For now, just use personal org
        setOrganizations([personalOrg])
        setCurrentOrganizationId("personal")

        setLoading(false)
      } catch (error) {
        console.error("Failed to initialize user:", error)
        setLoading(false)
      }
    }

    initUser()
  }, [supabase])

  const currentOrganization = organizations.find((org) => org.id === currentOrganizationId) || null

  const addOrganization = (org: Organization) => {
    setOrganizations((prev) => {
      const exists = prev.some((o) => o.id === org.id)
      if (exists) return prev
      return [...prev, org]
    })
  }

  const value: OrganizationContextType = {
    userId,
    userEmail,
    organizations,
    currentOrganizationId,
    currentOrganization,
    loading,
    setCurrentOrganizationId,
    addOrganization,
  }

  return <OrganizationContext.Provider value={value}>{children}</OrganizationContext.Provider>
}

export function useOrganization(): OrganizationContextType {
  const context = useContext(OrganizationContext)
  if (!context) {
    throw new Error("useOrganization must be used within OrganizationProvider")
  }
  return context
}
