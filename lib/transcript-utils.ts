"use server";

import { z } from "zod";
import { jsonrepair } from "jsonrepair";
import { langfuse, flushLangfuse } from "./langfuse";

type AIProvider = "baseten" | "openrouter";

export async function processTranscriptWithLlm(
    transcript: string,
    normalizedSchema: Record<string, "string" | "boolean">,
    overrideProvider?: AIProvider
) {
    const provider: AIProvider = overrideProvider || (process.env.AI_PROVIDER as AIProvider) || "openrouter"; // "baseten";
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    const trace = langfuse.trace({
        name: "Process Transcript",
        input: { transcript, schema: normalizedSchema },
        tags: ["transcript-extraction"]
    });

    await flushLangfuse();

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
- Return \`null\` for any missing STRING fields (do not hallucinate data)
- Boolean fields must always be \`true\` or \`false\`
- If a checkbox or radio button is not selected or not mentioned, return \`false\`

Schema:
${schemaDescription}
`;

    let parsedJson: any;

    if (provider === "baseten") {
        const properties: Record<string, any> = {};
        const requiredFields: string[] = [];

        Object.entries(normalizedSchema).forEach(([key, type]) => {
            properties[key] =
                type === "string"
                    ? { type: ["string", "null"] }
                    : { type: "boolean" };

            requiredFields.push(key);
        });

        const requestSchema = {
            type: "object",
            properties: properties,
            required: requiredFields,
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
            headers: {
                "Content-Type": "application/json",
                "x-langfuse-trace-id": trace.id
            },
            body: JSON.stringify(payload),
        });

        if (!res.ok) {
            const errorText = await res.text();
            const errorMsg = `Baseten API error: ${res.status} ${errorText}`;
            trace.update({ output: { success: false, error: errorMsg } });
            await flushLangfuse();
            throw new Error(errorMsg);
        }

        parsedJson = await res.json();
    } else {
        const zodShape: Record<string, z.ZodTypeAny> = {};

        Object.entries(normalizedSchema).forEach(([key, type]) => {
            if (type === "string") {
                zodShape[key] = z.string().nullable().default(null);
            } else if (type === "boolean") {
                zodShape[key] = z.boolean().default(false);
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
            headers: {
                "Content-Type": "application/json",
                "x-langfuse-trace-id": trace.id
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
            const errorMsg = errorData.error || `OpenRouter API error: ${res.status} ${res.statusText}`;
            trace.update({ output: { success: false, error: errorMsg } });
            await flushLangfuse();
            throw new Error(errorMsg);
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
                trace.update({ output: { success: false, error: "Failed to parse and repair OpenRouter response" } });
                await flushLangfuse();
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

    trace.update({ output: parsedJson });
    await flushLangfuse();

    return parsedJson as Record<string, string | boolean>;
}