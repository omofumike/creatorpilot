import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { runPipeline } from '../agents/orchestratorAgent.js';
import { reviseProduction } from '../agents/revisionAgent.js';
import { directVideoProduction } from '../agents/videoDirectorAgent.js';
import { saveVideoMetadata, getVideoMetadata } from '../video/videoMetadataStore.js';
import { config } from '../utils/config.js';
import { redactApiKeys } from '../utils/appUtils.js';
import {
  generateWordDocument,
  generateStoryboardWordDocument,
  generateProductionPlanWordDocument
} from '../utils/documentGenerator.js';
import {
  generatePdfDocument,
  generateStoryboardPdfDocument,
  generateProductionPlanPdfDocument
} from '../utils/pdfGenerator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let currentPipelineRunner = runPipeline;

/**
 * Allows injecting a mock pipeline runner for isolated HTTP layer testing.
 */
export function setPipelineRunner(runner) {
  currentPipelineRunner = runner;
}

function normalizeShortFilmScript(finalPackage) {
  if (!finalPackage || !finalPackage.script) {
    return finalPackage;
  }

  const script = finalPackage.script;

  if (!Array.isArray(script.scenes) || script.scenes.length === 0) {
    return finalPackage;
  }

  const sections = [];

  script.scenes.forEach((scene, index) => {
    if (!scene || typeof scene !== 'object') return;

    sections.push({
      heading: scene.slugline || `Scene ${scene.sceneNumber || index + 1}`,
      narration: [
        scene.location ? `Location: ${scene.location}` : '',
        scene.timeOfDay ? `Time: ${scene.timeOfDay}` : '',
        scene.action
          ? (Array.isArray(scene.action)
              ? scene.action.join('\n')
              : scene.action)
          : '',
        Array.isArray(scene.charactersPresent) && scene.charactersPresent.length
          ? `Characters: ${scene.charactersPresent.join(', ')}`
          : '',
        scene.sound
          ? `SOUND: ${Array.isArray(scene.sound) ? scene.sound.join('; ') : scene.sound}`
          : '',
        scene.music
          ? `MUSIC: ${Array.isArray(scene.music) ? scene.music.join('; ') : scene.music}`
          : ''
      ].filter(Boolean).join('\n\n')
    });

    if (Array.isArray(scene.dialogue)) {
      scene.dialogue.forEach(line => {
        if (!line || typeof line !== 'object') return;

        sections.push({
          character: line.character || line.speaker || line.name || '',
          parenthetical: line.parenthetical || line.direction || '',
          dialogue: line.line || line.dialogue || line.text || ''
        });
      });
    }

    if (scene.endingTransition) {
      sections.push({
        narration: scene.endingTransition
      });
    }
  });

  return {
    ...finalPackage,
    script: {
      ...script,
      sections
    }
  };
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

// Safe static serving for generated videos
app.use('/videos', express.static(path.join(__dirname, '../../public/videos'), {
  maxAge: 0,
  dotfiles: 'ignore'
}));

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
    const normalizedPackage = normalizeShortFilmScript(finalPackage);
    const docBuffer = await generateWordDocument({ ...normalizedPackage, topic: topic || normalizedPackage.topic });

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
    const normalizedPackage = normalizeShortFilmScript(finalPackage);
    const pdfBuffer = await generatePdfDocument({ ...normalizedPackage, topic: topic || normalizedPackage.topic });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${(topic || finalPackage.topic).replace(/[^a-z0-9]/gi, '_').toLowerCase()}_report.pdf"`);
    res.send(pdfBuffer);

  } catch (error) {
    const errorMessage = redactApiKeys(error.message || String(error));
    console.error("PDF Export Error:", error);
    return res.status(500).json({ success: false, error: `Failed to generate PDF document: ${errorMessage}` });
  }
});


// POST /api/export-storyboard-docx
app.post('/api/export-storyboard-docx', async (req, res) => {
  try {
    const { finalPackage, topic } = req.body;

    if (!finalPackage) {
      return res.status(400).json({
        success: false,
        error: 'finalPackage is required for export.'
      });
    }

    const buffer = await generateStoryboardWordDocument(finalPackage);

    const filename = `${(
      topic ||
      finalPackage?.storyboard?.title ||
      'creatorpilot_storyboard'
    ).replace(/[^a-z0-9]/gi, '_').toLowerCase()}_storyboard.docx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`
    );

    res.send(buffer);

  } catch (error) {
    const errorMessage = redactApiKeys(
      error.message || String(error)
    );

    console.error(
      'Storyboard DOCX Export Error:',
      error
    );

    return res.status(500).json({
      success: false,
      error: `Failed to generate storyboard Word document: ${errorMessage}`
    });
  }
});


// POST /api/export-storyboard-pdf
app.post('/api/export-storyboard-pdf', async (req, res) => {
  try {
    const { finalPackage, topic } = req.body;

    if (!finalPackage) {
      return res.status(400).json({
        success: false,
        error: 'finalPackage is required for export.'
      });
    }

    const buffer = await generateStoryboardPdfDocument(finalPackage);

    const filename = `${(
      topic ||
      finalPackage?.storyboard?.title ||
      'creatorpilot_storyboard'
    ).replace(/[^a-z0-9]/gi, '_').toLowerCase()}_storyboard.pdf`;

    res.setHeader(
      'Content-Type',
      'application/pdf'
    );

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`
    );

    res.send(buffer);

  } catch (error) {
    const errorMessage = redactApiKeys(
      error.message || String(error)
    );

    console.error(
      'Storyboard PDF Export Error:',
      error
    );

    return res.status(500).json({
      success: false,
      error: `Failed to generate storyboard PDF: ${errorMessage}`
    });
  }
});


// POST /api/export-production-plan-docx
app.post('/api/export-production-plan-docx', async (req, res) => {
  try {
    const { finalPackage, topic } = req.body;

    if (!finalPackage) {
      return res.status(400).json({
        success: false,
        error: 'finalPackage is required for export.'
      });
    }

    const buffer =
      await generateProductionPlanWordDocument(finalPackage);

    const filename = `${(
      topic ||
      finalPackage?.productionPlan?.title ||
      'creatorpilot_production_plan'
    ).replace(/[^a-z0-9]/gi, '_').toLowerCase()}_production_plan.docx`;

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`
    );

    res.send(buffer);

  } catch (error) {
    const errorMessage = redactApiKeys(
      error.message || String(error)
    );

    console.error(
      'Production Plan DOCX Export Error:',
      error
    );

    return res.status(500).json({
      success: false,
      error: `Failed to generate production plan Word document: ${errorMessage}`
    });
  }
});


// POST /api/export-production-plan-pdf
app.post('/api/export-production-plan-pdf', async (req, res) => {
  try {
    const { finalPackage, topic } = req.body;

    if (!finalPackage) {
      return res.status(400).json({
        success: false,
        error: 'finalPackage is required for export.'
      });
    }

    const buffer =
      await generateProductionPlanPdfDocument(finalPackage);

    const filename = `${(
      topic ||
      finalPackage?.productionPlan?.title ||
      'creatorpilot_production_plan'
    ).replace(/[^a-z0-9]/gi, '_').toLowerCase()}_production_plan.pdf`;

    res.setHeader(
      'Content-Type',
      'application/pdf'
    );

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`
    );

    res.send(buffer);

  } catch (error) {
    const errorMessage = redactApiKeys(
      error.message || String(error)
    );

    console.error(
      'Production Plan PDF Export Error:',
      error
    );

    return res.status(500).json({
      success: false,
      error: `Failed to generate production plan PDF: ${errorMessage}`
    });
  }
});

// POST /api/generate-video
app.post('/api/generate-video', async (req, res) => {
  try {
    const { finalPackage, topic, options } = req.body || {};

    if (!finalPackage || typeof finalPackage !== 'object') {
      return res.status(400).json({
        success: false,
        failedStage: 'validation',
        error: 'finalPackage is required for video generation.',
        step: 'validation'
      });
    }

    const result = await directVideoProduction({
      finalPackage,
      topic,
      options: options || {}
    });

    if (!result || result.success === false) {
      return res.status(500).json({
        success: false,
        failedStage: 'video-generation',
        error: result?.error || 'Video generation failed.',
        step: result?.step || 'video-director-shot-failure',
        ...result
      });
    }

    return res.status(200).json(result);
  } catch (error) {
    const errorMessage = redactApiKeys(error.message || String(error));
    console.error('Video Generation Error:', error);
    return res.status(500).json({
      success: false,
      failedStage: 'video-generation',
      error: errorMessage,
      step: 'video-generation-unhandled'
    });
  }
});

// GET /api/productions/:productionId/video
app.get('/api/productions/:productionId/video', (req, res) => {
  try {
    const { productionId } = req.params;
    const { topic } = req.query;
    const result = getVideoMetadata(productionId, topic);
    return res.status(200).json(result);
  } catch (error) {
    const errorMessage = redactApiKeys(error.message || String(error));
    return res.status(500).json({ success: false, error: errorMessage });
  }
});

// GET /api/production-video
app.get('/api/production-video', (req, res) => {
  try {
    const { productionId, topic } = req.query;
    if (!productionId && !topic) {
      return res.status(400).json({ success: false, error: 'productionId or topic query parameter is required.' });
    }
    const result = getVideoMetadata(productionId, topic);
    return res.status(200).json(result);
  } catch (error) {
    const errorMessage = redactApiKeys(error.message || String(error));
    return res.status(500).json({ success: false, error: errorMessage });
  }
});

// POST /api/save-production-video
app.post('/api/save-production-video', (req, res) => {
  try {
    const { productionId, video, topic } = req.body || {};
    if (!productionId || !video) {
      return res.status(400).json({ success: false, error: 'productionId and video payload are required.' });
    }
    const saved = saveVideoMetadata(productionId, { ...video, topic: topic || video.topic });
    return res.status(200).json({ success: true, video: saved });
  } catch (error) {
    const errorMessage = redactApiKeys(error.message || String(error));
    return res.status(500).json({ success: false, error: errorMessage });
  }
});

export { app };





