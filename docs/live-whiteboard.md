# BrenUp collaborative classroom

Open a live class, select **Whiteboard**, and expand the classroom using the icon in the header. Teachers and enrolled learners share one saved board for that class, including classes without attached lesson slides.

## Teaching with the board

| Feature | What it does |
| --- | --- |
| Lesson Slides | Opens the existing lesson player. Teacher slide changes continue to guide learners. The board and lesson stay mounted when switching. |
| Pen | Draw freehand with a mouse, touch screen, or stylus. Completed strokes save and appear for the class. |
| Highlighter | Adds translucent marks so text stays visible underneath. |
| Select | Selects and moves an object. Drag the corner handle to resize. Double-click text, a note, or a word card to edit it. |
| Text | Adds editable handwriting, with color and size choices. |
| Sticky note | Adds a pastel note for reminders, instructions, or feedback. |
| Word card | Adds a movable word or phrase for sentence-building activities. Cards can be edited, duplicated, resized, or deleted. |
| Shapes and arrows | Draw rectangles, ellipses, and directional arrows. Choose the rectangle or ellipse option below the board. |
| Image | Upload a PNG, JPG, or WebP from your device. Move and resize it like other objects. Images are reduced before saving. No picture is added automatically. |
| Eraser | Removes the object or stroke you click. |
| Pointer and laser | Show a temporary pointer to other connected participants without changing the saved board. |
| Move / Pan | Drag the board viewport when zoomed in. Zoom controls include a reset to 100%. |
| Undo | Undoes your last saved edit. Up to 30 actions are available while the classroom remains open. A newer edit from someone else is protected against accidental overwrite. |
| Clear board | Teacher control to clear the canvas, with a confirmation and undo support. |
| Timer | Teacher starts a shared countdown, pauses it, or resets it. Everyone sees the same end time. |
| Lock board | Teachers control whether learners can edit. The server enforces this even if a learner has an older view open. |
| Export | Downloads a PNG containing the whole board, including uploaded images and the handwriting font. Cursors and selection handles are omitted. |
| Activity Prompt | Teacher-editable instructions beside the board. |
| Live on Board | Shows connected participants. Moving pointers are temporary and are not saved in class history. |
| Templates | Loads an editable present-simple activity with sentence correction, a word bank, a picture placeholder, and sentence cards. Replaces the board with confirmation through the template chooser; Undo restores the previous content. |
| Chat, Poll, People | Keeps existing classroom chat, voice notes, polls, speaking queue, group work, and teacher progress tools available in tabs. |
| Class call | Keeps the existing JaaS call beside the board. After joining, View options switches between active-speaker and grid layouts. |

## A first activity

1. Choose **Templates → My Daily Routine**, or begin on a blank board.
2. Add your own picture using **Image**, and remove the picture placeholder if using the template.
3. Adjust the activity prompt and turn on **Open student editing**.
4. Ask learners to move word cards into sentences, write answers, and annotate the picture.
5. Use the timer, then lock the board to discuss answers together.
6. Export a PNG for revision. The saved board remains viewable after the class ends.

## Keyboard and recovery

- Select an object, then use arrow keys to move it. Shift increases the step size.
- Delete or Backspace removes the selected object. Ctrl/Cmd+Z undoes your own last edit.
- Escape closes dialogs and exits the focused classroom view. Dialogs keep keyboard focus inside while open.
- An interrupted save offers **Retry** or **Discard unsaved edit**. Keep the page open until it saves; unsaved edits and undo history do not survive a page reload.
- Conflicting changes to the same object are rejected instead of silently replacing someone else's newer work. Refresh and make the intended edit again.

## Capacity and implementation

The board uses the app's existing Supabase project and JaaS calling integration; it adds no paid whiteboard service. Existing hosting, database, realtime, and calling plan quotas still apply. Cursor traffic is limited, and drawings are saved after a stroke or drag finishes rather than on every pointer movement.

Each class has one board, capped at 250 objects and a 2 MB saved document. Images must start below 10 MB; the browser reduces them to a maximum 650-pixel edge and checks a 150 KB encoded-size limit. Undo history is local to the current page. This is a shared canvas, not an automatically graded activity or a recording of the call.

Database changes are in `supabase/migrations/20260908201851_live_collaborative_whiteboard.sql`. The table has RLS. The write transaction is callable only by the server role after fresh class authorization, and uses per-object revisions plus a row lock. Private realtime notifications trigger authorized refreshes; broadcast messages never authorize edits.

Validation: `node scripts/check-whiteboard.mjs`, `node scripts/check-live-classroom.mjs`, `npm run typecheck`, `npm run lint`, and `npm run build`. The repeatable synthetic browser harness is `node scripts/whiteboard-preview/start.mjs`; open its URL in two tabs, with `?student` in the second. It does not load environment files or contact the live database.

The call view controls use the documented [Jitsi iframe commands](https://jitsi.github.io/handbook/docs/dev-guide/dev-guide-iframe-commands/). The handwriting font is Patrick Hand, distributed under the bundled SIL Open Font License.
