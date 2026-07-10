/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    AI_PROVIDER: process.env.AI_PROVIDER,
    LANGFUSE_SECRET_KEY: process.env.LANGFUSE_SECRET_KEY,
    LANGFUSE_PUBLIC_KEY: process.env.LANGFUSE_PUBLIC_KEY,
    LANGFUSE_BASE_URL: process.env.LANGFUSE_BASE_URL,
    BASETEN_API_KEY: process.env.BASETEN_API_KEY,
    OPENROUTER_KEY_1: process.env.OPENROUTER_KEY_1,
    OPENROUTER_KEY_2: process.env.OPENROUTER_KEY_2,
    OPENROUTER_KEY_3: process.env.OPENROUTER_KEY_3,
    OPENROUTER_KEY_4: process.env.OPENROUTER_KEY_4,
    OPENROUTER_KEY_5: process.env.OPENROUTER_KEY_5,
    OPENROUTER_KEY_6: process.env.OPENROUTER_KEY_6,
    OPENROUTER_KEY_7: process.env.OPENROUTER_KEY_7,
    OPENROUTER_KEY_8: process.env.OPENROUTER_KEY_8,
    OPENROUTER_KEY_9: process.env.OPENROUTER_KEY_9,
    OPENROUTER_KEY_10: process.env.OPENROUTER_KEY_10,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ["pdfexcavator", "pdfjs-dist"],
}

export default nextConfig
