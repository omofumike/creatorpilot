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
 * Extracts clean, concise search keyword queries from a potentially verbose topic prompt.
 *
 * @param {string} query - Raw query or topic.
 * @returns {string[]} Array of 1-3 concise search queries.
 */
function buildSearchQueries(query) {
  const trimmed = query.trim();
  const queries = [trimmed];

  // Remove common prompt prefixes like "Create a video about", "Write a script on", etc.
  const cleaned = trimmed
    .replace(/^(create|make|write|generate|produce|direct)\s+(a|an|the)?\s*(video|short film|movie|documentary|tutorial|explainer)?\s*(about|on|explaining|exploring|showcasing)?\s*/i, '')
    .trim();

  if (cleaned && cleaned.toLowerCase() !== trimmed.toLowerCase() && cleaned.length > 3) {
    queries.unshift(cleaned);
  }

  return [...new Set(queries)].slice(0, 3);
}

/**
 * Direct HTTP fallback call to the Parallel Search REST endpoint.
 * Ensures connectivity even if the SDK client wrapper encounters socket/transport anomalies.
 *
 * @param {string} endpoint - Full API URL (e.g. https://api.parallel.ai/v1/search).
 * @param {string} apiKey - Parallel API key.
 * @param {Object} searchParams - Search payload.
 * @param {number} timeoutMs - Request timeout.
 * @returns {Promise<Object>} Raw API response object.
 */
async function directParallelSearchFetch(endpoint, apiKey, searchParams, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'User-Agent': 'CreatorPilot/1.0.0 (Node.js)'
      },
      body: JSON.stringify(searchParams),
      signal: controller.signal
    });

    clearTimeout(timer);

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const errorMsg = errorBody.error?.message || errorBody.message || `HTTP ${response.status} ${response.statusText}`;
      const err = new Error(errorMsg);
      err.status = response.status;
      throw err;
    }

    return await response.json();
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError' || err.code === 'ABORT_ERR') {
      const timeoutErr = new Error(`Request timed out after ${timeoutMs}ms.`);
      timeoutErr.name = 'APIConnectionTimeoutError';
      timeoutErr.status = 408;
      throw timeoutErr;
    }
    throw err;
  }
}

/**
 * Performs a search query using the Parallel SDK with fallback resilience and diagnostic logging.
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

  // 2. Validate PARALLEL_API_KEY from config or environment
  const apiKey = config.parallelApiKey || process.env.PARALLEL_API_KEY;
  if (!apiKey) {
    logDiagnostic('error', 'Configuration error: PARALLEL_API_KEY is not configured in environment or config.');
    return {
      success: false,
      error: 'PARALLEL_API_KEY is missing. Please configure PARALLEL_API_KEY in your environment/config.',
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

  // Build optimized queries: concise keyword query + objective focus
  const searchQueries = buildSearchQueries(trimmedQuery);
  const searchObjective = options.objective || (trimmedQuery.length > 20 ? trimmedQuery : undefined);

  // Strategy: Try advanced first, then basic mode with direct fetch fallback on connection errors
  const modesToTry = initialMode === 'advanced' ? ['advanced', 'basic'] : [initialMode];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const currentMode = modesToTry[Math.min(attempt - 1, modesToTry.length - 1)];
    const startTime = Date.now();

    // Diagnostic logging: request started
    logDiagnostic('info', `Parallel Search request started (attempt ${attempt}/${maxAttempts})`, {
      provider: 'Parallel AI',
      endpoint,
      mode: currentMode,
      timeoutMs,
      searchQueriesCount: searchQueries.length,
      queryLength: trimmedQuery.length
    });

    let rawResponse = null;

    // Step A: Primary call via official Parallel SDK client
    try {
      const client = new Parallel({
        apiKey,
        baseURL,
        timeout: timeoutMs,
        maxRetries: 1
      });

      const searchPayload = {
        search_queries: searchQueries,
        mode: currentMode
      };

      if (searchObjective) {
        searchPayload.objective = searchObjective;
      }

      rawResponse = await client.search(searchPayload);

    } catch (sdkError) {
      const isConnectionOrTimeout =
        sdkError.name === 'APIConnectionError' ||
        sdkError.name === 'APIConnectionTimeoutError' ||
        sdkError.message?.includes('Connection error') ||
        sdkError.message?.includes('fetch failed') ||
        sdkError.code === 'ECONNRESET' ||
        sdkError.code === 'ETIMEDOUT';

      logDiagnostic('warn', `Parallel SDK call encountered error on attempt ${attempt}: ${redactApiKeys(sdkError.message || String(sdkError))}`, {
        provider: 'Parallel AI',
        endpoint,
        errorType: sdkError.name || 'APIError',
        httpStatus: sdkError.status || null,
        isConnectionOrTimeout
      });

      // Step B: If SDK client had a connection/transport error, try direct HTTP fetch fallback
      if (isConnectionOrTimeout) {
        try {
          logDiagnostic('info', `Attempting direct HTTP fetch fallback to ${endpoint}...`);
          const searchPayload = {
            search_queries: searchQueries,
            mode: currentMode
          };
          if (searchObjective) {
            searchPayload.objective = searchObjective;
          }
          rawResponse = await directParallelSearchFetch(endpoint, apiKey, searchPayload, timeoutMs);
          logDiagnostic('info', `Direct HTTP fetch fallback succeeded!`);
        } catch (directErr) {
          logDiagnostic('warn', `Direct HTTP fetch fallback also failed: ${redactApiKeys(directErr.message || String(directErr))}`, {
            provider: 'Parallel AI',
            endpoint,
            errorType: directErr.name || 'FetchError',
            httpStatus: directErr.status || null
          });
          // Re-throw the directErr to be handled by outer catch block
          throw directErr;
        }
      } else {
        throw sdkError;
      }
    }

    try {
      const durationMs = Date.now() - startTime;

      if (!rawResponse || !Array.isArray(rawResponse.results) || rawResponse.results.length === 0) {
        logDiagnostic('info', `Parallel Search completed with 0 results in ${durationMs}ms`, {
          provider: 'Parallel AI',
          endpoint,
          httpStatus: 200,
          responseStatus: 'success',
          searchId: rawResponse?.search_id || null,
          resultsCount: 0
        });

        return {
          success: true,
          searchId: rawResponse?.search_id || null,
          sessionId: rawResponse?.session_id || null,
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

      // Map to structured results for Research Agent
      const results = rawResponse.results.map((result) => ({
        title: result.title || 'Untitled Page',
        url: result.url,
        publishDate: result.publish_date || null,
        excerpts: Array.isArray(result.excerpts) ? result.excerpts : []
      }));

      logDiagnostic('info', `Parallel Search request succeeded in ${durationMs}ms`, {
        provider: 'Parallel AI',
        endpoint,
        httpStatus: 200,
        responseStatus: 'success',
        searchId: rawResponse.search_id,
        resultsCount: results.length
      });

      return {
        success: true,
        searchId: rawResponse.search_id,
        sessionId: rawResponse.session_id,
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

      let rawMessage = error.message || 'Unknown error occurred while calling Parallel Search API.';
      if (error.cause && error.cause.message && error.cause.message !== error.message) {
        rawMessage += ` (cause: ${error.cause.message})`;
      }

      const sanitizedError = redactApiKeys(rawMessage);
      lastError = sanitizedError;

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

  // Diagnostic logging: final failure
  logDiagnostic('error', `All ${maxAttempts} Parallel Search attempts failed`, {
    provider: 'Parallel AI',
    endpoint,
    errorType: lastErrorType,
    httpStatus: lastHttpStatus,
    finalError: lastError
  });

  return {
    success: false,
    error: lastError ? `Parallel Search failed: ${lastError}` : 'Parallel Search failed: Connection error.',
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
