import { ai } from '../utils/gemini.js';
import { config } from '../utils/config.js';
import { parallelSearch } from '../tools/parallelSearch.js';

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
 * Conducts research on a specified topic using Parallel Web Search and Gemini.
 * Generates a structured research brief with insights, opportunities, risks, and verified sources.
 * 
 * @param {string} topic - The research topic or query.
 * @param {Object} [options] - Configuration options.
 * @param {string} [options.mode] - The search mode ('turbo', 'basic', 'advanced'). Defaults to 'advanced'.
 * @param {string} [options.objective] - Specific objective or perspective for the search.
 * @param {number} [options.temperature] - Generation temperature for Gemini. Defaults to 0.2.
 * @returns {Promise<Object>} The structured research brief or error response.
 */
export async function researchTopic(topic, options = {}) {
  // 1. Validate topic input
  if (!topic || typeof topic !== 'string' || topic.trim() === '') {
    return {
      success: false,
      error: 'Topic parameter is required and must be a non-empty string.',
      step: 'validation'
    };
  }

  const queryTopic = topic.trim();

  // 2. Perform web research using Parallel Search
  let searchResult;
  try {
    searchResult = await parallelSearch(queryTopic, {
      mode: options.mode || 'advanced',
      objective: options.objective
    });
  } catch (searchError) {
    return {
      success: false,
      error: `Parallel Search execution failed: ${redactApiKeys(searchError.message || searchError)}`,
      step: 'search'
    };
  }

  if (!searchResult || !searchResult.success) {
    return {
      success: false,
      error: `Parallel Search failed: ${redactApiKeys(searchResult?.error || 'Unknown parallel search error')}`,
      step: 'search'
    };
  }

  // 3. Format the search results into a detailed text block for Gemini
  const resultsCount = searchResult.results?.length || 0;
  const searchResultsText = (searchResult.results || [])
    .map((result, idx) => {
      const excerptsText = (result.excerpts || [])
        .map((excerpt) => `  - ${excerpt}`)
        .join('\n');
      return `Result #${idx + 1}
Title: ${result.title || 'Untitled'}
URL: ${result.url || 'No URL'}
Publish Date: ${result.publishDate || 'N/A'}
Excerpts:
${excerptsText || '  (No excerpts available)'}`;
    })
    .join('\n\n-------------------------\n\n');

  // 4. Construct System Instruction and Prompts for Gemini
  const systemInstruction = `You are an expert Research Agent. Your job is to analyze web search results and compile a highly detailed, objective, and structured research brief about the requested topic.

You must return your output strictly in JSON format matching the schema described below. Do not include any introductory or concluding text, explanations, or Markdown code blocks. Just output raw, valid JSON.

JSON Schema Required Keys:
{
  "topic": "The original research topic",
  "summary": "A concise yet comprehensive executive summary (2-3 paragraphs) synthesizing the overall findings.",
  "keyFacts": [
    "High-impact, verified factual finding 1",
    "High-impact, verified factual finding 2"
  ],
  "statistics": [
    "Specific quantitative data, figure, or statistic 1 with context",
    "Specific quantitative data, figure, or statistic 2 with context"
  ],
  "recentDevelopments": [
    "Recent events, trends, or updates (within the last 1-2 years) 1",
    "Recent events, trends, or updates (within the last 1-2 years) 2"
  ],
  "opportunities": [
    "Potential benefit, opening, or growth area 1",
    "Potential benefit, opening, or growth area 2"
  ],
  "risksChallenges": [
    "Potential drawback, threat, barrier, or challenge 1",
    "Potential drawback, threat, barrier, or challenge 2"
  ],
  "importantContext": [
    "Historical, cultural, economic, or technical background detail 1",
    "Historical, cultural, economic, or technical background detail 2"
  ],
  "claimsRequiringVerification": [
    {
      "claim": "The specific statement or claim made in the sources that requires independent verification",
      "reason": "A brief explanation of why this claim is speculative, unverified, or controversial"
    }
  ],
  "sources": [
    {
      "title": "The exact title of the source from the input",
      "url": "The exact, unmodified URL of the source as provided in the input search results",
      "relevance": "A brief explanation of how this source contributed to the research brief"
    }
  ]
}

CRITICAL INSTRUCTIONS:
1. NO PRE-TRAINED / GENERAL KNOWLEDGE:
- You MUST build the entire Research Brief ONLY from the supplied web search results.
- You MUST NOT use pretrained, general, professional, or world knowledge to fill gaps in the supplied evidence.
- This applies to EVERY field in the JSON response, including: summary, keyFacts, statistics, recentDevelopments, importantContext, opportunities, risksChallenges, and any other generated field.
- Even if you know that a technical specification, measurement, percentage, recommendation, or industry fact is highly plausible, you MUST NOT include it unless that information is explicitly present in the supplied search results.
- If the supplied evidence does not contain the information for a given section, omit it or return an empty array [] where appropriate.

2. LITERAL SUMMARY TRACEABILITY:
- Every factual claim in the "summary" field MUST be directly traceable to information contained in keyFacts, statistics, recentDevelopments, importantContext, and/or the raw supplied search-result excerpts.
- The summary MUST NOT introduce any new factual claim, number, specification, measurement, product capability, date, percentage, or other detail that does not appear in the structured research data or raw search evidence.
- The summary is a synthesis of the evidence, NOT an opportunity to add explanatory knowledge from your pretrained knowledge.
- If a detail cannot be directly and literally traced to the supplied evidence, DO NOT include it in the summary.

3. NO FABRICATED TECHNICAL SPECIFICATIONS:
- You are strictly prohibited from inventing, inferring, or extrapolating technical specifications, numerical values, measurements, ratings, or product-specific details.
- This includes, but is not limited to: CRI ratings, color-temperature ranges, dimensions, percentages, performance figures, resolution, capacity, prices, subscription costs, quantities, dates, product specifications, technical measurements, or named product capabilities.
- These may ONLY be included when literally present in the supplied search results.
- Do not infer them because they are technically plausible or commonly associated with the topic.

4. NO FABRICATED ATTRIBUTIONS:
- Do not invent or assume any: studies, organizations, companies, reports, researchers, publications, dates, named authorities, or source attributions.
- If the supplied search results do not identify an attribution, you must not invent or suggest one.

5. EVIDENCE OVER PLAUSIBILITY:
- If a claim "sounds right", "seems reasonable", or is common professional knowledge but cannot be confirmed by literal comparison against the supplied search results, it MUST be excluded.
- You must prefer an incomplete but grounded Research Brief over a more detailed Research Brief containing unsupported information.
- Do not attribute commonly-assumed properties of a product category to specific claims unless the supplied search evidence explicitly states that property for that claim. For example, do not describe LED lights as 'silent' or 'flicker-free' unless the search results explicitly say so - these are common assumptions about LED technology that may not be stated in the actual evidence.

6. SOURCES AND EMPTY FIELDS:
- You must ONLY use facts and information found in the provided web search results. Do not hallucinate external facts or URLs.
- For the "sources" array, ONLY include sources that were actually present in the input search results. Copy their titles and URLs EXACTLY. Do NOT invent URLs or include external sources.
- If the search results are empty or do not contain enough information for a specific key (like "statistics" or "recentDevelopments"), return an empty array [] for that key. Do not make up facts.`;

  const userPrompt = `Topic: "${queryTopic}"

Search Results from Web Research:
=========================================
${searchResultsText || 'No search results found.'}
=========================================

Please synthesize the search results above and generate the comprehensive research brief strictly adhering to the JSON schema.`;

  // 5. Query Gemini with structured output configurations
  let responseText = '';
  try {
    const geminiResponse = await ai.models.generateContent({
      model: config.geminiModel,
      contents: userPrompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        temperature: options.temperature ?? 0.2,
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
    const researchBrief = JSON.parse(cleanedJson);

    // 6. Return successful structured response
    return {
      success: true,
      searchMetadata: {
        searchId: searchResult.searchId || null,
        sessionId: searchResult.sessionId || null,
        totalResults: resultsCount
      },
      researchBrief
    };

  } catch (geminiError) {
    const redactedError = redactApiKeys(geminiError.message || geminiError);
    
    // Check if it's a JSON parsing error
    if (geminiError instanceof SyntaxError) {
      return {
        success: false,
        error: `Failed to parse structured JSON from Gemini response: ${redactedError}`,
        step: 'parsing',
        rawResponse: responseText || null
      };
    }

    return {
      success: false,
      error: `Gemini generation failed: ${redactedError}`,
      step: 'generation'
    };
  }
}
