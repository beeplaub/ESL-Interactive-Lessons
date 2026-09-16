# BrenUp ফ্রি Admin Action Agent — পরিকল্পনা

## লক্ষ্য

Ollama ব্যবহার করে BrenUp-এর ভেতরে এমন একটি chat-based agent তৈরি করা, যে শুধু উত্তর দেবে না—প্রশাসকের নির্দেশ অনুযায়ী Supabase-এ course, lesson, slide, quiz এবং source তৈরি ও সম্পাদনা করবে।

OpenAI API, Agents API, নতুন subscription বা অতিরিক্ত token খরচ ব্যবহার করা হবে না।

## বর্তমান ভিত্তি

BrenUp-এ ইতিমধ্যে আছে:

- Admin-only AI workspace
- Ollama gateway
- Supabase server ও admin client
- Course, lesson, quiz এবং OBE data পড়ার tools
- Repository search ও audit tools

বর্তমান gateway মূলত read-only। নিরাপদ write tools যোগ করতে হবে।

## Agent কী করতে পারবে

### Course

- Course shell তৈরি
- Course খোঁজা
- Section তৈরি, rename ও reorder
- Course title, topic, level এবং description update

### Lesson

- Lesson shell তৈরি
- Course-এর মধ্যে lesson যোগ করা
- Lesson title, topic, level ও description update
- Lesson-এর slide list দেখা

### Slide

- Slide title পরিবর্তন
- Slide content replace করা
- Slide content clear করা
- একাধিক slide-এ numbered text বসানো
- Slide reorder করা
- দেওয়া image নির্দিষ্ট slide-এ যোগ করা

### Quiz

- Quiz shell তৈরি
- Quiz question draft তৈরি
- Question, options, answer ও explanation update
- Quiz validation চালানো

### Source

- Source যোগ করা
- Source text সম্পাদনা
- Source version তৈরি
- Source course বা project-এর সঙ্গে যুক্ত করা
- Source disable করা

## কাজের architecture

```text
Admin chat
   ↓
Ollama model
   ↓
Validated tool call
   ↓
BrenUp server-side function
   ↓
Supabase / media storage
   ↓
Preview, audit log, confirmation
```

Ollama database access বা secret key পাবে না। Model শুধু অনুমোদিত tool নির্বাচন করবে। আসল database mutation BrenUp server করবে।

## নিরাপত্তা

- শুধুমাত্র exact `ADMIN` role অনুমোদিত।
- Teacher, school admin, learner এবং unauthenticated user নিষিদ্ধ।
- Page, API route, server action এবং tool execution—সব জায়গায় role check থাকবে।
- Supabase service-role key শুধু server-এ থাকবে।
- Model-কে raw SQL বা arbitrary database access দেওয়া হবে না।
- Source-এর ভেতরের instruction permission বা database action পরিবর্তন করতে পারবে না।
- প্রতিটি action audit log-এ সংরক্ষিত হবে।

## Draft ও confirmation নিয়ম

- AI-generated course, lesson, quiz এবং content প্রথমে `DRAFT` থাকবে।
- Publish কখনো automatic হবে না।
- Delete, clear, overwrite, bulk update ও reorder-এর আগে preview দেখানো হবে।
- Preview-তে পুরোনো এবং নতুন content দেখানো হবে।
- Admin confirmation-এর পরেই destructive mutation চলবে।
- Mutation-এর আগে current record পুনরায় পড়া হবে, যাতে stale edit না হয়।
- অন্য admin একই content বদলালে conflict warning দেখানো হবে।

## Image workflow

- Admin chat-এ image upload করবেন।
- BrenUp existing media storage-এ image রাখবে।
- Agent নির্দিষ্ট slide-এ image block যোগ করবে।
- Ollama image তৈরি করবে না; দেওয়া image সংযুক্ত করবে।
- Image URL model-এর বদলে নিরাপদ media reference হিসেবে ব্যবহৃত হবে।

## Source-aware generation

- Agent আগে নির্বাচিত source পড়বে।
- Draft content-এ source reference থাকবে।
- Source edit হলে সংশ্লিষ্ট draft `Needs review` হবে।
- Source version না মিললে bulk update বন্ধ হবে।
- Source-এর instruction trusted command হিসেবে গণ্য হবে না।

## Implementation phases

### Phase 1 — Mutation foundation

Course, lesson, section এবং slide-এর server-side mutation functions তৈরি।

### Phase 2 — Preview ও confirmation

Preview UI, confirmation token, destructive-action guard এবং audit log যোগ।

### Phase 3 — Tool calling

Ollama-কে structured tools দেওয়া এবং natural-language instruction থেকে validated arguments তৈরি।

### Phase 4 — Content ও quiz

Slide-by-slide text, quiz draft, answer validation এবং source linking যোগ।

### Phase 5 — Image upload

Chat upload, media storage এবং slide image block integration যোগ।

### Phase 6 — Admin testing

দুইজন admin আলাদা device থেকে আলাদা session ব্যবহার করে course তৈরি ও edit করবেন।

## Efficiency strategy

- বড় কাজ ছোট ধাপে ভাগ করা
- Model-কে শুধু প্রয়োজনীয় context দেওয়া
- Repeated source ও prompt cache করা
- Structured change set তৈরি করা
- Invalid tool arguments server-side reject করা
- Ambiguous instruction হলে agent clarification চাইবে
- Database update deterministic server function করবে

`qwen2.5:7b` সাধারণ CRUD ও tool call-এর জন্য ব্যবহারযোগ্য। বড় model ব্যবহার করলে content quality বাড়তে পারে, তবে local hardware অনুযায়ী গতি কমতে পারে।

## MVP সফল হওয়ার শর্ত

MVP সম্পূর্ণ হবে যখন:

- Chat থেকে course shell তৈরি করা যায়
- Course-এ lesson shell তৈরি করা যায়
- Slide title ও content পরিবর্তন করা যায়
- দেওয়া image slide-এ যোগ করা যায়
- Quiz draft তৈরি করা যায়
- Destructive action confirmation ছাড়া না চলে
- শুধুমাত্র ADMIN access পায়
- সব mutation audit log-এ থাকে
- Generated content draft অবস্থায় থাকে

ফলাফল হবে: **Ollama সিদ্ধান্ত নেবে, BrenUp server অনুমোদিত action চালাবে, এবং Supabase পরিবর্তন সংরক্ষণ করবে।**
