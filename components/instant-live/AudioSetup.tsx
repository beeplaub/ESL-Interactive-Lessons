"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, Volume2, X } from "lucide-react";

export function AudioSetup({ onClose, onEnableSound, onSelectMicrophone, connections }: {
  onClose: () => void;
  onEnableSound: () => Promise<void>;
  onSelectMicrophone: (id: string) => Promise<unknown>;
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
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    dialog.current?.showModal();
    void navigator.mediaDevices?.enumerateDevices().then(setDevices).catch(() => {});
    return () => { mounted.current = false; cleanup.current(); };
  }, []);
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
        setLevel(Math.round(Math.sqrt(normalized) * 100));
        frame = requestAnimationFrame(measure);
      };
      cleanup.current = () => { cancelAnimationFrame(frame); stream?.getTracks().forEach(t => t.stop()); source.disconnect(); void context.close(); };
      measure(); setTesting(true);
      setDevices(await navigator.mediaDevices.enumerateDevices());
      setMessage("Speak normally. A moving meter confirms your microphone is capturing sound. This test is private.");
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
  return <dialog ref={dialog} className="live-audio-dialog" onCancel={onClose} onClick={e => { if(e.target === e.currentTarget) onClose(); }}>
    <section>
      <header><h2>Audio check</h2><button aria-label="Close audio settings" onClick={onClose}><X size={19}/></button></header>
      <p>Check your sound before speaking.</p>
      <label>Microphone<select value={device} disabled={testing || busy} onChange={async e => {
        const id = e.target.value; setDevice(id); setBusy(true);
        try { await onSelectMicrophone(id); setMessage("Microphone selected. Your current mute setting is preserved."); }
        catch { setMessage("Could not select that microphone. Try the default device."); }
        finally { setBusy(false); }
      }}><option value="">Device default</option>{devices.filter(d => d.kind === "audioinput" && d.deviceId && d.deviceId !== "default").map((d,i) => <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${i+1}`}</option>)}</select></label>
      <div className={`live-audio-meter${testing ? " is-testing" : ""}`} role="meter" aria-label="Microphone input level" aria-valuenow={level} aria-valuemin={0} aria-valuemax={100}><i style={{width: `${level}%`}}/></div>
      <div className="live-audio-actions"><button disabled={busy} onClick={() => void testMic()}><Mic size={17}/>{testing ? "Stop test" : "Test microphone"}</button><button onClick={() => void testSpeaker()}><Volume2 size={17}/>Test speaker</button></div>
      <p role="status">{message}</p>
      <small>{states.length ? `${states.filter(s => s === "connected").length} of ${states.length} media connections connected.` : "Waiting for another participant to test the live connection."} {states.some(s => s === "failed" || s === "disconnected") ? "Your network may block direct audio. Try another network and reconnect." : "Microphone permission and media connection are separate checks."}</small>
    </section>
  </dialog>;
}
