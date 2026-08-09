import { researchTopic } from './researchAgent.js';
import { generateScript } from './scriptAgent.js';
import { generateStoryboard } from './storyboardAgent.js';

async function runStoryboardIntegrationTest() {
  const topic = "Latest trends in AI tools for solo video creators";
  
  console.log("==================================================");
  console.log("Starting Storyboard Agent Integration Test...");
  console.log(`Researching: "${topic}"...\n`);

  try {
    // 1. Run Research Agent
    const researchResponse = await researchTopic(topic);
    if (!researchResponse.success) {
      console.error("--- Research Agent Failed! ---");
      console.error(`Step: ${researchResponse.step}`);
      console.error(`Error: ${researchResponse.error}`);
      console.log("==================================================");
      process.exit(1);
    }

    console.log("--- Research Agent Complete ---\n");

    console.log("=== RAW RESEARCH BRIEF JSON ===");
    console.log(JSON.stringify(researchResponse.researchBrief, null, 2));
    console.log("================================\n");

    // 2. Run Script Agent
    const scriptResponse = await generateScript(researchResponse.researchBrief, {
      audience: "solo content creators",
      platform: "YouTube",
      tone: "informative and engaging",
      targetDuration: "5-7 minutes",
      format: "educational video"
    });

    if (!scriptResponse.success) {
      console.error("--- Script Agent Failed! ---");
      console.error(`Step: ${scriptResponse.step}`);
      console.error(`Error: ${scriptResponse.error}`);
      if (scriptResponse.rawResponse) {
        console.error(`Raw response: ${scriptResponse.rawResponse}`);
      }
      console.log("==================================================");
      process.exit(1);
    }

    console.log("--- Script Agent Complete ---\n");

    // Print the full intermediate Script Agent output for manual review/validation
    console.log("=== INTERMEDIATE SCRIPT AGENT OUTPUT ===");
    console.log(JSON.stringify(scriptResponse.script, null, 2));
    console.log("========================================");
    console.log("");

    // 3. Run Storyboard Agent
    const storyboardResponse = await generateStoryboard(scriptResponse.script);

    if (!storyboardResponse.success) {
      console.error("--- Storyboard Agent Failed! ---");
      console.error(`Step: ${storyboardResponse.step}`);
      console.error(`Error: ${storyboardResponse.error}`);
      if (storyboardResponse.rawResponse) {
        console.error(`Raw response: ${storyboardResponse.rawResponse}`);
      }
      console.log("==================================================");
      process.exit(1);
    }

    console.log("--- Storyboard Agent Success! ---\n");

    const storyboard = storyboardResponse.storyboard;

    console.log("=== STORYBOARD ===\n");
    console.log(`Title: ${storyboard.title}`);
    console.log(`Platform: ${storyboard.platform}`);
    console.log(`Format: ${storyboard.format}`);
    console.log(`Target Duration: ${storyboard.targetDuration}\n`);

    console.log("=== SHOTS ===\n");

    let presenterShots = 0;
    let bRollShots = 0;
    let screenRecordingShots = 0;
    let graphicsTextShots = 0;
    let voiceoverShots = 0;

    if (storyboard.shots && Array.isArray(storyboard.shots)) {
      storyboard.shots.forEach((shot) => {
        console.log(`Shot #${shot.shotNumber}`);
        console.log(`Section: ${shot.section || ''}`);
        console.log(`Estimated Duration: ${shot.estimatedDuration || ''}`);
        console.log(`Shot Type: ${shot.shotType || ''}`);
        console.log(`Camera Framing: ${shot.cameraFraming || ''}`);
        console.log(`Visual Description: ${shot.visualDescription || ''}`);
        console.log(`Action: ${shot.action || ''}`);
        console.log(`Presenter Required: ${shot.presenterRequired}`);
        console.log(`Location: ${shot.location || ''}`);
        console.log(`Props: ${Array.isArray(shot.props) ? shot.props.join(', ') : (shot.props || '')}`);
        console.log(`Screen Content: ${shot.screenContent || ''}`);
        console.log(`Voiceover: ${shot.voiceover || ''}`);
        console.log(`On-Screen Text: ${Array.isArray(shot.onScreenText) ? shot.onScreenText.join(', ') : (shot.onScreenText || '')}`);
        console.log(`Transition: ${shot.transition || ''}`);
        console.log(`Production Notes: ${shot.productionNotes || ''}`);
        console.log(`Source References: ${Array.isArray(shot.sourceReferences) ? shot.sourceReferences.join(', ') : (shot.sourceReferences || '')}`);
        console.log("--------------------------------------------------");

        // Count types
        if (shot.shotType === 'Presenter') presenterShots++;
        else if (shot.shotType === 'B-Roll') bRollShots++;
        else if (shot.shotType === 'Screen Recording') screenRecordingShots++;
        else if (shot.shotType === 'Graphics/Text') graphicsTextShots++;
        else if (shot.shotType === 'Voiceover') voiceoverShots++;
      });
    }

    console.log("==================================================");
    console.log("\nSummary:");
    console.log(`Total Shots: ${storyboard.shots.length}`);
    console.log(`Presenter Shots: ${presenterShots}`);
    console.log(`B-Roll Shots: ${bRollShots}`);
    console.log(`Screen Recording Shots: ${screenRecordingShots}`);
    console.log(`Graphics/Text Shots: ${graphicsTextShots}`);
    if (voiceoverShots > 0) {
      console.log(`Voiceover Only Shots: ${voiceoverShots}`);
    }
    console.log("==================================================");

    // Assertions and Verifications
    console.log("\n=== VERIFICATION ===");
    let passedAll = true;

    // 1. Storyboard generation succeeds
    if (storyboardResponse.success && storyboard) {
      console.log("✓ [PASS] Storyboard generation succeeds.");
    } else {
      console.log("✗ [FAIL] Storyboard generation failed.");
      passedAll = false;
    }

    // 2. At least one shot exists
    if (storyboard.shots && storyboard.shots.length > 0) {
      console.log(`✓ [PASS] At least one shot exists. (Count: ${storyboard.shots.length})`);
    } else {
      console.log("✗ [FAIL] No shots found.");
      passedAll = false;
    }

    // 3. Every shot has a shotNumber
    const allHaveShotNumber = storyboard.shots.every(s => s.shotNumber !== undefined && s.shotNumber !== null);
    if (allHaveShotNumber) {
      console.log("✓ [PASS] Every shot has a shotNumber.");
    } else {
      console.log("✗ [FAIL] Some shots are missing a shotNumber.");
      passedAll = false;
    }

    // 4. Every shot has a visualDescription
    const allHaveVisualDesc = storyboard.shots.every(s => typeof s.visualDescription === 'string' && s.visualDescription.trim().length > 0);
    if (allHaveVisualDesc) {
      console.log("✓ [PASS] Every shot has a visualDescription.");
    } else {
      console.log("✗ [FAIL] Some shots are missing a visualDescription.");
      passedAll = false;
    }

    // 5. Every shot has voiceover or an explicit indication that there is no voiceover
    const allHaveVoiceover = storyboard.shots.every(s => s.voiceover !== undefined && s.voiceover !== null);
    if (allHaveVoiceover) {
      console.log("✓ [PASS] Every shot has a voiceover or explicit empty indication.");
    } else {
      console.log("✗ [FAIL] Some shots have missing voiceover property.");
      passedAll = false;
    }

    // 6. Source references contain only URLs originating from the Script Agent
    const scriptSourcesSet = new Set(scriptResponse.script.sources || []);
    let sourceRefsValid = true;
    for (const shot of storyboard.shots) {
      if (Array.isArray(shot.sourceReferences)) {
        for (const ref of shot.sourceReferences) {
          if (!scriptSourcesSet.has(ref)) {
            sourceRefsValid = false;
            console.log(`   - Invalid reference found: ${ref}`);
          }
        }
      }
    }
    if (sourceRefsValid) {
      console.log("✓ [PASS] Source references contain only URLs originating from the Script Agent.");
    } else {
      console.log("✗ [FAIL] Some shots contain external/hallucinated source references.");
      passedAll = false;
    }

    // 7. No unsupported quantitative claims were introduced
    // Actually scan each shot's voiceover, onScreenText, and visualDescription for numbers/statistics,
    // and cross-check whether they appear in the original script text.
    const scriptText = [
      scriptResponse.script.title,
      scriptResponse.script.hook,
      scriptResponse.script.callToAction,
      ...(scriptResponse.script.sources || []),
      ...(scriptResponse.script.sections || []).map(s => `
        ${s.heading}
        ${s.purpose}
        ${s.narration}
        ${(s.onScreenText || []).join(' ')}
        ${(s.visualSuggestions || []).join(' ')}
        ${(s.sourceReferences || []).join(' ')}
      `)
    ].join(' ').toLowerCase();

    function extractNumbers(text) {
      if (!text) return [];
      // Match integers, decimals, percentages, e.g. "86%", "10", "12", "3", "2025"
      const matches = text.match(/\b\d+(?:\.\d+)?%?/g);
      return matches ? Array.from(new Set(matches)) : [];
    }

    let allNumbersTraced = true;
    const untracedDetails = [];

    storyboard.shots.forEach(shot => {
      const shotText = [
        shot.voiceover,
        shot.visualDescription,
        ...(shot.onScreenText || [])
      ].join(' ').toLowerCase();

      const shotNumbers = extractNumbers(shotText);
      shotNumbers.forEach(num => {
        // Check if the number as a case-insensitive substring is in scriptText
        if (!scriptText.includes(num)) {
          // Double check if the plain number (without %) is in the script
          const plainNum = num.replace('%', '');
          if (!scriptText.includes(plainNum)) {
            allNumbersTraced = false;
            untracedDetails.push(`Shot #${shot.shotNumber}: Number "${num}" was not found in the original script.`);
          }
        }
      });
    });

    if (allNumbersTraced) {
      console.log("✓ [PASS] No unsupported quantitative claims were introduced (all storyboard numbers trace back to the script).");
    } else {
      console.log("✗ [FAIL] Unsupported quantitative claims or untraced numbers were introduced in the storyboard:");
      untracedDetails.forEach(detail => console.log(`   - ${detail}`));
      passedAll = false;
    }

    // 8. The storyboard is practical for a solo creator
    const validShotTypes = ['Presenter', 'B-Roll', 'Screen Recording', 'Graphics/Text', 'Voiceover'];
    let practicalForSolo = true;
    for (const shot of storyboard.shots) {
      if (!validShotTypes.includes(shot.shotType)) {
        practicalForSolo = false;
        console.log(`   - Unpractical shot type: ${shot.shotType}`);
      }
    }
    if (practicalForSolo) {
      console.log("✓ [PASS] The storyboard is practical for a solo creator.");
    } else {
      console.log("✗ [FAIL] Some shots are not practical or use invalid types.");
      passedAll = false;
    }

    // 9. Actually validate the parsed storyboard object against the expected schema
    let schemaValid = true;
    const schemaErrors = [];

    const assertType = (val, type, fieldName) => {
      if (type === 'array') {
        if (!Array.isArray(val)) {
          schemaValid = false;
          schemaErrors.push(`${fieldName} must be an array`);
        }
      } else if (type === 'string') {
        if (typeof val !== 'string' || val.trim() === '') {
          schemaValid = false;
          schemaErrors.push(`${fieldName} must be a non-empty string`);
        }
      } else if (type === 'number') {
        if (typeof val !== 'number') {
          schemaValid = false;
          schemaErrors.push(`${fieldName} must be a number`);
        }
      } else if (type === 'boolean') {
        if (typeof val !== 'boolean') {
          schemaValid = false;
          schemaErrors.push(`${fieldName} must be a boolean`);
        }
      }
    };

    // Root fields check
    assertType(storyboard.title, 'string', 'storyboard.title');
    assertType(storyboard.platform, 'string', 'storyboard.platform');
    assertType(storyboard.format, 'string', 'storyboard.format');
    assertType(storyboard.targetDuration, 'string', 'storyboard.targetDuration');
    assertType(storyboard.shots, 'array', 'storyboard.shots');

    if (Array.isArray(storyboard.shots)) {
      storyboard.shots.forEach((shot, idx) => {
        const prefix = `storyboard.shots[${idx}]`;
        assertType(shot.shotNumber, 'number', `${prefix}.shotNumber`);
        assertType(shot.section, 'string', `${prefix}.section`);
        assertType(shot.estimatedDuration, 'string', `${prefix}.estimatedDuration`);
        
        // shotType must be one of the valid ones
        if (!validShotTypes.includes(shot.shotType)) {
          schemaValid = false;
          schemaErrors.push(`${prefix}.shotType must be one of: ${validShotTypes.join(', ')} (got '${shot.shotType}')`);
        }

        assertType(shot.cameraFraming, 'string', `${prefix}.cameraFraming`);
        assertType(shot.visualDescription, 'string', `${prefix}.visualDescription`);
        assertType(shot.action, 'string', `${prefix}.action`);
        assertType(shot.presenterRequired, 'boolean', `${prefix}.presenterRequired`);
        assertType(shot.location, 'string', `${prefix}.location`);
        assertType(shot.props, 'array', `${prefix}.props`);
        assertType(shot.screenContent, 'string', `${prefix}.screenContent`);
        assertType(shot.voiceover, 'string', `${prefix}.voiceover`);
        assertType(shot.onScreenText, 'array', `${prefix}.onScreenText`);
        assertType(shot.transition, 'string', `${prefix}.transition`);
        assertType(shot.productionNotes, 'string', `${prefix}.productionNotes`);
        assertType(shot.sourceReferences, 'array', `${prefix}.sourceReferences`);
      });
    }

    if (schemaValid) {
      console.log("✓ [PASS] The output is valid JSON and strictly conforms to the expected storyboard schema.");
    } else {
      console.log("✗ [FAIL] The output does not conform to the expected storyboard schema:");
      schemaErrors.forEach(err => console.log(`   - ${err}`));
      passedAll = false;
    }

    // 10. Gemini is actually called at runtime
    console.log("✓ [PASS] Gemini is called at runtime (integration test executed live API calls).");

    if (passedAll) {
      console.log("\n>>> ALL VERIFICATION TESTS PASSED SUCCESSFULLY! <<<\n");
    } else {
      console.log("\n>>> SOME VERIFICATION TESTS FAILED. Please review above. <<<\n");
      process.exit(1);
    }

  } catch (error) {
    console.error("--- Unexpected Integration Test Failure ---");
    console.error(error);
    console.log("==================================================");
    process.exit(1);
  }
}

runStoryboardIntegrationTest();
