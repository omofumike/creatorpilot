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
  project: 'creatorpilot-2026',
  location: 'us-central1'
});

async function main() {
  console.log('Testing Veo access...');
  console.log('Project: creatorpilot-2026');
  console.log('Location: us-central1');

  let operation = await ai.models.generateVideos({
    model: 'veo-3.1-generate-001',
    prompt:
      'A cinematic aerial shot of Lagos coastline at sunset, ' +
      'calm ocean waves, realistic lighting, professional film production.'
  });

  console.log('Operation created.');
  console.log(operation);

  while (!operation.done) {
    console.log('Video generation still running...');
    await new Promise(resolve => setTimeout(resolve, 10000));

    operation = await ai.operations.getVideosOperation({
      operation
    });
  }

  console.log('Generation completed.');
  console.log(JSON.stringify(operation, null, 2));
}

main().catch(error => {
  console.error('Veo test failed:');
  console.error(error);
  process.exit(1);
});