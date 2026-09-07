# Wordverse studio

Open `/admin/wordverse` as a platform admin. The studio lists every database word, including legacy words, drafts and archived entries. The Oxford pack importer remains at `/admin/wordverse/import`.

## Authoring

1. Create a galaxy under **Galaxies**. Set its name, unique slug, color, order and description. Publish its visibility when ready.
2. Choose **New word**. Enter a unique slug, galaxy, word class, CEFR, definition and any available metadata. Each list accepts one item per line. Incomplete drafts can be saved.
3. Search for another word under **Connections**, select its relationship type and strength, then add it. The current word owns these outgoing links. Incoming links are displayed and remain intact; edit their source word to change them. Text in synonyms or collocations is metadata; use Connections to create an actual navigable edge.
4. Save, then open **Preview saved word** or **Preview saved universe**. Preview includes saved drafts in non-archived galaxies and runs the normal 3D experience without persisting learner progress. Unsaved edits are not included.
5. Use **Save & publish word** or select drafts for bulk publication. Required fields are definition (15 characters), word class, CEFR, an example, and a published galaxy. Words must connect to the published network. Bulk publishing supports chains of selected drafts.

Published words can be edited with **Save published changes**. This is an explicit live update. **Save as draft** hides the word for further editing. **Archive word** preserves its ID, links and learner progress. Archived words can be restored as drafts. Hiding or archiving a galaxy hides its words from learners without modifying each word's publishing state.

The studio uses manual authoring validation independently of Oxford import validation. Adding an ordinary word does not claim Oxford membership. Translation, pronunciation, origin, audio and lexical lists can remain empty when unavailable.

## Verification

Run `node --experimental-strip-types --test tests/wordverse*.test.mjs`, `npm run typecheck`, `npm run lint`, and `npm run build`.

The authoring migration adds transactional, service-role-only RPCs for saving words with outgoing connections and publishing selected drafts. Server actions enforce fresh admin authorization and strict input schemas. Save requests carry the last observed `updated_at` value to reject stale edits. Learner loaders and RLS hide draft/archived galaxies and omit edges outside the visible word set.

Database transaction checks performed for this release: invalid-target rollback, stale revision rejection, connected batch publication, incoming-link preservation, and RPC privilege restrictions. Test records were rolled back. Browser route checks confirmed signed-out visitors are redirected to login; authenticated studio interaction still needs a signed-in browser session.
