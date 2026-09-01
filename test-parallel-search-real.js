import dotenv from 'dotenv';
import { parallelSearch } from './lib/tools/parallelSearch.js';
import { researchTopic } from './lib/agents/researchAgent.js';
import { config } from './lib/utils/config.js';

dotenv.config();

function assert(condition, message) {
  if (!condition) {
    console.error(`  ✗ Assertion Failed: ${message}`);
    throw new Error(message);
  }
  console.log(`  ✓ ${message}`);
}

async function runParallelSearchRealTest() {
  console.log('====================================================');
  console.log('CreatorPilot: Real Parallel Search Integration Test');
  console.log('====================================================');

  // 1. Verify API Key is loaded in configuration
  console.log('\n[Step 1] Verifying Parallel Search API Key configuration...');
  const hasKey = Boolean(config.parallelApiKey || process.env.PARALLEL_API_KEY);
  assert(hasKey === true, 'PARALLEL_API_KEY is present in environment/config');
  assert(typeof (config.parallelApiKey || process.env.PARALLEL_API_KEY) === 'string', 'PARALLEL_API_KEY is a valid string');

  // 2. Perform a live Parallel Search query
  console.log('\n[Step 2] Executing live Parallel Search query with Parallel AI...');
  const testQuery = 'top AI video generators 2026 for creators';
  const searchResult = await parallelSearch(testQuery, {
    mode: 'basic',
    timeout: 30000
  });

  assert(searchResult.success === true, 'parallelSearch returned success: true');
  assert(Array.isArray(searchResult.results), 'searchResult.results is an array');
  assert(searchResult.results.length > 0, `parallelSearch retrieved ${searchResult.results.length} real results`);
  assert(typeof searchResult.searchId === 'string' && searchResult.searchId.length > 0, `Search ID returned: ${searchResult.searchId}`);
  assert(searchResult.diagnostics.provider === 'Parallel AI', 'Provider is Parallel AI');
  assert(searchResult.diagnostics.httpStatus === 200, 'HTTP status is 200');

  // Verify first search result structure
  const firstResult = searchResult.results[0];
  assert(typeof firstResult.title === 'string' && firstResult.title.length > 0, `Result 1 title: "${firstResult.title}"`);
  assert(typeof firstResult.url === 'string' && firstResult.url.startsWith('http'), `Result 1 URL: ${firstResult.url}`);
  assert(Array.isArray(firstResult.excerpts), 'Result 1 has excerpts array');

  // 3. Perform a full Research Agent run using real Parallel Search
  console.log('\n[Step 3] Executing Research Agent with live Parallel Search...');
  const researchRes = await researchTopic(testQuery, {
    mode: 'basic',
    timeout: 30000
  });

  assert(researchRes.success === true, 'researchTopic returned success: true');
  assert(researchRes.searchMetadata.provider === 'parallel-ai', 'Search metadata provider is parallel-ai');
  assert(researchRes.searchMetadata.totalResults > 0, `Total results processed: ${researchRes.searchMetadata.totalResults}`);
  assert(Boolean(researchRes.researchBrief), 'researchBrief is present');
  assert(typeof researchRes.researchBrief.summary === 'string' && researchRes.researchBrief.summary.length > 50, 'Research summary is generated');
  assert(Array.isArray(researchRes.researchBrief.keyFacts) && researchRes.researchBrief.keyFacts.length > 0, 'Key facts are generated');
  assert(Array.isArray(researchRes.researchBrief.sources) && researchRes.researchBrief.sources.length > 0, `Sources cited: ${researchRes.researchBrief.sources.length}`);

  // 4. Verify validation handling for empty query
  console.log('\n[Step 4] Testing validation error handling...');
  const emptyRes = await parallelSearch('');
  assert(emptyRes.success === false, 'Empty query rejected with success: false');
  assert(emptyRes.error.includes('Query parameter is required'), 'Descriptive validation error returned');

  console.log('\n====================================================');
  console.log('>>> ALL PARALLEL SEARCH INTEGRATION TESTS PASSED! <<<');
  console.log('====================================================\n');
}

runParallelSearchRealTest().catch((err) => {
  console.error('\nParallel Search Integration Test Failed:', err);
  process.exit(1);
});
