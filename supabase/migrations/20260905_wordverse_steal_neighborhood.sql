-- Remove the unconnected singular duplicate from the published universe.
update public.wordverse_words
set status = 'ARCHIVED', updated_at = now()
where slug = 'condition'
  and not exists (
    select 1 from public.wordverse_relationships r
    where r.source_word_id = wordverse_words.id
       or r.target_word_id = wordverse_words.id
  );

-- Complete the live neighborhood for "steal" without introducing
-- decorative or unrelated nodes.
insert into public.wordverse_relationships (source_word_id, target_word_id, relationship_type, strength)
select source.id, target.id, seed.relationship_type, seed.strength
from (values
  ('steal','bargain','SYNONYM',88),
  ('steal','deal','SYNONYM',78),
  ('steal','discount','RELATED',76),
  ('steal','price','RELATED',72),
  ('steal','offer','RELATED',70),
  ('steal','negotiation','RELATED',55),
  ('steal','trade','RELATED',52)
) as seed(source_slug, target_slug, relationship_type, strength)
join public.wordverse_words source on source.slug = seed.source_slug and source.status = 'PUBLISHED'
join public.wordverse_words target on target.slug = seed.target_slug and target.status = 'PUBLISHED'
on conflict (source_word_id, target_word_id, relationship_type)
do update set strength = excluded.strength;
