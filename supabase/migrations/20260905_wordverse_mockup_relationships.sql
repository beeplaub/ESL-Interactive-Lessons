-- Add the two validated direct relationships needed to complete the
-- negotiate constellation shown in the Wordverse universe composition.
insert into public.wordverse_relationships (source_word_id, target_word_id, relationship_type, strength)
select source.id, target.id, relationship_type, strength
from (values
  ('negotiate', 'deal', 'RELATED', 84),
  ('negotiate', 'discount', 'RELATED', 68)
) as seed(source_slug, target_slug, relationship_type, strength)
join public.wordverse_words source on source.slug = seed.source_slug
join public.wordverse_words target on target.slug = seed.target_slug
on conflict (source_word_id, target_word_id, relationship_type)
do update set strength = excluded.strength;
