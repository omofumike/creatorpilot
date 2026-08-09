import dotenv from 'dotenv';
import { app } from './lib/web/app.js';
import { config } from './lib/utils/config.js';

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 8080;
const HOST = '0.0.0.0';

// Verify GEMINI_API_KEY exists
if (!config.geminiApiKey) {
  console.warn("Warning: GEMINI_API_KEY is not defined in the environment variables.");
  console.warn("Please ensure it is set in production or local .env file.");
}

app.listen(PORT, HOST, () => {
  console.log(`==================================================`);
  console.log(`CreatorPilot Web Server is running!`);
  console.log(`URL:  http://localhost:${PORT}`);
  console.log(`Host: ${HOST}`);
  console.log(`Port: ${PORT}`);
  console.log(`Mode: Google Cloud Run Compatible`);
  console.log(`==================================================`);
});
