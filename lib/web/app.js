import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { runPipeline } from '../agents/orchestratorAgent.js';
import { config } from '../utils/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let currentPipelineRunner = runPipeline;

/**
 * Allows injecting a mock pipeline runner for isolated HTTP layer testing.
 */
export function setPipelineRunner(runner) {
  currentPipelineRunner = runner;
}

const app = express();

app.use(express.json());

// Handle JSON parsing errors gracefully
app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      success: false,
      failedStage: 'validation',
      error: 'Invalid JSON request payload.',
      step: 'validation'
    });
  }
  next();
});

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, '../../public')));

/**
 * Safely redacts sensitive API keys from error messages.
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

// GET /health
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// GET / -> Serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../../public/index.html'));
});

// POST /api/run
app.post('/api/run', async (req, res) => {
  try {
    const { topic, options } = req.body;

    // Validation
    if (!topic || typeof topic !== 'string' || topic.trim() === '') {
      return res.status(400).json({
        success: false,
        failedStage: 'validation',
        error: 'Topic parameter is required and must be a non-empty string.',
        step: 'validation',
        topic: topic || ''
      });
    }

    // Execute the real Orchestrator synchronously
    const result = await currentPipelineRunner(topic, options || {});

    // If validation fails inside orchestrator
    if (result.success === false && result.failedStage === 'validation') {
      return res.status(400).json(result);
    }

    // For any other result (including success or pipeline stage failure), return 200 with result payload
    return res.status(200).json(result);
  } catch (error) {
    const errorMessage = redactApiKeys(error.message || String(error));
    return res.status(500).json({
      success: false,
      failedStage: 'orchestration',
      error: errorMessage,
      step: 'orchestration-unhandled'
    });
  }
});

export { app };
