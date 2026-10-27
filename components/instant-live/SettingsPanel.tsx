"use client";

import { useState } from "react";
import {
  Check,
  FolderOpen,
  Mic,
  Settings2,
  ShieldCheck,
  X,
} from "lucide-react";
import { AudioSetup } from "./AudioSetup";

export type RoomSettings = {
  room_locked: boolean;
  learner_mic_enabled: boolean;
  learner_chat_enabled: boolean;
  learner_screen_share_enabled: boolean;
};

type Props = {
  creator: boolean;
  settings: RoomSettings;
  recordingLocation: string;
  canChooseFolder: boolean;
  onClose: () => void;
  onRoomChange: (key: keyof RoomSettings, value: boolean) => void;
  onChooseFolder: () => void;
  onResetFolder: () => void;
  onEnableSound: () => Promise<void>;
  onSelectMicrophone: (id: string) => Promise<unknown>;
  connections: Record<string, RTCPeerConnectionState>;
};

function SettingToggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      className="live-setting-row"
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
    >
      <span>
        <strong>{label}</strong>
        {hint ? <small>{hint}</small> : null}
      </span>
      <i className={checked ? "is-on" : ""}>
        <b />
      </i>
    </button>
  );
}

export function SettingsPanel({
  creator,
  settings,
  recordingLocation,
  canChooseFolder,
  onClose,
  onRoomChange,
  onChooseFolder,
  onResetFolder,
  onEnableSound,
  onSelectMicrophone,
  connections,
}: Props) {
  const [tab, setTab] = useState<"room" | "audio" | "recording">(creator ? "room" : "audio");

  return (
    <div
      className="live-modal-backdrop live-settings-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="live-settings-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="live-settings-title"
      >
        <header className="live-settings-header">
          <span className="live-settings-mark">
            <Settings2 size={19} />
          </span>
          <div>
            <h2 id="live-settings-title">Class settings</h2>
            <small>{creator ? "Manage this room" : "Audio and classroom settings"}</small>
          </div>
          <button type="button" aria-label="Close settings" onClick={onClose}>
            <X size={18} />
          </button>
        </header>

        <nav className="live-settings-tabs" aria-label="Settings sections">
          {creator ? (
            <button
              className={tab === "room" ? "is-active" : ""}
              onClick={() => setTab("room")}
              type="button"
            >
              <ShieldCheck size={15} /> Room access
            </button>
          ) : null}
          <button
            className={tab === "audio" ? "is-active" : ""}
            onClick={() => setTab("audio")}
            type="button"
          >
            <Mic size={15} /> Audio
          </button>
          {creator ? (
            <button
              className={tab === "recording" ? "is-active" : ""}
              onClick={() => setTab("recording")}
              type="button"
            >
              <FolderOpen size={15} /> Recording
            </button>
          ) : null}
        </nav>

        {tab === "room" && creator ? (
          <div className="live-settings-content">
            <p className="live-settings-section-label">Access</p>
            <SettingToggle
              label="Lock classroom"
              hint="New learners wait until you admit them."
              checked={settings.room_locked}
              onChange={(value) => onRoomChange("room_locked", value)}
            />
            <div className="live-settings-divider" />
            <p className="live-settings-section-label">Learner controls</p>
            <SettingToggle
              label="Microphone"
              hint="Allow learners to turn on their mic."
              checked={settings.learner_mic_enabled}
              onChange={(value) => onRoomChange("learner_mic_enabled", value)}
            />
            <SettingToggle
              label="Chat"
              checked={settings.learner_chat_enabled}
              onChange={(value) => onRoomChange("learner_chat_enabled", value)}
            />
            <SettingToggle
              label="Screen sharing"
              checked={settings.learner_screen_share_enabled}
              onChange={(value) => onRoomChange("learner_screen_share_enabled", value)}
            />
          </div>
        ) : null}

        {tab === "audio" ? (
          <div className="live-settings-audio-content">
            <AudioSetup
              embedded
              onClose={onClose}
              onEnableSound={onEnableSound}
              onSelectMicrophone={onSelectMicrophone}
              connections={connections}
            />
          </div>
        ) : null}

        {tab === "recording" && creator ? (
          <div className="live-settings-content">
            <p className="live-settings-section-label">Save recordings to</p>
            <div className="live-recording-destination">
              <FolderOpen size={18} />
              <span>
                <strong>{recordingLocation}</strong>
                <small>
                  {canChooseFolder
                    ? "Saved recordings stay on this device."
                    : "Choose a location when saving each recording."}
                </small>
              </span>
            </div>
            <div className="live-settings-folder-actions">
              {canChooseFolder ? (
                <button type="button" onClick={onChooseFolder}>
                  <FolderOpen size={15} /> Choose folder
                </button>
              ) : null}
              {recordingLocation !== "Browser downloads" && canChooseFolder ? (
                <button type="button" className="is-quiet" onClick={onResetFolder}>
                  Reset
                </button>
              ) : null}
            </div>
            <div className="live-settings-note">
              <Check size={15} /> Recordings remain local. Nothing is uploaded.
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
