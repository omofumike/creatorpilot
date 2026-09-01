import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import http from 'http';
import dotenv from 'dotenv';
import { saveVideoMetadata, getVideoMetadata, getSafeSlug } from './lib/video/videoMetadataStore.js';
import { directVideoProduction } from './lib/agents/videoDirectorAgent.js';
import { PRODUCTION_TYPES } from './lib/utils/productionTypes.js';
import { app } from './lib/web/app.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VIDEOS_DIR = path.join(__dirname, 'public', 'videos');
const CLIPS_DIR = path.join(VIDEOS_DIR, 'clips');
const METADATA_DIR = path.join(VIDEOS_DIR, 'metadata');

function assert(condition, message) {
  if (!condition) {
    console.error(`  ✗ Assertion Failed: ${message}`);
    throw new Error(message);
  }
  console.log(`  ✓ ${message}`);
}

async function request(server, path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const port = server.address().port;
    const options = {
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch (e) {}
        resolve({ status: res.statusCode, headers: res.headers, body: json, text: data });
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runVideoPersistenceTestSuite() {
  console.log('====================================================');
  console.log('CreatorPilot: Generated Video Persistence Test Suite');
  console.log('====================================================');

  if (!fs.existsSync(CLIPS_DIR)) fs.mkdirSync(CLIPS_DIR, { recursive: true });
  if (!fs.existsSync(METADATA_DIR)) fs.mkdirSync(METADATA_DIR, { recursive: true });

  // Start temporary test server
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const serverPort = server.address().port;
  console.log(`Test server running on port: ${serverPort}`);

  try {
    // ----------------------------------------------------
    // TEST 1: Generated Video Persistence on Disk
    // ----------------------------------------------------
    console.log('\n[Test 1] Testing generated video metadata persistence & disk sync...');
    
    // Create a real test MP4 file
    const prod1Id = `prod_test_persistence_${Date.now()}`;
    const testVideoPath = path.join(VIDEOS_DIR, `video_${prod1Id}.mp4`);
    const testClip1Path = path.join(CLIPS_DIR, `clip_${prod1Id}_shot_1.mp4`);
    const testClip2Path = path.join(CLIPS_DIR, `clip_${prod1Id}_shot_2.mp4`);
    
    fs.writeFileSync(testVideoPath, Buffer.from('mock-assembled-mp4-video-data-12345'));
    fs.writeFileSync(testClip1Path, Buffer.from('mock-clip-1-data'));
    fs.writeFileSync(testClip2Path, Buffer.from('mock-clip-2-data'));

    const metaPayload = {
      topic: 'Persistence Test Production',
      status: 'completed',
      success: true,
      videoUrl: `/videos/video_${prod1Id}.mp4`,
      videoPath: testVideoPath,
      filename: `video_${prod1Id}.mp4`,
      totalDurationSeconds: 12,
      totalTargetShots: 2,
      aspectRatio: '16:9',
      productionType: PRODUCTION_TYPES.CREATOR_VIDEO,
      clips: [
        { shotNumber: 1, prompt: 'Visual prompt shot 1', videoUrl: `/videos/clips/clip_${prod1Id}_shot_1.mp4`, filename: `clip_${prod1Id}_shot_1.mp4`, localPath: testClip1Path, durationSeconds: 6, operationId: 'op-111' },
        { shotNumber: 2, prompt: 'Visual prompt shot 2', videoUrl: `/videos/clips/clip_${prod1Id}_shot_2.mp4`, filename: `clip_${prod1Id}_shot_2.mp4`, localPath: testClip2Path, durationSeconds: 6, operationId: 'op-222' }
      ]
    };

    const saved = saveVideoMetadata(prod1Id, metaPayload);
    assert(saved.productionId === prod1Id, 'Saved metadata has correct productionId');
    assert(saved.videoFileExists === true, 'Saved metadata validated video file exists on disk');
    assert(saved.videoFileSize > 0, 'Saved metadata recorded positive video file size');

    // Verify GET /api/productions/:productionId/video endpoint
    const resGet = await request(server, `/api/productions/${prod1Id}/video`);
    assert(resGet.status === 200, 'GET /api/productions/:id/video returned HTTP 200');
    assert(resGet.body.hasVideo === true, 'Response reports hasVideo: true');
    assert(resGet.body.video.filename === `video_${prod1Id}.mp4`, 'Response contains correct filename');
    assert(resGet.body.video.videoFileExists === true, 'Response confirms videoFileExists: true');
    assert(resGet.body.video.clips.length === 2, 'Response returns all 2 clips');

    // ----------------------------------------------------
    // TEST 2: Loading Production after Browser Refresh / LocalStorage
    // ----------------------------------------------------
    console.log('\n[Test 2] Testing loading production state after simulated browser refresh...');
    
    // Simulate LocalStorage production record
    const localStorageRecord = {
      id: prod1Id,
      topic: 'Persistence Test Production',
      generatedVideo: resGet.body.video,
      result: {
        id: prod1Id,
        topic: 'Persistence Test Production',
        status: 'PASS',
        overallScore: 92,
        generatedVideo: resGet.body.video
      },
      savedAt: new Date().toISOString()
    };

    // Simulate refresh restoration: verify that parsing the saved record gives full generatedVideo
    assert(localStorageRecord.generatedVideo !== null, 'LocalStorage contains generatedVideo');
    assert(localStorageRecord.generatedVideo.videoUrl === `/videos/video_${prod1Id}.mp4`, 'Video URL preserved in local state');
    
    // Verify server confirms video file is still present on disk after restart
    const resCheck = await request(server, `/api/production-video?productionId=${prod1Id}&topic=${encodeURIComponent('Persistence Test Production')}`);
    assert(resCheck.status === 200, 'GET /api/production-video returned HTTP 200');
    assert(resCheck.body.hasVideo === true, 'Backend confirms video exists for restored production');
    assert(resCheck.body.video.videoFileExists === true, 'Backend confirms MP4 file is available on disk');

    // ----------------------------------------------------
    // TEST 3: Switching Between Two Saved Productions
    // ----------------------------------------------------
    console.log('\n[Test 3] Testing switching between Production A and Production B (no cross-contamination)...');
    
    const prodAId = `prod_alpha_${Date.now()}`;
    const prodBId = `prod_beta_${Date.now()}`;

    const videoAPath = path.join(VIDEOS_DIR, `video_${prodAId}.mp4`);
    fs.writeFileSync(videoAPath, Buffer.from('video-alpha-bytes'));

    saveVideoMetadata(prodAId, {
      topic: 'Production Alpha',
      filename: `video_${prodAId}.mp4`,
      videoPath: videoAPath,
      videoUrl: `/videos/video_${prodAId}.mp4`,
      success: true,
      status: 'completed',
      clips: [{ shotNumber: 1, filename: 'alpha_clip_1.mp4' }]
    });

    // Production B has NO video generated yet
    const metaB = getVideoMetadata(prodBId, 'Production Beta');
    assert(metaB.hasVideo === false, 'Production B has no video');

    const metaA = getVideoMetadata(prodAId, 'Production Alpha');
    assert(metaA.hasVideo === true, 'Production A has video');
    assert(metaA.video.filename === `video_${prodAId}.mp4`, 'Production A has video_alpha.mp4');

    // Verify endpoint queries for A vs B
    const resA = await request(server, `/api/production-video?productionId=${prodAId}`);
    assert(resA.body.hasVideo === true, 'API confirms Production A has video');
    assert(resA.body.video.productionId === prodAId, 'API returns Production A ID');

    const resB = await request(server, `/api/production-video?productionId=${prodBId}`);
    assert(resB.body.hasVideo === false, 'API confirms Production B has NO video (not showing A)');

    // ----------------------------------------------------
    // TEST 4: Restoring Individual Clips with Playback & Download URLs
    // ----------------------------------------------------
    console.log('\n[Test 4] Testing restoration of individual clips and metadata...');
    
    assert(saved.clips[0].shotNumber === 1, 'Clip 1 shotNumber is 1');
    assert(saved.clips[0].videoUrl === `/videos/clips/clip_${prod1Id}_shot_1.mp4`, 'Clip 1 has valid URL');
    assert(saved.clips[0].operationId === 'op-111', 'Clip 1 operationId preserved');
    assert(saved.clips[0].exists === true, 'Clip 1 verified on disk');
    assert(saved.clips[1].shotNumber === 2, 'Clip 2 shotNumber is 2');
    assert(saved.clips[1].exists === true, 'Clip 2 verified on disk');

    // ----------------------------------------------------
    // TEST 5: Missing Video File Handling
    // ----------------------------------------------------
    console.log('\n[Test 5] Testing missing video file handling when MP4 is removed from disk...');
    
    const missingProdId = `prod_missing_${Date.now()}`;
    const missingVideoPath = path.join(VIDEOS_DIR, `video_${missingProdId}.mp4`);
    // Create metadata referencing a file that does NOT exist
    saveVideoMetadata(missingProdId, {
      topic: 'Missing Video Production',
      filename: `video_${missingProdId}.mp4`,
      videoPath: missingVideoPath,
      videoUrl: `/videos/video_${missingProdId}.mp4`,
      status: 'completed',
      success: true
    });

    const resMissing = await request(server, `/api/productions/${missingProdId}/video`);
    assert(resMissing.status === 200, 'GET /api/productions/:id/video returned HTTP 200');
    assert(resMissing.body.hasVideo === true, 'Metadata exists');
    assert(resMissing.body.fileMissing === true, 'Correctly flagged fileMissing: true');
    assert(resMissing.body.video.videoFileExists === false, 'Correctly flagged videoFileExists: false');

    // ----------------------------------------------------
    // TEST 6: Partially Completed Video Generation & Resume State
    // ----------------------------------------------------
    console.log('\n[Test 6] Testing partially completed generation persistence and resume state...');
    
    const partialProdId = `prod_partial_test_${Date.now()}`;
    const partialClip1Path = path.join(CLIPS_DIR, `clip_${partialProdId}_shot_1.mp4`);
    fs.writeFileSync(partialClip1Path, Buffer.from('partial-clip-1-content'));

    saveVideoMetadata(partialProdId, {
      topic: 'Partial Production',
      status: 'partial',
      success: false,
      failedShotNumber: 2,
      error: 'Shot #2 failed: fetch failed',
      completedClipsCount: 1,
      clips: [
        { shotNumber: 1, filename: `clip_${partialProdId}_shot_1.mp4`, localPath: partialClip1Path, durationSeconds: 6, exists: true }
      ],
      resumeState: {
        canResume: true,
        nextShotNumber: 2,
        productionId: partialProdId,
        completedShotNumbers: [1]
      }
    });

    const resPartial = await request(server, `/api/productions/${partialProdId}/video`);
    assert(resPartial.body.hasVideo === true, 'Partial video metadata retrieved');
    assert(resPartial.body.video.status === 'partial', 'Status is "partial"');
    assert(resPartial.body.video.failedShotNumber === 2, 'Failed shot number is 2');
    assert(resPartial.body.video.resumeState.canResume === true, 'Resume state canResume is true');
    assert(resPartial.body.video.resumeState.nextShotNumber === 2, 'Resume state nextShotNumber is 2');
    assert(resPartial.body.video.clips.length === 1, 'Completed Shot 1 clip preserved');

    // ----------------------------------------------------
    // TEST 7: Final Video Playback URL Verification
    // ----------------------------------------------------
    console.log('\n[Test 7] Verifying static video playback serving via HTTP...');
    
    const resPlayback = await request(server, `/videos/video_${prod1Id}.mp4`);
    assert(resPlayback.status === 200, 'Final MP4 video URL returned HTTP 200 OK');
    assert(resPlayback.text.length > 0, 'Static video stream returned video content');

    // Clean up temporary test files
    [testVideoPath, testClip1Path, testClip2Path, videoAPath, partialClip1Path].forEach(f => {
      if (fs.existsSync(f)) try { fs.unlinkSync(f); } catch (e) {}
    });

    console.log('\n====================================================');
    console.log('>>> ALL 7/7 VIDEO PERSISTENCE TESTS PASSED! <<<');
    console.log('====================================================\n');

  } finally {
    server.close();
  }
}

runVideoPersistenceTestSuite().catch(err => {
  console.error('\nVideo Persistence Test Suite Failed:', err);
  process.exit(1);
});
