import Parallel from 'parallel-web';
import { config } from '../utils/config.js';
import { redactApiKeys } from '../utils/appUtils.js';

/**
 * Safe diagnostic logging for Parallel Search requests.
 * NEVER logs API keys, tokens, or .env values.
 *
 * @param {'info' | 'warn' | 'error'} level - Log severity level.
 * @param {string} message - Human-readable diagnostic message.
 * @param {Object} [details] - Additional non-sensitive metadata.
 */
function logDiagnostic(level, message, details = {}) {
  const timestamp = new Date().toISOString();
  const sanitizedDetails = {};

  for (const [key, val] of Object.entries(details)) {
    if (val !== undefined && val !== null) {
      if (typeof val === 'string') {
        sanitizedDetails[key] = redactApiKeys(val);
      } else {
        sanitizedDetails[key] = val;
      }
    }
  }

  const detailsStr = Object.keys(sanitizedDetails).length > 0
    ? ` | ${JSON.stringify(sanitizedDetails)}`
    : '';

  const formatted = `[${timestamp}] [ParallelSearch] [${level.toUpperCase()}] ${redactApiKeys(message)}${detailsStr}`;

  if (level === 'error') {
    console.error(formatted);
  } else if (level === 'warn') {
    console.warn(formatted);
  } else {
    console.log(formatted);
  }
}

/**
 * Helper to pause execution for a given number of milliseconds.
 *
 * @param {number} ms - Milliseconds to sleep.
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Performs a search query using the Parallel SDK.
 * Includes safe diagnostic logging, configurable timeouts, retries, and fallback modes.
 * 
 * @param {string} query - The search query or research topic.
 * @param {Object} [options] - Additional options for the search.
 * @param {string} [options.mode] - The search mode ('turbo', 'basic', 'advanced'). Defaults to 'advanced'.
 * @param {string} [options.objective] - An optional objective to focus the search results.
 * @param {number} [options.timeout] - Request timeout in milliseconds (defaults to 30000).
 * @param {number} [options.maxAttempts] - Number of retry attempts (defaults to 2).
 * @returns {Promise<Object>} A structured object with the search results and status.
 */
export async function parallelSearch(query, options = {}) {
  // 1. Check for missing query
  if (!query || typeof query !== 'string' || query.trim() === '') {
    logDiagnostic('warn', 'Validation failed: Query parameter is empty or missing.');
    return {
      success: false,
      error: 'Query parameter is required and must be a non-empty string.',
      results: []
    };
  }

  const trimmedQuery = query.trim();

  // 2. Validate PARALLEL_API_KEY from config
  const apiKey = config.parallelApiKey;
  if (!apiKey) {
    logDiagnostic('error', 'Configuration error: PARALLEL_API_KEY is not configured.');
    return {
      success: false,
      error: 'PARALLEL_API_KEY is missing. Please set it in your environment/config.',
      results: []
    };
  }

  const baseURL = config.parallelBaseUrl || process.env.PARALLEL_BASE_URL || 'https://api.parallel.ai';
  const endpoint = `${baseURL.replace(/\/+$/, '')}/v1/search`;
  const timeoutMs = options.timeout || 30000;
  const initialMode = options.mode || 'advanced';
  const maxAttempts = options.maxAttempts || 2;

  let lastError = null;
  let lastErrorType = null;
  let lastHttpStatus = null;

  // Determine modes to try (if advanced fails on attempt 1, try basic mode on attempt 2)
  const modesToTry = initialMode === 'advanced' ? ['advanced', 'basic'] : [initialMode];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const currentMode = modesToTry[Math.min(attempt - 1, modesToTry.length - 1)];
    const startTime = Date.now();

    // 5. Diagnostic logging: request start
    logDiagnostic('info', `Starting search request (attempt ${attempt}/${maxAttempts})`, {
      provider: 'Parallel AI',
      endpoint,
      mode: currentMode,
      timeoutMs,
      queryLength: trimmedQuery.length
    });

    try {
      // Initialize Parallel client with baseURL, timeout, and SDK options
      const client = new Parallel({
        apiKey,
        baseURL,
        timeout: timeoutMs,
        maxRetries: 1
      });

      const searchParams = {
        search_queries: [trimmedQuery],
        mode: currentMode
      };

      if (options.objective) {
        searchParams.objective = options.objective;
      }

      const response = await client.search(searchParams);
      const durationMs = Date.now() - startTime;

      // Diagnostic logging: response status
      if (!response || !response.results || response.results.length === 0) {
        logDiagnostic('info', `Request completed with 0 results in ${durationMs}ms`, {
          provider: 'Parallel AI',
          endpoint,
          httpStatus: 200,
          responseStatus: 'success',
          searchId: response?.search_id || null,
          resultsCount: 0
        });

        return {
          success: true,
          searchId: response?.search_id || null,
          sessionId: response?.session_id || null,
          results: [],
          message: 'No search results found.',
          diagnostics: {
            provider: 'Parallel AI',
            endpoint,
            durationMs,
            httpStatus: 200,
            mode: currentMode
          }
        };
      }

      // Map to a clean, structured result set suitable for a Research Agent
      const results = response.results.map((result) => ({
        title: result.title || 'Untitled Page',
        url: result.url,
        publishDate: result.publish_date || null,
        excerpts: result.excerpts || []
      }));

      logDiagnostic('info', `Request succeeded in ${durationMs}ms`, {
        provider: 'Parallel AI',
        endpoint,
        httpStatus: 200,
        responseStatus: 'success',
        searchId: response.search_id,
        resultsCount: results.length
      });

      return {
        success: true,
        searchId: response.search_id,
        sessionId: response.session_id,
        results,
        diagnostics: {
          provider: 'Parallel AI',
          endpoint,
          durationMs,
          httpStatus: 200,
          mode: currentMode
        }
      };

    } catch (error) {
      const durationMs = Date.now() - startTime;
      lastErrorType = error.name || error.constructor?.name || 'Error';
      lastHttpStatus = error.status || null;

      // Extract detailed cause message if available (e.g. underlying fetch/socket error)
      let rawMessage = error.message || 'Unknown error occurred while calling Parallel Search API.';
      if (error.cause && error.cause.message && error.cause.message !== error.message) {
        rawMessage += ` (cause: ${error.cause.message})`;
      }

      const sanitizedError = redactApiKeys(rawMessage);
      lastError = sanitizedError;

      // Diagnostic logging: error type, message, http status
      logDiagnostic('warn', `Request attempt ${attempt}/${maxAttempts} failed in ${durationMs}ms`, {
        provider: 'Parallel AI',
        endpoint,
        errorType: lastErrorType,
        httpStatus: lastHttpStatus,
        errorMessage: sanitizedError
      });

      if (attempt < maxAttempts) {
        const backoffMs = attempt * 1000;
        logDiagnostic('info', `Retrying Parallel Search in ${backoffMs}ms...`);
        await sleep(backoffMs);
      }
    }
  }

  // Diagnostic logging: final failure summary
  logDiagnostic('error', `All ${maxAttempts} Parallel Search attempts failed`, {
    provider: 'Parallel AI',
    endpoint,
    errorType: lastErrorType,
    httpStatus: lastHttpStatus,
    finalError: lastError
  });

  return {
    success: false,
    error: lastError || 'Parallel Search failed: Connection error.',
    errorType: lastErrorType,
    httpStatus: lastHttpStatus,
    results: [],
    diagnostics: {
      provider: 'Parallel AI',
      endpoint,
      errorType: lastErrorType,
      httpStatus: lastHttpStatus
    }
  };
}

