import { OrganizationProvider } from "@/lib/organizations/context"
import { ReactNode } from "react"

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <OrganizationProvider>{children}</OrganizationProvider>
}
