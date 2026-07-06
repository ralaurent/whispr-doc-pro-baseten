import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import dotenv from 'dotenv';
import path from 'path';

// Ensure environment variables are loaded
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const baseten = createOpenAI({
  baseURL: 'https://inference.baseten.co/v1',
  apiKey: process.env.BASETEN_API_KEY,
});

class BasetenProvider {
  id() {
    return 'baseten:deepseek-v4-pro';
  }

  async callApi(prompt: string) {
    console.log(`Calling Baseten (DeepSeek) via Custom Provider...`);
    try {
      const { text } = await generateText({
        model: baseten('deepseek-ai/DeepSeek-V4-Pro'),
        prompt: prompt,
        maxOutputTokens: 24000,
        temperature: 0.1,
      });
      return { output: text };
    } catch (err) {
      console.error(`Baseten Error:`, err);
      return { error: String(err) };
    }
  }
}

export default BasetenProvider;
