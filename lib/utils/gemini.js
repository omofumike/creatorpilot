import { GoogleGenAI } from '@google/genai';
import { config } from './config.js';

// Initialize Gemini through Vertex AI using the CreatorPilot
// Google Cloud project, not the Gemini API key project.
export const ai = new GoogleGenAI({
  vertexai: true,
  project: config.googleCloudProject,
  location: config.googleCloudLocation
});
