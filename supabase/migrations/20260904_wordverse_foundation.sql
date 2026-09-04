create table if not exists public.wordverse_topics (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  color text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.wordverse_words (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  word text not null,
  pronunciation text,
  word_class text,
  cefr_level text,
  definition text not null,
  translation text,
  examples jsonb not null default '[]'::jsonb,
  collocations jsonb not null default '[]'::jsonb,
  synonyms jsonb not null default '[]'::jsonb,
  antonyms jsonb not null default '[]'::jsonb,
  word_family jsonb not null default '[]'::jsonb,
  grammar_patterns jsonb not null default '[]'::jsonb,
  common_mistakes jsonb not null default '[]'::jsonb,
  register text,
  frequency_score integer not null default 50 check (frequency_score between 0 and 100),
  origin text,
  audio_url text,
  topic_id uuid references public.wordverse_topics(id) on delete set null,
  status text not null default 'PUBLISHED' check (status in ('DRAFT', 'PUBLISHED', 'ARCHIVED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wordverse_relationships (
  id uuid primary key default gen_random_uuid(),
  source_word_id uuid not null references public.wordverse_words(id) on delete cascade,
  target_word_id uuid not null references public.wordverse_words(id) on delete cascade,
  relationship_type text not null check (relationship_type in ('SYNONYM', 'ANTONYM', 'WORD_FAMILY', 'COLLOCATION', 'RELATED', 'GRAMMAR')),
  strength integer not null default 50 check (strength between 0 and 100),
  created_at timestamptz not null default now(),
  unique (source_word_id, target_word_id, relationship_type),
  check (source_word_id <> target_word_id)
);

create table if not exists public.wordverse_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  word_id uuid not null references public.wordverse_words(id) on delete cascade,
  state text not null default 'DISCOVERED' check (state in ('DISCOVERED', 'LEARNING', 'FAMILIAR', 'MASTERED', 'REVIEW_DUE')),
  saved boolean not null default false,
  confidence integer check (confidence between 1 and 5),
  view_count integer not null default 0,
  practice_count integer not null default 0,
  correct_count integer not null default 0,
  last_viewed_at timestamptz,
  next_review_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, word_id)
);

create index if not exists wordverse_words_topic_idx on public.wordverse_words(topic_id);
create index if not exists wordverse_words_level_idx on public.wordverse_words(cefr_level);
create index if not exists wordverse_words_status_idx on public.wordverse_words(status);
create index if not exists wordverse_relationships_source_idx on public.wordverse_relationships(source_word_id);
create index if not exists wordverse_relationships_target_idx on public.wordverse_relationships(target_word_id);
create index if not exists wordverse_progress_user_idx on public.wordverse_progress(user_id);

drop trigger if exists wordverse_words_touch_updated_at on public.wordverse_words;
create trigger wordverse_words_touch_updated_at before update on public.wordverse_words
for each row execute function public.touch_updated_at();

drop trigger if exists wordverse_progress_touch_updated_at on public.wordverse_progress;
create trigger wordverse_progress_touch_updated_at before update on public.wordverse_progress
for each row execute function public.touch_updated_at();

alter table public.wordverse_topics enable row level security;
alter table public.wordverse_words enable row level security;
alter table public.wordverse_relationships enable row level security;
alter table public.wordverse_progress enable row level security;

revoke all on table public.wordverse_topics, public.wordverse_words, public.wordverse_relationships, public.wordverse_progress from anon;
revoke all on table public.wordverse_topics, public.wordverse_words, public.wordverse_relationships, public.wordverse_progress from authenticated;
grant select on table public.wordverse_topics, public.wordverse_words, public.wordverse_relationships to authenticated;
grant select, insert, update, delete on table public.wordverse_progress to authenticated;

drop policy if exists "Authenticated learners read Wordverse topics" on public.wordverse_topics;
create policy "Authenticated learners read Wordverse topics" on public.wordverse_topics
for select to authenticated using (true);

drop policy if exists "Authenticated learners read published Wordverse words" on public.wordverse_words;
create policy "Authenticated learners read published Wordverse words" on public.wordverse_words
for select to authenticated using (status = 'PUBLISHED');

drop policy if exists "Authenticated learners read Wordverse relationships" on public.wordverse_relationships;
create policy "Authenticated learners read Wordverse relationships" on public.wordverse_relationships
for select to authenticated using (
  exists (select 1 from public.wordverse_words w where w.id = source_word_id and w.status = 'PUBLISHED')
  and exists (select 1 from public.wordverse_words w where w.id = target_word_id and w.status = 'PUBLISHED')
);

drop policy if exists "Learners manage their own Wordverse progress" on public.wordverse_progress;
create policy "Learners manage their own Wordverse progress" on public.wordverse_progress
for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

insert into public.wordverse_topics (slug, name, color, position) values
  ('communication', 'Communication', '#5ee7ff', 1),
  ('work', 'Work & Business', '#b28cff', 2),
  ('travel', 'Travel & Movement', '#78e08f', 3),
  ('society', 'Society & Ideas', '#ffc857', 4)
on conflict (slug) do update set name = excluded.name, color = excluded.color, position = excluded.position;

insert into public.wordverse_words (slug, word, pronunciation, word_class, cefr_level, definition, examples, collocations, synonyms, antonyms, word_family, grammar_patterns, common_mistakes, register, frequency_score, origin, topic_id)
select v.slug, v.word, v.pronunciation, v.word_class, v.cefr_level, v.definition, v.examples::jsonb, v.collocations::jsonb, v.synonyms::jsonb, v.antonyms::jsonb, v.word_family::jsonb, v.grammar_patterns::jsonb, v.common_mistakes::jsonb, v.register, v.frequency_score, v.origin, t.id
from (values
  ('negotiate','negotiate','/nɪˈɡəʊʃieɪt/','verb','B1','to discuss something in order to reach an agreement','["They negotiated a better price."]','["negotiate a deal","negotiate terms","negotiate a salary"]','["discuss","bargain"]','["impose"]','["negotiation","negotiator","negotiable"]','["negotiate + noun","negotiate with someone"]','["Do not use negotiate when you only mean talk."]','neutral',78,'From Latin negotiari, to carry on business','work',1),
  ('discuss','discuss','/dɪˈskʌs/','verb','A2','to talk about something with another person or group','["We discussed the plan after lunch."]','["discuss a problem","discuss an idea"]','["talk about","consider"]','["ignore"]','["discussion","discussant"]','["discuss + noun"]','["Do not say discuss about something."]','neutral',92,'From Latin discutere, to shake apart','communication',2),
  ('bargain','bargain','/ˈbɑːɡən/','noun','B1','something bought for less than its usual price','["This coat was a real bargain."]','["a real bargain","bargain price"]','["deal","value"]','["rip-off"]','["bargain","bargain-hunter"]','["a bargain"]','["Bargain can also be a verb meaning negotiate a price."]','informal',65,'From Old French bargaignier, to haggle','travel',3),
  ('agreement','agreement','/əˈɡriːmənt/','noun','B1','a shared decision or arrangement','["They reached an agreement."]','["reach an agreement","in agreement"]','["accord","understanding"]','["disagreement"]','["agree","agreeable","disagree"]','["agreement between people"]','["Agreement is usually uncountable when it means shared opinion."]','neutral',84,'From agree plus -ment','communication',4),
  ('contract','contract','/ˈkɒntrækt/','noun','B1','a formal written or spoken agreement','["Please read the contract carefully."]','["sign a contract","employment contract"]','["agreement","deal"]','["informal promise"]','["contractual","contractor"]','["a contract with someone"]','["The noun is CONtract; the verb is conTRACT."]','formal',76,'From Latin contractus, drawn together','work',5),
  ('price','price','/praɪs/','noun','A2','the amount of money needed to buy something','["The price includes delivery."]','["reasonable price","price range"]','["cost","value"]','["free"]','["priceless","pricing"]','["the price of something"]','["Price and cost are related but not always interchangeable."]','neutral',96,'From Old French pris, value','travel',6),
  ('deal','deal','/diːl/','noun','A2','an agreement or arrangement, especially in business','["They made a deal with the supplier."]','["make a deal","great deal"]','["agreement","bargain"]','["refusal"]','["dealer","dealership"]','["deal with something"]','["A great deal can also mean a lot."]','neutral',95,'From Old English dǣlan, to divide','work',7),
  ('terms','terms','/tɜːmz/','noun','B1','the conditions of an agreement','["Both sides accepted the terms."]','["terms and conditions","agree to terms"]','["conditions","rules"]','["freedom"]','["term","terminate"]','["on good terms"]','["Terms is usually plural in this meaning."]','formal',73,'From Old French terme, limit','work',8),
  ('discount','discount','/ˈdɪskaʊnt/','noun','A2','a reduction in the usual price','["Students get a ten percent discount."]','["offer a discount","discount rate"]','["reduction","saving"]','["surcharge"]','["discounted"]','["a discount on something"]','["The noun is DIScount; the verb is disCOUNT."]','neutral',82,'From Italian disconto, deduction','travel',9),
  ('journey','journey','/ˈdʒɜːni/','noun','A2','an act of travelling from one place to another','["The journey took three hours."]','["long journey","journey home"]','["trip","voyage"]','["stay"]','["journeying"]','["go on a journey"]','["Journey emphasizes the travel, not only the destination."]','neutral',88,'From Old French journée, a day’s length','travel',10),
  ('schedule','schedule','/ˈʃedjuːl/','noun','A2','a plan that shows when things will happen','["Check the train schedule."]','["busy schedule","schedule a meeting"]','["timetable","plan"]','["randomness"]','["scheduled"]','["schedule something for a time"]','["Pronunciation varies between British and American English."]','neutral',90,'From Greek skhedios, temporary','travel',11),
  ('platform','platform','/ˈplætfɔːm/','noun','A2','the raised area beside a railway track where passengers wait','["The train leaves from platform six."]','["train platform","online platform"]','["stage","base"]','["ground"]','["platform-based"]','["on a platform"]','["Platform has both physical and digital meanings."]','neutral',87,'From French plateforme, flat form','travel',12),
  ('improve','improve','/ɪmˈpruːv/','verb','A2','to become better or make something better','["Practice will improve your English."]','["improve skills","improve performance"]','["develop","enhance"]','["worsen"]','["improvement","improved"]','["improve something"]','["Improve is normally followed by an object when something is made better."]','neutral',94,'From Anglo-French enprouer, to turn to profit','society',13),
  ('confidence','confidence','/ˈkɒnfɪdəns/','noun','B1','the feeling that you can do something successfully','["Speaking practice built her confidence."]','["build confidence","confidence level"]','["assurance","belief"]','["doubt"]','["confident","confidently"]','["confidence in something"]','["Confidence is not the same as certainty."]','neutral',85,'From Latin confidentia, firm trust','communication',14),
  ('reason','reason','/ˈriːzən/','noun','A2','a cause or explanation for something','["What is the reason for the delay?"]','["main reason","for this reason"]','["cause","purpose"]','["result"]','["reasonable","reasonably"]','["reason why"]','["Reason can mean both explanation and ability to think."]','neutral',97,'From Latin ratio, calculation','society',15),
  ('response','response','/rɪˈspɒns/','noun','B1','something said or done as a reply','["We received a quick response."]','["quick response","response to a question"]','["reply","answer"]','["question"]','["respond","responsive"]','["response to something"]','["Response is more formal than reply."]','formal',86,'From Latin respondere, to answer','communication',16)
) as v(slug, word, pronunciation, word_class, cefr_level, definition, examples, collocations, synonyms, antonyms, word_family, grammar_patterns, common_mistakes, register, frequency_score, origin, topic_slug, position)
join public.wordverse_topics t on t.slug = v.topic_slug
on conflict (slug) do update set
  word = excluded.word,
  pronunciation = excluded.pronunciation,
  word_class = excluded.word_class,
  cefr_level = excluded.cefr_level,
  definition = excluded.definition,
  examples = excluded.examples,
  collocations = excluded.collocations,
  synonyms = excluded.synonyms,
  antonyms = excluded.antonyms,
  word_family = excluded.word_family,
  grammar_patterns = excluded.grammar_patterns,
  common_mistakes = excluded.common_mistakes,
  register = excluded.register,
  frequency_score = excluded.frequency_score,
  origin = excluded.origin,
  topic_id = excluded.topic_id,
  updated_at = now();

insert into public.wordverse_relationships (source_word_id, target_word_id, relationship_type, strength)
select source.id, target.id, r.relationship_type, r.strength
from (values
  ('negotiate','discuss','RELATED',75), ('negotiate','bargain','RELATED',88), ('negotiate','agreement','RELATED',92), ('negotiate','contract','RELATED',82), ('negotiate','terms','COLLOCATION',88), ('negotiate','price','COLLOCATION',78),
  ('deal','agreement','SYNONYM',92), ('deal','bargain','SYNONYM',72), ('deal','contract','RELATED',76), ('deal','price','RELATED',65), ('contract','agreement','RELATED',90), ('contract','terms','COLLOCATION',92), ('discount','price','RELATED',90), ('discount','bargain','RELATED',86), ('journey','platform','RELATED',78), ('journey','schedule','RELATED',80), ('price','value','RELATED',70), ('improve','confidence','RELATED',66), ('reason','response','RELATED',55)
) as r(source_slug, target_slug, relationship_type, strength)
join public.wordverse_words source on source.slug = r.source_slug
join public.wordverse_words target on target.slug = r.target_slug
on conflict (source_word_id, target_word_id, relationship_type) do update set strength = excluded.strength;
