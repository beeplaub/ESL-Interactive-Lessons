"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { ArrowRight, AudioLines, BookOpen, Check, ChevronRight, Ear, Gamepad2, Info, Search, Volume2, X, Square } from "lucide-react";
import { IPA_ACCENTS, IPA_CHARTS, plainWord, spellingParts, type IpaAccent, type IpaAudioManifest, type IpaExample, type IpaGroup, type IpaSound } from "@/lib/ipa/chart";
import { useIpaPlayback } from "./useIpaPlayback";
import styles from "./ipa-chart.module.css";

type Category = "all" | "vowels" | "consonants";
type Voicing = "all" | "voiced" | "voiceless";
type Playback = ReturnType<typeof useIpaPlayback>;
const groupLabels: Record<IpaGroup, string> = { monophthong: "Monophthongs", diphthong: "Diphthongs", rhotic: "R-colored vowels", consonant: "Consonants" };

function Spelling({ example }: { example: IpaExample }) {
  return <>{spellingParts(example.spelling).map((part, index) => part.highlighted ? <span className={styles.highlight} key={index}>{part.text}</span> : <span key={index}>{part.text}</span>)}</>;
}

function SoundDetails({ sound, accent, assets, playback, charts }: { sound: IpaSound; accent: IpaAccent; assets: IpaAudioManifest; playback: Playback; charts: Record<IpaAccent, IpaSound[]> }) {
  const audio = assets[accent]?.[sound.id];
  return <div className={styles.detailsContent}>
    <div className={styles.eyebrow}>Meet the sound</div>
    <div className={styles.soundHero}><span className={styles.bigSymbol}>/{sound.symbol}/</span><span className={styles.soundIcon}><AudioLines size={27} aria-hidden="true" /></span></div>
    <h2 className={styles.soundName}>{sound.name}</h2>
    <div className={styles.badges}><span>{sound.group === "consonant" ? "Consonant" : groupLabels[sound.group].replace(/s$/, "")}</span><span>{sound.voiced ? "Voiced" : "Voiceless"}</span></div>
    <button className={styles.primaryButton} disabled={!audio?.sound} onClick={() => void playback.play(`sound:${sound.id}`, audio?.sound?.src)}>
      {playback.playing === `sound:${sound.id}` ? <Square size={17} /> : <Volume2 size={17} />}{audio?.sound ? (playback.playing === `sound:${sound.id}` ? "Stop sound" : "Hear the sound") : "Sound recording coming soon"}
    </button>
    <div className={styles.detailSection}><h3>How to make it</h3><p>{sound.cue}</p><p className={styles.articulation}>{sound.articulation}</p></div>
    <div className={styles.detailSection}><h3>Hear it in a word</h3><p className={styles.caption}>Underlined letters represent /{sound.symbol}/.</p><div className={styles.examples}>
      {sound.examples.map(example => { const word = plainWord(example); const recording = audio?.words?.[word]; const key = `word:${sound.id}:${word}`; return <button key={word} className={styles.example} onClick={() => void playback.play(key, recording?.src, word)} aria-label={`${playback.playing === key ? "Stop" : "Hear"} ${word} in ${IPA_ACCENTS[accent].label}`}>
        <span><span className={styles.exampleWord}><Spelling example={example} /></span><span className={styles.transcription}>/{example.ipa}/</span></span><span className={styles.examplePlay}>{playback.playing === key ? <Square size={15} /> : <Volume2 size={18} />}</span>
      </button>; })}
    </div><p className={styles.caption}>Words without a studio recording use your device’s {IPA_ACCENTS[accent].short} English voice, when available.</p></div>
    {sound.note ? <div className={styles.note}><Info size={16} aria-hidden="true" /><p>{sound.note}</p></div> : null}
    {sound.pair ? <p className={styles.pairNote}>Try its partner: <strong>/{charts[accent].find(item => item.id === sound.pair)?.symbol}/</strong>. Compare the same mouth position with voice on and off.</p> : null}
  </div>;
}

export function IpaChart({ audio, charts = IPA_CHARTS }: { audio: IpaAudioManifest; charts?: Record<IpaAccent, IpaSound[]> }) {
  const [accent, setAccent] = useState<IpaAccent>("uk");
  const [selectedId, setSelectedId] = useState("fleece");
  const [category, setCategory] = useState<Category>("all");
  const [voicing, setVoicing] = useState<Voicing>("all");
  const [query, setQuery] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const playback = useIpaPlayback(accent);
  const sounds = charts[accent];
  const selected = sounds.find(sound => sound.id === selectedId) ?? sounds[0];
  const search = query.trim().toLowerCase().replace(/^\/+|\/+$/g, "");
  const matches = (sound: IpaSound) => (category === "all" || (category === "consonants") === (sound.group === "consonant"))
    && (voicing === "all" || sound.voiced === (voicing === "voiced"))
    && (!search || [sound.symbol, sound.name, sound.articulation, ...sound.examples.map(plainWord)].some(value => value.toLowerCase().includes(search)));
  const visible = sounds.filter(matches);
  const visibleGroups = (["monophthong", "diphthong", "rhotic", "consonant"] as IpaGroup[]).filter(group => visible.some(sound => sound.group === group));
  const filtered = Boolean(search) || category !== "all" || voicing !== "all";

  function choose(sound: IpaSound) {
    playback.stop();
    setSelectedId(sound.id);
    if (window.matchMedia("(max-width: 1099px)").matches) dialog.current?.showModal();
    const src = audio[accent]?.[sound.id]?.sound?.src;
    if (src) void playback.play(`sound:${sound.id}`, src);
  }
  function changeAccent(next: IpaAccent) {
    playback.stop();
    dialog.current?.close();
    setAccent(next);
    if (!charts[next].some(sound => sound.id === selectedId)) setSelectedId("fleece");
  }
  function moveSelection(event: KeyboardEvent<HTMLDivElement>) {
    if (!(event.target instanceof HTMLButtonElement) || !event.target.hasAttribute("data-sound-select")) return;
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>("[data-sound-select]"))
      .filter(button => !button.closest("[hidden]"));
    const next = buttons[buttons.indexOf(event.target) + step];
    if (next) { event.preventDefault(); next.focus(); }
  }


  return <div className={styles.workspace}>
    <header className={styles.hero}>
      <h1 className={styles.pageTitle}>IPA Chart</h1>
      <Link href="/ipa-snakes-and-ladders" className={styles.questLink}><Gamepad2 size={16} aria-hidden="true" /><span>Play IPA Snakes &amp; Ladders</span><ArrowRight size={15} aria-hidden="true" /></Link>
    </header>
    <div className={styles.toolbar}>
      <div className={styles.toolbarTop}>
        <div className={styles.categories} role="group" aria-label="Sound category">{([ ["all", "All sounds"], ["vowels", "Vowels"], ["consonants", "Consonants"] ] as const).map(([value, label]) => <button key={value} aria-pressed={category === value} className={category === value ? styles.activeCategory : ""} onClick={() => { setCategory(value); if (value === "vowels") setVoicing("all"); }}>{label}</button>)}</div>
        <label className={styles.search}><Search size={17} aria-hidden="true" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Find a sound or word…" aria-label="Find a sound or example word" />{query ? <button aria-label="Clear search" onClick={() => setQuery("")}><X size={15} /></button> : null}</label>
        <div className={styles.accentControl}><div className={styles.accentToggle} role="group" aria-label="Pronunciation model">{(["uk", "us"] as IpaAccent[]).map(value => <button key={value} aria-pressed={accent === value} onClick={() => changeAccent(value)} className={accent === value ? styles.activeAccent : ""}><span className={styles.accentCode}>{IPA_ACCENTS[value].short}</span>{value === "uk" ? "British" : "American"}{accent === value ? <Check size={14} aria-hidden="true" /> : null}</button>)}</div></div>
      </div>
    </div>
    <div className={styles.mainLayout}>
      <section className={styles.chart} aria-label={`${IPA_ACCENTS[accent].label} IPA chart`}>
        <div className={styles.chartHeading}><div><h2>{IPA_ACCENTS[accent].label} <span>Phonemic Chart</span></h2><p>{IPA_ACCENTS[accent].description}</p></div><span className={styles.count}>{filtered ? `${visible.length} of ` : ""}{sounds.length} sounds</span></div>
        <div className={styles.legend}><span><i className={styles.monoSwatch} />Monophthongs</span><span><i className={styles.diphSwatch} />Diphthongs</span><span><i className={styles.consonantSwatch} />Consonants</span></div>
        <div className={styles.voicingRow}><span className={styles.chartHint}>Tap a symbol to explore · tap a word to listen</span><label>Voice <select value={voicing} aria-label="Filter by voicing" onChange={event => setVoicing(event.target.value as Voicing)}><option value="all">All sounds</option><option value="voiced">Voiced</option><option value="voiceless">Voiceless</option></select></label></div>
        <div className={styles.groups} onKeyDown={moveSelection}>
          {visibleGroups.map(group => <section key={group} className={`${styles.group} ${styles[group]}`} aria-label={groupLabels[group]}>
            <div className={styles.groupTitle}><h3>{groupLabels[group]}</h3><span>{group === "monophthong" ? "One steady vowel" : group === "diphthong" ? "One vowel gliding into another" : group === "rhotic" ? "Vowels with an r quality" : "Pairs share a mouth position"}</span></div>
            <div className={styles.tiles}>{sounds.filter(sound => sound.group === group).map(sound => {
              const show = matches(sound); if (!show) return null;
              const example = sound.examples[0]; const word = plainWord(example); const key = `word:${sound.id}:${word}`;
              return <div key={sound.id} className={`${styles.tile} ${sound.id === selected.id ? styles.selectedTile : ""} ${!sound.voiced ? styles.voicelessTile : ""}`}>
                <button data-sound-select className={styles.symbolButton} aria-pressed={sound.id === selected.id} aria-label={`Explore /${sound.symbol}/, ${sound.name}, ${sound.voiced ? "voiced" : "voiceless"}`} onClick={() => choose(sound)}>
                  {sound.group === "consonant" ? <span className={styles.voiceBadge} title={sound.voiced ? "Voiced" : "Voiceless"}>{sound.voiced ? "V" : "VL"}</span> : null}<span className={styles.symbol}>{sound.symbol}</span>
                </button>
                <button className={styles.wordButton} aria-label={`${playback.playing === key ? "Stop" : "Hear"} ${word}`} onClick={() => void playback.play(key, audio[accent]?.[sound.id]?.words?.[word]?.src, word)}><span><Spelling example={example} /></span><span aria-hidden="true" className={styles.tileSpeaker}>{playback.playing === key ? <Square size={10} /> : <Volume2 size={11} />}</span></button>
              </div>;
            })}</div>
          </section>)}
        </div>
        {!visible.length ? <div className={styles.empty}><Search size={30} /><h3>No sounds found</h3><p>Try an IPA symbol, a word such as “sheep”, or a different filter.</p><button onClick={() => { setQuery(""); setCategory("all"); setVoicing("all"); }}>Show all sounds <ArrowRight size={15} /></button></div> : null}
        <div className={styles.chartFooter}><span><span className={styles.voiceKey}>V</span> Voiced · vocal folds vibrate</span><span><span className={styles.voiceKey}>VL</span> Voiceless · air without voice</span></div>
      </section>
      <aside className={styles.desktopDetails}><SoundDetails sound={selected} accent={accent} assets={audio} playback={playback} charts={charts} /></aside>
    </div>
    <div role="status" aria-live="polite" className={playback.message ? styles.playbackMessage : styles.srOnly}>{playback.message || (playback.playing ? "Playing audio" : "")}{playback.message ? <button aria-label="Dismiss playback message" onClick={playback.stop}><X size={16} /></button> : null}</div>
    <div className={styles.learningNotes}>
      <div><BookOpen size={21} aria-hidden="true" /><div><h3>A symbol represents a sound</h3><p>English has more sounds than letters. The underlined spelling shows where the sound appears; one sound may have several spellings.</p></div></div>
      <div><Ear size={21} aria-hidden="true" /><div><h3>Different accents belong here</h3><p>{IPA_ACCENTS[accent].note}</p></div></div>
    </div>
    <details className={styles.about}><summary>About this chart and audio <ChevronRight size={15} /></summary><p>This English teaching chart uses International Phonetic Alphabet symbols; it does not show the full IPA for every language. British and American charts follow their own teaching conventions. All vowels shown are voiced.</p><p>Dedicated recordings are available for every phoneme and example word. Choose British or American to hear the corresponding pronunciation. Select a symbol for articulation guidance, or select an example word to hear it.</p><p>Reference: <a href="https://dictionary.cambridge.org/help/phonetics.html" target="_blank" rel="noreferrer">Cambridge pronunciation symbols</a>. Descriptions and examples are written for BrenUp.</p></details>
    <dialog ref={dialog} className={styles.mobileDialog} onClose={playback.stop} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }} aria-label={`Sound details for /${selected.symbol}/`}><div className={styles.dialogInner}><button autoFocus className={styles.closeDialog} aria-label="Close sound details" onClick={() => dialog.current?.close()}><X size={21} /></button><SoundDetails sound={selected} accent={accent} assets={audio} playback={playback} charts={charts} /></div></dialog>
  </div>;
}
