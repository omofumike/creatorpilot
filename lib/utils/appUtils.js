// lib/utils/appUtils.js

import { config } from './config.js'; // Assuming config is needed for redactApiKeys

/**
 * Strips potential markdown code block wrappers around JSON content.
 *
 * @param {string} text - Raw text response from Gemini.
 * @returns {string} Cleaned JSON string.
 */
export function cleanJsonResponse(text) {
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
export function redactApiKeys(message) {
  if (!message) return '';
  let redacted = message;
  // Ensure config is loaded and has the keys
  const keysToRedact = [config.geminiApiKey, config.parallelApiKey].filter(Boolean);
  for (const key of keysToRedact) {
    // Only redact if the key is a non-empty string
    if (typeof key === 'string' && key.length > 0) {
      redacted = redacted.replace(new RegExp(key, 'g'), '[REDACTED_API_KEY]');
    }
  }
  return redacted;
}
