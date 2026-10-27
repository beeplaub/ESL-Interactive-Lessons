import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveMediaUrl } from "@/lib/storage/mediaStorage";
import { roomAccess } from "@/lib/instant-live/server";
import { getFreshProfile, isPlatformAdmin } from "@/lib/auth";
import { questionScore, questionTotal, type ScoredQuestion } from "@/lib/quizScoring";

const selection = z.object({kind:z.enum(["lesson","quiz"]), id:z.string().uuid(), index:z.number().int().min(0).max(999), reveal:z.boolean().default(false), tab:z.enum(["learn","practice"]).optional(), activityId:z.string().uuid().optional()});
const action = z.discriminatedUnion("action",[
  z.object({action:z.literal("show"), selection, session:z.string().uuid(), revision:z.number().int().nonnegative()}),
  z.object({action:z.literal("practice"), activityId:z.string().uuid(), answers:z.record(z.unknown())}),
  z.object({action:z.literal("answer"), questionId:z.string().uuid(), answer:z.unknown()}),
]);
const fail=(error:string,status=400)=>NextResponse.json({error},{status});
const json=(value:unknown)=>NextResponse.json(value,{headers:{"Cache-Control":"private, no-store"}});
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}) {
  const {id}=await params, access=await roomAccess(id);
  if(access.error)return access.error;
  const {admin,creator,user}=access;
  if(new URL(request.url).searchParams.has("catalog")) {
    if(!creator)return fail("Only the teacher can choose content.",403);
    const isAdmin=isPlatformAdmin((await getFreshProfile(user.id))?.role);
    const query=(table:string)=>{let q=admin.from(table).select("id,title,level,topic").eq("status","PUBLISHED").order("title").limit(200); if(!isAdmin)q=q.eq("created_by",user.id);return q;};
    const [lessons,quizzes]=await Promise.all([query("lessons"),query("quizzes")]);
    if(lessons.error||quizzes.error)return fail("Could not load published content.",503);
    return json({lessons:lessons.data,quizzes:quizzes.data});
  }
  const {data:state,error}=await admin.from("instant_live_state").select("stage,content,revision").eq("room_id",id).single();
  if(error)return fail("Live content needs the new classroom SQL migration.",503);
  const chosen=selection.safeParse(state.content);
  if(state.stage!=="content"||!chosen.success)return json({selection:null});
  const current=chosen.data;
  // Only deliver the teacher's active content; never accept a learner-supplied ID.
  const {data:source}=await admin.from(current.kind==="lesson"?"lessons":"quizzes").select("id,title,status").eq("id",current.id).eq("status","PUBLISHED").maybeSingle();
  if(!source)return fail("This content is no longer published.",404);
  if(current.kind==="lesson") {
    const audioId = new URL(request.url).searchParams.get("audio");
    if (audioId) {
      if (!z.string().uuid().safeParse(audioId).success) return fail("Invalid narration.");
      const {data:audio} = await admin.from("lesson_audio_files").select("storage_path,storage_provider,storage_bucket,public_url,external_url").eq("id",audioId).eq("lesson_id",current.id).eq("label","narration").maybeSingle();
      if (!audio) return fail("Narration is unavailable.",404);
      try {
        const url = audio.external_url || await resolveMediaUrl(admin,{provider:audio.storage_provider,bucket:audio.storage_bucket ?? "lesson-audio",path:audio.storage_path,publicUrl:audio.public_url});
        if (!url) return fail("Narration is unavailable.",404);
        const response = NextResponse.redirect(new URL(url, request.url),307);
        response.headers.set("Cache-Control","private, no-store");
        return response;
      } catch { return fail("Could not load narration.",503); }
    }
    const [lessonResult, slideResult, blocks, activities, audioFiles, responses] = await Promise.all([
      admin.from("lessons").select("id,title,topic,level,timer_minutes").eq("id",current.id).single(),
      admin.from("slides").select("id,title,slide_number,section_label,content_order,require_practice_before_learn").eq("lesson_id",current.id).is("deleted_at",null).order("slide_number"),
      admin.from("lesson_blocks").select("id,slide_id,position,block_type,content").eq("lesson_id",current.id).order("position"),
      admin.from("lesson_slide_activities").select("id,slide_id,slide_number,activity_type,activity_data").eq("lesson_id",current.id).is("deleted_at",null).order("slide_number").order("position",{ascending:true,nullsFirst:false}).order("created_at"),
      admin.from("lesson_audio_files").select("id,slide_id,linked_slide_number,storage_path,storage_provider,storage_bucket,public_url,external_url,source_type,translation_enabled,narration_language,transcript,glossary").eq("lesson_id",current.id).eq("label","narration"),
      admin.from("instant_live_activity_responses").select("activity_id,answers").eq("room_id",id).eq("user_id",user.id),
    ]);
    if ([lessonResult, slideResult, blocks, activities, audioFiles, responses].some(result => result.error)) return fail("Could not load the complete lesson player. Please try again.",503);
    const slides = slideResult.data ?? [];
    if (!slides[current.index]) return fail("This slide is unavailable.",404);
    const narrationMap: Record<string,string> = {};
    const narrationConfigMap: Record<string,unknown> = {};
    for (const audio of audioFiles.data ?? []) {
      const slideId = audio.slide_id ?? slides.find(slide => slide.slide_number === audio.linked_slide_number)?.id;
      if (!slideId) continue;
      // Stable per-file URL: tab changes must not reload/restart the audio. The
      // authenticated redirect resolves fresh signed media URLs when played.
      narrationMap[slideId] = audio.external_url || `/api/instant-live/rooms/${id}/content?audio=${audio.id}`;
      narrationConfigMap[slideId] = {translationEnabled:Boolean(audio.translation_enabled),narrationLanguage:audio.narration_language === "bn" ? "bn" : "en",sourceType:audio.source_type === "LINK" ? "LINK" : audio.source_type === "UPLOADED" ? "UPLOADED" : "RECORDED",transcript:audio.transcript || "",glossary:Array.isArray(audio.glossary) ? audio.glossary : []};
    }
    const learnerActivities = (activities.data ?? []).map(activity => {
      if (!activity.activity_data || typeof activity.activity_data !== "object" || Array.isArray(activity.activity_data)) return activity;
      const {ai_instruction: _privateInstruction, ...learnerData} = activity.activity_data;
      return {...activity,activity_data:learnerData};
    });
    return json({selection:current,title:source.title,total:slides.length,revision:state.revision,viewerKey:`${id}:${user.id}`,responses:responses.data,lessonPlayer:{lesson:lessonResult.data,slides,blocks:blocks.data,activities:learnerActivities,narrationMap,narrationConfigMap}});
  }

  const [{data:quiz,error:quizError},{data:questions,error:questionError}] = await Promise.all([
    admin.from("quizzes").select("id,title,level,topic,timer_minutes").eq("id",current.id).single(),
    admin.from("quiz_questions").select("*").eq("quiz_id",current.id).order("question_number"),
  ]);
  if(quizError||questionError||!quiz||!questions?.length)return fail("This quiz is unavailable.",404);
  const questionIds=questions.map(question=>question.id);
  const [{data:assessmentItems},{data:attempts}] = await Promise.all([
    admin.from("assessment_items").select("quiz_question_id,max_points").in("quiz_question_id",questionIds),
    admin.from("quiz_attempts").select("id,score,total,answers,completed_at,status,grading_source").eq("quiz_id",current.id).eq("user_id",user.id).order("completed_at",{ascending:true}),
  ]);
  const pointsByQuestion=new Map((assessmentItems??[]).map(item=>[item.quiz_question_id,Number(item.max_points)]));
  const scoredQuestions=questions.map(question=>({...question,max_points:pointsByQuestion.get(question.id)??null}));
  const pastAttempts=(attempts??[]).map(attempt=>({id:attempt.id,score:Number(attempt.score??0),total:Number(attempt.total??0),answers:attempt.answers,completedAt:attempt.completed_at,status:attempt.status,gradingSource:attempt.grading_source}));
  // Return the same complete question set used by /quizzes/[id]. QuizPlayer owns
  // navigation, answer state, evaluation, scoring, review, and retake behavior.
  return json({selection:current,title:source.title,total:questions.length,revision:state.revision,quiz:{...quiz,questions:scoredQuestions,pastAttempts}});
}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
  const {id}=await params,access=await roomAccess(id,true);
  if(access.error)return access.error;
  const text=await request.text(); if(text.length>64000)return fail("Response is too large.",413);
  let parsed;try{parsed=action.safeParse(JSON.parse(text));}catch{return fail("Invalid request.");}
  if(!parsed.success)return fail("Invalid content action.");
  const {admin,user,creator}=access,body=parsed.data;
  const {data:state,error}=await admin.from("instant_live_state").select("*").eq("room_id",id).single();
  if(error)return fail("Live content needs the new classroom SQL migration.",503);
  if(body.action==="show") {
    if(!creator)return fail("Only the teacher controls shared content.",403);
    if(state.presenter_id && state.presenter_id!==user.id && Date.parse(state.lease_until??"")>Date.now())return fail("Wait for the current presenter to stop sharing.",409);
    const isAdmin=isPlatformAdmin((await getFreshProfile(user.id))?.role);
    let query=admin.from(body.selection.kind==="lesson"?"lessons":"quizzes").select("id").eq("id",body.selection.id).eq("status","PUBLISHED");
    if(!isAdmin)query=query.eq("created_by",user.id);
    if(!(await query.maybeSingle()).data)return fail("Choose your published content.",403);
    const countQuery=body.selection.kind==="lesson"?admin.from("slides").select("id",{count:"exact",head:true}).eq("lesson_id",body.selection.id).is("deleted_at",null):admin.from("quiz_questions").select("id",{count:"exact",head:true}).eq("quiz_id",body.selection.id);
    const {count}=await countQuery; if(!count||body.selection.index>=count)return fail("That page does not exist.");
    const {data:updated,error:updateError}=await admin.from("instant_live_state").update({stage:"content",content:body.selection,asset_id:null,presenter_id:user.id,presenter_session:body.session,lease_until:new Date(Date.now()+60000).toISOString(),revision:state.revision+1}).eq("room_id",id).eq("revision",body.revision).select("*").maybeSingle();
    if(updateError)return fail("Could not share content. Apply the classroom migration first.",503);
    if(!updated)return fail("The shared stage changed. Try again.",409);
    return json({state:updated});
  }
  const current=selection.safeParse(state.content);
  if(body.action==="practice") {
    if(state.stage!=="content"||!current.success||current.data.kind!=="lesson")return fail("Your teacher changed the content.",409);
    const {data:slides}=await admin.from("slides").select("id").eq("lesson_id",current.data.id).is("deleted_at",null).order("slide_number");
    const slide=slides?.[current.data.index]; if(!slide)return fail("Slide is unavailable.",409);
    const {data:activity}=await admin.from("lesson_slide_activities").select("id").eq("id",body.activityId).eq("lesson_id",current.data.id).eq("slide_id",slide.id).is("deleted_at",null).maybeSingle();
    if(!activity)return fail("That activity is not on the current slide.",403);
    const {error:saveError}=await admin.from("instant_live_activity_responses").upsert({room_id:id,user_id:user.id,activity_id:activity.id,answers:body.answers,updated_at:new Date().toISOString()},{onConflict:"room_id,user_id,activity_id"});
    if(saveError)return fail("Could not save class practice.",503);
    return json({ok:true});
  }
  if(state.stage!=="content"||!current.success||current.data.kind!=="quiz"||current.data.reveal)return fail("This question is not accepting answers.",409);
  const {data:questions}=await admin.from("quiz_questions").select("id,question_type,options,correct_answer,max_points").eq("quiz_id",current.data.id).order("question_number");
  const question=questions?.[current.data.index]; if(question?.id!==body.questionId)return fail("Your teacher moved to another question.",409);
  const teacherReview=["SHORT_ANSWER","SENTENCE_COMPLETION","ESSAY_WRITING","EMAIL_LETTER_WRITING","TRANSLATION","PARAPHRASE_PRACTICE","SENTENCE_COMBINING","CREATIVE_WRITING","PEER_REVIEW_EDITING","DIALOGUE_WRITING","ORAL_RESPONSE","PRONUNCIATION","SHADOWING","NOTE_TAKING_CHALLENGE","SUMMARIZATION"].includes(question.question_type);
  const scored=question as ScoredQuestion;
  const {error:saveError}=await admin.from("instant_live_responses").upsert({room_id:id,user_id:user.id,question_id:question.id,answer:body.answer??null,score:teacherReview?null:questionScore(scored,body.answer),total:questionTotal(scored),updated_at:new Date().toISOString()},{onConflict:"room_id,user_id,question_id"});
  if(saveError)return fail("Could not save your answer. Try again.",503);
  return json({ok:true,teacherReview});
}
