import Parallel from 'parallel-web';
import { config } from '../utils/config.js';

/**
 * Performs a search query using the Parallel SDK.
 * 
 * @param {string} query - The search query or research topic.
 * @param {Object} [options] - Additional options for the search.
 * @param {string} [options.mode] - The search mode ('turbo', 'basic', 'advanced'). Defaults to 'advanced'.
 * @param {string} [options.objective] - An optional objective to focus the search results.
 * @returns {Promise<Object>} A structured object with the search results and status.
 */
export async function parallelSearch(query, options = {}) {
  // 1. Check for missing query
  if (!query || typeof query !== 'string' || query.trim() === '') {
    return {
      success: false,
      error: 'Query parameter is required and must be a non-empty string.',
      results: []
    };
  }

  // 2. Validate PARALLEL_API_KEY from config
  const apiKey = config.parallelApiKey;
  if (!apiKey) {
    return {
      success: false,
      error: 'PARALLEL_API_KEY is missing. Please set it in your environment/config.',
      results: []
    };
  }

  try {
    // 3. Initialize Parallel client with the specific API key
    const client = new Parallel({ apiKey });

    // 4. Call the search API using the client.search method
    const searchParams = {
      search_queries: [query.trim()],
      mode: options.mode || 'advanced'
    };

    if (options.objective) {
      searchParams.objective = options.objective;
    }

    const response = await client.search(searchParams);

    // 5. Check and structure the response safely
    if (!response || !response.results || response.results.length === 0) {
      return {
        success: true,
        searchId: response?.search_id || null,
        sessionId: response?.session_id || null,
        results: [],
        message: 'No search results found.'
      };
    }

    // Map to a clean, structured result set suitable for a Research Agent
    const results = response.results.map((result) => ({
      title: result.title || 'Untitled Page',
      url: result.url,
      publishDate: result.publish_date || null,
      excerpts: result.excerpts || []
    }));

    return {
      success: true,
      searchId: response.search_id,
      sessionId: response.session_id,
      results
    };
  } catch (error) {
    // 6. Handle errors safely without exposing the API key
    let errorMessage = error.message || 'An unknown error occurred while calling the Parallel Search API.';
    
    // Ensure we don't expose any API keys or credentials in the error message
    if (apiKey) {
      errorMessage = errorMessage.replace(new RegExp(apiKey, 'g'), '[REDACTED_API_KEY]');
    }

    return {
      success: false,
      error: errorMessage,
      results: []
    };
  }
}
