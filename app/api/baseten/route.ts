import { NextResponse } from "next/server";
import { generateObject, jsonSchema } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { langfuse, flushLangfuse } from "@/lib/langfuse";

const baseten = createOpenAI({
    baseURL: 'https://inference.baseten.co/v1',
    apiKey: process.env.BASETEN_API_KEY,
});

export async function POST(request: Request) {
    const traceId = request.headers.get("x-langfuse-trace-id") || undefined;
    let generation: any = null;

    try {
        const body = await request.json();
        const { systemPrompt, userPrompt, schema, model, temperature } = body;

        generation = langfuse.generation({
            traceId: traceId,
            name: "Baseten-Completion",
            model: model || 'deepseek-ai/DeepSeek-V4-Pro',
            input: { systemPrompt, userPrompt: (userPrompt as string).slice(0, 500) },
            modelParameters: { temperature: temperature ?? 0.1 }
        });

        if (!schema) {
            if (generation) {
                generation.end({ level: "ERROR", statusMessage: "Missing schema in request body" });
                await flushLangfuse();
            }
            return NextResponse.json({ error: "Missing schema in request body" }, { status: 400 });
        }

        // 2. Call generateObject using the JSON Schema passed from the client
        const { object, usage } = await generateObject({
            model: baseten(model || 'deepseek-ai/DeepSeek-V4-Pro'),
            schema: jsonSchema(schema),
            system: systemPrompt,
            prompt: userPrompt,
            temperature: temperature ?? 0.1,
        });

        if (generation) {
            generation.end({
                output: object,
                usage: usage ? {
                    promptTokens: usage.inputTokens,
                    completionTokens: usage.outputTokens,
                    totalTokens: usage.totalTokens,
                } : undefined
            });
            await flushLangfuse();
        }

        // 3. Return the fully formed, validated object directly
        return NextResponse.json(object);

    } catch (err: any) {
        console.error("[Baseten API Error]:", err);
        if (generation) {
            generation.end({ level: "ERROR", statusMessage: err.message || "Failed to process request via Baseten" });
            await flushLangfuse();
        }
        return NextResponse.json(
            { error: err.message || "Failed to process request via Baseten" },
            { status: 500 }
        );
    }
}