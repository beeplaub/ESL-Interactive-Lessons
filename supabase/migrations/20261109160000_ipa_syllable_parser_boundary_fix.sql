-- Split a syllable at explicit IPA dots and at stress marks that identify
-- syllable onsets (for example, ˌɑːf.təˈnuːn -> ɑːf / tə / nuːn).
-- Ambiguous no-dot transcriptions ending in schwa are flagged for review.

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
  ipa_character text;
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
    syllable_parts := array[]::text[];
    syllable_part := '';
    syllables_json := '[]'::jsonb;
    variant_status := 'parsed';

    for index_value in 1..char_length(ipa_variant) loop
      ipa_character := substr(ipa_variant, index_value, 1);

      if ipa_character = '.' or (ipa_character in ('ˈ', 'ˌ') and syllable_part <> '') then
        if syllable_part = '' then
          variant_status := 'needs_syllable_boundaries';
        else
          syllable_parts := array_append(syllable_parts, syllable_part);
        end if;
        syllable_part := case when ipa_character = '.' then '' else ipa_character end;
      else
        syllable_part := syllable_part || ipa_character;
      end if;
    end loop;

    if syllable_part = '' then
      variant_status := 'needs_syllable_boundaries';
    else
      syllable_parts := array_append(syllable_parts, syllable_part);
    end if;

    -- Stress markers alone cannot reliably reveal all syllable boundaries.
    -- Keep a documented disyllabic form with one internal stress mark parsable,
    -- but flag forms like bəˈnɑːnə where final schwa indicates another syllable.
    if position('.' in ipa_variant) = 0 and ipa_variant ~ '[ˈˌ].*ə$' then
      variant_status := 'needs_syllable_boundaries';
    elsif position('.' in ipa_variant) = 0
      and left(ipa_variant, 1) in ('ˈ', 'ˌ')
      and regexp_count(ipa_variant, '[ˈˌ]') = 1 then
      variant_status := 'needs_syllable_boundaries';
    end if;

    if variant_status <> 'parsed' then
      overall_status := 'needs_syllable_boundaries';
    end if;

    for index_value in 1..coalesce(cardinality(syllable_parts), 0) loop
      syllable_part := syllable_parts[index_value];
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

update public.ipa_chart_word_pronunciations
set syllable_data = public.parse_ipa_syllable_data(ipa)
where syllable_data is distinct from public.parse_ipa_syllable_data(ipa);
