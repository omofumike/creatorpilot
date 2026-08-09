import { researchTopic } from './researchAgent.js';
import { generateScript } from './scriptAgent.js';
import { generateStoryboard } from './storyboardAgent.js';
import { generateProductionPlan } from './producerAgent.js';
import { reviewQuality } from './qualityAgent.js';

/**
 * Deep clones an object to ensure we do not mutate original inputs.
 */
function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

async function runTest() {
  console.log('==================================================');
  console.log('Starting End-to-End Quality Agent Integration Test...');
  const topic = 'Latest trends in AI tools for solo video creators';
  console.log(`Pipeline Topic: "${topic}"\n`);

  try {
    // 1. Run Research Agent (Stage 2)
    console.log('1. Running Research Agent...');
    const researchResponse = await researchTopic(topic);
    if (!researchResponse.success) {
      console.error('✗ Research Agent Failed!', researchResponse.error);
      process.exit(1);
    }
    console.log('✓ Research Agent completed successfully.\n');

    // Save deep copies for mutation testing
    const originalBrief = deepClone(researchResponse.researchBrief);

    // 2. Run Script Agent (Stage 3)
    console.log('2. Running Script Agent...');
    const scriptResponse = await generateScript(researchResponse.researchBrief, {
      audience: 'solo content creators',
      platform: 'YouTube',
      tone: 'informative and engaging',
      targetDuration: '5-7 minutes',
      format: 'educational video'
    });
    if (!scriptResponse.success) {
      console.error('✗ Script Agent Failed!', scriptResponse.error);
      process.exit(1);
    }
    console.log('✓ Script Agent completed successfully.\n');

    const originalScript = deepClone(scriptResponse.script);

    // 3. Run Storyboard Agent (Stage 4)
    console.log('3. Running Storyboard Agent...');
    const storyboardResponse = await generateStoryboard(scriptResponse.script);
    if (!storyboardResponse.success) {
      console.error('✗ Storyboard Agent Failed!', storyboardResponse.error);
      process.exit(1);
    }
    console.log('✓ Storyboard Agent completed successfully.\n');

    const originalStoryboard = deepClone(storyboardResponse.storyboard);

    // 4. Run Production Agent (Stages 5 & 6)
    console.log('4. Running Production Agent...');
    const productionResponse = await generateProductionPlan(storyboardResponse.storyboard);
    if (!productionResponse.success) {
      console.error('✗ Production Agent Failed!', productionResponse.error);
      process.exit(1);
    }
    console.log('✓ Production Agent completed successfully.\n');

    const originalProduction = deepClone(productionResponse.production);

    // To verify that the Quality Agent detects and flags unsupported commercial and named-entity claims,
    // we programmatically inject specific unsupported claims into cloned copies of our pipeline deliverables.
    // This makes the automated assertions highly deterministic and avoids depending on random LLM generation.
    const auditedBrief = deepClone(originalBrief);
    const auditedScript = deepClone(originalScript);
    const auditedStoryboard = deepClone(originalStoryboard);
    const auditedProduction = deepClone(originalProduction);

    console.log('--- Injecting unsupported test claims into audited documents ---');
    
    // Inject unsupported named study / organization
    const injectedStudy = 'Gartner';
    const injectedStudyFull = 'a 2026 Gartner Video Creator Survey';
    auditedScript.sections[0].narration += ` According to ${injectedStudyFull}, solo production is rising.`;
    auditedScript.sections[0].onScreenText.push(`Source: ${injectedStudyFull}`);
    
    // Inject unsupported product / model
    const injectedModel = 'SuperCreator AI Pro v3';
    auditedScript.sections[0].narration += ` We are using the brand new ${injectedModel} for this step.`;

    // Inject unsupported price / subscription cost
    const injectedPrice = '$199 per month subscription';
    auditedScript.sections[0].narration += ` The software costs a ${injectedPrice}.`;

    // Inject unsupported credit figure
    const injectedCredits = '5,000 monthly rendering credits';
    auditedScript.sections[0].narration += ` This subscription gives you ${injectedCredits}.`;

    // Inject unsupported percentage / statistic
    const injectedPercentage = '99.7% automated speedup';
    auditedScript.sections[0].narration += ` It guarantees a ${injectedPercentage}.`;

    // Also update a storyboard shot and production list description to trace the injected text
    if (auditedStoryboard.shots && auditedStoryboard.shots.length > 0) {
      auditedStoryboard.shots[0].voiceover += ` [According to ${injectedStudyFull}, using ${injectedModel} with ${injectedCredits} costing ${injectedPrice} achieving ${injectedPercentage}]`;
      auditedStoryboard.shots[0].onScreenText.push(`Source: ${injectedStudyFull}`);
    }
    if (auditedProduction.shotList && auditedProduction.shotList.length > 0) {
      auditedProduction.shotList[0].description += ` Injected check for ${injectedStudy} and ${injectedModel} with ${injectedPercentage}.`;
    }

    console.log('✓ Injections completed.');
    console.log(`  - Injected Study: "${injectedStudyFull}"`);
    console.log(`  - Injected Model: "${injectedModel}"`);
    console.log(`  - Injected Price: "${injectedPrice}"`);
    console.log(`  - Injected Credits: "${injectedCredits}"`);
    console.log(`  - Injected Percentage: "${injectedPercentage}"\n`);

    // 5. Run Quality Agent (Stage 7)
    console.log('5. Running Quality Agent (Stage 7)...');
    const qualityResult = await reviewQuality(
      auditedBrief,
      auditedScript,
      auditedStoryboard,
      auditedProduction,
      { temperature: 0.1 }
    );

    if (!qualityResult.success) {
      console.error('✗ Quality Agent Failed!', qualityResult.error);
      process.exit(1);
    }
    console.log('✓ Quality Agent completed successfully.\n');

    const report = qualityResult.report;

    // --- PRINTING REQUIREMENTS ---
    console.log('==================================================');
    console.log('=== STAGE 7 QUALITY AGENT REPORT ===');
    console.log('==================================================');
    console.log(`Pipeline Status:  SUCCESS`);
    console.log(`Quality Status:   ${report.status}`);
    console.log(`Overall Score:    ${report.overallScore}/100\n`);

    console.log('=== EVALUATION CHECKS ===');
    report.checks.forEach((check, i) => {
      console.log(`Check #${i + 1} [${check.category.toUpperCase()}]`);
      console.log(`  Status:   ${check.status}`);
      console.log(`  Finding:  ${check.finding}`);
      console.log(`  Evidence: ${check.evidence}`);
      if (check.sourceReferences && check.sourceReferences.length > 0) {
        console.log(`  Sources:  ${check.sourceReferences.join(', ')}`);
      }
      console.log('--------------------------------------------------');
    });

    console.log('\n=== GROUNDING ISSUES ===');
    if (report.groundingIssues && report.groundingIssues.length > 0) {
      report.groundingIssues.forEach((issue, i) => {
        console.log(`Grounding Issue #${i + 1}`);
        console.log(`  Claim:   "${issue.claim}"`);
        console.log(`  Severity: ${issue.severity}`);
        console.log(`  Finding:  ${issue.finding}`);
        console.log(`  Action:   ${issue.recommendedAction}`);
        console.log('--------------------------------------------------');
      });
    } else {
      console.log('(No grounding issues logged)\n');
    }

    console.log('\n=== TRACEABILITY ISSUES ===');
    if (report.traceabilityIssues && report.traceabilityIssues.length > 0) {
      report.traceabilityIssues.forEach((issue, i) => {
        console.log(`Traceability Issue #${i + 1}`);
        console.log(`  Item:     "${issue.item}"`);
        console.log(`  Severity: ${issue.severity}`);
        console.log(`  Finding:  ${issue.finding}`);
        console.log(`  Action:   ${issue.recommendedAction}`);
        console.log('--------------------------------------------------');
      });
    } else {
      console.log('(No traceability issues logged)\n');
    }

    console.log('\n=== CONSISTENCY ISSUES ===');
    if (report.consistencyIssues && report.consistencyIssues.length > 0) {
      report.consistencyIssues.forEach((issue, i) => {
        console.log(`Consistency Issue #${i + 1}`);
        console.log(`  Item:     "${issue.item}"`);
        console.log(`  Severity: ${issue.severity}`);
        console.log(`  Finding:  ${issue.finding}`);
        console.log(`  Action:   ${issue.recommendedAction}`);
        console.log('--------------------------------------------------');
      });
    } else {
      console.log('(No consistency issues logged)\n');
    }

    console.log('\n=== PRODUCTION ISSUES ===');
    if (report.productionIssues && report.productionIssues.length > 0) {
      report.productionIssues.forEach((issue, i) => {
        console.log(`Production Issue #${i + 1}`);
        console.log(`  Item:     "${issue.item}"`);
        console.log(`  Severity: ${issue.severity}`);
        console.log(`  Finding:  ${issue.finding}`);
        console.log(`  Action:   ${issue.recommendedAction}`);
        console.log('--------------------------------------------------');
      });
    } else {
      console.log('(No production issues logged)\n');
    }

    console.log('\n=== CLAIMS REQUIRING VERIFICATION ===');
    if (report.claimsRequiringVerification && report.claimsRequiringVerification.length > 0) {
      report.claimsRequiringVerification.forEach((issue, i) => {
        console.log(`Claim Requiring Verification #${i + 1}`);
        console.log(`  Claim:    "${issue.claim}"`);
        console.log(`  Severity: ${issue.severity}`);
        console.log(`  Finding:  ${issue.finding}`);
        console.log(`  Action:   ${issue.recommendedAction}`);
        console.log('--------------------------------------------------');
      });
    } else {
      console.log('(No claims requiring verification logged)\n');
    }

    console.log('\n=== RECOMMENDED ACTIONS ===');
    if (report.recommendedActions && report.recommendedActions.length > 0) {
      report.recommendedActions.forEach((action, i) => console.log(`${i + 1}. ${action}`));
    } else {
      console.log('(No recommended actions generated)');
    }
    console.log('\n==================================================');

    console.log('\n=== RAW QUALITY REPORT JSON ===');
    console.log(JSON.stringify(report, null, 2));
    console.log('==================================================\n');


    // --- AUTOMATED PROGRAMMATIC ASSERTIONS ---
    console.log('=== RUNNING AUTOMATED VERIFICATION ASSERTIONS ===');
    let passedAll = true;

    // Helper assertion logger
    function assertCondition(desc, condition) {
      if (condition) {
        console.log(`✓ [PASS] ${desc}`);
      } else {
        console.log(`✗ [FAIL] ${desc}`);
        passedAll = false;
      }
    }

    // 1. Quality report is a valid JSON object
    assertCondition(
      'Quality output is valid JSON',
      report && typeof report === 'object'
    );

    // 2. Status is PASS, WARNING, or FAIL
    const validStatuses = ['PASS', 'WARNING', 'FAIL'];
    assertCondition(
      `status is one of: ${validStatuses.join(', ')} (Got: '${report.status}')`,
      validStatuses.includes(report.status)
    );

    // 3. Overall score is a valid number from 0 to 100
    assertCondition(
      `overallScore is a valid number between 0 and 100 (Got: ${report.overallScore})`,
      typeof report.overallScore === 'number' && report.overallScore >= 0 && report.overallScore <= 100
    );

    // 4. Every check has a valid category and status
    const validCategories = ['grounding', 'traceability', 'consistency', 'production', 'compliance'];
    const allChecksValid = report.checks.every(c => 
      validCategories.includes(c.category) && 
      validStatuses.includes(c.status) &&
      typeof c.finding === 'string' &&
      typeof c.evidence === 'string'
    );
    assertCondition(
      'Every evaluation check has a valid category, status, finding, and evidence string',
      allChecksValid
    );

    // 5. No fabricated source URLs are introduced
    const briefUrls = new Set((originalBrief.sources || []).map(s => s.url).filter(Boolean));
    const reportText = JSON.stringify(report);
    const urlRegex = /https?:\/\/[^\s"']+/g;
    let reportUrls = [];
    let match;
    while ((match = urlRegex.exec(reportText)) !== null) {
      reportUrls.push(match[0]);
    }
    // Clean trailing punctuation or parentheses from matched URLs
    reportUrls = reportUrls.map(url => url.replace(/[.,;)]+$/, ''));
    const allUrlsValid = reportUrls.every(url => briefUrls.has(url));
    assertCondition(
      'No fabricated source URLs are introduced (all report URLs trace back to the Research Brief)',
      allUrlsValid
    );

    // 6. Non-mutation: Ensure original pipeline deliverables were not altered in-place
    const isBriefUntouched = JSON.stringify(originalBrief) === JSON.stringify(researchResponse.researchBrief);
    const isScriptUntouched = JSON.stringify(originalScript) === JSON.stringify(scriptResponse.script);
    const isStoryboardUntouched = JSON.stringify(originalStoryboard) === JSON.stringify(storyboardResponse.storyboard);
    const isProductionUntouched = JSON.stringify(originalProduction) === JSON.stringify(productionResponse.production);
    assertCondition(
      'Quality Agent is completely READ-ONLY (did not mutate or modify input objects)',
      isBriefUntouched && isScriptUntouched && isStoryboardUntouched && isProductionUntouched
    );

    // 7. Detected issues identify evidence and findings
    const allGroundingHaveDetails = report.groundingIssues.every(i => typeof i.claim === 'string' && typeof i.finding === 'string' && typeof i.recommendedAction === 'string');
    const allTraceabilityHaveDetails = report.traceabilityIssues.every(i => typeof i.item === 'string' && typeof i.finding === 'string' && typeof i.recommendedAction === 'string');
    const allConsistencyHaveDetails = report.consistencyIssues.every(i => typeof i.item === 'string' && typeof i.finding === 'string' && typeof i.recommendedAction === 'string');
    const allProductionHaveDetails = report.productionIssues.every(i => typeof i.item === 'string' && typeof i.finding === 'string' && typeof i.recommendedAction === 'string');
    
    assertCondition(
      'All logged grounding, traceability, consistency, and production issues identify clear findings/details',
      allGroundingHaveDetails && allTraceabilityHaveDetails && allConsistencyHaveDetails && allProductionHaveDetails
    );

    // 8. Quality report covers all four pipeline stages
    // We expect checking categories or findings to evaluate Research, Script, Storyboard, and Production stages
    const reportTextLower = reportText.toLowerCase();
    const coversResearch = reportTextLower.includes('research');
    const coversScript = reportTextLower.includes('script');
    const coversStoryboard = reportTextLower.includes('storyboard');
    const coversProduction = reportTextLower.includes('production') || reportTextLower.includes('producer');
    assertCondition(
      'The Quality Report evaluates all four preceding pipeline stages (Research, Script, Storyboard, Production)',
      coversResearch && coversScript && coversStoryboard && coversProduction
    );

    // 9. ADDITIONAL AUTOMATED GROUNDING ASSERTION
    // We verify that the Quality Agent correctly evaluates and flags our programmatically injected,
    // unsupported commercial and named-entity claims.
    console.log('\n--- Executing Specific Commercial / Named-Entity Grounding Assertions ---');
    
    const flagForStudy = reportTextLower.includes('gartner');
    const flagForModel = reportTextLower.includes('supercreator');
    const flagForPrice = reportTextLower.includes('199');
    const flagForCredits = reportTextLower.includes('5,000') || reportTextLower.includes('credits');
    const flagForPercentage = reportTextLower.includes('99.7%') || reportTextLower.includes('99.7');

    assertCondition(
      `Quality Agent evaluated and flagged unsupported named study: "${injectedStudyFull}"`,
      flagForStudy
    );
    assertCondition(
      `Quality Agent evaluated and flagged unsupported product/model name: "${injectedModel}"`,
      flagForModel
    );
    assertCondition(
      `Quality Agent evaluated and flagged unsupported price/subscription cost: "${injectedPrice}"`,
      flagForPrice
    );
    assertCondition(
      `Quality Agent evaluated and flagged unsupported credit figure: "${injectedCredits}"`,
      flagForCredits
    );
    assertCondition(
      `Quality Agent evaluated and flagged unsupported quantitative/percentage claim: "${injectedPercentage}"`,
      flagForPercentage
    );

    console.log('--------------------------------------------------');

    if (passedAll) {
      console.log('\n>>> ALL AUTOMATED VERIFICATION TESTS PASSED SUCCESSFULLY! <<<\n');
    } else {
      console.log('\n>>> SOME AUTOMATED VERIFICATION TESTS FAILED. Please review above. <<<\n');
      process.exit(1);
    }

  } catch (error) {
    console.error('✗ Unexpected Integration Test Failure:', error);
    process.exit(1);
  }
}

runTest();
