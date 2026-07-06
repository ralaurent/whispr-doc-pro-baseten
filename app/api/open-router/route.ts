import { NextResponse } from "next/server";
import { initKeys, keyPool, COOLDOWN_PERIOD_MS } from "@/lib/key-chain";
import { langfuse, flushLangfuse } from "@/lib/langfuse";

let currentKeyIndex = 0;

export async function POST(request: Request) {
    const traceId = request.headers.get("x-langfuse-trace-id") || undefined;
    const payload = await request.json();

    const generation = langfuse.generation({
        traceId: traceId,
        name: "OpenRouter-Completion",
        model: payload.model,
        input: { systemPrompt: payload.messages[0].content, userPrompt: (payload.messages[1].content as string).slice(0, 500) },
        modelParameters: { temperature: payload.temperature }
    });

    await flushLangfuse();

    try {
        initKeys();

        const totalKeys = keyPool.length;
        let attempts = 0;
        let lastError: Error | null = null;

        // Try up to `totalKeys` times to prevent infinite loops
        while (attempts < totalKeys) {
            const keyRecord = keyPool[currentKeyIndex];
            const now = Date.now();

            // Check if the current key is currently cooling down
            if (keyRecord.cooldownUntil > now) {
                // Move to next key
                currentKeyIndex = (currentKeyIndex + 1) % totalKeys;
                attempts++;
                continue;
            }

            try {
                const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${keyRecord.key}`,
                        "Content-Type": "application/json",
                        "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
                        "X-Title": "PDF Auto-Filler Assistant"
                    },
                    body: JSON.stringify(payload),
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    const status = response.status;

                    langfuse.event({
                        traceId: traceId,
                        name: `Key Failure (Index ${keyRecord.index})`,
                        level: "WARNING",
                        input: { status, errorText }
                    });

                    // 429: Rate limit, 402: Quota/Payment Required
                    if (status === 429 || status === 402) {
                        console.warn(`[OpenRouter] Key ${keyRecord.index} hit rate limit/quota (${status}). Cooling down for 24h.`);
                        keyRecord.cooldownUntil = now + COOLDOWN_PERIOD_MS;

                        lastError = new Error(`OpenRouter API error: ${status} - ${errorText}`);
                        currentKeyIndex = (currentKeyIndex + 1) % totalKeys;
                        attempts++;
                        continue; // Retry with the next key
                    }

                    // 5xx: Server Errors (Retryable, but no 24-hr penalty)
                    if (status >= 500) {
                        console.warn(`[OpenRouter] Server error (${status}) on Key ${keyRecord.index}. Trying next key.`);
                        lastError = new Error(`OpenRouter API error: ${status} - ${errorText}`);
                        currentKeyIndex = (currentKeyIndex + 1) % totalKeys;
                        attempts++;
                        continue; // Retry with the next key
                    }

                    // 401: Unauthorized (Invalid key) - Disable essentially forever (10 years)
                    if (status === 401) {
                        console.warn(`[OpenRouter] Key ${keyRecord.index} is Invalid (401). Removing from rotation.`);
                        keyRecord.cooldownUntil = now + (10 * 365 * 24 * 60 * 60 * 1000);
                        lastError = new Error(`OpenRouter API error: ${status} - ${errorText}`);
                        currentKeyIndex = (currentKeyIndex + 1) % totalKeys;
                        attempts++;
                        continue;
                    }

                    // For 400 Bad Request (Payload errors), don't retry, fail immediately
                    throw new Error(`OpenRouter Payload error: ${status} - ${errorText}`);
                }

                // Success! 
                const data = await response.json();

                generation.end({
                    output: data.choices?.[0]?.message?.content ?? "",
                    usage: {
                        promptTokens: data.usage?.prompt_tokens,
                        completionTokens: data.usage?.completion_tokens,
                        totalTokens: data.usage?.total_tokens,
                    }
                });

                // Advance the index for the next entirely new request (Round-Robin)
                currentKeyIndex = (currentKeyIndex + 1) % totalKeys;

                await flushLangfuse();

                return NextResponse.json(data);

            } catch (err) {
                // Catch network fetch failures and continue to the next key
                console.warn(`[OpenRouter] Network/Execution error with Key ${keyRecord.index}:`, err);
                lastError = err instanceof Error ? err : new Error(String(err));
                currentKeyIndex = (currentKeyIndex + 1) % totalKeys;
                attempts++;
            }
        }

        const exhaustError = `All available OpenRouter keys are exhausted. Last error: ${lastError?.message}`;
        generation.end({ level: "ERROR", statusMessage: exhaustError });
        await flushLangfuse();
        return NextResponse.json({ error: exhaustError }, { status: 500 });

    } catch (err: any) {
        generation.end({ level: "ERROR", statusMessage: err.message });
        await flushLangfuse();
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
