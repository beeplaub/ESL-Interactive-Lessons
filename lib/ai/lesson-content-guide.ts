import { ALL_CONTENT_BLOCK_REFERENCE, ALL_ACTIVITIES_REFERENCE } from "@/lib/allActivitiesReference";

/** Compact schema guide generated from the renderer's current references. */
export const LESSON_CONTENT_GUIDE = `BREnUP CONTENT INSERTION GUIDE (AUTHORITATIVE)
Build a lesson as ordered slides. Add a slide first, then add its blocks and at most one activity. Positions are one-based. Never invent IDs; the server creates them. The slide title is already displayed, so do not add a duplicate HEADING block. Use INFO for content-only slides and activity for slides containing an activity. Preserve existing elements unless the user explicitly asks to edit/delete them.
For every new block use {op:"add",entity:"block",slide:<number>,type:<BLOCK_TYPE>,content:<exact shape>,position?:<number>}. For every activity use {op:"add",entity:"activity",slide:<number>,type:<ACTIVITY_TYPE>,content:<exact shape>}. To edit, send the complete replacement nested array when changing questions/items. Validate every answer against its choices. Keep open-ended activities needs_review=true. Media slides need framing TEXT immediately before AUDIO/VIDEO and no IMAGE block. Never leave an activity slide without supporting content.
CONTENT BLOCK SCHEMAS (use these keys; extra keys are allowed only when renderer-compatible):
${ALL_CONTENT_BLOCK_REFERENCE.map(x=>`${x.blockType}: ${JSON.stringify(x.content)}`).join("\n")}
ACTIVITY SCHEMAS (questions/items stay inside activity_data; do not create question rows):
${ALL_ACTIVITIES_REFERENCE.map(x=>`${x.type}: ${JSON.stringify(x.data)}`).join("\n")}
Creation sequence: research course and sibling lessons; confirm target draft shell; plan outcomes and slide titles; show synopsis for substantial builds; create slides in order; add blocks in teaching order; add one practice activity where appropriate; validate content and answers; save as DRAFT and report exactly what changed. Do not publish or alter permissions.`;
