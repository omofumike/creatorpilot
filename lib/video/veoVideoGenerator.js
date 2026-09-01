import fs from 'fs';
import path from 'path';
import { GoogleAuth } from 'google-auth-library';
import { ai } from '../utils/gemini.js';
import { config } from '../utils/config.js';
import { redactApiKeys } from '../utils/appUtils.js';

const DEFAULT_VEO_MODEL = process.env.VEO_MODEL || 'veo-3.1-generate-001';
const POLLING_INTERVAL_MS = 8000;
const MAX_POLLING_DURATION_MS = 10 * 60 * 1000; // 10 minutes
const MAX_TRANSIENT_ATTEMPTS = 3;
const MAX_DOWNLOAD_ATTEMPTS = 3;
const DOWNLOAD_TIMEOUT_MS = 180000; // 3 minutes timeout for large MP4 files

/**
 * Returns the current video generation mode ('real').
 *
 * @returns {'real'|'mock'}
 */
export function getVideoGenerationMode() {
  const raw = process.env.VIDEO_GENERATION_MODE || config.videoGenerationMode || 'real';
  return String(raw).toLowerCase().trim() === 'mock' ? 'mock' : 'real';
}

/**
 * Classifies an error from Google Veo / GenAI API.
 * Distinguishes transient code 13 internal errors and network/fetch failures
 * from permanent request/validation/quota/auth/policy errors.
 *
 * @param {Object|Error} error - Error object from operation or API call.
 * @returns {{ shouldRetry: boolean, isTransient: boolean, reason: string, errorType: string, code: number|string|null, operationId: string|null }}
 */
export function classifyVeoError(error) {
  if (!error) {
    return { shouldRetry: false, isTransient: false, reason: 'Unknown error', errorType: 'unknown', code: null, operationId: null };
  }

  const errObj = error.error || error;
  const code = errObj.code !== undefined ? errObj.code : (errObj.status !== undefined ? errObj.status : (error.code || null));
  const causeMsg = error.cause ? String(error.cause.message || error.cause) : '';
  const causeCode = error.cause?.code ? String(error.cause.code) : '';
  const message = String(errObj.message || error.message || JSON.stringify(errObj));
  const combined = `${message} ${causeMsg} ${causeCode} ${String(error.name || '')}`.toLowerCase();
  const operationId = errObj['Operation ID'] || errObj.operationId || error.operationId || errObj.name || error.name || null;

  // 1. Permanent: Quota / Resource Exhausted
  if (code === 8 || code === 429 || combined.includes('resource_exhausted') || combined.includes('quota') || combined.includes('rate limit')) {
    return { shouldRetry: false, isTransient: false, reason: 'Quota / Resource Exhausted', errorType: 'quota_exhausted', code: code || 8, operationId };
  }

  // 2. Permanent: Authentication / Permission Denied
  if (code === 7 || code === 16 || code === 401 || code === 403 || combined.includes('permission_denied') || combined.includes('unauthenticated')) {
    return { shouldRetry: false, isTransient: false, reason: 'Authentication / Permission Denied', errorType: 'auth_error', code: code || 7, operationId };
  }

  // 3. Permanent: Content Policy / Safety Filter
  if (combined.includes('safety') || combined.includes('content policy') || combined.includes('blocked') || combined.includes('prohibited') || combined.includes('policy')) {
    return { shouldRetry: false, isTransient: false, reason: 'Content Policy / Safety Violation', errorType: 'safety_violation', code: code || 'SAFETY', operationId };
  }

  // 4. Permanent: Invalid Argument / Validation Error
  if (code === 3 || code === 400 || combined.includes('invalid_argument') || combined.includes('bad request') || combined.includes('invalid argument')) {
    return { shouldRetry: false, isTransient: false, reason: 'Invalid Argument / Validation Error', errorType: 'invalid_argument', code: code || 3, operationId };
  }

  // 5. Transient: Network / Fetch failures (fetch failed, ECONNRESET, ETIMEDOUT, ECONNREFUSED, socket errors, DNS, premature close)
  if (
    combined.includes('fetch failed') ||
    combined.includes('econnreset') ||
    combined.includes('etimedout') ||
    combined.includes('econnrefused') ||
    combined.includes('socket') ||
    combined.includes('network') ||
    combined.includes('undici') ||
    combined.includes('enotfound') ||
    combined.includes('eai_again') ||
    combined.includes('premature close') ||
    combined.includes('ehostunreach') ||
    combined.includes('enetunreach') ||
    combined.includes('aborterror') ||
    combined.includes('timeout') ||
    combined.includes('deadline') ||
    combined.includes('unavailable') ||
    code === 14 ||
    code === 4 ||
    code === 'ECONNRESET' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNREFUSED'
  ) {
    return { shouldRetry: true, isTransient: true, reason: 'Network / Fetch Failure', errorType: 'network_fetch_failure', code: code || 'NETWORK_FETCH_ERROR', operationId };
  }

  // 6. Transient: Code 13 Internal Error ("Internal error. Please try again later.")
  if (code === 13 || code === '13' || combined.includes('internal error')) {
    return { shouldRetry: true, isTransient: true, reason: 'Internal Error (Code 13)', errorType: 'internal_error_13', code: 13, operationId };
  }

  // Default: Treat unclassified errors as non-retryable
  return { shouldRetry: false, isTransient: false, reason: `Unclassified error (code: ${code})`, errorType: 'unclassified_error', code, operationId };
}

/**
 * Safely extracts video buffer from any supported @google/genai SDK video format.
 *
 * @param {Object|Buffer|Uint8Array|string} generatedVideo - The generated video or wrapper object.
 * @returns {Buffer|null} Extracted video buffer or null if not directly extractable.
 */
export function extractVideoBuffer(generatedVideo) {
  if (!generatedVideo) return null;

  // 1. Direct Buffer / Uint8Array / ArrayBuffer
  if (Buffer.isBuffer(generatedVideo)) {
    return generatedVideo;
  }
  if (generatedVideo instanceof Uint8Array || generatedVideo instanceof ArrayBuffer) {
    return Buffer.from(generatedVideo);
  }

  // 2. Direct base64 string
  if (typeof generatedVideo === 'string') {
    const cleaned = generatedVideo.replace(/^data:video\/[a-zA-Z0-9]+;base64,/, '').trim();
    if (cleaned.length > 0) {
      try {
        const buf = Buffer.from(cleaned, 'base64');
        if (buf.length > 0) return buf;
      } catch (err) {
        // Not a base64 string
      }
    }
  }

  // 3. Inspect common properties on generatedVideo and generatedVideo.video
  const candidates = [
    generatedVideo?.video?.videoBytes,
    generatedVideo?.video?.bytesBase64Encoded,
    generatedVideo?.videoBytes,
    generatedVideo?.bytesBase64Encoded,
    generatedVideo?.video?.data,
    generatedVideo?.data,
    generatedVideo?.video?._bytes,
    generatedVideo?._bytes
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;

    if (Buffer.isBuffer(candidate)) {
      return candidate;
    }
    if (candidate instanceof Uint8Array || candidate instanceof ArrayBuffer) {
      return Buffer.from(candidate);
    }
    if (typeof candidate === 'string') {
      const cleaned = candidate.replace(/^data:video\/[a-zA-Z0-9]+;base64,/, '').trim();
      if (cleaned.length > 0) {
        try {
          const buf = Buffer.from(cleaned, 'base64');
          if (buf.length > 0) return buf;
        } catch (err) {
          // Not base64
        }
      }
    }
  }

  // 4. Deep search inside object properties
  if (typeof generatedVideo === 'object') {
    for (const [key, val] of Object.entries(generatedVideo)) {
      if (!val || typeof val !== 'object') continue;
      if (Buffer.isBuffer(val)) return val;
      if (val instanceof Uint8Array || val instanceof ArrayBuffer) return Buffer.from(val);
      if (val.videoBytes || val.bytesBase64Encoded || val.data) {
        const nested = extractVideoBuffer(val);
        if (nested && nested.length > 0) return nested;
      }
    }
  }

  return null;
}

/**
 * Downloads or saves the generated video to the target output path using returned video object/URI.
 * Supports inline video buffer, GenAI SDK file download, HTTP/HTTPS fetch, and authenticated GCS fetch.
 *
 * @param {Object} generatedVideo - The generated video object from the Veo API response.
 * @param {string} outputPath - Target absolute destination path for the video file.
 * @returns {Promise<void>}
 */
export async function saveVideoFile(generatedVideo, outputPath) {
  const targetDir = path.dirname(outputPath);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  // 1. Try direct video buffer extraction (e.g. video.videoBytes or bytesBase64Encoded from @google/genai SDK)
  const buffer = extractVideoBuffer(generatedVideo);
  if (buffer && buffer.length > 0) {
    fs.writeFileSync(outputPath, buffer);
    console.log(`[veoVideoGenerator] Extracted inline video buffer (${(buffer.length / 1024 / 1024).toFixed(2)} MB) to: ${outputPath}`);
    return;
  }

  // 2. Try using the GenAI SDK file downloader (ai.files.download)
  if (ai.files && typeof ai.files.download === 'function') {
    const downloadTargets = [
      generatedVideo,
      generatedVideo?.video,
      generatedVideo?.name,
      generatedVideo?.video?.name
    ].filter(Boolean);

    for (const target of downloadTargets) {
      try {
        console.log(`[veoVideoGenerator] Attempting download via GenAI SDK files.download...`);
        await ai.files.download({
          file: target,
          downloadPath: outputPath
        });

        if (fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
          const stats = fs.statSync(outputPath);
          console.log(`[veoVideoGenerator] Downloaded ${(stats.size / 1024 / 1024).toFixed(2)} MB via GenAI SDK files.download.`);
          return;
        }
      } catch (sdkDownloadErr) {
        console.warn('[veoVideoGenerator] GenAI SDK files.download attempt skipped/failed:', sdkDownloadErr.message);
      }
    }
  }

  // 3. Try URI download (HTTP / HTTPS / GCS URI) with dedicated retry loop and generous timeouts
  const videoUri =
    generatedVideo?.video?.uri ||
    generatedVideo?.uri ||
    generatedVideo?.video?.gcsUri ||
    generatedVideo?.gcsUri ||
    generatedVideo?.video?.downloadUrl ||
    generatedVideo?.downloadUrl ||
    generatedVideo?.video?.url ||
    generatedVideo?.url;

  if (videoUri && typeof videoUri === 'string') {
    console.log(`[veoVideoGenerator] Video URI retrieved: ${videoUri.substring(0, 100)}...`);

    let googleAuthClient = null;
    try {
      const auth = new GoogleAuth({
        scopes: ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/devstorage.read_only']
      });
      googleAuthClient = await auth.getClient();
    } catch (authInitErr) {
      console.warn('[veoVideoGenerator] GoogleAuth init note:', authInitErr.message);
    }

    for (let dlAttempt = 1; dlAttempt <= MAX_DOWNLOAD_ATTEMPTS; dlAttempt++) {
      try {
        console.log(`[veoVideoGenerator] Downloading video (attempt ${dlAttempt}/${MAX_DOWNLOAD_ATTEMPTS}) from URI...`);

        // Standard HTTP / HTTPS URL
        if (videoUri.startsWith('http://') || videoUri.startsWith('https://')) {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

          let response;
          try {
            // First try unauthenticated fetch
            response = await fetch(videoUri, { signal: controller.signal });
            // If forbidden/unauthorized, try authenticated fetch with Google Cloud credentials
            if ((response.status === 401 || response.status === 403) && googleAuthClient) {
              const authHeaders = await googleAuthClient.getRequestHeaders();
              response = await fetch(videoUri, { headers: authHeaders, signal: controller.signal });
            }
          } finally {
            clearTimeout(timeoutId);
          }

          if (!response.ok) {
            throw new Error(`Failed to download video from HTTP URI: ${response.status} ${response.statusText}`);
          }
          const arrayBuffer = await response.arrayBuffer();
          const downloadedBuffer = Buffer.from(arrayBuffer);

          if (downloadedBuffer.length === 0) {
            throw new Error('Downloaded empty video buffer (0 bytes).');
          }

          fs.writeFileSync(outputPath, downloadedBuffer);
          console.log(`[veoVideoGenerator] Successfully downloaded ${(downloadedBuffer.length / 1024 / 1024).toFixed(2)} MB to ${outputPath}`);
          return;
        }

        // Google Cloud Storage gs:// URI
        if (videoUri.startsWith('gs://')) {
          const gcsMatch = videoUri.match(/^gs:\/\/([^\/]+)\/(.+)$/);
          if (gcsMatch) {
            const [, bucket, objectPath] = gcsMatch;
            const publicHttpsUrl = `https://storage.googleapis.com/${bucket}/${objectPath}`;
            const apiMediaUrl = `https://storage.googleapis.com/storage/v1/b/${encodeURIComponent(bucket)}/o/${encodeURIComponent(objectPath)}?alt=media`;

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

            let gcsResponse;
            try {
              let headers = {};
              if (googleAuthClient) {
                headers = await googleAuthClient.getRequestHeaders();
              }
              // Try direct GCS API media URL first, then public HTTPS
              gcsResponse = await fetch(apiMediaUrl, { headers, signal: controller.signal });
              if (!gcsResponse.ok) {
                gcsResponse = await fetch(publicHttpsUrl, { headers, signal: controller.signal });
              }
            } finally {
              clearTimeout(timeoutId);
            }

            if (gcsResponse.ok) {
              const arrayBuffer = await gcsResponse.arrayBuffer();
              const downloadedBuffer = Buffer.from(arrayBuffer);
              if (downloadedBuffer.length > 0) {
                fs.writeFileSync(outputPath, downloadedBuffer);
                console.log(`[veoVideoGenerator] Downloaded ${(downloadedBuffer.length / 1024 / 1024).toFixed(2)} MB from GCS storage endpoint.`);
                return;
              }
            } else {
              throw new Error(`GCS fetch failed: HTTP ${gcsResponse.status} ${gcsResponse.statusText}`);
            }
          }
        }
      } catch (dlErr) {
        console.warn(`[veoVideoGenerator] Video download attempt ${dlAttempt}/${MAX_DOWNLOAD_ATTEMPTS} failed:`, dlErr.message);
        if (dlAttempt < MAX_DOWNLOAD_ATTEMPTS) {
          const backoffMs = dlAttempt * 4000;
          console.log(`[veoVideoGenerator] Retrying video download in ${backoffMs / 1000}s...`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
          continue;
        }
        throw dlErr;
      }
    }
  }

  // 4. Verify file existence after all extraction attempts
  if (!fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
    const diagnosticSummary = {
      hasGeneratedVideo: Boolean(generatedVideo),
      keys: generatedVideo ? Object.keys(generatedVideo) : [],
      videoKeys: generatedVideo?.video ? Object.keys(generatedVideo.video) : [],
      hasVideoBytes: Boolean(generatedVideo?.video?.videoBytes || generatedVideo?.videoBytes || generatedVideo?.video?.bytesBase64Encoded),
      hasUri: Boolean(generatedVideo?.video?.uri || generatedVideo?.uri || generatedVideo?.video?.gcsUri || generatedVideo?.gcsUri)
    };
    throw new Error(`Unable to extract and save video bytes from the Veo API response. Diagnostic: ${JSON.stringify(diagnosticSummary)}`);
  }
}

/**
 * Polls the long-running Veo video generation operation until completion.
 * Handles transient network polling errors gracefully without crashing.
 * Waits until operation.done === true before returning.
 *
 * @param {Object} initialOperation - The operation returned from generateVideos.
 * @param {Function} [onProgress] - Optional progress notification callback.
 * @returns {Promise<Object>} The completed operation object.
 */
async function pollVideoOperation(initialOperation, onProgress) {
  let operation = initialOperation;
  const startTime = Date.now();
  let consecutiveNetworkErrors = 0;
  const MAX_CONSECUTIVE_POLL_ERRORS = 5;

  console.log(`[veoVideoGenerator] Starting operation polling: ${operation.name || 'pending'}`);

  while (!operation.done) {
    const elapsedMs = Date.now() - startTime;
    if (elapsedMs > MAX_POLLING_DURATION_MS) {
      throw new Error(`Video generation timed out after ${Math.round(elapsedMs / 1000)} seconds. Operation ID: ${operation.name || 'unknown'}`);
    }

    if (typeof onProgress === 'function') {
      onProgress({
        status: 'generating',
        elapsedSeconds: Math.round(elapsedMs / 1000),
        operationName: operation.name
      });
    }

    await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL_MS));

    try {
      if (ai.operations && typeof ai.operations.getVideosOperation === 'function') {
        operation = await ai.operations.getVideosOperation({ operation });
      } else if (ai.operations && typeof ai.operations.get === 'function') {
        operation = await ai.operations.get({ operation });
      } else {
        throw new Error('No operation polling method available in GenAI SDK.');
      }
      consecutiveNetworkErrors = 0;
    } catch (pollErr) {
      const classification = classifyVeoError(pollErr);
      if (classification.isTransient && consecutiveNetworkErrors < MAX_CONSECUTIVE_POLL_ERRORS) {
        consecutiveNetworkErrors++;
        console.warn(`[veoVideoGenerator] Transient network error during operation poll (attempt ${consecutiveNetworkErrors}/${MAX_CONSECUTIVE_POLL_ERRORS}): ${pollErr.message}. Retrying poll...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
        continue;
      }
      throw pollErr;
    }
  }

  // Complete operation status logging when done === true
  console.log('[veoVideoGenerator] Operation completed (done === true):');
  console.log(`  Operation Name/ID: ${operation.name || 'unknown'}`);
  console.log(`  Done: ${operation.done}`);
  if (operation.error) {
    console.log(`  Operation Error: ${JSON.stringify(operation.error, null, 2)}`);
  }
  if (operation.response) {
    console.log(`  Operation Response Keys: [${Object.keys(operation.response).join(', ')}]`);
  }

  return operation;
}

/**
 * Generates a single video clip using Google Veo video generation.
 * Handles transient Veo code: 13 errors, network/fetch errors, and download failures with retry.
 * Never creates fake/mock videos or falls back to mock generator.
 *
 * @param {Object} params
 * @param {string} params.prompt - Visual description and cinematic instructions for the clip.
 * @param {string} params.outputPath - Target output path for the saved MP4 clip.
 * @param {number} [params.shotNumber=1] - Storyboard shot number for logging.
 * @param {Object} [params.options] - Generation options (aspectRatio, durationSeconds, model).
 * @param {Function} [params.onProgress] - Optional progress callback.
 * @returns {Promise<{ success: boolean, outputPath: string, filename: string, prompt: string, shotNumber: number, operationId: string }>}
 */
export async function generateVideoClip({ prompt, outputPath, shotNumber = 1, options = {}, onProgress }) {
  if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
    throw new Error('generateVideoClip requires a non-empty prompt string.');
  }

  if (!outputPath || typeof outputPath !== 'string') {
    throw new Error('generateVideoClip requires a valid outputPath string.');
  }

  const model = options.model || DEFAULT_VEO_MODEL;
  const aspectRatio = options.aspectRatio || '16:9';

  // Google Veo text_to_video supports [4, 6, 8] seconds
  const allowedDurations = [4, 6, 8];
  let durationSeconds = options.durationSeconds ? Number(options.durationSeconds) : 6;
  if (!allowedDurations.includes(durationSeconds)) {
    if (durationSeconds <= 4) durationSeconds = 4;
    else if (durationSeconds <= 6) durationSeconds = 6;
    else durationSeconds = 8;
  }

  const generateConfig = {
    aspectRatio,
    durationSeconds,
    numberOfVideos: 1
  };

  const generateParams = {
    model,
    source: { prompt: prompt.trim() },
    config: generateConfig
  };

  let lastOperationId = 'unknown';
  let veoOperationCompleted = false;

  for (let attempt = 1; attempt <= MAX_TRANSIENT_ATTEMPTS; attempt++) {
    // 1. Log exact model, configuration, shot number and sanitized prompt before each request
    console.log('\n====================================================');
    console.log(`[veoVideoGenerator] Starting Google Veo Request for Shot #${shotNumber} (Attempt ${attempt}/${MAX_TRANSIENT_ATTEMPTS})`);
    console.log(`  Veo Model          : ${model}`);
    console.log(`  Generation Config  : ${JSON.stringify(generateConfig)}`);
    console.log(`  Shot Number        : #${shotNumber}`);
    console.log(`  Sanitized Prompt   : "${redactApiKeys(prompt.trim())}"`);
    console.log(`  Target Output Path : ${outputPath}`);
    console.log('====================================================');

    try {
      const initialOperation = await ai.models.generateVideos(generateParams);

      if (!initialOperation) {
        throw new Error('Veo API returned an empty operation response.');
      }

      lastOperationId = initialOperation.name || 'pending';
      console.log(`[veoVideoGenerator] Operation initialized: ${lastOperationId}`);

      const completedOperation = await pollVideoOperation(initialOperation, onProgress);
      lastOperationId = completedOperation.name || lastOperationId;
      veoOperationCompleted = Boolean(completedOperation.done && !completedOperation.error);

      // Handle operation failure inside the completed operation
      if (completedOperation.error) {
        const errorObj = completedOperation.error;
        const classification = classifyVeoError(errorObj);
        const opId = completedOperation.name || errorObj['Operation ID'] || errorObj.operationId || lastOperationId;

        console.error(`[veoVideoGenerator] Operation finished with error on Shot #${shotNumber}:`, {
          error: errorObj,
          classification,
          operationId: opId
        });

        if (classification.shouldRetry && attempt < MAX_TRANSIENT_ATTEMPTS) {
          const backoffMs = attempt * 6000;
          console.warn(`[veoVideoGenerator] Retrying transient error (${classification.reason}) for Shot #${shotNumber} in ${backoffMs / 1000}s (Attempt ${attempt + 1}/${MAX_TRANSIENT_ATTEMPTS})... Operation ID: ${opId}`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
          continue;
        }

        // Permanent failure or max attempts reached
        const errMsg = JSON.stringify(errorObj);
        const permErr = new Error(`Veo generation operation failed for Shot #${shotNumber} [Operation ID: ${opId}]: ${errMsg}`);
        permErr.operationId = opId;
        permErr.errorType = classification.errorType;
        permErr.veoOperationCompleted = false;
        throw permErr;
      }

      // Extract generated videos
      const generatedVideos =
        completedOperation.response?.generatedVideos ||
        completedOperation.response?.videos ||
        completedOperation.response?.generatedSamples ||
        completedOperation.result?.generatedVideos ||
        completedOperation.result?.videos;

      if (!Array.isArray(generatedVideos) || generatedVideos.length === 0) {
        throw new Error(`Veo generation finished but no generated videos were found in response for Shot #${shotNumber}. [Operation ID: ${lastOperationId}]`);
      }

      console.log(`[veoVideoGenerator] Shot #${shotNumber}: Found ${generatedVideos.length} video item(s). Saving to disk...`);

      const firstVideo = generatedVideos[0];
      await saveVideoFile(firstVideo, outputPath);

      const stats = fs.statSync(outputPath);
      console.log(`[veoVideoGenerator] Shot #${shotNumber} successfully saved and validated: ${outputPath} (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);

      return {
        success: true,
        outputPath,
        filename: path.basename(outputPath),
        source: { prompt: prompt.trim() },
        shotNumber,
        operationId: lastOperationId
      };

    } catch (error) {
      const classification = classifyVeoError(error);
      const safeError = redactApiKeys(error.message || String(error));
      const opId = classification.operationId || lastOperationId;

      console.error(`[veoVideoGenerator] Error on Shot #${shotNumber} (Attempt ${attempt}/${MAX_TRANSIENT_ATTEMPTS}):`, safeError);

      if (classification.shouldRetry && attempt < MAX_TRANSIENT_ATTEMPTS) {
        const backoffMs = attempt * 6000;
        console.warn(`[veoVideoGenerator] Retrying transient error (${classification.reason}) for Shot #${shotNumber} in ${backoffMs / 1000}s (Attempt ${attempt + 1}/${MAX_TRANSIENT_ATTEMPTS})... Operation ID: ${opId}`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
        continue;
      }

      // Permanent error or retries exhausted
      const finalErr = new Error(`Shot #${shotNumber} failed: ${safeError}`);
      finalErr.operationId = opId;
      finalErr.errorType = classification.errorType;
      finalErr.veoOperationCompleted = veoOperationCompleted;
      finalErr.retryAttempts = attempt;
      throw finalErr;
    }
  }

  const exhaustedErr = new Error(`Shot #${shotNumber} failed after ${MAX_TRANSIENT_ATTEMPTS} attempts. [Operation ID: ${lastOperationId}]`);
  exhaustedErr.operationId = lastOperationId;
  exhaustedErr.errorType = 'retries_exhausted';
  exhaustedErr.veoOperationCompleted = veoOperationCompleted;
  exhaustedErr.retryAttempts = MAX_TRANSIENT_ATTEMPTS;
  throw exhaustedErr;
}

/**
 * Convenience helper to generate a single video clip.
 */
export async function generateSingleClip(prompt, outputPath, options = {}, onProgress) {
  return generateVideoClip({ prompt, outputPath, shotNumber: 1, options, onProgress });
}

