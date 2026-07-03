"use client"

import { useState, useRef, useEffect } from "react"
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Type,
  Filter,
  Layers,
  CheckSquare,
  CircleDot,
  CalendarFold,
  AlignJustify,
  PenTool,
  Loader2
} from "lucide-react"
import type { DetectedField } from "@/lib/pdf-utils"

interface LayersPanelProps {
  currentPage: number
  onPageChange: (page: number) => void
  totalPages: number
  hasPdf: boolean
  fields?: DetectedField[]
  focusedFieldName: string | null
  onFieldClick: (fieldName: string, pageNumber: number) => void
  onFieldRename: (oldName: string, newName: string) => void
  isLoading?: boolean
  isTranscribing?: boolean
}

export function LayersPanel({
  currentPage,
  onPageChange,
  totalPages,
  hasPdf,
  fields = [],
  focusedFieldName,
  onFieldClick,
  onFieldRename,
  isLoading,
  isTranscribing
}: LayersPanelProps) {
  const [editingField, setEditingField] = useState<string | null>(null)
  const [editValue, setEditValue] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const [expandedPages, setExpandedPages] = useState<Record<number, boolean>>({})
  const prevPageRef = useRef(currentPage)

  useEffect(() => {
    setExpandedPages((prev) => {
      const newState = { ...prev }
      if (prevPageRef.current && prevPageRef.current !== currentPage) {
        newState[prevPageRef.current] = false
      }
      newState[currentPage] = true
      return newState
    })
    prevPageRef.current = currentPage
  }, [currentPage])

  const fieldsByPage = fields.reduce((acc, field) => {
    const pageIndex = Number(field.rect?.pageIndex) || 0
    const pageNumber = pageIndex + 1
    if (!acc[pageNumber]) acc[pageNumber] = []
    acc[pageNumber].push(field)
    return acc
  }, {} as Record<number, DetectedField[]>)

  const pagesWithFields = Object.keys(fieldsByPage).map(Number).sort((a, b) => a - b)

  const getFieldIcon = (type: string, isSelected: boolean) => {
    switch (type) {
      case "checkbox": return <CheckSquare className={`h-4 w-4 ${isSelected ? "text-blue-500" : "text-muted-foreground"}`} />
      case "radio": return <CircleDot className={`h-4 w-4 ${isSelected ? "text-blue-500" : "text-muted-foreground"}`} />
      case "date": return <CalendarFold className={`h-4 w-4 ${isSelected ? "text-blue-500" : "text-muted-foreground"}`} />
      case "multiline": return <AlignJustify className={`h-4 w-4 ${isSelected ? "text-blue-500" : "text-muted-foreground"}`} />
      case "signature": return <PenTool className={`h-4 w-4 ${isSelected ? "text-blue-500" : "text-muted-foreground"}`} />
      default: return <Type className={`h-4 w-4 ${isSelected ? "text-blue-500" : "text-muted-foreground"}`} />
    }
  }

  const allPages = Array.from({ length: totalPages }, (_, i) => i + 1)
  const pagesToRender = allPages.length > 0 ? allPages : pagesWithFields

  const handlePageClick = (page: number) => {
    if (page === currentPage) {
      setExpandedPages((prev) => ({ ...prev, [page]: !prev[page] }))
    } else {
      setExpandedPages((prev) => {
        const newState = { ...prev }
        newState[currentPage] = false
        newState[page] = true
        return newState
      })
      onPageChange(page)
    }
  }

  return (
    <aside className="flex w-60 flex-col border-r border-border bg-background">
      <div className="flex h-12 items-center justify-between border-b border-border px-4">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Layers / Fields
        </span>
        <button className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground">
          <Filter className="h-4 w-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto py-2">
        {isLoading && !isTranscribing ? (
          <div className="flex h-full flex-col items-center justify-center px-4 text-center">
            <div className="mb-3 rounded-full bg-zinc-100 p-3">
              <Loader2 className="h-6 w-6 text-zinc-400 animate-spin" />
            </div>
            <p className="text-sm font-medium text-foreground">please wait running inference</p>
          </div>
        ) : !hasPdf ? (
          <div className="flex h-full flex-col items-center justify-center px-4 text-center">
            <div className="mb-3 rounded-full bg-zinc-100 p-3">
              <Layers className="h-6 w-6 text-zinc-400" />
            </div>
            <p className="text-sm font-medium text-foreground">No fields found</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Upload a PDF to view its layers and fields
            </p>
          </div>
        ) : fields.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No fields detected
          </div>
        ) : (
          pagesToRender.map((page) => {
            const isSelected = page === currentPage
            const elements = fieldsByPage[page] || []
            // Default to selected if not explicitly set in state
            const isExpanded = expandedPages[page] ?? isSelected

            return (
              <div key={page}>
                <button
                  onClick={() => handlePageClick(page)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors ${isSelected
                    ? "bg-sidebar-accent text-primary"
                    : "text-foreground hover:bg-muted"
                    }`}
                >
                  {isExpanded ? (
                    <ChevronDown className={`h-4 w-4 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                  ) : (
                    <ChevronRight className={`h-4 w-4 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                  )}
                  <FileText className={`h-4 w-4 ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                  <span className={isSelected ? "font-medium" : ""}>
                    Page {page}
                  </span>
                </button>
                {isExpanded && elements.length > 0 && (
                  <div className="ml-6">
                    {elements.map((element, index) => {
                      const isFieldFocused = focusedFieldName === element.name
                      const isEditing = editingField === element.name

                      return (
                        <div
                          key={index}
                          onClick={() => onFieldClick(element.name, page)}
                          onDoubleClick={(e) => {
                            e.stopPropagation()
                            setEditingField(element.name)
                            setEditValue(element.name)
                          }}
                          className={`flex items-center gap-2 py-1.5 pl-4 pr-3 text-sm transition-colors cursor-pointer overflow-hidden ${isFieldFocused ? "bg-primary/10 text-primary" : "text-foreground hover:bg-muted"
                            }`}
                        >
                          <span className="shrink-0">{getFieldIcon(element.type || "text", isEditing)}</span>
                          {isEditing ? (
                            <input
                              ref={inputRef}
                              autoFocus
                              className="h-5 w-full bg-transparent border-none outline-none focus:ring-0 p-0 text-sm font-medium"
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  onFieldRename(element.name, editValue)
                                  setEditingField(null)
                                } else if (e.key === "Escape") {
                                  setEditingField(null)
                                }
                              }}
                              onBlur={() => {
                                onFieldRename(element.name, editValue)
                                setEditingField(null)
                              }}
                            />
                          ) : (
                            <span className="truncate" title={element.name}>{element.name}</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </aside>
  )
}
