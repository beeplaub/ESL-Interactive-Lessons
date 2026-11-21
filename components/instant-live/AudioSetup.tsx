"use client";
import { useEffect, useRef, useState } from "react";
import { Copy, Mic, Volume2, X } from "lucide-react";
import type { LiveAudioDiagnostics, MicrophoneInputStatus } from "./useLiveTransport";
import { microphoneErrorMessage } from "./microphoneErrorMessage";

export function AudioSetup({ embedded = false, onClose, onEnableSound, onSelectMicrophone, onReconnectMedia, onGetDiagnostics, microphoneOn, microphoneStatus, connections }: {
  embedded?: boolean;
  onClose: () => void;
  onEnableSound: () => Promise<void>;
  onSelectMicrophone: (id: string) => Promise<unknown>;
  onReconnectMedia: () => void;
  onGetDiagnostics: () => Promise<LiveAudioDiagnostics>;
  microphoneOn: boolean;
  microphoneStatus: MicrophoneInputStatus;
  connections: Record<string, RTCPeerConnectionState>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cleanup = useRef<() => void>(() => {});
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [device, setDevice] = useState("");
  const [level, setLevel] = useState(0);
  const [testing, setTesting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copyingDiagnostics, setCopyingDiagnostics] = useState(false);
  const [message, setMessage] = useState("");
  const [voiceDetected, setVoiceDetected] = useState(false);
  const voiceFrames = useRef(0);
  const voiceDetectedRef = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    if (!embedded) dialog.current?.showModal();
    const refreshDevices = () => void navigator.mediaDevices?.enumerateDevices().then(items => {
      if (mounted.current) setDevices(items);
    }).catch(() => {});
    refreshDevices();
    navigator.mediaDevices?.addEventListener("devicechange", refreshDevices);
    return () => {
      mounted.current = false;
      navigator.mediaDevices?.removeEventListener("devicechange", refreshDevices);
      cleanup.current();
    };
  }, [embedded]);
  async function testMic() {
    if (testing) { cleanup.current(); cleanup.current = () => {}; setTesting(false); setLevel(0); return; }
    setBusy(true);
    setVoiceDetected(false);
    voiceDetectedRef.current = false;
    voiceFrames.current = 0;
    let context: AudioContext | undefined;
    let stream: MediaStream | undefined;
    try {
      context = new AudioContext();
      await context.resume();
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
          setMessage("Your voice reaches this device. This test does not confirm that other participants can hear you.");
        }
        frame = requestAnimationFrame(measure);
      };
      cleanup.current = () => { cancelAnimationFrame(frame); stream?.getTracks().forEach(t => t.stop()); source.disconnect(); void context?.close(); };
      voiceFrames.current = 0;
      voiceDetectedRef.current = false;
      setVoiceDetected(false);
      measure(); setTesting(true);
      const updatedDevices = await navigator.mediaDevices.enumerateDevices();
      if (mounted.current) {
        setDevices(updatedDevices);
        setMessage("Speak normally. The meter will move when your microphone picks up your voice. This test is private.");
      }
    } catch (error) {
      stream?.getTracks().forEach(t => t.stop());
      void context?.close();
      if (mounted.current) setMessage(microphoneErrorMessage(error));
    } finally { if (mounted.current) setBusy(false); }
  }
  async function testSpeaker() {
    let context: AudioContext | undefined;
    try {
      context = new AudioContext();
      await context.resume();
      const tone = context.createOscillator(), gain = context.createGain();
      tone.frequency.value = 440; gain.gain.value = 0.08;
      tone.connect(gain).connect(context.destination); tone.start(); tone.stop(context.currentTime + .45);
      tone.onended = () => void context?.close();
      await onEnableSound();
      if (mounted.current) setMessage("Did you hear the tone? If not, raise device volume and check Bluetooth/headphones or the device's audio output. Speaker routing is controlled by your device.");
    } catch {
      void context?.close();
      if (mounted.current) setMessage("Playback is blocked. Tap the speaker test again and check device volume.");
    }
  }
  async function copyDiagnostics() {
    setCopyingDiagnostics(true);
    try {
      const diagnostics = await onGetDiagnostics();
      await navigator.clipboard.writeText(JSON.stringify(diagnostics, null, 2));
      if (mounted.current) setMessage("Private connection summary copied. It contains no names, IP addresses, or audio.");
    } catch {
      if (mounted.current) setMessage("Could not copy diagnostics. Allow clipboard access and try again.");
    } finally {
      if (mounted.current) setCopyingDiagnostics(false);
    }
  }
  const states = Object.values(connections);
  const connectedCount = states.filter(state => state === "connected").length;
  const connectionSummary = states.length
    ? `${connectedCount} of ${states.length} peer media links connected.`
    : "No peer media link yet.";
  const content = <section>
      <header><h2>Microphone and speaker</h2>{!embedded ? <button aria-label="Close audio settings" onClick={onClose}><X size={19}/></button> : null}</header>
      <p>Turn on Mic to speak. Use these checks if you cannot hear the class or others cannot hear you.</p>
      <label>Microphone<select value={device} disabled={testing || busy} onChange={async e => {
        const id = e.target.value; setBusy(true);
        try {
          await onSelectMicrophone(id);
          if (!mounted.current) return;
          setDevice(id); setVoiceDetected(false); voiceDetectedRef.current = false; voiceFrames.current = 0;
          setMessage("Microphone selected for the classroom. Check input below, then turn on Mic to speak.");
        }
        catch (error) { if (mounted.current) setMessage(microphoneErrorMessage(error)); }
        finally { if (mounted.current) setBusy(false); }
      }}><option value="">Device default</option>{devices.filter(d => d.kind === "audioinput" && d.deviceId && d.deviceId !== "default").map((d,i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${i+1}`}</option>)}</select></label>
      <p className={`live-audio-status is-${microphoneStatus}`} role="status">
        <strong>Mic input:</strong>{" "}
        {microphoneStatus === "ready" ? microphoneOn ? "Track is enabled in this browser." : "Device is ready; Mic is currently off." : null}
        {microphoneStatus === "idle" ? "Not connected yet. Turn on Mic to request a device." : null}
        {microphoneStatus === "muted" ? "Device input is temporarily unavailable. Try Mic off, then on, or select another device." : null}
        {microphoneStatus === "ended" ? "The device track ended. Select a device or turn Mic on to reconnect." : null}
        {microphoneStatus === "error" ? "No working device track. Check permissions or choose another microphone." : null}
      </p>
      <div className={`live-audio-meter${testing ? " is-testing" : ""}`} role="meter" aria-label="Local microphone test input level" aria-valuenow={level} aria-valuemin={0} aria-valuemax={100}><i style={{width: `${level}%`}}/></div>
      <div className="live-audio-actions"><button className="live-audio-primary" disabled={busy} onClick={() => void testMic()}><Mic size={17}/>{testing ? "Stop test" : voiceDetected ? "Test again" : "Check microphone"}</button><button onClick={() => void testSpeaker()}><Volume2 size={17}/>Test speaker</button><button type="button" disabled={copyingDiagnostics} onClick={() => void copyDiagnostics()}><Copy size={16}/>{copyingDiagnostics ? "Copying…" : "Copy diagnostics"}</button></div>
      {voiceDetected ? <p className="live-audio-success"><span aria-hidden="true">✓</span> Local input detected</p> : null}
      <p role="status">{message}</p>
      <small>{connectionSummary} This is transport status; local mic input is checked separately.</small>
      {states.some(s => s === "failed" || s === "disconnected") ? <div className="live-audio-actions"><button type="button" onClick={() => { onReconnectMedia(); setMessage("Media reconnect requested. Check the connection status above."); }}>Reconnect media</button><small>Your network may block direct media. Reconnecting does not request microphone permission again.</small></div> : null}
    </section>;
  return embedded ? (
    <div className="live-audio-dialog live-audio-embedded">{content}</div>
  ) : (
    <dialog ref={dialog} className="live-audio-dialog" onCancel={onClose} onClick={e => { if(e.target === e.currentTarget) onClose(); }}>
      {content}
    </dialog>
  );
}
