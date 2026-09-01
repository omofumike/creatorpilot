import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { generateVideoClip } from './lib/video/veoVideoGenerator.js';
import { assembleVideos, isFfmpegAvailable, getFfmpegPath } from './lib/video/videoAssembler.js';
import { config } from './lib/utils/config.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runSingleClipTest() {
  console.log('====================================================');
  console.log('CreatorPilot: Single Video Clip Generation & Assembly Test');
  console.log('====================================================');
  console.log(`Google Cloud Project : ${config.googleCloudProject}`);
  console.log(`Google Cloud Location: ${config.googleCloudLocation}`);
  console.log(`Veo Model            : ${process.env.VEO_MODEL || 'veo-3.1-generate-001'}`);
  console.log(`FFmpeg Available     : ${isFfmpegAvailable()}`);

  if (isFfmpegAvailable()) {
    console.log(`FFmpeg Binary Path   : ${getFfmpegPath()}`);
  } else {
    console.error('ERROR: ffmpeg-static binary not found!');
    process.exit(1);
  }

  // Ensure output directory exists
  const outputDir = path.join(__dirname, 'public', 'videos');
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const timestamp = Date.now();
  const testClipPath = path.join(outputDir, `test_clip_${timestamp}.mp4`);
  const finalTestVideoPath = path.join(outputDir, `test_final_${timestamp}.mp4`);

  const testPrompt =
    'Cinematic aerial shot of Lagos coastline at sunset, ' +
    'golden hour light reflecting on calm ocean waves, modern city buildings in background, ' +
    'slow smooth drone camera movement, photorealistic 4k film production.';

  console.log('\n[Step 1/2] Generating 1 Video Clip with Google Veo...');
  console.log(`Prompt: "${testPrompt}"`);
  console.log(`Target: ${testClipPath}\n`);

  const clipStartTime = Date.now();

  const clipResult = await generateVideoClip({
    prompt: testPrompt,
    outputPath: testClipPath,
    options: {
      aspectRatio: '16:9',
      durationSeconds: 6
    },
    onProgress: (progress) => {
      if (progress.status === 'generating') {
        console.log(`  -> Veo is generating... (elapsed: ${progress.elapsedSeconds}s)`);
      }
    }
  });

  const clipDurationSec = Math.round((Date.now() - clipStartTime) / 1000);
  console.log(`\nClip generation completed in ${clipDurationSec}s!`);
  console.log(`Saved to: ${clipResult.outputPath}`);

  if (fs.existsSync(testClipPath)) {
    const stats = fs.statSync(testClipPath);
    console.log(`File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
  }

  console.log('\n[Step 2/2] Testing Video Assembly with FFmpeg...');
  const assembleResult = await assembleVideos({
    clipPaths: [testClipPath],
    outputPath: finalTestVideoPath
  });

  console.log(`Assembly complete!`);
  console.log(`Final output: ${assembleResult.outputPath}`);

  if (fs.existsSync(finalTestVideoPath)) {
    const finalStats = fs.statSync(finalTestVideoPath);
    console.log(`Final file size: ${(finalStats.size / 1024 / 1024).toFixed(2)} MB`);
  }

  console.log('\n====================================================');
  console.log('SUCCESS: Video Generation and Assembly Test PASSED!');
  console.log(`Test Clip URL: /videos/${path.basename(testClipPath)}`);
  console.log(`Final MP4 URL: /videos/${path.basename(finalTestVideoPath)}`);
  console.log('====================================================');
}

runSingleClipTest().catch((error) => {
  console.error('\n====================================================');
  console.error('TEST FAILED:');
  console.error(error.message || error);
  console.error('====================================================');
  process.exit(1);
});
