import { GoogleGenAI } from '@google/genai';
import { config } from './config.js';

// Initialize the reusable Gemini client
export const ai = new GoogleGenAI({
  apiKey: config.geminiApiKey,
});
