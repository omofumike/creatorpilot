import { ai } from '../utils/gemini.js';
import { config } from '../utils/config.js';

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
 * Transforms a structured video script into a practical, production-ready storyboard for a solo creator.
 * 
 * @param {Object} script - The structured script object from Script Agent (or wrapper with success/script).
 * @param {Object} [options] - Configuration and styling options.
 * @param {number} [options.temperature] - Generation temperature. Defaults to 0.2.
 * @returns {Promise<Object>} Object indicating success and containing the structured storyboard or error details.
 */
export async function generateStoryboard(script, options = {}) {
  // 1. Validate that script input exists
  if (!script) {
    return {
      success: false,
      error: 'Script is required.',
      step: 'validation'
    };
  }

  // Support both the wrapped script response and the direct script object
  let actualScript = script;
  if (script.script && typeof script.script === 'object') {
    actualScript = script.script;
  }

  // 2. Validate that the required script information exists
  const requiredFields = [
    'title',
    'audience',
    'platform',
    'tone',
    'targetDuration',
    'format',
    'hook',
    'sections',
    'sources',
    'claimsRequiringVerification'
  ];

  for (const field of requiredFields) {
    if (actualScript[field] === undefined || actualScript[field] === null) {
      return {
        success: false,
        error: `Missing required script field: ${field}`,
        step: 'validation'
      };
    }
  }

  // Type and format validation
  if (typeof actualScript.title !== 'string' || actualScript.title.trim() === '') {
    return { success: false, error: 'Script title must be a non-empty string.', step: 'validation' };
  }
  if (typeof actualScript.audience !== 'string' || actualScript.audience.trim() === '') {
    return { success: false, error: 'Script audience must be a non-empty string.', step: 'validation' };
  }
  if (typeof actualScript.platform !== 'string' || actualScript.platform.trim() === '') {
    return { success: false, error: 'Script platform must be a non-empty string.', step: 'validation' };
  }
  if (typeof actualScript.tone !== 'string' || actualScript.tone.trim() === '') {
    return { success: false, error: 'Script tone must be a non-empty string.', step: 'validation' };
  }
  if (typeof actualScript.targetDuration !== 'string' || actualScript.targetDuration.trim() === '') {
    return { success: false, error: 'Script targetDuration must be a non-empty string.', step: 'validation' };
  }
  if (typeof actualScript.format !== 'string' || actualScript.format.trim() === '') {
    return { success: false, error: 'Script format must be a non-empty string.', step: 'validation' };
  }
  if (typeof actualScript.hook !== 'string' || actualScript.hook.trim() === '') {
    return { success: false, error: 'Script hook must be a non-empty string.', step: 'validation' };
  }
  if (!Array.isArray(actualScript.sections) || actualScript.sections.length === 0) {
    return { success: false, error: 'Script sections must be a non-empty array.', step: 'validation' };
  }
  if (!Array.isArray(actualScript.sources)) {
    return { success: false, error: 'Script sources must be an array.', step: 'validation' };
  }
  if (!Array.isArray(actualScript.claimsRequiringVerification)) {
    return { success: false, error: 'Script claimsRequiringVerification must be an array.', step: 'validation' };
  }

  // Validate sections content
  for (let i = 0; i < actualScript.sections.length; i++) {
    const section = actualScript.sections[i];
    if (!section || typeof section !== 'object') {
      return { success: false, error: `Section at index ${i} must be an object.`, step: 'validation' };
    }
    if (typeof section.heading !== 'string' || section.heading.trim() === '') {
      return { success: false, error: `Section at index ${i} is missing a non-empty heading.`, step: 'validation' };
    }
    if (typeof section.narration !== 'string' || section.narration.trim() === '') {
      return { success: false, error: `Section at index ${i} is missing a non-empty narration.`, step: 'validation' };
    }
    if (!Array.isArray(section.visualSuggestions)) {
      return { success: false, error: `Section at index ${i} is missing a visualSuggestions array.`, step: 'validation' };
    }
    if (!Array.isArray(section.onScreenText)) {
      return { success: false, error: `Section at index ${i} is missing an onScreenText array.`, step: 'validation' };
    }
  }

  const temperature = options.temperature ?? 0.2;

  // 3. Construct System Instruction for Storyboard Agent
  const systemInstruction = `You are an expert Storyboard Agent for solo video creators. Your task is to transform a structured video script into a practical, production-ready, shot-by-shot storyboard.

You must return your output strictly in JSON format matching the schema described below. Do not include any introductory or concluding text, explanations, or Markdown code blocks. Just output raw, valid JSON.

JSON Schema Required Keys:
{
  "title": "The title of the video script",
  "platform": "The target platform (e.g. YouTube, TikTok, Podcast)",
  "format": "The video format",
  "targetDuration": "The target duration of the video",
  "shots": [
    {
      "shotNumber": 1,
      "section": "The section this shot belongs to (e.g. Hook, Section 1, Call to Action)",
      "estimatedDuration": "Estimated duration for this shot (e.g. '5s', '10s')",
      "shotType": "Must be one of: 'Presenter', 'B-Roll', 'Screen Recording', 'Graphics/Text', 'Voiceover'",
      "cameraFraming": "The camera framing for the shot (e.g. 'Medium Shot', 'Close-Up', 'N/A' for screen/graphics)",
      "visualDescription": "A highly descriptive but practical visual description of what is shown. Keep it extremely realistic for a solo creator.",
      "action": "What the presenter or on-screen element is doing during this shot",
      "presenterRequired": true,
      "location": "Where this shot is captured (e.g. 'Home Office Desk', 'Bedroom Studio', 'N/A')",
      "props": ["List of simple, household props needed, or empty array if none"],
      "screenContent": "A detailed description of what should be displayed on screen if shotType is 'Screen Recording' or 'Graphics/Text', otherwise 'N/A'",
      "voiceover": "The narration or voiceover spoken during this shot. Must align perfectly with the script's narration. If there is no voiceover, state 'None' or describe ambient audio.",
      "onScreenText": ["Text overlay, lower-thirds, or titles to show on screen during this shot"],
      "transition": "Transition into this shot (e.g. 'Cut', 'Fade', 'Cross Dissolve')",
      "productionNotes": "Practical tips or setup instructions for a solo creator (e.g. 'Use phone tripod on desk', 'Ensure lighting is from front', 'Mute desktop notifications')",
      "sourceReferences": ["Exact URLs from the script's sourceReferences that support this shot's content (empty array if none)"]
    }
  ]
}

CRITICAL RULES FOR SOLO CREATORS:
1. SOLO CREATOR REALISM: The storyboard must be fully executable by a SINGLE person.
- DO NOT assume a film crew, professional lighting crews, camera operators, multiple presenters, actors, expensive cinema equipment, or complex studio sets.
- DO PREFER: talking-head footage (using phone or webcam), screen recordings, simple desk b-roll, screenshots, simple text overlays, simple household setups, voiceover, and simple transitions.
- Each shot must distinguish between: Presenter, B-Roll, Screen Recording, Graphics/Text, Voiceover.
2. GROUNDING AND FACTUAL SAFETY:
- DO NOT invent, hallucinate, or add any new product names, pricing, subscription costs, credits, commercial figures, product variants, product capabilities, statistics, quantitative claims, sources, or URLs. These details can only be used when they are explicitly present in the supplied Script Agent output.
- DO NOT invent URLs or include external links. Use only the exact URLs provided in the script.
- If a claim was flagged in the script as requiring verification, DO NOT visually depict or state it as an absolute, unquestionable fact. Present it with clear qualification (e.g. "On screen text: 'Reported AI growth (unverified)'") or avoid visually overstating it.
- DO NOT change the meaning or content of the script's narration. The spoken words/voiceover in the storyboard must correspond directly to the input script narration.
- DO NOT recommend or mention prohibited third-party AI systems (such as Claude, OpenAI, Anthropic, ChatGPT, GPT-4). Mention only Google Gemini / Google Cloud AI, YouTube-native AI, or generic terms (such as 'AI scriptwriter' or 'AI tools').
- Always emphasize human-in-the-loop: describe automation as reducing manual effort, maintaining the creator's creative and strategic review.
3. COMPLETENESS: The storyboard shots must cover the entire script, starting with the Hook, going through all the Sections, and concluding with the Call to Action. Make sure the transition between shots is smooth and logical.`;

  // 4. Construct the user prompt
  const userPrompt = `Transform the following structured video script into a practical, production-ready, shot-by-shot storyboard conforming to the requested JSON schema.

Title: ${actualScript.title}
Audience: ${actualScript.audience}
Platform: ${actualScript.platform}
Tone: ${actualScript.tone}
Target Duration: ${actualScript.targetDuration}
Format: ${actualScript.format}

HOOK:
${actualScript.hook}

SECTIONS:
${actualScript.sections.map((section, idx) => `
Section ${idx + 1}: ${section.heading}
Purpose: ${section.purpose || 'N/A'}
Narration: ${section.narration}
Visual Suggestions: ${(section.visualSuggestions || []).join('; ')}
On-Screen Text: ${(section.onScreenText || []).join('; ')}
Source References: ${(section.sourceReferences || []).join('; ')}
`).join('\n')}

CALL TO ACTION:
${actualScript.callToAction || 'N/A'}

SOURCES:
${(actualScript.sources || []).join('\n')}

CLAIMS REQUIRING VERIFICATION:
${(actualScript.claimsRequiringVerification || []).join('\n')}
`;

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
    let storyboard;
    try {
      storyboard = JSON.parse(cleanedJson);
    } catch (parseError) {
      return {
        success: false,
        error: `JSON parsing failed: ${parseError.message}`,
        step: 'parsing',
        rawResponse: responseText
      };
    }

    // Post-generation validation to enforce safety and formatting guarantees
    if (!storyboard || typeof storyboard !== 'object') {
      return {
        success: false,
        error: 'Gemini returned an invalid JSON object structure.',
        step: 'parsing'
      };
    }

    if (!Array.isArray(storyboard.shots) || storyboard.shots.length === 0) {
      return {
        success: false,
        error: 'Storyboard must contain at least one shot in the shots array.',
        step: 'validation'
      };
    }

    // Normalize sourceReferences and do strict validation on shot structures
    const scriptSourcesSet = new Set(actualScript.sources || []);
    const validShotTypes = ['Presenter', 'B-Roll', 'Screen Recording', 'Graphics/Text', 'Voiceover'];

    for (let i = 0; i < storyboard.shots.length; i++) {
      const shot = storyboard.shots[i];
      if (!shot || typeof shot !== 'object') {
        return {
          success: false,
          error: `Shot at index ${i} is not a valid object.`,
          step: 'validation'
        };
      }

      // Enforce presence of shotNumber and visualDescription
      if (shot.shotNumber === undefined || shot.shotNumber === null) {
        shot.shotNumber = i + 1; // Fallback / normalize
      }

      if (!shot.visualDescription || typeof shot.visualDescription !== 'string' || shot.visualDescription.trim() === '') {
        return {
          success: false,
          error: `Shot at index ${i} is missing a visualDescription.`,
          step: 'validation'
        };
      }

      // Enforce presence of voiceover or explicit indication that there is no voiceover
      if (shot.voiceover === undefined || shot.voiceover === null) {
        shot.voiceover = 'None';
      }

      // Distinguish shotTypes - normalize if Gemini returns a slight variation
      if (shot.shotType) {
        const foundType = validShotTypes.find(t => t.toLowerCase() === shot.shotType.toLowerCase());
        if (foundType) {
          shot.shotType = foundType;
        } else {
          // If Gemini generated something else, map or default to a valid type
          shot.shotType = 'Presenter';
        }
      } else {
        shot.shotType = 'Presenter';
      }

      // Enforce presenterRequired is a boolean
      if (shot.presenterRequired === undefined || shot.presenterRequired === null) {
        shot.presenterRequired = (shot.shotType === 'Presenter');
      } else {
        shot.presenterRequired = !!shot.presenterRequired;
      }

      // Clean up source references to only include URLs originating from the Script Agent
      if (Array.isArray(shot.sourceReferences)) {
        shot.sourceReferences = shot.sourceReferences.filter(url => scriptSourcesSet.has(url));
      } else {
        shot.sourceReferences = [];
      }
    }

    // 6. Return successful structured response
    return {
      success: true,
      storyboard: {
        title: storyboard.title || actualScript.title,
        platform: storyboard.platform || actualScript.platform,
        format: storyboard.format || actualScript.format,
        targetDuration: storyboard.targetDuration || actualScript.targetDuration,
        shots: storyboard.shots
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
