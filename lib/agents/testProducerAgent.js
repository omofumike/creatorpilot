import { researchTopic } from './researchAgent.js';
import { generateScript } from './scriptAgent.js';
import { generateStoryboard } from './storyboardAgent.js';
import { generateProductionPlan } from './producerAgent.js';

async function runProductionIntegrationTest() {
  const topic = "Latest trends in AI tools for solo video creators";
  
  console.log("==================================================");
  console.log("Starting Production Agent Integration Test...");
  console.log(`Pipeline Topic: "${topic}"\n`);

  try {
    // 1. Run Research Agent
    console.log("Running Research Agent...");
    const researchResponse = await researchTopic(topic);
    if (!researchResponse.success) {
      console.error("--- Research Agent Failed! ---");
      console.error(`Error: ${researchResponse.error}`);
      process.exit(1);
    }
    console.log("✓ Research Agent completed\n");

    // 2. Run Script Agent
    console.log("Running Script Agent...");
    const scriptResponse = await generateScript(researchResponse.researchBrief, {
      audience: "solo content creators",
      platform: "YouTube",
      tone: "informative and engaging",
      targetDuration: "5-7 minutes",
      format: "educational video"
    });
    if (!scriptResponse.success) {
      console.error("--- Script Agent Failed! ---");
      console.error(`Error: ${scriptResponse.error}`);
      process.exit(1);
    }
    console.log("✓ Script Agent completed\n");

    // 3. Run Storyboard Agent
    console.log("Running Storyboard Agent...");
    const storyboardResponse = await generateStoryboard(scriptResponse.script);
    if (!storyboardResponse.success) {
      console.error("--- Storyboard Agent Failed! ---");
      console.error(`Error: ${storyboardResponse.error}`);
      process.exit(1);
    }
    console.log("✓ Storyboard Agent completed\n");

    console.log("=== STORYBOARD SHOTS (for grounding check) ===");
    storyboardResponse.storyboard.shots.forEach(s => {
      console.log(`Shot #${s.shotNumber}: ${s.visualDescription}`);
    });
    console.log("==============================================\n");

    // 4. Run Production Agent
    console.log("Running Production Agent...");
    const productionResponse = await generateProductionPlan(storyboardResponse.storyboard);
    if (!productionResponse.success) {
      console.error("--- Production Agent Failed! ---");
      console.error(`Error: ${productionResponse.error}`);
      process.exit(1);
    }
    console.log("✓ Production Agent completed\n");

    const production = productionResponse.production;

    console.log("=== PRODUCTION PLAN SUMMARY ===\n");
    console.log(`Production title: ${production.title}`);
    console.log(`Number of shots: ${production.shotList.length}`);
    console.log(`Number of filming checklist items: ${production.filmingChecklist.length}`);
    console.log(`Equipment: ${production.equipment.join(', ')}`);
    console.log(`Locations: ${production.locations.join(', ')}`);
    console.log(`Props: ${production.props.join(', ') || 'None'}`);
    console.log(`Screen recording requirements: ${production.screenRecordingRequirements.join(', ') || 'None'}`);
    console.log(`Audio requirements: ${production.audioRequirements.join(', ') || 'None'}`);
    console.log(`Warnings: ${production.warnings.join(', ') || 'None'}\n`);

    console.log("=== RAW PRODUCTION JSON ===");
    console.log(JSON.stringify(production, null, 2));
    console.log("============================\n");

    // Verification
    console.log("=== VERIFICATION ===");
    let passed = true;

    // 1. Traceability Check
    const storyboardShotNumbers = new Set(storyboardResponse.storyboard.shots.map(s => s.shotNumber));
    const allShotsTraced = production.shotList.every(s => storyboardShotNumbers.has(s.storyboardShotNumber));
    if (allShotsTraced) {
      console.log("✓ [PASS] Every production shot maps to a real storyboard shot.");
    } else {
      console.log("✗ [FAIL] Some production shots reference non-existent storyboard shots.");
      passed = false;
    }

    // 2. Grounding Check (No prices/commercials/hallucinations)
    // We search for currency symbols or keywords related to pricing in the production plan
    const productionText = JSON.stringify(production).toLowerCase();
    const forbiddenKeywords = ['$', '€', '£', 'price', 'cost', 'subscription', 'credit', 'dollars', 'monthly', 'yearly'];
    const foundKeywords = forbiddenKeywords.filter(k => productionText.includes(k));
    
    // We need to be careful, "cost" might appear in generic advice like "reduce costs", 
    // but we'll flag it for manual review if found.
    if (foundKeywords.length === 0) {
      console.log("✓ [PASS] No unsupported commercial/pricing information detected (Currency/Pricing keywords).");
    } else {
      console.log(`! [WARN] Potential commercial/pricing keywords found: ${foundKeywords.join(', ')}. Please manually verify they are not hallucinated facts.`);
    }

    // 3. URL/Source Check
    const storyboardUrls = new Set();
    storyboardResponse.storyboard.shots.forEach(s => {
      if (Array.isArray(s.sourceReferences)) {
        s.sourceReferences.forEach(url => storyboardUrls.add(url));
      }
    });

    const productionUrls = [];
    const urlRegex = /https?:\/\/[^\s"']+/g;
    let match;
    while ((match = urlRegex.exec(productionText)) !== null) {
      productionUrls.push(match[0]);
    }

    const allUrlsValid = productionUrls.every(url => storyboardUrls.has(url));
    if (allUrlsValid) {
      console.log("✓ [PASS] No new URLs or sources were introduced.");
    } else {
      console.log("✗ [FAIL] New/hallucinated URLs found in production plan.");
      passed = false;
    }

    // 4. Solo Creator Realism
    const soloKeywords = ['crew', 'assistant', 'operator', 'actors', 'studio', 'director'];
    const foundSoloViolations = soloKeywords.filter(k => productionText.includes(` ${k} `) || productionText.includes(`${k}s`));
    if (foundSoloViolations.length === 0) {
      console.log("✓ [PASS] Production plan appears realistic for one creator (no crew/studio keywords detected).");
    } else {
      console.log(`! [WARN] Potential solo creator violations found: ${foundSoloViolations.join(', ')}. Please manually verify.`);
    }

    if (passed) {
      console.log("\n>>> ALL AUTOMATED VERIFICATIONS PASSED SUCCESSFULLY! <<<\n");
    } else {
      console.log("\n>>> SOME VERIFICATIONS FAILED. PLEASE REVIEW. <<<\n");
      process.exit(1);
    }

  } catch (error) {
    console.error("--- Unexpected Integration Test Failure ---");
    console.error(error);
    process.exit(1);
  }
}

runProductionIntegrationTest();
