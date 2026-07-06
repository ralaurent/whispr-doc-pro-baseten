import "server-only";
import { waitUntil } from "@vercel/functions";
import { langfuse } from "./client";

const isDev = process.env.NODE_ENV === "development";

export async function flushLangfuse(): Promise<void> {
    if (isDev) {
        await langfuse.flushAsync();
    } else {
        waitUntil(langfuse.flushAsync());
    }
}