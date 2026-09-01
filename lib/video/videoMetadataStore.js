import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const VIDEOS_DIR = path.join(__dirname, '../../public/videos');
const METADATA_DIR = path.join(VIDEOS_DIR, 'metadata');

/**
 * Ensures the metadata directory exists.
 */
function ensureMetadataDir() {
  if (!fs.existsSync(METADATA_DIR)) {
    fs.mkdirSync(METADATA_DIR, { recursive: true });
  }
}

/**
 * Generates a clean filename safe slug.
 * @param {string} str 
 * @returns {string}
 */
export function getSafeSlug(str) {
  if (!str) return 'production';
  return str.replace(/[^a-z0-9]/gi, '_').toLowerCase();
}

/**
 * Saves or updates video metadata for a production on disk.
 *
 * @param {string} productionId - Unique production identifier.
 * @param {Object} metadata - Video metadata payload.
 * @returns {Object} Saved metadata object with file validation.
 */
export function saveVideoMetadata(productionId, metadata = {}) {
  if (!productionId || typeof productionId !== 'string') {
    throw new Error('saveVideoMetadata requires a non-empty productionId string.');
  }

  ensureMetadataDir();

  const safeProdId = productionId.replace(/[^a-z0-9_-]/gi, '_');
  const metadataFilePath = path.join(METADATA_DIR, `${safeProdId}.json`);

  // Check if final video file exists on disk
  let videoPath = metadata.videoPath;
  if (!videoPath && metadata.filename) {
    videoPath = path.join(VIDEOS_DIR, metadata.filename);
  }
  const videoFileExists = Boolean(videoPath && fs.existsSync(videoPath) && fs.statSync(videoPath).size > 0);
  const videoFileSize = videoFileExists ? fs.statSync(videoPath).size : 0;

  // Check each clip existence on disk
  const validatedClips = Array.isArray(metadata.clips)
    ? metadata.clips.map(clip => {
        let clipPath = clip.localPath;
        if (!clipPath && clip.filename) {
          clipPath = path.join(VIDEOS_DIR, 'clips', clip.filename);
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
    productionId,
    topic: metadata.topic || 'Untitled Production',
    status: metadata.status || (metadata.success ? 'completed' : 'partial'),
    videoUrl: metadata.videoUrl || (metadata.filename ? `/videos/${metadata.filename}` : null),
    videoPath: videoPath || null,
    filename: metadata.filename || (videoPath ? path.basename(videoPath) : null),
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
      productionId,
      completedShotNumbers: validatedClips.map(c => c.shotNumber)
    }
  };

  fs.writeFileSync(metadataFilePath, JSON.stringify(record, null, 2), 'utf8');
  console.log(`[videoMetadataStore] Saved video metadata for ${productionId} to: ${metadataFilePath}`);

  return record;
}

/**
 * Retrieves persisted video metadata for a production.
 * Verifies on-disk file existence dynamically.
 *
 * @param {string} productionId - Unique production identifier or slug.
 * @param {string} [topic] - Optional topic title for fallback resolution.
 * @returns {Object} { hasVideo: boolean, video: Object|null, fileMissing: boolean }
 */
export function getVideoMetadata(productionId, topic) {
  ensureMetadataDir();

  const candidates = [];

  if (productionId) {
    const safeProdId = productionId.replace(/[^a-z0-9_-]/gi, '_');
    candidates.push(path.join(METADATA_DIR, `${safeProdId}.json`));
  }

  if (topic) {
    const safeTopicSlug = getSafeSlug(topic);
    candidates.push(path.join(METADATA_DIR, `prod_${safeTopicSlug}.json`));
  }

  // Look for any existing metadata file matching candidate paths
  for (const metaPath of candidates) {
    if (fs.existsSync(metaPath)) {
      try {
        const raw = fs.readFileSync(metaPath, 'utf8');
        const meta = JSON.parse(raw);

        // Dynamically verify if the video file is still present on disk
        let videoPath = meta.videoPath;
        if (!videoPath && meta.filename) {
          videoPath = path.join(VIDEOS_DIR, meta.filename);
        }
        const videoFileExists = Boolean(videoPath && fs.existsSync(videoPath) && fs.statSync(videoPath).size > 0);
        const videoFileSize = videoFileExists ? fs.statSync(videoPath).size : 0;

        // Dynamically verify clips
        const clips = Array.isArray(meta.clips)
          ? meta.clips.map(clip => {
              let clipPath = clip.localPath;
              if (!clipPath && clip.filename) {
                clipPath = path.join(VIDEOS_DIR, 'clips', clip.filename);
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

  // Fallback: Check if an assembled video file or clips exist on disk matching this topic/productionId
  if (topic || productionId) {
    const slug = getSafeSlug(topic || productionId);
    try {
      const files = fs.readdirSync(VIDEOS_DIR);
      const matchingVideo = files.find(f => f.startsWith(`video_prod_${slug}`) && f.endsWith('.mp4') && fs.statSync(path.join(VIDEOS_DIR, f)).size > 0);

      if (matchingVideo) {
        const videoPath = path.join(VIDEOS_DIR, matchingVideo);
        const stats = fs.statSync(videoPath);

        // Find matching clips
        const clipsDir = path.join(VIDEOS_DIR, 'clips');
        let clips = [];
        if (fs.existsSync(clipsDir)) {
          const clipFiles = fs.readdirSync(clipsDir).filter(f => f.startsWith(`clip_prod_${slug}`) && f.endsWith('.mp4'));
          clips = clipFiles.map((cf, idx) => {
            const cp = path.join(clipsDir, cf);
            return {
              shotNumber: idx + 1,
              filename: cf,
              videoUrl: `/videos/clips/${cf}`,
              localPath: cp,
              exists: true,
              fileSize: fs.statSync(cp).size
            };
          });
        }

        const reconstructed = saveVideoMetadata(productionId || `prod_${slug}`, {
          topic: topic || 'Recovered Production',
          status: 'completed',
          filename: matchingVideo,
          videoPath,
          videoUrl: `/videos/${matchingVideo}`,
          clips
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
