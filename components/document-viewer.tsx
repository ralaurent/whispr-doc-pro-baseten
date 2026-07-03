// components/document-viewer.tsx
"use client"

import "@/lib/polyfill"
import { useCallback, useState, useRef, useEffect } from "react"
import { useForm, FormProvider } from "react-hook-form"
import { pdfjs, Document, Page } from "react-pdf"
import "react-pdf/dist/esm/Page/AnnotationLayer.css"
import "react-pdf/dist/esm/Page/TextLayer.css"
import {
  Printer,
  MousePointer2,
  Hand,
  Wand,
  ChevronLeft,
  ChevronRight,
  Minus,
  Plus,
  Search,
  MessageSquare,
  ChevronDown,
  RefreshCw,
  LocateFixed,
  FileText,
  FileSpreadsheet,
  FileType,
  CheckSquare,
  CircleDot,
  CalendarFold,
  AlignJustify,
  PenTool,
  Type,
  Play,
  Loader2
} from "lucide-react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import FileTypes from "./icons/file-types"
import { AutosaveStatus } from "./autosave-status"

import { saveRevision, updateDocument, restoreRevision } from "@/app/actions/dynamodb"
import type { DocumentRevisionItem } from "@/lib/dynamodb/schema"

import type { DetectedField, AutofilledFieldState, DetectionMode } from "@/lib/pdf-utils"
import { fillPdfFields, generateEmptyAcroForm } from "@/lib/pdf-utils"
import { detectFieldAtPositionAction, processTranscriptAction } from "@/app/actions"
import { PdfViewer } from "./pdf-viewer"
import { AudioRecorder } from "./audio-recorder-popover"
import { toast } from "sonner"

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

interface DocumentViewerProps {
  currentPage: number
  totalPages: number
  zoom: number
  onZoomChange: (zoom: number) => void
  onPageChange: (page: number) => void
  onTotalPagesChange: (total: number) => void
  searchQuery: string
  onSearchChange: (query: string) => void
  isAssistantOpen: boolean
  onToggleAssistant: () => void
  pdfFile: File | null
  onReset: () => void
  onFileSelect: (file: File | null) => void
  onFieldsChange?: (fields: DetectedField[]) => void
  focusedFieldName: string | null
  onFocusedFieldChange: (fieldName: string | null) => void
  onFieldRename: (oldName: string, newName: string) => void
  lastRename?: { oldName: string, newName: string } | null
  onLoadingChange?: (loading: boolean) => void
  isAuthenticated?: boolean
  userId?: string
  runningDemo?: boolean
  onTranscribingChange?: (transcribing: boolean) => void
  organizationId?: string
}

const MODES: { id: DetectionMode; label: string; icon: any }[] = [
  { id: "auto", label: "Auto", icon: Play },
  { id: "text", label: "Text", icon: Type },
  { id: "date", label: "Date", icon: CalendarFold },
  { id: "multiline", label: "Multiline", icon: AlignJustify },
  { id: "checkbox", label: "Checkbox", icon: CheckSquare },
  { id: "radio", label: "Radio", icon: CircleDot },
  { id: "signature", label: "Signature", icon: PenTool },
]

export function DocumentViewer({
  currentPage,
  totalPages,
  zoom,
  onZoomChange,
  onPageChange,
  onTotalPagesChange,
  searchQuery,
  onSearchChange,
  isAssistantOpen,
  onToggleAssistant,
  pdfFile,
  onReset,
  onFileSelect,
  onFieldsChange,
  focusedFieldName,
  onFocusedFieldChange,
  onFieldRename,
  lastRename,
  onLoadingChange,
  isAuthenticated = false,
  userId,
  runningDemo = false,
  onTranscribingChange,
  organizationId,
}: DocumentViewerProps) {
  const [isLocalDragging, setIsLocalDragging] = useState(false)
  const [isGlobalDragging, setIsGlobalDragging] = useState(false)
  const [isWandActive, setIsWandActive] = useState(false)
  const [isDetectionPopoverOpen, setIsDetectionPopoverOpen] = useState(false)
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [pdfBytes, setPdfBytes] = useState<ArrayBuffer | null>(null)
  const [fields, setFields] = useState<DetectedField[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [fileName, setFileName] = useState<string>("")
  const [autofilledFields, setAutofilledFields] = useState<AutofilledFieldState[]>([])
  const [detectionMode, setDetectionMode] = useState<DetectionMode | null>(null)
  const [htmlPages, setHtmlPages] = useState<{ index: number; html: string }[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [lastSaveTime, setLastSaveTime] = useState<Date | null>(null)
  const [isTranscribing, setIsTranscribing] = useState(false)

  const documentIdRef = useRef<string>(pdfFile?.name || fileName || `doc-${Date.now()}`)
  const s3KeyRef = useRef<string>(pdfFile?.name || fileName || `uploads/doc-${Date.now()}.pdf`)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragCounter = useRef(0)
  const detectionLockRef = useRef(false)
  const clickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const methods = useForm<Record<string, string | boolean>>({
    defaultValues: {},
  })

  const hasPdf = pdfFile !== null || pdfBytes !== null

  // Keep documentId and s3Key in sync with the file
  useEffect(() => {
    if (pdfFile) {
      documentIdRef.current = pdfFile.name
      s3KeyRef.current = `uploads/${pdfFile.name}`
    } else if (fileName) {
      documentIdRef.current = fileName
      s3KeyRef.current = `uploads/${fileName}`
    }
  }, [pdfFile, fileName])

  // Ensure pdfFile prop is processed if passed from parent.
  useEffect(() => {
    if (pdfFile && !pdfBytes && !isLoading) {
      handleFileProcess(pdfFile)
    }
  }, [pdfFile, pdfBytes, isLoading])

  const updateFields = useCallback(
    (update: DetectedField[] | ((prev: DetectedField[]) => DetectedField[])) => {
      setFields(update)
    },
    []
  )

  useEffect(() => {
    onFieldsChange?.(fields)
  }, [fields, onFieldsChange])

  useEffect(() => {
    onLoadingChange?.(isLoading)
  }, [isLoading, onLoadingChange])

  useEffect(() => {
    onTranscribingChange?.(isTranscribing)
  }, [isTranscribing, onTranscribingChange])

  // Sync internal state when fields are renamed from outside (e.g. LayersPanel)
  useEffect(() => {
    if (lastRename) {
      const { oldName, newName } = lastRename
      setFields(prev => prev.map(f => f.name === oldName ? { ...f, name: newName } : f))
      setAutofilledFields(prev => prev.map(af =>
        af.fieldName === oldName ? { ...af, fieldName: newName } : af
      ))
      const currentValue = methods.getValues(oldName)
      methods.setValue(newName, currentValue)
      methods.unregister(oldName)
    }
  }, [lastRename, methods])

  const getCurrentDate = () => {
    const today = new Date();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const yyyy = today.getFullYear();
    return `${mm}/${dd}/${yyyy}`;
  }

  const checkOverlap = (rect1: any, rect2: any) => {
    return (
      rect1.x < rect2.x + rect2.width &&
      rect1.x + rect1.width > rect2.x &&
      rect1.y < rect2.y + rect2.height &&
      rect1.y + rect1.height > rect2.y
    );
  }

  // Save a revision and update the main document
  const saveCurrentVersion = useCallback(async (reason: string) => {
    if (!pdfBytes || fields.length === 0) return
    setIsSaving(true)
    try {
      const currentFormFields = fields.map(f => ({
        name: f.name,
        type: f.type,
        value: methods.getValues(f.name)?.toString() ?? "",
        originalName: (f as any).originalName,
        aiAssignedName: (f as any).aiAssignedName,
      }))

      await saveRevision(
        documentIdRef.current,
        currentFormFields,
        s3KeyRef.current,
        reason,
        organizationId,
      )

      await updateDocument(
        documentIdRef.current,
        currentFormFields,
        organizationId,
        { s3Key: s3KeyRef.current }
      )

      setLastSaveTime(new Date())
    } catch (error) {
      console.error("Failed to save version:", error)
    } finally {
      setIsSaving(false)
    }
  }, [pdfBytes, fields, methods, organizationId])

  // Debounced auto‑save after field changes (skip while transcribing)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const queueAutoSave = useCallback(() => {
    if (isTranscribing) return
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => {
      saveCurrentVersion("text-edit")
    }, 2000)
  }, [saveCurrentVersion, isTranscribing])

  // Restore a selected revision
  const handleRestoreRevision = useCallback(async (revision: DocumentRevisionItem) => {
    try {
      // Server action updates the document directly and returns the restored data
      const result = await restoreRevision(documentIdRef.current, revision.revisionNumber, organizationId)

      if (!result?.success || !result.formFields) {
        throw new Error("Restore returned unexpected data")
      }

      const updates: Record<string, string | boolean> = {}
      result.formFields.forEach(f => {
        if (f.type === "checkbox" || f.type === "radio") {
          updates[f.name] = f.value === "true"
        } else {
          updates[f.name] = f.value || ""
        }
      })
      methods.reset(updates)

      setAutofilledFields(
        result.formFields.map(f => ({
          fieldName: f.name,
          type: f.type as any,
          value: f.type === "checkbox" || f.type === "radio" ? (f.value === "true") : f.value || "",
          accepted: false,
        }))
      )

      toast.success("Version restored")
    } catch (error) {
      console.error("Restore failed:", error)
      toast.error("Could not restore version")
    }
  }, [methods, organizationId])

  const handleFileProcess = useCallback(async (file: File) => {
    if (file.size === 0) {
      toast.error("Invalid File", {
        description: "The selected PDF file is empty (0 bytes).",
      })
      if (fileInputRef.current) fileInputRef.current.value = ""
      return
    }

    onFileSelect(file)
    setIsLoading(true)
    setFileName(file.name)
    updateFields([])
    methods.reset({})
    setAutofilledFields([])
    setHtmlPages([])

    try {
      const initialBuffer = await file.arrayBuffer()
      setPdfBytes(initialBuffer)

      const formData = new FormData()
      formData.append("file", file)
      const response = await fetch("/api/process-pdf", { method: "POST", body: formData })
      const data = await response.json()

      if (!response.ok) {
        toast.error("Could not process PDF", {
          description: data?.error || "This document could not be processed.",
        })
        const fallbackBuffer = await file.arrayBuffer()
        setPdfBytes(fallbackBuffer)
        updateFields([])
        methods.reset({})
        setAutofilledFields([])
        setHtmlPages([])
        return
      }

      const binary = atob(data.pdfBase64 as string)
      const renamedBytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) renamedBytes[i] = binary.charCodeAt(i)
      setPdfBytes(renamedBytes.buffer)

      if (data.htmlPages) {
        setHtmlPages(data.htmlPages)
      } else {
        setHtmlPages([])
      }

      const detectedFields: DetectedField[] = data.detectedFields ?? []
      updateFields(detectedFields)

      if (detectedFields.length === 0) {
        toast.error("No fillable fields detected", {
          description:
            "This document has no detectable AcroForm fields to fill. It may be a flat/scanned PDF.",
        })
      } else if (data.aiFailed) {
        toast.warning("AI naming unavailable", {
          description: "Showing the form's original field names.",
        })
      }

      const defaults: Record<string, string | boolean> = {}
      detectedFields.forEach((field) => {
        if (field.type === "checkbox" || field.type === "radio") {
          defaults[field.name] = false
        } else if (field.type === "date") {
          defaults[field.name] = getCurrentDate();
        } else if (field.comb && field.maxLen) {
          defaults[field.name] = "─".repeat(field.maxLen)
        } else {
          defaults[field.name] = ""
        }
      })
      methods.reset(defaults)
      setAutofilledFields([])
    } catch (error) {
      console.error("Error processing PDF:", error)
      toast.error("Error processing PDF", {
        description: error instanceof Error ? error.message : "An unexpected error occurred.",
      })
    } finally {
      setIsLoading(false)
    }
  }, [onFileSelect, methods, updateFields])

  const handleLoadSample = useCallback(async () => {
    try {
      setIsLoading(true)
      const response = await fetch('/pdf/fw9.pdf')
      if (!response.ok) throw new Error("Failed to fetch sample PDF")
      const blob = await response.blob()
      const file = new File([blob], 'fw9.pdf', { type: 'application/pdf' })
      await handleFileProcess(file)
    } catch (error) {
      console.error("Error loading sample PDF:", error)
      toast.error("Failed to load sample document")
      setIsLoading(false)
    }
  }, [handleFileProcess])

  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault()
      dragCounter.current += 1
      if (e.dataTransfer?.types.includes("Files")) setIsGlobalDragging(true)
    }
    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault()
      dragCounter.current -= 1
      if (dragCounter.current === 0) setIsGlobalDragging(false)
    }
    const handleDragOver = (e: DragEvent) => e.preventDefault()
    const handleDrop = (e: DragEvent) => {
      e.preventDefault()
      dragCounter.current = 0
      setIsGlobalDragging(false)
      const files = e.dataTransfer?.files
      if (files && files.length > 0 && files[0].type === "application/pdf") {
        handleFileProcess(files[0])
      }
    }

    window.addEventListener("dragenter", handleDragEnter)
    window.addEventListener("dragleave", handleDragLeave)
    window.addEventListener("dragover", handleDragOver)
    window.addEventListener("drop", handleDrop)

    return () => {
      window.removeEventListener("dragenter", handleDragEnter)
      window.removeEventListener("dragleave", handleDragLeave)
      window.removeEventListener("dragover", handleDragOver)
      window.removeEventListener("drop", handleDrop)
    }
  }, [handleFileProcess])

  const handleReset = useCallback(() => {
    setPdfBytes(null)
    updateFields([])
    setAutofilledFields([])
    setHtmlPages([])
    setIsWandActive(false)
    onFileSelect(null)
    onReset()
    if (fileInputRef.current) fileInputRef.current.value = ""
  }, [onFileSelect, onReset])

  const handleFileInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (files && files.length > 0 && files[0].type === "application/pdf") {
        handleFileProcess(files[0])
      }
    }, [handleFileProcess]
  )

  const handleClick = useCallback(() => fileInputRef.current?.click(), [])

  const generateSampleJson = () => {
    const sample: Record<string, string | boolean> = {}
    fields.forEach((field) => {
      if (field.type === "checkbox" || field.type === "radio") {
        sample[field.name] = true
      } else if (field.type === "dropdown" && field.options?.length) {
        sample[field.name] = field.options[0]
      } else if (field.type === "signature") {
        sample[field.name] = ""
      } else if (field.type === "date") {
        sample[field.name] = getCurrentDate()
      } else {
        sample[field.name] = String(field.name)
      }
    })
    return JSON.stringify(sample, null, 2)
  }

  const handleAutoFill = useCallback((data: Record<string, string | boolean>) => {
    const currentValues = methods.getValues()
    const mergedValues = { ...currentValues, ...data }
    methods.reset(mergedValues)
    setAutofilledFields((prev) => {
      const newFields = [...prev]
      Object.entries(data).forEach(([fieldName, value]) => {
        const index = newFields.findIndex((af) => af.fieldName === fieldName)
        if (index >= 0) {
          newFields[index] = { ...newFields[index], value, accepted: false }
        } else {
          const fieldDef = fields.find((f) => f.name === fieldName)
          if (fieldDef) {
            newFields.push({
              fieldName,
              type: fieldDef.type || "text",
              value,
              accepted: false,
            })
          }
        }
      })
      return newFields
    })
  }, [methods, fields])

  const handleWandToggle = (checked: boolean) => {
    if (checked) {
      if (!pdfBytes) {
        toast.error("No document loaded", {
          description: "Upload a PDF before using auto-fill.",
        })
        return
      }
      if (fields.length === 0) {
        toast.error("No fillable fields detected", {
          description:
            "This document has no detectable form fields to auto-fill. It may be a flat/scanned PDF or an unsupported form type.",
        })
        return
      }
      setIsWandActive(true)
      const sampleStr = generateSampleJson()
      const sampleData = JSON.parse(sampleStr)
      handleAutoFill(sampleData)
    } else {
      setIsWandActive(false)
      setAutofilledFields([])
    }
  }

  const handlePointDetection = useCallback(
    async (pageIndex: number, x: number, y: number, mode: DetectionMode) => {
      if (!pdfBytes || detectionLockRef.current) return;
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;
        setDetectionMode(null);
        return;
      }

      clickTimeoutRef.current = setTimeout(async () => {
        clickTimeoutRef.current = null;
        detectionLockRef.current = true;
        try {
          const blob = new Blob([pdfBytes], { type: 'application/pdf' });
          const formData = new FormData();
          formData.append("file", blob, fileName || "document.pdf");

          const newField = await detectFieldAtPositionAction(formData, pageIndex, x, y, mode);

          if (newField && newField.rect) {
            if (newField.type === "multiline" && newField.rect.height < 20) return;

            const hasInvalidOverlap = fields.some(existingField => {
              if (!existingField.rect || !newField.rect) return false;
              if (existingField.rect.pageIndex !== newField.rect.pageIndex) return false;

              if (newField.type === 'text' || newField.type === 'multiline') {
                const isExactDuplicate =
                  Math.abs(existingField.rect.x - newField.rect.x) < 1 &&
                  Math.abs(existingField.rect.y - newField.rect.y) < 1 &&
                  Math.abs(existingField.rect.width - newField.rect.width) < 1 &&
                  Math.abs(existingField.rect.height - newField.rect.height) < 1;
                if (isExactDuplicate) return true;

                if (existingField.type === 'signature') {
                  const r1 = existingField.rect;
                  const r2 = newField.rect;
                  const intersectLeft = Math.max(r1.x, r2.x);
                  const intersectTop = Math.max(r1.y, r2.y);
                  const intersectRight = Math.min(r1.x + r1.width, r2.x + r2.width);
                  const intersectBottom = Math.min(r1.y + r1.height, r2.y + r2.height);
                  const intersectWidth = Math.max(0, intersectRight - intersectLeft);
                  const intersectHeight = Math.max(0, intersectBottom - intersectTop);
                  const intersectionArea = intersectWidth * intersectHeight;
                  const newFieldArea = r2.width * r2.height;

                  if (newFieldArea > 0 && (intersectionArea / newFieldArea) >= 0.40) return true;
                }
                return false;
              }

              const intersects = checkOverlap(existingField.rect, newField.rect);
              if (!intersects) return false;
              if (newField.type !== "signature") return true;

              const r1 = existingField.rect;
              const r2 = newField.rect;
              const intersectLeft = Math.max(r1.x, r2.x);
              const intersectTop = Math.max(r1.y, r2.y);
              const intersectRight = Math.min(r1.x + r1.width, r2.x + r2.width);
              const intersectBottom = Math.min(r1.y + r1.height, r2.y + r2.height);
              const intersectWidth = Math.max(0, intersectRight - intersectLeft);
              const intersectHeight = Math.max(0, intersectBottom - intersectTop);
              const intersectionArea = intersectWidth * intersectHeight;
              const newFieldArea = r2.width * r2.height;

              return newFieldArea > 0 && (intersectionArea / newFieldArea) > 0.40;
            });

            if (hasInvalidOverlap) return;

            const baseName = newField.name;
            let uniqueName = baseName;
            let counter = 2;
            while (fields.some((f) => f.name === uniqueName)) {
              uniqueName = `${baseName}_${counter}`;
              counter++;
            }
            newField.name = uniqueName;

            updateFields(prev => [...prev, newField]);

            let defaultValue: string | boolean = "";
            if (newField.type === "checkbox" || newField.type === "radio") defaultValue = false;
            else if (newField.type === "signature") defaultValue = "";
            else if (newField.type === "date") defaultValue = getCurrentDate();
            else defaultValue = newField.name;

            methods.setValue(newField.name, defaultValue);
            setAutofilledFields(prev => [...prev, {
              fieldName: newField.name,
              type: newField.type,
              value: defaultValue,
              accepted: false
            }])
          }
        } catch (e) {
          console.error("Point detection failed:", e);
        } finally {
          setTimeout(() => { detectionLockRef.current = false; }, 500);
        }
      }, 250);
    }, [pdfBytes, fileName, methods, fields]
  );

  const handleFieldResize = useCallback((fieldName: string, width: number, height: number, fontSize?: number) => {
    updateFields((prev) =>
      prev.map((f) => {
        if (f.name === fieldName && f.rect) {
          return { ...f, rect: { ...f.rect, width, height }, ...(fontSize ? { fontSize } : {}) }
        }
        return f
      })
    )
  }, [])

  const handleFieldRelocate = useCallback(async (fieldName: string, pageIndex: number, x: number, y: number) => {
    if (!pdfBytes) return;
    const currentField = fields.find(f => f.name === fieldName);
    if (!currentField || !currentField.rect) return;

    updateFields(prev => prev.map(f => f.name === fieldName ? { ...f, rect: { ...f.rect!, x, y }, paddingTop: 0 } : f));

    try {
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      const formData = new FormData();
      formData.append("file", blob, fileName || "document.pdf");

      let detectX = x;
      let detectY = y;
      if (currentField.type === 'signature' || currentField.type === 'multiline') {
        detectX = x + (currentField.rect.width / 2);
        detectY = y + (currentField.rect.height / 2);
      }

      const snappedField = await detectFieldAtPositionAction(
        formData, pageIndex, x, y, currentField.type as DetectionMode, true, currentField.rect.width, currentField.rect.height
      );

      if (snappedField && snappedField.rect) {
        if (currentField.type === 'multiline' && snappedField.rect.height < 30) return;
        if (['text', 'multiline', 'signature'].includes(currentField.type)) {
          const w = snappedField.rect.width;
          const h = snappedField.rect.height;
          const isSmallSquare = (w < 40 && h < 40 && Math.abs(w - h) < 5);
          if (snappedField.type === 'checkbox' || snappedField.type === 'radio' || isSmallSquare) {
            if (currentField.type !== 'signature' || snappedField.type !== 'signature') return;
          }
        }
        if (currentField.type === 'text') {
          if (currentField.rect.width > (snappedField.rect.width + 2) || currentField.rect.height > (snappedField.rect.height + 2)) return;
        }

        const isOccupied = fields.some(other => {
          if (other.name === fieldName) return false;
          if (!other.rect || other.rect.pageIndex !== pageIndex) return false;
          const intersects = checkOverlap(snappedField.rect, other.rect);
          if (!intersects) return false;

          if (currentField.type === 'signature') {
            const r1 = snappedField.rect;
            const r2 = other.rect;
            if (!r1 || !r2) return false;
            const intersectLeft = Math.max(r1.x, r2.x);
            const intersectTop = Math.max(r1.y, r2.y);
            const intersectRight = Math.min(r1.x + r1.width, r2.x + r2.width);
            const intersectBottom = Math.min(r1.y + r1.height, r2.y + r2.height);
            const intersectionArea = Math.max(0, intersectRight - intersectLeft) * Math.max(0, intersectBottom - intersectTop);
            const snappedArea = r1.width * r1.height;
            return snappedArea > 0 && (intersectionArea / snappedArea) > 0.50;
          }
          return true;
        });

        if (!isOccupied) {
          updateFields(prev => prev.map(f => f.name === fieldName ? { ...f, rect: snappedField.rect, paddingTop: snappedField.paddingTop } : f));
        }
      }
    } catch (e) {
      console.error("Relocation failed:", e);
    }
  }, [pdfBytes, fileName, fields])

  const handleBatchFieldChange = useCallback((updates: Record<string, string | boolean>) => {
    Object.entries(updates).forEach(([fieldName, value]) => methods.setValue(fieldName, value))
    setAutofilledFields((prev) => {
      let newFields = [...prev]
      Object.entries(updates).forEach(([fieldName, value]) => {
        const index = newFields.findIndex(af => af.fieldName === fieldName)
        if (index >= 0) {
          newFields[index] = { ...newFields[index], value }
        } else {
          const fieldDef = fields.find(f => f.name === fieldName)
          newFields.push({ fieldName, type: fieldDef?.type || "text", value, accepted: false })
        }
      })
      return newFields
    })
    // Queue auto‑save after batch change
    queueAutoSave()
  }, [methods, fields, queueAutoSave])

  const handleFieldChange = useCallback((fieldName: string, value: string | boolean) => {
    methods.setValue(fieldName, value)
    setAutofilledFields((prev) => prev.map((af) => (af.fieldName === fieldName ? { ...af, value } : af)))
    // Queue auto‑save after single field change
    queueAutoSave()
  }, [methods, queueAutoSave])

  const handleAcceptField = useCallback((fieldName: string) => {
    setAutofilledFields((prev) => prev.map((af) => (af.fieldName === fieldName ? { ...af, accepted: true } : af)))
  }, [])

  const handleAcceptAll = useCallback(() => {
    const currentPageFieldNames = new Set(
      fields
        .filter((field) => field.rect && field.rect.pageIndex === currentPage - 1)
        .map((field) => field.name)
    )
    setAutofilledFields((prev) =>
      prev.map((af) =>
        currentPageFieldNames.has(af.fieldName) && af.type !== "signature"
          ? { ...af, accepted: true }
          : af
      )
    )
  }, [fields, currentPage])

  const handleFieldEdit = useCallback((fieldName: string) => {
    setAutofilledFields((prev) => prev.map((af) => (af.fieldName === fieldName ? { ...af, accepted: false } : af)))
  }, [])

  const handleDeleteField = useCallback((fieldName: string) => {
    setAutofilledFields((prev) => prev.filter((af) => af.fieldName !== fieldName))
    updateFields((prev) => prev.filter((f) => f.name !== fieldName))
  }, [])

  const handleTranscript = useCallback(async (text: string) => {
    if (!text.trim() || fields.length === 0) return;

    setIsTranscribing(true);
    try {
      const schema: Record<string, "string" | "boolean"> = {};

      fields.forEach((field) => {
        if (["text", "multiline", "date"].includes(field.type)) {
          schema[field.name] = "string";
        } else if (["radio", "checkbox"].includes(field.type)) {
          schema[field.name] = "boolean";
        }
      });

      const validatedUpdates = await processTranscriptAction(text, schema);

      if (validatedUpdates && Object.keys(validatedUpdates).length > 0) {
        handleBatchFieldChange(validatedUpdates);
        onFocusedFieldChange("__temp_hide__");
        setTimeout(() => onFocusedFieldChange(null), 1500);

        // Save a revision after a successful transcription
        saveCurrentVersion("ai-transcribe");
      }
    } catch (error) {
      console.error("Failed to process transcript:", error);
    } finally {
      setIsTranscribing(false);
    }
  }, [fields, handleBatchFieldChange, onFocusedFieldChange, saveCurrentVersion]);

  const exportPdf = useCallback(async (openInNewTab: boolean) => {
    if (!pdfBytes) return
    setIsLoading(true)
    try {
      const formData = methods.getValues()
      const activeFields = fields.filter((field) => autofilledFields.some((af) => af.fieldName === field.name))
      const filledPdfBytes = await fillPdfFields(pdfBytes, formData, activeFields)
      const blob = new Blob([filledPdfBytes as any], { type: "application/pdf" })
      const url = URL.createObjectURL(blob)

      if (openInNewTab) {
        window.open(url, "_blank")
      } else {
        const link = document.createElement("a")
        link.href = url
        link.download = fileName.replace(".pdf", "_filled.pdf")
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      }
    } catch (error) {
      console.error("Error exporting PDF:", error)
    } finally {
      setIsLoading(false)
    }
  }, [pdfBytes, methods, fileName, fields, autofilledFields])

  const downloadAcroForm = useCallback(async () => {
    if (!pdfBytes) return
    setIsLoading(true)
    try {
      const acroFormBytes = await generateEmptyAcroForm(pdfBytes, fields)
      const blob = new Blob([acroFormBytes as any], { type: "application/pdf" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = fileName.replace(".pdf", "_editable_form.pdf")
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (error) {
      console.error("Error creating AcroForm:", error)
    } finally {
      setIsLoading(false)
    }
  }, [pdfBytes, fields, fileName])

  const hasPendingFields = autofilledFields.some((f) => !f.accepted)

  return (
    <FormProvider {...methods}>
      <div className="flex flex-1 overflow-hidden relative">
        <div className="flex flex-1 flex-col overflow-hidden relative">
          {/* Toolbar */}
          <div className="flex h-12 shrink-0 items-center overflow-x-auto border-b border-border bg-background px-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  disabled={!hasPdf}
                  className="flex h-8 items-center gap-1 rounded p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
                >
                  <Printer className="h-4 w-4" />
                  <ChevronDown className="h-3 w-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={downloadAcroForm}>
                  <FileTypes type="xfa" />
                  Download AcroForm</DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportPdf(false)} disabled={hasPendingFields}>
                  <FileTypes type="pdf" />
                  {hasPendingFields ? "Approve All to Download" : "Download PDF"}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <button
              onClick={handleReset}
              disabled={!hasPdf}
              title="Reset Viewer"
              className="ml-1 flex h-8 w-8 items-center justify-center rounded p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <RefreshCw className="h-4 w-4" />
            </button>

            {hasPdf && (
              <>
                <AutosaveStatus
                  documentId={documentIdRef.current}
                  organizationId={organizationId}
                  isSaving={isSaving}
                  lastSaveTime={lastSaveTime}
                  onRestore={handleRestoreRevision}
                />
                <button className="flex h-8 w-8 items-center justify-center rounded p-2 text-foreground hover:bg-muted">
                  <MousePointer2 className="h-4 w-4" />
                </button>
                <button className="flex h-8 w-8 items-center justify-center rounded p-2 text-muted-foreground hover:bg-muted hover:text-foreground">
                  <Hand className="h-4 w-4" />
                </button>

                <Popover open={isWandActive} onOpenChange={handleWandToggle}>
                  <PopoverTrigger asChild>
                    <button
                      className={`flex h-8 w-8 items-center justify-center rounded p-2 transition-colors ${isWandActive
                        ? "bg-blue-50 text-blue-500"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        }`}
                    >
                      {isLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Wand className="h-4 w-4" />
                      )}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="center"
                    sideOffset={4}
                    className="w-auto p-1"
                    onInteractOutside={(e) => e.preventDefault()}
                    onEscapeKeyDown={(e) => e.preventDefault()}
                  >
                    <div className="flex items-center gap-1">
                      <Popover open={isDetectionPopoverOpen} onOpenChange={setIsDetectionPopoverOpen}>
                        <PopoverTrigger asChild>
                          <button
                            onClick={(e) => {
                              if (detectionMode) {
                                e.preventDefault();
                                setDetectionMode(null);
                              } else {
                                setDetectionMode("auto");
                              }
                            }}
                            onMouseEnter={() => {
                              if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                              setIsDetectionPopoverOpen(true);
                            }}
                            onMouseLeave={() => {
                              hoverTimeoutRef.current = setTimeout(() => setIsDetectionPopoverOpen(false), 150);
                            }}
                            className={`flex h-8 w-8 items-center justify-center rounded hover:bg-muted ${detectionMode ? "bg-blue-50 text-blue-500" : "text-muted-foreground hover:text-foreground"}`}>
                            <LocateFixed className="h-4 w-4" />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          align="center"
                          sideOffset={4}
                          className="w-48 p-2 mt-1 z-[60]"
                          onMouseEnter={() => {
                            if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                            setIsDetectionPopoverOpen(true);
                          }}
                          onMouseLeave={() => {
                            hoverTimeoutRef.current = setTimeout(() => setIsDetectionPopoverOpen(false), 150);
                          }}
                        >
                          <div className="flex flex-col gap-1">
                            {MODES.map((m) => (
                              <button
                                key={m.id}
                                className={`flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded-sm hover:bg-muted transition-colors ${detectionMode === m.id ? "bg-accent/50" : ""}`}
                                onClick={() => setDetectionMode(detectionMode === m.id ? null : m.id)}
                              >
                                <m.icon className="h-4 w-4" />
                                <span>{m.label}</span>
                              </button>
                            ))}
                          </div>
                        </PopoverContent>
                      </Popover>

                      <AudioRecorder
                        onTranscript={handleTranscript}
                        isLoading={isLoading || isTranscribing}
                      />
                    </div>
                  </PopoverContent>
                </Popover>

                <div className="mx-2 h-5 w-px bg-border" />
                <div className="flex items-center">
                  <button
                    onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="flex h-8 w-8 items-center justify-center rounded p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <div className="flex items-center gap-1 px-1 text-sm">
                    <input
                      type="text"
                      value={currentPage}
                      onChange={(e) => {
                        const val = parseInt(e.target.value)
                        if (!isNaN(val) && val >= 1 && val <= totalPages) {
                          onPageChange(val)
                        }
                      }}
                      className="w-6 rounded border border-border bg-background px-1 py-0.5 text-center text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                    />
                    <span className="text-muted-foreground">/</span>
                    <span className="text-muted-foreground">{totalPages}</span>
                  </div>
                  <button
                    onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="flex h-8 w-8 items-center justify-center rounded p-2 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40 disabled:hover:bg-transparent"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                <div className="mx-2 h-5 w-px bg-border" />
                <div className="flex items-center">
                  <button
                    onClick={() => onZoomChange(Math.max(25, zoom - 25))}
                    className="flex h-8 w-8 items-center justify-center rounded p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="flex h-8 items-center gap-1 rounded px-2 text-sm text-foreground hover:bg-muted">
                        {zoom}%
                        <ChevronDown className="h-3 w-3 text-muted-foreground" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="center">
                      <DropdownMenuItem onClick={() => onZoomChange(50)}>50%</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onZoomChange(75)}>75%</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onZoomChange(100)}>100%</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onZoomChange(125)}>125%</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onZoomChange(150)}>150%</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onZoomChange(200)}>200%</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <button
                    onClick={() => onZoomChange(Math.min(200, zoom + 25))}
                    className="flex h-8 w-8 items-center justify-center rounded p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </>
            )}

            <div className="flex-1" />

            {hasPdf && (
              <div className="relative flex items-center">
                <Search className="absolute left-2.5 h-3.5 w-3.5 text-zinc-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  placeholder="Search document..."
                  className="h-7 w-44 rounded-full bg-zinc-100 pl-8 pr-3 text-xs text-zinc-700 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-300"
                />
              </div>
            )}

            {!isAssistantOpen && (
              <button
                onClick={onToggleAssistant}
                className="ml-2 flex h-8 w-8 items-center justify-center rounded p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <MessageSquare className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className={`relative flex-1 overflow-auto ${hasPdf ? "bg-zinc-200" : "bg-white"}`}>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              onChange={handleFileInputChange}
              className="hidden"
            />

            {!hasPdf ? (
              <div className={`flex h-full w-full items-center justify-center transition-all ${isGlobalDragging ? "p-8" : "p-4"}`}>
                <div className={`flex flex-col w-full transition-all ${isGlobalDragging ? "h-full" : "max-w-3xl"}`}>
                  {!isGlobalDragging && (
                    <h1 className="text-xl font-semibold text-slate-800 mb-6">Upload File</h1>
                  )}

                  <div className={`grid transition-all ${isGlobalDragging ? "grid-cols-1 h-full" : "grid-cols-1 md:grid-cols-2 gap-8 md:gap-12"}`}>
                    <div className={`flex flex-col transition-all ${isGlobalDragging ? "h-full" : ""}`}>
                      {!isGlobalDragging && (
                        <h2 className="text-sm font-semibold text-slate-700 mb-3">File Uploader</h2>
                      )}
                      <div
                        onClick={handleClick}
                        onDragEnter={() => setIsLocalDragging(true)}
                        onDragLeave={() => setIsLocalDragging(false)}
                        className={`relative flex flex-col items-center justify-center border-dashed rounded-xl cursor-pointer transition-all duration-300 ${isLocalDragging || isGlobalDragging
                          ? "border-blue-500 bg-blue-50/80 shadow-inner"
                          : "border-slate-300 bg-slate-50 hover:border-slate-400"
                          } ${isGlobalDragging
                            ? "h-full border-4 rounded-[3rem] bg-blue-50/95"
                            : "h-64 border-2"
                          }`}
                      >
                        <div className="text-center flex flex-col items-center">
                          {isGlobalDragging ? (
                            <>
                              <div className="relative h-10 w-10 animate-bounce text-blue-600">
                                <FileText className="h-10 w-10 absolute top-0 left-[-20px] z-10 rotate-[-8deg]" fill='#FFF' />
                                <FileSpreadsheet className="h-10 w-10 absolute top-[-12px] left-1/2 transform -translate-x-1/2 z-0" fill='#FFF' />
                                <FileType className="h-10 w-10 absolute top-[2px] right-[-20px] z-10 rotate-[8deg]" fill='#FFF' />
                              </div>
                              <h2 className="text-2xl font-bold text-blue-600">Drop Files here / Upload files</h2>
                              <p className="mt-4 text-lg text-blue-500/70">Release to upload your PDF instantly</p>
                            </>
                          ) : (
                            <>
                              <p className="text-slate-800 font-medium mb-2">Drop files here</p>
                              <p className="text-slate-400 text-sm mb-4">Or</p>
                              <button className="px-6 py-2 rounded-full border border-blue-400 text-blue-500 font-medium hover:bg-blue-50 transition-colors">
                                Upload file
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {!isGlobalDragging && (
                      <div className="flex flex-col">
                        <h2 className="text-sm font-semibold text-slate-700 mb-3">Try a sample document</h2>
                        <button
                          onClick={handleLoadSample}
                          disabled={isLoading}
                          className="group relative flex flex-col items-center justify-between h-64 border border-slate-200 rounded-xl hover:shadow-md transition-all bg-slate-50 overflow-hidden focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity z-10 flex items-center justify-center">
                            <div className="bg-white text-blue-600 font-medium px-4 py-2 rounded-full shadow-lg transform translate-y-4 group-hover:translate-y-0 transition-all">
                              Load Sample
                            </div>
                          </div>
                          <div className="w-full h-48 flex justify-center pt-4 overflow-hidden pointer-events-none">
                            <Document file="/pdf/fw9.pdf" loading={null}>
                              <Page
                                pageNumber={1}
                                width={180}
                                renderTextLayer={false}
                                renderAnnotationLayer={false}
                                className="shadow-sm border border-slate-200 bg-white"
                                loading={null}
                              />
                            </Document>
                          </div>
                          <div className="w-full flex items-center justify-between px-4 py-3 bg-white border-t border-slate-200 z-20">
                            <div className="text-left">
                              <p className="text-sm font-medium text-slate-800 truncate">fw9.pdf</p>
                              <p className="text-xs text-slate-500">Tax Form</p>
                            </div>
                            <FileText className="h-5 w-5 text-blue-500" />
                          </div>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex min-h-full w-full justify-center py-8">
                {isTranscribing && (
                  <div className="absolute inset-0 z-[100] flex items-center justify-center bg-zinc-200/50 backdrop-blur-sm">
                    <div className="flex flex-col items-center justify-center rounded-xl bg-white px-8 py-6 shadow-xl border border-border text-center">
                      <div className="mb-3 rounded-full bg-zinc-100 p-3">
                        <Loader2 className="h-6 w-6 text-zinc-400 animate-spin" />
                      </div>
                      <p className="text-sm font-medium text-foreground">please wait running inference</p>
                      <p className="mt-1 text-xs text-muted-foreground">The transcription process may take some time.</p>
                    </div>
                  </div>
                )}
                {pdfBytes && (
                  <PdfViewer
                    pdfData={pdfBytes}
                    fields={fields}
                    autofilledFields={autofilledFields}
                    searchQuery={searchQuery}
                    pageNumber={currentPage}
                    scale={zoom / 100}
                    detectionMode={detectionMode}
                    onCancelDetectionMode={() => setDetectionMode(null)}
                    onTotalPagesChange={onTotalPagesChange}
                    onFieldChange={handleFieldChange}
                    onAcceptField={handleAcceptField}
                    onAcceptAll={handleAcceptAll}
                    onDeleteField={handleDeleteField}
                    onBatchFieldChange={handleBatchFieldChange}
                    onFieldEdit={handleFieldEdit}
                    onDetectField={handlePointDetection}
                    onRelocateField={handleFieldRelocate}
                    onResizeField={handleFieldResize}
                    focusedFieldName={focusedFieldName}
                    onFocusedFieldChange={onFocusedFieldChange}
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </FormProvider>
  )
}