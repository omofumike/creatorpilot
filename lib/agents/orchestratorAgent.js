import { researchTopic } from './researchAgent.js';
import { generateScript } from './scriptAgent.js';
import { generateStoryboard } from './storyboardAgent.js';
import { generateProductionPlan } from './producerAgent.js';
import { reviewQuality } from './qualityAgent.js';
import { config } from '../utils/config.js';

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

  try {
    // ==========================================
    // STAGE 1: RESEARCH
    // ==========================================
    const researchResult = await researchTopic(queryTopic, options.research);
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
    const scriptResult = await generateScript(researchBrief, options.script);
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
    const storyboardResult = await generateStoryboard(script, options.storyboard);
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
    const productionResult = await generateProductionPlan(storyboard, options.production);
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
      options.quality
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
      finalPackage: {
        researchBrief: deepClone(researchBrief),
        script: deepClone(script),
        storyboard: deepClone(storyboard),
        productionPlan: deepClone(production),
        qualityReport: deepClone(qualityReport)
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
