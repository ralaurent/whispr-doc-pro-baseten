// lib/pdf-utils.ts
import {
  PDFDocument,
  PDFName,
  PDFRadioGroup,
  PDFTextField,
  PDFCheckBox,
  PDFDropdown,
  StandardFonts,
  rgb,
  PDFSignature,
  PDFHexString,
  PDFDict,
  PDFArray,
  PDFString
} from "pdf-lib"
import { pdflibAddPlaceholder } from "@signpdf/placeholder-pdf-lib"

export type DetectionMode = 'auto' | 'text' | 'multiline' | 'checkbox' | 'radio' | 'signature' | 'date' | 'dropdown'
export type FormType = 'no-form' | 'xfa-only' | 'hybrid' | 'acroform'

export function sanitizeFieldLabel(raw: string): string {
  let s = raw.trim()

  // 1. Strip leading number + period (e.g. "15. ", "3.")
  s = s.replace(/^\d+\.\s*/, '')

  // 2. Remove parentheses and their contents... 
  // BUT if doing so leaves the string completely empty (e.g., the label was literally just "(if any)"),
  // then keep the text and just remove the bracket characters themselves.
  let noParens = s.replace(/\([^)]*\)/g, '')
  if (noParens.replace(/[^a-zA-Z0-9]/g, '').length === 0) {
    s = s.replace(/[()]/g, '') // Just remove the brackets
  } else {
    s = noParens
  }

  // 3. Remove special characters: , : ; . Convert dash/slashes to spaces.
  s = s.replace(/[,:;.]/g, '')
  s = s.replace(/[/\\-]/g, ' ')

  // 4. Collapse whitespace and convert to snake_case
  s = s.trim().toLowerCase().replace(/\s+/g, '_')

  // 5. Remove any remaining non-alphanumeric/underscore characters
  s = s.replace(/[^a-z0-9_]/g, '')

  // 6. Clean up multiple underscores
  s = s.replace(/_+/g, '_').replace(/^_|_$/g, '')

  return s || 'field'
}

export interface DetectedField {
  name: string
  type: DetectionMode
  options?: string[] // For dropdown fields
  rect?: {
    x: number
    y: number
    width: number
    height: number
    pageIndex: number
  }
  paddingTop?: number
  fontSize?: number
  comb?: boolean
  maxLen?: number
}

export interface AutofilledFieldState {
  fieldName: string
  type: DetectionMode
  value: string | boolean
  accepted: boolean
}

export interface FormStructureInfo {
  formType: FormType
  hasXFA: boolean
  hasFields: boolean
}

export function cleanInvalidPdfRefs(pdfDoc: PDFDocument) {
  try {
    const acroFormRef = pdfDoc.catalog.get(PDFName.of('AcroForm'))
    const acroForm = pdfDoc.context.lookup(acroFormRef)
    if (acroForm instanceof PDFDict) {
      const fieldsRef = acroForm.get(PDFName.of('Fields'))
      const fieldsArray = pdfDoc.context.lookup(fieldsRef)
      if (fieldsArray instanceof PDFArray) {
        const visited = new Set<PDFArray>()
        const cleanArray = (arr: PDFArray) => {
          if (visited.has(arr)) return
          visited.add(arr)
          for (let i = arr.size() - 1; i >= 0; i--) {
            const ref = arr.get(i)
            const obj = pdfDoc.context.lookup(ref)
            if (!obj || !(obj instanceof PDFDict)) {
              arr.remove(i)
              continue
            }
            const kidsRef = obj.get(PDFName.of('Kids'))
            const kids = pdfDoc.context.lookup(kidsRef)
            if (kids instanceof PDFArray) {
              cleanArray(kids)
            }
          }
        }
        cleanArray(fieldsArray)
      }
    }
  } catch (e) {
    console.warn("Failed to clean AcroForm", e)
  }

  try {
    const pagesRef = pdfDoc.catalog.get(PDFName.of('Pages'))
    const pagesDict = pdfDoc.context.lookup(pagesRef)
    if (pagesDict instanceof PDFDict) {
      const visited = new Set<PDFDict>()
      const cleanPages = (dict: PDFDict) => {
        if (visited.has(dict)) return
        visited.add(dict)
        const kidsRef = dict.get(PDFName.of('Kids'))
        const kids = pdfDoc.context.lookup(kidsRef)
        if (kids instanceof PDFArray) {
          for (let i = kids.size() - 1; i >= 0; i--) {
            const ref = kids.get(i)
            const obj = pdfDoc.context.lookup(ref)
            if (!obj || !(obj instanceof PDFDict)) {
              kids.remove(i)
              continue
            }
            cleanPages(obj)
          }
        }
      }
      cleanPages(pagesDict)
    }
  } catch (e) {
    console.warn("Failed to clean Pages", e)
  }
}

export function inspectFormStructure(pdfDoc: PDFDocument): FormStructureInfo {
  let hasXFA = false
  let hasFields = false
  let hasAcroForm = false

  try {
    const acroFormRef = pdfDoc.catalog.get(PDFName.of('AcroForm'))
    const acroForm = acroFormRef ? pdfDoc.context.lookup(acroFormRef) : null

    if (acroForm instanceof PDFDict) {
      hasAcroForm = true
      const xfa = acroForm.get(PDFName.of('XFA'))
      hasXFA = !!xfa

      const fieldsRef = acroForm.get(PDFName.of('Fields'))
      const fieldsArray = fieldsRef ? pdfDoc.context.lookup(fieldsRef) : null
      if (fieldsArray instanceof PDFArray) {
        hasFields = fieldsArray.size() > 0
      }
    }
  } catch (e) {
    console.warn("Error inspecting structural /AcroForm properties", e)
  }

  let formType: FormType = 'no-form'

  if (!hasAcroForm) {
    formType = 'no-form'
  } else {
    if (hasXFA) {
      if (!hasFields) {
        formType = 'xfa-only'
      } else {
        formType = 'hybrid' // Treat as XFA-preferred
      }
    } else {
      if (hasFields) {
        formType = 'acroform'
      } else {
        formType = 'no-form'
      }
    }
  }

  return { formType, hasXFA, hasFields }
}

export async function fillPdfFields(
  pdfBytes: ArrayBuffer,
  data: Record<string, string | boolean>,
  detectedFields: DetectedField[] = []
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes, {
    ignoreEncryption: true
  })

  cleanInvalidPdfRefs(pdfDoc)

  try {
    const acroFormRef = pdfDoc.catalog.get(PDFName.of('AcroForm'));
    if (acroFormRef) {
      const acroForm = pdfDoc.context.lookup(acroFormRef);
      if (acroForm instanceof PDFDict) acroForm.delete(PDFName.of('XFA'));
    }
  } catch (e) { }

  const form = pdfDoc.getForm()
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)

  let pages: any[] = []
  try {
    pages = pdfDoc.getPages()
  } catch (e) {
    console.warn("Failed to retrieve pages layout", e)
  }

  for (const [fieldName, value] of Object.entries(data)) {
    const fieldInfo = detectedFields.find((f) => f.name === fieldName)
    let customDrawn = false

    if (fieldInfo?.rect && pages.length > 0) {
      const { pageIndex, x, y, width, height } = fieldInfo.rect

      if (pageIndex < pages.length) {
        const page = pages[pageIndex]
        const { height: pageHeight } = page.getSize()
        const pdfY = pageHeight - y - height

        // ---------- COMBO FIELDS (fixed centering) ----------
        if (fieldInfo.comb && fieldInfo.maxLen && fieldInfo.maxLen > 0) {
          const maxLen = fieldInfo.maxLen
          const cellWidth = width / maxLen
          const cellHeight = height
          const text = String(value ?? "").slice(0, maxLen)

          // Compute a font size that fits within the cell (with some margin)
          let fontSize = fieldInfo.fontSize ?? 12
          const maxFontSizeByHeight = cellHeight * 0.7
          const maxFontSizeByWidth = cellWidth * 0.7
          fontSize = Math.min(fontSize, maxFontSizeByHeight, maxFontSizeByWidth)
          fontSize = Math.max(6, fontSize)   // ensure readability

          for (let i = 0; i < maxLen; i++) {
            const char = text[i] || ""
            if (!char) continue

            const charWidth = font.widthOfTextAtSize(char, fontSize)
            // Horizontal centering
            const xPos = x + i * cellWidth + (cellWidth - charWidth) / 2
            // Vertical centering: baseline at 20% of font size above the bottom of the cell's text area
            const yPos = pdfY + (height - fontSize) / 2 + fontSize * 0.2

            page.drawText(char, {
              x: xPos,
              y: yPos,
              size: fontSize,
              font: font,
              color: rgb(0, 0, 0),
            })
          }

          customDrawn = true
        }

        // ---------- CHECKBOX / RADIO ----------
        else if (fieldInfo.type === "checkbox" || fieldInfo.type === "radio") {
          const isChecked = value === true

          page.drawRectangle({
            x: x,
            y: pdfY,
            width: width,
            height: height,
            color: rgb(1, 1, 1),
          })

          if (fieldInfo.type === "checkbox") {
            page.drawRectangle({
              x: x,
              y: pdfY,
              width: width,
              height: height,
              borderColor: rgb(0, 0, 0),
              borderWidth: 1,
              color: rgb(1, 1, 1),
            })

            if (isChecked) {
              const padding = Math.min(width, height) * 0.2
              page.drawLine({
                start: { x: x + padding, y: pdfY + padding },
                end: { x: x + width - padding, y: pdfY + height - padding },
                thickness: 2,
                color: rgb(0, 0, 0),
              })
              page.drawLine({
                start: { x: x + width - padding, y: pdfY + padding },
                end: { x: x + padding, y: pdfY + height - padding },
                thickness: 2,
                color: rgb(0, 0, 0),
              })
            }

            try {
              const field = form.getField(fieldName)
              if (field instanceof PDFCheckBox) field.uncheck()
            } catch (e) { }
          }
          else if (fieldInfo.type === "radio") {
            const rx = width / 2
            const ry = height / 2
            const cx = x + rx
            const cy = pdfY + ry

            page.drawEllipse({
              x: cx,
              y: cy,
              xScale: rx,
              yScale: ry,
              borderColor: rgb(0, 0, 0),
              borderWidth: 1,
              color: rgb(1, 1, 1),
            })

            if (isChecked) {
              page.drawEllipse({
                x: cx,
                y: cy,
                xScale: rx * 0.6,
                yScale: ry * 0.6,
                color: rgb(0, 0, 0),
              })
            }
          }
          customDrawn = true
        }

        // ---------- SIGNATURE ----------
        else if (fieldInfo.type === "signature" && typeof value === "string" && value.startsWith("data:image")) {
          try {
            const image = await pdfDoc.embedPng(value)

            const paddingTop = fieldInfo.paddingTop || 0
            const effectiveHeight = Math.max(0, height - paddingTop)

            const dims = image.scaleToFit(width, effectiveHeight)
            const xOffset = (width - dims.width) / 2
            const yOffset = (effectiveHeight - dims.height) / 2

            page.drawImage(image, {
              x: x + xOffset,
              y: pdfY + yOffset,
              width: dims.width,
              height: dims.height,
            })
            customDrawn = true
          } catch (e) {
            console.error(`Failed to embed signature for ${fieldName}`, e)
          }
        }

        // ---------- TEXT / MULTILINE / DATE ----------
        else if ((typeof value === "string" && value) || fieldInfo.type === 'date') {
          const textValue = String(value)
          const isMultiline = fieldInfo.type === "multiline"

          if (isMultiline) {
            const fontSize = fieldInfo.fontSize || 12
            const lineHeight = fontSize * 1.2
            const padX = 4
            const paddingTop = fieldInfo.paddingTop ?? 2

            const maxWidth = width - (padX * 2)
            const measureWidth = (text: string) => font.widthOfTextAtSize(text, fontSize)

            const paragraphs = textValue.split('\n')
            const lines: string[] = []

            for (const paragraph of paragraphs) {
              const words = paragraph.split(' ')
              let currentLine = ""

              for (let i = 0; i < words.length; i++) {
                const word = words[i]
                const separator = currentLine.length > 0 ? " " : ""
                const testLine = currentLine + separator + word

                if (measureWidth(testLine) <= maxWidth) {
                  currentLine = testLine
                } else {
                  if (currentLine.length > 0) {
                    lines.push(currentLine)
                    currentLine = ""
                  }

                  if (measureWidth(word) <= maxWidth) {
                    currentLine = word
                  } else {
                    let partialWord = ""
                    for (const char of word) {
                      if (measureWidth(partialWord + char) <= maxWidth) {
                        partialWord += char
                      } else {
                        lines.push(partialWord)
                        partialWord = char
                      }
                    }
                    currentLine = partialWord
                  }
                }
              }
              if (currentLine) {
                lines.push(currentLine)
              }
            }

            let currentY = pdfY + height - paddingTop - fontSize

            for (const line of lines) {
              if (currentY < pdfY) break;

              page.drawText(line, {
                x: x + padX,
                y: currentY,
                size: fontSize,
                font: font,
                color: rgb(0, 0, 0),
              })

              currentY -= lineHeight
            }
          } else {
            let fontSize = fieldInfo.fontSize;

            if (!fontSize) {
              fontSize = Math.max(6, height * 0.75)
              const textWidth = font.widthOfTextAtSize(textValue, fontSize)
              const availableWidth = width - 8
              if (textWidth > availableWidth) {
                const scaleFactor = availableWidth / textWidth
                fontSize = Math.max(6, fontSize * scaleFactor)
              }
            }

            const vOffset = (height - fontSize) / 2 + (fontSize / 6)

            page.drawText(textValue, {
              x: x + 4,
              y: pdfY + vOffset,
              size: fontSize,
              font: font,
              color: rgb(0, 0, 0),
            })
          }

          try {
            const field = form.getField(fieldName)
            if (field instanceof PDFTextField) {
              field.setText("")
            }
          } catch (e) { }

          customDrawn = true
        }
      }
    }

    if (!customDrawn) {
      try {
        const field = form.getField(fieldName)
        if (field instanceof PDFTextField) {
          field.setText(String(value || ""))
        } else if (field instanceof PDFCheckBox && typeof value === "boolean") {
          if (value) field.check()
          else field.uncheck()
        } else if (field instanceof PDFDropdown && typeof value === "string") {
          field.select(value)
        }
      } catch (e) { }
    }
  }

  return pdfDoc.save()
}

export async function generateEmptyAcroForm(
  pdfBytes: ArrayBuffer,
  fields: DetectedField[]
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes, {
    ignoreEncryption: true
  })

  cleanInvalidPdfRefs(pdfDoc)

  const form = pdfDoc.getForm()

  let pages: any[] = []
  try {
    pages = pdfDoc.getPages()
  } catch (e) {
    console.warn("Failed to get pages", e)
  }

  const context = pdfDoc.context
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const createdFields = new Set<string>()

  for (const field of fields) {
    if (!field.rect || createdFields.has(field.name)) continue

    const { x, y, width, height, pageIndex } = field.rect
    if (pageIndex >= pages.length) continue

    const page = pages[pageIndex]
    const { height: pageHeight } = page.getSize()

    const pdfBottomY = pageHeight - y - height

    let finalHeight = height

    if (field.type === "multiline" || field.type === "text" || field.type === "date") {
      if (field.paddingTop && field.paddingTop > 0) {
        finalHeight = Math.max(12, height - (field.paddingTop + 3))
      }
    }

    const widgetRect = { x, y: pdfBottomY, width, height: finalHeight }

    try {
      if (field.type === "checkbox") {
        let checkBox = tryGetField(form, field.name) as PDFCheckBox
        if (!checkBox) checkBox = form.createCheckBox(field.name)
        checkBox.addToPage(page, widgetRect)
      }
      else if (field.type === "radio") {
        let radioGroup = tryGetField(form, field.name) as PDFRadioGroup
        if (!radioGroup) radioGroup = form.createRadioGroup(field.name)
        radioGroup.addOptionToPage(field.name + "_opt", page, widgetRect)
      }
      else if (field.type === "signature") {
        const signatureDict = context.obj({
          Type: 'Annot',
          Subtype: 'Widget',
          FT: 'Sig',
          Rect: [x, pdfBottomY, x + width, pdfBottomY + finalHeight],
          T: PDFString.of(field.name),
          F: 4,
          P: page.ref,
        })

        const signatureRef = context.register(signatureDict)
        page.node.addAnnot(signatureRef)
        const acroForm = pdfDoc.catalog.getOrCreateAcroForm()
        acroForm.addField(signatureRef)
      }
      else {
        let textField = tryGetField(form, field.name) as PDFTextField
        if (!textField) textField = form.createTextField(field.name)

        textField.addToPage(page, widgetRect)

        textField.updateAppearances(font)
        textField.setFontSize(14)

        if (field.type === "multiline" || height > 50) {
          textField.enableMultiline()
        } else {
          textField.disableMultiline()
        }
      }

      createdFields.add(field.name)

    } catch (e) {
      console.warn(`Failed to create AcroForm field: ${field.name}`, e)
    }
  }

  return pdfDoc.save()
}

function tryGetField(form: any, name: string) {
  try {
    return form.getField(name)
  } catch (err) {
    return null
  }
}
