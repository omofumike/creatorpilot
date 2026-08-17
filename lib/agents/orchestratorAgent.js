import { researchTopic } from './researchAgent.js';
import { generateScript } from './scriptAgent.js';
import { generateStoryboard } from './storyboardAgent.js';
import { generateProductionPlan } from './producerAgent.js';
import { reviewQuality } from './qualityAgent.js';
import { config } from '../utils/config.js';
import { ai } from '../utils/gemini.js'; // Added import for Gemini AI
import { PRODUCTION_TYPES, DEFAULT_PRODUCTION_TYPE, isValidProductionType } from '../utils/productionTypes.js'; // Added import for production types


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
 * Infers the production type from the user's topic using Gemini.
 * Defaults to CREATOR_VIDEO if inference is ambiguous or fails.
 *
 * @param {string} topic - The user's production topic.
 * @returns {Promise<string>} The inferred production type.
 */
async function inferProductionType(topic) {
  // Explicit short-film language takes priority over AI inference.
  // This prevents obvious cinematic requests from falling back to creator_video.
  const normalizedTopic = String(topic || '').toLowerCase();

  const explicitShortFilmPattern = /\b(short film|short-film|movie|screenplay|feature film|cinematic film|fictional story|dramatic movie|film screenplay)\b/i;

  if (explicitShortFilmPattern.test(normalizedTopic)) {
    return PRODUCTION_TYPES.SHORT_FILM;
  }

  const systemInstruction = `You are an expert Production Type Inference Agent. Your task is to analyze a user's request for a video production and determine its type.

  You must return your output strictly in JSON format matching the schema described below. Do not include any introductory or concluding text, explanations, or Markdown code blocks. Just output raw, valid JSON.

  JSON Schema Required Keys:
  {
    "productionType": "creator_video" | "short_film"
  }

  CRITICAL RULES:
  1. ONLY use "creator_video" or "short_film" as productionType. Do NOT use any other value.
  2. If the request is for a tutorial, explanation, educational content, review, vlog, or anything typically found on YouTube by a single creator, use "creator_video".
  3. If the request implies a narrative, story, characters, dialogue, scenes, or cinematic elements, use "short_film".
  4. If the request is ambiguous, default to "creator_video".

  Examples:
  "Create a YouTube video explaining artificial intelligence." -> {"productionType": "creator_video"}
  "Create a tutorial showing how to use Figma." -> {"productionType": "creator_video"}
  "Create a cinematic short film about a woman returning to Lagos." -> {"productionType": "short_film"}
  "Write a dramatic movie about two brothers." -> {"productionType": "short_film"}
  "Create a 60-second Instagram video about climate change." -> {"productionType": "creator_video"}
  "Create a fictional story about a detective investigating a murder." -> {"productionType": "short_film"}
  `;

  const userPrompt = `Analyze the following video production request and infer its production type:
  Request: "${topic}"`;

  try {
    const geminiResponse = await ai.models.generateContent({
      model: config.geminiModel,
      contents: userPrompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        temperature: 0, // Keep temperature low for deterministic inference
      },
    });

    const responseText = geminiResponse.text;
    if (!responseText) {
      console.warn('[Orchestrator Agent] Gemini returned empty response for production type inference. Defaulting to CREATOR_VIDEO.');
      return DEFAULT_PRODUCTION_TYPE;
    }

    const cleanedJson = cleanJsonResponse(responseText);
    const parsed = JSON.parse(cleanedJson);

    if (parsed && isValidProductionType(parsed.productionType)) {
      return parsed.productionType;
    } else {
      console.warn(`[Orchestrator Agent] Invalid or ambiguous production type inferred: ${parsed?.productionType}. Defaulting to CREATOR_VIDEO.`);
      return DEFAULT_PRODUCTION_TYPE;
    }
  } catch (error) {
    console.error(`[Orchestrator Agent] Error during production type inference: ${redactApiKeys(error.message || error)}. Defaulting to CREATOR_VIDEO.`);
    return DEFAULT_PRODUCTION_TYPE;
  }
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
 * Deep clones an object to prevent any mutation of upstream agent outputs.
 * 
 * @param {any} obj - Object to clone.
 * @returns {any} Cloned object.
 */
function deepClone(obj) {
  if (obj === undefined) return undefined;
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Orchestrates the complete CreatorPilot pipeline sequentially:
 * Research -> Script -> Storyboard -> Production -> Quality.
 * 
 * @param {string} topic - The research topic or video theme.
 * @param {Object} [options] - Configuration and styling options for each stage.
 * @param {Object} [options.research] - Options passed to Research Agent.
 * @param {Object} [options.script] - Options passed to Script Agent.
 * @param {Object} [options.storyboard] - Options passed to Storyboard Agent.
 * @param {Object} [options.production] - Options passed to Production Agent.
 * @param {Object} [options.quality] - Options passed to Quality Agent.
 * @returns {Promise<Object>} Final pipeline structured output or error details.
 */
export async function runPipeline(topic, options = {}) {
  // 1. Validate the topic input
  if (!topic || typeof topic !== 'string' || topic.trim() === '') {
    return {
      success: false,
      failedStage: 'validation',
      error: 'Topic parameter is required and must be a non-empty string.',
      step: 'validation',
      topic: topic || ''
    };
  }

  const queryTopic = topic.trim();
  const stages = {};

  // Preserve an explicitly requested duration from the user's topic.
  const durationMatch = queryTopic.match(/\b(\d+(?:\.\d+)?)\s*[-]?\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)\b/i);
  const requestedDuration = options.targetDuration ||
    (durationMatch ? `${durationMatch[1]} ${durationMatch[2].toLowerCase()}` : undefined);


  try {
    // Infer production type first
    const inferredProductionType = await inferProductionType(queryTopic);
    const effectiveOptions = {
        ...options,
        productionType: inferredProductionType,
        research: { ...(options.research || {}), productionType: inferredProductionType },
        script: { ...(options.script || {}), productionType: inferredProductionType, targetDuration: requestedDuration },
        storyboard: { ...(options.storyboard || {}), productionType: inferredProductionType, targetDuration: requestedDuration },
        production: { ...(options.production || {}), productionType: inferredProductionType, targetDuration: requestedDuration },
        quality: { ...(options.quality || {}), productionType: inferredProductionType, targetDuration: requestedDuration }
    };

    // ==========================================
    // STAGE 1: RESEARCH
    // ==========================================
    const researchResult = await researchTopic(queryTopic, effectiveOptions.research);
    if (!researchResult || !researchResult.success) {
      return {
        success: false,
        failedStage: 'research',
        error: redactApiKeys(researchResult?.error || 'Research Stage returned an unsuccessful response.'),
        step: researchResult?.step || 'generation',
        topic: queryTopic,
        stages: deepClone(stages)
      };
    }
    stages.research = deepClone(researchResult);

    // Extract the researchBrief for downstream stages
    const researchBrief = researchResult.researchBrief;

    // ==========================================
    // STAGE 2: SCRIPT
    // ==========================================
    console.log('[DEBUG] Script options targetDuration:', effectiveOptions.script.targetDuration);
    const scriptResult = await generateScript(researchBrief, effectiveOptions.script);
    if (!scriptResult || !scriptResult.success) {
      return {
        success: false,
        failedStage: 'script',
        error: redactApiKeys(scriptResult?.error || 'Script Stage returned an unsuccessful response.'),
        step: scriptResult?.step || 'generation',
        topic: queryTopic,
        stages: deepClone(stages)
      };
    }
    stages.script = deepClone(scriptResult);

    // Extract script content (unwrapped) for downstream stages
    const script = scriptResult.script;

    // ==========================================
    // STAGE 3: STORYBOARD
    // ==========================================
    const storyboardResult = await generateStoryboard(script, effectiveOptions.storyboard);
    if (!storyboardResult || !storyboardResult.success) {
      return {
        success: false,
        failedStage: 'storyboard',
        error: redactApiKeys(storyboardResult?.error || 'Storyboard Stage returned an unsuccessful response.'),
        step: storyboardResult?.step || 'generation',
        topic: queryTopic,
        stages: deepClone(stages)
      };
    }
    stages.storyboard = deepClone(storyboardResult);

    // Extract storyboard content (unwrapped) for downstream stages
    const storyboard = storyboardResult.storyboard;

    // ==========================================
    // STAGE 4: PRODUCTION
    // ==========================================
    const productionResult = await generateProductionPlan(storyboard, effectiveOptions.production);
    if (!productionResult || !productionResult.success) {
      return {
        success: false,
        failedStage: 'production',
        error: redactApiKeys(productionResult?.error || 'Production Stage returned an unsuccessful response.'),
        step: 'generation', // Production Agent uses 'generation' implicitly
        topic: queryTopic,
        stages: deepClone(stages)
      };
    }
    stages.production = deepClone(productionResult);

    // Extract production plan content (unwrapped) for downstream stages
    const production = productionResult.production;

    // ==========================================
    // STAGE 5: QUALITY GATE
    // ==========================================
    const qualityResult = await reviewQuality(
      researchBrief,
      script,
      storyboard,
      production,
      effectiveOptions.quality
    );
    if (!qualityResult || !qualityResult.success) {
      return {
        success: false,
        failedStage: 'quality',
        error: redactApiKeys(qualityResult?.error || 'Quality Stage returned an unsuccessful response.'),
        step: qualityResult?.step || 'generation',
        topic: queryTopic,
        stages: deepClone(stages)
      };
    }
    stages.quality = deepClone(qualityResult);

    // Extract the quality report content
    const qualityReport = qualityResult.report;

    // ==========================================
    // PACKAGING FINAL RESPONSE
    // ==========================================
    return {
      success: true,
      topic: queryTopic,
      status: qualityReport.status || 'WARNING',
      overallScore: qualityReport.overallScore ?? 70,
      stages: deepClone(stages),
      productionType: inferredProductionType, // Add inferred production type to final package
      finalPackage: {
        researchBrief: deepClone(researchBrief),
        script: deepClone(script),
        storyboard: deepClone(storyboard),
        productionPlan: deepClone(production),
        qualityReport: deepClone(qualityReport),
        productionType: inferredProductionType // Add inferred production type to final package
      }
    };

  } catch (error) {
    // Uncaught pipeline execution exception handling
    const errorMessage = redactApiKeys(error.message || String(error));
    
    // Attempt to dynamically figure out which stage was running
    let failedStage = 'orchestration';
    if (!stages.research) failedStage = 'research';
    else if (!stages.script) failedStage = 'script';
    else if (!stages.storyboard) failedStage = 'storyboard';
    else if (!stages.production) failedStage = 'production';
    else if (!stages.quality) failedStage = 'quality';

    return {
      success: false,
      failedStage,
      error: errorMessage,
      step: 'orchestration-unhandled',
      topic: queryTopic,
      stages: deepClone(stages)
    };
  }
}









