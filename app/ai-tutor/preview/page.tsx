"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { TutorExpression } from "@/components/AiTutorAvatar";
const Avatar = dynamic(() => import("@/components/AiTutorAvatar").then((module) => module.AiTutorAvatar), { ssr: false });
const expressions: TutorExpression[] = ["neutral", "happy", "blink", "aa", "ih", "ou", "ee", "oh"];

export default function TutorModelPreview() {
  const [expression, setExpression] = useState<TutorExpression>("neutral");
  const [speaking, setSpeaking] = useState(false);
  return <main className="mx-auto max-w-3xl space-y-5 p-5 sm:p-8">
    <header><h1 className="text-2xl font-bold">Model C — actual 3D preview</h1><p className="mt-2 text-sm text-slate-600">Original VRoid model, rendered in your browser. Try the model’s facial controls below.</p></header>
    <div className="h-[440px] overflow-hidden rounded-3xl bg-gradient-to-br from-violet-100 to-rose-50 sm:h-[540px]"><Avatar speaking={speaking} expression={expression} /></div>
    <div className="flex flex-wrap gap-2">{expressions.map((value) => <button key={value} onClick={() => { setExpression(value); setSpeaking(false); }} aria-pressed={expression === value && !speaking} className={`rounded-lg border px-4 py-2 text-sm ${expression === value && !speaking ? "bg-violet-700 text-white" : "bg-white"}`}>{value}</button>)}</div>
    <button onClick={() => { setExpression("neutral"); setSpeaking((value) => !value); }} aria-pressed={speaking} className="rounded-full bg-gradient-to-r from-orange-400 to-rose-500 px-6 py-3 font-semibold text-white">{speaking ? "Stop animation" : "Preview speaking motion"}</button>
    <p className="text-sm text-slate-600">This motion demonstrates the mouth shapes and head movement. It does not play audio or demonstrate speech-aligned lip sync.</p>
    <a className="inline-block text-sm text-violet-700 underline" href="https://vroid.pixiv.help/hc/en-us/articles/4402394424089-VRoidPreset-A-Z">VRoid model usage conditions</a>
  </main>;
}
