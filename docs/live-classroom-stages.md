# Live classroom: Stage 1 and Stage 2 pilot

## Stage 1 implemented

- Shared room subscription carrying empty invalidation events only. Authorized HTTP routes remain the source of classroom state, messages, answers, and permissions. Untrusted slide broadcasts no longer directly move the player.
- Thirty-second reconciliation when Realtime is connected, ten-second fallback when disconnected, bounded failure backoff, hidden-tab suspension and immediate resync on return. Fetches do not overlap. Fifteen-second attendance heartbeats remain independent of tab visibility.
- Mobile lesson / chat / progress views preserve mounted lesson inputs. A common calling panel remains outside the tab content.
- Poll choice controls, saved-answer feedback, teacher close/reveal controls, anonymous aggregate results, and server-side answer validation. Results are visible to learners only after reveal.
- Ordered hand/help queue, lower-hand control, repeat raising after resolution, and session-scoped moderation.
- Chat drafts survive failed sends. Teachers can select a private message and reply to its sender. Group messages remain restricted by existing route checks.
- Adjustable timers, activity extensions that add to remaining time, checked write errors, and lesson-scoped activity control.
- Voice-note retry in memory, retained recipient audience on retry, two-minute / 1 MB upload limits, microphone release on unmount, lazy audio loading, and expiring cached signed URLs.
- Meeting links appear for learners inside the active classroom. HTTPS Google Meet and WhatsApp call links open their own meeting application.
- Lobby status refresh and completed-class review without live controls. Teacher progress is labeled as a class summary after completion.

No database migration or new npm dependency is needed. Existing lesson IDs, activity schemas, grading pipeline and RLS policies are unchanged. Existing deployments still need their original live-classroom migrations installed.

These changes reduce idle requests; they do not promise a measured production capacity or unlimited free hosting. Presence describes recent app contact, not proof of continuous attendance or speaking time. Historical attendance duration, automatic partner rotation, a correction board, and richer follow-up reports remain future enhancements.

## Stage 2 optional calling pilot

The integration targets Jitsi as a Service (JaaS) on `8x8.vc`, using its supported iframe API. It is disabled by default and loads third-party code only after the user presses Join classroom call.

A fresh authorized POST creates a ten-minute token for exactly one room. The server decides moderator status. Tokens contain pseudonymous participant identifiers rather than learner names, email addresses or lesson data. Camera and microphone start muted; the provider offers the prejoin device controls. Leaving the class disposes the iframe. Recording, transcription, streaming, uploads and telephone features are disabled in the signed token.

### Free-tier constraint

The documented Developer tier includes 25 monthly active users/endpoints. Twenty students plus one teacher can fit when they use the same devices and browsers. A second cohort, another device/browser or clearing local storage can add endpoints. Twelve meetings do not by themselves imply twelve billable users per student. Check the provider usage dashboard and keep the account on its free Developer tier. BrenUp cannot enforce the provider's device-based monthly accounting; no unlimited-free promise is made.

### Activation

1. Create a free JaaS Developer account and confirm its current free limits. Do not enable a paid plan or paid add-ons.
2. Generate a signing key pair using the provider's instructions and register only the public key with JaaS.
3. Configure the following server-only deployment settings through the hosting provider's environment settings. Do not paste private keys into chat, commit them, or expose them with a `NEXT_PUBLIC_` prefix:
   - `JAAS_APP_ID`: the `vpaas-magic-cookie-...` application ID.
   - `JAAS_KEY_ID`: the full key identifier supplied by JaaS.
   - `JAAS_PRIVATE_KEY`: the PEM signing key (literal newlines or escaped `\n` supported).
   - `LIVE_CALLING_ENABLED`: `true`, only after confirming the free account and configuration.
4. Redeploy and run a teacher + learner test in an authorized live session. Then test with the intended 20-student group on their actual networks. Confirm joining, muting, reconnecting, class completion and mobile tab switching. Check provider usage regularly.
5. Set `LIVE_CALLING_ENABLED` to `false` and redeploy to remove the in-app calling entry point. Existing external meeting links remain usable.

A real JaaS call was not verified during implementation: account credentials were not provided. The code and offline token/authorization checks are ready; activation and real media/network testing remain required.

## Google Meet and WhatsApp

Google Meet's add-ons SDK embeds an application inside Meet. It is not a supported Meet-call iframe inside BrenUp. A future Meet add-on is a different user experience.

WhatsApp supports up to 32 participants in a group call. Paste a WhatsApp call link into the scheduling form to use it alongside BrenUp. It opens WhatsApp; it is not an embedded classroom audio engine. Students return to BrenUp for their lesson, chat and answers. No WhatsApp Business API is needed for this link workflow.

Public `meet.jit.si` should not be used as a production embedded calling backend: upstream includes a demo-only iframe timeout. It remains an external meeting-link option.

## Verification

- `node scripts/check-live-classroom.mjs`: offline synthetic checks for poll validation, hidden results, unauthorized writes, closed sessions, scoped hand moderation, re-raising, activity extensions and lesson scope, meeting URLs, signed tokens and call authorization.
- `npm run typecheck`, `npm run lint`, `npm run build`.
- Isolated browser preview using the real classroom components and synthetic API data: teacher creates rating poll; learner submits; teacher receives count and reveals; learner sees results; failed chat retains draft and retry delivers; mobile tabs preserve lesson input; mobile layout has no horizontal overflow.

The browser preview mocks Realtime and the API. It is not a production Supabase load test or a real microphone/media-provider test.

Sources checked 2026-09-08:

- [Google Meet add-ons overview](https://developers.google.com/workspace/meet/add-ons/guides/overview)
- [JaaS FAQ, free tier and endpoint accounting](https://developer.8x8.com/jaas/docs/faq/)
- [JaaS signed-token specification](https://developer.8x8.com/jaas/docs/api-keys-jwt/)
- [JaaS iframe integration](https://developer.8x8.com/jaas/docs/iframe-api-integration/)
- [WhatsApp group calls](https://faq.whatsapp.com/1148204430154253)
- [Jitsi demo iframe warning](https://github.com/jitsi/jitsi-meet/blob/master/lang/main.json)
- [Supabase Realtime limits](https://supabase.com/docs/guides/realtime/limits)
