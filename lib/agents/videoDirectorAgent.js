import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateVideoClip } from '../video/veoVideoGenerator.js';
import { assembleVideos } from '../video/videoAssembler.js';
import { PRODUCTION_TYPES } from '../utils/productionTypes.js';
import { redactApiKeys } from '../utils/appUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const VIDEOS_OUTPUT_DIR = path.join(__dirname, '../../public/videos');

/**
 * Builds an enhanced cinematic prompt for Google Veo from a storyboard shot.
 *
 * @param {Object} shot - Individual shot object from storyboard.
 * @param {string} productionType - 'creator_video' or 'short_film'.
 * @returns {string} Optimized prompt for Veo.
 */
export function buildVeoPromptFromShot(shot, productionType = PRODUCTION_TYPES.CREATOR_VIDEO) {
  if (!shot || typeof shot !== 'object') {
    return 'Cinematic scene, high quality professional cinematography.';
  }

  if (productionType === PRODUCTION_TYPES.SHORT_FILM) {
    const parts = [
      shot.slugline ? `Setting: ${shot.slugline}.` : '',
      shot.visualDescription ? `Visual: ${shot.visualDescription}.` : '',
      shot.actorAction && shot.actorAction !== 'N/A' ? `Action: ${shot.actorAction}.` : '',
      shot.cameraAngle && shot.cameraAngle !== 'N/A' ? `Camera angle: ${shot.cameraAngle}.` : '',
      shot.cameraMovement && shot.cameraMovement !== 'N/A' ? `Camera movement: ${shot.cameraMovement}.` : '',
      shot.shotSize && shot.shotSize !== 'N/A' ? `Shot size: ${shot.shotSize}.` : '',
      shot.lighting && shot.lighting !== 'N/A' ? `Lighting: ${shot.lighting}.` : '',
      'Cinematic 4K film still, photorealistic, realistic motion, professional film color grading.'
    ];

    return parts.filter(Boolean).join(' ');
  }

  // Creator Video prompt formatting
  const parts = [
    shot.shotType ? `Style: ${shot.shotType}.` : '',
    shot.visualDescription ? `Visual: ${shot.visualDescription}.` : '',
    shot.action && shot.action !== 'N/A' ? `Action: ${shot.action}.` : '',
    shot.cameraFraming && shot.cameraFraming !== 'N/A' ? `Framing: ${shot.cameraFraming}.` : '',
    shot.location && shot.location !== 'N/A' ? `Location: ${shot.location}.` : '',
    'High quality video production, clear lighting, crisp resolution, smooth motion.'
  ];

  return parts.filter(Boolean).join(' ');
}

/**
 * Normalizes a shot's duration to a valid Google Veo supported duration (4, 6, or 8 seconds).
 *
 * @param {number|string|Object} duration - Shot duration value or shot object.
 * @param {number} [defaultDuration=6] - Default fallback duration in seconds.
 * @returns {number} Supported duration (4, 6, or 8).
 */
export function normalizeShotDuration(duration, defaultDuration = 6) {
  let val = duration;
  if (typeof duration === 'object' && duration !== null) {
    val = duration.durationSeconds ?? duration.duration ?? duration.durationSec ?? duration.estimatedDuration;
  }
  if (typeof val === 'string') {
    const match = val.match(/\d+(\.\d+)?/);
    val = match ? parseFloat(match[0]) : NaN;
  }
  const num = Number(val);
  if (isNaN(num) || num <= 0) {
    return defaultDuration;
  }
  if (num <= 4) return 4;
  if (num <= 6) return 6;
  return 8;
}

/**
 * Directs and orchestrates the generation of video clips and final video assembly.
 * Supports resuming from previously generated clips, transient retry handling, and safe preservation.
 *
 * @param {Object} params
 * @param {Object} params.finalPackage - The final package containing script and storyboard.
 * @param {string} [params.topic] - Production topic title.
 * @param {Object} [params.options] - Generation options (singleClipOnly, shotIndex, maxShots, aspectRatio, forceRegenerate, productionId).
 * @param {Function} [params.onProgress] - Callback for real-time progress updates.
 * @returns {Promise<Object>} Object containing video URLs, clip details, and metadata.
 */
export async function directVideoProduction({
  finalPackage,
  topic,
  options = {},
  onProgress
}) {
  try {
    if (!finalPackage || typeof finalPackage !== 'object') {
      return {
        success: false,
        error: 'finalPackage is required for video generation.',
        step: 'validation'
      };
    }

    const pkg = finalPackage.finalPackage || finalPackage;
    const storyboard = pkg.storyboard;

    if (!storyboard || !Array.isArray(storyboard.shots) || storyboard.shots.length === 0) {
      return {
        success: false,
        error: 'A valid storyboard with at least one shot is required to generate a video.',
        step: 'validation'
      };
    }

    const productionType =
      pkg.productionType ||
      finalPackage.productionType ||
      PRODUCTION_TYPES.CREATOR_VIDEO;

    const projectTitle =
      topic ||
      storyboard.title ||
      pkg.script?.title ||
      'creatorpilot_production';

    const safeTitleSlug = projectTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    
    // Stable productionId allows resumption across sessions/clicks
    const productionId = options.productionId || pkg.productionId || `prod_${safeTitleSlug}`;

    // Ensure output directories exist
    const clipsDir = path.join(VIDEOS_OUTPUT_DIR, 'clips');
    if (!fs.existsSync(clipsDir)) {
      fs.mkdirSync(clipsDir, { recursive: true });
    }

    // Determine which shots to generate
    const allShots = storyboard.shots;
    let targetShots = [];

    if (options.singleClipOnly) {
      const shotIndex = options.shotIndex !== undefined ? options.shotIndex : 0;
      const selectedShot = allShots[shotIndex] || allShots[0];
      targetShots = [selectedShot];
    } else if (options.maxShots && options.maxShots > 0) {
      targetShots = allShots.slice(0, options.maxShots);
    } else {
      targetShots = allShots;
    }

    // Normalize each shot's duration to a Veo-supported duration (4, 6, or 8 seconds)
    // and sort strictly in ascending storyboard shot order
    targetShots = targetShots
      .map((shot, idx) => {
        const shotNumber = typeof shot.shotNumber === 'number' ? shot.shotNumber : (idx + 1);
        const normDuration = normalizeShotDuration(options.durationSeconds || shot, 6);
        return {
          ...shot,
          shotNumber,
          durationSeconds: normDuration
        };
      })
      .sort((a, b) => a.shotNumber - b.shotNumber);

    // Determine aspect ratio from format or options
    let aspectRatio = options.aspectRatio;
    if (!aspectRatio) {
      const format = String(pkg.script?.format || storyboard.format || '').toLowerCase();
      if (format.includes('short') || format.includes('tiktok') || format.includes('reel')) {
        aspectRatio = '9:16';
      } else {
        aspectRatio = '16:9';
      }
    }

    console.log(`\n====================================================`);
    console.log(`[VideoDirectorAgent] Directing production for "${projectTitle}"`);
    console.log(`  Production ID    : ${productionId}`);
    console.log(`  Total Target Shots: ${targetShots.length}`);
    console.log(`  Production Type  : ${productionType}`);
    console.log(`  Aspect Ratio     : ${aspectRatio}`);
    console.log(`====================================================`);

    const generatedClips = [];
    const clipPaths = [];
    let totalDurationSeconds = 0;

    for (let i = 0; i < targetShots.length; i++) {
      const shot = targetShots[i];
      const shotNumber = shot.shotNumber;
      const shotDuration = shot.durationSeconds;
      totalDurationSeconds += shotDuration;

      const shotPrompt = buildVeoPromptFromShot(shot, productionType);
      const clipFilename = `clip_${productionId}_shot_${shotNumber}.mp4`;
      const clipFilePath = path.join(clipsDir, clipFilename);

      if (typeof onProgress === 'function') {
        onProgress({
          stage: 'generating_clip',
          currentShot: i + 1,
          totalShots: targetShots.length,
          shotNumber,
          prompt: shotPrompt,
          durationSeconds: shotDuration
        });
      }

      console.log(`\n[VideoDirectorAgent] Processing Shot ${i + 1}/${targetShots.length} (Shot #${shotNumber}, ${shotDuration}s)...`);

      // 1. Check if exact clip or matching production shot clip already exists (Resume capability)
      let existingClipFound = null;
      if (!options.forceRegenerate) {
        if (fs.existsSync(clipFilePath) && fs.statSync(clipFilePath).size > 1024) {
          existingClipFound = clipFilePath;
        } else {
          // Check for existing valid clip matching this production slug & shot number
          try {
            const existingInDir = fs.readdirSync(clipsDir);
            const matchingClipName = existingInDir.find(f => 
              f.startsWith(`clip_prod_${safeTitleSlug}`) && 
              f.endsWith(`_shot_${shotNumber}.mp4`) && 
              fs.statSync(path.join(clipsDir, f)).size > 1024
            );
            if (matchingClipName) {
              existingClipFound = path.join(clipsDir, matchingClipName);
            }
          } catch (readDirErr) {
            // Ignore directory read errors
          }
        }
      }

      if (existingClipFound) {
        const stats = fs.statSync(existingClipFound);
        console.log(`[VideoDirectorAgent] [RESUME] Valid clip already exists for Shot #${shotNumber}: ${existingClipFound} (${(stats.size / 1024 / 1024).toFixed(2)} MB). Preserving and reusing.`);

        const finalClipPath = clipFilePath;
        if (existingClipFound !== clipFilePath) {
          // Ensure standard named file exists
          try {
            fs.copyFileSync(existingClipFound, clipFilePath);
          } catch (e) {
            // Use existing path
          }
        }

        const activePath = fs.existsSync(clipFilePath) ? clipFilePath : existingClipFound;
        const activeName = path.basename(activePath);

        generatedClips.push({
          shotNumber,
          prompt: shotPrompt,
          videoUrl: `/videos/clips/${activeName}`,
          filename: activeName,
          localPath: activePath,
          durationSeconds: shotDuration,
          preserved: true
        });

        clipPaths.push(activePath);
        continue;
      }

      // 2. Generate clip via Veo
      try {
        const result = await generateVideoClip({
          prompt: shotPrompt,
          outputPath: clipFilePath,
          shotNumber,
          options: {
            model: options.model,
            aspectRatio,
            durationSeconds: shotDuration
          },
          onProgress: (prog) => {
            if (typeof onProgress === 'function') {
              onProgress({
                stage: 'generating_clip',
                currentShot: i + 1,
                totalShots: targetShots.length,
                shotNumber,
                ...prog
              });
            }
          }
        });

        generatedClips.push({
          shotNumber,
          prompt: shotPrompt,
          videoUrl: `/videos/clips/${clipFilename}`,
          filename: clipFilename,
          localPath: clipFilePath,
          durationSeconds: shotDuration,
          operationId: result.operationId
        });

        clipPaths.push(clipFilePath);
      } catch (shotError) {
        const safeShotError = redactApiKeys(shotError.message || String(shotError));
        console.error(`[VideoDirectorAgent] Failed to generate Shot #${shotNumber}:`, safeShotError);

        const errorType = shotError.errorType || 'network_fetch_failure';
        const retryAttempts = shotError.retryAttempts || 3;
        const veoOperationCompleted = Boolean(shotError.veoOperationCompleted);
        const operationId = shotError.operationId || null;

        // Stop full video generation, but preserve all successfully generated clips so far
        return {
          success: false,
          failedStage: 'video-generation',
          failedShotNumber: shotNumber,
          errorType,
          retryAttempts,
          veoOperationCompleted,
          operationId,
          completedClipsCount: generatedClips.length,
          completedClips: generatedClips,
          clips: generatedClips,
          resumeState: {
            canResume: true,
            nextShotNumber: shotNumber,
            productionId,
            completedShotNumbers: generatedClips.map(c => c.shotNumber)
          },
          error: `Full video generation stopped at Shot #${shotNumber}: ${safeShotError}`,
          step: 'video-director-shot-failure'
        };
      }
    }

    // Only assemble the final video after ALL required shots have successfully completed
    if (generatedClips.length < targetShots.length || clipPaths.length < targetShots.length) {
      return {
        success: false,
        failedStage: 'video-generation',
        error: `Video assembly halted: Only ${generatedClips.length}/${targetShots.length} shots completed.`,
        step: 'video-director-incomplete-shots',
        completedClipsCount: generatedClips.length,
        clips: generatedClips,
        resumeState: {
          canResume: true,
          nextShotNumber: generatedClips.length + 1,
          productionId,
          completedShotNumbers: generatedClips.map(c => c.shotNumber)
        }
      };
    }

    // Assemble clips into final unified video strictly in storyboard order
    const finalFilename = `video_${productionId}.mp4`;
    const finalOutputPath = path.join(VIDEOS_OUTPUT_DIR, finalFilename);

    if (typeof onProgress === 'function') {
      onProgress({
        stage: 'assembling',
        message: `Assembling all ${clipPaths.length} video clip(s) into final MP4 with FFmpeg...`
      });
    }

    console.log(`\n[VideoDirectorAgent] All ${clipPaths.length} shots completed. Assembling in storyboard order into ${finalOutputPath}...`);

    await assembleVideos({
      clipPaths,
      outputPath: finalOutputPath
    });

    console.log(`[VideoDirectorAgent] Video production complete: ${finalOutputPath}`);

    return {
      success: true,
      videoUrl: `/videos/${finalFilename}`,
      videoPath: finalOutputPath,
      filename: finalFilename,
      topic: projectTitle,
      productionId,
      clipCount: generatedClips.length,
      totalTargetShots: targetShots.length,
      totalDurationSeconds,
      clips: generatedClips,
      productionType,
      aspectRatio
    };

  } catch (error) {
    const safeError = redactApiKeys(error.message || String(error));
    console.error('[VideoDirectorAgent] Error during video production:', safeError);
    return {
      success: false,
      error: safeError,
      step: 'video-director'
    };
  }
}
