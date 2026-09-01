import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { isFfmpegAvailable, getFfmpegPath, assembleVideos } from './lib/video/videoAssembler.js';
import { createPlaceholderClipFile } from './lib/video/mockVideoGenerator.js';
import {
  buildVeoPromptFromShot,
  normalizeShotDuration,
  directVideoProduction
} from './lib/agents/videoDirectorAgent.js';
import { PRODUCTION_TYPES } from './lib/utils/productionTypes.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function assert(condition, message) {
  if (!condition) {
    console.error(`  ✗ Assertion Failed: ${message}`);
    throw new Error(message);
  }
  console.log(`  ✓ ${message}`);
}

async function runFullVideoWorkflowTest() {
  console.log('====================================================');
  console.log('CreatorPilot: Full Video Generation & Assembly Workflow Test');
  console.log('====================================================');
  console.log(`FFmpeg Available : ${isFfmpegAvailable()}`);
  console.log(`FFmpeg Path      : ${getFfmpegPath()}`);

  assert(isFfmpegAvailable(), 'FFmpeg binary must be available');

  // ----------------------------------------------------
  // TEST 1: Shot Duration Normalization to [4, 6, 8]
  // ----------------------------------------------------
  console.log('\n[Test 1] Verifying Shot Duration Normalization to Veo-supported values (4, 6, 8s)...');
  assert(normalizeShotDuration(2) === 4, 'Duration 2s normalizes to 4s');
  assert(normalizeShotDuration(4) === 4, 'Duration 4s normalizes to 4s');
  assert(normalizeShotDuration(5) === 6, 'Duration 5s normalizes to 6s');
  assert(normalizeShotDuration(6) === 6, 'Duration 6s normalizes to 6s');
  assert(normalizeShotDuration(7) === 8, 'Duration 7s normalizes to 8s');
  assert(normalizeShotDuration(10) === 8, 'Duration 10s normalizes to 8s');
  assert(normalizeShotDuration('5s') === 6, 'String "5s" normalizes to 6s');
  assert(normalizeShotDuration('10 seconds') === 8, 'String "10 seconds" normalizes to 8s');
  assert(normalizeShotDuration({ estimatedDuration: '10s' }) === 8, 'Shot object with estimatedDuration "10s" normalizes to 8s');
  assert(normalizeShotDuration({ duration: 3 }) === 4, 'Shot object with duration: 3 normalizes to 4s');
  assert(normalizeShotDuration(null) === 6, 'Null duration defaults to 6s');

  // ----------------------------------------------------
  // TEST 2: Storyboard Multi-Shot Pre-Verification & Ordering
  // ----------------------------------------------------
  console.log('\n[Test 2] Verifying Multi-Shot Storyboard Prompt & Order Handling...');
  const multiShotStoryboard = {
    title: 'The Echo of Eko',
    format: 'Cinematic Short Film',
    shots: [
      {
        shotNumber: 2,
        sceneNumber: 1,
        slugline: 'EXT. LAGOS LAGOON - SUNSET',
        estimatedDuration: '10s',
        visualDescription: 'Amber reflections on rippling lagoon water near Lekki-Ikoyi Link Bridge',
        actorAction: 'Amara gazes at bridge lights turning on',
        cameraAngle: 'Low Angle',
        cameraMovement: 'Tracking Shot',
        shotSize: 'Medium Shot',
        lighting: 'Golden hour sunset'
      },
      {
        shotNumber: 1,
        sceneNumber: 1,
        slugline: 'EXT. MMIA AIRPORT - DAY',
        estimatedDuration: '5s',
        visualDescription: 'Amara emerging from airport terminal into bright humid Lagos sunlight',
        actorAction: 'Amara adjusts sunglasses and takes a deep breath',
        cameraAngle: 'Eye Level',
        cameraMovement: 'Dolly Out',
        shotSize: 'Wide Shot',
        lighting: 'Harsh bright mid-day sun'
      },
      {
        shotNumber: 3,
        sceneNumber: 1,
        slugline: 'INT. LAGOS YELLOW BUS - NIGHT',
        estimatedDuration: '3s',
        visualDescription: 'Neon streetlights casting moving streaks across passengers in yellow Danfo bus',
        actorAction: 'Amara listens to conductor shouting destination',
        cameraAngle: 'Close-Up',
        cameraMovement: 'Static',
        shotSize: 'Close-Up',
        lighting: 'Neon and streetlamp reflections'
      }
    ]
  };

  multiShotStoryboard.shots.forEach((shot) => {
    const prompt = buildVeoPromptFromShot(shot, PRODUCTION_TYPES.SHORT_FILM);
    assert(prompt.includes(shot.slugline), `Shot #${shot.shotNumber} prompt contains slugline: "${shot.slugline}"`);
    assert(prompt.includes('Cinematic 4K film still'), `Shot #${shot.shotNumber} prompt contains cinematic film styling`);
  });

  // ----------------------------------------------------
  // TEST 3: Multi-Clip Assembly in Storyboard Order with FFmpeg
  // ----------------------------------------------------
  console.log('\n[Test 3] Testing Multi-Clip FFmpeg Assembly & Storyboard Ordering...');
  const videosDir = path.join(__dirname, 'public', 'videos');
  const clipsDir = path.join(videosDir, 'clips');
  if (!fs.existsSync(clipsDir)) {
    fs.mkdirSync(clipsDir, { recursive: true });
  }

  // Find any existing clip or generate synthetic clip as source
  let sourceClip;
  const existingClips = fs.readdirSync(clipsDir).filter(f => f.endsWith('.mp4'));
  if (existingClips.length > 0) {
    sourceClip = path.join(clipsDir, existingClips[0]);
  } else {
    sourceClip = path.join(clipsDir, 'test_synthetic_source.mp4');
    await createPlaceholderClipFile(sourceClip, 4);
  }
  const sourceSize = fs.statSync(sourceClip).size;
  assert(sourceSize > 0, `Source clip is non-empty (${(sourceSize / 1024 / 1024).toFixed(2)} MB)`);

  // Create 3 ordered storyboard clips
  const clip1 = path.join(clipsDir, 'test_storyboard_shot_1.mp4');
  const clip2 = path.join(clipsDir, 'test_storyboard_shot_2.mp4');
  const clip3 = path.join(clipsDir, 'test_storyboard_shot_3.mp4');
  fs.copyFileSync(sourceClip, clip1);
  fs.copyFileSync(sourceClip, clip2);
  fs.copyFileSync(sourceClip, clip3);

  const testClipPaths = [clip1, clip2, clip3];
  const finalMultiClipOutput = path.join(videosDir, 'test_full_storyboard_assembled.mp4');

  const assembleRes = await assembleVideos({
    clipPaths: testClipPaths,
    outputPath: finalMultiClipOutput
  });

  assert(assembleRes.success === true, 'Multi-clip assembly completed successfully');
  assert(assembleRes.clipCount === 3, 'Assembled exactly 3 clips');
  assert(fs.existsSync(finalMultiClipOutput), 'Final assembled MP4 exists on disk');
  const assembledStats = fs.statSync(finalMultiClipOutput);
  assert(assembledStats.size > 0, `Final assembled video is non-empty (${(assembledStats.size / 1024 / 1024).toFixed(2)} MB)`);

  // Clean up temporary test clips
  testClipPaths.forEach(f => { if (fs.existsSync(f)) fs.unlinkSync(f); });
  if (fs.existsSync(finalMultiClipOutput)) fs.unlinkSync(finalMultiClipOutput);

  // ----------------------------------------------------
  // TEST 4: Direct Video Production Pipeline Contract & Validation
  // ----------------------------------------------------
  console.log('\n[Test 4] Verifying Direct Video Production Engine Contract...');
  const nullPkgRes = await directVideoProduction({ finalPackage: null });
  assert(nullPkgRes.success === false, 'Rejects null finalPackage');
  assert(nullPkgRes.step === 'validation', 'Validation step error reported');

  const emptyShotsRes = await directVideoProduction({
    finalPackage: { storyboard: { shots: [] } }
  });
  assert(emptyShotsRes.success === false, 'Rejects empty storyboard shots');

  // Test full production with existing clips preservation
  const fullProductionPackage = {
    productionType: PRODUCTION_TYPES.SHORT_FILM,
    topic: 'Offshore Signal Discovery',
    storyboard: {
      title: 'Offshore Signal Discovery',
      shots: [
        {
          shotNumber: 1,
          slugline: 'EXT. OFFSHORE OIL PLATFORM - SUNSET',
          visualDescription: 'Silhouetted Nigerian marine engineer standing on rusted steel platform catwalk, observing ocean waves at golden hour',
          actorAction: 'Looking through binoculars as amber light reflects off the water',
          cameraAngle: 'Low Angle',
          cameraMovement: 'Slow Tracking Shot',
          shotSize: 'Wide Shot',
          lighting: 'Warm golden hour sunset chiaroscuro',
          duration: 6
        }
      ]
    }
  };

  console.log('\n[Test 5] Running Full Video Workflow (preserving existing clips)...');
  const prodResult = await directVideoProduction({
    finalPackage: fullProductionPackage,
    topic: 'Offshore Signal Discovery',
    options: {
      maxShots: 1,
      durationSeconds: 6
    }
  });

  assert(prodResult.success === true, 'Full video production completed successfully');
  assert(typeof prodResult.videoUrl === 'string', `Generated video URL: ${prodResult.videoUrl}`);
  assert(fs.existsSync(prodResult.videoPath), `Assembled video exists at: ${prodResult.videoPath}`);
  assert(prodResult.clipCount >= 1, `Generated clips count: ${prodResult.clipCount}`);
  assert(prodResult.clips[0].durationSeconds === 6, 'Clip duration normalized to 6s');

  console.log('\n====================================================');
  console.log('>>> ALL FULL VIDEO WORKFLOW TESTS PASSED! <<<');
  console.log('====================================================\n');
}

runFullVideoWorkflowTest().catch(err => {
  console.error('\nTest Suite Failed:', err);
  process.exit(1);
});
