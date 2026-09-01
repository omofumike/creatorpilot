import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';
import ffmpegPath from 'ffmpeg-static';

const execFileAsync = promisify(execFile);

/**
 * Checks if the ffmpeg binary is available and executable.
 * @returns {boolean}
 */
export function isFfmpegAvailable() {
  return Boolean(ffmpegPath && fs.existsSync(ffmpegPath));
}

/**
 * Returns the path to the ffmpeg executable.
 * @returns {string}
 */
export function getFfmpegPath() {
  if (!ffmpegPath) {
    throw new Error('ffmpeg-static binary path is not available.');
  }
  return ffmpegPath;
}

/**
 * Concatenates multiple video clip files into a single unified MP4 video.
 *
 * @param {Object} params
 * @param {string[]} params.clipPaths - Array of absolute file paths to input video clips.
 * @param {string} params.outputPath - Absolute path for the final assembled MP4 file.
 * @param {Object} [params.options] - Optional configuration settings.
 * @param {boolean} [params.options.reencode=false] - Force re-encoding with libx264.
 * @returns {Promise<{ success: boolean, outputPath: string, filename: string, clipCount: number }>}
 */
export async function assembleVideos({ clipPaths, outputPath, options = {} }) {
  if (!Array.isArray(clipPaths) || clipPaths.length === 0) {
    throw new Error('assembleVideos requires a non-empty array of clipPaths.');
  }

  if (!outputPath || typeof outputPath !== 'string') {
    throw new Error('assembleVideos requires a valid outputPath string.');
  }

  const binaryPath = getFfmpegPath();
  const resolvedClipPaths = clipPaths.map(p => path.resolve(p));
  const resolvedOutputPath = path.resolve(outputPath);

  // Validate that all input files exist
  for (let i = 0; i < resolvedClipPaths.length; i++) {
    const clip = resolvedClipPaths[i];
    if (!fs.existsSync(clip)) {
      throw new Error(`Input video clip at index ${i} does not exist: ${clip}`);
    }
  }

  // Ensure output directory exists
  const outputDir = path.dirname(resolvedOutputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Single clip case: copy directly to destination if paths differ
  if (resolvedClipPaths.length === 1) {
    if (resolvedClipPaths[0] === resolvedOutputPath) {
      return {
        success: true,
        outputPath: resolvedOutputPath,
        filename: path.basename(resolvedOutputPath),
        clipCount: 1
      };
    }

    // Copy to output destination
    fs.copyFileSync(resolvedClipPaths[0], resolvedOutputPath);
    return {
      success: true,
      outputPath: resolvedOutputPath,
      filename: path.basename(resolvedOutputPath),
      clipCount: 1
    };
  }

  // Multiple clips: use FFmpeg concat demuxer
  const tempConcatFileName = `concat_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.txt`;
  const tempConcatFilePath = path.join(os.tmpdir(), tempConcatFileName);

  try {
    // Generate concat list lines formatted for FFmpeg
    // Each line: file 'path/to/file.mp4' with forward slashes and escaped single quotes
    const concatFileContent = resolvedClipPaths
      .map(filePath => {
        const sanitized = filePath.replace(/\\/g, '/').replace(/'/g, "'\\''");
        return `file '${sanitized}'`;
      })
      .join('\n');

    fs.writeFileSync(tempConcatFilePath, concatFileContent, 'utf8');

    // Attempt 1: Fast stream copy (no re-encoding)
    if (!options.reencode) {
      try {
        const copyArgs = [
          '-f', 'concat',
          '-safe', '0',
          '-i', tempConcatFilePath,
          '-c', 'copy',
          '-y',
          resolvedOutputPath
        ];

        await execFileAsync(binaryPath, copyArgs);

        if (fs.existsSync(resolvedOutputPath) && fs.statSync(resolvedOutputPath).size > 0) {
          return {
            success: true,
            outputPath: resolvedOutputPath,
            filename: path.basename(resolvedOutputPath),
            clipCount: resolvedClipPaths.length
          };
        }
      } catch (copyError) {
        console.warn('[videoAssembler] Fast stream copy failed, falling back to full re-encode:', copyError.message);
      }
    }

    // Attempt 2: Re-encode to standard web-compatible H.264 MP4 with AAC audio
    try {
      const transcodeArgs = [
        '-f', 'concat',
        '-safe', '0',
        '-i', tempConcatFilePath,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '22',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '192k',
        '-movflags', '+faststart',
        '-y',
        resolvedOutputPath
      ];

      await execFileAsync(binaryPath, transcodeArgs);
    } catch (transcodeAudioErr) {
      console.warn('[videoAssembler] Re-encode with AAC failed (possibly silent video inputs), trying video-only re-encode:', transcodeAudioErr.message);

      // Attempt 3: Video-only re-encode fallback
      const videoOnlyArgs = [
        '-f', 'concat',
        '-safe', '0',
        '-i', tempConcatFilePath,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '22',
        '-pix_fmt', 'yuv420p',
        '-an',
        '-movflags', '+faststart',
        '-y',
        resolvedOutputPath
      ];

      await execFileAsync(binaryPath, videoOnlyArgs);
    }

    if (!fs.existsSync(resolvedOutputPath) || fs.statSync(resolvedOutputPath).size === 0) {
      throw new Error('FFmpeg finished but output video file is empty or missing.');
    }

    return {
      success: true,
      outputPath: resolvedOutputPath,
      filename: path.basename(resolvedOutputPath),
      clipCount: resolvedClipPaths.length
    };
  } finally {
    // Cleanup temporary concat file
    if (fs.existsSync(tempConcatFilePath)) {
      try {
        fs.unlinkSync(tempConcatFilePath);
      } catch (err) {
        // Ignore cleanup errors
      }
    }
  }
}
