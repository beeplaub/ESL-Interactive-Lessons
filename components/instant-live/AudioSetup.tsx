"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, Volume2, X } from "lucide-react";

export function AudioSetup({ embedded = false, onClose, onEnableSound, onSelectMicrophone, onMicTested, onMicTestReset, connections }: {
  embedded?: boolean;
  onClose: () => void;
  onEnableSound: () => Promise<void>;
  onSelectMicrophone: (id: string) => Promise<unknown>;
  onMicTested?: () => void;
  onMicTestReset?: () => void;
  connections: Record<string, RTCPeerConnectionState>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cleanup = useRef<() => void>(() => {});
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [device, setDevice] = useState("");
  const [level, setLevel] = useState(0);
  const [testing, setTesting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [voiceDetected, setVoiceDetected] = useState(false);
  const voiceFrames = useRef(0);
  const voiceDetectedRef = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    if (!embedded) dialog.current?.showModal();
    void navigator.mediaDevices?.enumerateDevices().then(setDevices).catch(() => {});
    return () => { mounted.current = false; cleanup.current(); };
  }, [embedded]);
  async function testMic() {
    if (testing) { cleanup.current(); setTesting(false); setLevel(0); return; }
    setBusy(true);
    const context = new AudioContext();
    void context.resume();
    let stream: MediaStream | undefined;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: device ? { deviceId: {exact: device}, echoCancellation: true } : true });
      if (!mounted.current) { stream.getTracks().forEach(t => t.stop()); await context.close(); return; }
      const source = context.createMediaStreamSource(stream);
      const analyser = context.createAnalyser(); analyser.fftSize = 256;
      source.connect(analyser); // Never play the microphone back: avoids feedback.
      const samples = new Uint8Array(analyser.fftSize);
      let frame = 0;
      const measure = () => {
        analyser.getByteTimeDomainData(samples);
        const rms = Math.sqrt(samples.reduce((sum, v) => sum + ((v - 128) / 128) ** 2, 0) / samples.length);
        // Speech RMS is usually far below full scale. Expand the useful range
        // so ordinary speaking produces a clearly visible meter response.
        const normalized = Math.max(0, Math.min(1, (rms - 0.008) / 0.12));
        const visibleLevel = Math.round(Math.sqrt(normalized) * 100);
        setLevel(visibleLevel);
        voiceFrames.current = visibleLevel >= 12 ? voiceFrames.current + 1 : 0;
        if (voiceFrames.current >= 9 && !voiceDetectedRef.current) {
          voiceDetectedRef.current = true;
          setVoiceDetected(true);
          onMicTested?.();
          setMessage("Your microphone is working. We detected your voice; you can close this check.");
        }
        frame = requestAnimationFrame(measure);
      };
      cleanup.current = () => { cancelAnimationFrame(frame); stream?.getTracks().forEach(t => t.stop()); source.disconnect(); void context.close(); };
      voiceFrames.current = 0;
      voiceDetectedRef.current = false;
      setVoiceDetected(false);
      measure(); setTesting(true);
      setDevices(await navigator.mediaDevices.enumerateDevices());
      setMessage("Speak normally. The meter will move when your microphone picks up your voice. This test is private.");
    } catch (error) {
      stream?.getTracks().forEach(t => t.stop()); void context.close();
      setMessage(error instanceof DOMException && error.name === "NotAllowedError" ? "Allow microphone access in your browser's site settings, then test again." : "Cannot open this microphone. Check its connection or close another app using it.");
    } finally { if (mounted.current) setBusy(false); }
  }
  async function testSpeaker() {
    const context = new AudioContext();
    try {
      await context.resume();
      const tone = context.createOscillator(), gain = context.createGain();
      tone.frequency.value = 440; gain.gain.value = 0.08;
      tone.connect(gain).connect(context.destination); tone.start(); tone.stop(context.currentTime + .45);
      tone.onended = () => void context.close();
      await onEnableSound();
      setMessage("Did you hear the tone? If not, raise device volume and check Bluetooth/headphones or the device's audio output. Speaker routing is controlled by your device.");
    } catch { void context.close(); setMessage("Playback is blocked. Tap the speaker test again and check device volume."); }
  }
  const states = Object.values(connections);
  const content = <section>
      <header><h2>Microphone and speaker</h2>{!embedded ? <button aria-label="Close audio settings" onClick={onClose}><X size={19}/></button> : null}</header>
      <p>Your microphone works when you turn it on. Use these checks only if you cannot be heard or hear the class.</p>
      <label>Microphone<select value={device} disabled={testing || busy} onChange={async e => {
        const id = e.target.value; setDevice(id); setBusy(true);
        try { await onSelectMicrophone(id); setVoiceDetected(false); voiceDetectedRef.current = false; voiceFrames.current = 0; onMicTestReset?.(); setMessage("Microphone selected. Test it to confirm it is working."); }
        catch { setMessage("Could not select that microphone. Try the default device."); }
        finally { setBusy(false); }
      }}><option value="">Device default</option>{devices.filter(d => d.kind === "audioinput" && d.deviceId && d.deviceId !== "default").map((d,i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${i+1}`}</option>)}</select></label>
      <div className={`live-audio-meter${testing ? " is-testing" : ""}`} role="meter" aria-label="Microphone input level" aria-valuenow={level} aria-valuemin={0} aria-valuemax={100}><i style={{width: `${level}%`}}/></div>
      <div className="live-audio-actions"><button className="live-audio-primary" disabled={busy} onClick={() => void testMic()}><Mic size={17}/>{testing ? "Stop test" : voiceDetected ? "Test again" : "Check microphone"}</button><button onClick={() => void testSpeaker()}><Volume2 size={17}/>Test speaker</button></div>
      {voiceDetected ? <p className="live-audio-success"><span aria-hidden="true">✓</span> Microphone ready</p> : null}
      <p role="status">{message}</p>
      <small>{states.length ? `${states.filter(s => s === "connected").length} of ${states.length} media connections connected.` : "Waiting for another participant to test the live connection."} {states.some(s => s === "failed" || s === "disconnected") ? "Your network may block direct audio. Try another network and reconnect." : "Microphone permission and media connection are separate checks."}</small>
    </section>;
  return embedded ? (
    <div className="live-audio-dialog live-audio-embedded">{content}</div>
  ) : (
    <dialog ref={dialog} className="live-audio-dialog" onCancel={onClose} onClick={e => { if(e.target === e.currentTarget) onClose(); }}>
      {content}
    </dialog>
  );
}
