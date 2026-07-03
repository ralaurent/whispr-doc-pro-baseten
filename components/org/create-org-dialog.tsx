"use client"

import { useState } from "react"
import { useOrganization } from "@/lib/organizations/context"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"

interface CreateOrgDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CreateOrgDialog({ open, onOpenChange }: CreateOrgDialogProps) {
  const [orgName, setOrgName] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const { addOrganization, setCurrentOrganizationId } = useOrganization()

  const handleCreate = async () => {
    if (!orgName.trim()) {
      toast.error("Organization name is required")
      return
    }

    setIsLoading(true)
    try {
      // Generate organization ID (in real app, this would come from the backend)
      const orgId = `org_${Date.now()}`
      const newOrg = {
        id: orgId,
        name: orgName,
        slug: orgName.toLowerCase().replace(/\s+/g, "-"),
        isPersonal: false,
      }

      // TODO: Save organization to Supabase if org management is implemented
      // For now, just add to context
      addOrganization(newOrg)
      setCurrentOrganizationId(orgId)

      toast.success(`Organization "${orgName}" created successfully`)
      setOrgName("")
      onOpenChange(false)
    } catch (error) {
      console.error("Failed to create organization:", error)
      toast.error("Failed to create organization")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Create Organization</DialogTitle>
          <DialogDescription>Create a new organization to collaborate with your team or organize your documents.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="org-name">Organization Name</Label>
            <Input
              id="org-name"
              placeholder="e.g., Acme Corp, My Team"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate()
              }}
              disabled={isLoading}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={isLoading || !orgName.trim()}>
            {isLoading ? "Creating..." : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
