import PDFDocument from 'pdfkit';

function clean(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function addAction(doc, value) {
  if (!clean(value)) return;

  doc
    .font('Courier')
    .fontSize(10)
    .text(clean(value), {
      width: 390,
      align: 'left',
      indent: 45,
      lineGap: 3
    });

  doc.moveDown(0.6);
}

function addSceneHeading(doc, value) {
  if (!clean(value)) return;

  doc.moveDown(1);

  doc
    .font('Courier-Bold')
    .fontSize(10)
    .text(clean(value).toUpperCase(), {
      width: 500
    });

  doc.moveDown(0.25);
}

function addCharacter(doc, value) {
  if (!clean(value)) return;

  doc.moveDown(0.3);

  doc
    .font('Courier-Bold')
    .fontSize(10)
    .text(clean(value).toUpperCase(), {
      width: 200,
      align: 'center',
      indent: 115
    });

  doc.moveDown(0.05);
}

function addParenthetical(doc, value) {
  if (!clean(value)) return;

  doc
    .font('Courier')
    .fontSize(10)
    .text(`(${clean(value)})`, {
      width: 220,
      align: 'left',
      indent: 155
    });

  doc.moveDown(0.05);
}

function addDialogue(doc, value) {
  if (!clean(value)) return;

  doc
    .font('Courier')
    .fontSize(10)
    .text(clean(value), {
      width: 260,
      align: 'left',
      indent: 120,
      lineGap: 2
    });

  doc.moveDown(0.35);
}

function addTransition(doc, value) {
  if (!clean(value)) return;

  doc.moveDown(0.6);

  doc
    .font('Courier-Bold')
    .fontSize(10)
    .text(clean(value).toUpperCase(), {
      width: 500,
      align: 'right'
    });

  doc.moveDown(0.5);
}

function addTitlePage(doc, title, script) {
  doc.moveDown(9);

  doc
    .font('Courier-Bold')
    .fontSize(16)
    .text(clean(title).toUpperCase(), {
      align: 'center'
    });

  doc.moveDown(2);

  doc
    .font('Courier')
    .fontSize(10)
    .text('Written by', {
      align: 'center'
    });

  doc.moveDown(0.3);

  doc
    .font('Courier')
    .fontSize(10)
    .text('CreatorPilot', {
      align: 'center'
    });

  doc.moveDown(2);

  const format = clean(script?.format);
  const duration = clean(script?.targetDuration);

  if (format || duration) {
    doc
      .font('Courier')
      .fontSize(9)
      .text(
        [format, duration].filter(Boolean).join(' | '),
        {
          align: 'center'
        }
      );
  }

  doc.addPage();
}

function addFadeIn(doc) {
  doc
    .font('Courier-Bold')
    .fontSize(10)
    .text('FADE IN:', {
      align: 'right'
    });

  doc.moveDown(1);
}

function addFadeOut(doc) {
  doc.moveDown(2);

  doc
    .font('Courier-Bold')
    .fontSize(10)
    .text('FADE OUT.', {
      align: 'right'
    });

  doc.moveDown(2);

  doc
    .font('Courier-Bold')
    .fontSize(10)
    .text('THE END', {
      align: 'center'
    });
}

function renderDialogueLine(doc, line) {
  if (typeof line === 'string') {
    addDialogue(doc, line);
    return;
  }

  if (!line || typeof line !== 'object') return;

  if (line.character) {
    addCharacter(doc, line.character);
  }

  if (line.parenthetical) {
    addParenthetical(doc, line.parenthetical);
  }

  if (line.dialogue) {
    addDialogue(doc, line.dialogue);
  }
}

export async function generatePdfDocument(finalPackage) {
  return new Promise((resolve, reject) => {
    try {
      const script = finalPackage?.script || {};

      const title =
        clean(script.title) ||
        clean(finalPackage?.topic) ||
        'CreatorPilot Screenplay';

      const doc = new PDFDocument({
        size: 'LETTER',

        margins: {
          top: 54,
          bottom: 54,
          left: 72,
          right: 72
        },

        bufferPages: true,

        info: {
          Title: title,
          Author: 'CreatorPilot',
          Subject: 'Screenplay'
        }
      });

      const chunks = [];

      doc.on('data', chunk => {
        chunks.push(chunk);
      });

      doc.on('end', () => {
        resolve(Buffer.concat(chunks));
      });

      doc.on('error', reject);

      // --------------------------------------------------
      // TITLE PAGE
      // --------------------------------------------------

      addTitlePage(doc, title, script);

      // --------------------------------------------------
      // SCREENPLAY
      // --------------------------------------------------

      addFadeIn(doc);

      if (script.hook) {
        addAction(doc, script.hook);
      }

      const sections = Array.isArray(script.sections)
        ? script.sections
        : [];

      for (const section of sections) {
        if (!section || typeof section !== 'object') {
          continue;
        }

        // Scene heading
        if (section.heading) {
          addSceneHeading(doc, section.heading);
        }

        // Action / narration
        if (section.action) {
          addAction(doc, section.action);
        }

        if (section.narration) {
          addAction(doc, section.narration);
        }

        // Dialogue array
        if (Array.isArray(section.dialogue)) {
          for (const line of section.dialogue) {
            renderDialogueLine(doc, line);
          }
        }

        // Single character + dialogue format
        if (
          section.character &&
          section.dialogue &&
          !Array.isArray(section.dialogue)
        ) {
          addCharacter(doc, section.character);

          if (section.parenthetical) {
            addParenthetical(
              doc,
              section.parenthetical
            );
          }

          addDialogue(
            doc,
            section.dialogue
          );
        }

        // Visual suggestions become action lines
        if (Array.isArray(section.visualSuggestions)) {
          for (const visual of section.visualSuggestions) {
            addAction(doc, visual);
          }
        }

        // On-screen text
        if (Array.isArray(section.onScreenText)) {
          for (const text of section.onScreenText) {
            addAction(
              doc,
              `ON SCREEN: ${clean(text)}`
            );
          }
        }

        // Transition
        if (section.transition) {
          addTransition(
            doc,
            section.transition
          );
        }
      }

      addFadeOut(doc);

      doc.end();

    } catch (error) {
      reject(error);
    }
  });
}