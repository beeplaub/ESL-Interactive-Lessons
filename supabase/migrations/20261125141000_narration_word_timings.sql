-- Persist one-time, locally generated narration word timings beside the source audio.
-- The seed is guarded by the exact source fingerprint so edited audio/scripts are not given stale timings.
alter table public.lesson_audio_files
  add column if not exists word_timings jsonb,
  add column if not exists timing_source_fingerprint text;

alter table public.lesson_audio_files
  drop constraint if exists lesson_audio_files_word_timings_shape_check;

alter table public.lesson_audio_files
  add constraint lesson_audio_files_word_timings_shape_check
  check (
    word_timings is null
    or (
      jsonb_typeof(word_timings) = 'object'
      and jsonb_typeof(word_timings -> 'words') = 'array'
    )
  );

update public.lesson_audio_files as audio
set word_timings = '{"version":1,"durationSeconds":61.72,"words":[{"word":"Hello","start":0.24,"end":0.98},{"word":"and","start":1.22,"end":1.34},{"word":"welcome.","start":1.561,"end":2.161},{"word":"It''s","start":2.741,"end":2.921},{"word":"so","start":3.081,"end":3.361},{"word":"good","start":3.541,"end":3.841},{"word":"to","start":3.941,"end":4.061},{"word":"see","start":4.241,"end":4.501},{"word":"you","start":4.541,"end":4.702},{"word":"here!","start":4.782,"end":5.082},{"word":"Before","start":6.302,"end":6.842},{"word":"we","start":6.942,"end":7.162},{"word":"learn","start":7.262,"end":7.642},{"word":"a","start":7.863,"end":7.903},{"word":"single","start":8.143,"end":8.643},{"word":"sound,","start":8.803,"end":9.223},{"word":"before","start":9.863,"end":10.243},{"word":"we","start":10.323,"end":10.483},{"word":"touch","start":10.543,"end":10.904},{"word":"a","start":11.064,"end":11.104},{"word":"single","start":11.284,"end":11.724},{"word":"vowel","start":11.864,"end":12.604},{"word":"or","start":12.724,"end":12.824},{"word":"consonant,","start":12.964,"end":13.644},{"word":"we","start":14.385,"end":14.645},{"word":"need","start":14.745,"end":15.045},{"word":"to","start":15.105,"end":15.225},{"word":"build","start":15.325,"end":15.665},{"word":"the","start":15.725,"end":15.825},{"word":"foundation","start":15.905,"end":16.825},{"word":"that","start":17.226,"end":17.386},{"word":"everything","start":17.746,"end":18.306},{"word":"else","start":18.506,"end":18.706},{"word":"in","start":18.846,"end":18.946},{"word":"this","start":19.046,"end":19.266},{"word":"course","start":19.406,"end":19.786},{"word":"will","start":19.946,"end":20.127},{"word":"sit","start":20.207,"end":20.387},{"word":"on.","start":20.527,"end":20.627},{"word":"And","start":21.507,"end":21.607},{"word":"that","start":21.667,"end":21.887},{"word":"foundation","start":21.967,"end":22.547},{"word":"is","start":22.707,"end":22.787},{"word":"not","start":23.027,"end":23.328},{"word":"in","start":23.508,"end":23.588},{"word":"your","start":23.628,"end":23.808},{"word":"mouth.","start":23.908,"end":24.248},{"word":"It","start":25.008,"end":25.068},{"word":"is","start":25.128,"end":25.208},{"word":"not","start":25.308,"end":25.528},{"word":"in","start":25.568,"end":25.628},{"word":"your","start":25.648,"end":25.808},{"word":"tongue","start":25.908,"end":26.489},{"word":"or","start":26.709,"end":26.769},{"word":"your","start":26.809,"end":26.989},{"word":"lips","start":27.149,"end":27.549},{"word":"or","start":27.789,"end":27.849},{"word":"your","start":27.889,"end":28.049},{"word":"breath.","start":28.149,"end":28.569},{"word":"It","start":29.71,"end":29.81},{"word":"is","start":30.03,"end":30.13},{"word":"in","start":30.31,"end":30.41},{"word":"your","start":30.47,"end":30.69},{"word":"mind.","start":30.89,"end":31.37},{"word":"So","start":32.491,"end":32.651},{"word":"welcome.","start":32.871,"end":33.351},{"word":"Welcome","start":34.111,"end":34.551},{"word":"to","start":34.591,"end":34.671},{"word":"the","start":34.711,"end":34.811},{"word":"most","start":35.011,"end":35.311},{"word":"important","start":35.471,"end":36.192},{"word":"lesson","start":36.332,"end":36.692},{"word":"of","start":36.812,"end":36.872},{"word":"this","start":36.912,"end":37.072},{"word":"entire","start":37.192,"end":37.912},{"word":"course.","start":38.032,"end":38.412},{"word":"This","start":39.313,"end":39.553},{"word":"is","start":39.853,"end":39.993},{"word":"The","start":40.373,"end":40.493},{"word":"Mindset.","start":40.693,"end":41.413},{"word":"And","start":42.214,"end":42.294},{"word":"by","start":42.334,"end":42.454},{"word":"the","start":42.494,"end":42.594},{"word":"time","start":42.634,"end":42.914},{"word":"this","start":42.994,"end":43.174},{"word":"lesson","start":43.274,"end":43.554},{"word":"is","start":43.614,"end":43.674},{"word":"over,","start":43.894,"end":44.154},{"word":"you","start":44.614,"end":44.755},{"word":"will","start":44.795,"end":44.955},{"word":"have","start":45.015,"end":45.195},{"word":"a","start":45.315,"end":45.355},{"word":"completely","start":45.435,"end":46.295},{"word":"new","start":46.495,"end":46.735},{"word":"way","start":46.815,"end":47.075},{"word":"of","start":47.175,"end":47.235},{"word":"seeing","start":47.355,"end":47.695},{"word":"yourself","start":47.715,"end":48.116},{"word":"not","start":48.756,"end":48.916},{"word":"as","start":48.976,"end":49.016},{"word":"someone","start":49.096,"end":49.376},{"word":"who","start":49.416,"end":49.556},{"word":"struggles","start":49.676,"end":50.236},{"word":"with","start":50.296,"end":50.436},{"word":"pronunciation,","start":50.476,"end":51.217},{"word":"but","start":51.717,"end":51.837},{"word":"as","start":51.877,"end":51.937},{"word":"someone","start":52.057,"end":52.397},{"word":"who","start":52.457,"end":52.617},{"word":"is","start":52.757,"end":52.837},{"word":"building","start":53.097,"end":53.577},{"word":"it.","start":53.657,"end":53.717},{"word":"Deliberately.","start":54.418,"end":55.258},{"word":"Powerfully.","start":55.918,"end":56.718},{"word":"One","start":57.619,"end":57.799},{"word":"step","start":58.119,"end":58.439},{"word":"at","start":58.619,"end":58.699},{"word":"a","start":58.739,"end":58.759},{"word":"time.","start":58.839,"end":59.179},{"word":"Let","start":60.6,"end":60.78},{"word":"us","start":60.84,"end":60.94},{"word":"begin.","start":61.04,"end":61.32}]}'::jsonb,
    timing_source_fingerprint = '57e63acebfa98cbdbdeb7637a74f3726'
where audio.id in (
  select candidate.id
  from public.lesson_audio_files as candidate
  join public.lessons as lesson on lesson.id = candidate.lesson_id
  join public.slides as slide on slide.id = candidate.slide_id and slide.lesson_id = lesson.id
  where lesson.title = 'Lesson 0.1: The Mindset'
    and slide.slide_number = 1
    and slide.title = 'Start With Your Mind'
    and candidate.label = 'narration'
    and candidate.storage_path = 'ai-recordings/voiceovers/fab99c28-0901-4159-877c-f56834c7833f/saved/1786936598740-slide-narration.opus'
    and md5(candidate.transcript) = '62628eb8719252901b68302a4056d9e0'
)
  and audio.label = 'narration'
  and md5(concat_ws(E'\n', coalesce(audio.storage_provider, ''), coalesce(audio.storage_bucket, ''), coalesce(audio.storage_path, ''), coalesce(audio.external_url, ''), coalesce(audio.transcript, ''))) = '57e63acebfa98cbdbdeb7637a74f3726';
