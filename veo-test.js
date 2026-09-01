import dotenv from 'dotenv';
dotenv.config();

const mode = (process.env.VIDEO_GENERATION_MODE || 'mock').toLowerCase().trim();
if (mode !== 'real') {
  console.log('====================================================');
  console.log('SAFETY CHECK: Real Google Veo API test skipped.');
  console.log(`Current VIDEO_GENERATION_MODE is: "${mode}" (default: mock).`);
  console.log('No Google Cloud / Veo API calls were made.');
  console.log('To run real Veo generation, set: VIDEO_GENERATION_MODE=real');
  console.log('====================================================');
  process.exit(0);
}

import { GoogleGenAI } from '@google/genai';

const ai = new GoogleGenAI({
  vertexai: true,
  project: process.env.GOOGLE_CLOUD_PROJECT,
  location: process.env.GOOGLE_CLOUD_LOCATION
});

console.log('Starting Veo test...');

let operation = await ai.models.generateVideos({
  model: 'veo-3.1-fast-generate-001',
  prompt: 'A cinematic establishing shot of Lagos, Nigeria at sunrise, modern city skyline, warm morning light, realistic documentary cinematography, smooth slow camera movement.',
  config: {
    aspectRatio: '16:9'
  }
});

console.log('Operation started:', operation.name);

while (!operation.done) {
  console.log('Video is still generating...');
  await new Promise(resolve => setTimeout(resolve, 10000));
  operation = await ai.operations.get({ operation });
}

if (operation.response) {
  console.log(
    'VIDEO RESULT:',
    JSON.stringify(operation.response, null, 2)
  );
} else {
  console.error('No video was returned.');
  console.error(operation);
}
