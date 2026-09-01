import { parallelSearch } from './parallelSearch.js';
import { researchTopic } from '../agents/researchAgent.js';
import { config } from '../utils/config.js';

async function runRobustnessTests() {
  console.log('==================================================');
  console.log('Starting Parallel Search Robustness & Integration Tests');
  console.log('==================================================\n');

  let allPassed = true;

  function assert(desc, condition) {
    if (condition) {
      console.log(`✓ [PASS] ${desc}`);
    } else {
      console.log(`✗ [FAIL] ${desc}`);
      allPassed = false;
    }
  }

  try {
    // --------------------------------------------------
    // TEST 1: Empty and invalid query validation
    // --------------------------------------------------
    console.log('--- TEST 1: Input Validation Handling ---');
    const emptyResult = await parallelSearch('');
    assert('Rejects empty query', emptyResult.success === false && emptyResult.error.includes('Query parameter is required'));

    const whitespaceResult = await parallelSearch('   ');
    assert('Rejects whitespace-only query', whitespaceResult.success === false);

    const nullResult = await parallelSearch(null);
    assert('Rejects null query', nullResult.success === false);
    console.log('');

    // --------------------------------------------------
    // TEST 2: Real Parallel Search Integration
    // --------------------------------------------------
    console.log('--- TEST 2: Real Parallel Search Integration ---');
    const query = 'Artificial intelligence video creation tools';
    console.log(`Executing real search for: "${query}"...`);
    const liveResult = await parallelSearch(query, { mode: 'basic', timeout: 30000 });

    assert('Real Parallel Search responds', typeof liveResult === 'object');
    if (liveResult.success) {
      assert('Real search returned searchId', typeof liveResult.searchId === 'string' && liveResult.searchId.length > 0);
      assert('Real search returned results array', Array.isArray(liveResult.results) && liveResult.results.length > 0);
      assert('First result has title and url', typeof liveResult.results[0]?.title === 'string' && typeof liveResult.results[0]?.url === 'string');
      assert('Diagnostics metadata populated', liveResult.diagnostics?.provider === 'Parallel AI' && liveResult.diagnostics?.httpStatus === 200);
      console.log(`  -> Successfully retrieved ${liveResult.results.length} real search results from Parallel AI.`);
    } else {
      console.log(`  -> Live search returned error: ${liveResult.error} (handled gracefully)`);
      assert('Error message is sanitized', typeof liveResult.error === 'string' && !liveResult.error.includes(config.parallelApiKey || '___'));
    }
    console.log('');

    // --------------------------------------------------
    // TEST 3: Safe Credential Redaction in Errors
    // --------------------------------------------------
    console.log('--- TEST 3: Safe Credential Redaction ---');
    const keyLeaks = [config.geminiApiKey, config.parallelApiKey, config.googleApiKey]
      .filter(Boolean)
      .filter(k => k.length > 5);

    // Test with short timeout or search query
    const searchCheckResult = await parallelSearch('test query', {
      timeout: 20000,
      maxAttempts: 1
    });

    const outputStr = JSON.stringify(searchCheckResult);
    const hasLeak = keyLeaks.some(k => outputStr.includes(k));
    assert('No API keys leaked in search output', !hasLeak);
    console.log('');

    // --------------------------------------------------
    // TEST 4: Research Agent Integration with Real or Fallback Search
    // --------------------------------------------------
    console.log('--- TEST 4: Research Agent Robustness ---');
    const researchTopicQuery = 'Cinematography camera movement techniques';
    console.log(`Running Research Agent for: "${researchTopicQuery}"...`);
    const agentResult = await researchTopic(researchTopicQuery);

    assert('Research Agent returns success: true', agentResult.success === true);
    assert('Research brief contains topic', agentResult.researchBrief?.topic === researchTopicQuery);
    assert('Research brief contains summary', typeof agentResult.researchBrief?.summary === 'string' && agentResult.researchBrief.summary.length > 0);
    assert('Research brief contains keyFacts', Array.isArray(agentResult.researchBrief?.keyFacts));
    assert('Research brief contains statistics', Array.isArray(agentResult.researchBrief?.statistics));
    assert('Research brief contains opportunities', Array.isArray(agentResult.researchBrief?.opportunities));
    assert('Research brief contains risksChallenges', Array.isArray(agentResult.researchBrief?.risksChallenges));
    assert('Research brief contains sources array', Array.isArray(agentResult.researchBrief?.sources));
    assert('Search metadata indicates provider', typeof agentResult.searchMetadata?.provider === 'string');
    console.log(`  -> Provider used: ${agentResult.searchMetadata?.provider} (Fallback active: ${agentResult.searchMetadata?.fallback || false})`);
    console.log('');

  } catch (error) {
    console.error('✗ Unexpected test runner error:', error);
    allPassed = false;
  }

  console.log('==================================================');
  if (allPassed) {
    console.log('>>> ALL PARALLEL SEARCH ROBUSTNESS TESTS PASSED! <<<');
  } else {
    console.log('>>> SOME PARALLEL SEARCH ROBUSTNESS TESTS FAILED! <<<');
    process.exit(1);
  }
  console.log('==================================================');
}

runRobustnessTests();
