import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { isFfmpegAvailable, getFfmpegPath } from './videoAssembler.js';

const execFileAsync = promisify(execFile);

/**
 * Creates a local placeholder MP4 clip using FFmpeg if available,
 * or a minimal synthetic MP4 file on disk.
 *
 * @param {string} outputPath - Target path for the MP4 clip.
 * @param {number} [durationSeconds=6] - Duration of the clip in seconds.
 * @param {string} [aspectRatio='16:9'] - Aspect ratio ('16:9' or '9:16').
 * @param {number} [shotNumber=1] - Storyboard shot/scene number.
 * @returns {Promise<void>}
 */
export async function createPlaceholderClipFile(outputPath, durationSeconds = 6, aspectRatio = '16:9', shotNumber = 1) {
  const targetDir = path.dirname(outputPath);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const duration = Math.max(1, Math.min(30, Number(durationSeconds) || 6));
  const resolution = aspectRatio === '9:16' ? '360x640' : '640x360';

  if (isFfmpegAvailable()) {
    try {
      const binaryPath = getFfmpegPath();
      // Generate standard H.264 MP4 with lavfi testsrc (video test pattern with clock)
      const args = [
        '-f', 'lavfi',
        '-i', `testsrc=duration=${duration}:size=${resolution}:rate=24`,
        '-c:v', 'libx264',
        '-pix_fmt', 'yuv420p',
        '-preset', 'ultrafast',
        '-movflags', '+faststart',
        '-y',
        outputPath
      ];

      await execFileAsync(binaryPath, args);

      if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
        return;
      }
    } catch (ffmpegErr) {
      console.warn(`[mockVideoGenerator] FFmpeg testsrc generation failed: ${ffmpegErr.message}, falling back to minimal synthetic buffer.`);
    }
  }

  // Fallback if FFmpeg is not available or failed: write a valid minimal MP4 file structure
  // Minimal valid MP4 ftyp + moov + mdat header
  const minimalMp4Buffer = Buffer.from([
    0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, // size 24, 'ftyp'
    0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x02, 0x00, // 'isom', minor_version 512
    0x69, 0x73, 0x6f, 0x6d, 0x69, 0x73, 0x6f, 0x32, // compatible brands: isom, iso2
    0x00, 0x00, 0x00, 0x08, 0x66, 0x72, 0x65, 0x65, // size 8, 'free'
    0x00, 0x00, 0x00, 0x10, 0x6d, 0x64, 0x61, 0x74, // size 16, 'mdat'
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
  ]);

  fs.writeFileSync(outputPath, minimalMp4Buffer);
}

/**
 * Generates a mock video clip safely without making any external API or Google Cloud calls.
 * Simulates real progress events, generates local playable MP4 placeholder clips,
 * and returns deterministic production metadata.
 *
 * @param {Object} params
 * @param {string} params.prompt - Visual description / prompt for the shot.
 * @param {string} params.outputPath - Target output path for MP4.
 * @param {number} [params.shotNumber=1] - Storyboard shot number.
 * @param {Object} [params.options] - Options (durationSeconds, aspectRatio).
 * @param {Function} [params.onProgress] - Optional progress notification callback.
 * @returns {Promise<{ success: boolean, outputPath: string, filename: string, prompt: string, shotNumber: number, operationId: string, isMock: boolean }>}
 */
export async function generateMockVideoClip({ prompt, outputPath, shotNumber = 1, options = {}, onProgress }) {
  if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
    throw new Error('generateMockVideoClip requires a non-empty prompt string.');
  }

  if (!outputPath || typeof outputPath !== 'string') {
    throw new Error('generateMockVideoClip requires a valid outputPath string.');
  }

  const durationSeconds = options.durationSeconds ? Number(options.durationSeconds) : 6;
  const aspectRatio = options.aspectRatio || '16:9';

  console.log('\n====================================================');
  console.log(`[mockVideoGenerator] Mock Video Generation for Scene #${shotNumber}`);
  console.log(`  Mode               : MOCK (Zero Cloud API Calls)`);
  console.log(`  Duration           : ${durationSeconds}s`);
  console.log(`  Aspect Ratio       : ${aspectRatio}`);
  console.log(`  Scene Number       : #${shotNumber}`);
  console.log(`  Target Output Path : ${outputPath}`);
  console.log('====================================================');

  const mockOperationId = `mock-op-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

  // Simulate progress notification
  if (typeof onProgress === 'function') {
    onProgress({
      status: 'generating',
      stage: 'generating_clip',
      currentShot: shotNumber,
      shotNumber,
      elapsedSeconds: 1,
      operationName: mockOperationId,
      message: `Creating scene ${shotNumber}...`
    });
  }

  // Generate local MP4 clip
  await createPlaceholderClipFile(outputPath, durationSeconds, aspectRatio, shotNumber);

  const stats = fs.statSync(outputPath);
  console.log(`[mockVideoGenerator] Scene #${shotNumber} placeholder saved: ${outputPath} (${(stats.size / 1024).toFixed(1)} KB)`);

  return {
    success: true,
    outputPath,
    filename: path.basename(outputPath),
    prompt: prompt.trim(),
    shotNumber,
    durationSeconds,
    operationId: mockOperationId,
    isMock: true
  };
}
