import "server-only"

import { PDFDocument, PDFName, PDFString } from "pdf-lib"
import { jsonrepair } from "jsonrepair"

import { cleanInvalidPdfRefs, sanitizeFieldLabel, type DetectedField, type DetectionMode } from "./pdf-utils"
import type { PageHtml } from "./extract-html"
import { SIGNATURE_REGEX, DATE_REGEX } from "./regex"

export interface ExtractedField {
  id: number
  name: string
  type: string
  page: number
  x: number
  y: number
  width: number
  height: number
  comb?: boolean
  maxLen?: number
}

export interface PageInfo {
  index: number
  width: number
  height: number
}

// export async function nameFieldsFromHtml(htmlPages: PageHtml[]): Promise<Record<string, string>> {
//   // Only send the first page to OpenRouter to save tokens/time
//   const combined = htmlPages.length > 0
//     ? `<!-- PAGE ${htmlPages[0].index} -->\n${htmlPages[0].html}`
//     : ""

//   const systemPrompt = `
// You are an OCR and document-layout extraction expert.

// Input:
// - HTML representing one or more PDF pages.
// - Every fillable field is a <div class="pdf-field"> with a unique data-field-id.
// - Labels and surrounding text are rendered as absolutely-positioned <span class="pdf-text"> elements.

// Your task is to assign a concise semantic name to EVERY field.

// IMPORTANT:
// Field labels are determined by PHYSICAL PROXIMITY, not HTML order.

// Search priority (stop when a clear label is found):

// 1. Immediately LEFT of the field (highest priority)
// 2. Immediately ABOVE the field
// 3. BELOW the field
// 4. RIGHT of the field
// 5. Nearby grouped text belonging to the same row/section
// 6. Section headers only if no local label exists

// Ignore text that is visually distant even if it appears nearby in the HTML.

// Rules:

// - The label should be close to the field.
// - Prefer labels directly left or directly above.
// - If none exist, search below only as a last resort.
// - Never use page titles, instructions, paragraphs, or unrelated text if a nearby label exists.
// - Checkbox fields should use the text immediately adjacent to that checkbox.
// - If multiple fields share one label, generate distinct names (e.g. ssn_part_1, ssn_part_2, ssn_part_3).
// - Preserve meaning (business_name, exempt_payee_code, employer_identification_number, etc.).
// - Return one entry for EVERY data-field-id.
// - Do not invent fields.
// - Do not omit fields.
// - Output must be deterministic.

// Naming rules:

// - snake_case
// - lowercase only
// - letters and underscores only
// - concise (1-5 words)
// - no spaces
// - no punctuation
// - no duplicate values

// Return ONLY valid JSON.

// Format:

// {
//   "1":"first_name",
//   "2":"last_name",
//   "3":"mailing_address"
// }

// No markdown.
// No explanations.
// No code fences.
// Only the JSON object.
// `;

//   const payload = {
//     model: "openrouter/free", //
//     messages: [
//       { role: "system", content: systemPrompt },
//       { role: "user", content: combined },
//     ],
//     temperature: 0.1,
//     response_format: { type: "json_object" },
//   }

//   console.log("=== SENDING HTML TO OPENROUTER ===");
//   console.log(combined);
//   console.log("==================================");

//   const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
//   const res = await fetch(`${baseUrl}/api/open-router`, {
//       method: "POST",
//       headers: {
//           "Content-Type": "application/json",
//       },
//       body: JSON.stringify(payload),
//   });

//   if (!res.ok) {
//       let errorData;
//       try {
//           errorData = await res.json();
//       } catch {
//           errorData = { error: await res.text() };
//       }
//       throw new Error(errorData.error || `API error: ${res.status} ${res.statusText}`);
//   }

//   const response = await res.json();
//   const raw = response?.choices?.[0]?.message?.content ?? ""

//   console.log("=== RECEIVED RAW JSON FROM OPENROUTER ===");
//   console.log(raw);
//   console.log("=========================================");

//   let parsed: any
//   try {
//     parsed = JSON.parse(raw)
//   } catch {
//     const clean = String(raw)
//       .replace(/^```(json)?\s*/i, "")
//       .replace(/\s*```$/i, "")
//       .trim()
//     parsed = JSON.parse(jsonrepair(clean))
//   }

//   console.log("=== PARSED JSON ===");
//   console.log(parsed);
//   console.log("===================");

//   // Normalize to Record<string, string>, keeping only non-empty string values.
//   const out: Record<string, string> = {}
//   for (const [k, v] of Object.entries(parsed ?? {})) {
//     if (typeof v === "string" && v.trim()) {
//       out[String(k)] = v
//     }
//   }
//   return out
// }

type AIProvider = "baseten" | "openrouter";

export async function nameFieldsFromHtml(
  htmlPages: PageHtml[],
  overrideProvider?: AIProvider
): Promise<Record<string, string>> {

  const provider: AIProvider = overrideProvider || (process.env.AI_PROVIDER as AIProvider) || "openrouter"; // "baseten";
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const combined = htmlPages.length > 0
    ? `\n${htmlPages[0].html}`
    : ""

  const baseSystemPrompt = `
You are an OCR and document-layout extraction expert.

Input:
- HTML representing one or more PDF pages.
- Every fillable field is a <div class="pdf-field"> with a unique data-field-id.
- Labels and surrounding text are rendered as absolutely-positioned <span class="pdf-text"> elements.

Your task is to assign a concise semantic name to EVERY field.

IMPORTANT:
Field labels are determined by PHYSICAL PROXIMITY, not HTML order.

Search priority (stop when a clear label is found):
1. Immediately LEFT of the field (highest priority)
2. Immediately ABOVE the field
3. BELOW the field
4. RIGHT of the field
5. Nearby grouped text belonging to the same row/section
6. Section headers only if no local label exists

Rules:
- Prefer labels directly left or directly above.
- Checkbox fields should use the text immediately adjacent to that checkbox.
- If multiple fields share one label, generate distinct names (e.g. ssn_part_1, ssn_part_2).
- Preserve meaning (business_name, exempt_payee_code).
- Return one entry for EVERY data-field-id.

Naming rules:
- snake_case
- lowercase only
- letters and underscores only
- concise (1-5 words)
- no duplicate values
`;

  let parsed: any;

  if (provider === "baseten") {
    console.log("=== SENDING HTML TO BASETEN API ROUTE ===");
    console.log(combined);

    const requestSchema = {
      type: "object",
      additionalProperties: {
        type: "string"
      }
    };

    const payload = {
      systemPrompt: baseSystemPrompt,
      userPrompt: combined,
      schema: requestSchema,
      temperature: 0.1,
    };

    const res = await fetch(`${baseUrl}/api/baseten`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Baseten API error: ${res.status} ${errorText}`);
    }

    parsed = await res.json();
    console.log("=== PARSED JSON FROM BASETEN ===");
    console.log(parsed);

  } else {
    console.log("=== SENDING HTML TO OPENROUTER ===");
    console.log(combined);

    const openRouterPrompt = `
${baseSystemPrompt}
Rules:
- Ignore text that is visually distant even if it appears nearby in the HTML.
- Never use page titles, instructions, paragraphs, or unrelated text if a nearby label exists.
- Do not invent fields.
- Do not omit fields.
- Output must be deterministic.

Return ONLY valid JSON.
Format:
{
  "1":"first_name",
  "2":"last_name",
  "3":"mailing_address"
}
No markdown. No explanations. No code fences. Only the JSON object.
`;

    const payload = {
      model: "openrouter/free",
      messages: [
        { role: "system", content: openRouterPrompt },
        { role: "user", content: combined },
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
    };

    const res = await fetch(`${baseUrl}/api/open-router`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      let errorData;
      try {
        errorData = await res.json();
      } catch {
        errorData = { error: await res.text() };
      }
      throw new Error(errorData.error || `OpenRouter API error: ${res.status} ${res.statusText}`);
    }

    const response = await res.json();
    const raw = response?.choices?.[0]?.message?.content ?? "";

    console.log("=== RECEIVED RAW JSON FROM OPENROUTER ===");
    console.log(raw);

    try {
      parsed = JSON.parse(raw);
    } catch {
      const clean = String(raw)
        .replace(/^```(json)?\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();
      parsed = JSON.parse(jsonrepair(clean));
    }

    console.log("=== PARSED JSON FROM OPENROUTER ===");
    console.log(parsed);
  }

  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(parsed ?? {})) {
    if (typeof v === "string" && v.trim()) {
      out[String(k)] = v
    }
  }
  return out
}

/** Map the pdf-lib field type string to the app's DetectionMode union. */
function mapType(type: string): DetectionMode {
  switch (type) {
    case "Checkbox":
      return "checkbox"
    case "Radio":
      return "radio"
    case "Dropdown":
    case "List":
      return "dropdown"
    case "Signature":
      return "signature"
    case "Text":
    case "Button":
    default:
      return "text"
  }
}

/**
 * Rename the real AcroForm fields to the AI-provided names and return both the
 * updated PDF bytes and the DetectedField[] (one per widget) used by the
 * overlay / fill UI. The DetectedField.name equals the renamed AcroForm name so
 * that `fillPdfFields` can locate each field by name.
 *
 * Notes:
 * - Widgets are grouped by their original field name; all widgets of a field
 *   share a single final name (picked from the first numbered widget that the
 *   AI named). Fields the AI did not name keep their original name.
 * - Final names are made globally unique (suffixed `_2`, `_3`, ...).
 * - Only terminal field `/T` entries are rewritten (flat field names). This is
 *   sufficient for the typical government/IRS AcroForms targeted here.
 */
export async function applyFieldNames(
  pdfBytes: Uint8Array,
  extractedFields: ExtractedField[],
  aiNames: Record<string, string>,
  pageInfos: PageInfo[],
): Promise<{ bytes: Uint8Array; detectedFields: DetectedField[] }> {
  // Group widgets by their original field name.
  const groups = new Map<string, ExtractedField[]>()
  for (const f of extractedFields) {
    const arr = groups.get(f.name)
    if (arr) arr.push(f)
    else groups.set(f.name, [f])
  }

  const used = new Set<string>()
  const renameMap = new Map<string, string>()
  for (const [origName, group] of groups) {
    let aiName = ""
    for (const f of group) {
      const cand = aiNames[String(f.id)]
      if (cand && cand.trim()) {
        aiName = cand
        break
      }
    }

    let base = aiName ? sanitizeFieldLabel(aiName) : sanitizeFieldLabel(origName || "field")
    if (!base) base = "field"

    let finalName = base
    let n = 2
    while (used.has(finalName)) {
      finalName = `${base}_${n}`
      n++
    }
    used.add(finalName)
    renameMap.set(origName, finalName)
  }

  // Rewrite the real AcroForm field names.
  let bytes = pdfBytes
  try {
    const pdfDoc = await PDFDocument.load(pdfBytes, {
      ignoreEncryption: true,
      updateMetadata: false,
    })
    cleanInvalidPdfRefs(pdfDoc)
    const form = pdfDoc.getForm()
    for (const field of form.getFields()) {
      try {
        const orig = field.getName()
        const finalName = renameMap.get(orig)
        if (!finalName || finalName === orig) continue
        field.acroField.dict.set(PDFName.of("T"), PDFString.of(finalName))
      } catch (e) {
        console.log("Rename failed for field:", e instanceof Error ? e.message : e)
      }
    }
    bytes = await pdfDoc.save()
  } catch (e) {
    console.log("ApplyFieldNames save failed:", e instanceof Error ? e.message : e)
    bytes = pdfBytes
  }

  const pageDim = new Map(pageInfos.map((p) => [p.index, p]))
  const detectedFields: DetectedField[] = extractedFields.map((f) => {
    const dim = pageDim.get(f.page) ?? { width: f.x + f.width, height: f.y + f.height }
    const finalName = renameMap.get(f.name) ?? f.name

    let inferredType = mapType(f.type)

    if (inferredType === "text") {
      const separatedName = finalName.replace(/_/g, " ")

      if (SIGNATURE_REGEX.test(separatedName)) {
        inferredType = "signature"
      } else if (
        DATE_REGEX.test(separatedName) ||
        /\bdate\b/i.test(separatedName)
      ) {
        inferredType = "date"
      }
    }

    return {
      name: finalName,
      type: inferredType,
      rect: {
        x: f.x,
        y: dim.height - f.y - f.height,
        width: f.width,
        height: f.height,
        pageIndex: f.page,
      },
      comb: f.comb,
      maxLen: f.maxLen,
    }
  })

  return { bytes, detectedFields }
}
