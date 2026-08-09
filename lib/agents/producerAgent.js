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
 * Generates a practical production plan for a solo creator based on a storyboard.
 * 
 * @param {Object} storyboard - The structured storyboard object from Storyboard Agent.
 * @param {Object} [options] - Configuration and styling options.
 * @param {number} [options.temperature] - Generation temperature. Defaults to 0.1.
 * @returns {Promise<Object>} Object indicating success and containing the structured production plan or error details.
 */
export async function generateProductionPlan(storyboard, options = {}) {
  // 1. Validate that storyboard input exists
  if (!storyboard) {
    return {
      success: false,
      error: 'Storyboard is required.',
      production: null
    };
  }

  // Support both the wrapped storyboard response and the direct storyboard object
  let actualStoryboard = storyboard;
  if (storyboard.storyboard && typeof storyboard.storyboard === 'object') {
    actualStoryboard = storyboard.storyboard;
  }

  // 2. Validate basic storyboard structure
  if (!actualStoryboard.title || !Array.isArray(actualStoryboard.shots) || actualStoryboard.shots.length === 0) {
    return {
      success: false,
      error: 'Invalid storyboard structure: title and shots array are required.',
      production: null
    };
  }

  const temperature = options.temperature ?? 0.1;

  // 3. Construct System Instruction for Production Agent
  const systemInstruction = `You are an expert Production Agent specializing in solo content creation. Your task is to transform a structured storyboard into a highly practical, logistical production package.

You must return your output strictly in JSON format matching the schema described below. Do not include any introductory or concluding text, explanations, or Markdown code blocks. Just output raw, valid JSON.

JSON Schema Required Keys:
{
  "title": "The video title",
  "platform": "The target platform",
  "format": "The video format",
  "targetDuration": "The target duration",
  "shotList": [
    {
      "shotNumber": 1,
      "storyboardShotNumber": 1,
      "shotType": "Presenter | B-Roll | Screen Recording | Graphics/Text | Voiceover",
      "location": "The filming location",
      "description": "Concise description of the shot",
      "setupInstructions": "Practical instructions for a solo creator to capture this shot"
    }
  ],
  "filmingChecklist": [
    {
      "task": "Specific task description",
      "stage": "Pre-production | Production | Post-production",
      "completed": false
    }
  ],
  "equipment": ["List of generic equipment needed, e.g., 'Smartphone', 'Tripod', 'Microphone'"],
  "locations": ["List of filming locations"],
  "props": ["List of props used in the storyboard"],
  "screenRecordingRequirements": ["Specific technical requirements for screen capture if applicable"],
  "audioRequirements": ["Specific technical requirements for audio capture, e.g., 'Lavalier mic', 'Quiet environment'"],
  "productionNotes": ["General logistical tips for a solo creator"],
  "warnings": ["Potential risks or challenges for this specific production"]
}

CRITICAL RULES:
1. SOLO CREATOR REALISM: Assume the creator is working ALONE.
- Use only generic equipment names (Smartphone, Tripod, LED Light, Webcam, Microphone).
- Do NOT assume a film crew, multiple cameras, professional studios, assistants, actors, or specialized gear unless explicitly stated in the storyboard.
- Production tasks must be executable by one person.
2. STRICT GROUNDING:
- ONLY use information provided in the storyboard.
- Do NOT invent facts, statistics, product names, pricing, subscription costs, credits, commercial figures, URLs, sources, or product capabilities.
- Do NOT guess dates or numbers not in the storyboard.
- If something is not in the storyboard and cannot be reasonably inferred as a generic production step, use null, an empty array [], or "Not specified".
- PRESERVE all source references/URLs exactly as they appear in the storyboard shots.
3. TRACEABILITY:
- Every production shot MUST map back to its 'storyboardShotNumber' from the input.
4. NO PROHIBITED MODELS:
- Never mention or recommend Claude, OpenAI, ChatGPT, GPT-4, etc. Use only Google Gemini / Google Cloud AI, or generic terms like 'AI tools'.
5. PRACTICALITY:
- Generic solo-creator advice is allowed (e.g. "Check audio levels," "Record in a quiet room").`;

  // 4. Construct the user prompt
  const userPrompt = `Transform the following storyboard into a logistical production plan for a solo creator.

Storyboard Information:
Title: ${actualStoryboard.title}
Platform: ${actualStoryboard.platform || 'Not specified'}
Format: ${actualStoryboard.format || 'Not specified'}
Target Duration: ${actualStoryboard.targetDuration || 'Not specified'}

Shots:
${actualStoryboard.shots.map(s => `
- Shot #${s.shotNumber} (${s.shotType})
  Location: ${s.location}
  Visual: ${s.visualDescription}
  Action: ${s.action}
  Props: ${(s.props || []).join(', ')}
  Voiceover: ${s.voiceover}
  On-Screen Text: ${(s.onScreenText || []).join(', ')}
  Source Refs: ${(s.sourceReferences || []).join(', ')}
`).join('\n')}
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
        production: null
      };
    }

    const cleanedJson = cleanJsonResponse(responseText);
    let production;
    try {
      production = JSON.parse(cleanedJson);
    } catch (parseError) {
      return {
        success: false,
        error: `JSON parsing failed: ${parseError.message}`,
        production: null
      };
    }

    // 6. Traceability and Validity Verification
    if (!production || typeof production !== 'object') {
      return { success: false, error: 'Gemini returned an invalid object structure.', production: null };
    }

    if (!Array.isArray(production.shotList)) {
      return { success: false, error: 'Production plan is missing a valid shotList array.', production: null };
    }

    const storyboardShotNumbers = new Set(actualStoryboard.shots.map(s => s.shotNumber));
    for (const shot of production.shotList) {
      if (!storyboardShotNumbers.has(shot.storyboardShotNumber)) {
        return {
          success: false,
          error: `Traceability failure: Production shot #${shot.shotNumber} references a non-existent storyboard shot #${shot.storyboardShotNumber}.`,
          production: null
        };
      }
    }

    // 7. Normalization
    const normalizedProduction = {
      title: production.title || actualStoryboard.title,
      platform: production.platform || actualStoryboard.platform || "Not specified",
      format: production.format || actualStoryboard.format || "Not specified",
      targetDuration: production.targetDuration || actualStoryboard.targetDuration || "Not specified",
      shotList: production.shotList,
      filmingChecklist: Array.isArray(production.filmingChecklist) ? production.filmingChecklist : [],
      equipment: Array.isArray(production.equipment) ? production.equipment : [],
      locations: Array.isArray(production.locations) ? production.locations : [],
      props: Array.isArray(production.props) ? production.props : [],
      screenRecordingRequirements: Array.isArray(production.screenRecordingRequirements) ? production.screenRecordingRequirements : [],
      audioRequirements: Array.isArray(production.audioRequirements) ? production.audioRequirements : [],
      productionNotes: Array.isArray(production.productionNotes) ? production.productionNotes : [],
      warnings: Array.isArray(production.warnings) ? production.warnings : []
    };

    return {
      success: true,
      production: normalizedProduction
    };

  } catch (apiError) {
    return {
      success: false,
      error: `Gemini API execution failed: ${redactApiKeys(apiError.message || apiError)}`,
      production: null
    };
  }
}
