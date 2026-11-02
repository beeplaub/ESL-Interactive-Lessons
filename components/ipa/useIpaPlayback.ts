"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IPA_ACCENTS, type IpaAccent } from "@/lib/ipa/chart";

export function useIpaPlayback(accent: IpaAccent) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [playing, setPlaying] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const speechRef = useRef<SpeechSynthesisUtterance | null>(null);
  const generation = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voice = voices.find(item => item.lang.replace("_", "-").toLowerCase() === IPA_ACCENTS[accent].lang.toLowerCase() && item.localService)
    ?? voices.find(item => item.lang.replace("_", "-").toLowerCase() === IPA_ACCENTS[accent].lang.toLowerCase());

  const cancel = useCallback(() => {
    generation.current += 1;
    if (timer.current) clearTimeout(timer.current);
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.removeAttribute("src"); audioRef.current.load(); audioRef.current = null; }
    if (speechRef.current) { window.speechSynthesis?.cancel(); speechRef.current = null; }
  }, []);
  const stop = useCallback(() => { cancel(); setPlaying(null); setMessage(""); }, [cancel]);

  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const update = () => setVoices(window.speechSynthesis.getVoices());
    update();
    window.speechSynthesis.addEventListener("voiceschanged", update);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", update);
  }, []);
  useEffect(() => cancel, [cancel]);

  const play = useCallback(async (key: string, src?: string, word?: string) => {
    if (playing === key) { stop(); return; }
    cancel();
    const token = generation.current;
    setMessage("");
    if (!src && (!word || !voice)) {
      setPlaying(null);
      setMessage(word ? `No ${IPA_ACCENTS[accent].label} voice is available on this device. Try a browser with that English voice installed.` : "This sound recording will be available soon. You can explore the example words below.");
      return;
    }
    setPlaying(key);
    const finish = (error?: string) => {
      if (generation.current !== token) return;
      cancel();
      setPlaying(null);
      if (error) setMessage(error);
    };
    timer.current = setTimeout(() => finish("Playback took too long. Please try again."), 15000);
    if (src) {
      const audio = new Audio(src);
      audioRef.current = audio;
      audio.onended = () => finish();
      audio.onerror = () => finish("This recording could not be played. Please try again.");
      try { await audio.play(); } catch { finish("Audio could not start. Please try again."); }
    } else {
      const utterance = new SpeechSynthesisUtterance(word!);
      speechRef.current = utterance;
      utterance.voice = voice!;
      utterance.lang = IPA_ACCENTS[accent].lang;
      utterance.rate = 0.85;
      utterance.onend = () => finish();
      utterance.onerror = () => finish("Your device could not read this word. Please try again.");
      window.speechSynthesis.speak(utterance);
    }
  }, [accent, cancel, playing, stop, voice]);
  return { playing, message, play, stop, hasVoice: Boolean(voice) };
}
