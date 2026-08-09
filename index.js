import { config } from './lib/utils/config.js';
import { ai } from './lib/utils/gemini.js';

async function runConnectivityTest() {
  console.log("Starting Stage 1: Gemini Connectivity Test...");

  // 1. Verify GEMINI_API_KEY exists
  if (!config.geminiApiKey) {
    console.error("Error: GEMINI_API_KEY is not defined in the environment variables.");
    console.error("Please create a .env file and add: GEMINI_API_KEY=your_actual_api_key");
    process.exit(1);
  }

  try {
    // 2. Make one very small Gemini generateContent request using @google/genai API
    console.log(`Connecting to Gemini API using '${config.geminiModel}'...`);
    const response = await ai.models.generateContent({
      model: config.geminiModel,
      contents: 'Respond with a single short sentence confirming you are online and working.',
    });

    // 3. Print a simple success message and the returned text
    console.log("\nSuccess! Gemini API is connected and working correctly.");
    console.log("Response text:");
    console.log("----------------------------------------");
    console.log(response.text?.trim() || "(Empty response)");
    console.log("----------------------------------------");
  } catch (error) {
    // 4. Handle Gemini API errors gracefully and never print/expose the API key
    console.error("\nError: Failed to connect to Gemini API.");
    console.error("Details:", error.message || error);
    process.exit(1);
  }
}

runConnectivityTest();
