"use client";
import { useEffect, useRef, useState } from "react";
import { saveRecordingFile, type RecordingDirectoryHandle } from "./exportBoard";

type SavedRecording = { id: string; roomId: string; mime: string; createdAt: number; complete: boolean; size: number };
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("brenup-class-recordings", 1);
    request.onupgradeneeded = () => { request.result.createObjectStore("recordings", {keyPath:"id"}); request.result.createObjectStore("chunks", {keyPath:["id", "index"]}); };
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
async function transaction(stores: string[], mode: IDBTransactionMode, run: (tx: IDBTransaction) => void) {
  const db = await database();
  try { await new Promise<void>((resolve,reject) => { const tx = db.transaction(stores,mode); tx.oncomplete=()=>resolve(); tx.onerror=()=>reject(tx.error); tx.onabort=()=>reject(tx.error); run(tx); }); }
  finally { db.close(); }
}
async function listRecordings(roomId: string) {
  const db = await database();
  try { return await new Promise<SavedRecording[]>((resolve,reject) => { const req = db.transaction("recordings").objectStore("recordings").getAll(); req.onsuccess=()=>resolve((req.result as SavedRecording[]).filter(r=>r.roomId===roomId)); req.onerror=()=>reject(req.error); }); }
  finally { db.close(); }
}
export function useLocalRecording(roomId: string, tracks: MediaStreamTrack[], onNotice: (text:string)=>void) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [busy,setBusy] = useState(false);
  const [saved,setSaved] = useState<SavedRecording[]>([]);
  const inputs = useRef(tracks); inputs.current=tracks;
  const notice = useRef(onNotice); notice.current=onNotice;
  const recorder = useRef<MediaRecorder|null>(null);
  const mixer = useRef<{context: AudioContext; destination: MediaStreamAudioDestinationNode; sources: Map<string,MediaStreamAudioSourceNode>}|null>(null);
  const dispose = useRef<()=>void>(()=>{});
  const starting = useRef(false);
  const mounted = useRef(true);
  const refresh = () => listRecordings(roomId).then(items => { if(mounted.current) setSaved(items); });
  useEffect(() => { mounted.current=true; void listRecordings(roomId).then(setSaved).catch(()=>{}); return ()=>{ mounted.current=false; if (recorder.current && recorder.current.state !== "inactive") recorder.current.stop(); dispose.current(); }; },[roomId]);
  useEffect(() => {
    const mix = mixer.current; if(!mix) return;
    const live = new Set(tracks.filter(t=>t.kind==="audio" && t.readyState==="live").map(t=>t.id));
    mix.sources.forEach((source,id)=>{ if(!live.has(id)) {source.disconnect(); mix.sources.delete(id);} });
    for(const track of tracks) if(live.has(track.id) && !mix.sources.has(track.id)) {
      const source = mix.context.createMediaStreamSource(new MediaStream([track])); source.connect(mix.destination); mix.sources.set(track.id,source);
    }
  },[tracks,startedAt]);
  async function start() {
    if(starting.current || recorder.current?.state === "recording") return;
    if(!navigator.mediaDevices?.getDisplayMedia || typeof MediaRecorder === "undefined") { notice.current("Local class recording needs a desktop browser with screen capture. Mobile recording is not available in this browser."); return; }
    starting.current=true; setBusy(true);
    let capture: MediaStream | undefined;
    let context: AudioContext | undefined;
    try {
      // Invoke capture directly from the teacher's click; no awaited server request.
      const capturePromise = navigator.mediaDevices.getDisplayMedia({video:{frameRate:{ideal:15,max:20},width:{ideal:1280},height:{ideal:720}},audio:false});
      context=new AudioContext(); await context.resume();
      capture=await capturePromise;
      if(!mounted.current) throw new Error("Classroom closed.");
      const destination=context.createMediaStreamDestination();
      mixer.current={context,destination,sources:new Map()};
      for(const track of inputs.current) if(track.kind==="audio" && track.readyState==="live" && !mixer.current.sources.has(track.id)) {
        const source=context.createMediaStreamSource(new MediaStream([track])); source.connect(destination); mixer.current.sources.set(track.id,source);
      }
      const mime=["video/webm;codecs=vp8,opus","video/mp4","video/webm"].find(type=>MediaRecorder.isTypeSupported(type));
      const stream=new MediaStream([...capture.getVideoTracks(),...destination.stream.getAudioTracks()]);
      const media=new MediaRecorder(stream,{...(mime?{mimeType:mime}:{}),videoBitsPerSecond:750_000,audioBitsPerSecond:64_000});
      const entry: SavedRecording={id:crypto.randomUUID(),roomId,mime:media.mimeType,createdAt:Date.now(),complete:false,size:0};
      await transaction(["recordings"],"readwrite",tx=>{tx.objectStore("recordings").put(entry);});
      let index=0, queue=Promise.resolve(), failed=false;
      dispose.current=()=>{capture?.getTracks().forEach(t=>t.stop()); mixer.current?.sources.forEach(s=>s.disconnect()); destination.stream.getTracks().forEach(t=>t.stop()); void context?.close(); mixer.current=null;};
      media.ondataavailable=e=>{
        if(!e.data.size) return;
        const chunkIndex=index++; entry.size+=e.data.size;
        queue=queue.then(()=>transaction(["chunks","recordings"],"readwrite",tx=>{
          tx.objectStore("chunks").put({id:entry.id,index:chunkIndex,blob:e.data}); tx.objectStore("recordings").put({...entry});
        })).catch(()=>{ failed=true; notice.current("Device storage is full or unavailable. Recording stopped; save the available recording before clearing browser data."); if(media.state!=="inactive") media.stop(); });
        // Keep final-file assembly bounded on devices without streaming file writes.
        if(entry.size>500_000_000 && media.state!=="inactive") { notice.current("Recording reached the 500 MB local file limit. Save this part, then start another recording."); media.stop(); }
      };
      media.onstop=()=>{
        dispose.current(); recorder.current=null;
        if(mounted.current) {setStartedAt(null);setBusy(true);}
        void queue.then(async()=>{entry.complete=!failed; await transaction(["recordings"],"readwrite",tx=>{tx.objectStore("recordings").put(entry);}); await refresh();}).catch(()=>notice.current("Could not finalize recording. Previously saved chunks remain on this device.")).finally(()=>{if(mounted.current)setBusy(false);});
      };
      media.onerror=()=>{notice.current("Recording was interrupted. Save the available file and try again."); if(media.state!=="inactive") media.stop();};
      capture.getVideoTracks()[0].onended=()=>{if(media.state!=="inactive")media.stop();};
      recorder.current=media; media.start(2000); setStartedAt(entry.createdAt);
      notice.current("Recording locally. Keep this tab open. Class audio is included; nothing is uploaded.");
    } catch(error) {capture?.getTracks().forEach(t=>t.stop()); void context?.close(); mixer.current=null; notice.current(error instanceof DOMException && error.name==="NotAllowedError" ? "Recording cancelled. Choose this classroom tab to record." : error instanceof Error ? error.message : "Could not start recording.");}
    finally {starting.current=false;if(mounted.current)setBusy(false);}
  }
  function stop() {if(recorder.current?.state === "recording") {setBusy(true);recorder.current.stop();}}
  async function save(entry:SavedRecording, directory?: RecordingDirectoryHandle | null) {
    setBusy(true);
    try {
      const db=await database();
      const chunks=await new Promise<Array<{blob:Blob}>>((resolve,reject)=>{const request=db.transaction("chunks").objectStore("chunks").getAll(IDBKeyRange.bound([entry.id,0],[entry.id,Number.MAX_SAFE_INTEGER]));request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);}).finally(()=>db.close());
      if(!chunks.length) throw new Error("No recording data is available.");
      await saveRecordingFile(new Blob(chunks.map(c=>c.blob),{type:entry.mime}),`BrenUp-class-${new Date(entry.createdAt).toISOString().replace(/[:.]/g,"-")}.${entry.mime.includes("mp4")?"mp4":"webm"}`, directory);
    } catch {notice.current("Could not save this recording. Keep the browser data and retry.");}
    finally {setBusy(false);}
  }
  async function remove(entry:SavedRecording) {
    await transaction(["recordings","chunks"],"readwrite",tx=>{tx.objectStore("recordings").delete(entry.id);tx.objectStore("chunks").delete(IDBKeyRange.bound([entry.id,0],[entry.id,Number.MAX_SAFE_INTEGER]));}); await refresh();
  }
  useEffect(()=>{if(!startedAt)return; const prevent=(event:BeforeUnloadEvent)=>{event.preventDefault();}; window.addEventListener("beforeunload",prevent);return()=>window.removeEventListener("beforeunload",prevent);},[startedAt]);
  return {startedAt,busy,saved,start,stop,save,remove};
}
