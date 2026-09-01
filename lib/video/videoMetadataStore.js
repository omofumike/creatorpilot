import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const VIDEOS_DIR = path.join(__dirname, '../../public/videos');
export const CLIPS_DIR = path.join(VIDEOS_DIR, 'clips');
export const METADATA_DIR = path.join(VIDEOS_DIR, 'metadata');
export const FINAL_DIR = path.join(VIDEOS_DIR, 'final');

/**
 * Ensures all required video asset directories exist on disk.
 * Must never fail or throw if directories already exist or need creation.
 */
export function ensureVideoDirectories() {
  const dirs = [VIDEOS_DIR, CLIPS_DIR, METADATA_DIR, FINAL_DIR];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      try {
        fs.mkdirSync(dir, { recursive: true });
      } catch (err) {
        console.warn(`[videoMetadataStore] Could not create directory ${dir}:`, err.message);
      }
    }
  }
}

/**
 * Generates a short, collision-resistant production ID.
 * Format: production-${Date.now()}-${randomShortId}
 * Example: production-1788261279531-s05osv
 * 
 * Never uses the user prompt or topic to construct IDs.
 *
 * @returns {string} Safe, short production ID.
 */
export function generateProductionId() {
  const timestamp = Date.now();
  const randomShortId = Math.random().toString(36).substring(2, 8);
  return `production-${timestamp}-${randomShortId}`;
}

/**
 * Sanitizes a production ID to ensure it is safe for filesystem paths.
 * If the ID is too long (e.g. from an old topic prompt slug) or malformed,
 * normalizes or replaces it with a clean production ID.
 *
 * @param {string} id - Raw production ID string.
 * @returns {string} Clean, safe production ID.
 */
export function sanitizeProductionId(id) {
  if (!id || typeof id !== 'string') {
    return generateProductionId();
  }

  // If the ID is an excessively long slug from an old prompt (over 50 chars), generate a clean short ID
  if (id.length > 50 || id.startsWith('prod_create_') || id.startsWith('prod_write_')) {
    return generateProductionId();
  }

  const sanitized = id.replace(/[^a-z0-9_-]/gi, '_');
  return sanitized.length > 0 ? sanitized : generateProductionId();
}

/**
 * Generates a clean filename safe slug (max 30 chars).
 * @param {string} str 
 * @returns {string}
 */
export function getSafeSlug(str) {
  if (!str) return 'production';
  return str.replace(/[^a-z0-9]/gi, '_').toLowerCase().substring(0, 30);
}

/**
 * Saves or updates video metadata for a production on disk.
 *
 * @param {string} productionId - Unique production identifier.
 * @param {Object} metadata - Video metadata payload.
 * @returns {Object} Saved metadata object with file validation.
 */
export function saveVideoMetadata(productionId, metadata = {}) {
  ensureVideoDirectories();

  const safeProdId = sanitizeProductionId(productionId);
  const metadataFilePath = path.join(METADATA_DIR, `${safeProdId}.json`);

  // Locate final video file on disk
  let videoPath = metadata.videoPath;
  if (!videoPath && metadata.filename) {
    const candidatePaths = [
      path.join(VIDEOS_DIR, metadata.filename),
      path.join(FINAL_DIR, metadata.filename)
    ];
    for (const cp of candidatePaths) {
      if (fs.existsSync(cp)) {
        videoPath = cp;
        break;
      }
    }
    if (!videoPath) {
      videoPath = path.join(VIDEOS_DIR, metadata.filename);
    }
  }

  const videoFileExists = Boolean(videoPath && fs.existsSync(videoPath) && fs.statSync(videoPath).size > 0);
  const videoFileSize = videoFileExists ? fs.statSync(videoPath).size : 0;

  // Validate each clip on disk
  const validatedClips = Array.isArray(metadata.clips)
    ? metadata.clips.map(clip => {
        let clipPath = clip.localPath;
        if (!clipPath && clip.filename) {
          clipPath = path.join(CLIPS_DIR, clip.filename);
        }
        const exists = Boolean(clipPath && fs.existsSync(clipPath) && fs.statSync(clipPath).size > 0);
        const fileSize = exists ? fs.statSync(clipPath).size : 0;
        return {
          ...clip,
          localPath: clipPath,
          exists,
          fileSize
        };
      })
    : [];

  const record = {
    productionId: safeProdId,
    topic: metadata.topic || 'Untitled Production',
    status: metadata.status || (metadata.success ? 'completed' : 'partial'),
    videoUrl: metadata.videoUrl || (metadata.filename ? `/videos/${metadata.filename}` : null),
    videoPath: videoPath || null,
    filename: metadata.filename || (videoPath ? path.basename(videoPath) : `${safeProdId}-final.mp4`),
    videoFileExists,
    videoFileSize,
    aspectRatio: metadata.aspectRatio || '16:9',
    productionType: metadata.productionType || 'creator_video',
    totalDurationSeconds: metadata.totalDurationSeconds || 0,
    totalTargetShots: metadata.totalTargetShots || validatedClips.length,
    clipCount: validatedClips.length,
    failedShotNumber: metadata.failedShotNumber || null,
    error: metadata.error || null,
    errorType: metadata.errorType || null,
    retryAttempts: metadata.retryAttempts || null,
    veoOperationCompleted: metadata.veoOperationCompleted || null,
    operationId: metadata.operationId || null,
    generationTimestamp: metadata.generationTimestamp || new Date().toISOString(),
    clips: validatedClips,
    resumeState: metadata.resumeState || {
      canResume: !metadata.success,
      nextShotNumber: metadata.failedShotNumber || (validatedClips.length + 1),
      productionId: safeProdId,
      completedShotNumbers: validatedClips.map(c => c.shotNumber)
    }
  };

  try {
    fs.writeFileSync(metadataFilePath, JSON.stringify(record, null, 2), 'utf8');
    console.log(`[videoMetadataStore] Saved video metadata for ${safeProdId} to: ${metadataFilePath}`);
  } catch (writeErr) {
    console.warn(`[videoMetadataStore] Could not write metadata file: ${writeErr.message}`);
  }

  return record;
}

/**
 * Retrieves persisted video metadata for a production.
 * Verifies on-disk file existence dynamically.
 *
 * @param {string} productionId - Unique production identifier.
 * @param {string} [topic] - Optional topic title for fallback resolution.
 * @returns {Object} { hasVideo: boolean, video: Object|null, fileMissing: boolean }
 */
export function getVideoMetadata(productionId, topic) {
  ensureVideoDirectories();

  const safeProdId = productionId ? productionId.replace(/[^a-z0-9_-]/gi, '_') : null;
  const candidates = [];

  if (safeProdId) {
    candidates.push(path.join(METADATA_DIR, `${safeProdId}.json`));
  }

  // Look for existing metadata file matching candidate paths
  for (const metaPath of candidates) {
    if (fs.existsSync(metaPath)) {
      try {
        const raw = fs.readFileSync(metaPath, 'utf8');
        const meta = JSON.parse(raw);

        // Dynamically verify if the final video file is still present on disk
        let videoPath = meta.videoPath;
        if (!videoPath && meta.filename) {
          const candidatePaths = [
            path.join(VIDEOS_DIR, meta.filename),
            path.join(FINAL_DIR, meta.filename)
          ];
          for (const cp of candidatePaths) {
            if (fs.existsSync(cp)) {
              videoPath = cp;
              break;
            }
          }
          if (!videoPath) {
            videoPath = path.join(VIDEOS_DIR, meta.filename);
          }
        }

        const videoFileExists = Boolean(videoPath && fs.existsSync(videoPath) && fs.statSync(videoPath).size > 0);
        const videoFileSize = videoFileExists ? fs.statSync(videoPath).size : 0;

        // Dynamically verify clips
        const clips = Array.isArray(meta.clips)
          ? meta.clips.map(clip => {
              let clipPath = clip.localPath;
              if (!clipPath && clip.filename) {
                clipPath = path.join(CLIPS_DIR, clip.filename);
              }
              const exists = Boolean(clipPath && fs.existsSync(clipPath) && fs.statSync(clipPath).size > 0);
              const fileSize = exists ? fs.statSync(clipPath).size : 0;
              return {
                ...clip,
                localPath: clipPath,
                exists,
                fileSize
              };
            })
          : [];

        const updatedMeta = {
          ...meta,
          videoPath,
          videoFileExists,
          videoFileSize,
          clips
        };

        return {
          success: true,
          hasVideo: true,
          fileMissing: !videoFileExists && meta.status === 'completed',
          video: updatedMeta
        };
      } catch (err) {
        console.warn(`[videoMetadataStore] Error parsing metadata at ${metaPath}:`, err.message);
      }
    }
  }

  // Fallback: Check if an assembled video file exists on disk matching this safe productionId
  if (safeProdId) {
    try {
      const files = fs.readdirSync(VIDEOS_DIR);
      const matchingVideo = files.find(f => 
        (f === `${safeProdId}-final.mp4` || f === `video_${safeProdId}.mp4` || f.startsWith(safeProdId)) && 
        f.endsWith('.mp4') && 
        fs.statSync(path.join(VIDEOS_DIR, f)).size > 0
      );

      if (matchingVideo) {
        const videoPath = path.join(VIDEOS_DIR, matchingVideo);
        const reconstructed = saveVideoMetadata(safeProdId, {
          topic: topic || 'Recovered Production',
          status: 'completed',
          filename: matchingVideo,
          videoPath,
          videoUrl: `/videos/${matchingVideo}`,
          clips: []
        });

        return {
          success: true,
          hasVideo: true,
          fileMissing: false,
          video: reconstructed
        };
      }
    } catch (scanErr) {
      // Ignore scan error
    }
  }

  return {
    success: true,
    hasVideo: false,
    video: null,
    fileMissing: false
  };
}
