# BrenUp OBE Guide For Course Creators

## What This Guide Is About

BrenUp uses **Outcome-Based Education (OBE)** to describe and measure what a learner can do after studying a course.

You can create a normal course without understanding OBE. However, when you configure outcomes, skills, and evidence, BrenUp can show:

- What learners are expected to learn
- Which lesson outcomes support each course outcome
- Which questions measure each outcome
- Which skills a learner is developing
- Whether the learner has enough evidence to be considered successful

OBE does not replace lessons, quizzes, activities, or normal course progress. It adds a measurement layer around them.

## The Basic Idea

The BrenUp OBE chain is:

```text
Course outcome
    ↓
Lesson outcome
    ↓
Activity question
    ↓
Skill / target / score
    ↓
Learner evidence
    ↓
Course report and language profile
```

Example:

```text
Course outcome: Learners can discuss past experiences clearly.
Lesson outcome: Learners can use the present perfect continuous to describe ongoing experiences.
Question: Complete: “I ______ waiting for the bus for 20 minutes.”
Skill: Grammar → Tense control
Target: Present perfect continuous
Evidence: Learner earns 1 out of 1.
```

## Important Terms

### Outcome

An **outcome** is a meaningful ability a learner should demonstrate. It should describe an observable result, not just a topic.

Good:

> Learners can ask for clarification politely in a workplace conversation.

Weak:

> Workplace English

Use action verbs such as:

- identify
- explain
- choose
- use
- compare
- write
- discuss
- pronounce
- understand
- respond

### Course Outcome

A **course outcome** is a major ability developed across the whole course. It is usually broader than one lesson outcome.

Example:

> CO1: Communicate confidently in common workplace situations.

### Lesson Outcome

A **lesson outcome** is a smaller ability taught and practiced inside one lesson. Several lesson outcomes can support one course outcome.

Example:

> LO1: Use five expressions for agreeing and disagreeing in a meeting.

### Mapping

**Mapping** means connecting one learning element to another.

Typical mappings are:

- Lesson outcome → Course outcome
- Question → Lesson outcome
- Question → Skill
- Question → Learning target
- Course quiz question → Course outcome

Mapping tells BrenUp why a question exists and which ability its result represents.

### Skill

A **skill** is the broad area being measured.

Examples:

- Vocabulary
- Grammar
- Reading
- Listening
- Speaking
- Writing
- Pronunciation
- Spelling
- Sentence construction
- Functional language

### Subskill

A **subskill** is a more specific part of a skill.

Examples:

- Grammar → Tense control
- Listening → Listening for detail
- Reading → Inferencing
- Pronunciation → Word stress
- Speaking → Fluency

### Learning Target

A **learning target** is a specific item the learner can master.

Examples:

- Present perfect continuous
- Queue
- A waiting game
- Asking someone to repeat
- The /th/ sound

### Evidence

**Evidence** is a learner response that shows performance. It may come from:

- A quiz question
- A lesson activity question
- A speaking response
- A writing response
- A pronunciation activity
- A teacher-reviewed response

### Attainment

**Attainment** is how well the learner performed on the evidence that has been attempted.

Example:

> The learner scored 85% on the mapped questions.

### Coverage

**Coverage** is how much of the mapped evidence the learner has attempted.

Example:

> The learner scored 100% on the one question attempted, but only attempted 25% of the mapped evidence. Attainment is high, but coverage is low.

This distinction prevents BrenUp from calling an outcome mastered too early.

### Mastery Threshold

The **mastery threshold** is the minimum attainment percentage required for an outcome to count as attained.

Default:

> 70%

### Minimum Evidence Coverage

The **minimum evidence coverage** is the minimum amount of mapped evidence the learner must attempt before an outcome can count as attained.

Default:

> 70%

### Evidence Selection Policy

When a learner attempts the same item more than once, BrenUp needs to know which attempt represents current performance.

- **Latest**: use the most recent attempt. Best for current ability.
- **Best**: use the highest attempt. Best for mastery and encouragement.
- **First**: use the first attempt. Best for measuring initial performance.

The course default is normally **Latest**. A course item or outcome may use another policy when appropriate.

### Formative Assessment

Formative assessment is continuous practice used during learning.

Examples:

- Lesson activities
- Vocabulary checks
- Small grammar quizzes
- Practice questions
- Short speaking tasks

Formative assessment helps the learner improve while the course is in progress.

### Summative Assessment

Summative assessment measures achievement after a larger part of learning.

Examples:

- Mid-course quiz
- End-of-module quiz
- Final course quiz
- Final speaking or writing assessment

Use summative assessment for important decisions, not every small practice task.

## Recommended Creator Workflow

### Step 1: Plan The Course Outcomes

Before adding lessons, write three to eight course outcomes.

Each outcome should describe one meaningful ability.

Example course: **Everyday English Conversations**

```text
CO1: Learners can introduce themselves and ask basic personal questions.
CO2: Learners can describe daily routines using the present simple.
CO3: Learners can ask for and give directions politely.
CO4: Learners can understand the main idea of short everyday conversations.
CO5: Learners can write a short practical message.
```

Avoid making one outcome cover everything. Separate speaking, grammar, comprehension, and writing when they are meaningfully different.

### Step 2: Add The Course Outcomes

Open the course builder and locate the course outcomes or OBE section.

For each outcome:

1. Add a short code such as `CO1`.
2. Write the outcome statement.
3. Give it a sensible order.
4. Keep the outcome active.
5. Add a mastery override only if this outcome genuinely needs a different threshold.

Use the same course outcome wording throughout the course. Do not create duplicate outcomes with slightly different spelling.

### Step 3: Build The Course Curriculum

Add sections, lessons, and quizzes normally.

Use the course item settings to decide:

- Whether an item is formative or summative
- Its contribution weight
- Its normalization target
- Whether it is required
- Whether it uses a different evidence policy

Suggested starting policy:

```text
Formative: 40%
Summative: 60%
Course mastery threshold: 70%
Minimum evidence coverage: 70%
Evidence policy: Latest attempt
```

These are starting points, not universal rules.

### Step 4: Write Lesson Outcomes

Open the lesson settings or lesson builder outcome section.

Add one outcome per field. Use codes such as `LO1`, `LO2`, and `LO3`.

Example:

```text
LO1: Identify six vocabulary items related to travel.
LO2: Use the present perfect to describe travel experience.
LO3: Ask and answer questions about a previous trip.
```

Keep lesson outcomes measurable. A lesson normally needs two to five outcomes.

### Step 5: Place The Lesson In A Course

A lesson can be reused in more than one course. Its placement belongs to the course.

When placing a lesson, choose:

- Course
- Section
- Position

Then map each lesson outcome to the course outcome it supports.

Example:

```text
Lesson: Travel Experiences
LO1 → CO1: Communicate in everyday situations
LO2 → CO2: Use accurate grammar in communication
LO3 → CO1: Communicate in everyday situations
```

The same lesson may be mapped differently in another course. This is intentional.

### Step 6: Add Activities And Questions

Create activities in the lesson builder as usual. Each scored question should be connected to:

- A lesson outcome, where applicable
- One primary skill or subskill
- Optional learning targets
- Maximum points
- Analytical weight

Examples:

```text
Question: Choose the correct word: “She has ___ to Japan.”
Lesson outcome: LO2
Skill: Grammar → Tense control
Target: Present perfect
Points: 1
Weight: 1
```

```text
Question: Record yourself asking for directions.
Lesson outcome: LO3
Skill: Speaking → Fluency
Target: Asking for directions
Points: 5
Weight: 2
```

### Step 7: Map Quiz Questions

Standalone quiz questions can be measured by skill and learning target. When the quiz is placed inside a course, map the relevant assessment items to course outcomes.

Use direct course-outcome mapping for questions that assess a major course ability.

Do not map every question to every outcome. A question should contribute only where there is a genuine educational relationship.

### Step 8: Choose Formative And Summative Weights

Open the course assessment settings.

Choose the overall category weights. The two values must total 100%.

Example:

```text
Formative: 40%
Summative: 60%
```

Then set each course item’s individual weight.

Example:

```text
Daily vocabulary lesson: Formative, weight 1
Grammar practice quiz: Formative, weight 2
Mid-course assessment: Summative, weight 3
Final course assessment: Summative, weight 5
```

### Step 9: Set Normalization Targets

Different activities may have different raw totals. A lesson with 7 points and a quiz with 20 points can still be compared fairly when normalized.

The default normalization target is 100.

Example:

```text
Raw lesson score: 6 / 8 = 75%
Normalization target: 100
Normalized result: 75 / 100
```

You may use another target when your reporting model requires it, but 100 is easiest for creators and learners to understand.

### Step 10: Check Assessment Readiness

Open `/admin/obe` and review the **Assessment Readiness** audit.

The audit reports active scored items missing:

- Skill mapping
- Learning target mapping
- Outcome mapping

An item may intentionally have no learning target. However, every item that should contribute to a course outcome must be mapped before publishing or assigning the course.

## How BrenUp Calculates Results

### Question score

```text
Question attainment = earned points ÷ maximum points
```

### Activity or item score

The selected responses for the activity or course item are combined and converted to the item’s normalization target.

### Category score

Formative and summative items are calculated separately using their individual item weights.

### Course score

```text
Course score =
  formative score × formative category weight
  + summative score × summative category weight
```

Only categories with attempted evidence contribute to the current attempted score. Missing evidence is shown through coverage rather than silently turning the score into zero.

### Outcome attainment

Mapped questions contribute according to:

- Question points
- Analytical weight
- Course-item weight
- Mapping contribution weight
- Selected evidence policy

An outcome is attained only when both conditions are met:

```text
Attainment >= mastery threshold
Coverage >= minimum evidence coverage
```

## Choosing The Right Policy

### Use Latest when:

- You want current demonstrated ability.
- Learners can retake practice.
- Later performance should replace older performance.

### Use Best when:

- You want to recognize the learner’s strongest demonstrated performance.
- Practice and revision are encouraged.
- A learner should not lose mastery because of one later mistake.

### Use First when:

- You want a baseline measure.
- You are studying improvement from the first attempt.
- The assessment is diagnostic.

## How To Design Good Mappings

### One question, one main skill

Choose one primary skill. Add targets for specific knowledge.

Good:

```text
Primary skill: Grammar → Tense control
Target: Present perfect continuous
```

Avoid assigning five unrelated skills to one simple question.

### Use lesson outcomes for lesson teaching

Lesson outcomes describe what that lesson teaches. Course outcomes describe what the whole course develops.

Do not copy the entire course outcome list into every lesson.

### Use weights intentionally

Give more weight to evidence that genuinely demonstrates the ability. A final speaking assessment may deserve more weight than a one-point vocabulary check.

### Keep coverage honest

Do not create one easy question as the only evidence for a broad outcome. Add enough varied evidence for the learner to demonstrate the ability.

## Formative And Summative Example

Course: **Upper-Intermediate Discussion Skills**

```text
Formative = 40%
Summative = 60%
```

Formative items:

```text
Lesson 1 vocabulary activity: weight 1
Lesson 2 discussion practice: weight 2
Small grammar quiz: weight 1
```

Summative items:

```text
Mid-course speaking assessment: weight 2
Final discussion and writing assessment: weight 4
```

The final assessment matters more, but the learner’s continuous practice still contributes to the course picture.

## What Learners See

Learners can see:

- Overall course score
- Evidence coverage
- Formative and summative performance
- Course Can-Do progress
- Skill confidence
- Learned targets
- Recent answer evidence
- Source links back to a quiz or lesson slide

The learner language profile explains performance without exposing internal database terminology.

## What Creators See

Creators and admins can use:

- Course assessment settings
- Course-item assessment settings
- Lesson outcome editors
- Course outcome mapping
- Question skill and target metadata
- Course outcome reports
- Learner-by-outcome reports
- Assessment readiness audit
- Exportable assessment information

## Common Problems And Fixes

### The outcome is not attained after a high score

Check coverage. The learner may have scored well on one question but attempted too little of the mapped evidence.

### A question does not appear in the language profile

Check that:

1. The question is scored.
2. The learner finalized the attempt.
3. The question has a valid assessment item.
4. The activity or quiz was saved after editing.

### A course score seems lower than expected

Check:

- Formative and summative weights
- Course-item weights
- Normalization targets
- Evidence selection policy
- Whether one category has no attempted evidence

### A lesson is reused in two courses

Map it separately in each course placement. Do not assume one mapping applies everywhere.

### A question was edited after learners attempted it

Historical evidence is preserved. New attempts use the current question version. Do not delete historical assessment records to correct content.

### An item has no target

Not every question needs a learning target. Add one when the question measures a specific word, grammar concept, phrase, sound, or teachable item.

## Publishing Checklist

Before publishing or assigning a course:

- [ ] Course outcomes are written as observable abilities.
- [ ] Every lesson has clear lesson outcomes.
- [ ] Lesson outcomes are mapped to course outcomes for each placement.
- [ ] Scored questions have sensible maximum points.
- [ ] Questions have a primary skill where appropriate.
- [ ] Specific learning targets are added where useful.
- [ ] Formative and summative categories are intentional.
- [ ] Category weights total 100%.
- [ ] Important course items have sensible individual weights.
- [ ] Normalization targets are understood.
- [ ] Mastery threshold is appropriate for the course.
- [ ] Minimum evidence coverage is appropriate.
- [ ] Evidence policy is appropriate.
- [ ] `/admin/obe` readiness audit has been reviewed.
- [ ] A learner test account has completed a sample attempt.
- [ ] Course and outcome reports show the expected result.

## A Simple First Course Recipe

If you are new to OBE, start here:

1. Add three course outcomes.
2. Add two lesson outcomes to each lesson.
3. Map each lesson outcome to one course outcome.
4. Map each scored activity question to one lesson outcome.
5. Add one primary skill to every scored question.
6. Add learning targets only for specific teachable items.
7. Set formative to 40% and summative to 60%.
8. Keep all normalization targets at 100.
9. Use Latest evidence policy.
10. Use 70% mastery and 70% coverage until you have real course data.
11. Test the course with one learner account.
12. Review the language profile and course report.

OBE should make your course clearer, not more complicated. Start with honest outcomes and useful mappings. Add detail only when it helps you understand or improve learner performance.
