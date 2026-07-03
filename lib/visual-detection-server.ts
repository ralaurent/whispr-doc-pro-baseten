// lib/visual-detection-server.ts
"use server"

import { DetectedField, DetectionMode } from "./pdf-utils"
import {
    analyzePage,
    detectTableRegions,
    intersects,
    detectSignature,
    detectDate,
    findLabelForLine,
    findLabelForCheckbox,
    findLabelForRadio,
    toSnakeCase,
    findLabelForRect,
    BBox,
    GraphicItem,
    TextItem
} from "./visual-detection"

export async function detectVisualFields(pdfBuffer: ArrayBuffer): Promise<DetectedField[]> {
    const { PDFExcavator } = await import("pdfexcavator")
    const excavator = await PDFExcavator.fromBuffer(Buffer.from(pdfBuffer))
    const pageIdxCount = (excavator as any).pageCount
    const count = typeof pageIdxCount === 'function' ? await pageIdxCount.call(excavator) : pageIdxCount

    const detectedFields: DetectedField[] = []
    const fieldNameCounts = new Map<string, number>()

    const getUniqueName = (baseName: string): string => {
        const currentCount = fieldNameCounts.get(baseName) || 0
        fieldNameCounts.set(baseName, currentCount + 1)
        if (currentCount === 0) return baseName
        return `${baseName}_${currentCount + 1}`
    }

    for (let i = 0; i < count; i++) {
        const pageIndex = i
        const page = await excavator.getPage(i)

        const { pageHeight, pageWidth, groupedLabels, graphics } = await analyzePage(page)

        const tableRegions = detectTableRegions(graphics, groupedLabels);

        const overlapsTable = (rect: BBox): boolean => {
            return tableRegions.some(region => {
                const table = region.bbox;

                const padding = 15;

                const expanded = {
                    x: table.x - 5,
                    y: table.y - padding,
                    width: table.width + 10,
                    height: table.height + (padding * 2)
                };

                if (intersects(expanded, rect)) return true;

                // 2. Strict Exclusion: Positioned Directly Above
                // Captures headers or top-borders that sit right on top of the text region
                // Check a zone from the top edge extending upwards ~15px
                const tableTop = table.y + table.height;
                const isAboveZone = (rect.y >= tableTop - 2) && (rect.y <= tableTop + 15);

                if (isAboveZone) {
                    // Confirm horizontal overlap
                    const xOverlap = Math.max(0, Math.min(table.x + table.width, rect.x + rect.width) - Math.max(table.x, rect.x));
                    if (xOverlap > 5) return true;
                }

                return false;
            });
        }

        let annotations: any[] = []
        try {
            annotations = await page.getAnnotations()
        } catch (e) { }

        const overlapsAnnotation = (rect: BBox) => {
            return annotations.some((ann: any) => {
                if (!ann.rect) return false
                const [ax1, ay1, ax2, ay2] = ann.rect
                const rx1 = rect.x
                const ry1 = rect.y
                const rx2 = rect.x + rect.width
                const ry2 = rect.y + rect.height
                return rx1 < ax2 && rx2 > ax1 && ry1 < ay2 && ry2 > ay1
            })
        }

        const processedGraphics = new Set<GraphicItem>()

        const NUM_SECTIONS = 24 // 16-32 /* precision */
        const sectionHeight = pageHeight / NUM_SECTIONS
        const NUM_COLS = 4
        const colWidth = pageWidth / NUM_COLS

        for (let s = 0; s < NUM_SECTIONS; s++) {
            // Calculate slice bounds (Top-Down visual order)
            // PDF Coordinates: Y=0 is bottom.
            const sectionMaxY = pageHeight - (s * sectionHeight)
            const sectionMinY = sectionMaxY - sectionHeight

            for (let c = 0; c < NUM_COLS; c++) {
                const colMinX = c * colWidth
                const colMaxX = colMinX + colWidth

                // Filter graphics belonging to this section based on their TOP edge AND LEFT edge.
                // This ensures a graphic is processed exactly once, in the cell where it visually starts.
                const sectionGraphics = graphics.filter(g => {
                    if (processedGraphics.has(g)) return false

                    const gTop = g.bbox.y + g.bbox.height
                    const inRow = gTop <= sectionMaxY && gTop > sectionMinY
                    const inCol = g.bbox.x >= colMinX && g.bbox.x < colMaxX

                    return inRow && inCol
                })

                sectionGraphics.sort((a, b) => {
                    const aTop = a.bbox.y + a.bbox.height
                    const bTop = b.bbox.y + b.bbox.height

                    if (Math.abs(aTop - bTop) < 6) {
                        return a.bbox.x - b.bbox.x
                    }
                    return bTop - aTop
                })

                const lineCandidates = sectionGraphics.filter(g => {
                    if (processedGraphics.has(g)) return false
                    const isLine = g.type === "line"
                    const isThinRect = g.type === "rectangle" && g.bbox.height <= 5
                    if (!isLine && !isThinRect) return false
                    if (g.bbox.width < 20) return false

                    if (overlapsAnnotation(g.bbox)) return false
                    if (overlapsTable(g.bbox)) return false

                    return true
                })

                for (const line of lineCandidates) {
                    const sigMatch = detectSignature(line, groupedLabels, pageWidth)
                    if (sigMatch) {
                        processedGraphics.add(line)
                        const uniqueName = getUniqueName("signature")

                        const SIG_HEIGHT = 45
                        const uiY = pageHeight - line.bbox.y - SIG_HEIGHT

                        detectedFields.push({
                            name: uniqueName,
                            type: "signature",
                            rect: {
                                x: line.bbox.x,
                                y: uiY,
                                width: line.bbox.width,
                                height: SIG_HEIGHT,
                                pageIndex,
                            },
                        })
                        continue
                    }

                    const dateMatch = detectDate(line, groupedLabels, pageWidth)
                    if (dateMatch) {
                        processedGraphics.add(line)
                        const uniqueName = getUniqueName("date")
                        const uiY = pageHeight - line.bbox.y - line.bbox.height

                        let fieldHeight = 24

                        const padding = 2
                        const lineTop = line.bbox.y + line.bbox.height
                        const fieldZone = { x: line.bbox.x, y: lineTop, width: line.bbox.width, height: fieldHeight }

                        detectedFields.push({
                            name: uniqueName,
                            type: "date",
                            rect: {
                                x: line.bbox.x,
                                y: uiY - fieldHeight + 2,
                                width: line.bbox.width,
                                height: fieldHeight,
                                pageIndex,
                            },
                        })
                        continue
                    }

                    const isUnderline = (groupedLabels as any).some((label: any) => {
                        const labelBottom = label.bbox.y
                        const lineTop = line.bbox.y + line.bbox.height
                        const vGap = labelBottom - lineTop
                        if (vGap < 0 || vGap > 12) return false
                        const l1 = label.bbox
                        const r1 = line.bbox
                        const overlapX = Math.max(0, Math.min(l1.x + l1.width, r1.x + r1.width) - Math.max(l1.x, r1.x))
                        return overlapX > 0
                    })

                    if (isUnderline) continue

                    const labelResult = findLabelForLine(line.bbox, groupedLabels, pageWidth)

                    if (!labelResult) continue;

                    processedGraphics.add(line)

                    const rawName = toSnakeCase(labelResult.text)
                    const uniqueName = getUniqueName(rawName)
                    const uiY = pageHeight - line.bbox.y - line.bbox.height
                    let fieldHeight = 24

                    const padding = 2
                    const lineTop = line.bbox.y + line.bbox.height

                    const fieldZone = {
                        x: line.bbox.x,
                        y: lineTop,
                        width: line.bbox.width,
                        height: fieldHeight
                    }

                    const obstacles = [
                        ...groupedLabels,
                        ...graphics.filter(g => g !== line)
                    ]

                    let availableHeight = fieldHeight

                    for (const item of obstacles) {
                        if (intersects(fieldZone, item.bbox)) {
                            if (item.bbox.y >= lineTop) {
                                const gap = item.bbox.y - lineTop
                                if (gap < availableHeight) {
                                    availableHeight = gap
                                }
                            }
                        }
                    }

                    fieldHeight = Math.max(0, availableHeight - padding)

                    detectedFields.push({
                        name: uniqueName,
                        type: "text",
                        rect: {
                            x: line.bbox.x,
                            y: uiY - fieldHeight + 2,
                            width: line.bbox.width,
                            height: fieldHeight,
                            pageIndex,
                        },
                    })
                }

                // --- B. Detect Radios and Checkboxes ---
                let checkboxCandidates = sectionGraphics.filter(g => {
                    if (processedGraphics.has(g)) return false
                    if (g.type !== "rectangle") return false

                    if (g.filled) return false;

                    const { width, height } = g.bbox
                    if (width < 8 || width > 40) return false
                    if (height < 8 || height > 40) return false
                    if (Math.abs(width - height) >= 1.5) return false

                    if (overlapsAnnotation(g.bbox)) return false
                    if (overlapsTable(g.bbox)) return false

                    return true
                })

                let uniqueCheckboxes: GraphicItem[] = []
                for (const box of checkboxCandidates) {
                    const isDuplicate = uniqueCheckboxes.some(existing => intersects(box.bbox, existing.bbox))
                    if (!isDuplicate) {
                        uniqueCheckboxes.push(box)
                    }
                }

                let radioCandidates = sectionGraphics.filter(g => {
                    if (processedGraphics.has(g)) return false
                    if (g.type !== "circle") return false

                    if (g.filled) return false;

                    const { width, height } = g.bbox
                    if (width < 2 || width > 26) return false

                    if (overlapsAnnotation(g.bbox)) return false
                    if (overlapsTable(g.bbox)) return false
                    return true
                })

                let uniqueRadios: GraphicItem[] = []
                for (const circle of radioCandidates) {
                    const isDuplicate = uniqueRadios.some(existing => intersects(circle.bbox, existing.bbox))
                    if (!isDuplicate) uniqueRadios.push(circle)
                }

                uniqueCheckboxes = uniqueCheckboxes.filter(box => {
                    const hasInnerRadio = uniqueRadios.some(radio => {
                        return radio.bbox.x >= box.bbox.x &&
                            radio.bbox.y >= box.bbox.y &&
                            (radio.bbox.x + radio.bbox.width) <= (box.bbox.x + box.bbox.width) &&
                            (radio.bbox.y + radio.bbox.height) <= (box.bbox.y + box.bbox.height);
                    });
                    return !hasInnerRadio;
                });

                for (const box of uniqueCheckboxes) {
                    const labelText = findLabelForCheckbox(box.bbox, groupedLabels, pageWidth)
                    if (!labelText) continue;

                    processedGraphics.add(box)
                    const rawName = toSnakeCase(labelText)
                    const uniqueName = getUniqueName(rawName)
                    const uiY = pageHeight - box.bbox.y - box.bbox.height

                    detectedFields.push({
                        name: uniqueName,
                        type: "checkbox",
                        rect: {
                            x: box.bbox.x,
                            y: uiY,
                            width: box.bbox.width,
                            height: box.bbox.height,
                            pageIndex,
                        },
                    })
                }

                for (const circle of uniqueRadios) {
                    const labelText = findLabelForRadio(circle.bbox, groupedLabels, pageWidth)
                    if (!labelText) continue

                    processedGraphics.add(circle)
                    const rawName = toSnakeCase(labelText)
                    const uniqueName = getUniqueName(rawName)
                    const uiY = pageHeight - circle.bbox.y - circle.bbox.height

                    detectedFields.push({
                        name: uniqueName,
                        type: "radio",
                        rect: {
                            x: circle.bbox.x,
                            y: uiY,
                            width: circle.bbox.width,
                            height: circle.bbox.height,
                            pageIndex,
                        },
                    })
                }

                const inputBoxCandidates = sectionGraphics.filter(g => {
                    if (processedGraphics.has(g)) return false
                    if (g.type !== "rectangle") return false
                    const { width, height } = g.bbox
                    if (width <= 20) return false
                    if (height <= 15 || height > 300) return false

                    if (overlapsAnnotation(g.bbox)) return false
                    if (overlapsTable(g.bbox)) return false

                    return true
                })

                for (const box of inputBoxCandidates) {
                    const sigMatch = detectSignature(box, groupedLabels, pageWidth)

                    if (sigMatch) {
                        processedGraphics.add(box)
                        const uniqueName = getUniqueName("signature")

                        const uiY = pageHeight - box.bbox.y - box.bbox.height

                        let customPaddingTop: number | undefined = undefined
                        const labelResult = findLabelForRect(box.bbox, groupedLabels, pageWidth)

                        if (labelResult && labelResult.insideBottom !== undefined) {
                            const boxTop = box.bbox.y + box.bbox.height
                            const gap = boxTop - labelResult.insideBottom
                            customPaddingTop = Math.max(2, Math.round(gap + 2))
                        }

                        detectedFields.push({
                            name: uniqueName,
                            type: "signature",
                            rect: {
                                x: box.bbox.x,
                                y: uiY,
                                width: box.bbox.width,
                                height: box.bbox.height,
                                pageIndex,
                            },
                            paddingTop: customPaddingTop,
                        })
                        continue
                    }

                    const dateMatch = detectDate(box, groupedLabels, pageWidth)
                    if (dateMatch) {
                        processedGraphics.add(box)
                        const uniqueName = getUniqueName("date")
                        const uiY = pageHeight - box.bbox.y - box.bbox.height

                        let customPaddingTop: number | undefined = undefined
                        const labelResult = findLabelForRect(box.bbox, groupedLabels, pageWidth)
                        if (labelResult && labelResult.insideBottom !== undefined) {
                            const boxTop = box.bbox.y + box.bbox.height
                            const gap = boxTop - labelResult.insideBottom
                            customPaddingTop = Math.max(2, Math.round(gap + 2))
                        }

                        detectedFields.push({
                            name: uniqueName,
                            type: "date",
                            rect: {
                                x: box.bbox.x,
                                y: uiY,
                                width: box.bbox.width,
                                height: box.bbox.height,
                                pageIndex,
                            },
                            paddingTop: customPaddingTop,
                        })
                        continue
                    }

                    const labelResult = findLabelForRect(box.bbox, groupedLabels, pageWidth)

                    if (!labelResult) continue;

                    processedGraphics.add(box)

                    const rawName = toSnakeCase(labelResult.text)
                    const uniqueName = getUniqueName(rawName)
                    const uiY = pageHeight - box.bbox.y - box.bbox.height

                    let customPaddingTop: number | undefined = undefined;
                    if (labelResult.insideBottom !== undefined) {
                        const boxTop = box.bbox.y + box.bbox.height;
                        const gap = boxTop - labelResult.insideBottom;
                        customPaddingTop = Math.max(2, Math.round(gap + 2));
                    }

                    const isMultiline = box.bbox.height > 50

                    detectedFields.push({
                        name: uniqueName,
                        type: isMultiline ? "multiline" : "text",
                        rect: {
                            x: box.bbox.x,
                            y: uiY,
                            width: box.bbox.width,
                            height: box.bbox.height,
                            pageIndex,
                        },
                        paddingTop: customPaddingTop,
                    })
                }
            }
        }
    }

    return detectedFields
}

export async function detectFieldAtPosition(
    pdfBuffer: ArrayBuffer,
    pageIndex: number,
    clickX: number,
    clickY: number,
    mode: DetectionMode,
    snapOnly: boolean = false,
    dragWidth?: number,
    dragHeight?: number
): Promise<DetectedField | null> {
    const { PDFExcavator } = await import("pdfexcavator")
    const excavator = await PDFExcavator.fromBuffer(Buffer.from(pdfBuffer))
    const page = await excavator.getPage(pageIndex)

    const { pageHeight, pageWidth, groupedLabels, graphics } = await analyzePage(page)
    const timestamp = Date.now()

    let target: GraphicItem | undefined;

    // --- 1. Selection Logic ---

    // A. Intersection Mode (Signature AND Multiline Dragging)
    // If we have dimensions, we look for physical overlaps anywhere on the dragged box
    if ((mode === 'signature' || mode === 'multiline') && dragWidth && dragHeight) {
        // Convert UI Top-Left Y to PDF Bottom-Left Y for the dragged rect
        // UI Y goes 0 -> Height. PDF Y goes 0 -> Height (starts at bottom).
        const pdfRectY = pageHeight - clickY - dragHeight;

        const draggedBBox: BBox = {
            x: clickX,
            y: pdfRectY,
            width: dragWidth,
            height: dragHeight
        };

        // Find candidates that intersect at all
        let candidates = graphics.filter(g => intersects(g.bbox, draggedBBox));

        // Sort by Intersection Area (Maximize overlap)
        candidates.sort((a, b) => {
            const getArea = (r1: BBox, r2: BBox) => {
                const xOverlap = Math.max(0, Math.min(r1.x + r1.width, r2.x + r2.width) - Math.max(r1.x, r2.x));
                const yOverlap = Math.max(0, Math.min(r1.y + r1.height, r2.y + r2.height) - Math.max(r1.y, r2.y));
                return xOverlap * yOverlap;
            }
            return getArea(b.bbox, draggedBBox) - getArea(a.bbox, draggedBBox);
        });

        target = candidates[0];
    }
    // B. Proximity Mode (Clicking or Standard Dragging without Dims)
    // Used for clicks or Text/Checkboxes where we search near the point
    else {
        const pdfClickY = pageHeight - clickY

        // Search Zone: Click Y extending DOWN 24px visually
        const searchZoneYMin = pdfClickY - 24
        const searchZoneYMax = pdfClickY

        let candidates = graphics.filter(g => {
            const gY = g.bbox.y
            const gH = g.bbox.height
            const vOverlap = Math.max(0, Math.min(searchZoneYMax, gY + gH) - Math.max(searchZoneYMin, gY))
            return vOverlap > 0
        })

        // Sort by horizontal distance to clickX
        candidates.sort((a, b) => {
            const distA = Math.min(Math.abs(a.bbox.x - clickX), Math.abs((a.bbox.x + a.bbox.width) - clickX))
            const distB = Math.min(Math.abs(b.bbox.x - clickX), Math.abs((b.bbox.x + b.bbox.width) - clickX))
            return distA - distB
        })

        target = candidates[0]

        // Enforce max distance for clicks
        if (target) {
            const distToClick = Math.min(Math.abs(target.bbox.x - clickX), Math.abs((target.bbox.x + target.bbox.width) - clickX))
            if (distToClick > 200) target = undefined
        }
    }


    // --- 2. Field Construction Logic ---

    // 1. Signature
    if (mode === 'signature') {
        if (target && target.type === 'circle') return null

        // If we found a valid target line or box
        if (target && (target.type === 'line' || target.type === 'rectangle')) {
            const w = target.bbox.width
            const h = target.bbox.height
            const isLine = target.type === 'line' || h < 5

            if (!isLine && h < 20) return null;

            if (isLine) {
                const labelResult = findLabelForLine(target.bbox, groupedLabels, pageWidth);

                if (!labelResult) return null;

                if (labelResult.source === 'above' && labelResult.bottom !== undefined) {
                    const lineTop = target.bbox.y + target.bbox.height;
                    const vGap = labelResult.bottom - lineTop;
                    if (vGap < 12) return null;
                }
            }

            const isSmallBox = (w < 40 && h < 40 && Math.abs(w - h) < 5)

            if (!isSmallBox) {
                // Determine if it is a Line (sit above) or a Box (fill completely)
                const isLine = target.type === 'line' || h < 5

                // If it's a line, use fixed height (50). If it's a box, use actual box height.
                const boxHeight = isLine ? 50 : h

                // Calculate UI Top Coordinate
                // Box: pageHeight - BottomY - Height = TopY
                // Line: pageHeight - BottomY - 50 = 50px Above Line
                const uiY = pageHeight - target.bbox.y - boxHeight

                // Check for internal text to apply padding (only for boxes)
                let customPaddingTop: number | undefined = undefined;
                if (!isLine) {
                    const labelResult = findLabelForRect(target.bbox, groupedLabels, pageWidth);
                    if (labelResult && labelResult.insideBottom !== undefined) {
                        const boxTop = target.bbox.y + target.bbox.height;
                        const gap = boxTop - labelResult.insideBottom;
                        customPaddingTop = Math.max(2, Math.round(gap + 2));
                    }
                }

                return {
                    name: "signature",
                    type: "signature",
                    rect: {
                        x: target.bbox.x,
                        y: uiY,
                        width: target.bbox.width > 50 ? target.bbox.width : 200, // Min width
                        height: boxHeight,
                        pageIndex
                    },
                    paddingTop: customPaddingTop
                }
            }
        }

        // Fallback: If "snapOnly" is true (during drag), we return null if no target found.
        if (snapOnly) return null;

        // Otherwise (during click creation), create a default free-floating signature
        return {
            name: "signature",
            type: "signature",
            rect: {
                x: clickX - 100,
                y: clickY - 25,
                width: 200,
                height: 50,
                pageIndex
            }
        }
    }

    // For other modes, if no target is found within range, return null
    if (!target && mode !== 'text' && mode !== 'multiline') return null


    // 2. Checkbox / Radio
    if ((mode === 'checkbox' || mode === 'radio') && target) {
        const isCircle = target.type === 'circle'
        const isRect = target.type === 'rectangle'
        const w = target.bbox.width
        const h = target.bbox.height
        const isSquare = Math.abs(w - h) < 2

        if (isRect && isSquare) {
            const label = findLabelForCheckbox(target.bbox, groupedLabels, pageWidth) || "checkbox"
            return {
                name: toSnakeCase(label),
                type: 'checkbox',
                rect: {
                    x: target.bbox.x,
                    y: pageHeight - target.bbox.y - target.bbox.height,
                    width: target.bbox.width,
                    height: target.bbox.height,
                    pageIndex
                }
            }
        }
        if (isCircle) {
            const label = findLabelForRadio(target.bbox, groupedLabels, pageWidth) || "radio"
            return {
                name: toSnakeCase(label),
                type: 'radio',
                rect: {
                    x: target.bbox.x,
                    y: pageHeight - target.bbox.y - target.bbox.height,
                    width: target.bbox.width,
                    height: target.bbox.height,
                    pageIndex
                }
            }
        }
    }

    // 3. Text / Multiline
    if (mode === 'text' || mode === 'multiline') {

        if (target && (target.type === 'line' || target.type === 'rectangle')) {
            const isLine = target.type === 'line' || target.bbox.height < 5

            if (mode === 'text' && (isLine || target.bbox.height < 50)) {
                let labelResult = isLine
                    ? findLabelForLine(target.bbox, groupedLabels, pageWidth)
                    : findLabelForRect(target.bbox, groupedLabels, pageWidth)

                if (labelResult) {
                    let fieldHeight = 24
                    const uiY = pageHeight - target.bbox.y - target.bbox.height

                    if (isLine) {
                        const padding = 2
                        const lineTop = target.bbox.y + target.bbox.height
                        const fieldZone = { x: target.bbox.x, y: lineTop, width: target.bbox.width, height: fieldHeight }
                        const obstacles = [...groupedLabels, ...(graphics as any).filter((g: any) => g !== target)]
                        let availableHeight = fieldHeight
                        for (const item of obstacles) {
                            if (intersects(fieldZone, item.bbox)) {
                                if (item.bbox.y >= lineTop) {
                                    const gap = item.bbox.y - lineTop
                                    if (gap < availableHeight) availableHeight = gap
                                }
                            }
                        }
                        const calculatedHeight = availableHeight - padding
                        if (calculatedHeight >= 10) fieldHeight = calculatedHeight
                        else return null
                    }

                    return {
                        name: toSnakeCase(labelResult.text),
                        type: 'text',
                        rect: {
                            x: target.bbox.x,
                            y: isLine ? uiY - fieldHeight + 2 : uiY,
                            width: target.bbox.width,
                            height: isLine ? fieldHeight : target.bbox.height,
                            pageIndex
                        }
                    }
                }
            }

            if (mode === 'multiline') {
                // If we hit this via drag, we might have a target from Section 1.A (Intersection Mode)
                // We should use that target's geometry.

                const labelResult = findLabelForRect(target.bbox, groupedLabels, pageWidth)
                // For multiline/signature boxes, we want to snap even if no label is found nearby,
                // but we definitely want to calculate padding if text is inside.

                let paddingTop = undefined
                if (labelResult && labelResult.insideBottom !== undefined) {
                    const boxTop = target.bbox.y + target.bbox.height
                    paddingTop = Math.max(2, Math.round(boxTop - labelResult.insideBottom + 2))
                }

                // If no label found but we have a solid target via overlap, we still snap (using snake case of "multiline" or similar)
                const nameBase = labelResult ? toSnakeCase(labelResult.text) : "multiline"

                return {
                    name: nameBase,
                    type: 'multiline',
                    rect: {
                        x: target.bbox.x,
                        y: pageHeight - target.bbox.y - target.bbox.height,
                        width: target.bbox.width,
                        height: target.bbox.height,
                        pageIndex
                    },
                    paddingTop
                }
            }
        }

        if (snapOnly) return null;

        if (mode === 'multiline') {
            const DEFAULT_W = 100
            const DEFAULT_H = 50
            return {
                name: "multiline",
                type: 'multiline',
                rect: {
                    x: clickX - (DEFAULT_W / 2),
                    y: clickY - (DEFAULT_H / 2),
                    width: DEFAULT_W,
                    height: DEFAULT_H,
                    pageIndex
                }
            }
        }

        if (mode === 'text') {
            const DEFAULT_W = 200
            const DEFAULT_H = 24
            return {
                name: "text",
                type: 'text',
                rect: {
                    x: clickX - (DEFAULT_W / 2),
                    y: clickY - (DEFAULT_H / 2),
                    width: DEFAULT_W,
                    height: DEFAULT_H,
                    pageIndex
                }
            }
        }
    }

    if (mode === 'date') {
        // Try to snap to a graphic target
        let fieldFromTarget: DetectedField | null = null;

        if (target && (target.type === 'line' || target.type === 'rectangle')) {
            const isLine = target.type === 'line' || target.bbox.height < 5;

            let labelResult = isLine
                ? findLabelForLine(target.bbox, groupedLabels, pageWidth)
                : findLabelForRect(target.bbox, groupedLabels, pageWidth);

            let fieldHeight = 24;
            const uiY = pageHeight - target.bbox.y - target.bbox.height;
            let paddingTop: number | undefined = undefined;

            if (isLine) {
                const padding = 2;
                const lineTop = target.bbox.y + target.bbox.height;
                const fieldZone = { x: target.bbox.x, y: lineTop, width: target.bbox.width, height: fieldHeight };
                const obstacles = [...groupedLabels, ...graphics.filter(g => g !== target)];
                let availableHeight = fieldHeight;
                for (const item of obstacles) {
                    if (intersects(fieldZone, item.bbox)) {
                        if (item.bbox.y >= lineTop) {
                            const gap = item.bbox.y - lineTop;
                            if (gap < availableHeight) availableHeight = gap;
                        }
                    }
                }
                const calculatedHeight = availableHeight - padding;
                if (calculatedHeight >= 10) {
                    fieldHeight = calculatedHeight;
                    fieldFromTarget = {
                        name: "date",
                        type: 'date',
                        rect: {
                            x: target.bbox.x,
                            y: uiY - fieldHeight + 2,
                            width: target.bbox.width,
                            height: fieldHeight,
                            pageIndex,
                        },
                    };
                }
            } else {
                // Rectangle / box
                fieldHeight = target.bbox.height;
                if (labelResult && 'insideBottom' in labelResult && labelResult.insideBottom !== undefined) {
                    const boxTop = target.bbox.y + target.bbox.height;
                    paddingTop = Math.max(2, Math.round(boxTop - labelResult.insideBottom + 2));
                }
                fieldFromTarget = {
                    name: "date",
                    type: 'date',
                    rect: {
                        x: target.bbox.x,
                        y: uiY,
                        width: target.bbox.width,
                        height: fieldHeight,
                        pageIndex,
                    },
                    paddingTop,
                };
            }
        }

        // If we successfully snapped to a target, return it
        if (fieldFromTarget) {
            return fieldFromTarget;
        }

        // Fallback – placeable anywhere (only for direct clicks, not drag‑snap)
        if (snapOnly) return null;
        const DEFAULT_W = 120;
        const DEFAULT_H = 24;
        return {
            name: "date",
            type: 'date',
            rect: {
                x: clickX - DEFAULT_W / 2,
                y: clickY - DEFAULT_H / 2,
                width: DEFAULT_W,
                height: DEFAULT_H,
                pageIndex,
            },
        };
    }

    // 4. Auto Mode
    if (mode === 'auto') {
        if (!target) return null;

        // Try Checkbox/Radio first
        if (target.type === 'rectangle' && Math.abs(target.bbox.width - target.bbox.height) < 2) {
            const lbl = findLabelForCheckbox(target.bbox, groupedLabels, pageWidth)
            if (lbl) return detectFieldAtPosition(pdfBuffer, pageIndex, clickX, clickY, 'checkbox')
        }
        if (target.type === 'circle') {
            return detectFieldAtPosition(pdfBuffer, pageIndex, clickX, clickY, 'radio')
        }

        // Try Signature
        const sig = detectSignature(target, groupedLabels, pageWidth)
        if (sig) return detectFieldAtPosition(pdfBuffer, pageIndex, clickX, clickY, 'signature')

        // Try Date
        const dateMatch = detectDate(target, groupedLabels, pageWidth)
        if (dateMatch) return detectFieldAtPosition(pdfBuffer, pageIndex, clickX, clickY, 'date')

        // Default Text
        if (target.bbox.height > 50) return detectFieldAtPosition(pdfBuffer, pageIndex, clickX, clickY, 'multiline')
        return detectFieldAtPosition(pdfBuffer, pageIndex, clickX, clickY, 'text')
    }

    return null
}
