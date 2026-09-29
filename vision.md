# dogfood — durable purpose

- **User-stated:** dogfood (formerly QA) is a standalone tool for people and agents to inspect the core pages of any project, run meaningful page checks on demand, and understand what is actually proven. It simplifies QA by listing every page with its rating and the criteria for completing it.
- **User-stated:** Each page needs configurable checks for product quality, security, scraping resistance, SEO, and connections, including the information exchanged with APIs. An independent model review is part of the intended product.
- **User-stated, 2026-09-25:** dogfood is public and should feel like a clean, purposeful Mac app.
- **User-stated, 2026-09-25:** The project is named **dogfood**, an AI QA system. It is a visual way for people to see QA: it tracks every page, shows the metrics that matter, holds a full-page screenshot, and has a button that asks AI to validate things. When an agent runs QA, it fills in the details through an MCP server and a defined system, and a page's QA is not complete until the agent has done the required steps.
- **User-stated, 2026-09-26:** a feature is a thing a person can do on the page, never an interface element.
- **User-stated, 2026-09-26:** the user is a non-technical person who wants to know whether their vibe-coded app is working. They need (1) a skill so their agent can take this open-source tool and add their site to it, with each page's criteria, and (2) a UI where they see each page on mobile and desktop and know whether it meets design consistency, whether it is clear why it exists, whether it is easy to use and working, whether it is secure (scrape-free, hack-free), whether it is optimized for speed and search, and whether it is bug-free, meaning the intended things work as expected.
- **Agent-selected working policy:** A page's plan, run evidence, human review, and overall verdict stay distinct. Case counts never become a page score. A perfect score requires fresh evidence for every declared critical gate.
- **User-stated, 2026-09-29:** Dogfood is the lightweight system for a coding agent to plan, build, QA and continue a web project end to end. Supporting CLI and skills must work before an app exists and leave a useful handoff for the next session. The dashboard makes that work and its evidence easy for a person to inspect.
- **Non-goals:** dogfood does not claim a screenshot proves behavior, that local fixtures prove a deployed integration, or that a public page can be made impossible to copy. It is a local tool, not a hosted service.

## Current working loop

Start with project intent and a bounded plan. The agent claims one task, builds it, runs meaningful checks and records current page evidence. Acceptance follows those checks; the next session reads the saved context, blockers and handoff. Keep the tool lightweight and native, with CLI and skill entry points before a URL exists.

**User-stated, 2026-09-29:** Extend the approved Plan to the rest of the app and fix the project selector’s misplaced indicator.
