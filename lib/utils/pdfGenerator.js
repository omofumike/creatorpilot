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
function addStructuredPdfTitle(doc, title) {
  doc
    .font('Courier-Bold')
    .fontSize(18)
    .text(clean(title), {
      align: 'center',
      width: 470
    });

  doc.moveDown(1);
}

function addStructuredPdfHeading(doc, title) {
  doc.moveDown(0.5);

  doc
    .font('Courier-Bold')
    .fontSize(12)
    .text(clean(title), {
      width: 470
    });

  doc.moveDown(0.2);
}

function addStructuredPdfField(doc, label, value) {
  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {
    return;
  }

  let displayValue = value;

  if (Array.isArray(value)) {
    displayValue = value
      .map(item =>
        item && typeof item === 'object'
          ? JSON.stringify(item, null, 2)
          : String(item)
      )
      .join('\n');
  } else if (typeof value === 'object') {
    displayValue = JSON.stringify(value, null, 2);
  }

  doc
    .font('Courier-Bold')
    .fontSize(9)
    .text(`${label}:`, {
      width: 470
    });

  doc
    .font('Courier')
    .fontSize(9)
    .text(String(displayValue), {
      width: 470,
      lineGap: 2
    });

  doc.moveDown(0.25);
}

function addStructuredPdfObject(doc, object, heading) {
  if (!object || typeof object !== 'object') {
    return;
  }

  if (heading) {
    addStructuredPdfHeading(doc, heading);
  }

  for (const [key, value] of Object.entries(object)) {
    if (
      value === undefined ||
      value === null ||
      value === ''
    ) {
      continue;
    }

    const label = key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, char => char.toUpperCase());

    if (Array.isArray(value)) {
      addStructuredPdfHeading(doc, label);

      value.forEach((item, index) => {
        addStructuredPdfField(
          doc,
          `${index + 1}`,
          item && typeof item === 'object'
            ? JSON.stringify(item, null, 2)
            : item
        );
      });

      continue;
    }

    if (typeof value === 'object') {
      addStructuredPdfObject(
        doc,
        value,
        label
      );

      continue;
    }

    addStructuredPdfField(
      doc,
      label,
      value
    );
  }
}

function generateStructuredPdfDocument(finalPackage, exportType) {
  return new Promise((resolve, reject) => {
    try {
      const isStoryboard =
        exportType === 'storyboard';

      const data =
        isStoryboard
          ? finalPackage?.storyboard || {}
          : finalPackage?.productionPlan || {};

      const title =
        clean(data.title) ||
        clean(finalPackage?.topic) ||
        (
          isStoryboard
            ? 'CreatorPilot Storyboard'
            : 'CreatorPilot Production Plan'
        );

      const doc = new PDFDocument({
        size: 'LETTER',

        margins: {
          top: 54,
          bottom: 54,
          left: 54,
          right: 54
        },

        bufferPages: true,

        info: {
          Title: title,
          Author: 'CreatorPilot',
          Subject: isStoryboard
            ? 'Storyboard'
            : 'Production Plan'
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

      addStructuredPdfTitle(
        doc,
        title
      );

      if (isStoryboard) {

        addStructuredPdfField(
          doc,
          'Production Type',
          data.productionType
        );

        addStructuredPdfField(
          doc,
          'Platform',
          data.platform
        );

        addStructuredPdfField(
          doc,
          'Format',
          data.format
        );

        addStructuredPdfField(
          doc,
          'Target Duration',
          data.targetDuration
        );

        addStructuredPdfHeading(
          doc,
          'Storyboard Shots'
        );

        const shots =
          Array.isArray(data.shots)
            ? data.shots
            : [];

        shots.forEach((shot, index) => {
          addStructuredPdfHeading(
            doc,
            `Shot ${shot.shotNumber ?? index + 1}`
          );

          addStructuredPdfObject(
            doc,
            shot
          );
        });

      } else {

        addStructuredPdfField(
          doc,
          'Logline',
          data.logline
        );

        addStructuredPdfField(
          doc,
          'Genre',
          data.genre
        );

        addStructuredPdfField(
          doc,
          'Target Duration',
          data.targetDuration
        );

        addStructuredPdfField(
          doc,
          'Production Type',
          data.productionType
        );

        addStructuredPdfHeading(
          doc,
          'Shot List'
        );

        const shotList =
          Array.isArray(data.shotList)
            ? data.shotList
            : [];

        shotList.forEach((shot, index) => {
          addStructuredPdfHeading(
            doc,
            `Shot ${shot.shotNumber ?? index + 1}`
          );

          addStructuredPdfObject(
            doc,
            shot
          );
        });

        addStructuredPdfObject(
          doc,
          {
            filmingSchedule:
              data.filmingSchedule
          },
          'Filming Schedule'
        );

        addStructuredPdfObject(
          doc,
          {
            equipmentList:
              data.equipmentList
          },
          'Equipment'
        );

        addStructuredPdfObject(
          doc,
          {
            locationsList:
              data.locationsList
          },
          'Locations'
        );

        addStructuredPdfObject(
          doc,
          {
            propsList:
              data.propsList
          },
          'Props'
        );

        addStructuredPdfObject(
          doc,
          {
            wardrobeList:
              data.wardrobeList
          },
          'Wardrobe'
        );

        addStructuredPdfField(
          doc,
          'Makeup and Hair',
          data.makeupHairNotes
        );

        addStructuredPdfObject(
          doc,
          {
            postProductionNotes:
              data.postProductionNotes
          },
          'Post Production'
        );

        addStructuredPdfObject(
          doc,
          {
            warnings:
              data.warnings
          },
          'Warnings'
        );
      }

      doc.end();

    } catch (error) {
      reject(error);
    }
  });
}

export async function generateStoryboardPdfDocument(finalPackage) {
  return generateStructuredPdfDocument(
    finalPackage,
    'storyboard'
  );
}

export async function generateProductionPlanPdfDocument(finalPackage) {
  return generateStructuredPdfDocument(
    finalPackage,
    'production_plan'
  );
}

