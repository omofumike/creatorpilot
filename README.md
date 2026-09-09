# CreatorPilot 🎬

## AI Production Crew for Filmmakers

CreatorPilot is an agentic AI filmmaking workspace designed to help filmmakers and content creators move from a creative idea to a structured production workflow.

Instead of treating filmmaking as a single AI prompt, CreatorPilot connects specialized production stages:

**Creative Brief → Research → Script → Storyboard → Production Plan → Video Generation → Quality Review → Final Film**

The project explores how agentic AI can support filmmakers across the production lifecycle, from developing an initial concept to generating and reviewing visual production assets.

Built for the **Agentic Cinema: The Blockbuster Hackathon 2026**.

---

## The Problem

Turning a creative idea into a finished production involves much more than generating a video.

Filmmakers may need to:

- Research a subject
- Validate information
- Develop a story
- Write a script
- Break the story into individual shots
- Plan production requirements
- Generate visual material
- Review the resulting production

These activities are often spread across different tools and require significant manual coordination.

CreatorPilot addresses this fragmentation by bringing these production stages into a connected AI-assisted workflow.

---

## The Solution

CreatorPilot acts as an **AI production crew**.

Specialized agents and production components handle different responsibilities while passing structured information from one stage to the next.

Research can inform the script.

The script informs the storyboard.

The storyboard informs the production plan.

The production plan informs video generation.

Generated footage is then passed through quality review.

This creates a connected production workflow rather than a collection of isolated AI features.

---

# Core Workflow

```text
Creative Brief
      ↓
Research
      ↓
Script
      ↓
Storyboard
      ↓
Production Plan
      ↓
Video Generation
      ↓
Quality Review
      ↓
Final Film
```

## 1. Creative Brief

The filmmaker begins with a concept and creative direction.

The brief provides the foundation for the downstream production workflow.

## 2. Research

The Research Agent investigates the production subject and provides findings that can support the creative process.

CreatorPilot integrates **Parallel Search** for search-based research and source discovery.

## 3. Script Development

Creative direction and research are transformed into a structured screenplay containing narrative and production information.

The script can include:

- Narrative structure
- Scenes
- Dialogue
- Visual direction
- Character and action descriptions
- Production-oriented details

## 4. Storyboard

The Director/Storyboard stage transforms the script into individual production shots.

Each shot can include:

- Shot number
- Scene description
- Camera direction
- Composition
- Action
- Lighting and atmosphere
- Duration
- Audio or dialogue requirements

The storyboard provides a visual blueprint for production.

## 5. Production Plan

The storyboard is transformed into a cinematic production shot list.

The production plan organizes the information required to execute individual shots and provides production checklist information.

## 6. Video Generation

CreatorPilot connects the production workflow to Google's Veo video generation capabilities.

Individual production shots can be generated and processed as part of the larger film workflow.

## 7. Quality Review

The quality-review stage evaluates the production across multiple dimensions, including:

- Grounding
- Consistency
- Production readiness
- Compliance
- Overall quality

This creates a review layer between generated footage and the final production.

---

# AI Production Crew

CreatorPilot is organized around specialized production responsibilities.

### Research Agent

Researches the production subject and supplies information that can ground the creative workflow.

### Video Director Agent

Transforms creative direction and script information into visual production instructions, including storyboard and shot-level direction.

### Video Generation Layer

Connects production shots to Google's Veo video generation capabilities and manages generated video output.

### Quality Review

Provides a review layer for the resulting production, helping identify grounding, consistency, production, and compliance issues.

---

# 🏆 Project Highlight

## Innovation

CreatorPilot goes beyond single-prompt content generation by treating filmmaking as a coordinated production workflow.

The innovation is the connection of multiple filmmaking responsibilities:

**Research → Story → Visual Direction → Production Planning → Generation → Review**

Instead of simply asking AI to create a video, CreatorPilot explores how specialized AI responsibilities can participate throughout the filmmaking process.

---

## Technical Execution

CreatorPilot is implemented as a working application with a connected production pipeline.

The technical implementation includes:

- Specialized agent modules
- Structured handoffs between production stages
- Google Gemini integration
- Parallel Search integration
- Veo video generation
- Video operation polling
- Generated video extraction
- Video metadata persistence
- FFmpeg-based video processing and assembly
- Real and mock video-generation modes
- Browser-based production dashboard

The architecture separates research, directing, generation, persistence, video processing, and presentation into distinct components.

---

## Google Cloud & Gemini

Google AI and Google Cloud technologies are central to CreatorPilot.

The project uses:

- **Google Gemini** for AI-assisted production reasoning and content generation
- **Google Gen AI SDK** for application integration
- **Google Cloud / Vertex AI** for Google Cloud AI infrastructure
- **Google Veo** for video generation

Veo is integrated into the production pipeline rather than functioning as an isolated video-generation feature.

Storyboard and production information can flow into the video-generation stage, connecting creative planning with generated visual output.

---

## Agentic Workflow

CreatorPilot demonstrates an agent-oriented approach through specialized responsibilities and structured context transfer.

```text
                 ┌─────────────────┐
                 │  Creative Brief │
                 └────────┬────────┘
                          ↓
                 ┌─────────────────┐
                 │ Research Agent  │
                 └────────┬────────┘
                          ↓
                    ┌───────────┐
                    │  Script   │
                    └─────┬─────┘
                          ↓
                 ┌─────────────────┐
                 │ Director Agent  │
                 │   Storyboard    │
                 └────────┬────────┘
                          ↓
                 ┌─────────────────┐
                 │ Production Plan │
                 └────────┬────────┘
                          ↓
                 ┌─────────────────┐
                 │ Video Generation│
                 │       Veo       │
                 └────────┬────────┘
                          ↓
                 ┌─────────────────┐
                 │ Quality Review  │
                 └────────┬────────┘
                          ↓
                    ┌───────────┐
                    │ Final Film│
                    └───────────┘
```

Each stage contributes structured information that can be used by subsequent stages.

This specialization allows CreatorPilot to model different production responsibilities instead of relying on one general-purpose AI interaction.

---

## User Impact

CreatorPilot is designed for:

- Independent filmmakers
- Content creators
- Small production teams
- Creative teams with limited production resources

The connected workflow can reduce the coordination required between research, writing, visual planning, production planning, and video generation.

Potential benefits include:

- Faster pre-production
- More structured creative development
- Better research grounding
- Easier shot planning
- Faster creative experimentation
- Reduced workflow fragmentation
- A clearer path from concept to production

The broader vision is to make structured filmmaking workflows more accessible to creators who may not have access to a large production team.

---

## Readiness

CreatorPilot is designed around a complete, visible production journey:

**Idea → Research → Script → Storyboard → Production Plan → Video Generation → Quality Review**

The application provides a browser-based production dashboard where these stages can be viewed as part of one connected workflow.

The demonstrated workflow includes:

1. Production dashboard
2. AI production crew
3. Research findings and search intelligence
4. Generated script
5. Shot-by-shot storyboard
6. Cinematic production shot list
7. Production checklist
8. Generated video
9. Scene-by-scene production output
10. Executive quality review

The project is structured to demonstrate the complete filmmaking workflow within the hackathon demo format.

---

# Architecture

```text
                         CREATIVE BRIEF
                               │
                               ▼
                     ┌──────────────────┐
                     │  Research Agent  │
                     │ Gemini + Search  │
                     └────────┬─────────┘
                              │
                              ▼
                       ┌─────────────┐
                       │    Script   │
                       └──────┬──────┘
                              │
                              ▼
                    ┌──────────────────┐
                    │ Director Agent   │
                    │    Storyboard    │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │ Production Plan  │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │ Video Generation │
                    │       Veo        │
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │ FFmpeg Processing│
                    └────────┬─────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │  Quality Review  │
                    └────────┬─────────┘
                             │
                             ▼
                         FINAL FILM
```

---

# Technology Stack

### AI

- Google Gemini
- Google Gen AI SDK
- Google Veo

### Google Cloud

- Google Cloud
- Vertex AI / Gemini Enterprise Agent Platform

### Search

- Parallel Search API

### Application

- Node.js
- JavaScript
- HTML
- CSS
- Browser-based production dashboard

### Video Processing

- Google Veo
- FFmpeg
- `ffmpeg-static`

---

# Project Structure

```text
CreatorPilot/
│
├── lib/
│   ├── agents/
│   │   ├── researchAgent.js
│   │   └── videoDirectorAgent.js
│   │
│   ├── tools/
│   │   └── parallelSearch.js
│   │
│   ├── video/
│   │   ├── veoVideoGenerator.js
│   │   ├── mockVideoGenerator.js
│   │   └── videoMetadataStore.js
│   │
│   ├── utils/
│   │   └── config.js
│   │
│   └── web/
│       └── app.js
│
├── public/
│   └── index.html
│
├── index.js
├── package.json
├── .env.example
└── README.md
```

---

# Video Generation

CreatorPilot supports development and real video-generation workflows.

### Development Mode

The mock video generator provides a development path for testing the broader production workflow without repeatedly invoking video generation services.

### Real Generation

The real video-generation pipeline connects to Google's Veo service.

The current implementation uses:

```text
veo-3.1-generate-001
```

The video generation layer supports:

- Generation requests
- Operation polling
- Generated video extraction
- Persistence
- Retry and error handling
- Downstream video processing

---

# Video Pipeline

```text
Storyboard Shot
      ↓
Generation Prompt
      ↓
Veo Generation
      ↓
Generated MP4
      ↓
Metadata Persistence
      ↓
FFmpeg Processing / Assembly
      ↓
Production Output
```

---

# Development Principles

### Specialized AI Roles

CreatorPilot separates production responsibilities instead of relying on one general-purpose AI interaction.

### Structured Handoffs

Outputs from one production stage become structured inputs for the next stage.

### Human Creative Control

CreatorPilot is designed to assist filmmakers while keeping creative direction with the filmmaker.

### Production-Oriented Outputs

The system produces artifacts that are useful within a filmmaking workflow:

- Research findings
- Scripts
- Storyboards
- Shot lists
- Production plans
- Video clips
- Quality reports

---

# Why CreatorPilot?

Many creative AI applications focus on generating one asset at a time.

CreatorPilot focuses on the **workflow connecting those assets**.

A filmmaker can move from:

**Idea → Research → Story → Shots → Production → Footage → Review**

through a connected production environment.

The long-term vision is an AI production crew that works alongside filmmakers throughout the creative and production process.

---

# Responsible AI & Production

AI-generated research and media should be reviewed by humans before publication or professional use.

Creators remain responsible for verifying:

- Factual accuracy
- Copyright and licensing
- Likeness and identity rights
- Music and audio rights
- Generated-content suitability
- Final production quality

---

# Future Development

CreatorPilot's future direction includes:

- Character and visual continuity memory
- Additional specialized filmmaking agents
- Advanced shot-to-shot consistency
- Automated editing
- Music and sound-design workflows
- Voice and dialogue production
- Collaborative cloud production
- Production asset management
- Advanced quality-control agents
- Expanded cloud deployment

---

# Built By

**Ruth Peace Ibitomisin**

CreatorPilot is an independent project exploring how agentic AI can support filmmaking and creative production.

---

# License

This project is open source.
