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
 * Attempts to parse Gemini JSON safely.
 * If the first response is malformed, asks Gemini to repair it.
 *
 * @param {string} responseText - Raw Gemini response.
 * @param {string} repairContext - Description of the expected JSON.
 * @returns {Promise<Object>} Parsed JSON object.
 */
async function parseOrRepairJson(responseText, repairContext) {
  const cleaned = cleanJsonResponse(responseText);

  // First attempt: parse exactly what Gemini returned.
  try {
    return JSON.parse(cleaned);
  } catch (firstParseError) {
    console.warn(
      '[Production Agent] Initial JSON parse failed. Attempting JSON repair...'
    );

    // Second attempt: ask Gemini to repair the JSON.
    try {
      const repairResponse = await ai.models.generateContent({
        model: config.geminiModel,
        contents: `Repair the following malformed JSON.

IMPORTANT:
- Return ONLY valid JSON.
- Do not use Markdown.
- Do not add explanations.
- Do not remove required information.
- Preserve the original meaning and values.
- Fix only JSON syntax/formatting problems.
- Ensure every string is properly escaped.
- Ensure every object property is separated by commas.
- Ensure all objects and arrays are properly closed.

Expected structure:
${repairContext}

Malformed JSON:
${cleaned}`,
        config: {
          responseMimeType: 'application/json',
          temperature: 0
        }
      });

      const repairedText = repairResponse.text;

      if (!repairedText) {
        throw new Error('Gemini returned an empty JSON repair response.');
      }

      const repairedJson = cleanJsonResponse(repairedText);

      try {
        return JSON.parse(repairedJson);
      } catch (secondParseError) {
        throw new Error(
          `JSON repair also failed: ${secondParseError.message}`
        );
      }

    } catch (repairError) {
      throw new Error(
        `Initial JSON parsing failed: ${firstParseError.message}. ` +
        `${repairError.message}`
      );
    }
  }
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
  const productionType =
    options.productionType ||
    actualStoryboard.productionType ||
    PRODUCTION_TYPES.CREATOR_VIDEO;

  console.log('[Producer DEBUG] productionType:', productionType);
  console.log('[Producer DEBUG] storyboard productionType:', actualStoryboard.productionType);
  console.log('[Producer DEBUG] options productionType:', options.productionType);
  console.log(
    '[Producer DEBUG] storyboard voiceover fields:',
    (actualStoryboard.shots || []).map(s => ({
      shotNumber: s.shotNumber,
      shotType: s.shotType,
      voiceover: s.voiceover,
      dialogueCue: s.dialogueCue
    }))
  );

  // 2. Validate basic storyboard structure
  if (!actualStoryboard.title || !Array.isArray(actualStoryboard.shots) || actualStoryboard.shots.length === 0) {
    return {
      success: false,
      error: 'Invalid storyboard structure: title and shots array are required.',
      production: null
    };
  }

  const temperature = options.temperature ?? 0.1;

  let systemInstruction;
  let productionSchema;
  let userPromptContent;

  if (productionType === PRODUCTION_TYPES.CREATOR_VIDEO) {
    systemInstruction = `You are an expert Production Agent specializing in solo content creation. Your task is to transform a structured storyboard into a highly practical, logistical production package.

You must return your output strictly in JSON format matching the schema described below. Do not include any introductory or concluding text, explanations, or Markdown code blocks. Just output raw, valid JSON.

JSON Schema Required Keys:
{
  "title": "The video title",
  "platform": "The target platform",
  "format": "The video format",
  "targetDuration": "The target duration",
  "productionType": "creator_video",
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
    
    productionSchema = `{
  "title": "The video title",
  "platform": "The target platform",
  "format": "The video format",
  "targetDuration": "The target duration",
  "productionType": "creator_video",
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
}`;
    userPromptContent = `Transform the following storyboard into a logistical production plan for a solo creator.

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

  } else if (productionType === PRODUCTION_TYPES.SHORT_FILM) {
    systemInstruction = `You are an expert Production Manager for short films. Your task is to transform a structured cinematic storyboard into a detailed, logistical production plan suitable for a small film crew.

You must return your output strictly in JSON format matching the schema described below. Do not include any introductory or concluding text, explanations, or Markdown code blocks. Just output raw, valid JSON.

JSON Schema Required Keys:
{
  "title": "The short film title",
  "logline": "The short film logline",
  "genre": "The short film genre",
  "targetDuration": "The target duration",
  "productionType": "short_film",
  "crewRoles": [
    {"role": "Director", "responsibility": "Overall creative vision, actor performance"},
    {"role": "Director of Photography", "responsibility": "Camera, lighting, composition"}
  ],
  "shotList": [
    {
      "shotNumber": 1,
      "sceneNumber": 1,
      "storyboardShotNumber": 1,
      "slugline": "INT./EXT. LOCATION - DAY/NIGHT",
      "cameraSetup": "Detailed camera and lens setup, e.g., 'ARRI Alexa Mini, 50mm Prime lens, Tripod mounted'",
      "lightingSetup": "Detailed lighting plan, e.g., 'Key light (Softbox), Fill light (Reflector), Backlight (LED Panel)'",
      "audioSetup": "Detailed audio plan, e.g., 'Boom mic (Sennheiser MKH 416), Lavalier mics for actors'",
      "voiceover": "Voice-over or off-screen narration for this shot, if present. If there is no narration, return an empty string.",
      "blocking": "Actor positions and movements within the frame.",
      "propsRequired": ["Specific props for this shot"],
      "wardrobeRequired": ["Specific wardrobe items for actors"],
      "makeupHair": "Makeup/hair notes for actors.",
      "specialEffects": "Practical or visual effects needed.",
      "notes": "Any other critical production notes for the crew."
    }
  ],
  "filmingSchedule": [
    {
      "sceneNumber": 1,
      "slugline": "INT./EXT. LOCATION - DAY/NIGHT",
      "estimatedShootTime": "e.g., '2 hours'",
      "location": "General description of location (e.g., 'Downtown Lagos Apartment')",
      "actorsPresent": ["List of actors needed"],
      "notes": "Specific scheduling notes or challenges."
    }
  ],
  "equipmentList": ["List of all major equipment needed, e.g., 'Cinema Camera Package', 'Lighting Kit', 'Sound Recorder Kit'", "Specific Lenses", "Grip Equipment"],
  "locationsList": ["List of all filming locations (e.g., 'Amara's Childhood Home', 'Lagos Market')"],
  "propsList": ["Comprehensive list of all props needed"],
  "wardrobeList": ["Comprehensive list of all wardrobe items"],
  "makeupHairNotes": "General notes for makeup and hair for all characters.",
  "postProductionNotes": ["Editing style, color grading, sound mixing, VFX notes."],
  "warnings": ["Potential production challenges or safety concerns."]
}

CRITICAL RULES:
1. NO SOLO CREATOR ASSUMPTIONS: This production plan is for a short film with a crew and actors. DO NOT impose solo-creator restrictions.
2. PRACTICALITY AND REALISM: Do NOT invent real-world permits, specific addresses, budgets, company names, or factual claims unless supported by previous agents' outputs. Focus on the logistics derivable from the storyboard.
3. GROUNDING: ONLY use information provided in the storyboard. Do NOT invent facts, statistics, product names, pricing, subscription costs, credits, commercial figures, URLs, or sources.
4. TRACEABILITY: Every production shot MUST map back to its 'storyboardShotNumber' and 'sceneNumber' from the input.
5. NO PROHIBITED MODELS: Never mention or recommend Claude, OpenAI, ChatGPT, GPT-4, etc. Use only Google Gemini / Google Cloud AI, or generic terms like 'AI tools'.
6. VOICE-OVER AND DIALOGUE: For every production shot, inspect the storyboard for narration or off-screen voice-over. Put any narrator or off-screen narration in the "voiceover" field. Do not put character dialogue into "voiceover". Character dialogue must be treated as recorded production audio and reflected in "audioSetup". If no narration exists for a shot, set "voiceover" to an empty string.
`;
    
    productionSchema = `{
  "title": "The short film title",
  "logline": "The short film logline",
  "genre": "The short film genre",
  "targetDuration": "The target duration",
  "productionType": "short_film",
  "crewRoles": [
    {"role": "Director", "responsibility": "Overall creative vision, actor performance"},
    {"role": "Director of Photography", "responsibility": "Camera, lighting, composition"}
  ],
  "shotList": [
    {
      "shotNumber": 1,
      "sceneNumber": 1,
      "storyboardShotNumber": 1,
      "slugline": "INT./EXT. LOCATION - DAY/NIGHT",
      "cameraSetup": "Detailed camera and lens setup, e.g., 'ARRI Alexa Mini, 50mm Prime lens, Tripod mounted'",
      "lightingSetup": "Detailed lighting plan, e.g., 'Key light (Softbox), Fill light (Reflector), Backlight (LED Panel)'",
      "audioSetup": "Detailed audio plan, e.g., 'Boom mic (Sennheiser MKH 416), Lavalier mics for actors'",
      "voiceover": "Voice-over or off-screen narration for this shot, if present. If there is no narration, return an empty string.",
      "blocking": "Actor positions and movements within the frame.",
      "propsRequired": ["Specific props for this shot"],
      "wardrobeRequired": ["Specific wardrobe items for actors"],
      "makeupHair": "Makeup/hair notes for actors.",
      "specialEffects": "Practical or visual effects needed.",
      "notes": "Any other critical production notes for the crew."
    }
  ],
  "filmingSchedule": [
    {
      "sceneNumber": 1,
      "slugline": "INT./EXT. LOCATION - DAY/NIGHT",
      "estimatedShootTime": "e.g., '2 hours'",
      "location": "General description of location (e.g., 'Downtown Lagos Apartment')",
      "actorsPresent": ["List of actors needed"],
      "notes": "Specific scheduling notes or challenges."
    }
  ],
  "equipmentList": ["List of all major equipment needed, e.g., 'Cinema Camera Package', 'Lighting Kit', 'Sound Recorder Kit'", "Specific Lenses", "Grip Equipment"],
  "locationsList": ["List of all filming locations (e.g., 'Amara's Childhood Home', 'Lagos Market')"],
  "propsList": ["Comprehensive list of all props needed"],
  "wardrobeList": ["Comprehensive list of all wardrobe items"],
  "makeupHairNotes": "General notes for makeup and hair for all characters.",
  "postProductionNotes": ["Editing style, color grading, sound mixing, VFX notes."],
  "warnings": ["Potential production challenges or safety concerns."]
}`;
    userPromptContent = `Transform the following structured cinematic storyboard into a detailed, logistical production plan suitable for a small film crew.

Storyboard Information:
Title: ${actualStoryboard.title}
Logline: ${actualStoryboard.logline || 'N/A'}
Genre: ${actualStoryboard.genre || 'N/A'}
Target Duration: ${actualStoryboard.targetDuration || 'N/A'}
Production Type: ${actualStoryboard.productionType}

Shots:
${actualStoryboard.shots.map(s => `
- Shot #${s.shotNumber} (Scene #${s.sceneNumber}) - ${s.slugline}
  Estimated Duration: ${s.estimatedDuration || 'N/A'}
  Camera Angle: ${s.cameraAngle || 'N/A'}
  Camera Movement: ${s.cameraMovement || 'N/A'}
  Shot Size: ${s.shotSize || 'N/A'}
  Visual Description: ${s.visualDescription}
  Actor Action: ${s.actorAction || 'N/A'}
  Dialogue Cue: ${s.dialogueCue || 'N/A'}
  Voiceover: ${s.voiceover || 'N/A'}
  Sound Effect: ${s.soundEffect || 'N/A'}
  Ambient Sound: ${s.ambientSound || 'N/A'}
  Music Cue: ${s.musicCue || 'N/A'}
  Location Detail: ${s.locationDetail || 'N/A'}
  Props Used: ${(s.propsUsed || []).join(', ')}
  Lighting: ${s.lighting || 'N/A'}
  Continuity Notes: ${s.continuityNotes || 'N/A'}
`).join('\n')}
`;
  } else {
    return { success: false, error: `Unsupported production type: ${productionType}`, production: null };
  }

  // 3. Construct System Instruction for Production Agent
  // This will be dynamic based on productionType
  systemInstruction = `
${systemInstruction}

Production Plan Schema:
${productionSchema}`;

  // 4. Construct the user prompt
  const userPrompt = `${userPromptContent}

Generate the production plan strictly conforming to the JSON schema.`;

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

    let parsedProduction;
    let repairContextSchema;

    if (productionType === PRODUCTION_TYPES.CREATOR_VIDEO) {
        repairContextSchema = `{
  "title": "string",
  "platform": "string",
  "format": "string",
  "targetDuration": "string",
  "productionType": "creator_video",
  "shotList": [
    {
      "shotNumber": 1,
      "storyboardShotNumber": 1,
      "shotType": "Presenter | B-Roll | Screen Recording | Graphics/Text | Voiceover",
      "location": "string",
      "description": "string",
      "setupInstructions": "string"
    }
  ],
  "filmingChecklist": [],
  "equipment": [],
  "locations": [],
  "props": [],
  "screenRecordingRequirements": [],
  "audioRequirements": [],
  "productionNotes": [],
  "warnings": []
}`;
    } else if (productionType === PRODUCTION_TYPES.SHORT_FILM) {
        repairContextSchema = `{
  "title": "string",
  "logline": "string",
  "genre": "string",
  "targetDuration": "string",
  "productionType": "short_film",
  "crewRoles": [],
  "shotList": [
    {
      "shotNumber": 1,
      "sceneNumber": 1,
      "storyboardShotNumber": 1,
      "slugline": "string",
      "cameraSetup": "string",
      "lightingSetup": "string",
      "audioSetup": "string",
      "voiceover": "string",
      "blocking": "string",
      "propsRequired": [],
      "wardrobeRequired": [],
      "makeupHair": "string",
      "specialEffects": "string",
      "notes": "string"
    }
  ],
  "filmingSchedule": [],
  "equipmentList": [],
  "locationsList": [],
  "propsList": [],
  "wardrobeList": [],
  "makeupHairNotes": "string",
  "postProductionNotes": [],
  "warnings": []
}`;
    } else {
        return { success: false, error: `Unsupported production type for parsing: ${productionType}`, production: null };
    }

    try {
      parsedProduction = await parseOrRepairJson(
        responseText,
        repairContextSchema
      );
    } catch (parseError) {
      return {
        success: false,
        error: `Production JSON could not be parsed or repaired: ${parseError.message}`,
        production: null
      };
    }

    // 6. Traceability and Validity Verification
    // For short films, storyboard shot identity is authoritative.
    // Do not allow the AI-generated production plan to invent or alter
    // scene/shot references.

    if (productionType === PRODUCTION_TYPES.SHORT_FILM) {
      if (parsedProduction.shotList.length !== actualStoryboard.shots.length) {
        return {
          success: false,
          error: `Traceability failure: Production shot count (${parsedProduction.shotList.length}) does not match storyboard shot count (${actualStoryboard.shots.length}).`,
          production: null
        };
      }

      parsedProduction.shotList = parsedProduction.shotList.map((shot, index) => {
        const storyboardShot = actualStoryboard.shots[index];

        return {
          ...shot,
          shotNumber: storyboardShot.shotNumber,
          sceneNumber: storyboardShot.sceneNumber,
          storyboardShotNumber: storyboardShot.shotNumber,
          slugline: shot.slugline || storyboardShot.slugline
        };
      });
    }

    if (!parsedProduction || typeof parsedProduction !== 'object') {
      return { success: false, error: 'Gemini returned an invalid object structure.', production: null };
    }

    if (!Array.isArray(parsedProduction.shotList)) {
      return { success: false, error: 'Production plan is missing a valid shotList array.', production: null };
    }

    // Conditional traceability for shotList
    if (productionType === PRODUCTION_TYPES.CREATOR_VIDEO) {
      const storyboardShotNumbers = new Set(actualStoryboard.shots.map(s => s.shotNumber));
      for (const shot of parsedProduction.shotList) {
        if (!storyboardShotNumbers.has(shot.storyboardShotNumber)) {
          return {
            success: false,
            error: `Traceability failure: Production shot #${shot.shotNumber} references a non-existent storyboard shot #${shot.storyboardShotNumber}.`,
            production: null
          };
        }
      }
    } else if (productionType === PRODUCTION_TYPES.SHORT_FILM) {
        // For short film, ensure sceneNumber and slugline also trace back
        const storyboardShotMap = new Map();
        actualStoryboard.shots.forEach(s => {
            storyboardShotMap.set(`${s.sceneNumber}-${s.shotNumber}`, s);
        });

        for (const shot of parsedProduction.shotList) {
            if (!shot.sceneNumber || !shot.shotNumber || !storyboardShotMap.has(`${shot.sceneNumber}-${shot.shotNumber}`)) {
                return {
                    success: false,
                    error: `Traceability failure: Production shot (Scene #${shot.sceneNumber}, Shot #${shot.shotNumber}) references a non-existent storyboard shot.`,
                    production: null
                };
            }
        }
    }

    // 7. Normalization
    let normalizedProduction;
    if (productionType === PRODUCTION_TYPES.CREATOR_VIDEO) {
        normalizedProduction = {
            title: parsedProduction.title || actualStoryboard.title,
            platform: parsedProduction.platform || actualStoryboard.platform || "Not specified",
            format: parsedProduction.format || actualStoryboard.format || "Not specified",
            targetDuration: actualStoryboard.targetDuration || "Not specified",
            productionType: productionType, // Add productionType
            shotList: parsedProduction.shotList,
            filmingChecklist: Array.isArray(parsedProduction.filmingChecklist) ? parsedProduction.filmingChecklist : [],
            equipment: Array.isArray(parsedProduction.equipment) ? parsedProduction.equipment : [],
            locations: Array.isArray(parsedProduction.locations) ? parsedProduction.locations : [],
            props: Array.isArray(parsedProduction.props) ? parsedProduction.props : [],
            screenRecordingRequirements: Array.isArray(parsedProduction.screenRecordingRequirements) ? parsedProduction.screenRecordingRequirements : [],
            audioRequirements: Array.isArray(parsedProduction.audioRequirements) ? parsedProduction.audioRequirements : [],
            productionNotes: Array.isArray(parsedProduction.productionNotes) ? parsedProduction.productionNotes : [],
            warnings: Array.isArray(parsedProduction.warnings) ? parsedProduction.warnings : []
        };
    } else if (productionType === PRODUCTION_TYPES.SHORT_FILM) {
        normalizedProduction = {
            title: parsedProduction.title || actualStoryboard.title,
            logline: parsedProduction.logline || actualStoryboard.logline || "Not specified",
            genre: parsedProduction.genre || actualStoryboard.genre || "Not specified",
            targetDuration: actualStoryboard.targetDuration || "Not specified",
            productionType: productionType, // Add productionType
            crewRoles: Array.isArray(parsedProduction.crewRoles) ? parsedProduction.crewRoles : [],
            shotList: parsedProduction.shotList,
            filmingSchedule: Array.isArray(parsedProduction.filmingSchedule) ? parsedProduction.filmingSchedule : [],
            equipmentList: Array.isArray(parsedProduction.equipmentList) ? parsedProduction.equipmentList : [],
            locationsList: Array.isArray(parsedProduction.locationsList) ? parsedProduction.locationsList : [],
            propsList: Array.isArray(parsedProduction.propsList) ? parsedProduction.propsList : [],
            wardrobeList: Array.isArray(parsedProduction.wardrobeList) ? parsedProduction.wardrobeList : [],
            makeupHairNotes: parsedProduction.makeupHairNotes || "N/A",
            postProductionNotes: Array.isArray(parsedProduction.postProductionNotes) ? parsedProduction.postProductionNotes : [],
            warnings: Array.isArray(parsedProduction.warnings) ? parsedProduction.warnings : []
        };
    }
    
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










