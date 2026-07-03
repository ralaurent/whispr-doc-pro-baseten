import "server-only"

export interface TextSpan {
  left: number
  top: number
  fontSize: number
  text: string
}

export interface WidgetAnnotation {
  name: string
  /** normalized type: Text | Checkbox | Radio | Dropdown | List | Signature | Button */
  type: string
  x: number
  y: number
  width: number
  height: number
  comb?: boolean
  maxLen?: number
}

export interface PageText {
  index: number
  width: number
  height: number
  spans: TextSpan[]
  widgets: WidgetAnnotation[]
}

function mapAnnotationType(a: {
  fieldType?: string
  checkBox?: boolean
  radioButton?: boolean
  pushButton?: boolean
  combo?: boolean
}): string {
  switch (a.fieldType) {
    case "Tx":
      return "Text"
    case "Ch":
      return a.combo ? "Dropdown" : "List"
    case "Sig":
      return "Signature"
    case "Btn":
      if (a.checkBox) return "Checkbox"
      if (a.radioButton) return "Radio"
      return "Button"
    default:
      return "Text"
  }
}
export async function extractPageText(bytes: Uint8Array): Promise<PageText[]> {
  const { getDocumentProxy } = await import("unpdf")
  const doc = await getDocumentProxy(
    new Uint8Array(bytes),
    {
      useSystemFonts: true,
      isEvalSupported: false,
      disableFontFace: true,
      enableXfa: true,
      password: "",
    },
  )
  const pages: PageText[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const viewport = page.getViewport({ scale: 1 })
    const { width, height } = viewport
    const content = await page.getTextContent()
    const spans: TextSpan[] = []
    for (const item of content.items) {
      if (!("str" in item)) continue
      const str = item.str
      if (!str || !str.trim()) continue
      const transform = item.transform as number[]
      const x = transform[4]
      const yBaseline = transform[5]
      const fontHeight = Math.hypot(transform[2], transform[3]) || item.height || 10
      const topPx = height - yBaseline - fontHeight
      spans.push({
        left: (x / width) * 100,
        top: (topPx / height) * 100,
        fontSize: (fontHeight / height) * 100,
        text: str,
      })
    }
    const widgets: WidgetAnnotation[] = []
    try {
      const annotations = await page.getAnnotations({ intent: "any" })
      for (const a of annotations as Array<Record<string, any>>) {
        if (a.subtype !== "Widget") continue
        const name: string = a.fieldName || ""
        if (!name) continue
        const rect = a.rect as number[] | undefined
        if (!rect || rect.length < 4) continue
        const x = Math.min(rect[0], rect[2])
        const y = Math.min(rect[1], rect[3])
        const wWidth = Math.abs(rect[2] - rect[0])
        const wHeight = Math.abs(rect[3] - rect[1])
        if (wWidth <= 0 || wHeight <= 0) continue
        widgets.push({
          name,
          type: mapAnnotationType(a),
          x,
          y,
          width: wWidth,
          height: wHeight,
          comb: a.comb || false,
          maxLen: a.maxLen || undefined
        })
      }
    } catch {
      // Ignore annotation extraction failures for this page.
    }
    pages.push({ index: p - 1, width, height, spans, widgets })
    page.cleanup()
  }
  await doc.destroy()
  return pages
}
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}
export interface FieldBox {
  id: number
  type: string
  name: string
  page: number
  left: number
  top: number
  width: number
  height: number
}
export interface PageHtml {
  index: number
  html: string
}
function pageStyles(): string {
  return `  <style>
    .pdf-page { position: relative; margin: 0 auto; background: #ffffff; color: #111111; font-family: Helvetica, Arial, sans-serif; box-shadow: 0 1px 4px rgba(0,0,0,.15); overflow: hidden; }
    .pdf-page .pdf-text { position: absolute; white-space: pre; line-height: 1; }
    .pdf-page .pdf-field { position: absolute; box-sizing: border-box; border: 1.5px solid #2563eb; background: rgba(37,99,235,.10); border-radius: 2px; }
    .pdf-page .pdf-field-number { position: absolute; top: 0; left: 0; transform: translateY(-50%); background: #2563eb; color: #ffffff; font: 600 10px/1.4 Helvetica, Arial, sans-serif; padding: 0 4px; border-radius: 2px; }
  </style>`
}
export function buildPageHtml(page: PageText, fields: FieldBox[]): string {
  const w = Math.round(page.width)
  const h = Math.round(page.height)
  const texts = page.spans
    .map(
      (s) =>
        `    <span class="pdf-text" style="left:${s.left.toFixed(3)}%;top:${s.top.toFixed(
          3,
        )}%;font-size:${((s.fontSize / 100) * h).toFixed(2)}px">${escapeHtml(s.text)}</span>`,
    )
    .join("\n")
  const boxes = fields
    .filter((f) => f.page === page.index)
    .map(
      (f) =>
        `    <div class="pdf-field" data-field-id="${f.id}" data-field-type="${escapeHtml(
          f.type,
        )}" data-field-name="${escapeHtml(f.name)}" style="left:${f.left.toFixed(
          3,
        )}%;top:${f.top.toFixed(3)}%;width:${f.width.toFixed(3)}%;height:${f.height.toFixed(
          3,
        )}%"><span class="pdf-field-number">${f.id}</span></div>`,
    )
    .join("\n")
  return `${pageStyles()}
<div class="pdf-page" data-page="${page.index}" style="width:${w}px;height:${h}px">
${texts}
${boxes}
</div>`
}
/** Build one HTML string per page so each can be sent/copied independently. */
export function buildHtmlPages(pages: PageText[], fields: FieldBox[]): PageHtml[] {
  return pages.map((page) => ({ index: page.index, html: buildPageHtml(page, fields) }))
}