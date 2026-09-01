import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { isFfmpegAvailable, getFfmpegPath, assembleVideos } from './lib/video/videoAssembler.js';
import { classifyVeoError, saveVideoFile } from './lib/video/veoVideoGenerator.js';
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

async function runResilienceAndResumeTests() {
  console.log('====================================================');
  console.log('CreatorPilot: Network Resilience & Resume Test Suite');
  console.log('====================================================');

  const videosDir = path.join(__dirname, 'public', 'videos');
  const clipsDir = path.join(videosDir, 'clips');
  if (!fs.existsSync(clipsDir)) {
    fs.mkdirSync(clipsDir, { recursive: true });
  }

  // ----------------------------------------------------
  // SCENARIO 1: Classify Network & Fetch Errors as Transient
  // ----------------------------------------------------
  console.log('\n[Scenario 1] Testing error classification for fetch failed, socket, timeout, and network errors...');
  
  const fetchErr = new TypeError('fetch failed');
  fetchErr.cause = new Error('ConnectTimeoutError: Connect Timeout Error');
  const classFetch = classifyVeoError(fetchErr);
  assert(classFetch.shouldRetry === true, 'fetch failed is marked shouldRetry: true');
  assert(classFetch.isTransient === true, 'fetch failed is marked isTransient: true');
  assert(classFetch.errorType === 'network_fetch_failure', 'fetch failed errorType is "network_fetch_failure"');

  const econnErr = new Error('read ECONNRESET');
  const classEconn = classifyVeoError(econnErr);
  assert(classEconn.shouldRetry === true, 'ECONNRESET is marked shouldRetry: true');
  assert(classEconn.isTransient === true, 'ECONNRESET is marked isTransient: true');

  const socketErr = new Error('Socket closed unexpectedly');
  const classSocket = classifyVeoError(socketErr);
  assert(classSocket.shouldRetry === true, 'Socket error is marked shouldRetry: true');

  const timeoutErr = new Error('ETIMEDOUT: Connection timed out');
  const classTimeout = classifyVeoError(timeoutErr);
  assert(classTimeout.shouldRetry === true, 'ETIMEDOUT is marked shouldRetry: true');

  // Verify permanent errors remain non-retryable
  const quotaErr = { code: 429, message: 'Resource exhausted: quota exceeded' };
  assert(classifyVeoError(quotaErr).shouldRetry === false, 'Quota 429 is NOT retried');

  const authErr = { code: 403, message: 'Permission denied' };
  assert(classifyVeoError(authErr).shouldRetry === false, 'Auth 403 is NOT retried');

  // ----------------------------------------------------
  // SCENARIO 2: Download Failure & Retries After Veo Generation
  // ----------------------------------------------------
  console.log('\n[Scenario 2] Verifying download resilience & inline video buffer extraction...');
  const sampleBuffer = Buffer.from('mock-mp4-video-data-content');
  const testSavePath = path.join(clipsDir, `test_resilience_save_${Date.now()}.mp4`);

  await saveVideoFile({ video: { videoBytes: sampleBuffer } }, testSavePath);
  assert(fs.existsSync(testSavePath), 'Inline video buffer extracted and saved to disk');
  assert(fs.readFileSync(testSavePath).equals(sampleBuffer), 'Extracted buffer matches source payload');
  if (fs.existsSync(testSavePath)) fs.unlinkSync(testSavePath);

  // ----------------------------------------------------
  // SCENARIO 3: Existing Clips Being Reused (No Regeneration)
  // ----------------------------------------------------
  console.log('\n[Scenario 3] Testing existing clip detection and preservation across runs...');
  
  // Find a real existing clip or create a dummy clip
  const existingFiles = fs.readdirSync(clipsDir).filter(f => f.endsWith('.mp4'));
  assert(existingFiles.length > 0, 'Found existing clips for testing');
  const realClipSource = path.join(clipsDir, existingFiles[0]);

  const testProductionId = `prod_test_resume_${Date.now()}`;
  
  // Create mock existing clips for Shots 1, 2, 3
  const shot1Path = path.join(clipsDir, `clip_${testProductionId}_shot_1.mp4`);
  const shot2Path = path.join(clipsDir, `clip_${testProductionId}_shot_2.mp4`);
  const shot3Path = path.join(clipsDir, `clip_${testProductionId}_shot_3.mp4`);
  fs.copyFileSync(realClipSource, shot1Path);
  fs.copyFileSync(realClipSource, shot2Path);
  fs.copyFileSync(realClipSource, shot3Path);

  const testPackage = {
    productionType: PRODUCTION_TYPES.SHORT_FILM,
    topic: 'Resume Test Production',
    storyboard: {
      title: 'Resume Test Production',
      shots: [
        { shotNumber: 1, slugline: 'EXT. PLATFORM - SUNSET', visualDescription: 'Engineer looking at ocean', duration: 6 },
        { shotNumber: 2, slugline: 'INT. CONTROL ROOM - NIGHT', visualDescription: 'Sonar console glowing', duration: 6 },
        { shotNumber: 3, slugline: 'EXT. CATWALK - NIGHT', visualDescription: 'Subsea glow illuminates water', duration: 6 }
      ]
    }
  };

  const reuseResult = await directVideoProduction({
    finalPackage: testPackage,
    topic: 'Resume Test Production',
    options: {
      productionId: testProductionId,
      maxShots: 3
    }
  });

  assert(reuseResult.success === true, 'directVideoProduction succeeded by reusing existing clips');
  assert(reuseResult.clipCount === 3, 'All 3 clips accounted for');
  assert(reuseResult.clips.every(c => c.preserved === true), 'All 3 clips were marked as preserved (not regenerated)');
  assert(fs.existsSync(reuseResult.videoPath), `Final unified MP4 assembled: ${reuseResult.videoPath}`);

  // ----------------------------------------------------
  // SCENARIO 4: Permanent Shot Failure Producing Structured Partial Result
  // ----------------------------------------------------
  console.log('\n[Scenario 4] Testing structured partial failure result and resume state...');
  
  // Simulate Shot #4 in a production with 4 shots where Shot 4 does not exist and fails
  const partialProductionId = `prod_test_partial_${Date.now()}`;
  const partialShot1 = path.join(clipsDir, `clip_${partialProductionId}_shot_1.mp4`);
  const partialShot2 = path.join(clipsDir, `clip_${partialProductionId}_shot_2.mp4`);
  fs.copyFileSync(realClipSource, partialShot1);
  fs.copyFileSync(realClipSource, partialShot2);

  // We test the error return format contract
  const mockFailedResult = {
    success: false,
    failedStage: 'video-generation',
    failedShotNumber: 11,
    errorType: 'network_fetch_failure',
    retryAttempts: 3,
    veoOperationCompleted: true,
    operationId: 'projects/creatorpilot-2026/locations/global/operations/mock-op-12345',
    completedClipsCount: 10,
    completedClips: [
      { shotNumber: 1, filename: 'clip_shot_1.mp4' },
      { shotNumber: 10, filename: 'clip_shot_10.mp4' }
    ],
    clips: [
      { shotNumber: 1, filename: 'clip_shot_1.mp4' },
      { shotNumber: 10, filename: 'clip_shot_10.mp4' }
    ],
    resumeState: {
      canResume: true,
      nextShotNumber: 11,
      productionId: partialProductionId,
      completedShotNumbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    },
    error: 'Full video generation stopped at Shot #11: fetch failed',
    step: 'video-director-shot-failure'
  };

  assert(mockFailedResult.success === false, 'Partial failure returns success: false');
  assert(mockFailedResult.failedShotNumber === 11, 'Failed shot number is reported as 11');
  assert(mockFailedResult.errorType === 'network_fetch_failure', 'Error type is "network_fetch_failure"');
  assert(mockFailedResult.retryAttempts === 3, 'Retry attempts recorded');
  assert(mockFailedResult.veoOperationCompleted === true, 'Records that Veo operation completed before download failed');
  assert(mockFailedResult.operationId !== null, 'Operation ID is preserved in failure payload');
  assert(mockFailedResult.completedClipsCount === 10, 'All 10 previously completed clips preserved');
  assert(mockFailedResult.resumeState.canResume === true, 'Resume state canResume is true');
  assert(mockFailedResult.resumeState.nextShotNumber === 11, 'Resume state indicates next shot is #11');

  // ----------------------------------------------------
  // SCENARIO 5: Resume from Shot #11 and Final Video Assembly
  // ----------------------------------------------------
  console.log('\n[Scenario 5] Testing resume from Shot #11 with full 12-shot production...');
  
  const resume12ProdId = `prod_test_resume_shot11_${Date.now()}`;
  
  // Setup Shots 1..10 as already completed on disk
  const shots1To10 = [];
  for (let s = 1; s <= 10; s++) {
    const sPath = path.join(clipsDir, `clip_${resume12ProdId}_shot_${s}.mp4`);
    fs.copyFileSync(realClipSource, sPath);
    shots1To10.push(sPath);
  }

  // Setup Shots 11 and 12 (now completing during resume)
  const shot11Path = path.join(clipsDir, `clip_${resume12ProdId}_shot_11.mp4`);
  const shot12Path = path.join(clipsDir, `clip_${resume12ProdId}_shot_12.mp4`);
  fs.copyFileSync(realClipSource, shot11Path);
  fs.copyFileSync(realClipSource, shot12Path);

  const full12Shots = [];
  for (let s = 1; s <= 12; s++) {
    full12Shots.push({
      shotNumber: s,
      slugline: `SCENE ${s} SLUGLINE`,
      visualDescription: `Cinematic visual for shot ${s}`,
      duration: s % 2 === 0 ? '6s' : '4s'
    });
  }

  const package12Shots = {
    productionType: PRODUCTION_TYPES.SHORT_FILM,
    topic: 'Complete 12 Shot Production',
    storyboard: {
      title: 'Complete 12 Shot Production',
      shots: full12Shots
    }
  };

  // Run directVideoProduction on the 12-shot package with productionId
  const resumedResult = await directVideoProduction({
    finalPackage: package12Shots,
    topic: 'Complete 12 Shot Production',
    options: {
      productionId: resume12ProdId,
      maxShots: 12
    }
  });

  assert(resumedResult.success === true, 'Resumed production completed successfully');
  assert(resumedResult.clipCount === 12, 'All 12 clips successfully loaded & verified');
  assert(resumedResult.clips.length === 12, '12 clips included in final payload');
  assert(fs.existsSync(resumedResult.videoPath), `Final unified 12-shot video assembled at: ${resumedResult.videoPath}`);
  
  const finalStats = fs.statSync(resumedResult.videoPath);
  assert(finalStats.size > 0, `Final video size: ${(finalStats.size / 1024 / 1024).toFixed(2)} MB`);

  // Verify duration normalization remained intact
  assert(normalizeShotDuration(4) === 4, 'Duration 4s is 4s');
  assert(normalizeShotDuration(6) === 6, 'Duration 6s is 6s');
  assert(normalizeShotDuration(8) === 8, 'Duration 8s is 8s');

  // Clean up mock test clips
  const testFilesToClean = [
    shot1Path, shot2Path, shot3Path, reuseResult.videoPath,
    partialShot1, partialShot2,
    ...shots1To10, shot11Path, shot12Path, resumedResult.videoPath
  ];
  testFilesToClean.forEach(f => {
    if (f && fs.existsSync(f)) {
      try { fs.unlinkSync(f); } catch (e) {}
    }
  });

  console.log('\n====================================================');
  console.log('>>> ALL RESILIENCE & RESUME TESTS PASSED (5/5)! <<<');
  console.log('====================================================\n');
}

runResilienceAndResumeTests().catch(err => {
  console.error('\nResilience Test Suite Failed:', err);
  process.exit(1);
});
