"use server";

import { z } from "zod";
import { jsonrepair } from "jsonrepair";

/**
 * Processes the audio transcript and validates it against dynamic fields.
 */
// export async function processTranscriptWithLlm(
//     transcript: string,
//     normalizedSchema: Record<string, "string" | "boolean">
// ) {
//     const zodShape: Record<string, z.ZodTypeAny> = {};

//     // Build the dynamic schema shape
//     Object.entries(normalizedSchema).forEach(([key, type]) => {
//         if (type === "string") {
//             zodShape[key] = z.string().nullable().optional();   // string | null | undefined
//         } else if (type === "boolean") {
//             zodShape[key] = z.boolean().nullable().optional();  // boolean | null | undefined
//         }
//     });

//     const dynamicZodSchema = z.object(zodShape).strip();
//     const schemaDescription = JSON.stringify(normalizedSchema, null, 2);

//     const systemPrompt = `
// You are a high-precision extraction engine.

// ====================
// PRIORITY ORDER (IMPORTANT)
// ====================
// 1. Output must be valid JSON only
// 2. All output MUST be in English (translate everything)
// 3. Extract schema fields accurately
// 4. Apply normalization rules (SSN/EIN formatting)

// ====================
// LANGUAGE NORMALIZATION
// ====================
// - Input may be in any language (30+ supported)
// - ALWAYS translate extracted values into English
// - Never output original-language text except proper nouns

// ====================
// SSN / EIN RULES
// ====================
// SSN format: XXX-XX-XXXX
// EIN format: XX-XXXXXXX

// Rules:
// - Only format when full number is confirmed
// - If split or incomplete, DO NOT guess or format
// - Never infer missing digits

// ====================
// OUTPUT RULES
// ====================
// - Return ONLY JSON
// - OMIT any missing fields
// - Boolean fields must be true/false only

// Schema:
// ${schemaDescription}
// `;

//     // Define the generic payload mapped for OpenRouter
//     const payload = {
//         model: "openai/gpt-4o-mini",
//         messages: [
//             { role: "system", content: systemPrompt },
//             { role: "user", content: `Transcript:\n\n${transcript}` }
//         ],
//         temperature: 0.1,
//         response_format: { type: "json_object" }
//     };

//     // Call our robust API route with the payload
//     const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
//     const res = await fetch(`${baseUrl}/api/open-router`, {
//         method: "POST",
//         headers: {
//             "Content-Type": "application/json",
//         },
//         body: JSON.stringify(payload),
//     });

//     if (!res.ok) {
//         let errorData;
//         try {
//             errorData = await res.json();
//         } catch {
//             errorData = { error: await res.text() };
//         }
//         throw new Error(errorData.error || `API error: ${res.status} ${res.statusText}`);
//     }

//     const openRouterResponse = await res.json();

//     // Extract textual JSON response content
//     const llmRawResponse = openRouterResponse.choices[0].message.content;

//     let parsedJson: any;
//     try {
//         parsedJson = JSON.parse(llmRawResponse);
//     } catch (parseError) {
//         try {
//             // Extra safety: Strip out stray markdown formatting if the model disobeys instructions
//             const cleanStr = llmRawResponse
//                 .replace(/^```(json)?\s*/i, '')
//                 .replace(/\s*```$/i, '')
//                 .trim();

//             const repairedJsonString = jsonrepair(cleanStr);
//             parsedJson = JSON.parse(repairedJsonString);
//         } catch (repairError) {
//             console.error("Original Output:", llmRawResponse);
//             throw new Error("Failed to parse and repair LLM response.");
//         }
//     }

//     // Validate using Zod, dropping any fields the LLM hallucinated
//     const validatedData = dynamicZodSchema.parse(parsedJson);

//     // Filter out fields that remain undefined or null
//     const cleanedData = Object.fromEntries(
//         Object.entries(validatedData).filter(([_, value]) => value !== undefined && value !== null)
//     );

//     return cleanedData as Record<string, string | boolean>;
// }

type AIProvider = "baseten" | "openrouter";

export async function processTranscriptWithLlm(
    transcript: string,
    normalizedSchema: Record<string, "string" | "boolean">,
    overrideProvider?: AIProvider
) {
    const provider: AIProvider = overrideProvider || (process.env.AI_PROVIDER as AIProvider) || "openrouter"; // "baseten";
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const schemaDescription = JSON.stringify(normalizedSchema, null, 2);

    const baseSystemPrompt = `
You are a high-precision extraction engine.

====================
PRIORITY ORDER (IMPORTANT)
====================
1. All output MUST be in English (translate everything)
2. Extract schema fields accurately
3. Apply normalization rules (SSN/EIN formatting)

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
- Output must be valid JSON only
- Return ONLY JSON
- You MUST return a key for every field in the schema
- Return \`null\` for any missing fields (do not hallucinate data)
- Boolean fields must be true/false only

Schema:
${schemaDescription}
`;

    let parsedJson: any;

    if (provider === "baseten") {
        const properties: Record<string, any> = {};
        const requiredFields: string[] = []; // Track all keys for the required array

        Object.entries(normalizedSchema).forEach(([key, type]) => {
            properties[key] = {
                type: [type, "null"]
            };
            requiredFields.push(key); // Force the schema to output this key
        });

        const requestSchema = {
            type: "object",
            properties: properties,
            required: requiredFields, // Inject the required array here
            additionalProperties: false,
        };

        const payload = {
            systemPrompt: baseSystemPrompt,
            userPrompt: `Transcript:\n\n${transcript}`,
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

        parsedJson = await res.json();
    } else {
        const zodShape: Record<string, z.ZodTypeAny> = {};

        Object.entries(normalizedSchema).forEach(([key, type]) => {
            if (type === "string") {
                // Ensure Zod defaults to null if undefined
                zodShape[key] = z.string().nullable().default(null);
            } else if (type === "boolean") {
                zodShape[key] = z.boolean().nullable().default(null);
            }
        });

        const dynamicZodSchema = z.object(zodShape).strip();

        const payload = {
            model: "openai/gpt-4o-mini",
            messages: [
                { role: "system", content: baseSystemPrompt },
                { role: "user", content: `Transcript:\n\n${transcript}` }
            ],
            temperature: 0.1,
            response_format: { type: "json_object" }
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

        const openRouterResponse = await res.json();
        const llmRawResponse = openRouterResponse.choices[0].message.content;

        try {
            parsedJson = JSON.parse(llmRawResponse);
        } catch (parseError) {
            try {
                const cleanStr = llmRawResponse
                    .replace(/^```(json)?\s*/i, '')
                    .replace(/\s*```$/i, '')
                    .trim();

                const repairedJsonString = jsonrepair(cleanStr);
                parsedJson = JSON.parse(repairedJsonString);
            } catch (repairError) {
                console.error("Original Output:", llmRawResponse);
                throw new Error("Failed to parse and repair OpenRouter response.");
            }
        }

        parsedJson = dynamicZodSchema.parse(parsedJson);
    }

    if (parsedJson && typeof parsedJson === "object") {
        Object.keys(parsedJson).forEach((key) => {
            if (parsedJson[key] === null) {
                parsedJson[key] = "";
            }
        });
    }

    console.log("parsedJson", parsedJson);

    return parsedJson as Record<string, string | boolean>;
}