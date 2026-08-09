import { researchTopic } from './researchAgent.js';
import { generateScript } from './scriptAgent.js';

async function runIntegrationTest() {
  const topic = "Latest trends in AI tools for solo video creators";
  console.log("==================================================");
  console.log("Starting Script Agent Integration Test...");
  console.log(`Researching: "${topic}"...\n`);

  try {
    // 1. Run Research Agent
    const researchResponse = await researchTopic(topic);
    if (!researchResponse.success) {
      console.error("--- Research Agent Failed! ---");
      console.error(`Step: ${researchResponse.step}`);
      console.error(`Error: ${researchResponse.error}`);
      console.log("==================================================");
      return;
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
      return;
    }

    console.log("--- Script Agent Success! ---\n");

    const script = scriptResponse.script;

    console.log("=== VIDEO SCRIPT ===\n");
    console.log(`Title: ${script.title || ''}`);
    console.log(`Audience: ${script.audience || ''}`);
    console.log(`Platform: ${script.platform || ''}`);
    console.log(`Tone: ${script.tone || ''}`);
    console.log(`Target Duration: ${script.targetDuration || ''}`);
    console.log(`Format: ${script.format || ''}\n`);

    console.log("=== HOOK ===\n");
    console.log(`${script.hook || ''}\n`);

    console.log("=== SECTIONS ===\n");
    if (script.sections && Array.isArray(script.sections)) {
      script.sections.forEach((section, idx) => {
        console.log(`Section ${idx + 1}:`);
        console.log(`Heading: ${section.heading || ''}`);
        console.log(`Purpose: ${section.purpose || ''}`);
        console.log(`Narration: ${section.narration || ''}`);
        
        console.log("Visual Suggestions:");
        if (section.visualSuggestions && Array.isArray(section.visualSuggestions)) {
          section.visualSuggestions.forEach(vis => console.log(`  - ${vis}`));
        } else {
          console.log("  - None");
        }

        console.log("On-Screen Text:");
        if (section.onScreenText && Array.isArray(section.onScreenText)) {
          section.onScreenText.forEach(ost => console.log(`  - ${ost}`));
        } else {
          console.log("  - None");
        }

        console.log("Sources:");
        if (section.sourceReferences && Array.isArray(section.sourceReferences)) {
          section.sourceReferences.forEach(srcRef => console.log(`  - ${srcRef}`));
        } else {
          console.log("  - None");
        }
        console.log("");
      });
    } else {
      console.log("(No sections returned)\n");
    }

    console.log("=== CALL TO ACTION ===\n");
    console.log(`${script.callToAction || ''}\n`);

    console.log("=== SOURCES ===\n");
    if (script.sources && Array.isArray(script.sources)) {
      script.sources.forEach(src => console.log(`- ${src}`));
    } else {
      console.log("(No sources returned)");
    }
    console.log("");

    console.log("=== CLAIMS REQUIRING VERIFICATION ===\n");
    if (script.claimsRequiringVerification && Array.isArray(script.claimsRequiringVerification)) {
      script.claimsRequiringVerification.forEach(claim => console.log(`- ${claim}`));
    } else {
      console.log("(No claims requiring verification returned)");
    }
    console.log("");

    console.log("==================================================");

  } catch (error) {
    console.error("--- Unexpected Integration Test Failure ---");
    console.error(error);
    console.log("==================================================");
  }
}

runIntegrationTest();
