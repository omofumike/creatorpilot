import { app, setPipelineRunner } from './app.js';
import { config } from '../utils/config.js';

async function runWebLayerTests() {
  console.log('==================================================');
  console.log('Starting Stage 9 Web Layer Integration Tests...');
  console.log('==================================================\n');

  let passedAll = true;

  // Helper assertion function
  function assertCondition(desc, condition) {
    if (condition) {
      console.log(`✓ [PASS] ${desc}`);
    } else {
      console.log(`✗ [FAIL] ${desc}`);
      passedAll = false;
    }
  }

  // Start server on an ephemeral port
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  console.log(`Test server running on: ${baseUrl}\n`);

  try {
    // --------------------------------------------------
    // TEST 1: GET / returns HTTP 200 and contains "CreatorPilot"
    // --------------------------------------------------
    console.log('--- TEST 1: GET / serves HTML page ---');
    const getHomeRes = await fetch(`${baseUrl}/`);
    assertCondition('GET / returns HTTP 200', getHomeRes.status === 200);
    
    const getHomeBody = await getHomeRes.text();
    assertCondition('GET / contains "CreatorPilot"', getHomeBody.includes('CreatorPilot'));
    assertCondition('GET / contains workspace/production UI', getHomeBody.includes("filmmaking workspace") || getHomeBody.includes("AI Production") || getHomeBody.includes("Judge's Dashboard"));
    console.log('');

    // --------------------------------------------------
    // TEST 2: GET /health returns HTTP 200 and valid JSON status
    // --------------------------------------------------
    console.log('--- TEST 2: GET /health check ---');
    const getHealthRes = await fetch(`${baseUrl}/health`);
    assertCondition('GET /health returns HTTP 200', getHealthRes.status === 200);
    
    const healthData = await getHealthRes.json();
    assertCondition('/health JSON has status "OK"', healthData.status === 'OK');
    assertCondition('/health JSON has timestamp', typeof healthData.timestamp === 'string');
    assertCondition('/health JSON has uptime', typeof healthData.uptime === 'number');
    console.log('');

    // --------------------------------------------------
    // TEST 3: POST /api/run rejects invalid requests with HTTP 400
    // --------------------------------------------------
    console.log('--- TEST 3: POST /api/run bad request validation ---');
    
    // Test empty body
    const badReq1 = await fetch(`${baseUrl}/api/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assertCondition('POST /api/run with empty body returns HTTP 400', badReq1.status === 400);
    const badReq1Body = await badReq1.json();
    assertCondition('Returns validation failure object', badReq1Body.success === false && badReq1Body.failedStage === 'validation');

    // Test non-string topic
    const badReq2 = await fetch(`${baseUrl}/api/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: 12345 })
    });
    assertCondition('POST /api/run with non-string topic returns HTTP 400', badReq2.status === 400);

    // Test whitespace topic
    const badReq3 = await fetch(`${baseUrl}/api/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: '   ' })
    });
    assertCondition('POST /api/run with whitespace topic returns HTTP 400', badReq3.status === 400);
    console.log('');

    // --------------------------------------------------
    // TEST 4: POST /api/run accepts valid request (and invokes Orchestrator)
    // --------------------------------------------------
    console.log('--- TEST 4: POST /api/run invokes Orchestrator ---');
    
    let mockOrchestratorCalled = false;
    let receivedTopic = '';
    let receivedOptions = null;

    // Inject mock pipeline runner
    setPipelineRunner(async (topic, options) => {
      mockOrchestratorCalled = true;
      receivedTopic = topic;
      receivedOptions = options;
      return {
        success: true,
        topic: topic,
        status: 'PASS',
        overallScore: 95,
        stages: {
          research: { success: true },
          script: { success: true },
          storyboard: { success: true },
          production: { success: true },
          quality: { success: true }
        },
        finalPackage: {
          researchBrief: { topic, summary: 'Mock brief summary' },
          script: { title: 'Mock title' },
          storyboard: { title: 'Mock title', shots: [] },
          productionPlan: { title: 'Mock title', shotList: [] },
          qualityReport: { overallScore: 95, status: 'PASS', checks: [] }
        }
      };
    });

    const validTopic = 'Dynamic lighting setups';
    const postRes = await fetch(`${baseUrl}/api/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: validTopic, options: { script: { tone: 'funny' } } })
    });

    assertCondition('POST /api/run returns HTTP 200', postRes.status === 200);
    const postData = await postRes.json();
    
    assertCondition('Web layer called injected Orchestrator', mockOrchestratorCalled === true);
    assertCondition('Injected Orchestrator received correct topic', receivedTopic === validTopic);
    assertCondition('Injected Orchestrator received correct options', receivedOptions?.script?.tone === 'funny');
    assertCondition('Returns correct success payload', postData.success === true && postData.overallScore === 95);
    console.log('');

    // --------------------------------------------------
    // TEST 5: POST /api/continue-chat returns valid revision payload
    // --------------------------------------------------
    console.log('--- TEST 5: POST /api/continue-chat returns valid revision payload ---');

    const revisionPayload = {
      topic: 'Lighting for a home studio',
      message: 'Make the hook stronger',
      finalPackage: {
        topic: 'Lighting for a home studio',
        researchBrief: { topic: 'Lighting for a home studio', summary: 'Research summary' },
        script: {
          title: 'Lighting Basics',
          hook: 'Here is how to light your studio.',
          sections: [{ heading: 'Intro', narration: 'Let me walk you through setup.', visualSuggestions: ['Camera framing'] }]
        },
        storyboard: {
          title: 'Lighting Basics',
          shots: [{ shotNumber: 1, visualDescription: 'Close-up of lamp', voiceover: 'Let me walk you through setup.', cameraFraming: 'Close-up', estimatedDuration: '10s' }]
        },
        productionPlan: {
          title: 'Lighting Basics',
          shotList: [{ shotNumber: 1, storyboardShotNumber: 1, shotType: 'Close-up', location: 'studio', description: 'Setup lamp', setupInstructions: 'Aim at subject.' }],
          filmingChecklist: [{ task: 'Set key light', stage: 'Setup', completed: false }]
        },
        qualityReport: { status: 'PASS', overallScore: 92, summary: 'Good quality', checks: [] }
      }
    };

    const continueChatRes = await fetch(`${baseUrl}/api/continue-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(revisionPayload)
    });

    assertCondition('POST /api/continue-chat returns HTTP 200', continueChatRes.status === 200);
    const continueChatData = await continueChatRes.json();
    assertCondition('Revision payload includes success', continueChatData.success === true);
    assertCondition('Revision payload includes finalPackage', !!continueChatData.finalPackage);
    assertCondition('Revision payload includes status', ['PASS', 'WARNING', 'FAIL'].includes(continueChatData.status));
    assertCondition('Revision payload includes overallScore', typeof continueChatData.overallScore === 'number');
    assertCondition('Revision payload includes summary', typeof continueChatData.summary === 'string');
    assertCondition('Revision payload includes affectedAgents', Array.isArray(continueChatData.affectedAgents));
    console.log('');

    // --------------------------------------------------
    // TEST 6: POST /api/generate-video validation tests
    // --------------------------------------------------
    console.log('--- TEST 6: POST /api/generate-video bad request validation ---');
    const badVidReq1 = await fetch(`${baseUrl}/api/generate-video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    assertCondition('POST /api/generate-video with empty body returns HTTP 400', badVidReq1.status === 400);

    const badVidReq2 = await fetch(`${baseUrl}/api/generate-video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ finalPackage: { storyboard: { shots: [] } } })
    });
    assertCondition('POST /api/generate-video with empty shots returns error', badVidReq2.status === 500 || badVidReq2.status === 400);
    console.log('');

    // --------------------------------------------------
    // TEST 7: API credentials are never exposed in error responses
    // --------------------------------------------------
    console.log('--- TEST 7: Credential redacting in errors ---');
    
    // Inject a runner that throws an error containing API keys
    const secretGeminiKey = config.geminiApiKey || 'sk-test-gemini-secret-12345';
    setPipelineRunner(async (topic, options) => {
      throw new Error(`Failed to call LLM API with key: ${secretGeminiKey}`);
    });

    const errorRes = await fetch(`${baseUrl}/api/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic: 'Test error key leak redacting' })
    });

    assertCondition('Internal runner error returns HTTP 500', errorRes.status === 500);
    const errorData = await errorRes.json();
    assertCondition('Error message returned is a string', typeof errorData.error === 'string');
    assertCondition('API Key is completely redacted', !errorData.error.includes(secretGeminiKey));
    assertCondition('API Key is replaced with redacted placeholder', errorData.error.includes('[REDACTED_API_KEY]'));
    console.log('');

  } catch (err) {
    console.error('\n✗ Unexpected Test Runner Failure:');
    console.error(err);
    passedAll = false;
  } finally {
    // Close the test server cleanly
    server.close();
    console.log('Test server closed.');
  }

  // Final Report
  console.log('\n==================================================');
  if (passedAll) {
    console.log('>>> ALL WEB LAYER VERIFICATION TESTS PASSED! <<<');
    console.log('==================================================');
  } else {
    console.log('>>> SOME WEB LAYER VERIFICATION TESTS FAILED! <<<');
    console.log('==================================================');
    process.exit(1);
  }
}

runWebLayerTests();
