insert into public.wordverse_words (
  slug, word, pronunciation, word_class, cefr_level, definition, examples,
  collocations, synonyms, antonyms, word_family, grammar_patterns,
  common_mistakes, register, frequency_score, origin, topic_id
)
select
  'conditions', 'conditions', '/kənˈdɪʃənz/', 'noun', 'B1',
  'the rules or requirements that form part of an agreement',
  '["The supplier agreed to the payment conditions."]'::jsonb,
  '["terms and conditions","meet the conditions"]'::jsonb,
  '["terms","requirements"]'::jsonb,
  '["freedom"]'::jsonb,
  '["condition","conditional"]'::jsonb,
  '["conditions for something","under certain conditions"]'::jsonb,
  '["Conditions is plural when referring to several requirements."]'::jsonb,
  'neutral', 94, 'From Latin condicio, agreement or situation', topic.id
from public.wordverse_topics topic
where topic.slug = 'work'
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
select source.id, target.id, 'RELATED', 86
from public.wordverse_words source
join public.wordverse_words target on target.slug = 'conditions'
where source.slug = 'terms'
on conflict (source_word_id, target_word_id, relationship_type)
do update set strength = excluded.strength;
