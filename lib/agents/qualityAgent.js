import { ai } from '../utils/gemini.js';
import { config } from '../utils/config.js';
import { PRODUCTION_TYPES } from '../utils/productionTypes.js';

/**
 * Strips potential markdown code block wrappers around JSON content.
 * 
 * @param {string} text - Raw text response from Gemini.
 * @returns {string} Cleaned JSON string.
 */
function cleanJsonResponse(text) {
  if (!text) return '';
  let cleaned = text.trim();
  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.substring(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.substring(3);
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.substring(0, cleaned.length - 3);
  }
  return cleaned.trim();
}

/**
 * Safely redacts sensitive API keys from error messages.
 * 
 * @param {string} message - Error message.
 * @returns {string} Cleaned error message.
 */
function redactApiKeys(message) {
  if (!message) return '';
  let redacted = message;
  const keysToRedact = [config.geminiApiKey, config.parallelApiKey].filter(Boolean);
  for (const key of keysToRedact) {
    redacted = redacted.replace(new RegExp(key, 'g'), '[REDACTED_API_KEY]');
  }
  return redacted;
}

/**
 * Reviews a complete content package (Research Brief, Script, Storyboard, and Production Plan)
 * for literal text grounding, consistency, compliance, and solo-creator feasibility.
 * 
 * This agent is READ-ONLY and will never mutate or modify any of the supplied objects.
 * 
 * @param {Object} researchBrief - The structured research brief from Research Agent.
 * @param {Object} script - The structured script from Script Agent.
 * @param {Object} storyboard - The structured storyboard from Storyboard Agent.
 * @param {Object} production - The structured production plan from Production Agent.
 * @param {Object} [options] - Configuration and evaluation options.
 * @param {number} [options.temperature] - Generation temperature. Defaults to 0.1 for deterministic auditing.
 * @returns {Promise<Object>} Object indicating success and containing the structured Quality Report or error details.
 */
export async function reviewQuality(researchBrief, script, storyboard, production, options = {}) {
  // 1. Validate inputs exist
  if (!researchBrief) {
    return { success: false, error: 'Research brief is required.', step: 'validation' };
  }
  if (!script) {
    return { success: false, error: 'Script is required.', step: 'validation' };
  }
  if (!storyboard) {
    return { success: false, error: 'Storyboard is required.', step: 'validation' };
  }
  if (!production) {
    return { success: false, error: 'Production plan is required.', step: 'validation' };
  }

  // 2. Unpack inputs if they are wrapped in parent response objects
  let actualBrief = researchBrief;
  if (researchBrief.researchBrief && typeof researchBrief.researchBrief === 'object') {
    actualBrief = researchBrief.researchBrief;
  }

  let actualScript = script;
  if (script.script && typeof script.script === 'object') {
    actualScript = script.script;
  }

  let actualStoryboard = storyboard;
  if (storyboard.storyboard && typeof storyboard.storyboard === 'object') {
    actualStoryboard = storyboard.storyboard;
  }

  let actualProduction = production;
  if (production.production && typeof production.production === 'object') {
    actualProduction = production.production;
  }

  // Determine production type before conditional validation
  const productionType = actualScript.productionType || options.productionType;

  // Double check unpacked fields for basic structural validity
  if (!actualBrief.topic || !actualBrief.summary) {
    return { success: false, error: 'Invalid or incomplete Research Brief input.', step: 'validation' };
  }
  if (!actualScript.title) {
    return { success: false, error: 'Invalid or incomplete Script input.', step: 'validation' };
  }

  if (productionType === PRODUCTION_TYPES.SHORT_FILM) {
    if (!Array.isArray(actualScript.scenes)) {
      return { success: false, error: 'Invalid or incomplete Short Film Script input: scenes are required.', step: 'validation' };
    }
  } else {
    if (!Array.isArray(actualScript.sections)) {
      return { success: false, error: 'Invalid or incomplete Script input.', step: 'validation' };
    }
  }
  if (!actualStoryboard.title || !Array.isArray(actualStoryboard.shots)) {
    return { success: false, error: 'Invalid or incomplete Storyboard input.', step: 'validation' };
  }
  if (!actualProduction.title || !Array.isArray(actualProduction.shotList)) {
    return { success: false, error: 'Invalid or incomplete Production Plan input.', step: 'validation' };
  }

  const temperature = options.temperature ?? 0.1;

  // 3. Construct System Instruction for the Quality Agent
  const systemInstruction = `You are an expert Quality Assurance and Compliance Review Agent. Your primary mission is to conduct a highly analytical, strict, and independent audit of a complete generated content package (Research Brief, Script, Storyboard, and Production Plan).

You are a READ-ONLY auditor. You must never rewrite or modify any part of the supplied content. Your job is to evaluate, score, and explicitly flag any discrepancies or compliance violations.

You must return your output strictly in JSON format matching the schema described below. Do not include any introductory or concluding text, explanations, or Markdown code blocks. Just output raw, valid JSON.

JSON Schema Required Keys:
{
  "status": "PASS | WARNING | FAIL",
  "overallScore": 95,
  "summary": "A concise executive summary summarizing the overall compliance, grounding, consistency, and feasibility of the generated content package (2-3 paragraphs).",
  "checks": [
    {
      "category": "grounding | traceability | consistency | production | compliance",
      "status": "PASS | WARNING | FAIL",
      "finding": "Detailed description of what was checked and the specific result.",
      "evidence": "Quoted passage/element from the supplied documents that validates or invalidates this check. For a PASS check, write 'N/A'. For WARNING or FAIL, quote the exact problematic text.",
      "sourceReferences": ["URLs from the research brief or script relevant to this check, if any"]
    }
  ],
  "groundingIssues": [
    {
      "claim": "The exact factual, quantitative, commercial, product, organizational, study, attribution, date, capability, or other externally verifiable claim that lacks grounding.",
      "severity": "WARNING | FAIL",
      "finding": "A rigorous explanation of how the claim is ungrounded (i.e. it cannot be literally found or verified in the Research Brief).",
      "recommendedAction": "The explicit, actionable instruction on how to fix this issue (e.g., qualify the claim or remove it entirely)."
    }
  ],
  "traceabilityIssues": [
    {
      "item": "The specific shot number, section heading, source, or reference evaluated.",
      "severity": "WARNING | FAIL",
      "finding": "Explanation of failure to trace back to its origin (e.g. fabricated URL, unmatched storyboard shot number in production, or source not in research brief).",
      "recommendedAction": "Explicit step to resolve the traceability breakdown."
    }
  ],
  "consistencyIssues": [
    {
      "item": "The mismatched element (e.g. 'Shot #3 voiceover vs Script Section 2 narration').",
      "severity": "WARNING | FAIL",
      "finding": "Explanation of the direct contradiction or mismatch in narration, voiceover, on-screen text, visual descriptions, or props across the stages.",
      "recommendedAction": "Actionable step to align the mismatched stages."
    }
  ],
  "productionIssues": [
    {
      "item": "Specific filming step, ${productionType === PRODUCTION_TYPES.CREATOR_VIDEO ? 'filming checklist task, equipment, location, or warning.' : 'production task, equipment, location, or warning.'}",
      "severity": "WARNING | FAIL",
      "finding": "${productionType === PRODUCTION_TYPES.CREATOR_VIDEO ? 'Explanation of why it violates solo-creator feasibility (e.g., assumes crew, assistant, camera operator, multiple presenters, actors, professional multi-camera setups, expensive studios, complex setups).' : 'Explanation of why the production element is impractical, inconsistent, or problematic for cinematic standards (e.g., unrealistic camera movement, unachievable lighting, unclear blocking, inappropriate equipment for film). '}",
      "recommendedAction": "${productionType === PRODUCTION_TYPES.CREATOR_VIDEO ? 'Pragmatic advice to make it easily capturing-ready for a single person working alone with consumer-grade equipment.' : 'Actionable advice to resolve the cinematic or production issue.'}"
    }
  ],
  "claimsRequiringVerification": [
    {
      "claim": "Factual claim identified in the Research Brief as requiring verification.",
      "severity": "WARNING | FAIL",
      "finding": "Evaluation of whether downstream files (Script/Storyboard/Production) properly qualified it (e.g., using terms like 'reportedly', 'some sources suggest') or stated it as an absolute, unquestioned fact.",
      "recommendedAction": "Actionable instructions on how to handle, edit, or qualify this claim in final delivery."
    }
  ],
  "recommendedActions": [
    "High-level, prioritized, actionable step 1 to finalize and clean up the package",
    "High-level, prioritized, actionable step 2"
  ]
}

CRITICAL AUDITING AND GUARDRAIL RULES:

1. CRITICAL GROUNDING RULE (LITERAL TEXT MATCHING ONLY):
- You must judge grounding ONLY by literal comparison against the supplied Research Brief, Script, Storyboard, and Production Plan.
- You MUST NOT use your own general/world knowledge, pre-trained knowledge, assumptions, or sense of what 'sounds plausible' or 'seems reasonable' to approve a claim.
- For every factual, quantitative, commercial, product, organizational, study, attribution, date, capability, or other externally verifiable claim appearing in the Script, Storyboard, or Production Plan:
  - Compare it directly against the supplied Research Brief.
  - If the claim can be confirmed by direct textual evidence in the supplied Research Brief, it may be considered grounded (PASS).
  - If its presence cannot be confirmed by direct comparison, you MUST flag it as a grounding issue (WARNING or FAIL).
  - Never approve an unsupported claim merely because it appears plausible or factually likely.
  - Never use outside knowledge to fill a gap. Never perform independent web research to validate a claim.
  - When evidence is insufficient, the correct behavior is WARNING or FAIL, not approval.
- You must NOT introduce any new factual claims, statistics, organizations, studies, or URLs while explaining your findings. Your explanation should strictly reference only the text present in the provided files.

2. SPECIFIC COMMERCIAL / NAMED-ENTITY GROUNDING AUDIT (MANDATORY):
- Specifically inspect all supplied downstream documents (Script, Storyboard, Production Plan) for:
  - Named studies, research surveys, or reports (e.g. 'Gartner', 'Gartner Video Creator Survey').
  - Named organizations, companies, products, AI models, platforms, sources, authors, or attributions.
  - Specific prices, subscription costs, credits, percentages, monetary figures, dates associated with claims, or quantitative commercial comparisons.
- For EVERY such item, verify if it can be directly traced to the supplied Research Brief.
- You must list EVERY ungrounded named study, organization, company, product, model, price, credit, or statistic as a SEPARATE entry in "groundingIssues" and "traceabilityIssues". Do NOT skip or group them under a single generic entry. If 'Gartner' or 'SuperCreator AI' appears in the downstream documents but not in the Research Brief, you must explicitly write entries for each of them.

3. NO PROHIBITED THIRD-PARTY MODELS:
- Verify that downstream documents DO NOT recommend, mention, or position prohibited third-party AI models or platforms such as Claude, OpenAI, Anthropic, ChatGPT, GPT-4, etc., in any part of the text.
- Only Google Gemini / Google Cloud AI, YouTube-native AI, or generic AI terms (such as 'AI scriptwriter', 'AI tools') are permitted.
- If any prohibited third-party systems are mentioned, you MUST flag this as a FAIL in the compliance category.

4. AUTOMATION WITH HUMAN OVERSIGHT:
- Verify that descriptions of autonomous AI processes downstream do not imply that human supervision or review can be bypassed.
- If any downstream document suggests 100% fully autonomous, unsupervised AI execution without human review or strategic control, flag this as a WARNING or FAIL in the compliance category.

5. PRODUCTION-TYPE FEASIBILITY:
- If productionType is CREATOR_VIDEO, verify that every visual instruction, shot setup, and equipment requirement is practical and executable by a SINGLE person working alone.
- If productionType is SHORT_FILM, do NOT apply solo-creator restrictions. Multiple actors, crew members, camera operators, professional studio sets, specialized cinema equipment, complex lighting, and cinematic production workflows are valid and must NOT be flagged merely because they require a film crew.
- For SHORT_FILM, evaluate whether the production requirements are realistic, internally consistent, technically appropriate, and achievable for the intended cinematic production.

6. CROSS-STAGE CONSISTENCY:
- Ensure narration text in the script matches the voiceover text in the storyboard shots, and that storyboard shots map cleanly and logically to production shot list items.
- Check that there are no contradictory statements, missing sections, or mismatching props/locations between the stages. Flag mismatches in the consistency category.

7. EXHAUSTIVE REPORTING:
- You must cover all four preceding pipeline stages (Research, Script, Storyboard, Production) in your report.
- Provide clear, quoted, and direct textual evidence from the supplied files for every warning or fail check.`;

  // 4. Construct the User Prompt with complete, consolidated document package
  const userPrompt = `Please perform a comprehensive quality, grounding, consistency, and feasibility audit on the complete generated content package below.

=========================================
1. RESEARCH BRIEF (STAGE 2)
=========================================
Topic: ${actualBrief.topic}
Summary:
${actualBrief.summary}

Key Facts:
${(actualBrief.keyFacts || []).map((f, i) => `  - ${f}`).join('\n')}

Statistics:
${(actualBrief.statistics || []).map((s, i) => `  - ${s}`).join('\n')}

Recent Developments:
${(actualBrief.recentDevelopments || []).map((d, i) => `  - ${d}`).join('\n')}

Opportunities:
${(actualBrief.opportunities || []).map((o, i) => `  - ${o}`).join('\n')}

Risks and Challenges:
${(actualBrief.risksChallenges || []).map((r, i) => `  - ${r}`).join('\n')}

Important Context:
${(actualBrief.importantContext || []).map((c, i) => `  - ${c}`).join('\n')}

Claims Requiring Verification:
${(actualBrief.claimsRequiringVerification || []).map((item, i) => `  - Claim: ${item.claim} | Reason: ${item.reason}`).join('\n')}

Sources Used:
${(actualBrief.sources || []).map((src, i) => `  - Title: ${src.title} | URL: ${src.url}`).join('\n')}

=========================================
2. VIDEO SCRIPT (STAGE 3)
=========================================
Title: ${actualScript.title}
Audience: ${actualScript.audience || 'N/A'}
Platform: ${actualScript.platform || 'N/A'}
Tone: ${actualScript.tone || 'N/A'}
Target Duration: ${actualScript.targetDuration || 'N/A'}
Format: ${actualScript.format || 'N/A'}
Objective: ${actualScript.objective || 'N/A'}

Hook:
${actualScript.hook}

${productionType === PRODUCTION_TYPES.SHORT_FILM
  ? `Scenes:
${actualScript.scenes.map(scene => `
- Scene #${scene.sceneNumber}
  Slugline: ${scene.slugline || 'N/A'}
  Location: ${scene.location || 'N/A'}
  Time of Day: ${scene.timeOfDay || 'N/A'}
  Action: ${scene.action || 'N/A'}
  Characters Present: ${(scene.charactersPresent || []).join(', ')}
  Dialogue:
${(scene.dialogue || []).map(d => `    ${d.character || 'UNKNOWN'} ${d.parenthetical || ''}: ${d.line || ''}`).join('\n')}
  Sound: ${scene.sound || 'N/A'}
  Music: ${scene.music || 'N/A'}
  Ending Transition: ${scene.endingTransition || 'N/A'}
`).join('\n')}`
  : `Sections:
${actualScript.sections.map((sec, idx) => `
- Section #${idx + 1}: ${sec.heading}
  Purpose: ${sec.purpose}
  Narration: ${sec.narration}
  Visual Suggestions: ${(sec.visualSuggestions || []).join(', ')}
  On-Screen Text: ${(sec.onScreenText || []).join(', ')}
  Duration: ${sec.duration || 'N/A'}
`).join('\n')}`}
Sources:
${(actualScript.sources || []).map(src => `  - ${src}`).join('\n')}

Claims Requiring Verification:
${(actualScript.claimsRequiringVerification || []).map(c => `  - ${c}`).join('\n')}

=========================================
3. STORYBOARD (STAGE 4)
=========================================
Title: ${actualStoryboard.title}
Platform: ${actualStoryboard.platform || 'N/A'}
Format: ${actualStoryboard.format || 'N/A'}
Target Duration: ${actualStoryboard.targetDuration || 'N/A'}

Shots:
${productionType === PRODUCTION_TYPES.SHORT_FILM
  ? `${actualStoryboard.shots.map(s => `
- Shot #${s.shotNumber} (Scene #${s.sceneNumber})
  Slugline: ${s.slugline || 'N/A'}
  Estimated Duration: ${s.estimatedDuration || 'N/A'}
  Camera Angle: ${s.cameraAngle || 'N/A'}
  Camera Movement: ${s.cameraMovement || 'N/A'}
  Shot Size: ${s.shotSize || 'N/A'}
  Visual Description: ${s.visualDescription || 'N/A'}
  Actor Action: ${s.actorAction || 'N/A'}
  Dialogue Cue: ${s.dialogueCue || 'N/A'}
  Sound Effect: ${s.soundEffect || 'N/A'}
  Ambient Sound: ${s.ambientSound || 'N/A'}
  Music Cue: ${s.musicCue || 'N/A'}
  Location Detail: ${s.locationDetail || 'N/A'}
  Props Used: ${(s.propsUsed || []).join(', ')}
  Lighting: ${s.lighting || 'N/A'}
  Continuity Notes: ${s.continuityNotes || 'N/A'}
`).join('\n')}`
  : `${actualStoryboard.shots.map(s => `
- Shot #${s.shotNumber} [${s.shotType}]
  Section: ${s.section || 'N/A'}
  Estimated Duration: ${s.estimatedDuration || 'N/A'}
  Framing: ${s.cameraFraming || 'N/A'}
  Visual: ${s.visualDescription || 'N/A'}
  Action: ${s.action || 'N/A'}
  Presenter Required: ${s.presenterRequired}
  Location: ${s.location || 'N/A'}
  Props: ${(s.props || []).join(', ')}
  Screen Content: ${s.screenContent || 'N/A'}
  Voiceover: ${s.voiceover || 'N/A'}
  On-Screen Text: ${(s.onScreenText || []).join(', ')}
  Transition: ${s.transition || 'N/A'}
  Production Notes: ${s.productionNotes || 'N/A'}
  Source References: ${(s.sourceReferences || []).join(', ')}
`).join('\n')}`}
Format: ${actualProduction.format || 'N/A'}
Target Duration: ${actualProduction.targetDuration || 'N/A'}

Shot List:
${productionType === PRODUCTION_TYPES.SHORT_FILM
  ? `${actualProduction.shotList.map(s => `
- Shot #${s.shotNumber} (Scene #${s.sceneNumber}, Storyboard Shot #${s.storyboardShotNumber})
  Slugline: ${s.slugline || 'N/A'}
  Camera Setup: ${s.cameraSetup || 'N/A'}
  Lighting Setup: ${s.lightingSetup || 'N/A'}
  Audio Setup: ${s.audioSetup || 'N/A'}
  Blocking: ${s.blocking || 'N/A'}
  Props Required: ${(s.propsRequired || []).join(', ')}
  Wardrobe Required: ${(s.wardrobeRequired || []).join(', ')}
  Makeup/Hair: ${s.makeupHair || 'N/A'}
  Special Effects: ${s.specialEffects || 'N/A'}
  Notes: ${s.notes || 'N/A'}
`).join('\n')}`
  : `${actualProduction.shotList.map(s => `
- Shot #${s.shotNumber} (Storyboard Shot #${s.storyboardShotNumber}) [${s.shotType}]
  Location: ${s.location || 'N/A'}
  Description: ${s.description || 'N/A'}
  Setup Instructions: ${s.setupInstructions || 'N/A'}
`).join('\n')}`}
Filming Checklist:
${(actualProduction.filmingChecklist || []).map(task => `  - [${task.stage}] ${task.task} (Completed: ${task.completed})`).join('\n')}

Equipment Needed:
${(actualProduction.equipment || []).map(e => `  - ${e}`).join('\n')}

Locations:
${(actualProduction.locations || []).map(l => `  - ${l}`).join('\n')}

Props:
${(actualProduction.props || []).map(p => `  - ${p}`).join('\n')}

Screen Recording Requirements:
${(actualProduction.screenRecordingRequirements || []).map(req => `  - ${req}`).join('\n')}

Audio Requirements:
${(actualProduction.audioRequirements || []).map(req => `  - ${req}`).join('\n')}

Production Notes:
${(actualProduction.productionNotes || []).map(note => `  - ${note}`).join('\n')}

Warnings:
${(actualProduction.warnings || []).map(w => `  - ${w}`).join('\n')}

=========================================

Analyze the above content package and compile your Quality Report strictly conforming to the requested JSON schema and critical rules.`;

  // 5. Query Gemini with structured output configurations
  let responseText = '';
  try {
    const geminiResponse = await ai.models.generateContent({
      model: config.geminiModel,
      contents: userPrompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        temperature,
      },
    });

    responseText = geminiResponse.text;
    if (!responseText) {
      return {
        success: false,
        error: 'Gemini returned an empty response.',
        step: 'generation'
      };
    }

    const cleanedJson = cleanJsonResponse(responseText);
    let report;
    try {
      report = JSON.parse(cleanedJson);
    } catch (parseError) {
      return {
        success: false,
        error: `JSON parsing failed: ${parseError.message}`,
        step: 'parsing',
        rawResponse: responseText
      };
    }

    // 6. Post-generation normalization to guarantee integrity
    if (!report || typeof report !== 'object') {
      return {
        success: false,
        error: 'Gemini returned an invalid JSON object structure.',
        step: 'parsing'
      };
    }

    // Enforce presence of root fields
    const normalizedReport = {
      status: report.status || 'WARNING',
      overallScore: typeof report.overallScore === 'number' ? report.overallScore : 70,
      summary: report.summary || 'No summary generated.',
      checks: Array.isArray(report.checks) ? report.checks : [],
      groundingIssues: Array.isArray(report.groundingIssues) ? report.groundingIssues : [],
      traceabilityIssues: Array.isArray(report.traceabilityIssues) ? report.traceabilityIssues : [],
      consistencyIssues: Array.isArray(report.consistencyIssues) ? report.consistencyIssues : [],
      productionIssues: Array.isArray(report.productionIssues) ? report.productionIssues : [],
      claimsRequiringVerification: Array.isArray(report.claimsRequiringVerification) ? report.claimsRequiringVerification : [],
      recommendedActions: Array.isArray(report.recommendedActions) ? report.recommendedActions : []
    };

    // Ensure all checks have category, status, finding, and evidence
    normalizedReport.checks = normalizedReport.checks.map(check => ({
      category: check.category || 'grounding',
      status: check.status || 'WARNING',
      finding: check.finding || 'Evaluation finding not described.',
      evidence: check.evidence || 'N/A',
      sourceReferences: Array.isArray(check.sourceReferences) ? check.sourceReferences : []
    }));

    return {
      success: true,
      report: normalizedReport
    };

  } catch (apiError) {
    return {
      success: false,
      error: `Gemini API execution failed: ${redactApiKeys(apiError.message || apiError)}`,
      step: 'generation'
    };
  }
}








