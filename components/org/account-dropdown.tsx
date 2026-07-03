"use client"

import { useState } from "react"
import { useOrganization } from "@/lib/organizations/context"
import { createClient } from "@/lib/supabase/client"
import { useRouter } from "next/navigation"
import { clearGuestSession } from "@/lib/guest-session"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuCheckboxItem,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import { LogOut, Plus, Building2 } from "lucide-react"
import { CreateOrgDialog } from "./create-org-dialog"

interface AccountDropdownProps {
  userAvatarUrl?: string; // Optional prop if you have avatar images available
}

export function AccountDropdown({ userAvatarUrl }: AccountDropdownProps) {
  // Destructure user details from the organization context
  const { userEmail, organizations, currentOrganizationId, setCurrentOrganizationId } = useOrganization()
  const [showCreateOrgDialog, setShowCreateOrgDialog] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    // Clear any guest session as well as a real Supabase session.
    clearGuestSession()
    await supabase.auth.signOut()
    router.push("/auth/login")
  }

  const currentOrg = organizations.find((org) => org.id === currentOrganizationId)

  // Extract the first letter of the email to use as an initial fallback
  const getInitials = () => {
    if (!userEmail) return "?"
    return userEmail.charAt(0).toUpperCase()
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="relative h-9 w-9 rounded-full border border-border p-0 hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
          >
            {userAvatarUrl ? (
              <img
                src={userAvatarUrl}
                alt="User avatar"
                className="h-full w-full rounded-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground text-sm uppercase">
                {getInitials()}
              </div>
            )}
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-64 p-1.5" sideOffset={8}>
          {/* User profile and active organization header */}
          <DropdownMenuLabel className="font-normal px-2.5 py-2">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium leading-none text-foreground">
                {currentOrg?.name || "Personal Workspace"}
              </p>
              <p className="text-xs leading-none text-muted-foreground truncate">
                {userEmail}
              </p>
            </div>
          </DropdownMenuLabel>

          <DropdownMenuSeparator className="my-1" />

          {/* Organizations section */}
          <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">
            Workspaces
          </div>
          {organizations.map((org) => (
            <DropdownMenuCheckboxItem
              key={org.id}
              checked={currentOrganizationId === org.id}
              onCheckedChange={() => setCurrentOrganizationId(org.id)}
              className="py-2 px-2.5 cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                <div className="flex flex-col">
                  <span className="text-sm font-medium leading-tight">{org.name}</span>
                  {org.isPersonal && (
                    <span className="text-[10px] text-muted-foreground">Personal</span>
                  )}
                </div>
              </div>
            </DropdownMenuCheckboxItem>
          ))}

          <DropdownMenuSeparator className="my-1" />

          <DropdownMenuItem
            onClick={() => setShowCreateOrgDialog(true)}
            className="gap-2 py-2 px-2.5 cursor-pointer text-muted-foreground focus:text-foreground"
          >
            <Plus className="h-4 w-4" />
            <span className="text-sm">Create Organization</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator className="my-1" />

          <DropdownMenuItem
            onClick={handleLogout}
            className="gap-2 py-2 px-2.5 cursor-pointer text-destructive focus:text-destructive focus:bg-destructive/10"
          >
            <LogOut className="h-4 w-4" />
            <span className="text-sm">Sign Out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateOrgDialog open={showCreateOrgDialog} onOpenChange={setShowCreateOrgDialog} />
    </>
  )
}
