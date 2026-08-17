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
 * Generates a creator-ready video script from a structured Research Brief.
 * 
 * @param {Object} researchBrief - The structured research brief from Research Agent.
 * @param {Object} [options] - Configuration and styling options.
 * @param {string} [options.audience] - Target audience. Defaults to "solo content creators".
 * @param {string} [options.platform] - Target platform. Defaults to "YouTube".
 * @param {string} [options.tone] - Video tone. Defaults to "informative and engaging".
 * @param {string} [options.targetDuration] - Target video duration. Defaults to "5-7 minutes".
 * @param {string} [options.format] - Video format. Defaults to "educational video".
 * @param {number} [options.temperature] - Generation temperature. Defaults to 0.3.
 * @returns {Promise<Object>} Object indicating success and containing the structured video script or error details.
 */
export async function generateScript(researchBrief, options = {}) {
  // 1. Validate that researchBrief exists
  if (!researchBrief) {
    return {
      success: false,
      error: 'Research brief is required.',
      step: 'validation'
    };
  }

  // 2. Validate that researchBrief contains meaningful research data
  const hasTopic = typeof researchBrief.topic === 'string' && researchBrief.topic.trim().length > 0;
  const hasSummary = typeof researchBrief.summary === 'string' && researchBrief.summary.trim().length > 0;

  if (!hasTopic || !hasSummary) {
    return {
      success: false,
      error: 'Research brief is invalid or lacks meaningful data (topic or summary).',
      step: 'validation'
    };
  }

  // Get options with defaults
  const audience = options.audience || 'solo content creators';
  const platform = options.platform || 'YouTube';
  const tone = options.tone || 'informative and engaging';
  const targetDuration = options.targetDuration || '5-7 minutes';
  const format = options.format || 'educational video';
  const temperature = options.temperature ?? 0.3;
  const productionType = options.productionType || PRODUCTION_TYPES.CREATOR_VIDEO; // Get productionType

  let systemInstruction;
  let scriptSchema;
  let userPromptContent;

  if (productionType === PRODUCTION_TYPES.CREATOR_VIDEO) {
    systemInstruction = `You are a professional video scriptwriter. Your job is to transform the provided Research Brief into a compelling, creator-ready video script.

You must return your output strictly in JSON format matching the schema described below. Do not include any introductory or concluding text, explanations, or Markdown code blocks. Just output raw, valid JSON.

JSON Schema Required Keys:
{
  "title": "A compelling title for the video script",
  "hook": "A highly engaging introduction hook designed to retain viewers",
  "audience": "The specified target audience",
  "platform": "The target platform",
  "tone": "The tone used in the narration",
  "targetDuration": "The requested target duration",
  "format": "The format of the script",
  "objective": "The main objective of this video script based on the research brief",
  "sections": [
    {
      "heading": "Section heading",
      "purpose": "A brief explanation of why this section is included",
      "narration": "The exact spoken words for the presenter. Must be conversational, natural, and highly suitable for spoken delivery by a solo creator.",
      "visualSuggestions": ["Visual cue, b-roll suggestion, or camera angle instruction 1", "Visual cue 2"],
      "onScreenText": ["Text overlay or graphic title to show on screen 1", "Text overlay 2"],
      "sourceReferences": ["URL 1 from the brief", "URL 2 from the brief"]
    }
  ],
  "callToAction": "A strong and specific closing call to action",
  "sources": ["Exact URL 1 from the research brief", "Exact URL 2 from the research brief"],
  "claimsRequiringVerification": [
    "A list of claims included in the script that were flagged in the brief as requiring verification, noting how they were qualified in the script (or an empty array [] if none used)"
  ],
  "productionType": "creator_video"
}

CRITICAL RULES:
1. NO PROHIBITED THIRD-PARTY MODELS: You MUST NOT recommend, instruct users to use, or position third-party AI models or platforms such as Claude, OpenAI, Anthropic, ChatGPT, GPT-4, or any other prohibited AI systems as part of the CreatorPilot workflow or tool recommendations. If the brief mentions these systems (e.g. in context or sources), do NOT include them in the script's recommendations or narration. Use only Google Gemini / Google Cloud AI, YouTube-native AI tools, or generic terms (such as 'AI writing tool' or 'AI scriptwriter') instead.
2. AUTOMATION WITH HUMAN OVERSIGHT: When describing autonomous AI capabilities, do NOT imply that human supervision or review is unnecessary. Always describe automation as a means of reducing manual effort while preserving human review, strategic oversight, and final creative control.
3. STRICT LITERAL QUANTITATIVE TRACEABILITY: Every statistic, percentage, numerical claim, named product capability, specific date, and quantitative comparison used in any part of the script (including the hook, sections, and call to action) MUST be explicitly traceable to the supplied Research Brief. If any quantitative claim, statistic, or named product capability is not explicitly present in the provided Research Brief, you MUST NOT use it or invent it. If it cannot be traced directly, remove it.
4. NO HALLUCINATIONS / UNSUPPORTED FACTS: You MUST NOT introduce any facts, statistics, claims, URLs, or sources that are not explicitly present in the provided Research Brief. Do not perform independent research or use your pre-trained knowledge to inject external findings.
5. SOURCE TRACEABILITY: Every section must link back to its source URLs in "sourceReferences" exactly as provided in the Research Brief.
6. PRESERVE INTUITIVE QUALIFICATIONS: Do not blindly repeat questionable claims as established facts. For claims marked as requiring verification, you must either AVOID using them, or CLEARLY qualify them (e.g. use phrasing like "according to claims", "reportedly", "some sources suggest" rather than stating them as absolute facts).
7. PRESERVE SOURCE URLs: The "sources" array at the root of the JSON response must contain the exact, unmodified URLs of the sources used from the Research Brief.
8. CONTEXTUAL SUITABILITY: Ensure the script is executable by a solo creator (single presenter), is highly conversational, and fits the platform, tone, audience, and target duration. Let the visual suggestions be practical and easy to implement.
9. NO FABRICATED SOURCE ATTRIBUTIONS: You are strictly prohibited from inventing, adding, or suggesting any named source, study, organization, company, institution, researcher, report, publication, survey, or attribution that is not explicitly present in the supplied Research Brief. This restriction applies to EVERY single output field, including 'narration', 'hook', 'visualSuggestions', 'onScreenText', 'sourceReferences', 'sources', 'claimsRequiringVerification', and any other metadata or structured output field. Prohibited inventions include naming an organization or study not in the brief (e.g., 'Gartner', 'a 2025 study'), attributing a statistic to a specific company/study/institution when the Research Brief did not do so, or using vague terms like 'according to researchers' or 'a recent industry report'. If a quantitative claim is present in the brief but lacks an explicit attribution, qualify it ONLY with generic phrases such as 'some sources report...' or 'the research brief reports...', without inventing an attribution. In 'claimsRequiringVerification', you must describe ONLY what is supported by the Research Brief and NEVER add fabricated source names, study names, dates, organizations, or attributions while explaining why the claim requires verification.`;
    
    scriptSchema = `JSON Schema Required Keys:
{
  "title": "A compelling title for the video script",
  "hook": "A highly engaging introduction hook designed to retain viewers",
  "audience": "The specified target audience",
  "platform": "The target platform",
  "tone": "The tone used in the narration",
  "targetDuration": "The requested target duration",
  "format": "The format of the script",
  "objective": "The main objective of this video script based on the research brief",
  "sections": [
    {
      "heading": "Section heading",
      "purpose": "A brief explanation of why this section is included",
      "narration": "The exact spoken words for the presenter. Must be conversational, natural, and highly suitable for spoken delivery by a solo creator.",
      "visualSuggestions": ["Visual cue, b-roll suggestion, or camera angle instruction 1", "Visual cue 2"],
      "onScreenText": ["Text overlay or graphic title to show on screen 1", "Text overlay 2"],
      "sourceReferences": ["URL 1 from the brief", "URL 2 from the brief"]
    }
  ],
  "callToAction": "A strong and specific closing call to action",
  "sources": ["Exact URL 1 from the research brief", "Exact URL 2 from the research brief"],
  "claimsRequiringVerification": [
    "A list of claims included in the script that were flagged in the brief as requiring verification, noting how they were qualified in the script (or an empty array [] if none used)"
  ],
  "productionType": "creator_video"
}`;

    userPromptContent = `Target Audience: ${audience}
Platform: ${platform}
Tone: ${tone}
Target Duration: ${targetDuration}
Format: ${format}

Research Brief Content:
=========================================
Topic: ${researchBrief.topic}
Summary: ${researchBrief.summary}

Key Facts:
${(researchBrief.keyFacts || []).map((f, i) => `${i + 1}. ${f}`).join('\n')}

Statistics:
${(researchBrief.statistics || []).map((s, i) => `${i + 1}. ${s}`).join('\n')}

Recent Developments:
${(researchBrief.recentDevelopments || []).map((d, i) => `${i + 1}. ${d}`).join('\n')}

Opportunities:
${(researchBrief.opportunities || []).map((o, i) => `${i + 1}. ${o}`).join('\n')}

Risks and Challenges:
${(researchBrief.risksChallenges || []).map((r, i) => `${i + 1}. ${r}`).join('\n')}

Important Context:
${(researchBrief.importantContext || []).map((c, i) => `${i + 1}. ${c}`).join('\n')}

Claims Requiring Verification:
${(researchBrief.claimsRequiringVerification || []).map((item, i) => `${i + 1}. Claim: ${item.claim} | Reason: ${item.reason}`).join('\n')}

Sources Used:
${(researchBrief.sources || []).map((src, i) => `${i + 1}. Title: ${src.title} | URL: ${src.url}`).join('\n')}
=========================================

Please transform the Research Brief above into a complete, professional, structured video script conforming to the JSON schema.`;

  } else if (productionType === PRODUCTION_TYPES.SHORT_FILM) {
    systemInstruction = `You are a professional screenwriter. Your task is to write a cinematic short film screenplay based on the provided Research Brief and topic.

You must return your output strictly in JSON format matching the schema described below. Do not include any introductory or concluding text, explanations, or Markdown code blocks. Just output raw, valid JSON.

JSON Schema Required Keys:
{
  "productionType": "short_film",
  "title": "A compelling title for the short film",
  "logline": "A one-sentence summary of the short film's premise",
  "genre": "The genre of the short film (e.g., Drama, Thriller, Sci-Fi)",
  "characters": [
    {
      "name": "Character Name",
      "description": "Brief description of the character"
    }
  ],
  "scenes": [
    {
      "sceneNumber": 1,
      "slugline": "INT./EXT. LOCATION - DAY/NIGHT (e.g., EXT. LAGOS STREET - EVENING)",
      "location": "Detailed description of the scene's location",
      "timeOfDay": "Time of day (e.g., Evening, Dawn)",
      "action": "Descriptive narrative of actions and visual elements. Use cinematic language.",
      "charactersPresent": ["List of character names present in the scene"],
      "dialogue": [
        {
          "character": "CHARACTER NAME (e.g., AMARA)",
          "parenthetical": "(optional, e.g., weary)",
          "line": "Dialogue line spoken by the character"
        }
      ],
      "sound": "Specific sound effects or ambient sounds (e.g., distant city hum, market chatter)",
      "music": "Music direction (e.g., melancholic piano fades in, tense orchestral sting)",
      "endingTransition": "Transition to the next scene (e.g., CUT TO:, FADE TO BLACK.)"
    }
  ],
  "ending": "A brief description of the film's conclusion or final message."
}

CRITICAL RULES FOR SHORT FILM SCREENPLAYS:
1. FOCUS ON VISUAL STORYTELLING: Describe actions and emotions through visuals, not just dialogue.
2. CONFLICT AND RESOLUTION: Ensure a clear narrative arc appropriate for a short film.
3. CHARACTER DEVELOPMENT: Show, don't just tell, character traits and motivations.
4. CINEMATIC LANGUAGE: Use terms like 'wide shot', 'close-up', 'tracking shot' within action descriptions where appropriate.
5. SOUND DESIGN: Include specific sound effects and music direction to enhance mood and narrative.
6. DIALOGUE: Dialogue should be concise, natural, and advance the plot or reveal character. Avoid unnecessary exposition.
7. NO NARRATION/VOICEOVER BY DEFAULT: Voiceover should ONLY be included if it is an explicit narrative device and dramatically justified (e.g., a character's internal monologue). Do NOT default to a presenter-style voiceover. If present, it should be structured as a dialogue entry with 'VOICEOVER' as the character.
8. GROUNDING: All core narrative elements should be inspired by the Research Brief, but creative license for fictional elements is expected for a screenplay.
9. NO PROHIBITED THIRD-PARTY MODELS: You MUST NOT recommend, instruct users to use, or position third-party AI models or platforms such as Claude, OpenAI, Anthropic, ChatGPT, GPT-4, or any other prohibited AI systems as part of the CreatorPilot workflow or tool recommendations.
`;
    
    scriptSchema = `JSON Schema Required Keys:
{
  "productionType": "short_film",
  "title": "A compelling title for the short film",
  "logline": "A one-sentence summary of the short film's premise",
  "genre": "The genre of the short film (e.g., Drama, Thriller, Sci-Fi)",
  "characters": [
    {
      "name": "Character Name",
      "description": "Brief description of the character"
    }
  ],
  "scenes": [
    {
      "sceneNumber": 1,
      "slugline": "INT./EXT. LOCATION - DAY/NIGHT (e.g., EXT. LAGOS STREET - EVENING)",
      "location": "Detailed description of the scene's location",
      "timeOfDay": "Time of day (e.g., Evening, Dawn)",
      "action": "Descriptive narrative of actions and visual elements. Use cinematic language.",
      "charactersPresent": ["List of character names present in the scene"],
      "dialogue": [
        {
          "character": "CHARACTER NAME (e.g., AMARA)",
          "parenthetical": "(optional, e.g., weary)",
          "line": "Dialogue line spoken by the character"
        }
      ],
      "sound": "Specific sound effects or ambient sounds (e.g., distant city hum, market chatter)",
      "music": "Music direction (e.g., melancholic piano fades in, tense orchestral sting)",
      "endingTransition": "Transition to the next scene (e.g., CUT TO:, FADE TO BLACK.)"
    }
  ],
  "ending": "A brief description of the film's conclusion or final message."
}`;

    userPromptContent = `
Research Brief Content:
=========================================
Topic: ${researchBrief.topic}
Summary: ${researchBrief.summary}

Key Facts:
${(researchBrief.keyFacts || []).map((f, i) => `${i + 1}. ${f}`).join('\n')}

Important Context:
${(researchBrief.importantContext || []).map((c, i) => `${i + 1}. ${c}`).join('\n')}
=========================================

Using the above Research Brief as inspiration and context, write a complete, professional short film screenplay strictly conforming to the JSON schema.
The screenplay should be compelling and suitable for a ${targetDuration} ${format}.`;

  } else {
    // Fallback for unsupported production types
    return {
      success: false,
      error: `Unsupported production type: ${productionType}`,
      step: 'validation'
    };
  }

  // 4. Construct the user prompt with the Research Brief and formatting/configuration options
  const userPrompt = `${userPromptContent}

Script Schema:
${scriptSchema}`;

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
    let script;
    try {
      script = JSON.parse(cleanedJson);
    } catch (parseError) {
      return {
        success: false,
        error: `JSON parsing failed: ${parseError.message}`,
        step: 'parsing',
        rawResponse: responseText
      };
    }

    // 6. Return successful structured response
    return {
      success: true,
      script: {
        ...script,
        targetDuration: targetDuration,
        productionType: productionType
      }
    };

  } catch (apiError) {
    return {
      success: false,
      error: `Gemini API execution failed: ${redactApiKeys(apiError.message || apiError)}`,
      step: 'generation'
    };
  }
}

