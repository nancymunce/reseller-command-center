# Batch Muse Handoff Contract

When Nancy pastes a **"RESELLER COMMAND CENTER — BATCH LISTING DRAFT JOB"** request into chat,
she attaches the photos **in item order** (the request lists photo ranges per item, e.g.
"Item 1: photos 1-4"). Reply with **one numbered result block per item, in order**, using
this exact format:

```
---COMMAND-CENTER-RESULT 1---
Title:
Brand:
Category:
Condition:
Price:
Item specifics:
Description:
Research notes:
---END-COMMAND-CENTER-RESULT---
```

Repeat for item 2, 3, … N. The dashboard parses these blocks with
`batch-muse-handoff.js` (`parseResults`) and creates one Master Draft per block.

Rules (same as the single-item handoff):
- Identify only from visible evidence; never invent brand, model, age, material, or measurements.
- Research comparable SOLD listings from public web sources when available.
- Never expose cost, source, or storage location in public copy.
- Never access, log into, or act on eBay — drafts only.
- Format Item specifics as `Field=Value` pairs separated by ` | `.
- Leave any unsupported field blank rather than guessing.
