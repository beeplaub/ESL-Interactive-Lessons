import { NextResponse } from "next/server";
import { z } from "zod";
import { roomAccess } from "@/lib/instant-live/server";
import { getFreshProfile, isPlatformAdmin } from "@/lib/auth";
import { questionScore, questionTotal, type ScoredQuestion } from "@/lib/quizScoring";

const selection = z.object({kind:z.enum(["lesson","quiz"]), id:z.string().uuid(), index:z.number().int().min(0).max(999), reveal:z.boolean().default(false)});
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
    const query=(table:string)=>{let q=admin.from(table).select("id,title,level").eq("status","PUBLISHED").order("title").limit(200); if(!isAdmin)q=q.eq("created_by",user.id);return q;};
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
    const {data:slides,error:slideError}=await admin.from("slides").select("id,title,slide_number").eq("lesson_id",current.id).is("deleted_at",null).order("slide_number");
    const slide=slides?.[current.index]; if(slideError||!slide)return fail("This slide is unavailable.",404);
    const [blocks,activities]=await Promise.all([
      admin.from("lesson_blocks").select("id,position,block_type,content").eq("lesson_id",current.id).eq("slide_id",slide.id).order("position"),
      admin.from("lesson_slide_activities").select("id,activity_type,activity_data").eq("lesson_id",current.id).eq("slide_id",slide.id).is("deleted_at",null).order("created_at"),
    ]);
    if(blocks.error||activities.error)return fail("Could not load lesson content.",503);
    const {data:responses,error:responseError}=await admin.from("instant_live_activity_responses").select("activity_id,answers").eq("room_id",id).eq("user_id",user.id);
    if(responseError)return fail("Class practice needs the new SQL migration.",503);
    return json({selection:current,title:source.title,total:slides!.length,slide,blocks:blocks.data,activities:activities.data,responses,revision:state.revision});
  }
  const {data:questions,error:questionError}=await admin.from("quiz_questions").select("id,question_number,question_type,question_text,description,options,correct_answer,max_points").eq("quiz_id",current.id).order("question_number");
  const question=questions?.[current.index]; if(questionError||!question)return fail("This question is unavailable.",404);
  const {data:response}=await admin.from("instant_live_responses").select("answer,score,total").eq("room_id",id).eq("user_id",user.id).eq("question_id",question.id).maybeSingle();
  const {count}=creator?await admin.from("instant_live_responses").select("question_id",{count:"exact",head:true}).eq("room_id",id).eq("question_id",question.id):{count:null};
  // The shared renderer needs answer structure for gap-fill/matching. As in the
  // existing practice player this is formative practice, not a secure examination.
  const learnerQuestion = !creator && !current.reveal
    ? { ...question, correct_answer: null }
    : question;
  return json({selection:current,title:source.title,total:questions!.length,question:learnerQuestion,response,answeredCount:count,revision:state.revision});
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
