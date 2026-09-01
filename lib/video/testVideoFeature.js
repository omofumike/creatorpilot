import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { isFfmpegAvailable, getFfmpegPath, assembleVideos } from './videoAssembler.js';
import { buildVeoPromptFromShot, directVideoProduction } from '../agents/videoDirectorAgent.js';
import { app } from '../web/app.js';
import { PRODUCTION_TYPES } from '../utils/productionTypes.js';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runTests() {
  console.log('====================================================');
  console.log('Running CreatorPilot Video Feature Test Suite');
  console.log('====================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition, message) {
    total++;
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
  }

  // 1. FFmpeg Binary Verification
  console.log('[Test 1] Verifying ffmpeg-static installation...');
  assert(isFfmpegAvailable() === true, 'ffmpeg binary is available');
  const ffmpegPath = getFfmpegPath();
  assert(typeof ffmpegPath === 'string' && ffmpegPath.length > 0, 'ffmpeg path is a valid non-empty string');
  assert(fs.existsSync(ffmpegPath), 'ffmpeg executable exists at path');

  // 2. FFmpeg Video Assembly Test using 2 synthetic MP4 clips
  console.log('\n[Test 2] Verifying FFmpeg video creation and assembly...');
  const tempDir = path.join(__dirname, '../../test_tmp_videos');
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const clip1Path = path.join(tempDir, 'test_clip_1.mp4');
  const clip2Path = path.join(tempDir, 'test_clip_2.mp4');
  const finalAssemblyPath = path.join(tempDir, 'test_assembled.mp4');

  // Generate synthetic 1-second test clips with FFmpeg testsrc
  try {
    await execFileAsync(ffmpegPath, [
      '-f', 'lavfi', '-i', 'testsrc=duration=1:size=640x360:rate=30',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y', clip1Path
    ]);
    await execFileAsync(ffmpegPath, [
      '-f', 'lavfi', '-i', 'testsrc=duration=1:size=640x360:rate=30',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y', clip2Path
    ]);

    assert(fs.existsSync(clip1Path) && fs.statSync(clip1Path).size > 0, 'Generated synthetic clip 1');
    assert(fs.existsSync(clip2Path) && fs.statSync(clip2Path).size > 0, 'Generated synthetic clip 2');

    // Test assembling both clips
    const assembleResult = await assembleVideos({
      clipPaths: [clip1Path, clip2Path],
      outputPath: finalAssemblyPath
    });

    assert(assembleResult.success === true, 'assembleVideos returned success: true');
    assert(fs.existsSync(finalAssemblyPath), 'Assembled MP4 file exists');
    assert(fs.statSync(finalAssemblyPath).size > 0, 'Assembled MP4 file is non-empty');
    assert(assembleResult.clipCount === 2, 'assembleVideos reports correct clipCount: 2');
  } finally {
    // Clean up temporary test files
    [clip1Path, clip2Path, finalAssemblyPath].forEach(f => {
      if (fs.existsSync(f)) {
        try { fs.unlinkSync(f); } catch (e) {}
      }
    });
    if (fs.existsSync(tempDir)) {
      try { fs.rmdirSync(tempDir); } catch (e) {}
    }
  }

  // 3. Prompt Builder Unit Tests
  console.log('\n[Test 3] Verifying buildVeoPromptFromShot for all formats...');
  const creatorShot = {
    shotNumber: 1,
    shotType: 'Presenter',
    visualDescription: 'Creator talking enthusiastically into microphone',
    action: 'Explains AI workflow',
    cameraFraming: 'Medium Close-Up',
    location: 'Modern home studio'
  };
  const creatorPrompt = buildVeoPromptFromShot(creatorShot, PRODUCTION_TYPES.CREATOR_VIDEO);
  assert(creatorPrompt.includes('Creator talking enthusiastically'), 'Creator prompt contains visual description');
  assert(creatorPrompt.includes('Medium Close-Up'), 'Creator prompt contains camera framing');

  const filmShot = {
    shotNumber: 1,
    slugline: 'EXT. LAGOS BEACH - SUNSET',
    visualDescription: 'Silhouetted figure walking along golden ocean water',
    actorAction: 'Pauses and gazes at horizon',
    cameraAngle: 'Low Angle',
    cameraMovement: 'Slow Tracking Shot',
    shotSize: 'Wide Shot',
    lighting: 'Warm golden hour chiaroscuro'
  };
  const filmPrompt = buildVeoPromptFromShot(filmShot, PRODUCTION_TYPES.SHORT_FILM);
  assert(filmPrompt.includes('EXT. LAGOS BEACH - SUNSET'), 'Film prompt contains slugline');
  assert(filmPrompt.includes('Low Angle'), 'Film prompt contains camera angle');
  assert(filmPrompt.includes('Slow Tracking Shot'), 'Film prompt contains camera movement');
  assert(filmPrompt.includes('Warm golden hour'), 'Film prompt contains lighting');

  // 4. Video Director Agent Validation Tests
  console.log('\n[Test 4] Verifying Video Director Agent validation...');
  const invalidResult1 = await directVideoProduction({});
  assert(invalidResult1.success === false, 'Rejects empty payload with success: false');
  assert(invalidResult1.error.includes('finalPackage is required'), 'Returns descriptive validation message');

  const invalidResult2 = await directVideoProduction({ finalPackage: { storyboard: { shots: [] } } });
  assert(invalidResult2.success === false, 'Rejects empty shots array with success: false');

  // 5. Veo Response Extraction Tests (All SDK Data Structures)
  console.log('\n[Test 5] Verifying Veo response extraction across all formats...');
  const { extractVideoBuffer, saveVideoFile } = await import('./veoVideoGenerator.js');

  const sampleMp4Bytes = Buffer.from('test-mp4-payload-data-stream');
  const sampleBase64 = sampleMp4Bytes.toString('base64');

  // Case A: @google/genai 2.16.0 typed Vertex AI output (video.videoBytes)
  const sdkResponseA = { video: { videoBytes: sampleBase64, mimeType: 'video/mp4' } };
  const extractedA = extractVideoBuffer(sdkResponseA);
  assert(Buffer.isBuffer(extractedA), 'extractVideoBuffer returns Buffer for SDK video.videoBytes format');
  assert(extractedA.toString('utf8') === 'test-mp4-payload-data-stream', 'Payload content matches for video.videoBytes');

  // Case B: Raw Vertex AI output (video.bytesBase64Encoded)
  const sdkResponseB = { video: { bytesBase64Encoded: sampleBase64 } };
  const extractedB = extractVideoBuffer(sdkResponseB);
  assert(Buffer.isBuffer(extractedB), 'extractVideoBuffer returns Buffer for video.bytesBase64Encoded');
  assert(extractedB.toString('utf8') === 'test-mp4-payload-data-stream', 'Payload content matches for bytesBase64Encoded');

  // Case C: Flat videoBytes
  const sdkResponseC = { videoBytes: sampleBase64 };
  const extractedC = extractVideoBuffer(sdkResponseC);
  assert(Buffer.isBuffer(extractedC), 'extractVideoBuffer returns Buffer for flat videoBytes');

  // Case D: Direct Buffer
  const extractedD = extractVideoBuffer(sampleMp4Bytes);
  assert(Buffer.isBuffer(extractedD) && extractedD.equals(sampleMp4Bytes), 'extractVideoBuffer returns Buffer for direct Buffer');

  // Case E: Data URL
  const sdkResponseE = { video: { videoBytes: `data:video/mp4;base64,${sampleBase64}` } };
  const extractedE = extractVideoBuffer(sdkResponseE);
  assert(Buffer.isBuffer(extractedE) && extractedE.toString('utf8') === 'test-mp4-payload-data-stream', 'extractVideoBuffer parses data URI prefix');

  // Case F: File Saving Verification
  const testSavePath = path.join(__dirname, '../../test_tmp_videos/test_save.mp4');
  await saveVideoFile(sdkResponseA, testSavePath);
  assert(fs.existsSync(testSavePath), 'saveVideoFile physically created MP4 file on disk');
  assert(fs.statSync(testSavePath).size > 0, 'saveVideoFile created non-empty MP4 file');
  if (fs.existsSync(testSavePath)) {
    fs.unlinkSync(testSavePath);
  }

  // 6. Veo Error Classification Unit Tests
  console.log('\n[Test 6] Verifying classifyVeoError for code: 13, transient and permanent errors...');
  const { classifyVeoError } = await import('./veoVideoGenerator.js');

  // Case A: Code 13 Internal Error
  const code13Err = { code: 13, message: 'Internal error. Please try again later.', 'Operation ID': 'op-123' };
  const res13 = classifyVeoError(code13Err);
  assert(res13.shouldRetry === true, 'Code 13 error is marked shouldRetry: true');
  assert(res13.isTransient === true, 'Code 13 error is marked isTransient: true');
  assert(res13.code === 13, 'Code 13 extracted properly');
  assert(res13.operationId === 'op-123', 'Operation ID extracted properly');

  // Case B: Code 14 Unavailable
  const code14Err = { code: 14, message: 'Service unavailable.' };
  const res14 = classifyVeoError(code14Err);
  assert(res14.shouldRetry === true, 'Code 14 error is marked shouldRetry: true');

  // Case C: Quota / Resource Exhausted (Must NOT retry)
  const quotaErr = { code: 8, message: 'Quota exceeded for model veo-3.1.' };
  const resQuota = classifyVeoError(quotaErr);
  assert(resQuota.shouldRetry === false, 'Quota error is NOT retried (shouldRetry: false)');

  // Case D: Validation / Bad Request (Must NOT retry)
  const invalidErr = { code: 3, message: 'Invalid argument provided.' };
  const resInvalid = classifyVeoError(invalidErr);
  assert(resInvalid.shouldRetry === false, 'Validation error is NOT retried (shouldRetry: false)');

  // Case E: Content Policy / Safety Filter (Must NOT retry)
  const safetyErr = { message: 'Generation blocked by safety filter.' };
  const resSafety = classifyVeoError(safetyErr);
  assert(resSafety.shouldRetry === false, 'Safety/Policy error is NOT retried (shouldRetry: false)');

  // Case F: Authentication Error (Must NOT retry)
  const authErr = { code: 16, message: 'Unauthenticated API request.' };
  const resAuth = classifyVeoError(authErr);
  assert(resAuth.shouldRetry === false, 'Auth error is NOT retried (shouldRetry: false)');

  console.log('\n====================================================');
  console.log(`ALL ${passed}/${total} TESTS PASSED!`);
  console.log('====================================================\n');
}

runTests().catch(err => {
  console.error('\nTests failed with error:');
  console.error(err);
  process.exit(1);
});
