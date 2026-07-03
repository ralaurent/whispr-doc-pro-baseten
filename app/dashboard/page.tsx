'use client'

import { useCallback, useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { LayersPanel } from '@/components/layers-panel'
import { DocumentViewer } from '@/components/document-viewer'
import { DetectedField } from '@/lib/pdf-utils'
import { AccountDropdown } from '@/components/org/account-dropdown'
import { useOrganization } from '@/lib/organizations/context'
import { getGuestSession } from '@/lib/guest-session'

export default function DashboardPage() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [zoom, setZoom] = useState(100)
  const [isAssistantOpen, setIsAssistantOpen] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [fields, setFields] = useState<DetectedField[]>([])
  const [focusedFieldName, setFocusedFieldName] = useState<string | null>(null)
  const [lastRename, setLastRename] = useState<{ oldName: string; newName: string } | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [runningDemo, setRunningDemo] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)

  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const getUser = async () => {
      // Guest session bypasses real authentication.
      const guestSession = getGuestSession()
      if (guestSession) {
        setUser(guestSession.user)
        setLoading(false)
        return
      }

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        router.push('/auth/login')
        return
      }

      setUser(user)
      setLoading(false)
    }

    getUser()
  }, [router, supabase])



  const hasPdf = pdfFile !== null

  const handleFileSelect = useCallback((file: File | null) => {
    if (!file) return
    setPdfFile(file)
    setCurrentPage(1)
    setTotalPages(0)
    setFocusedFieldName(null)
  }, [])

  const handleFieldClick = useCallback((fieldName: string, pageNumber: number) => {
    setCurrentPage(pageNumber)
    setFocusedFieldName(fieldName)
  }, [])

  const handleFieldRename = useCallback(
    (oldName: string, newName: string) => {
      if (!newName || oldName === newName) return

      setFields((prev) => prev.map((f) => (f.name === oldName ? { ...f, name: newName } : f)))

      if (focusedFieldName === oldName) {
        setFocusedFieldName(newName)
      }

      setLastRename({ oldName, newName })
    },
    [focusedFieldName],
  )

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background"
        suppressHydrationWarning>
        <div className="text-lg text-muted-foreground">Loading...</div>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-background"
      suppressHydrationWarning>
      {/* Header */}
      <div className="border-b border-border flex h-14 items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="WhisprDoc" className="h-8 w-8" />
          <h1 className="text-lg font-semibold">WhisprDoc</h1>
        </div>
        <AccountDropdown />
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        <LayersPanel
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          totalPages={totalPages}
          hasPdf={hasPdf}
          fields={fields}
          focusedFieldName={focusedFieldName}
          onFieldClick={handleFieldClick}
          onFieldRename={handleFieldRename}
          isLoading={isLoading}
          isTranscribing={isTranscribing}
        />
        <DocumentViewer
          currentPage={currentPage}
          totalPages={totalPages}
          zoom={zoom}
          onZoomChange={setZoom}
          onPageChange={setCurrentPage}
          onTotalPagesChange={setTotalPages}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          isAssistantOpen={isAssistantOpen}
          onToggleAssistant={() => setIsAssistantOpen(!isAssistantOpen)}
          pdfFile={pdfFile}
          onFileSelect={handleFileSelect}
          onReset={() => {
            setPdfFile(null)
            setFocusedFieldName(null)
            setFields([])
            setZoom(100)
            setTotalPages(0)
            setCurrentPage(1)
            setSearchQuery('')
            setRunningDemo(false)
          }}
          onFieldsChange={setFields}
          focusedFieldName={focusedFieldName}
          onFocusedFieldChange={setFocusedFieldName}
          onFieldRename={handleFieldRename}
          lastRename={lastRename}
          onLoadingChange={setIsLoading}
          isAuthenticated={true}
          userId={user?.id}
          runningDemo={runningDemo}
          onTranscribingChange={setIsTranscribing}
        />
      </div>
    </div>
  )
}
