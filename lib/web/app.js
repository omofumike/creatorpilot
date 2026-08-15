import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { runPipeline } from '../agents/orchestratorAgent.js';
import { reviseProduction } from '../agents/revisionAgent.js';
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
import { redactApiKeys } from '../utils/appUtils.js';
import { generateWordDocument } from '../utils/documentGenerator.js';
import { generatePdfDocument } from '../utils/pdfGenerator.js';

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

// POST /api/continue-chat
app.post('/api/continue-chat', async (req, res) => {
  try {
    const { message, topic, finalPackage } = req.body || {};

    if (!message || typeof message !== 'string' || message.trim() === '') {
      return res.status(400).json({
        success: false,
        failedStage: 'validation',
        error: 'message parameter is required and must be a non-empty string.',
        step: 'validation'
      });
    }

    if (!finalPackage || typeof finalPackage !== 'object') {
      return res.status(400).json({
        success: false,
        failedStage: 'validation',
        error: 'finalPackage is required for revision requests.',
        step: 'validation'
      });
    }

    const revision = await reviseProduction({
      message: message.trim(),
      topic: typeof topic === 'string' ? topic : finalPackage.topic,
      finalPackage
    });

    if (!revision || revision.success === false) {
      return res.status(500).json({
        success: false,
        failedStage: 'revision',
        error: revision?.error || 'AI Crew update failed.',
        step: 'revision'
      });
    }

    return res.status(200).json(revision);
  } catch (error) {
    const errorMessage = redactApiKeys(error.message || String(error));
    return res.status(500).json({
      success: false,
      failedStage: 'revision',
      error: errorMessage,
      step: 'revision-unhandled'
    });
  }
});

// POST /api/export-docx
app.post('/api/export-docx', async (req, res) => {
  try {
    const { finalPackage, topic } = req.body;

    if (!finalPackage) {
      return res.status(400).json({ success: false, error: 'finalPackage is required for export.' });
    }

    // Pass the main topic for filename generation and potentially for internal document logic
    const docBuffer = await generateWordDocument({ ...finalPackage, topic: topic || finalPackage.topic });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${(topic || finalPackage.topic).replace(/[^a-z0-9]/gi, '_').toLowerCase()}_report.docx"`);
    res.send(docBuffer);

  } catch (error) {
    const errorMessage = redactApiKeys(error.message || String(error));
    console.error("DOCX Export Error:", error);
    return res.status(500).json({ success: false, error: `Failed to generate Word document: ${errorMessage}` });
  }
});

// POST /api/export-pdf
app.post('/api/export-pdf', async (req, res) => {
  try {
    const { finalPackage, topic } = req.body;

    if (!finalPackage) {
      return res.status(400).json({ success: false, error: 'finalPackage is required for export.' });
    }

    // Pass the main topic for filename generation and potentially for internal document logic
    const pdfBuffer = await generatePdfDocument({ ...finalPackage, topic: topic || finalPackage.topic });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${(topic || finalPackage.topic).replace(/[^a-z0-9]/gi, '_').toLowerCase()}_report.pdf"`);
    res.send(pdfBuffer);

  } catch (error) {
    const errorMessage = redactApiKeys(error.message || String(error));
    console.error("PDF Export Error:", error);
    return res.status(500).json({ success: false, error: `Failed to generate PDF document: ${errorMessage}` });
  }
});

export { app };
