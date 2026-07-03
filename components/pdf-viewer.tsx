"use client"

import { useState, useRef, useCallback, useEffect, useMemo } from "react"
import { Document, Page, pdfjs } from "react-pdf"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  Loader2,
  Check,
  X,
  Feather,
  Trash2,
  RotateCcw,
  AlertTriangle,
  Move
} from "lucide-react"
import type { DetectedField, AutofilledFieldState, DetectionMode } from "@/lib/pdf-utils"
import fitty from "fitty"
import "react-pdf/dist/Page/AnnotationLayer.css"
import "react-pdf/dist/Page/TextLayer.css"
import SignaturePad from "./signature-pad"
import { IMaskInput } from "react-imask"
import { cn } from "@/lib/utils"

pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`

interface HighlightRect {
  left: number
  top: number
  width: number
  height: number
}

function escapeRegExp(string: string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

interface PdfViewerProps {
  pdfData: ArrayBuffer
  fields: DetectedField[]
  autofilledFields: AutofilledFieldState[]
  pageNumber: number
  searchQuery: string
  scale: number
  detectionMode: DetectionMode | null
  onCancelDetectionMode?: () => void
  onTotalPagesChange: (total: number) => void
  onFieldChange: (fieldName: string, value: string | boolean) => void
  onBatchFieldChange?: (updates: Record<string, string | boolean>) => void
  onAcceptField: (fieldName: string) => void
  onAcceptAll: () => void
  onFieldEdit: (fieldName: string) => void
  onDeleteField: (fieldName: string) => void
  onDetectField?: (pageIndex: number, x: number, y: number, mode: DetectionMode) => void
  onRelocateField?: (fieldName: string, pageIndex: number, x: number, y: number) => void
  onResizeField?: (fieldName: string, width: number, height: number, fontSize?: number) => void
  focusedFieldName: string | null
  onFocusedFieldChange: (fieldName: string | null) => void
}

interface ScalableFieldProps {
  value: string
  width: number
  height: number
  paddingTop?: number
  isMultiline?: boolean
  isComb?: boolean
  maxLen?: number
  cursorClass?: string
  fontSize?: number
  isDate?: boolean
  onChange: (val: string) => void
  onFocus?: () => void
  onBlur?: () => void
  onInputClick?: (e: React.MouseEvent) => void
  onComputedFontSize?: (size: number) => void
}

function ScalableField({ value, width, height, paddingTop, isMultiline, isComb, maxLen, cursorClass, fontSize, isDate, onChange, onFocus, onBlur, onInputClick, onComputedFontSize }: ScalableFieldProps) {

  const [isEditing, setIsEditing] = useState(false)
  const [effectiveFontSize, setEffectiveFontSize] = useState<number>(fontSize || 12)

  const textRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const textAreaRef = useRef<HTMLTextAreaElement>(null)
  const combInputRefs = useRef<(HTMLInputElement | null)[]>([])

  useEffect(() => {
    if (fontSize) {
      setEffectiveFontSize(fontSize)
    }
  }, [fontSize])

  useEffect(() => {
    if (!isEditing && !isMultiline && textRef.current) {
      const element = textRef.current
      const fit = fitty(element, {
        minSize: 6,
        maxSize: fontSize || height,
        multiLine: false,
      })

      const onFit = (e: any) => {
        const newSize = e.detail.newValue
        if (newSize) {
          setEffectiveFontSize(newSize)
          if (onComputedFontSize) onComputedFontSize(newSize)
        }
      }

      element.addEventListener("fit", onFit)
      fit.fit()

      return () => {
        element.removeEventListener("fit", onFit)
        fit.unsubscribe()
      }
    }
  }, [value, width, height, isEditing, isMultiline, fontSize])

  useEffect(() => {
    if (isEditing) {
      if (inputRef.current) inputRef.current.focus()
      if (textAreaRef.current) textAreaRef.current.focus()
    }
  }, [isEditing])

  const handleClick = (e: React.MouseEvent) => {
    if (onInputClick) onInputClick(e)
    if (onFocus) onFocus()

    if (!isEditing) {
      let caretIndex = value.length
      const doc = document as any

      if (doc.caretPositionFromPoint) {
        const point = doc.caretPositionFromPoint(e.clientX, e.clientY)
        if (point && point.offsetNode.nodeType === 3) {
          caretIndex = point.offset
        }
      } else if (doc.caretRangeFromPoint) {
        const range = doc.caretRangeFromPoint(e.clientX, e.clientY)
        if (range && range.startContainer.nodeType === 3) {
          caretIndex = range.startOffset
        }
      }

      setIsEditing(true)

      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus()
          inputRef.current.setSelectionRange(caretIndex, caretIndex)
        }
        if (textAreaRef.current) {
          textAreaRef.current.focus()
          textAreaRef.current.setSelectionRange(caretIndex, caretIndex)
        }
      }, 0)
    }
  }

  const currentFontSize = `${effectiveFontSize}px`

  if (isMultiline) {
    if (isEditing) {
      return (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          onBlur={() => {
            setIsEditing(false)
            if (onBlur) onBlur()
          }}
          onClick={handleClick}
          ref={textAreaRef}
          className={cn(
            "absolute inset-0 z-10 w-full h-full bg-transparent resize-none border-none outline-none focus:ring-0 text-black font-medium leading-tight"
          )}
          style={{
            width,
            height,
            fontSize: currentFontSize,
            lineHeight: "1.2",
            boxSizing: "border-box",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            paddingTop: `${paddingTop ?? 2}px`,
            paddingLeft: "4px",
            paddingRight: "4px",
            paddingBottom: "2px",
            fontFamily: "Arial, Helvetica, sans-serif",
          }}
        />
      )
    }

    return (
      <div
        onClick={handleClick}
        className={cn(
          "absolute inset-0 z-10 w-full h-full bg-transparent leading-tight text-black font-medium overflow-hidden whitespace-pre-wrap break-words",
          cursorClass
        )}
        style={{
          width,
          height,
          fontSize: currentFontSize,
          lineHeight: "1.2",
          boxSizing: "border-box",
          paddingTop: `${paddingTop ?? 2}px`,
          paddingLeft: "4px",
          paddingRight: "4px",
          paddingBottom: "2px",
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        {value}
      </div>
    )
  }

  return (
    <div style={{ width, height }}
      onClick={handleClick}
      className={cn(
        "absolute inset-0 z-10 flex items-center overflow-hidden",
        isEditing ? "cursor-text" : (cursorClass || "cursor-text")
      )}>
      {isComb && maxLen && maxLen > 0 ? (
        <div
          className="relative w-full h-full flex items-center"
          onClick={(e) => {
            e.stopPropagation();
            if (!isEditing) {
              setIsEditing(true);
              setTimeout(() => {
                const focusIndex = Math.min(value.length, maxLen - 1);
                if (combInputRefs.current[focusIndex]) {
                  combInputRefs.current[focusIndex]?.focus();
                }
              }, 0);
            }
          }}
        >
          {Array.from({ length: maxLen }).map((_, i) => {
            const char = value[i] || "";
            return (
              <div key={i} className="relative flex-1 flex items-center justify-center text-black font-medium h-full" style={{ fontSize: currentFontSize, fontFamily: "Arial, Helvetica, sans-serif" }}>
                {!isEditing ? (
                  char || "-"
                ) : (
                  <input
                    ref={(el) => { combInputRefs.current[i] = el; }}
                    className="absolute inset-0 w-full h-full bg-transparent border-none outline-none focus:ring-0 text-center cursor-text z-20"
                    style={{ fontSize: currentFontSize, fontFamily: "Arial, Helvetica, sans-serif" }}
                    maxLength={1}
                    value={char}
                    onFocus={onFocus}
                    onBlur={(e) => {
                      setTimeout(() => {
                        if (!combInputRefs.current.includes(document.activeElement as HTMLInputElement)) {
                          setIsEditing(false);
                          if (onBlur) onBlur();
                        }
                      }, 0);
                    }}
                    onPaste={(e) => {
                      e.preventDefault();
                      const pasted = e.clipboardData.getData('text').replace(/\s+/g, '');
                      const newValue = pasted.slice(0, maxLen);
                      onChange(newValue);
                      setTimeout(() => {
                        const nextIdx = Math.min(newValue.length, maxLen - 1);
                        combInputRefs.current[nextIdx]?.focus();
                      }, 0);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Backspace") {
                        e.preventDefault();
                        let newValue = value;
                        if (char) {
                          newValue = value.substring(0, i) + "" + value.substring(i + 1);
                          onChange(newValue);
                        } else if (i > 0) {
                          newValue = value.substring(0, i - 1) + "" + value.substring(i);
                          onChange(newValue);
                          combInputRefs.current[i - 1]?.focus();
                        }
                      } else if (e.key === "ArrowLeft") {
                        if (i > 0) {
                          e.preventDefault();
                          combInputRefs.current[i - 1]?.focus();
                        }
                      } else if (e.key === "ArrowRight") {
                        if (i < maxLen - 1) {
                          e.preventDefault();
                          combInputRefs.current[i + 1]?.focus();
                        }
                      }
                    }}
                    onChange={(e) => {
                      const newChar = e.target.value.slice(-1);
                      if (!newChar) return;

                      const newValue = value.substring(0, i) + newChar + value.substring(i + 1);
                      onChange(newValue);
                      if (newChar && i < maxLen - 1) {
                        combInputRefs.current[i + 1]?.focus();
                      }
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      ) : isEditing ?
        isDate ? (
          <IMaskInput
            mask={Date}
            pattern="m/d/Y"
            autofix="pad"
            overwrite={true}
            format={(date: any) => {
              if (!date || isNaN(date.getTime())) return "";
              const month = String(date.getMonth() + 1).padStart(2, "0");
              const day = String(date.getDate()).padStart(2, "0");
              const year = date.getFullYear();
              return `${month}/${day}/${year}`;
            }}
            parse={(str) => {
              const parts = str.split("/");
              const month = parseInt(parts[0], 10) - 1;
              const day = parseInt(parts[1], 10);
              const year = parseInt(parts[2], 10);
              return new Date(year, month, day);
            }}
            unmask={false}
            value={value}
            inputRef={(el) => {
              inputRef.current = el;
              if (isEditing && el && document.activeElement !== el) el.focus();
            }}
            onAccept={(value: string) => onChange(value)}
            onBlur={() => {
              setIsEditing(false);
              if (onBlur) onBlur();
            }}
            className="w-full bg-transparent border-none outline-none focus:ring-0 text-black font-medium h-full p-0"
            style={{ fontSize: currentFontSize, fontFamily: "Arial, Helvetica, sans-serif" }}
          />
        ) :
          (
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onBlur={() => {
                setIsEditing(false)
                if (onBlur) onBlur()
              }}
              className="w-full bg-transparent border-none outline-none focus:ring-0 text-black font-medium h-full"
              style={{ fontSize: currentFontSize, fontFamily: "Arial, Helvetica, sans-serif" }}
            />
          ) : (
          <div
            ref={textRef}
            className="w-full whitespace-nowrap text-black font-medium"
            style={{
              display: "inline-block",
              fontSize: currentFontSize,
              fontFamily: "Arial, Helvetica, sans-serif"
            }}
          >
            {value || "\u00A0"}
          </div>
        )}
    </div>
  )
}

export function PdfViewer({
  pdfData,
  fields,
  autofilledFields,
  pageNumber,
  scale,
  searchQuery = "",
  detectionMode,
  onCancelDetectionMode,
  onTotalPagesChange,
  onFieldChange,
  onBatchFieldChange,
  onAcceptField,
  onAcceptAll,
  onFieldEdit,
  onDeleteField,
  onDetectField,
  onRelocateField,
  onResizeField,
  focusedFieldName,
  onFocusedFieldChange
}: PdfViewerProps) {
  const [pageDimensions, setPageDimensions] = useState<{ width: number; height: number } | null>(null)
  const [draggingField, setDraggingField] = useState<{ id: string; startX: number; startY: number; initialLeft: number; initialTop: number } | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const wasDraggingRef = useRef(false);
  const [resizingField, setResizingField] = useState<{ id: string; startX: number; startY: number; startWidth: number; startHeight: number; startFontSize: number } | null>(null)
  const [resizePreview, setResizePreview] = useState<{ id: string; width: number; height: number; fontSize: number } | null>(null)
  const resizePreviewRef = useRef<{ id: string; width: number; height: number; fontSize: number } | null>(null)
  const [resizeOverrides, setResizeOverrides] = useState<Record<string, { width: number; height: number; fontSize: number }>>({})

  const [redoSigField, setRedoSigField] = useState<string | null>(null)
  const [acceptedPopoverField, setAcceptedPopoverField] = useState<string | null>(null)
  const [pdfDocument, setPdfDocument] = useState<any>(null)
  const [highlightRects, setHighlightRects] = useState<HighlightRect[]>([])

  const pageRef = useRef<HTMLDivElement>(null)
  const measureCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const fileSource = useMemo(() => {
    if (!pdfData) return null;
    const safeBuffer = pdfData.byteLength > 0 ? pdfData.slice(0) : pdfData;
    return { data: new Uint8Array(safeBuffer) };
  }, [pdfData]);

  // When the document source changes, react-pdf tears down the previous
  // PDFDocumentProxy and loads a new one. Drop the stale proxy first so the
  // <Page> below (gated on `pdfDocument`) unmounts before the reload, instead
  // of calling getPage() on a destroyed worker transport — which surfaces as
  // "Cannot read properties of null (reading 'sendWithPromise')".
  useEffect(() => {
    setPdfDocument(null)
  }, [fileSource])

  useEffect(() => {
    resizePreviewRef.current = resizePreview
  }, [resizePreview])

  function onDocumentLoadSuccess(pdf: any) {
    setPdfDocument(pdf)
    if (onTotalPagesChange) {
      onTotalPagesChange(pdf.numPages)
    }
  }

  useEffect(() => {
    if (!pdfDocument || !searchQuery.trim() || !scale) {
      setHighlightRects([])
      return
    }

    let active = true

    const calculateHighlights = async () => {
      try {
        const page = await pdfDocument.getPage(pageNumber)
        const textContent = await page.getTextContent()
        const viewport = page.getViewport({ scale })

        if (!active) return

        let fullText = ""
        const itemMap: { item: any; startIdx: number; endIdx: number }[] = []

        textContent.items.forEach((item: any) => {
          const str = item.str
          if (!str) return
          const startIdx = fullText.length
          fullText += str
          const rangeEndIdx = startIdx + str.length
          if (item.hasEOL) fullText += " "
          itemMap.push({ item, startIdx, endIdx: rangeEndIdx })
        })

        const escapedQuery = escapeRegExp(searchQuery)
        const regex = new RegExp(escapedQuery, "gi")
        const rawRects: HighlightRect[] = []

        let match
        while ((match = regex.exec(fullText)) !== null) {
          const matchStart = match.index
          const matchEnd = match.index + match[0].length

          for (const mapEntry of itemMap) {
            const intersectStart = Math.max(matchStart, mapEntry.startIdx)
            const intersectEnd = Math.min(matchEnd, mapEntry.endIdx)

            if (intersectStart < intersectEnd) {
              const item = mapEntry.item
              const relativeStart = intersectStart - mapEntry.startIdx
              const relativeEnd = intersectEnd - mapEntry.startIdx
              const itemLen = item.str.length

              if (itemLen > 0) {
                const charWidth = item.width / itemLen
                const pdfX = item.transform[4] + (relativeStart * charWidth)
                const pdfY = item.transform[5]
                const pdfW = (relativeEnd - relativeStart) * charWidth
                const pdfH = Math.sqrt(item.transform[0] * item.transform[0] + item.transform[1] * item.transform[1])

                const rect = viewport.convertToViewportRectangle([pdfX, pdfY, pdfX + pdfW, pdfY + pdfH])

                rawRects.push({
                  left: Math.min(rect[0], rect[2]),
                  top: Math.min(rect[1], rect[3]),
                  width: Math.abs(rect[2] - rect[0]),
                  height: Math.abs(rect[3] - rect[1])
                })
              }
            }
          }
        }

        if (!active) return

        rawRects.sort((a, b) => {
          const yDiff = Math.abs(a.top - b.top)
          if (yDiff > 5) return a.top - b.top
          return a.left - b.left
        })

        const mergedRects: HighlightRect[] = []
        if (rawRects.length > 0) {
          let currentRect = rawRects[0]
          for (let i = 1; i < rawRects.length; i++) {
            const nextRect = rawRects[i]
            const isSameLine = Math.abs(currentRect.top - nextRect.top) < (currentRect.height / 2)
            const isHorizontalNeighbor = nextRect.left <= (currentRect.left + currentRect.width + 4)

            if (isSameLine && isHorizontalNeighbor) {
              currentRect = {
                left: Math.min(currentRect.left, nextRect.left),
                top: Math.min(currentRect.top, nextRect.top),
                width: Math.max(currentRect.left + currentRect.width, nextRect.left + nextRect.width) - Math.min(currentRect.left, nextRect.left),
                height: Math.max(currentRect.height, nextRect.height)
              }
            } else {
              mergedRects.push(currentRect)
              currentRect = nextRect
            }
          }
          mergedRects.push(currentRect)
        }

        setHighlightRects(mergedRects)
      } catch (err) {
        console.error("Highlight calc error:", err)
      }
    }

    calculateHighlights()
    return () => { active = false }
  }, [pdfDocument, pageNumber, searchQuery, scale])

  const onPageLoadSuccess = useCallback((page: { width: number; height: number }) => {
    setPageDimensions({ width: page.width, height: page.height })
  }, [])

  const measureTextWidth = (text: string, fontSize: number, fontFamily: string = 'Arial, Helvetica, sans-serif') => {
    if (!measureCanvasRef.current) {
      measureCanvasRef.current = document.createElement("canvas");
    }
    const ctx = measureCanvasRef.current.getContext("2d");
    if (ctx) {
      ctx.font = `400 ${fontSize}px ${fontFamily}`;
      const metrics = ctx.measureText(text);
      return metrics.width;
    }
    return 0;
  };

  const handleFocusField = useCallback((fieldName: string | null) => {
    onFocusedFieldChange(fieldName);
    if (fieldName && detectionMode && onCancelDetectionMode) {
      onCancelDetectionMode();
    }
  }, [detectionMode, onCancelDetectionMode, onFocusedFieldChange]);

  const handleMouseDown = (e: React.MouseEvent, field: DetectedField, left: number, top: number) => {
    if (detectionMode) {
      if (onCancelDetectionMode) onCancelDetectionMode();
      return;
    }
    if (resizingField) return;

    e.stopPropagation();
    if (e.button !== 0) return;

    handleFocusField(field.name);
    setDraggingField({
      id: field.name,
      startX: e.clientX,
      startY: e.clientY,
      initialLeft: left,
      initialTop: top
    });
    setDragOffset({ x: 0, y: 0 });
  };

  const handleResizeMouseDown = (e: React.MouseEvent, field: DetectedField, currentWidth: number, currentHeight: number) => {
    e.stopPropagation();
    e.preventDefault();
    if (e.button !== 0) return;

    if (detectionMode && onCancelDetectionMode) {
      onCancelDetectionMode();
    }

    const override = resizeOverrides[field.name];
    const baseFontSize = override ? override.fontSize : ((field as any).fontSize || 12);
    const startFontSizePx = baseFontSize * scale;

    handleFocusField(field.name);
    setResizingField({
      id: field.name,
      startX: e.clientX,
      startY: e.clientY,
      startWidth: currentWidth,
      startHeight: currentHeight,
      startFontSize: startFontSizePx
    });
    setResizePreview({
      id: field.name,
      width: currentWidth,
      height: currentHeight,
      fontSize: startFontSizePx
    });
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (resizingField && pageDimensions) {
      e.preventDefault();
      const deltaY = e.clientY - resizingField.startY;

      const autofilledState = autofilledFields.find(f => f.fieldName === resizingField.id);
      const textContent = (autofilledState?.value as string) || "Sample Text";
      const field = fields.find(f => f.name === resizingField.id);
      const isMultiline = field?.type === "multiline";

      let maxWidth = Infinity;
      if (field && field.rect) {
        const currentLeft = field.rect.x * scale;
        const pageWidth = pageDimensions.width * scale;
        maxWidth = pageWidth - currentLeft;
      }

      let newFontSize = 12;
      let newWidth = resizingField.startWidth;
      let newHeight = resizingField.startHeight;

      if (isMultiline) {
        const scaleFactor = (resizingField.startHeight + deltaY) / resizingField.startHeight;
        const minPx = 12 * scale;
        const maxPx = 64 * scale;

        let targetFontSize = Math.max(minPx, Math.min(maxPx, resizingField.startFontSize * scaleFactor));
        const fontSizeRatio = targetFontSize / resizingField.startFontSize;
        const projectedWidth = resizingField.startWidth * fontSizeRatio;

        if (projectedWidth > maxWidth) {
          const widthRatio = maxWidth / projectedWidth;
          targetFontSize = targetFontSize * widthRatio;
        }

        newFontSize = targetFontSize;
        const clampedScaleFactor = newFontSize / resizingField.startFontSize;
        newHeight = resizingField.startHeight * clampedScaleFactor;
        newWidth = resizingField.startWidth * clampedScaleFactor;

      } else {
        const verticalPadding = 4;
        const horizontalPadding = 16;
        const minPx = 12 * scale;
        const maxPx = 64 * scale;

        const scaleFactor = (resizingField.startHeight + deltaY) / resizingField.startHeight;
        let targetFontSize = Math.max(minPx, Math.min(maxPx, resizingField.startFontSize * scaleFactor));

        const tempTextWidth = measureTextWidth(textContent, targetFontSize);
        const tempWidth = (tempTextWidth * 1) + horizontalPadding;

        if (tempWidth > maxWidth) {
          const ratio = maxWidth / tempWidth;
          targetFontSize = targetFontSize * ratio;
        }

        newFontSize = targetFontSize;
        newHeight = newFontSize + verticalPadding;
        const textWidth = measureTextWidth(textContent, newFontSize);
        newWidth = (textWidth * 1) + horizontalPadding;
      }

      if (field && field.rect) {
        const currentTop = field.rect.y * scale;
        const pageHeight = pageDimensions.height * scale;

        if (newWidth > maxWidth) {
          newWidth = maxWidth;
        }
        if (currentTop + newHeight > pageHeight) {
          newHeight = pageHeight - currentTop;
        }
      }

      setResizePreview({
        id: resizingField.id,
        width: newWidth,
        height: newHeight,
        fontSize: newFontSize
      });
      return;
    }

    if (draggingField) {
      e.preventDefault();
      setDragOffset({
        x: e.clientX - draggingField.startX,
        y: e.clientY - draggingField.startY
      });
    }
  };

  const handleMouseUp = (e: MouseEvent) => {
    if (resizingField && resizePreviewRef.current) {
      const currentPreview = resizePreviewRef.current;
      const pdfWidth = currentPreview.width / scale;
      const pdfHeight = currentPreview.height / scale;
      const pdfFontSize = currentPreview.fontSize / scale;
      if (onResizeField) {
        onResizeField(resizingField.id, pdfWidth, pdfHeight, pdfFontSize);
      }

      setResizeOverrides(prev => ({
        ...prev, [resizingField.id]: {
          width: pdfWidth,
          height: pdfHeight,
          fontSize: pdfFontSize
        }
      }));

      setResizingField(null);
      setResizePreview(null);
      return;
    }

    if (!draggingField || !pageDimensions) return;

    const field = fields.find(f => f.name === draggingField.id);
    if (!field || !field.rect) return;

    if (Math.abs(dragOffset.x) > 2 || Math.abs(dragOffset.y) > 2) {
      wasDraggingRef.current = true;

      const fieldWidth = field.rect.width * scale;
      const fieldHeight = field.rect.height * scale;
      const pageWidth = pageDimensions.width * scale;
      const pageHeight = pageDimensions.height * scale;

      let newLeft = draggingField.initialLeft + dragOffset.x;
      let newTop = draggingField.initialTop + dragOffset.y;

      newLeft = Math.max(0, Math.min(newLeft, pageWidth - fieldWidth));
      newTop = Math.max(0, Math.min(newTop, pageHeight - fieldHeight));

      const pdfX = newLeft / scale;
      const pdfY = newTop / scale;

      if (onRelocateField) {
        onRelocateField(draggingField.id, pageNumber - 1, pdfX, pdfY);
      }

      setResizeOverrides((prev) => {
        const newOverrides = { ...prev };
        delete newOverrides[draggingField.id];
        return newOverrides;
      });
    }

    setDraggingField(null);
    setDragOffset({ x: 0, y: 0 });

    setTimeout(() => {
      wasDraggingRef.current = false;
    }, 100);
  };

  useEffect(() => {
    if (draggingField || resizingField) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    } else {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    }
  }, [draggingField, dragOffset, resizingField, pageDimensions, scale]);

  const currentPageFields = fields.filter((field) => field.rect && field.rect.pageIndex === pageNumber - 1)
  const currentPageFieldNames = new Set(currentPageFields.map((f) => f.name))
  const unsignedSignatureFields = autofilledFields.filter(f => f.type === "signature" && !f.value)
  const unacceptedSignatureFields = autofilledFields.filter(f => f.type === "signature" && !f.accepted && currentPageFieldNames.has(f.fieldName))
  const unacceptedCount = autofilledFields.filter((af) => !af.accepted && af.type !== "signature" && currentPageFieldNames.has(af.fieldName)).length

  const handleBackgroundClick = () => {
    handleFocusField(null)
    setAcceptedPopoverField(null)
  }

  const handlePageLayerClick = (e: React.MouseEvent) => {
    if (detectionMode && onDetectField) {
      e.stopPropagation()
      const { offsetX, offsetY } = e.nativeEvent
      const pdfX = offsetX / scale
      const pdfY = offsetY / scale
      onDetectField(pageNumber - 1, pdfX, pdfY, detectionMode)
    }
  }

  const handleAutoEsign = (sourceSignature: string) => {
    if (!onBatchFieldChange) return;
    const signatureFields = fields.filter(f => f.type === "signature");
    const updates: Record<string, string> = {};
    signatureFields.forEach(field => {
      const fieldState = autofilledFields.find(af => af.fieldName === field.name);
      const isSigned = fieldState && typeof fieldState.value === 'string' && fieldState.value !== "";
      if (!isSigned) {
        updates[field.name] = sourceSignature;
      }
    });
    if (Object.keys(updates).length > 0) {
      onBatchFieldChange(updates);
    }
  }

  const handleFieldClick = (e: React.MouseEvent, field: DetectedField, autofilledState: AutofilledFieldState) => {
    e.stopPropagation()
    if (detectionMode && onCancelDetectionMode) {
      onCancelDetectionMode();
    }
    if (field.type === "checkbox" || field.type === "radio") {
      onFieldChange(field.name, !autofilledState.value)
    }
  }

  const renderFieldContent = (field: DetectedField) => {
    if (!field.rect || !pageDimensions) return null

    const autofilledState = autofilledFields.find((af) => af.fieldName === field.name)
    if (!autofilledState) return null

    const { rect } = field
    const isAccepted = autofilledState.accepted ?? false
    const isChecked = autofilledState.value === true

    const isTextType = field.type === 'text' || field.type === 'multiline' || field.type === 'date';
    const isSelected = focusedFieldName === field.name
    const isEditing = isSelected && isTextType;

    const baseLeft = rect.x * scale
    const baseTop = rect.y * scale

    const override = resizeOverrides[field.name];
    const isResizing = resizePreview?.id === field.name;

    let width: number, height: number, dynamicFontSize: number | undefined;

    if (isResizing && resizePreview) {
      width = resizePreview.width;
      height = resizePreview.height;
      dynamicFontSize = resizePreview.fontSize;
    } else if (override) {
      width = override.width * scale;
      height = override.height * scale;
      dynamicFontSize = override.fontSize * scale;
    } else {
      width = rect.width * scale;
      height = rect.height * scale;
      dynamicFontSize = (field as any).fontSize ? (field as any).fontSize * scale : undefined;
    }

    const customPaddingTop = (field as any).paddingTop
    const scaledPadding = (customPaddingTop || 0) * scale

    const isDragging = draggingField?.id === field.name;
    const currentLeft = isDragging ? baseLeft + dragOffset.x : baseLeft;
    const currentTop = isDragging ? baseTop + dragOffset.y : baseTop;

    const activeZIndex = isSelected ? "z-30" : "z-20"
    const genericZIndex = isSelected ? "z-30" : "z-20"

    const canDrag = !isAccepted && (field.type === 'text' || field.type === 'multiline' || field.type === 'signature' || field.type === 'date') && !field.comb;
    const cursorClass = canDrag
      ? (isDragging ? "cursor-grabbing" : (isEditing ? "cursor-auto" : "cursor-grab"))
      : "";


    const showResizeHandle = !isAccepted && (field.type === 'text' || field.type === 'multiline' || field.type === 'date') && !field.comb;

    if (field.type === "signature") {
      if (autofilledState.value === "") {
        return (
          <SignaturePad
            key={field.name}
            initialOpen={redoSigField === field.name}
            onCancel={() => setRedoSigField(null)}
            onSave={(signatureData) => {
              onFieldChange(field.name, signatureData)
              if (isAccepted) onFieldEdit(field.name)
              setRedoSigField(null)
            }}
          >
            <div
              className={cn(
                "absolute transition-colors w-full h-full z-10",
                !isAccepted ? "border-2 border-blue-500 bg-blue-500/15 hover:bg-blue-500/25 overflow-hidden" : "bg-blue-50 hover:bg-blue-100",
                cursorClass
              )}
              style={{
                left: `${currentLeft}px`,
                top: `${currentTop + scaledPadding}px`,
                width: `${width}px`,
                height: `${height - scaledPadding}px`,
                transform: isDragging ? 'scale(1.02)' : 'none',
                boxShadow: isDragging ? '0 4px 12px rgba(0,0,0,0.1)' : 'none'
              }}
              onMouseDown={(e) => canDrag && handleMouseDown(e, field, baseLeft, baseTop)}
              onClick={(e) => {
                if (wasDraggingRef.current) {
                  e.preventDefault();
                  e.stopPropagation();
                }
              }}
            >
              <div className="w-fit h-fit px-1.5 py-[2px] border-none rounded-rb-sm bg-blue-500 z-10 absolute text-white text-xs ">
                sign
              </div>
            </div>
          </SignaturePad>
        )
      } else if (typeof autofilledState.value === 'string') {
        const isRedoSig = redoSigField === field.name;
        const filledContent = (
          <div
            className={cn(
              "absolute select-none",
              activeZIndex,
              cursorClass,
              !isAccepted && "border-2 border-blue-500 bg-blue-500/15 hover:bg-blue-500/25 overflow-hidden"
            )}
            style={{
              left: `${currentLeft}px`,
              top: `${currentTop + scaledPadding}px`,
              width: `${width}px`,
              height: `${height - scaledPadding}px`,
              transform: isDragging ? 'scale(1.02)' : 'none',
              boxShadow: isDragging ? '0 4px 12px rgba(0,0,0,0.1)' : 'none'
            }}
            onMouseDown={(e) => {
              if (canDrag) handleMouseDown(e, field, baseLeft, baseTop);
              else {
                e.stopPropagation();
                handleFocusField(field.name);
              }
            }}
            onClick={(e) => {
              e.stopPropagation()
              handleFocusField(field.name)
            }}
            onDoubleClick={(e) => {
              e.stopPropagation()
              if (detectionMode && onCancelDetectionMode) {
                onCancelDetectionMode();
              }
              if (isAccepted) {
                setAcceptedPopoverField(field.name)
              }
            }}
          >
            <img
              src={autofilledState.value}
              alt="Signature"
              draggable="false"
              className="w-full h-full object-contain z-0 pointer-events-none"
            />
          </div>
        )

        if (isRedoSig) {
          return (
            <SignaturePad
              key={field.name}
              initialOpen={true}
              onCancel={() => setRedoSigField(null)}
              onSave={(signatureData) => {
                onFieldChange(field.name, signatureData)
                if (isAccepted) onFieldEdit(field.name)
                setRedoSigField(null)
              }}
            >
              {filledContent}
            </SignaturePad>
          )
        }
        return <div key={field.name}>{filledContent}</div>
      }
      return null;
    }
    return (
      <div
        key={field.name}
        data-field-name={field.name}
        className={cn(
          "absolute",
          genericZIndex,
          cursorClass,
          !isAccepted && "border-2 border-blue-500 bg-blue-500/15 hover:bg-blue-500/25 overflow-hidden"
        )}
        style={{
          left: `${currentLeft}px`,
          top: `${currentTop}px`,
          width: `${width}px`,
          height: `${height}px`,
          transform: isDragging ? 'scale(1.02)' : 'none',
          boxShadow: isDragging ? '0 4px 12px rgba(0,0,0,0.1)' : 'none'
        }}
        onMouseDown={(e) => {
          if (isEditing) {
            e.stopPropagation()
            return
          }
          if (canDrag) handleMouseDown(e, field, baseLeft, baseTop);
        }}
        onClick={(e) => {
          e.stopPropagation()
          handleFocusField(field.name)
          handleFieldClick(e, field, autofilledState)
        }}
      >

        {showResizeHandle && (
          <div
            className="absolute bottom-0 right-0  z-50 cursor-nwse-resize flex items-end justify-end"
            onMouseDown={(e) => handleResizeMouseDown(e, field, width, height)}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-2.5 h-2.5 transition-colors" />
          </div>
        )}

        {field.type === "checkbox" ? (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center"
            onClick={(e) => {
              e.stopPropagation()
              handleFocusField(field.name)
              const newValue = !isChecked
              onFieldChange(field.name, newValue)
              if (isAccepted) {
                onFieldEdit(field.name)
              }
            }}
          >
            <div className={cn(
              "h-full w-full flex items-center justify-center transition-colors rounded-none",
              isAccepted ? "border-[1px] border-black bg-white/80 backdrop-blur-sm" : ""
            )}>
              {isChecked && <X className="h-full w-full text-black p-[5%]" strokeWidth={4} />}
            </div>
          </div>
        ) : field.type === "radio" ? (
          <div
            className="absolute inset-0 z-10 flex items-center justify-center"
            onClick={(e) => {
              e.stopPropagation()
              handleFocusField(field.name)
              const newValue = !isChecked
              onFieldChange(field.name, newValue)
              if (isAccepted) {
                onFieldEdit(field.name)
              }
            }}
          >
            <div className={cn(
              "h-full aspect-square flex items-center justify-center transition-colors rounded-full",
              isAccepted ? "border-[1px] border-black bg-white/80 backdrop-blur-sm" : ""
            )}>
              {isChecked && <div className="h-[60%] w-[60%] rounded-full bg-black" />}
            </div>
          </div>
        ) : (
          <ScalableField
            value={autofilledState.value as string}
            width={width}
            height={height}
            paddingTop={customPaddingTop}
            fontSize={dynamicFontSize}
            onFocus={() => handleFocusField(field.name)}
            isMultiline={field.type === "multiline"}
            isComb={field.comb}
            maxLen={field.maxLen}
            cursorClass={canDrag ? "cursor-grab" : undefined}
            onInputClick={(e) => handleFieldClick(e, field, autofilledState)}
            onChange={(val) => {
              onFieldChange(field.name, val)
              if (isAccepted) {
                onFieldEdit(field.name)
              }
            }}
            onComputedFontSize={(pxSize) => {
              if (onResizeField && field.rect) {
                const pdfFontSize = pxSize / scale;
                const currentStoredSize = field.fontSize || 0;
                if (Math.abs(currentStoredSize - pdfFontSize) > 0.5) {
                  onResizeField(field.name, field.rect.width, field.rect.height, pdfFontSize);
                }
              }
            }}
          />
        )}
      </div>
    )
  }

  const renderFieldControls = (field: DetectedField) => {
    if (!field.rect || !pageDimensions) return null
    const autofilledState = autofilledFields.find((af) => af.fieldName === field.name)
    if (!autofilledState) return null

    const hasValue = (field.type === "checkbox" || field.type === "radio")
      ? autofilledState.value !== undefined && autofilledState.value !== null
      : autofilledState.value && autofilledState.value !== ""

    const isAccepted = autofilledState.accepted ?? false
    const isSelected = focusedFieldName === field.name
    const isAnySelected = focusedFieldName !== null
    const isUnsignedSignature = field.type === "signature" && !hasValue
    const shouldShowPopover = (hasValue || isUnsignedSignature) && !isAccepted && (!isAnySelected || isSelected) && !detectionMode
    const showAcceptedPopover = isAccepted && acceptedPopoverField === field.name
    const isDragging = draggingField?.id === field.name;
    const isResizing = resizingField?.id === field.name;

    const isTextType = field.type === 'text' || field.type === 'multiline' || field.type === 'date';
    const isEditing = isSelected && isTextType;

    if (isDragging || isResizing || redoSigField === field.name) return null;
    if (!shouldShowPopover && !showAcceptedPopover) return null

    const { rect } = field
    const left = rect.x * scale
    const top = rect.y * scale
    const width = rect.width * scale
    const height = rect.height * scale

    const signedSignatureFields = autofilledFields.filter(f => f.type === "signature" && f.value);
    const showAutoEsign = field.type === "signature" && signedSignatureFields.length > 0 && unsignedSignatureFields.length > 0 && autofilledState.value

    return (
      <div
        key={`controls-${field.name}`}
        className="absolute pointer-events-none"
        style={{
          left: `${left}px`,
          top: `${top}px`,
          width: `${width}px`,
          height: `${height - 1}px`,
        }}
      >
        {shouldShowPopover && (
          <div className="absolute bottom-full -left-1 mb-2 flex items-center gap-1 bg-white border border-border rounded-md shadow-sm p-1 z-50 pointer-events-auto">
            {isEditing && !isAccepted && !field.comb && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-gray-500 hover:bg-gray-50 hover:text-foreground cursor-grab active:cursor-grabbing"
                    onMouseDown={(e) => handleMouseDown(e, field, left, top)}
                  >
                    <Move className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Move</p>
                </TooltipContent>
              </Tooltip>
            )}
            {!isUnsignedSignature && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-gray-500 hover:bg-gray-50 hover:text-foreground"
                    onClick={(e) => {
                      e.stopPropagation()
                      onAcceptField(field.name)
                    }}
                  >
                    <Check className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Accept{field.type === "signature" ? " Signature" : ""}</p>
                </TooltipContent>
              </Tooltip>
            )}

            {field.type === "signature" && hasValue && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-gray-500 hover:bg-gray-50 hover:text-blue-600"
                    onClick={(e) => {
                      e.stopPropagation()
                      setRedoSigField(field.name)
                    }}
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Redo Signature</p>
                </TooltipContent>
              </Tooltip>
            )}

            {showAutoEsign && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-gray-500 hover:bg-gray-50 hover:text-blue-600"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleAutoEsign(autofilledState.value as string)
                    }}
                  >
                    <Feather className="h-4 w-4 text-blue-500" />
                    <span className="sr-only">Auto-esign</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Auto-esign</p>
                </TooltipContent>
              </Tooltip>
            )}

            {(!isUnsignedSignature || showAutoEsign) && (
              <div className="w-px h-4 bg-gray-300" />
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-gray-500 hover:bg-gray-50 hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation()
                    onDeleteField(field.name)
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Delete</p>
              </TooltipContent>
            </Tooltip>
          </div>
        )}

        {showAcceptedPopover && (
          <div className="absolute bottom-full -left-1 mb-2 flex items-center gap-1 bg-white border border-border rounded-md shadow-sm p-1 z-50 pointer-events-auto">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-gray-500 hover:bg-gray-50 hover:text-blue-600"
                  onClick={(e) => {
                    e.stopPropagation()
                    setRedoSigField(field.name)
                    setAcceptedPopoverField(null)
                  }}
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Redo Signature</p>
              </TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>
    )
  }

  return (
    <TooltipProvider>
      <div className="flex flex-col items-center relative w-full h-full pb-20">
        <div
          className="w-full flex justify-center flex-1"
          onClick={handleBackgroundClick}
        >
          <div className="relative shadow-xl bg-white" ref={pageRef} onClick={(e) => e.stopPropagation()}>
            {fileSource ? (
              <Document
                file={fileSource}
                onLoadSuccess={onDocumentLoadSuccess}
                loading={
                  <div className="flex items-center justify-center p-12">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  </div>
                }
                error={<div className="flex items-center justify-center p-12 text-destructive">Failed to load PDF</div>}
              >
                {pdfDocument && (
                  <Page
                    pageNumber={pageNumber}
                    scale={scale}
                    renderTextLayer={true}
                    renderAnnotationLayer={true}
                    onLoadSuccess={onPageLoadSuccess}
                    loading={
                      <div className="flex items-center justify-center p-12">
                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                      </div>
                    }
                  />
                )}
              </Document>
            ) : (
              <div className="flex items-center justify-center p-12">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            )}

            {detectionMode && pageDimensions && (
              <div
                className="absolute inset-0 z-20 cursor-crosshair bg-transparent"
                style={{
                  width: pageDimensions.width * scale,
                  height: pageDimensions.height * scale
                }}
                onClick={handlePageLayerClick}
              />
            )}

            {/* Search Highlights Overlay */}
            {highlightRects.length > 0 && pageDimensions && (
              <div className="absolute inset-0 z-10 pointer-events-none">
                {highlightRects.map((rect, i) => (
                  <div
                    key={`search-${i}`}
                    style={{
                      position: "absolute",
                      left: rect.left,
                      top: rect.top,
                      width: rect.width,
                      height: rect.height,
                      backgroundColor: "rgba(147, 51, 234, 0.3)",
                      borderRadius: "2px",
                    }}
                  />
                ))}
              </div>
            )}

            {pageDimensions && currentPageFields.map((field) => renderFieldContent(field))}
            {pageDimensions && (
              <div className="absolute inset-0 z-20 pointer-events-none">
                {currentPageFields.map((field) => renderFieldControls(field))}
              </div>
            )}
          </div>
        </div>

        {(unacceptedCount >= 2 || unacceptedSignatureFields.length > 0) && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
            <Button
              variant="outline"
              onClick={onAcceptAll}
              className="bg-white text-gray-700 border border-border hover:bg-gray-50 shadow-lg h-auto py-2.5 px-4"
            >
              {unacceptedCount >= 2 ?
                <div className="flex items-center gap-2">
                  <Check className="h-4 w-4" />
                  <span className="font-medium">Accept all changes ({unacceptedCount})</span>
                </div>
                : null}

              {unacceptedCount >= 2 && unacceptedSignatureFields.length > 0 && <div className="h-4 w-px bg-gray-200 mx-3" />}

              {unacceptedSignatureFields.length > 0 && (
                <span className="text-muted-foreground text-xs font-normal flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-400" />
                  {unacceptedSignatureFields.length} {unacceptedSignatureFields.length > 1 ? "signatures" : "signature"} left
                </span>
              )}
            </Button>
          </div>
        )}
      </div>
    </TooltipProvider>
  )
}
