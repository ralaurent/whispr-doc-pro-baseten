//visual-detection.ts
import { DetectedField, DetectionMode } from "./pdf-utils"
import { SIGNATURE_REGEX, DATE_REGEX } from "./regex"

export interface LineLabelResult {
    text: string
    source: 'above' | 'left' | 'below'
    bottom?: number
}

export interface LabelResult {
    text: string
    insideBottom?: number
}

// --- Polyfills (unchanged) ---
if (typeof Promise.withResolvers === "undefined") {
    // @ts-ignore
    Promise.withResolvers = function () {
        let resolve, reject
        const promise = new Promise((res, rej) => {
            resolve = res
            reject = rej
        })
        return { promise, resolve, reject }
    }
}

if (typeof (global as any).DOMMatrix === "undefined") {
    ; (global as any).DOMMatrix = class DOMMatrix {
        a = 1; b = 0; c = 0; d = 1; e = 0; f = 0
        constructor(init?: string | number[]) {
            if (Array.isArray(init)) {
                const [a, b, c, d, e, f] = init
                this.a = a; this.b = b; this.c = c; this.d = d; this.e = e; this.f = f
            }
        }
        multiply() { return this }
        transformPoint(p: any) { return p }
        translate() { return this }
        scale() { return this }
        rotate() { return this }
    }
}

// --- Interfaces ---
export interface BBox {
    x: number
    y: number
    width: number
    height: number
}

export interface GraphicItem {
    type: "rectangle" | "line" | "circle"
    bbox: BBox
    filled?: boolean
}

export interface TextItem {
    text: string
    bbox: BBox
    fontSize: number
    fontName: string
    consumed?: boolean
}

// --- Constants ---
const MAX_LABEL_WORDS = 6;

// --- Raw Extraction Logic (Standard PDF Ops) ---
const OPS = {
    save: 10,
    restore: 11,
    transform: 12,
    moveTo: 13,
    lineTo: 14,
    curveTo: 15,
    curveTo2: 16,
    curveTo3: 17,
    constructPath: 91,
    rectangle: 19,
    stroke: 20,
    fill: 22,
    eoFill: 23,
    fillStroke: 24,
}

function analyzePath(points: { x: number; y: number }[], hasCurves: boolean): GraphicItem | null {
    if (points.length < 2) return null

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (const p of points) {
        if (p.x < minX) minX = p.x
        if (p.x > maxX) maxX = p.x
        if (p.y < minY) minY = p.y
        if (p.y > maxY) maxY = p.y
    }

    const width = maxX - minX
    const height = maxY - minY

    if (hasCurves && Math.abs(width - height) < 2 && width >= 2 && width <= 26) {
        return {
            type: "circle",
            bbox: { x: minX, y: minY, width, height }
        }
    }

    if (height <= 5 && width > 5) {
        return {
            type: "line",
            bbox: { x: minX, y: minY, width, height: Math.max(1, height) }
        }
    }

    if (width > 5 && height > 5) {
        return {
            type: "rectangle",
            bbox: { x: minX, y: minY, width, height }
        }
    }

    return null
}

export async function extractGraphicsRaw(pdfJsPage: any, pageHeight: number): Promise<GraphicItem[]> {
    const opList = await pdfJsPage.getOperatorList()
    const items: GraphicItem[] = []
    let pendingItems: GraphicItem[] = []

    const fnArray = opList.fnArray
    const argsArray = opList.argsArray
    let currentPath: { x: number; y: number }[] = []
    let pathHasCurves = false

    let ctm = [1, 0, 0, 1, 0, 0]
    const ctmStack: number[][] = []

    const applyTransform = (x: number, y: number): { x: number; y: number } => {
        return {
            x: ctm[0] * x + ctm[2] * y + ctm[4],
            y: ctm[1] * x + ctm[3] * y + ctm[5]
        }
    }

    const multiplyMatrices = (m1: number[], m2: number[]): number[] => {
        return [
            m1[0] * m2[0] + m1[2] * m2[1],
            m1[1] * m2[0] + m1[3] * m2[1],
            m1[0] * m2[2] + m1[2] * m2[3],
            m1[1] * m2[2] + m1[3] * m2[3],
            m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
            m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
        ]
    }

    // Helper to move pending items to final list with fill status
    const flushPending = (isFilled: boolean) => {
        for (const item of pendingItems) {
            item.filled = isFilled
            items.push(item)
        }
        pendingItems = []
    }

    const commitPath = () => {
        if (currentPath.length > 0) {
            const item = analyzePath(currentPath, pathHasCurves)
            // Push to pending instead of final items
            if (item) pendingItems.push(item)
            currentPath = []
            pathHasCurves = false
        }
    }

    const addRectangle = (x: number, y: number, w: number, h: number) => {
        const corners = [
            applyTransform(x, y),
            applyTransform(x + w, y),
            applyTransform(x + w, y + h),
            applyTransform(x, y + h)
        ]

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        for (const c of corners) {
            if (c.x < minX) minX = c.x
            if (c.x > maxX) maxX = c.x
            if (c.y < minY) minY = c.y
            if (c.y > maxY) maxY = c.y
        }

        const width = maxX - minX
        const height = maxY - minY

        if (width > 500 && height > 500) return

        // Push to pending
        pendingItems.push({
            type: "rectangle",
            bbox: { x: minX, y: minY, width, height }
        })
    }

    for (let i = 0; i < fnArray.length; i++) {
        const fn = fnArray[i]
        const args = argsArray[i]

        if (fn === OPS.save) {
            ctmStack.push([...ctm])
        }
        else if (fn === OPS.restore) {
            if (ctmStack.length > 0) {
                ctm = ctmStack.pop()!
            }
        }
        else if (fn === OPS.transform) {
            ctm = multiplyMatrices(ctm, args)
        }
        else if (fn === OPS.rectangle) {
            const [x, y, w, h] = args
            addRectangle(x, y, w, h)
        }
        else if (fn === OPS.constructPath) {
            const [subOps, subArgs] = args
            let argIdx = 0
            for (let j = 0; j < subOps.length; j++) {
                const op = subOps[j]
                if (op === OPS.moveTo) {
                    commitPath()
                    const x = subArgs[argIdx++]
                    const y = subArgs[argIdx++]
                    const tp = applyTransform(x, y)
                    currentPath.push(tp)
                }
                else if (op === OPS.lineTo) {
                    const x = subArgs[argIdx++]
                    const y = subArgs[argIdx++]
                    const tp = applyTransform(x, y)
                    currentPath.push(tp)
                }
                else if (op === OPS.rectangle) {
                    commitPath()
                    const x = subArgs[argIdx++]
                    const y = subArgs[argIdx++]
                    const w = subArgs[argIdx++]
                    const h = subArgs[argIdx++]
                    addRectangle(x, y, w, h)
                }
                else if (op === OPS.curveTo) {
                    pathHasCurves = true;
                    for (let k = 0; k < 3; k++) {
                        const x = subArgs[argIdx++]
                        const y = subArgs[argIdx++]
                        currentPath.push(applyTransform(x, y))
                    }
                }
                else if (op === OPS.curveTo2 || op === OPS.curveTo3) {
                    pathHasCurves = true;
                    for (let k = 0; k < 2; k++) {
                        const x = subArgs[argIdx++]
                        const y = subArgs[argIdx++]
                        currentPath.push(applyTransform(x, y))
                    }
                }
            }
            commitPath()
        }
        else if (fn === OPS.moveTo) {
            commitPath()
            const tp = applyTransform(args[0], args[1])
            currentPath.push(tp)
        }
        else if (fn === OPS.lineTo) {
            const tp = applyTransform(args[0], args[1])
            currentPath.push(tp)
        }
        else if (fn === OPS.curveTo) {
            pathHasCurves = true;
            currentPath.push(applyTransform(args[0], args[1]))
            currentPath.push(applyTransform(args[2], args[3]))
            currentPath.push(applyTransform(args[4], args[5]))
        }
        else if (fn === OPS.curveTo2 || fn === OPS.curveTo3) {
            pathHasCurves = true;
            currentPath.push(applyTransform(args[0], args[1]))
            currentPath.push(applyTransform(args[2], args[3]))
        }
        else if (fn === OPS.stroke) {
            commitPath()
            flushPending(false) // Not filled (outline)
        }
        else if (fn === OPS.fill || fn === OPS.eoFill || fn === OPS.fillStroke) {
            commitPath()
            flushPending(true) // Filled (or filled+stroked, which counts as filled)
        }
    }
    return items
}

function normalizeVisuals(graphics: GraphicItem[], textItems: TextItem[]): { finalGraphics: GraphicItem[], finalWords: TextItem[] } {
    const newGraphics = [...graphics];
    const remainingWords: TextItem[] = [];

    // --- A. Font-Based Checkbox & Line Detection ---
    // Matches: ☐, ☑, ☒, heavy underscores, or common bracket styles [ ]
    const SYMBOL_REGEX = /^[\u25A0-\u25FF\u2610-\u2612]|^\[\s?\]$/;
    const UNDERSCORE_REGEX = /^_{3,}$/;

    for (const item of textItems) {
        const str = item.text.trim();

        // 1. Convert text squares to Rectangle Graphics
        if (SYMBOL_REGEX.test(str) || (item.fontName.toLowerCase().includes('wingdings') && str.length === 1)) {
            // Force a square aspect ratio based on font size
            const size = Math.max(item.bbox.width, item.bbox.height, 12);
            newGraphics.push({
                type: "rectangle",
                bbox: { x: item.bbox.x, y: item.bbox.y, width: size, height: size },
                filled: false
            });
            continue; // Do not treat as text label
        }

        // 2. Convert underscores to Line Graphics
        if (UNDERSCORE_REGEX.test(str)) {
            newGraphics.push({
                type: "line",
                bbox: { x: item.bbox.x, y: item.bbox.y + item.bbox.height - 1, width: item.bbox.width, height: 1 },
                filled: true
            });
            continue;
        }

        remainingWords.push(item);
    }

    // --- B. Fragmented Line Merging (The "4 lines = 1 box" fix) ---
    // Filter for potential border segments (lines or very thin rectangles)
    const segments = newGraphics.filter(g =>
        (g.type === "line" || (g.type === "rectangle" && (g.bbox.width < 3 || g.bbox.height < 3)))
        && g.bbox.width < 60 && g.bbox.height < 60
    );

    const others = newGraphics.filter(g => !segments.includes(g));
    const mergedRects: GraphicItem[] = [];
    const usedSegments = new Set<GraphicItem>();

    // Naive clustering: Group segments that touch or almost touch
    for (let i = 0; i < segments.length; i++) {
        if (usedSegments.has(segments[i])) continue;

        const cluster = [segments[i]];
        let changed = true;

        // Iteratively expand cluster
        while (changed) {
            changed = false;
            // Get current cluster bounds
            let minX = Math.min(...cluster.map(c => c.bbox.x));
            let maxX = Math.max(...cluster.map(c => c.bbox.x + c.bbox.width));
            let minY = Math.min(...cluster.map(c => c.bbox.y));
            let maxY = Math.max(...cluster.map(c => c.bbox.y + c.bbox.height));

            for (let j = 0; j < segments.length; j++) {
                if (usedSegments.has(segments[j]) || cluster.includes(segments[j])) continue;

                const s = segments[j].bbox;
                const tolerance = 4; // 4px gap tolerance

                // Check if segment touches the cluster's bounding zone
                const intersects = !(s.x > maxX + tolerance || s.x + s.width < minX - tolerance ||
                    s.y > maxY + tolerance || s.y + s.height < minY - tolerance);

                if (intersects) {
                    cluster.push(segments[j]);
                    changed = true;
                    // Update bounds immediately for the next check in this loop
                    minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x + s.width);
                    minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y + s.height);
                }
            }
        }

        // Analyze cluster: Does it form a box?
        // A box usually needs 4 strokes, but sometimes 3 if corners overlap well.
        if (cluster.length >= 4) {
            const minX = Math.min(...cluster.map(c => c.bbox.x));
            const maxX = Math.max(...cluster.map(c => c.bbox.x + c.bbox.width));
            const minY = Math.min(...cluster.map(c => c.bbox.y));
            const maxY = Math.max(...cluster.map(c => c.bbox.y + c.bbox.height));

            const w = maxX - minX;
            const h = maxY - minY;

            // Is it square-ish and within checkbox size limits?
            if (w >= 8 && w <= 40 && h >= 8 && h <= 40 && Math.abs(w - h) < 10) {
                mergedRects.push({
                    type: "rectangle",
                    bbox: { x: minX, y: minY, width: w, height: h },
                    filled: false
                });
                cluster.forEach(c => usedSegments.add(c));
            }
        }
    }

    const finalGraphics = [
        ...others,
        ...segments.filter(s => !usedSegments.has(s)), // Keep unused lines
        ...mergedRects // Add the new merged boxes
    ];

    return { finalGraphics, finalWords: remainingWords };
}

// --- Shared Page Parsing ---
export async function analyzePage(page: any) {
    let pageHeight = 792
    let pageWidth = 612
    try {
        const size = await (page as any).getSize()
        pageHeight = size.height
        pageWidth = size.width
    } catch (e) {
        pageHeight = (page as any)._page?._pageInfo?.view?.[3] || 792
        pageWidth = (page as any)._page?._pageInfo?.view?.[2] || 612
    }

    let words: TextItem[] = []
    if ((page as any)._page) {
        try {
            const textContent = await (page as any)._page.getTextContent()
            words = textContent.items.map((item: any) => {
                const { transform, width, height, str, fontName } = item
                if (width > pageWidth * 0.8) return null
                const fontSize = Math.abs(transform[3])
                return {
                    text: str,
                    bbox: { x: transform[4], y: transform[5], width: width, height: height || fontSize || 12 },
                    fontSize: fontSize || 12,
                    fontName: fontName || "unknown",
                    consumed: false
                }
            }).filter((w: TextItem | null) => w !== null && w.text.trim() !== "") as TextItem[]
        } catch (e) {
            console.error("Text position extraction failed:", e)
        }
    }

    let graphics: GraphicItem[] = []
    if ((page as any)._page) {
        try {
            graphics = await extractGraphicsRaw((page as any)._page, pageHeight)
        } catch (e) { }
    }

    const { finalGraphics, finalWords } = normalizeVisuals(graphics, words);

    const groupedLabels = groupTextItems(finalWords)

    return { pageHeight, pageWidth, groupedLabels, graphics: finalGraphics }
}


// --- Table Detection Logic ---

export interface TableRegion {
    bbox: BBox
    columns: { start: number; end: number }[]
}

function getGroupBBox(items: TextItem[] | GraphicItem[]): BBox {
    if (items.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const item of items) {
        minX = Math.min(minX, item.bbox.x);
        minY = Math.min(minY, item.bbox.y);
        maxX = Math.max(maxX, item.bbox.x + item.bbox.width);
        maxY = Math.max(maxY, item.bbox.y + item.bbox.height);
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function groupIntoVisualLines(items: TextItem[]): { y: number, items: TextItem[], bbox: BBox }[] {
    if (items.length === 0) return [];
    const sorted = [...items].sort((a, b) => b.bbox.y - a.bbox.y);
    const lines: { y: number, items: TextItem[], bbox: BBox }[] = [];
    const avgFontSize = items.reduce((s, i) => s + i.fontSize, 0) / (items.length || 1);

    let currentLine = { y: sorted[0].bbox.y, items: [sorted[0]] };
    for (let i = 1; i < sorted.length; i++) {
        const item = sorted[i];
        if (Math.abs(item.bbox.y - currentLine.y) < avgFontSize * 0.4) {
            currentLine.items.push(item);
        } else {
            currentLine.items.sort((a, b) => a.bbox.x - b.bbox.x);
            lines.push({ y: currentLine.y, items: currentLine.items, bbox: getGroupBBox(currentLine.items) });
            currentLine = { y: item.bbox.y, items: [item] };
        }
    }
    currentLine.items.sort((a, b) => a.bbox.x - b.bbox.x);
    lines.push({ y: currentLine.y, items: currentLine.items, bbox: getGroupBBox(currentLine.items) });
    return lines;
}

function findColumnBoundaries(
    lines: { y: number; items: TextItem[]; bbox: BBox }[],
    blockBBox: BBox,
    avgFontSize: number
): { start: number; end: number }[] {
    if (lines.length < 3) return []

    const minGapWidth = avgFontSize * 1.5
    const gapObservations: { left: number; right: number }[] = []

    for (const line of lines) {
        if (line.items.length < 2) continue
        const sorted = [...line.items].sort((a, b) => a.bbox.x - b.bbox.x)
        for (let i = 0; i < sorted.length - 1; i++) {
            const rightEdge = sorted[i].bbox.x + sorted[i].bbox.width
            const nextLeftEdge = sorted[i + 1].bbox.x
            if (nextLeftEdge - rightEdge >= minGapWidth) {
                gapObservations.push({ left: rightEdge, right: nextLeftEdge })
            }
        }
    }

    if (gapObservations.length === 0) return []

    gapObservations.sort((a, b) => (a.left + a.right) / 2 - (b.left + b.right) / 2)
    const clusterRadius = avgFontSize * 2
    const clusters: { lefts: number[]; rights: number[] }[] = []

    for (const gap of gapObservations) {
        const mid = (gap.left + gap.right) / 2
        let bestCluster: (typeof clusters)[0] | null = null
        let bestDist = Infinity
        for (const c of clusters) {
            const cMid = (c.lefts.reduce((s, v) => s + v, 0) / c.lefts.length +
                c.rights.reduce((s, v) => s + v, 0) / c.rights.length) / 2
            const dist = Math.abs(cMid - mid)
            if (dist < clusterRadius && dist < bestDist) {
                bestCluster = c
                bestDist = dist
            }
        }
        if (bestCluster) {
            bestCluster.lefts.push(gap.left)
            bestCluster.rights.push(gap.right)
        } else {
            clusters.push({ lefts: [gap.left], rights: [gap.right] })
        }
    }

    const linesWithMultipleItems = lines.filter(l => l.items.length >= 2).length
    const minOccurrence = Math.max(2, linesWithMultipleItems * 0.25)

    const significantGaps = clusters
        .filter(c => c.lefts.length >= minOccurrence)
        .map(c => ({
            left: c.lefts.reduce((s, v) => s + v, 0) / c.lefts.length,
            right: c.rights.reduce((s, v) => s + v, 0) / c.rights.length,
        }))
        .sort((a, b) => a.left - b.left)

    if (significantGaps.length === 0) return []

    const columns: { start: number; end: number }[] = []
    columns.push({ start: blockBBox.x, end: significantGaps[0].left })
    for (let i = 0; i < significantGaps.length - 1; i++) {
        columns.push({ start: significantGaps[i].right, end: significantGaps[i + 1].left })
    }
    columns.push({
        start: significantGaps[significantGaps.length - 1].right,
        end: blockBBox.x + blockBBox.width
    })

    return columns.filter(c => (c.end - c.start) > avgFontSize * 0.5)
}

function calculateGridDensity(
    lines: { y: number; items: TextItem[]; bbox: BBox }[],
    columns: { start: number; end: number }[]
): any {
    if (columns.length < 2 || lines.length < 3) {
        return { fillRatio: 0, rowConsistency: 0, significantCols: 0, spanViolations: 0, gridScore: 0 }
    }

    const totalCells = lines.length * columns.length
    let populatedCells = 0
    const colPopCount = new Array(columns.length).fill(0)
    let rowsWithMultipleCols = 0
    let spanViolations = 0

    for (const line of lines) {
        const rowCols = new Set<number>()
        for (const item of line.items) {
            const itemLeft = item.bbox.x
            const itemRight = item.bbox.x + item.bbox.width
            const itemMid = (itemLeft + itemRight) / 2

            let spansMultiple = false
            for (let k = 0; k < columns.length - 1; k++) {
                const gapCenter = (columns[k].end + columns[k + 1].start) / 2
                if (itemLeft < gapCenter - 5 && itemRight > gapCenter + 5) {
                    spansMultiple = true
                    break
                }
            }
            if (spansMultiple) { spanViolations++; continue }

            for (let k = 0; k < columns.length; k++) {
                if (itemMid >= columns[k].start - 5 && itemMid <= columns[k].end + 5) {
                    rowCols.add(k)
                    break
                }
            }
        }

        populatedCells += rowCols.size
        rowCols.forEach(k => colPopCount[k]++)
        if (rowCols.size >= 2) rowsWithMultipleCols++
    }

    const fillRatio = populatedCells / totalCells
    const rowConsistency = rowsWithMultipleCols / lines.length
    const significantCols = colPopCount.filter(c => c / lines.length > 0.3).length

    const totalItems = lines.reduce((s, l) => s + l.items.length, 0)
    const violationRatio = spanViolations / (totalItems || 1)
    const minColUsage = Math.min(...colPopCount.map(c => c / lines.length))

    const gridScore = (fillRatio * 0.3 + rowConsistency * 0.4 + minColUsage * 0.3) * (1 - violationRatio * 2)

    return { fillRatio, rowConsistency, significantCols, spanViolations, gridScore }
}

function clusterLinesIntoBlocks(
    lines: { y: number; items: TextItem[]; bbox: BBox }[],
    threshold: number
): { lines: typeof lines; bbox: BBox }[] {
    if (lines.length === 0) return []
    const blocks: { lines: typeof lines; bbox: BBox }[] = []
    let currentBlock = [lines[0]]

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i]
        const prevLine = currentBlock[currentBlock.length - 1]
        const gap = prevLine.y - line.y
        const overlap = Math.min(
            prevLine.bbox.x + prevLine.bbox.width,
            line.bbox.x + line.bbox.width
        ) - Math.max(prevLine.bbox.x, line.bbox.x)

        if (gap > threshold || overlap < 0) {
            blocks.push({ lines: currentBlock, bbox: getGroupBBox(currentBlock.flatMap(l => l.items)) })
            currentBlock = [line]
        } else {
            currentBlock.push(line)
        }
    }
    blocks.push({ lines: currentBlock, bbox: getGroupBBox(currentBlock.flatMap(l => l.items)) })
    return blocks
}

export function detectTableRegions(graphics: GraphicItem[], textItems: TextItem[]): TableRegion[] {
    const lines = groupIntoVisualLines(textItems)
    const blocks = clusterLinesIntoBlocks(lines, 40)
    const tableRegions: TableRegion[] = []

    for (const block of blocks) {
        const avgFontSize = block.lines.reduce((s, l) => s + l.items.reduce((ss, i) => ss + i.fontSize, 0), 0) /
            block.lines.reduce((s, l) => s + l.items.length, 0)

        const columns = findColumnBoundaries(block.lines, block.bbox, avgFontSize)
        if (columns.length < 2) continue

        const density = calculateGridDensity(block.lines, columns)

        if (density.gridScore > 0.4) {
            tableRegions.push({
                bbox: block.bbox,
                columns
            })
        }
    }

    const explicitTableRects = graphics.filter(g =>
        g.type === 'rectangle' && (g.bbox.width > 100 && g.bbox.height > 50)
    )

    for (const rect of explicitTableRects) {
        const insideText = textItems.filter(t => intersects(rect.bbox, t.bbox))
        if (insideText.length < 4) continue

        const lines = groupIntoVisualLines(insideText)
        if (lines.length < 2) continue

        const avgFontSize = insideText.reduce((s, i) => s + i.fontSize, 0) / insideText.length
        const columns = findColumnBoundaries(lines, rect.bbox, avgFontSize)

        if (columns.length >= 2) {
            const density = calculateGridDensity(lines, columns)
            if (density.gridScore > 0.3) {
                const alreadyDetected = tableRegions.some(tr => {
                    const iou = calculateIoU(tr.bbox, rect.bbox)
                    return iou > 0.7
                })
                if (!alreadyDetected) {
                    tableRegions.push({ bbox: rect.bbox, columns })
                }
            }
        }
    }

    return tableRegions
}

function calculateIoU(box1: BBox, box2: BBox): number {
    const xLeft = Math.max(box1.x, box2.x);
    const yTop = Math.max(box1.y, box2.y);
    const xRight = Math.min(box1.x + box1.width, box2.x + box2.width);
    const yBottom = Math.min(box1.y + box1.height, box2.y + box2.height);

    if (xRight < xLeft || yBottom < yTop) return 0;

    const intersectionArea = (xRight - xLeft) * (yBottom - yTop);
    const box1Area = box1.width * box1.height;
    const box2Area = box2.width * box2.height;
    return intersectionArea / (box1Area + box2Area - intersectionArea);
}

export function detectSignature(
    graphic: GraphicItem,
    labels: TextItem[],
    pageWidth: number
): string | null {
    const isSigText = (t: string) => SIGNATURE_REGEX.test(t);

    const lbl = findLabelForRect(graphic.bbox, labels, pageWidth);
    if (lbl && isSigText(lbl.text)) return lbl.text;

    const nearLabels = labels.filter(l => {
        const dx = Math.abs(l.bbox.x - graphic.bbox.x);
        const dy = Math.abs(l.bbox.y - graphic.bbox.y);
        return dx < 100 && dy < 50;
    });

    for (const l of nearLabels) {
        if (isSigText(l.text)) return l.text;
    }

    return null;
}

export function detectDate(
    graphic: GraphicItem,
    labels: TextItem[],
    pageWidth: number
): string | null {
    const isDateText = (t: string) => DATE_REGEX.test(t);

    const lbl = findLabelForRect(graphic.bbox, labels, pageWidth);
    if (lbl && isDateText(lbl.text)) return lbl.text;

    const nearLabels = labels.filter(l => {
        const dx = Math.abs(l.bbox.x - graphic.bbox.x);
        const dy = Math.abs(l.bbox.y - graphic.bbox.y);
        return dx < 80 && dy < 40;
    });

    for (const l of nearLabels) {
        if (isDateText(l.text)) return l.text;
    }

    return null;
}

export function getBBoxFromItems(items: TextItem[] | GraphicItem[]): BBox {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const item of items) {
        minX = Math.min(minX, item.bbox.x);
        minY = Math.min(minY, item.bbox.y);
        maxX = Math.max(maxX, item.bbox.x + item.bbox.width);
        maxY = Math.max(maxY, item.bbox.y + item.bbox.height);
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function groupTextItems(items: TextItem[]): TextItem[] {
    if (items.length === 0) return []
    const sorted = [...items].sort((a, b) => {
        const yDiff = b.bbox.y - a.bbox.y
        if (Math.abs(yDiff) < 5) {
            return a.bbox.x - b.bbox.x
        }
        return yDiff
    })

    const groups: TextItem[] = []
    let currentGroup: TextItem | null = null

    for (const item of sorted) {
        if (!currentGroup) {
            currentGroup = { ...item }
            continue
        }

        if (item.fontName !== currentGroup.fontName) {
            groups.push(currentGroup)
            currentGroup = { ...item }
            continue
        }

        const fontSize = Math.max(item.fontSize, currentGroup.fontSize)
        const spaceWidthPx = fontSize * 0.3
        const tolerance = spaceWidthPx + 1

        const vGap = Math.abs(item.bbox.y - currentGroup.bbox.y)
        const hGap = item.bbox.x - (currentGroup.bbox.x + currentGroup.bbox.width)

        if (vGap <= tolerance && hGap <= tolerance) {
            const addSpace = hGap > (fontSize * 0.1)
            currentGroup.text += (addSpace ? " " : "") + item.text
            currentGroup.bbox.width = (item.bbox.x + item.bbox.width) - currentGroup.bbox.x
            currentGroup.fontSize = Math.max(currentGroup.fontSize, item.fontSize)
        } else {
            groups.push(currentGroup)
            currentGroup = { ...item }
        }
    }
    if (currentGroup) groups.push(currentGroup)
    return groups
}

export function toSnakeCase(str: string): string {
    return str.trim()
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, '_')
}

export function isValidLabel(text: string): boolean {
    if (!text || text.trim().length === 0) return false;
    const cleanText = text.trim();
    // Allow long labels if they contain specific keywords
    if (SIGNATURE_REGEX.test(cleanText) || DATE_REGEX.test(cleanText)) return true;
    const wordCount = cleanText.split(/\s+/).length;
    return wordCount <= MAX_LABEL_WORDS;
}

// --- Proximity & Zone Logic ---

export function intersects(r1: BBox, r2: BBox): boolean {
    return !(r2.x > r1.x + r1.width ||
        r2.x + r2.width < r1.x ||
        r2.y > r1.y + r1.height ||
        r2.y + r2.height < r1.y);
}

export function findLabelForLine(line: BBox, labels: TextItem[], pageWidth: number): LineLabelResult | null {
    const tolerance = 5;

    // A. Direct Left Check
    const leftZone = { x: line.x - 200, y: line.y - 12, width: 200, height: 24 };
    const leftCandidates = labels.filter(l => intersects(l.bbox, leftZone));
    if (leftCandidates.length > 0) {
        const text = collectLabel(leftCandidates, 'left', line);
        if (text) return { text, source: 'left' };
    }

    // B. Direct Above Check (Anchor to the left side of the line)
    const aboveZone = { x: line.x, y: line.y + line.height, width: Math.max(100, line.width * 0.6), height: 30 };
    const aboveCandidates = labels.filter(l => intersects(l.bbox, aboveZone));
    if (aboveCandidates.length > 0) {
        const text = collectLabel(aboveCandidates, 'above', line);
        if (text) {
            // Find the lowest point of the above label
            const minY = Math.min(...aboveCandidates.map(c => c.bbox.y));
            return { text, source: 'above', bottom: minY };
        }
    }

    return null;
}

export function collectLabel(
    candidates: TextItem[],
    direction: 'left' | 'right' | 'above',
    fieldRect: BBox
): string | null {
    if (candidates.length === 0) return null;

    let sorted = [...candidates];

    if (direction === 'left') {
        sorted.sort((a, b) => {
            const midY = fieldRect.y + fieldRect.height / 2;
            const distYa = Math.abs((a.bbox.y + a.bbox.height / 2) - midY);
            const distYb = Math.abs((b.bbox.y + b.bbox.height / 2) - midY);

            if (Math.abs(distYa - distYb) > 3) {
                return distYa - distYb;
            }
            return (b.bbox.x + b.bbox.width) - (a.bbox.x + a.bbox.width);
        });
    } else if (direction === 'right') {
        sorted.sort((a, b) => {
            const midY = fieldRect.y + fieldRect.height / 2;
            const distYa = Math.abs((a.bbox.y + a.bbox.height / 2) - midY);
            const distYb = Math.abs((b.bbox.y + b.bbox.height / 2) - midY);
            if (Math.abs(distYa - distYb) > 3) return distYa - distYb;

            return a.bbox.x - b.bbox.x;
        });
    } else {
        sorted.sort((a, b) => a.bbox.y - b.bbox.y);
    }

    const anchor = sorted[0];
    if (!isValidLabel(anchor.text)) return null;

    const itemsToConsume = [anchor];
    let collectedText = anchor.text;
    let prev = anchor;

    const others = sorted.slice(1);

    if (direction === 'left') {
        others.sort((a, b) => b.bbox.x - a.bbox.x); // Right-to-left
    } else if (direction === 'right') {
        others.sort((a, b) => a.bbox.x - b.bbox.x); // Left-to-right
    } else {
        others.sort((a, b) => a.bbox.y - b.bbox.y); // Bottom-to-top
    }

    for (const item of others) {
        const fontSize = Math.max(item.fontSize, prev.fontSize);
        const spaceWidthPx = fontSize * 0.4;

        let gap = 0;
        let isAligned = true;

        if (direction === 'left') {
            gap = prev.bbox.x - (item.bbox.x + item.bbox.width);
            if (Math.abs(item.bbox.y - prev.bbox.y) > fontSize * 0.8) isAligned = false;
        } else if (direction === 'right') {
            gap = item.bbox.x - (prev.bbox.x + prev.bbox.width);
            if (Math.abs(item.bbox.y - prev.bbox.y) > fontSize * 0.8) isAligned = false;
        } else {
            gap = item.bbox.y - (prev.bbox.y + prev.bbox.height);
            const overlapX = Math.max(0, Math.min(item.bbox.x + item.bbox.width, prev.bbox.x + prev.bbox.width) - Math.max(item.bbox.x, prev.bbox.x));
            if (overlapX === 0) isAligned = false;
        }

        if (!isAligned) break;
        if (gap < -(fontSize * 0.5) || gap > spaceWidthPx + 2) break;

        const newText = (direction === 'left' || direction === 'above')
            ? item.text + " " + collectedText
            : collectedText + " " + item.text;

        if (!isValidLabel(newText)) break;

        itemsToConsume.push(item);
        collectedText = newText;
        prev = item;
    }

    itemsToConsume.forEach(i => i.consumed = true);
    return collectedText;
}

export function findLabelForCheckbox(rect: BBox, labels: TextItem[], pageWidth: number): string | null {
    // Checkboxes are small squares. Labels are usually to the RIGHT or LEFT.
    const tolerance = 5;

    // 1. Right side (most common)
    const rightZone = { x: rect.x + rect.width, y: rect.y - 10, width: 200, height: rect.height + 20 };
    const rightCandidates = labels.filter(l => intersects(l.bbox, rightZone));
    if (rightCandidates.length > 0) {
        return collectLabel(rightCandidates, 'right', rect);
    }

    // 2. Left side
    const leftZone = { x: rect.x - 200, y: rect.y - 10, width: 200, height: rect.height + 20 };
    const leftCandidates = labels.filter(l => intersects(l.bbox, leftZone));
    if (leftCandidates.length > 0) {
        return collectLabel(leftCandidates, 'left', rect);
    }

    return null;
}

export function findLabelForRadio(rect: BBox, labels: TextItem[], pageWidth: number): string | null {
    // Radios behave like checkboxes
    return findLabelForCheckbox(rect, labels, pageWidth);
}

export function findLabelForRect(rect: BBox, labels: TextItem[], pageWidth: number): LabelResult | null {
    // 1. Check INSIDE first (for filled-out forms or overlapping text)
    const insideCandidates = labels.filter(l => intersects(l.bbox, rect));
    if (insideCandidates.length > 0) {
        const text = collectLabel(insideCandidates, 'right', rect); // usage of collectLabel for inside text
        if (text) {
            const minY = Math.min(...insideCandidates.map(c => c.bbox.y));
            return { text, insideBottom: minY };
        }
    }

    // 2. Check Above
    const aboveZone = { x: rect.x, y: rect.y + rect.height, width: Math.max(100, rect.width), height: 30 };
    const aboveCandidates = labels.filter(l => intersects(l.bbox, aboveZone));
    if (aboveCandidates.length > 0) {
        const text = collectLabel(aboveCandidates, 'above', rect);
        if (text) return { text };
    }

    // 3. Check Left
    const leftZone = { x: rect.x - 200, y: rect.y - 12, width: 200, height: 24 };
    const leftCandidates = labels.filter(l => intersects(l.bbox, leftZone));
    if (leftCandidates.length > 0) {
        const text = collectLabel(leftCandidates, 'left', rect);
        if (text) return { text };
    }

    return null;
}