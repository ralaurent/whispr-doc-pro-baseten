import { NextResponse } from "next/server";
import { generateObject, jsonSchema } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

// 1. Point the client to Baseten's Inference URL
const baseten = createOpenAI({
    baseURL: 'https://inference.baseten.co/v1',
    apiKey: process.env.BASETEN_API_KEY,
});

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { systemPrompt, userPrompt, schema, model, temperature } = body;

        if (!schema) {
            return NextResponse.json({ error: "Missing schema in request body" }, { status: 400 });
        }

        // 2. Call generateObject using the JSON Schema passed from the client
        const { object } = await generateObject({
            model: baseten(model || 'deepseek-ai/DeepSeek-V4-Pro'),
            schema: jsonSchema(schema),
            system: systemPrompt,
            prompt: userPrompt,
            temperature: temperature ?? 0.1,
        });

        // 3. Return the fully formed, validated object directly
        return NextResponse.json(object);

    } catch (err: any) {
        console.error("[Baseten API Error]:", err);
        return NextResponse.json(
            { error: err.message || "Failed to process request via Baseten" },
            { status: 500 }
        );
    }
}