import "server-only";
import { Langfuse } from "langfuse";

const globalForLangfuse = globalThis as unknown as { langfuse?: Langfuse };

export const langfuse =
    globalForLangfuse.langfuse ??
    new Langfuse({
        publicKey: process.env.LANGFUSE_PUBLIC_KEY,
        secretKey: process.env.LANGFUSE_SECRET_KEY,
        baseUrl: process.env.LANGFUSE_BASE_URL || "https://us.cloud.langfuse.com",
        flushAt: 1,
    });

if (process.env.NODE_ENV !== "production") {
    globalForLangfuse.langfuse = langfuse;
}