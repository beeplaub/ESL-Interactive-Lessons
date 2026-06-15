# BrenUp AI Lesson Builder Prompt

Use this prompt with an assistant that has authenticated Supabase access to the BrenUp app and can insert/update rows in `lessons`, `slides`, `lesson_blocks`, and `lesson_slide_activities`.

```text
You are creating a complete BrenUp lesson in the visual lesson builder database.

Ask the user for:
- lesson topic
- CEFR level
- target learner type, if relevant
- approximate lesson length

Create a polished ESL lesson from scratch using the current builder system. Do not use PDF upload, PDF parsing, or old parsed-slide workflows.

Database rules:
- Create one row in `lessons` with status `DRAFT`.
- Store lesson outcomes in `lessons.description` as JSON:
  {"outcomes":["Outcome 1","Outcome 2","Outcome 3"]}
- Create slides in `slides` with `type = 'INFO'`.
- Create visual content in `lesson_blocks`.
- Create interactive activities in `lesson_slide_activities`.
- Keep slide numbers sequential from 1.
- Use `pdf_path = 'builder/{lesson_id}'` if the schema requires a pdf_path.

Lesson structure:
1. Title slide
   - Heading block with the lesson title
   - Text block with the level and topic

2. Lesson outcomes slide
   - Heading block: "After this lesson, you'll be able to:"
   - Bullets block with 3-5 clear outcomes

3. Agenda slide
   - Heading block: "Today's Plan"
   - Bullets block with the lesson stages

4. Warm-up slide
   - Quote or callout block connected to the topic
   - Discussion-style prompt in a text block

5. Image discussion slide
   - Image block using a relevant public image URL from the internet
   - Text block with 2-3 observation questions

6. Vocabulary slide
   - Vocabulary block with 6-8 useful words or phrases
   - Include meaning and example sentence for each

7. Vocabulary activity slide
   - Create a MATCHING activity with at least 5 pairs

8. Grammar or language focus slide
   - Grammar block or text block explaining a useful structure for the topic
   - Include 3 examples

9. Grammar activity slide
   - Create a GAP_FILL activity with at least 5 questions

10. Multiple choice activity slide
   - Create an MCQ activity with at least 5 questions

11. Multiple select activity slide
   - Create a MULTIPLE_SELECT activity where learners choose all correct answers

12. True/False activity slide
   - Create a TRUE_FALSE activity with at least 5 statements

13. Video slide
   - Video block with a topic-related YouTube URL
   - Text block telling learners what to watch for

14. Video questions slide
   - Create an MCQ or SHORT_ANSWER activity based on the video

15. Reading slide
   - Reading block with a unique 180-220 word passage about the topic
   - The topic must appear naturally in the passage

16. Reading comprehension slide
   - Create an MCQ, TRUE_FALSE, or MISSING_INFORMATION activity with at least 5 questions

17. Error correction slide
   - Create an ERROR_CORRECTION activity with 5 sentences

18. Reordering slide
   - Create a REORDERING activity where learners place steps/events/sentences in order

19. Categorization slide
   - Create a CATEGORIZATION activity where learners sort vocabulary or ideas into groups

20. Speaking or writing slide
   - Text, callout, or bullets block with a final production task

Activity data shapes:

MCQ:
{
  "prompt":"Choose the best answer.",
  "questions":[
    {"id":1,"text":"Question text","options":{"A":"...","B":"...","C":"...","D":"..."},"answer":"A"}
  ]
}

TRUE_FALSE:
{
  "prompt":"True or False?",
  "items":[
    {"statement":"Statement text","answer":true}
  ]
}

GAP_FILL:
{
  "prompt":"Complete the sentences.",
  "items":[
    {"sentence":"She ___ the answer.","answer":"knows"}
  ]
}

MATCHING:
{
  "prompt":"Match the items.",
  "questions":[
    {
      "id":"1",
      "question_number":1,
      "question_type":"MATCHING",
      "question_text":"Match the items.",
      "options":{"a_items":["item 1","item 2"],"b_items":["match A","match B"]},
      "correct_answer":[{"a":1,"b":"A"},{"a":2,"b":"B"}]
    }
  ]
}

MULTIPLE_SELECT:
{
  "prompt":"Choose all correct answers.",
  "questions":[
    {"id":1,"text":"Question text","options":{"A":"...","B":"...","C":"...","D":"..."},"answer":["A","C"]}
  ]
}

DRAG_DROP:
{"prompt":"Move each item to the correct place.","items":[{"text":"Item","target":"Target"}],"targets":["Target"]}

REORDERING:
{"prompt":"Put the items in the correct order.","items":["First","Second","Third"],"correct_order":["First","Second","Third"]}

CATEGORIZATION:
{"prompt":"Sort the items into categories.","categories":[{"name":"Category A","items":["item"]},{"name":"Category B","items":["item"]}]}

SHORT_ANSWER:
{"prompt":"Write a short answer.","questions":[{"id":1,"text":"Question text","sample_answer":"Model answer"}]}

ERROR_CORRECTION:
{"prompt":"Find and correct the mistake.","items":[{"incorrect":"Incorrect sentence.","correct":"Correct sentence."}]}

MISSING_INFORMATION:
{"prompt":"Complete the missing information.","paragraphs":[{"text":"A paragraph with ___ missing words.","answers":["the answer"]}]}

Content block shapes:

HEADING: {"text":"Heading text","level":"H1"}
TEXT: {"body":"Paragraph text"}
BULLETS: {"title":"Agenda","items":["First point","Second point"]}
QUOTE: {"body":"Quote text","attribution":"Name"}
CALLOUT: {"title":"Think about this","body":"Callout message"}
IMAGE: {"path":"https://...","alt":"description","caption":"caption"}
AUDIO: {"path":"https://...","label":"Listening audio"}
VIDEO: {"url":"https://www.youtube.com/watch?v=...","title":"Video title"}
VOCABULARY: {"entries":[{"word":"...","pronunciation":"","meaning":"...","example":"...","notes":""}]}
GRAMMAR: {"title":"...","explanation":"...","examples":["..."],"notes":"..."}
READING: {"title":"...","passage":"...","questions":["..."]}
DIALOGUE: {"turns":[{"speaker":"A","line":"..."},{"speaker":"B","line":"..."}]}

Quality rules:
- Make the lesson coherent and classroom-ready.
- Use natural, level-appropriate English.
- Make every activity answerable from the slide content, video, reading, or language focus.
- Do not publish automatically. Leave the lesson as DRAFT for admin review.
- Return the lesson ID and builder URL when finished.
```
