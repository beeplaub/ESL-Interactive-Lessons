-- Persist syllable boundaries, syllable counts, and lexical stress per accent.
-- IPA remains the source of truth; Cambridge-style dots and stress marks are parsed automatically.

alter table public.ipa_chart_word_pronunciations
  add column if not exists syllable_data jsonb;

create or replace function public.parse_ipa_syllable_data(input_ipa text)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  ipa_variant text;
  syllable_parts text[];
  syllable_part text;
  clean_ipa text;
  stress_name text;
  syllables_json jsonb;
  variants_json jsonb := '[]'::jsonb;
  variant_count integer := 0;
  syllable_count integer;
  variant_status text;
  overall_status text := 'parsed';
  index_value integer;
begin
  if input_ipa is null or btrim(input_ipa) = '' then
    return jsonb_build_object(
      'version', 1,
      'source', 'ipa_syllable_and_stress_marks',
      'status', 'needs_syllable_boundaries',
      'variants', '[]'::jsonb
    );
  end if;

  for ipa_variant in
    select btrim(split.part, '() /')
    from regexp_split_to_table(input_ipa, '\s+(or|also)\s+') as split(part)
  loop
    if ipa_variant = '' then
      continue;
    end if;

    variant_count := variant_count + 1;
    syllable_parts := regexp_split_to_array(ipa_variant, '\.');
    syllables_json := '[]'::jsonb;
    variant_status := 'parsed';

    if cardinality(syllable_parts) = 1 and ipa_variant ~ '[ˈˌ]' then
      if left(ipa_variant, 1) in ('ˈ', 'ˌ') and regexp_count(ipa_variant, '[ˈˌ]') = 1 then
        variant_status := 'needs_syllable_boundaries';
        overall_status := 'needs_syllable_boundaries';
        variants_json := variants_json || jsonb_build_array(jsonb_build_object(
          'ipa', ipa_variant,
          'syllableCount', null,
          'syllableClass', null,
          'syllables', syllables_json,
          'status', variant_status
        ));
        continue;
      end if;

      syllable_parts := regexp_split_to_array(ipa_variant, '(?=[ˈˌ])');
      if cardinality(syllable_parts) > 1 and syllable_parts[1] = '' then
        syllable_parts := syllable_parts[2:cardinality(syllable_parts)];
      end if;
    end if;

    for index_value in 1..cardinality(syllable_parts) loop
      syllable_part := btrim(syllable_parts[index_value]);
      if syllable_part = '' then
        variant_status := 'needs_syllable_boundaries';
        overall_status := 'needs_syllable_boundaries';
        continue;
      end if;

      if left(syllable_part, 1) = 'ˈ' then
        stress_name := 'primary';
        clean_ipa := substr(syllable_part, 2);
      elsif left(syllable_part, 1) = 'ˌ' then
        stress_name := 'secondary';
        clean_ipa := substr(syllable_part, 2);
      else
        stress_name := case when cardinality(syllable_parts) = 1 then 'not_marked' else 'unstressed' end;
        clean_ipa := syllable_part;
      end if;

      syllables_json := syllables_json || jsonb_build_array(jsonb_build_object(
        'ipa', clean_ipa,
        'stress', stress_name
      ));
    end loop;

    syllable_count := jsonb_array_length(syllables_json);
    variants_json := variants_json || jsonb_build_array(jsonb_build_object(
      'ipa', ipa_variant,
      'syllableCount', case when variant_status = 'parsed' then syllable_count else null end,
      'syllableClass', case
        when variant_status <> 'parsed' then null
        when syllable_count = 1 then 'mono'
        when syllable_count = 2 then 'di'
        when syllable_count = 3 then 'tri'
        else 'poly'
      end,
      'syllables', syllables_json,
      'status', variant_status
    ));
  end loop;

  if variant_count = 0 then
    overall_status := 'needs_syllable_boundaries';
  end if;

  return jsonb_build_object(
    'version', 1,
    'source', 'ipa_syllable_and_stress_marks',
    'status', overall_status,
    'variants', variants_json
  );
end;
$$;

revoke all on function public.parse_ipa_syllable_data(text) from public, anon, authenticated;
grant execute on function public.parse_ipa_syllable_data(text) to service_role;

create or replace function public.refresh_ipa_word_syllable_data()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.syllable_data := public.parse_ipa_syllable_data(new.ipa);
  return new;
end;
$$;

revoke all on function public.refresh_ipa_word_syllable_data() from public, anon, authenticated;
grant execute on function public.refresh_ipa_word_syllable_data() to service_role;

drop trigger if exists ipa_word_pronunciation_syllable_data on public.ipa_chart_word_pronunciations;
create trigger ipa_word_pronunciation_syllable_data
  before insert or update of ipa on public.ipa_chart_word_pronunciations
  for each row
  execute function public.refresh_ipa_word_syllable_data();

update public.ipa_chart_word_pronunciations
set syllable_data = public.parse_ipa_syllable_data(ipa)
where syllable_data is distinct from public.parse_ipa_syllable_data(ipa);
