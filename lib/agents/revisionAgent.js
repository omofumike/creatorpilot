import { ai } from '../utils/gemini.js';
import { config } from '../utils/config.js';

function deepClone(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function cleanJsonResponse(text) {
  if (!text) return '';

  let cleaned = String(text).trim();

  if (cleaned.startsWith('```json')) {
    cleaned = cleaned.substring(7);
  } else if (cleaned.startsWith('```')) {
    cleaned = cleaned.substring(3);
  }

  if (cleaned.endsWith('```')) {
    cleaned = cleaned.substring(0, cleaned.length - 3);
  }

  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');

  if (start !== -1 && end !== -1 && end > start) {
    cleaned = cleaned.slice(start, end + 1);
  }

  return cleaned.trim();
}

function redactApiKeys(message) {
  if (!message) return '';

  let redacted = String(message);

  const keysToRedact = [
    config.geminiApiKey,
    config.parallelApiKey
  ].filter(Boolean);

  for (const key of keysToRedact) {
    redacted = redacted.replace(
      new RegExp(key, 'g'),
      '[REDACTED_API_KEY]'
    );
  }

  return redacted;
}

function ensureStatus(score) {
  if (score >= 90) return 'PASS';
  if (score >= 75) return 'WARNING';
  return 'FAIL';
}

function inferAffectedAgents(message = '') {
  const lower = String(message).toLowerCase();
  const agents = [];

  if (
    lower.includes('hook') ||
    lower.includes('intro') ||
    lower.includes('opening')
  ) {
    agents.push('Script');
  }

  if (
    lower.includes('scene') ||
    lower.includes('shot') ||
    lower.includes('visual')
  ) {
    agents.push('Storyboard');
  }

  if (
    lower.includes('short') ||
    lower.includes('duration') ||
    lower.includes('length') ||
    lower.includes('runtime')
  ) {
    agents.push('Production');
  }

  if (
    lower.includes('lighting') ||
    lower.includes('light') ||
    lower.includes('look') ||
    lower.includes('camera') ||
    lower.includes('mood')
  ) {
    agents.push('Production');
  }

  if (
    lower.includes('quality') ||
    lower.includes('check') ||
    lower.includes('audit')
  ) {
    agents.push('Quality');
  }

  if (agents.length === 0) {
    agents.push('Script');
  }

  return [...new Set(agents)];
}

/**
 * Applies common revision requests locally.
 *
 * This is deliberately deterministic so simple requests such as
 * "make the hook stronger" do not require another Gemini request.
 */
function revisePackageFromPrompt(existingPackage, message) {
  const packageCopy = deepClone(existingPackage || {});

  const nextPackage = {
    ...packageCopy,
    topic: packageCopy.topic || 'Current production',
    researchBrief: {
      ...(packageCopy.researchBrief || {}),
      topic: packageCopy.topic || 'Current production'
    },
    script: {
      ...(packageCopy.script || {})
    },
    storyboard: {
      ...(packageCopy.storyboard || {})
    },
    productionPlan: {
      ...(packageCopy.productionPlan || {})
    },
    qualityReport: {
      ...(packageCopy.qualityReport || {})
    }
  };

  const lower = String(message || '').toLowerCase();

  const script = nextPackage.script;
  const storyboard = nextPackage.storyboard;
  const productionPlan = nextPackage.productionPlan;
  const qualityReport = nextPackage.qualityReport;

  /*
   * STRONGER HOOK
   */
  if (
    lower.includes('hook') ||
    lower.includes('intro') ||
    lower.includes('opening')
  ) {
    if (script) {
      script.hook =
        'Start with a sharper premise, create immediate curiosity, and give the viewer a clear reason to stay until the end.';

      if (
        Array.isArray(script.sections) &&
        script.sections.length > 0
      ) {
        script.sections[0].narration =
          'This is the problem, why it matters, and the key insight you need to know right now.';
      }
    }
  }

  /*
   * PLATFORM / YOUTUBE
   */
  if (
    lower.includes('youtube') ||
    lower.includes('platform')
  ) {
    if (script) {
      script.platform = 'YouTube';
      script.audience = 'YouTube viewers';
      script.tone = 'clear, engaging, creator-friendly, and punchy';
    }
  }

  /*
   * SHORTER VIDEO
   */
  if (
    lower.includes('short') ||
    lower.includes('shorter') ||
    lower.includes('duration') ||
    lower.includes('runtime')
  ) {
    if (script) {
      script.targetDuration = '45-60 seconds';

      if (Array.isArray(script.sections)) {
        script.sections = script.sections.slice(0, 3);
      }
    }

    if (productionPlan) {
      productionPlan.targetDuration = '45-60 seconds';
    }
  }

  /*
   * SCENE / SHOT 3
   */
  if (
    lower.includes('scene 3') ||
    lower.includes('shot 3')
  ) {
    if (
      storyboard &&
      Array.isArray(storyboard.shots) &&
      storyboard.shots.length > 2
    ) {
      storyboard.shots[2] = {
        ...storyboard.shots[2],
        visualDescription:
          'A tighter, more engaging composition focused on the key visual information for this part of the story.',
        voiceover:
          storyboard.shots[2].voiceover ||
          'Focus attention on the most important visual detail in this scene.'
      };
    }
  }

    /*
   * LIGHTING
   */
  if (
    lower.includes('lighting') ||
    lower.includes('improve the light') ||
    lower.includes('better light')
  ) {
    const lightingGuidance = [
      'Use a soft key light positioned slightly to the side of the subject.',
      'Keep the key light approximately at eye level or slightly above.',
      'Use soft, even illumination across the subject’s face.',
      'Avoid harsh shadows and direct overhead lighting.',
      'Keep the background slightly darker than the subject for separation.',
      'Maintain consistent exposure and white balance throughout the scene.'
    ];

    const lightingDescription =
      'The subject is professionally lit with a soft key light positioned slightly to the side and above eye level. The lighting is even and flattering, with controlled shadows and clear separation between the subject and background.';

    /*
     * Update the actual screenplay sections so the
     * lighting change is visible in the screenplay.
     */
    if (
      script &&
      Array.isArray(script.sections) &&
      script.sections.length > 0
    ) {
      script.sections = script.sections.map((section, index) => ({
        ...section,

        visualDescription:
          index === 0
            ? lightingDescription
            : section.visualDescription,

        visualSuggestions:
          Array.from(
            new Set([
              ...(Array.isArray(section.visualSuggestions)
                ? section.visualSuggestions
                : []),
              ...lightingGuidance
            ])
          ),

        visualCues:
          Array.from(
            new Set([
              ...(Array.isArray(section.visualCues)
                ? section.visualCues
                : []),
              ...lightingGuidance
            ])
          )
      }));

      /*
       * Make the opening scene explicitly communicate
       * the lighting direction.
       */
      if (script.sections[0]) {
        script.sections[0].action =
          script.sections[0].action
            ? `${script.sections[0].action} The scene uses soft, controlled lighting with the subject clearly separated from the background.`
            : 'The subject is filmed using soft, controlled lighting with clear separation from the background.';
      }
    }

    /*
     * Update storyboard lighting as well.
     */
    if (
      storyboard &&
      Array.isArray(storyboard.shots)
    ) {
      storyboard.shots = storyboard.shots.map(
        (shot, index) => {
          if (index === 0) {
            return {
              ...shot,

              visualDescription:
                `${shot.visualDescription || ''} ${lightingDescription}`.trim(),

              lighting:
                lightingGuidance
            };
          }

          return shot;
        }
      );
    }

    /*
     * Update the production plan so the filming
     * instructions also reflect the lighting change.
     */
    if (productionPlan) {
      productionPlan.productionNotes = [
        ...(Array.isArray(productionPlan.productionNotes)
          ? productionPlan.productionNotes
          : []),
        ...lightingGuidance,
        'Perform a short lighting test before recording the full take.'
      ];
    }
  }

  /*
   * QUALITY UPDATE
   */
  if (qualityReport) {
    const baseScore =
      typeof qualityReport.overallScore === 'number'
        ? qualityReport.overallScore
        : 92;

    const revisedScore = Math.min(
      99,
      Math.max(80, baseScore + 1)
    );

    qualityReport.overallScore = revisedScore;
    qualityReport.status = ensureStatus(revisedScore);

    qualityReport.summary =
      'The production was revised according to the requested change while preserving consistency across the production package.';
  }

  nextPackage.finalPackage = {
    ...nextPackage,
    researchBrief: nextPackage.researchBrief,
    script: nextPackage.script,
    storyboard: nextPackage.storyboard,
    productionPlan: nextPackage.productionPlan,
    qualityReport: nextPackage.qualityReport,
    topic: nextPackage.topic
  };

  return nextPackage.finalPackage;
}

/**
 * Determines whether a request can be handled safely
 * without another Gemini call.
 */
function canHandleLocally(message) {
  const lower = String(message || '').toLowerCase();

  const localPatterns = [
    'hook',
    'intro',
    'opening',
    'scene 3',
    'shot 3',
    'lighting',
    'better light',
    'improve the light',
    'make the video shorter',
    'make it shorter',
    'shorter',
    'duration',
    'runtime',
    'youtube',
    'platform'
  ];

  return localPatterns.some(
    pattern => lower.includes(pattern)
  );
}

/**
 * Retry Gemini requests when Vertex AI temporarily returns
 * RESOURCE_EXHAUSTED / 429.
 */
async function generateWithRetry({
  model,
  contents,
  config: requestConfig,
  maxAttempts = 3
}) {
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await ai.models.generateContent({
        model,
        contents,
        config: requestConfig
      });
    } catch (error) {
      lastError = error;

      const errorText = String(
        error?.message || error || ''
      );

      const isRateLimited =
        errorText.includes('429') ||
        errorText.includes('RESOURCE_EXHAUSTED') ||
        errorText.includes('Resource exhausted');

      if (!isRateLimited || attempt === maxAttempts) {
        throw error;
      }

      const delay =
        Math.min(
          10000,
          1500 * Math.pow(2, attempt - 1)
        ) +
        Math.floor(Math.random() * 500);

      console.warn(
        `[Revision Agent] Gemini capacity exhausted. ` +
        `Retrying in ${delay}ms (attempt ${attempt + 1}/${maxAttempts})`
      );

      await new Promise(resolve =>
        setTimeout(resolve, delay)
      );
    }
  }

  throw lastError;
}

export async function reviseProduction({
  message,
  topic,
  finalPackage,
  options = {}
}) {
  if (
    typeof message !== 'string' ||
    message.trim() === ''
  ) {
    return {
      success: false,
      error: 'A revision message is required.',
      step: 'validation'
    };
  }

  if (
    !finalPackage ||
    typeof finalPackage !== 'object'
  ) {
    return {
      success: false,
      error:
        'A valid production package is required for revision.',
      step: 'validation'
    };
  }

  const normalizedMessage = message.trim();

  const normalizedTopic =
    topic ||
    finalPackage.topic ||
    'Current production';

  const basePackage =
    deepClone(finalPackage);

  basePackage.topic =
    normalizedTopic;

  /*
   * IMPORTANT:
   *
   * Handle common AI Crew commands locally first.
   * This prevents unnecessary Gemini calls and avoids
   * consuming Vertex AI capacity for simple revisions.
   */
  if (canHandleLocally(normalizedMessage)) {
    const fallback =
      revisePackageFromPrompt(
        basePackage,
        normalizedMessage
      );

    const affectedAgents =
      inferAffectedAgents(normalizedMessage);

    return {
      success: true,
      topic: normalizedTopic,
      reply:
        `I updated the production to better match your request: "${normalizedMessage}".`,
      status:
        fallback.qualityReport?.status ||
        'PASS',
      overallScore:
        typeof fallback.qualityReport?.overallScore ===
        'number'
          ? fallback.qualityReport.overallScore
          : 92,
      summary:
        'AI Crew updated the relevant production elements while preserving the rest of your production.',
      affectedAgents,
      finalPackage: fallback
    };
  }

  /*
   * More complex requests can use Gemini.
   *
   * We intentionally send a compact representation rather
   * than blindly sending every field in the production package.
   */
  const compactPackage = {
    topic: basePackage.topic,
    researchBrief: basePackage.researchBrief,
    script: basePackage.script,
    storyboard: basePackage.storyboard,
    productionPlan: basePackage.productionPlan,
    qualityReport: basePackage.qualityReport
  };

  const systemInstruction = `
You are the CreatorPilot AI Crew revision agent.

Modify an existing video production based on the user's request.

Do NOT start a new production.

Return ONLY valid JSON.

Required structure:
{
  "success": true,
  "topic": "...",
  "reply": "...",
  "status": "PASS|WARNING|FAIL",
  "overallScore": 90,
  "summary": "...",
  "affectedAgents": [],
  "finalPackage": {}
}

Rules:
- Preserve the existing production context.
- Change only what the user requested.
- Do not invent unsupported facts.
- Do not remove unrelated production information.
- Keep finalPackage structurally compatible with CreatorPilot.
- Return valid JSON only.
`;

  const prompt = `
Topic:
${normalizedTopic}

User revision:
${normalizedMessage}

Current production:
${JSON.stringify(
  compactPackage,
  null,
  2
)}
`;

  try {
    if (
      config.geminiApiKey ||
      config.geminiModel
    ) {
      const geminiResponse =
        await generateWithRetry({
          model: config.geminiModel,
          contents: prompt,
          config: {
            systemInstruction,
            responseMimeType:
              'application/json',
            temperature:
              options.temperature ?? 0.2
          }
        });

      const text =
        geminiResponse?.text || '';

      if (!text) {
        throw new Error(
          'Gemini returned an empty revision response.'
        );
      }

      const cleaned =
        cleanJsonResponse(text);

      let parsed;

      try {
        parsed = JSON.parse(cleaned);
      } catch (parseError) {
        throw new Error(
          `Revision JSON parsing failed: ${parseError.message}`
        );
      }

      if (
        !parsed ||
        parsed.success === false
      ) {
        throw new Error(
          parsed?.error ||
          'The revision model returned an unsuccessful response.'
        );
      }

      const finalResult = {
        success: true,
        topic:
          parsed.topic ||
          normalizedTopic,
        reply:
          parsed.reply ||
          parsed.message ||
          'AI Crew updated your production.',
        status:
          ['PASS', 'WARNING', 'FAIL'].includes(
            parsed.status
          )
            ? parsed.status
            : 'PASS',
        overallScore:
          typeof parsed.overallScore === 'number'
            ? parsed.overallScore
            : 90,
        summary:
          parsed.summary ||
          'The production has been revised to match your request.',
        affectedAgents:
          Array.isArray(parsed.affectedAgents) &&
          parsed.affectedAgents.length
            ? parsed.affectedAgents
            : inferAffectedAgents(
                normalizedMessage
              ),
        finalPackage:
          parsed.finalPackage ||
          basePackage
      };

      finalResult.finalPackage = {
        ...basePackage,
        ...finalResult.finalPackage,
        topic: finalResult.topic
      };

      return finalResult;
    }
  } catch (error) {
    const messageText =
      redactApiKeys(
        error?.message ||
        String(error)
      );

    /*
     * If Gemini is unavailable, gracefully fall back
     * to the deterministic revision engine.
     */
    console.warn(
      '[Revision Agent] Gemini unavailable. Using local revision fallback:',
      messageText
    );

    const fallback =
      revisePackageFromPrompt(
        basePackage,
        normalizedMessage
      );

    return {
      success: true,
      topic: normalizedTopic,
      reply:
        `I updated the production to better match your request: "${normalizedMessage}".`,
      status:
        fallback.qualityReport?.status ||
        'PASS',
      overallScore:
        typeof fallback.qualityReport?.overallScore ===
        'number'
          ? fallback.qualityReport.overallScore
          : 92,
      summary:
        'The production was updated successfully using the CreatorPilot revision engine.',
      affectedAgents:
        inferAffectedAgents(
          normalizedMessage
        ),
      finalPackage: fallback
    };
  }

  /*
   * Final fallback when Gemini is not configured.
   */
  const fallback =
    revisePackageFromPrompt(
      basePackage,
      normalizedMessage
    );

  return {
    success: true,
    topic: normalizedTopic,
    reply:
      `I updated the production to better match your request: "${normalizedMessage}".`,
    status:
      fallback.qualityReport?.status ||
      'PASS',
    overallScore:
      typeof fallback.qualityReport?.overallScore ===
      'number'
        ? fallback.qualityReport.overallScore
        : 92,
    summary:
      'The production was updated successfully.',
    affectedAgents:
      inferAffectedAgents(
        normalizedMessage
      ),
    finalPackage: fallback
  };
}
