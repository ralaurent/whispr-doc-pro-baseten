// components/autosave-status.tsx
'use client'

import { useState, useEffect, useMemo } from 'react'
import { Cloud, CloudCheck, Loader2, ChevronDown, Type, Mic } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { getRevisionHistory } from '@/app/actions/dynamodb'
import { formatDistanceToNow } from 'date-fns'

import type { DocumentRevisionItem } from '@/lib/dynamodb/schema'

interface AutosaveStatusProps {
  documentId: string
  organizationId?: string
  isSaving?: boolean
  lastSaveTime?: Date | null
  onRestore?: (revision: DocumentRevisionItem) => void
}

type FilterMode = 'text' | 'audio'

export function AutosaveStatus({
  documentId,
  organizationId,
  isSaving = false,
  lastSaveTime,
  onRestore,
}: AutosaveStatusProps) {
  const [revisions, setRevisions] = useState<DocumentRevisionItem[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [filterMode, setFilterMode] = useState<FilterMode>('text')

  useEffect(() => {
    if (open) {
      loadRevisions()
    }
  }, [open])

  const loadRevisions = async () => {
    if (!documentId) return
    setLoading(true)
    try {
      const history = await getRevisionHistory(documentId, organizationId)
      setRevisions(history || [])
    } catch (error) {
      console.error('Failed to load revision history:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleRestore = (revision: DocumentRevisionItem) => {
    if (onRestore) {
      onRestore(revision)
    }
    setOpen(false)
  }

  const filteredRevisions = useMemo(() => {
    return revisions.filter((rev) => {
      if (filterMode === 'audio') {
        return rev.reason === 'ai-transcribe'
      } else {
        return ['text-edit', 'autosave', 'manual_save', 'upload'].includes(rev.reason)
      }
    })
  }, [revisions, filterMode])

  const showCheck = lastSaveTime && !isSaving
  const icon = isSaving ? (
    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
  ) : showCheck ? (
    <CloudCheck className="w-4 h-4 text-green-600" />
  ) : (
    <Cloud className="w-4 h-4 text-muted-foreground" />
  )

  return (
    <div className="flex items-center gap-1">
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="flex h-8 items-center gap-1.5 rounded px-2 text-xs font-normal text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-0 focus-visible:ring-offset-0"
          >
            {icon}
            {lastSaveTime && (
              <span>
                {isSaving
                  ? 'Saving...'
                  : `Saved ${formatDistanceToNow(lastSaveTime, { addSuffix: true })}`}
              </span>
            )}
            <ChevronDown className="w-3 h-3 opacity-70" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-64 p-0">
          <div className="p-2 border-b border-border">
            <div className="text-xs font-semibold mb-2">Version History</div>

            <div className="flex bg-muted rounded-md p-1">
              <button
                onClick={(e) => { e.stopPropagation(); setFilterMode('text') }}
                className={`flex-1 flex items-center justify-center gap-1.5 text-xs py-1 rounded-sm transition-colors ${filterMode === 'text' ? 'bg-background shadow-sm font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <Type className="w-3.5 h-3.5" />
                Text Edits
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setFilterMode('audio') }}
                className={`flex-1 flex items-center justify-center gap-1.5 text-xs py-1 rounded-sm transition-colors ${filterMode === 'audio' ? 'bg-background shadow-sm font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <Mic className="w-3.5 h-3.5" />
                Transcripts
              </button>
            </div>
          </div>

          <div className="max-h-[300px] overflow-y-auto p-1">
            {loading ? (
              <div className="px-2 py-4 text-xs text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                Loading versions...
              </div>
            ) : filteredRevisions.length === 0 ? (
              <div className="px-2 py-4 text-xs text-muted-foreground text-center">
                No {filterMode === 'audio' ? 'transcript' : 'text edit'} versions found
              </div>
            ) : (
              filteredRevisions.map((revision, index) => {
                const versionNumber = filteredRevisions.length - index

                let reasonLabel = 'Text Edit'
                if (revision.reason === 'upload') reasonLabel = 'Original Upload'
                if (revision.reason === 'autosave' || revision.reason === 'text-edit') reasonLabel = 'Auto-saved Edit'
                if (revision.reason === 'manual_save') reasonLabel = 'Manual Save'
                if (revision.reason === 'ai-transcribe') reasonLabel = 'Audio Transcript'

                return (
                  <DropdownMenuItem
                    key={`${revision.revisionNumber}-${revision.timestamp}`}
                    onClick={() => handleRestore(revision)}
                    className="flex flex-col items-start gap-1 cursor-pointer py-2"
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-xs font-semibold">
                        v{versionNumber} <span className="font-normal text-muted-foreground ml-1">· {reasonLabel}</span>
                      </span>
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      {formatDistanceToNow(new Date(revision.timestamp), {
                        addSuffix: true,
                      })}
                    </span>
                  </DropdownMenuItem>
                )
              })
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
      <div className="mx-2 h-5 w-px bg-border" />
    </div>
  )
}