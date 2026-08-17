import {
  Document,
  Paragraph,
  TextRun,
  Packer,
  AlignmentType
} from 'docx';

function text(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function addAction(children, value) {
  if (!text(value)) return;

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: text(value),
          font: 'Courier New',
          size: 20
        })
      ],
      indent: {
        left: 720,
        right: 720
      },
      spacing: {
        after: 180,
        line: 240
      }
    })
  );
}

function addSceneHeading(children, value) {
  if (!text(value)) return;

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: text(value).toUpperCase(),
          bold: true,
          font: 'Courier New',
          size: 20
        })
      ],
      spacing: {
        before: 360,
        after: 180
      }
    })
  );
}

function addCharacter(children, value) {
  if (!text(value)) return;

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: text(value).toUpperCase(),
          bold: true,
          font: 'Courier New',
          size: 20
        })
      ],
      indent: {
        left: 2160
      },
      spacing: {
        before: 180,
        after: 40
      }
    })
  );
}

function addDialogue(children, value) {
  if (!text(value)) return;

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: text(value),
          font: 'Courier New',
          size: 20
        })
      ],
      indent: {
        left: 1440,
        right: 1440
      },
      spacing: {
        after: 160,
        line: 240
      }
    })
  );
}

function addTransition(children, value) {
  if (!text(value)) return;

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: text(value).toUpperCase(),
          bold: true,
          font: 'Courier New',
          size: 20
        })
      ],
      alignment: AlignmentType.RIGHT,
      spacing: {
        before: 240,
        after: 240
      }
    })
  );
}

function createScreenplay(finalPackage) {
  const script = finalPackage.script || {};
  const children = [];

  const title = text(script.title) || text(finalPackage.topic) || 'VIDEO SCRIPT';

  // TITLE PAGE
  children.push(
    new Paragraph({
      spacing: {
        before: 3000,
        after: 400
      },
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: title.toUpperCase(),
          bold: true,
          font: 'Courier New',
          size: 28
        })
      ]
    })
  );

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: {
        after: 200
      },
      children: [
        new TextRun({
          text: 'Written by',
          font: 'Courier New',
          size: 20
        })
      ]
    })
  );

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: 'CreatorPilot',
          font: 'Courier New',
          size: 20
        })
      ]
    })
  );

  children.push(
    new Paragraph({
      children: [new TextRun({ break: 2 })]
    })
  );

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({
          text: `${script.format || 'Screenplay'} | ${script.targetDuration || ''}`,
          font: 'Courier New',
          size: 18
        })
            ]
    })
  );

  // NEW PAGE
  children.push(
    new Paragraph({
      children: [new TextRun({ break: 3 })]
    })
  );

  // OPENING
  children.push(
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: {
        after: 300
      },
      children: [
        new TextRun({
          text: 'FADE IN:',
          bold: true,
          font: 'Courier New',
          size: 20
        })
      ]
    })
  );

  if (script.hook) {
    addAction(children, script.hook);
  }

  // SCRIPT SCENES
  for (const section of script.sections || []) {
    const heading = text(section.heading);

    if (heading) {
      addSceneHeading(children, heading);
    }

    if (section.narration) {
      addAction(children, section.narration);
    }

    if (section.action) {
      addAction(children, section.action);
    }

    // Dialogue support
    if (Array.isArray(section.dialogue)) {
      for (const line of section.dialogue) {
        if (typeof line === 'string') {
          addDialogue(children, line);
          continue;
        }

        if (line.character) {
          addCharacter(children, line.character);
        }

        if (line.parenthetical) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: `(${text(line.parenthetical)})`,
                  font: 'Courier New',
                  size: 20
                })
              ],
              indent: {
                left: 1800,
                right: 1800
              },
              spacing: {
                after: 40
              }
            })
          );
        }

        if (line.dialogue) {
          addDialogue(children, line.dialogue);
        }
      }
    }

    if (section.character && section.dialogue) {
      addCharacter(children, section.character);

      if (section.parenthetical) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: `(${text(section.parenthetical)})`,
                font: 'Courier New',
                size: 20
              })
            ],
            indent: {
              left: 1800,
              right: 1800
            }
          })
        );
      }

      addDialogue(children, section.dialogue);
    }

    if (Array.isArray(section.visualSuggestions)) {
      for (const visual of section.visualSuggestions) {
        addAction(children, visual);
      }
    }

    if (Array.isArray(section.onScreenText)) {
      for (const overlay of section.onScreenText) {
        addAction(children, `ON SCREEN: ${overlay}`);
      }
    }

    if (section.transition) {
      addTransition(children, section.transition);
    }
  }

  children.push(
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      spacing: {
        before: 500,
        after: 500
      },
      children: [
        new TextRun({
          text: 'FADE OUT.',
          bold: true,
          font: 'Courier New',
          size: 20
        })
      ]
    })
  );

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: {
        before: 400
      },
      children: [
        new TextRun({
          text: 'THE END',
          bold: true,
          font: 'Courier New',
          size: 20
        })
      ]
    })
  );

  return children;
}

export async function generateWordDocument(finalPackage) {
  const children = createScreenplay(finalPackage);

  const doc = new Document({
    creator: 'CreatorPilot',
    title: finalPackage.script?.title || finalPackage.topic || 'Screenplay',

    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 720,
              bottom: 720,
              left: 1080,
              right: 1080
            }
          }
        },

        children
      }
    ]
  });

  return Packer.toBuffer(doc);
}
function addExportTitle(children, title) {
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: String(title || ''),
          bold: true,
          size: 32,
          font: 'Arial'
        })
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 360 }
    })
  );
}

function addExportHeading(children, title) {
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: String(title || ''),
          bold: true,
          size: 24,
          font: 'Arial'
        })
      ],
      spacing: {
        before: 240,
        after: 120
      }
    })
  );
}

function addExportField(children, label, value) {
  if (value === undefined || value === null || value === '') {
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

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: `${label}: `,
          bold: true,
          font: 'Arial',
          size: 20
        }),
        new TextRun({
          text: String(displayValue),
          font: 'Arial',
          size: 20
        })
      ],
      spacing: { after: 100 }
    })
  );
}

function addExportObject(children, object, heading) {
  if (!object || typeof object !== 'object') {
    return;
  }

  if (heading) {
    addExportHeading(children, heading);
  }

  for (const [key, value] of Object.entries(object)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }

    const label = key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, char => char.toUpperCase());

    if (Array.isArray(value)) {
      addExportHeading(children, label);

      value.forEach((item, index) => {
        addExportField(
          children,
          `${index + 1}`,
          item && typeof item === 'object'
            ? JSON.stringify(item, null, 2)
            : item
        );
      });

      continue;
    }

    if (typeof value === 'object') {
      addExportObject(children, value, label);
      continue;
    }

    addExportField(children, label, value);
  }
}

export async function generateStoryboardWordDocument(finalPackage) {
  const storyboard = finalPackage?.storyboard || {};
  const children = [];

  const title =
    storyboard.title ||
    finalPackage?.topic ||
    'CreatorPilot Storyboard';

  addExportTitle(children, title);

  addExportField(
    children,
    'Production Type',
    storyboard.productionType
  );

  addExportField(
    children,
    'Platform',
    storyboard.platform
  );

  addExportField(
    children,
    'Format',
    storyboard.format
  );

  addExportField(
    children,
    'Target Duration',
    storyboard.targetDuration
  );

  addExportHeading(children, 'Storyboard Shots');

  const shots = Array.isArray(storyboard.shots)
    ? storyboard.shots
    : [];

  shots.forEach((shot, index) => {
    addExportHeading(
      children,
      `Shot ${shot.shotNumber ?? index + 1}`
    );

    addExportObject(children, shot);
  });

  const doc = new Document({
    creator: 'CreatorPilot',
    title,
    sections: [{
      properties: {
        page: {
          margin: {
            top: 720,
            bottom: 720,
            left: 1080,
            right: 1080
          }
        }
      },
      children
    }]
  });

  return Packer.toBuffer(doc);
}

export async function generateProductionPlanWordDocument(finalPackage) {
  const plan = finalPackage?.productionPlan || {};
  const children = [];

  const title =
    plan.title ||
    finalPackage?.topic ||
    'CreatorPilot Production Plan';

  addExportTitle(children, title);

  addExportField(children, 'Logline', plan.logline);
  addExportField(children, 'Genre', plan.genre);
  addExportField(children, 'Target Duration', plan.targetDuration);
  addExportField(children, 'Production Type', plan.productionType);

  addExportHeading(children, 'Shot List');

  const shotList = Array.isArray(plan.shotList)
    ? plan.shotList
    : [];

  shotList.forEach((shot, index) => {
    addExportHeading(
      children,
      `Shot ${shot.shotNumber ?? index + 1}`
    );

    addExportObject(children, shot);
  });

  addExportObject(
    children,
    { filmingSchedule: plan.filmingSchedule },
    'Filming Schedule'
  );

  addExportObject(
    children,
    { equipmentList: plan.equipmentList },
    'Equipment'
  );

  addExportObject(
    children,
    { locationsList: plan.locationsList },
    'Locations'
  );

  addExportObject(
    children,
    { propsList: plan.propsList },
    'Props'
  );

  addExportObject(
    children,
    { wardrobeList: plan.wardrobeList },
    'Wardrobe'
  );

  addExportField(
    children,
    'Makeup and Hair',
    plan.makeupHairNotes
  );

  addExportObject(
    children,
    { postProductionNotes: plan.postProductionNotes },
    'Post Production'
  );

  addExportObject(
    children,
    { warnings: plan.warnings },
    'Warnings'
  );

  const doc = new Document({
    creator: 'CreatorPilot',
    title,
    sections: [{
      properties: {
        page: {
          margin: {
            top: 720,
            bottom: 720,
            left: 1080,
            right: 1080
          }
        }
      },
      children
    }]
  });

  return Packer.toBuffer(doc);
}

