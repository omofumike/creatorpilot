import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { directVideoProduction } from './lib/agents/videoDirectorAgent.js';
import { PRODUCTION_TYPES } from './lib/utils/productionTypes.js';
import { config } from './lib/utils/config.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runSingleShotTest() {
  console.log('====================================================');
  console.log('CreatorPilot: Single-Shot Full-Video Code Path Test');
  console.log('====================================================');
  console.log(`Video Generation Mode : ${config.videoGenerationMode.toUpperCase()}`);

  const testStoryboard = {
    title: 'Offshore Signal Discovery',
    format: 'Cinematic Short Film',
    shots: [
      {
        shotNumber: 1,
        slugline: 'EXT. OFFSHORE OIL PLATFORM - SUNSET',
        visualDescription: 'Silhouetted Nigerian marine engineer standing on rusted steel platform catwalk, observing ocean waves at golden hour',
        actorAction: 'Looking through binoculars as amber light reflects off the water',
        cameraAngle: 'Low Angle',
        cameraMovement: 'Slow Tracking Shot',
        shotSize: 'Wide Shot',
        lighting: 'Warm golden hour sunset chiaroscuro'
      }
    ]
  };

  const testPackage = {
    productionType: PRODUCTION_TYPES.SHORT_FILM,
    topic: 'Offshore Signal Discovery',
    storyboard: testStoryboard
  };

  console.log('\nRunning 1 test shot through the updated directVideoProduction code path...\n');

  const startTime = Date.now();

  const result = await directVideoProduction({
    finalPackage: testPackage,
    topic: 'Offshore Signal Discovery',
    options: {
      maxShots: 1,
      durationSeconds: 6
    },
    onProgress: (progress) => {
      console.log(`[Progress Update] stage=${progress.stage} shot=${progress.currentShot || 1}/${progress.totalShots || 1} status=${progress.status || ''} elapsed=${progress.elapsedSeconds || 0}s`);
    }
  });

  const durationSec = Math.round((Date.now() - startTime) / 1000);
  console.log(`\nDirect video production finished in ${durationSec}s.`);
  console.log('Result payload:', JSON.stringify(result, null, 2));

  if (!result || result.success === false) {
    console.error('\n====================================================');
    console.error('TEST FAILED:');
    console.error(result?.error || 'Unknown error');
    console.error('====================================================');
    process.exit(1);
  }

  // Verify file existence on disk
  if (!fs.existsSync(result.videoPath)) {
    throw new Error(`Assembled video file not found at: ${result.videoPath}`);
  }

  const stats = fs.statSync(result.videoPath);
  console.log(`\n✓ Assembled Video exists: ${result.videoPath}`);
  console.log(`✓ Video file size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`✓ Video URL for frontend: ${result.videoUrl}`);
  console.log(`✓ Clips generated: ${result.clipCount}`);

  console.log('\n====================================================');
  console.log('>>> SINGLE-SHOT FULL-VIDEO CODE PATH TEST PASSED! <<<');
  console.log('====================================================\n');
}

runSingleShotTest().catch(err => {
  console.error('\nTest execution failed:', err);
  process.exit(1);
});
