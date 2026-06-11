update public.level_test_result_cards
set guidance_text = replace(guidance_text, 'lessons', 'quizzes'),
    updated_at = now()
where guidance_text ilike '%lessons%';

update public.level_test_result_cards
set guidance_text = replace(guidance_text, 'Lessons', 'Quizzes'),
    updated_at = now()
where guidance_text ilike '%Lessons%';
