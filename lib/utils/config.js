import dotenv from 'dotenv';

// Load environment variables from .env
dotenv.config();

export const config = {
  geminiApiKey: process.env.GEMINI_API_KEY,
  googleApiKey: process.env.GOOGLE_API_KEY,
  parallelApiKey: process.env.PARALLEL_API_KEY,
  parallelBaseUrl: process.env.PARALLEL_BASE_URL || 'https://api.parallel.ai',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite',
  googleCloudProject: process.env.GOOGLE_CLOUD_PROJECT || 'creatorpilot-2026',
  googleCloudLocation: process.env.GOOGLE_CLOUD_LOCATION || 'global',
  videoGenerationMode: (process.env.VIDEO_GENERATION_MODE || 'real').toLowerCase().trim(),
};

