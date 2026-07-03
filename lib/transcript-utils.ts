"use server";

import { z } from "zod";
import { jsonrepair } from "jsonrepair";


/**
 * Processes the audio transcript and validates it against dynamic fields.
 */
export async function processTranscriptWithLlm(
    transcript: string,
    normalizedSchema: Record<string, "string" | "boolean">
) {
    const zodShape: Record<string, z.ZodTypeAny> = {};

    // Build the dynamic schema shape
    Object.entries(normalizedSchema).forEach(([key, type]) => {
        if (type === "string") {
            zodShape[key] = z.string().nullable().optional();   // string | null | undefined
        } else if (type === "boolean") {
            zodShape[key] = z.boolean().nullable().optional();  // boolean | null | undefined
        }
    });

    const dynamicZodSchema = z.object(zodShape).strip();
    const schemaDescription = JSON.stringify(normalizedSchema, null, 2);

    const systemPrompt = `
You are a high-precision extraction engine.

====================
PRIORITY ORDER (IMPORTANT)
====================
1. Output must be valid JSON only
2. All output MUST be in English (translate everything)
3. Extract schema fields accurately
4. Apply normalization rules (SSN/EIN formatting)

====================
LANGUAGE NORMALIZATION
====================
- Input may be in any language (30+ supported)
- ALWAYS translate extracted values into English
- Never output original-language text except proper nouns

====================
SSN / EIN RULES
====================
SSN format: XXX-XX-XXXX
EIN format: XX-XXXXXXX

Rules:
- Only format when full number is confirmed
- If split or incomplete, DO NOT guess or format
- Never infer missing digits

====================
OUTPUT RULES
====================
- Return ONLY JSON
- OMIT any missing fields
- Boolean fields must be true/false only

Schema:
${schemaDescription}
`;

    // Define the generic payload mapped for OpenRouter
    const payload = {
        model: "openai/gpt-4o-mini",
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `Transcript:\n\n${transcript}` }
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }
    };

    // Call our robust API route with the payload
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const res = await fetch(`${baseUrl}/api/open-router`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });

    if (!res.ok) {
        let errorData;
        try {
            errorData = await res.json();
        } catch {
            errorData = { error: await res.text() };
        }
        throw new Error(errorData.error || `API error: ${res.status} ${res.statusText}`);
    }

    const openRouterResponse = await res.json();

    // Extract textual JSON response content
    const llmRawResponse = openRouterResponse.choices[0].message.content;

    let parsedJson: any;
    try {
        parsedJson = JSON.parse(llmRawResponse);
    } catch (parseError) {
        try {
            // Extra safety: Strip out stray markdown formatting if the model disobeys instructions
            const cleanStr = llmRawResponse
                .replace(/^```(json)?\s*/i, '')
                .replace(/\s*```$/i, '')
                .trim();

            const repairedJsonString = jsonrepair(cleanStr);
            parsedJson = JSON.parse(repairedJsonString);
        } catch (repairError) {
            console.error("Original Output:", llmRawResponse);
            throw new Error("Failed to parse and repair LLM response.");
        }
    }

    // Validate using Zod, dropping any fields the LLM hallucinated
    const validatedData = dynamicZodSchema.parse(parsedJson);

    // Filter out fields that remain undefined or null
    const cleanedData = Object.fromEntries(
        Object.entries(validatedData).filter(([_, value]) => value !== undefined && value !== null)
    );

    return cleanedData as Record<string, string | boolean>;
}