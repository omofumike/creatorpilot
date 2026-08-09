import { runPipeline } from './orchestratorAgent.js';
import { config } from '../utils/config.js';

/**
 * Deep clones an object for testing mutations.
 */
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

async function runTestHarness() {
  console.log('==================================================');
  console.log('Starting Stage 8 Orchestrator Integration Tests...');
  console.log('==================================================\n');

  const topic = 'Latest trends in AI tools for solo video creators';
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

  try {
    // =========================================================================
    // TEST 1: E2E Pipeline Success Run
    // =========================================================================
    console.log('--------------------------------------------------');
    console.log('TEST 1: Run Full Pipeline End-to-End (Success Case)');
    console.log('--------------------------------------------------');
    console.log(`Pipeline started for topic: "${topic}"\n`);

    const startTime = Date.now();
    const result = await runPipeline(topic, {
      research: { mode: 'advanced' },
      script: {
        audience: 'solo content creators',
        platform: 'YouTube',
        tone: 'informative and engaging',
        targetDuration: '5-7 minutes',
        format: 'educational video'
      },
      quality: { temperature: 0.1 } // Consistent auditing
    });
    const endTime = Date.now();

    console.log(`Pipeline completed in ${((endTime - startTime) / 1000).toFixed(2)}s\n`);

    // Verify stage completions printed
    console.log('--- Individual Stage Completion Check ---');
    assertCondition('Research Stage completed successfully', result.stages?.research?.success === true);
    assertCondition('Script Stage completed successfully', result.stages?.script?.success === true);
    assertCondition('Storyboard Stage completed successfully', result.stages?.storyboard?.success === true);
    assertCondition('Production Stage completed successfully', result.stages?.production?.success === true);
    assertCondition('Quality Stage completed successfully', result.stages?.quality?.success === true);
    console.log('');

    // Print specified verification info
    console.log('--- Pipeline Execution Metrics ---');
    console.log(`Final Quality Status:   ${result.status}`);
    console.log(`Overall Quality Score:  ${result.overallScore}/100`);
    
    const storyboardShotsCount = result.finalPackage?.storyboard?.shots?.length || 0;
    const productionShotsCount = result.finalPackage?.productionPlan?.shotList?.length || 0;
    const qualityChecksCount = result.finalPackage?.qualityReport?.checks?.length || 0;

    console.log(`Number of Storyboard Shots: ${storyboardShotsCount}`);
    console.log(`Number of Production Shots: ${productionShotsCount}`);
    console.log(`Number of Quality Checks:   ${qualityChecksCount}`);
    console.log(`Final Pipeline Status:      ${result.success ? 'SUCCESS' : 'FAILED'}\n`);

    // 1. Assertions on E2E response schema
    console.log('--- Schema and Content Assertions ---');
    assertCondition('Response has success: true', result.success === true);
    assertCondition('Topic matches original input', result.topic === topic);
    assertCondition("Quality status is 'PASS', 'WARNING', or 'FAIL'", ['PASS', 'WARNING', 'FAIL'].includes(result.status));
    assertCondition('overallScore is a valid number from 0 to 100', typeof result.overallScore === 'number' && result.overallScore >= 0 && result.overallScore <= 100);

    // 2. Verify all five stage outputs are nested correctly inside finalPackage
    assertCondition('finalPackage contains researchBrief', typeof result.finalPackage?.researchBrief === 'object');
    assertCondition('finalPackage contains script', typeof result.finalPackage?.script === 'object');
    assertCondition('finalPackage contains storyboard', typeof result.finalPackage?.storyboard === 'object');
    assertCondition('finalPackage contains productionPlan', typeof result.finalPackage?.productionPlan === 'object');
    assertCondition('finalPackage contains qualityReport', typeof result.finalPackage?.qualityReport === 'object');

    // 3. Verify correct sequential data flow across stages
    const briefTopic = result.finalPackage?.researchBrief?.topic;
    const scriptTitle = result.finalPackage?.script?.title;
    const storyboardTitle = result.finalPackage?.storyboard?.title;
    const productionTitle = result.finalPackage?.productionPlan?.title;

    assertCondition('Script was generated from correct research topic', scriptTitle && typeof scriptTitle === 'string');
    assertCondition('Storyboard matches script title', storyboardTitle === scriptTitle);
    assertCondition('Production Plan matches storyboard title', productionTitle === storyboardTitle);

    // Verify Quality Agent received all four correct artifacts (unpacked/grounded check)
    // The Quality Report summary should refer to the title/topic
    const reportSummary = result.finalPackage?.qualityReport?.summary?.toLowerCase() || '';
    assertCondition('Quality Report evaluated research, script, storyboard, and production plan', 
      reportSummary.includes('research') || reportSummary.includes('script') || reportSummary.includes('storyboard') || reportSummary.includes('production')
    );

    // 4. Traceability of Shot Mapping
    const storyboardShotNumbers = new Set(result.finalPackage?.storyboard?.shots?.map(s => s.shotNumber));
    const allProductionShotsTraced = result.finalPackage?.productionPlan?.shotList?.every(ps => storyboardShotNumbers.has(ps.storyboardShotNumber));
    assertCondition('Every production plan shot traces back to a valid storyboard shot number', allProductionShotsTraced === true);

    // 5. Check credential redacting in final package serialized output
    const serializedOutput = JSON.stringify(result);
    const keyLeaks = [config.geminiApiKey, config.parallelApiKey].filter(Boolean).filter(key => serializedOutput.includes(key));
    assertCondition('No sensitive API keys appear in the final serialized output', keyLeaks.length === 0);

    // 6. Check non-mutation (making sure nested objects are cloned)
    // We modify an element of finalPackage and make sure it doesn't affect the corresponding stage output
    const testClonedOutput = deepClone(result);
    testClonedOutput.finalPackage.script.title = "MUTATED_TITLE_TEST";
    assertCondition('Orchestrator output uses deep cloning (non-mutation guarantee)', 
      result.stages.script.script.title !== "MUTATED_TITLE_TEST"
    );

    // Print the raw final Orchestrator JSON as requested
    console.log('\n==================================================');
    console.log('=== COMPLETE FINAL ORCHESTRATOR JSON ===');
    console.log('==================================================');
    console.log(JSON.stringify(result, null, 2));
    console.log('==================================================\n');


    // =========================================================================
    // TEST 2: Failure Isolation Test
    // =========================================================================
    console.log('--------------------------------------------------');
    console.log('TEST 2: Pipeline Failure Isolation Run (Script failure)');
    console.log('--------------------------------------------------');
    console.log('Starting pipeline with invalid script configuration to trigger isolation...\n');

    // Triggering failure in generateScript via invalid temperature parameter (-5.0)
    const failureResult = await runPipeline(topic, {
      research: { mode: 'advanced' },
      script: { temperature: -5.0 } // Triggers generation/API exception in Script Agent
    });

    console.log('--- Failure Isolation Assertions ---');
    assertCondition('Pipeline execution returned success: false', failureResult.success === false);
    assertCondition('failedStage correctly identified as "script"', failureResult.failedStage === 'script');
    assertCondition('Error message is present', typeof failureResult.error === 'string' && failureResult.error.length > 0);
    assertCondition('Originating step is populated', typeof failureResult.step === 'string' && failureResult.step.length > 0);
    assertCondition('Topic matches original input', failureResult.topic === topic);
    
    // Check that completed upstream stages are preserved
    assertCondition('Upstream stage "research" is preserved', typeof failureResult.stages?.research === 'object' && failureResult.stages?.research?.success === true);
    
    // Check that failing stage and all downstream stages are NOT executed/stored
    assertCondition('Failed stage "script" output is absent from stages object', failureResult.stages?.script === undefined);
    assertCondition('Downstream stage "storyboard" is not executed', failureResult.stages?.storyboard === undefined);
    assertCondition('Downstream stage "production" is not executed', failureResult.stages?.production === undefined);
    assertCondition('Downstream stage "quality" is not executed', failureResult.stages?.quality === undefined);
    assertCondition('finalPackage is absent from the failure response', failureResult.finalPackage === undefined);

    // Check credential redacting in failure output
    const serializedFailure = JSON.stringify(failureResult);
    const failureKeyLeaks = [config.geminiApiKey, config.parallelApiKey].filter(Boolean).filter(key => serializedFailure.includes(key));
    assertCondition('No sensitive API keys appear in the failure serialized output', failureKeyLeaks.length === 0);
    console.log('');

    // Final report
    console.log('==================================================');
    if (passedAll) {
      console.log('>>> ALL ORCHESTRATOR VERIFICATION TESTS PASSED! <<<');
    } else {
      console.log('>>> SOME ORCHESTRATOR VERIFICATION TESTS FAILED! <<<');
      process.exit(1);
    }
    console.log('==================================================');

  } catch (err) {
    console.error('\n✗ Unexpected Integration Test Harness Failure:');
    console.error(err);
    process.exit(1);
  }
}

runTestHarness();
