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
  const productionType = actualScript.productionType || options.productionType || PRODUCTION_TYPES.CREATOR_VIDEO;

  // 2. Validate that the required script information exists
  // Validation logic will differ based on productionType
  if (productionType === PRODUCTION_TYPES.CREATOR_VIDEO) {
    const requiredFields = [
      'title', 'audience', 'platform', 'tone', 'targetDuration', 'format',
      'hook', 'sections', 'sources', 'claimsRequiringVerification'
    ];
    for (const field of requiredFields) {
      if (actualScript[field] === undefined || actualScript[field] === null) {
        return { success: false, error: `Missing required script field for CREATOR_VIDEO: ${field}`, step: 'validation' };
      }
    }
    if (!Array.isArray(actualScript.sections) || actualScript.sections.length === 0) {
      return { success: false, error: 'Script sections must be a non-empty array for CREATOR_VIDEO.', step: 'validation' };
    }
    for (let i = 0; i < actualScript.sections.length; i++) {
      const section = actualScript.sections[i];
      if (typeof section.narration !== 'string' || section.narration.trim() === '') {
        return { success: false, error: `Section at index ${i} is missing a non-empty narration for CREATOR_VIDEO.`, step: 'validation' };
      }
    }
  } else if (productionType === PRODUCTION_TYPES.SHORT_FILM) {
    const requiredFields = [
      'title', 'logline', 'genre', 'characters', 'scenes'
    ];
    for (const field of requiredFields) {
      if (actualScript[field] === undefined || actualScript[field] === null) {
        return { success: false, error: `Missing required script field for SHORT_FILM: ${field}`, step: 'validation' };
      }
    }
    if (!Array.isArray(actualScript.scenes) || actualScript.scenes.length === 0) {
      return { success: false, error: 'Script scenes must be a non-empty array for SHORT_FILM.', step: 'validation' };
    }
  } else {
    return { success: false, error: `Unsupported production type: ${productionType}`, step: 'validation' };
  }

  const temperature = options.temperature ?? 0.2;

  let systemInstruction;
  let storyboardSchema;
  let userPromptContent;

  if (productionType === PRODUCTION_TYPES.CREATOR_VIDEO) {
    systemInstruction = `You are an expert Storyboard Agent for solo video creators. Your task is to transform a structured video script into a practical, production-ready, shot-by-shot storyboard.

You must return your output strictly in JSON format matching the schema described below. Do not include any introductory or concluding text, explanations, or Markdown code blocks. Just output raw, valid JSON.

JSON Schema Required Keys:
{
  "title": "The title of the video script",
  "platform": "The target platform (e.g. YouTube, TikTok, Podcast)",
  "format": "The video format",
  "targetDuration": "The target duration of the video",
  "productionType": "creator_video",
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
    
    storyboardSchema = `{
  "title": "The title of the video script",
  "platform": "The target platform (e.g. YouTube, TikTok, Podcast)",
  "format": "The video format",
  "targetDuration": "The target duration of the video",
  "productionType": "creator_video",
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
}`;
    userPromptContent = `Transform the following structured video script into a practical, production-ready, shot-by-shot storyboard conforming to the requested JSON schema.

Title: ${actualScript.title}
Audience: ${actualScript.audience}
Platform: ${actualScript.platform}
Tone: ${actualScript.tone}
Target Duration: ${actualScript.targetDuration}

CRITICAL DURATION REQUIREMENT: Treat the target duration as a hard constraint. First calculate the required total duration in seconds from the target duration. Then distribute that duration across all scenes and shots. The sum of ALL shot estimatedDuration values MUST be between 95% and 105% of the requested target duration. For a 10-minute target, the total MUST be between 570 and 630 seconds. Do NOT generate a storyboard shorter or longer than this range. Do NOT merely set the targetDuration field to 10 minutes. Before returning JSON, verify the arithmetic sum of every shot estimatedDuration and adjust shot count and durations until the total is within the required range.
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

  } else if (productionType === PRODUCTION_TYPES.SHORT_FILM) {
    systemInstruction = `You are an expert Cinematic Storyboard Artist. Your task is to transform a structured short film screenplay into a detailed, shot-by-shot cinematic storyboard.

You must return your output strictly in JSON format matching the schema described below. Do not include any introductory or concluding text, explanations, or Markdown code blocks. Just output raw, valid JSON.

JSON Schema Required Keys:
{
  "title": "The title of the short film",
  "logline": "The logline of the short film",
  "genre": "The genre of the short film",
  "targetDuration": "The target duration of the short film",
  "productionType": "short_film",
  "shots": [
    {
      "shotNumber": 1,
      "sceneNumber": 1,
      "slugline": "INT./EXT. LOCATION - DAY/NIGHT",
      "estimatedDuration": "Estimated duration for this shot (e.g. '5s', '10s')",
      "cameraAngle": "Camera angle (e.g., 'Low Angle', 'High Angle', 'Eye Level')",
      "cameraMovement": "Camera movement (e.g., 'Static', 'Pan Left', 'Tilt Up', 'Tracking Shot', 'Dolly In')",
      "shotSize": "Shot size (e.g., 'Extreme Wide Shot', 'Full Shot', 'Medium Shot', 'Close-Up', 'Extreme Close-Up')",
      "visualDescription": "Highly descriptive cinematic visual description of what is shown. Focus on composition, lighting, and mood.",
      "actorAction": "Detailed actions and expressions of characters/actors in the shot.",
      "dialogueCue": "Exact dialogue line spoken in this shot, or 'N/A' if none.",
      "voiceover": "Narration or off-screen voice-over explicitly present in the screenplay for this shot, or 'None' if there is no narration.",
      "soundEffect": "Specific sound effect (e.g., 'DOOR CREAKS', 'GUNSHOT')",
      "ambientSound": "Ambient sounds present (e.g., 'Distant city hum', 'Wind blowing')",
      "musicCue": "Music direction for this shot (e.g., 'Melancholic piano', 'Tense orchestral sting')",
      "locationDetail": "Specific details about the filming location relevant to the shot.",
      "propsUsed": ["List of props visible or interacted with in the shot"],
      "lighting": "Detailed lighting description (e.g., 'Soft, natural light', 'Dramatic chiaroscuro', 'Backlit silhouette')",
      "continuityNotes": "Notes for maintaining continuity with surrounding shots."
    }
  ]
}

CRITICAL RULES FOR CINEMATIC STORYBOARDS:
1. NO SOLO CREATOR RESTRICTIONS: This storyboard is for a cinematic production. DO NOT assume a single presenter, home office setups, or household props. Assume a full production crew, actors, and appropriate equipment.
2. CINEMATIC DETAIL: Provide rich visual and auditory detail. Describe camera angles, movements, lighting, and actor actions suitable for a film.
3. ALIGNMENT WITH SCRIPT: Ensure each shot directly corresponds to and visualizes elements from the provided short film screenplay (sluglines, action, dialogue, sound, music).
4. VOICEOVER MAPPING: When the screenplay scene contains a non-empty Voiceover value, map that exact narration into the storyboard shot "voiceover" field for the shot where that narration is heard. Copy the wording exactly. Do not paraphrase, shorten, rewrite, or invent narration.
5. DIALOGUE VS VOICEOVER: Character dialogue belongs in "dialogueCue". Narrator or off-screen narration belongs in "voiceover". Never put VOICEOVER narration into "dialogueCue".
6. COMPLETENESS: The storyboard must cover all scenes of the screenplay, logically progressing through the narrative.
7. NO NARRATION/VOICEOVER BY DEFAULT: Voiceover should ONLY be included if explicitly part of the screenplay. DO NOT generate generic voiceovers for every shot.
8. NO PROHIBITED THIRD-PARTY MODELS: You MUST NOT recommend, instruct users to use, or position third-party AI models or platforms such as Claude, OpenAI, Anthropic, ChatGPT, GPT-4, or any other prohibited AI systems as part of the CreatorPilot workflow or tool recommendations.
`;

    storyboardSchema = `{
  "title": "The title of the short film",
  "logline": "The logline of the short film",
  "genre": "The genre of the short film",
  "targetDuration": "The target duration of the short film",
  "productionType": "short_film",
  "shots": [
    {
      "shotNumber": 1,
      "sceneNumber": 1,
      "slugline": "INT./EXT. LOCATION - DAY/NIGHT",
      "estimatedDuration": "Estimated duration for this shot (e.g. '5s', '10s')",
      "cameraAngle": "Camera angle (e.g., 'Low Angle', 'High Angle', 'Eye Level')",
      "cameraMovement": "Camera movement (e.g., 'Static', 'Pan Left', 'Tilt Up', 'Tracking Shot', 'Dolly In')",
      "shotSize": "Shot size (e.g., 'Extreme Wide Shot', 'Full Shot', 'Medium Shot', 'Close-Up', 'Extreme Close-Up')",
      "visualDescription": "Highly descriptive cinematic visual description of what is shown. Focus on composition, lighting, and mood.",
      "actorAction": "Detailed actions and expressions of characters/actors in the shot.",
      "dialogueCue": "Exact dialogue line spoken in this shot, or 'N/A' if none.",
      "voiceover": "Narration or off-screen voice-over explicitly present in the screenplay for this shot, or 'None' if there is no narration.",
      "soundEffect": "Specific sound effect (e.g., 'DOOR CREAKS', 'GUNSHOT')",
      "ambientSound": "Ambient sounds present (e.g., 'Distant city hum', 'Wind blowing')",
      "musicCue": "Music direction for this shot (e.g., 'Melancholic piano', 'Tense orchestral sting')",
      "locationDetail": "Specific details about the filming location relevant to the shot.",
      "propsUsed": ["List of props visible or interacted with in the shot"],
      "lighting": "Detailed lighting description (e.g., 'Soft, natural light', 'Dramatic chiaroscuro', 'Backlit silhouette')",
      "continuityNotes": "Notes for maintaining continuity with surrounding shots."
    }
  ]
}`;
    userPromptContent = `Transform the following structured short film screenplay into a detailed, shot-by-shot cinematic storyboard conforming to the requested JSON schema.

Screenplay Information:
Title: ${actualScript.title}
Logline: ${actualScript.logline}
Genre: ${actualScript.genre}
Target Duration: ${actualScript.targetDuration}

CRITICAL DURATION REQUIREMENT: Treat the target duration as a hard constraint. First calculate the required total duration in seconds from the target duration. Then distribute that duration across all scenes and shots. The sum of ALL shot estimatedDuration values MUST be between 95% and 105% of the requested target duration. For a 10-minute target, the total MUST be between 570 and 630 seconds. Do NOT generate a storyboard shorter or longer than this range. Do NOT merely set the targetDuration field to 10 minutes. Before returning JSON, verify the arithmetic sum of every shot estimatedDuration and adjust shot count and durations until the total is within the required range.

Characters:
${actualScript.characters.map(char => `- ${char.name}: ${char.description}`).join('\n')}

Scenes:
${actualScript.scenes.map(scene => `
Scene ${scene.sceneNumber}: ${scene.slugline}
Location: ${scene.location}
Time of Day: ${scene.timeOfDay}
Action: ${scene.action}
Characters Present: ${scene.charactersPresent.join(', ')}
Dialogue:
${scene.dialogue
  .filter(d => String(d.character || '').toUpperCase() !== 'VOICEOVER')
  .map(d => `  - ${d.character}: ${d.line}`)
  .join('\n') || 'None'}

Voiceover:
${scene.dialogue
  .filter(d => String(d.character || '').toUpperCase() === 'VOICEOVER')
  .map(d => d.line)
  .filter(Boolean)
  .join(' ') || 'None'}

Sound: ${scene.sound}
Music: ${scene.music}
Ending Transition: ${scene.endingTransition}
`).join('\n')}

Ending: ${actualScript.ending}
`;
  } else {
    return { success: false, error: `Unsupported production type: ${productionType}`, step: 'validation' };
  }

  // Type and format validation
  if (typeof actualScript.title !== 'string' || actualScript.title.trim() === '') {
    return { success: false, error: 'Script title must be a non-empty string.', step: 'validation' };
  }
  
  // No need for these specific checks if it's a short_film, as the schema is different
  if (productionType === PRODUCTION_TYPES.CREATOR_VIDEO) {
    if (typeof actualScript.audience !== 'string' || actualScript.audience.trim() === '') {
      return { success: false, error: 'Script audience must be a non-empty string.', step: 'validation' };
    }
    if (typeof actualScript.platform !== 'string' || actualScript.platform.trim() === '') {
      return { success: false, error: 'Script platform must be a non-empty string.', step: 'validation' };
    }
    if (typeof actualScript.tone !== 'string' || actualScript.tone.trim() === '') {
      return { success: false, error: 'Script tone must be a non-empty string.', step: 'validation' };
    }
    if (typeof actualScript.format !== 'string' || actualScript.format.trim() === '') {
      return { success: false, error: 'Script format must be a non-empty string.', step: 'validation' };
    }
    if (typeof actualScript.hook !== 'string' || actualScript.hook.trim() === '') {
      return { success: false, error: 'Script hook must be a non-empty string.', step: 'validation' };
    }
    if (!Array.isArray(actualScript.sources)) {
      return { success: false, error: 'Script sources must be an array.', step: 'validation' };
    }
    if (!Array.isArray(actualScript.claimsRequiringVerification)) {
      return { success: false, error: 'Script claimsRequiringVerification must be an array.', step: 'validation' };
    }
  }


  // 3. Construct System Instruction for Storyboard Agent
  // This will be dynamic based on productionType
  systemInstruction = `
${systemInstruction}

Storyboard Schema:
${storyboardSchema}`;

  // 4. Construct the user prompt
  const userPrompt = `${userPromptContent}

Generate the storyboard strictly conforming to the JSON schema.`;

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

    if (productionType === PRODUCTION_TYPES.CREATOR_VIDEO) {
        // Normalize sourceReferences and do strict validation on shot structures for CREATOR_VIDEO
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
    } else if (productionType === PRODUCTION_TYPES.SHORT_FILM) {
        // Validation for SHORT_FILM
        for (let i = 0; i < storyboard.shots.length; i++) {
            const shot = storyboard.shots[i];
            if (!shot || typeof shot !== 'object') {
                return {
                    success: false,
                    error: `Shot at index ${i} is not a valid object for SHORT_FILM.`,
                    step: 'validation'
                };
            }
            if (shot.shotNumber === undefined || shot.sceneNumber === undefined || shot.slugline === undefined) {
                return {
                    success: false,
                    error: `Shot at index ${i} missing required cinematic fields (shotNumber, sceneNumber, slugline).`,
                    step: 'validation'
                };
            }
            // Add more specific validation for cinematic shots if necessary
        }
    }
    
    // ============================================================
    // DETERMINISTIC SHORT-FILM VOICEOVER MAPPING
    // ============================================================
    // Do not rely on the storyboard model to preserve screenplay
    // voiceover exactly. Read it directly from the screenplay and
    // attach it to the first storyboard shot for the matching scene.
    if (productionType === PRODUCTION_TYPES.SHORT_FILM) {
      const screenplayScenes = Array.isArray(actualScript.scenes)
        ? actualScript.scenes
        : [];

      const voiceoverByScene = new Map();

      for (const scene of screenplayScenes) {
        const sceneNumber = scene.sceneNumber;

        const voiceoverLines = Array.isArray(scene.dialogue)
          ? scene.dialogue
              .filter(
                d =>
                  String(d?.character || '').trim().toUpperCase() ===
                  'VOICEOVER'
              )
              .map(d => String(d?.line || '').trim())
              .filter(Boolean)
          : [];

        voiceoverByScene.set(
          sceneNumber,
          voiceoverLines.join(' ')
        );
      }

      const sceneFirstShotAssigned = new Set();

      for (const shot of storyboard.shots) {
        const sceneNumber = shot.sceneNumber;
        const screenplayVoiceover =
          voiceoverByScene.get(sceneNumber) || '';

        // Default every shot to no voiceover.
        shot.voiceover = 'None';

        // Put the screenplay voiceover on the first shot
        // belonging to that scene.
        if (
          screenplayVoiceover &&
          !sceneFirstShotAssigned.has(sceneNumber)
        ) {
          shot.voiceover = screenplayVoiceover;
          sceneFirstShotAssigned.add(sceneNumber);
        }
      }

      console.log(
        '[Storyboard DEBUG] deterministic voiceover mapping:',
        storyboard.shots.map(shot => ({
          shotNumber: shot.shotNumber,
          sceneNumber: shot.sceneNumber,
          voiceover: shot.voiceover
        }))
      );
    }
    // Enforce requested duration for SHORT_FILM deterministically.
    // Gemini estimates can drift, so normalize all shot durations to the target.
    if (productionType === PRODUCTION_TYPES.SHORT_FILM) {
      const durationText = String(actualScript.targetDuration || '').toLowerCase();
      const durationMatch = durationText.match(/(\d+(?:\.\d+)?)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)/i);

      if (durationMatch) {
        const amount = parseFloat(durationMatch[1]);
        const unit = durationMatch[2].toLowerCase();
        const targetSeconds =
          unit.startsWith('hour') || unit.startsWith('hr') ? amount * 3600 :
          unit.startsWith('minute') || unit.startsWith('min') ? amount * 60 :
          amount;

        const parseShotSeconds = (value) => {
          const match = String(value || '').match(/(\d+(?:\.\d+)?)\s*(seconds?|secs?|minutes?|mins?)/i);
          if (!match) return 5;
          const number = parseFloat(match[1]);
          return /minute|min/i.test(match[2]) ? number * 60 : number;
        };

        const rawDurations = storyboard.shots.map(shot => Math.max(1, parseShotSeconds(shot.estimatedDuration)));
        const rawTotal = rawDurations.reduce((sum, value) => sum + value, 0);

        if (rawTotal > 0 && targetSeconds > 0) {
          let normalizedTotal = 0;

          storyboard.shots.forEach((shot, index) => {
            const normalized = Math.max(
              1,
              Math.round((rawDurations[index] / rawTotal) * targetSeconds)
            );

            shot.estimatedDuration = `${normalized}s`;
            normalizedTotal += normalized;
          });

          // Correct rounding drift on the final shot so the total is exact.
          const difference = Math.round(targetSeconds - normalizedTotal);
          if (storyboard.shots.length > 0 && difference !== 0) {
            const lastShot = storyboard.shots[storyboard.shots.length - 1];
            const lastSeconds = parseShotSeconds(lastShot.estimatedDuration);
            lastShot.estimatedDuration = `${Math.max(1, lastSeconds + difference)}s`;
          }
        }
      }
    }
    // 6. Return successful structured response
    return {
      success: true,
      storyboard: {
        title: storyboard.title || actualScript.title,
        platform: storyboard.platform || actualScript.platform,
        format: storyboard.format || actualScript.format,
        targetDuration: actualScript.targetDuration,
        productionType: productionType, // Add productionType
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













