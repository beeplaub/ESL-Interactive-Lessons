"use client";

import { useEffect, useRef, useState } from "react";
import { CenteredSpinner } from "@/components/loading/Skeleton";

type GameMarkup = { styles: string; markup: string; script: string };
const ACCENT_PREFERENCE_KEY = "brenup:ipa-snakes-and-ladders:accent";
type GameWindow = Window & {
  __brenupIpaSnakesRoot?: ShadowRoot;
  __brenupIpaSnakesCleanup?: () => void;
};

export function IpaSnakesAndLaddersGame({ progressKey }: { progressKey: string }) {
  const [game, setGame] = useState<GameMarkup | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void fetch("/ipa-snakes-and-ladders.html", { cache: "no-cache" })
      .then((response) => {
        if (!response.ok) throw new Error("Game markup could not be loaded");
        return response.text();
      })
      .then((source) => {
        const parsed = new DOMParser().parseFromString(source, "text/html");
        const style = parsed.querySelector("head style")?.textContent ?? "";
        const script = parsed.body.querySelector("script")?.textContent ?? "";
        const page = parsed.body.querySelector("main.page");
        const modal = parsed.body.querySelector(".modal-backdrop");
        if (!style || !script || !page || !modal) throw new Error("Game markup is incomplete");

        page.querySelector(".brand")?.remove();
        page.querySelector(".eyebrow")?.remove();
        page.querySelector(".board-label")?.remove();
        page.querySelector(".intro")?.remove();
        const accentLabel = page.querySelector(".select-wrap");
        const accentSelect = accentLabel?.querySelector("select");
        if (accentLabel && accentSelect) {
          const accentControl = parsed.createElement("div");
          accentControl.className = accentLabel.className;
          accentSelect.setAttribute("aria-label", "Pronunciation accent");
          accentControl.append(accentSelect);
          accentLabel.replaceWith(accentControl);
        }
        const controls = page.querySelector(".top-actions");
        const hero = page.querySelector(".hero");
        page.querySelector(".topbar")?.remove();
        if (controls && hero) hero.append(controls);
        const pageMarkup = page.outerHTML.replace(/^<main\b/, "<div").replace(/<\/main>$/, "</div>");

        if (!cancelled) {
          setGame({
            styles: style.replaceAll(":root", ":host").replace(/(^|})\s*body\s*\{/g, "$1 :host {")
              .replace("padding:28px clamp(14px,3vw,38px) 40px", "padding:12px clamp(14px,3vw,38px) 40px")
              .replace("align-items:flex-end; justify-content:space-between; gap:20px; margin-bottom:20px", "align-items:center; justify-content:space-between; gap:20px; margin-bottom:0")
              .replace("max-width:650px; margin:8px 0 0", "max-width:none; margin:8px 0 20px")
              .replace("@media (max-width:680px) { .page", "@media (max-width:680px) { .hero{display:flex;flex-direction:column;align-items:stretch}.hero>div{order:1}.hero>.intro{order:2;margin:8px 0 0}.hero>.top-actions{order:3;flex-wrap:nowrap;justify-content:flex-start;margin-top:12px;gap:5px;width:100%}.page")
              + "\n:host{display:block;width:100%;min-width:0;--paper:#fff;background:#fff}\n.hero>div{min-width:0}\n.hero>.intro{grid-column:1/-1}\n.top-actions{margin-left:auto;flex-shrink:0;white-space:nowrap}\n.select-wrap{position:relative;gap:0}\n.native-accent-select{display:none!important}\n.accent-trigger{position:relative;display:inline-flex;align-items:center;min-width:174px;height:44px;padding:0 38px 0 14px;border:1px solid #d9d2ed;border-radius:12px;background:linear-gradient(135deg,#fff 10%,#f4f0ff 100%);color:#4932a4;font:inherit;font-weight:800;font-size:13px;line-height:1;text-align:left;box-shadow:0 2px 8px #6548c710;cursor:pointer;transition:border-color .15s,background .15s,box-shadow .15s}\n.accent-trigger::after{content:'';position:absolute;right:15px;top:50%;width:7px;height:7px;border-right:1.5px solid #6548c7;border-bottom:1.5px solid #6548c7;transform:translateY(-70%) rotate(45deg);transition:transform .15s}\n.accent-trigger[aria-expanded=true]::after{transform:translateY(-25%) rotate(225deg)}\n.accent-trigger:hover{border-color:#b8a8e7;background:linear-gradient(135deg,#fff,#eee9ff);box-shadow:0 3px 10px #6548c71a}\n.accent-trigger:focus-visible{outline:2px solid #8a72d4;outline-offset:2px}\n.accent-menu{position:absolute;z-index:30;top:calc(100% + 8px);right:0;min-width:100%;padding:5px;border:1px solid #e4def1;border-radius:13px;background:#fff;box-shadow:0 12px 28px #2920441c}\n.accent-option{display:flex;align-items:center;justify-content:space-between;width:100%;min-height:40px;padding:0 10px;border:0;border-radius:9px;background:transparent;color:#46536a;font:inherit;font-weight:700;font-size:13px;line-height:1.2;text-align:left;white-space:nowrap;cursor:pointer}\n.accent-option:hover,.accent-option[aria-selected=true]{background:#f2effb;color:#4932a4}\n.accent-option[aria-selected=true]::after{content:'✓';margin-left:16px;color:#6548c7;font-weight:900}\n.select-wrap,.sound-toggle,.ghost{white-space:nowrap}\n@media(max-width:900px){.hero{align-items:flex-start;flex-wrap:wrap}.top-actions{margin-left:0}}\n@media(max-width:680px){.accent-trigger{min-width:0;width:clamp(112px,34vw,134px);height:38px;padding:0 27px 0 10px;font-size:11px}.accent-trigger::after{right:11px}.sound-toggle{width:clamp(72px,22vw,88px);min-width:0;height:38px;padding:0 6px;font-size:10px;overflow:hidden;text-overflow:ellipsis}.ghost{width:clamp(68px,20vw,78px);min-width:0;height:38px;padding:0 6px;font-size:10px}}",
            markup: `${pageMarkup}${modal.outerHTML}`,
            script: script.replace(
              "const currentPosition = { value:1 };",
              `const progressStorageKey=${JSON.stringify(progressKey)};\n    const currentPosition = { value:1 };`,
            ),
          });
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => { cancelled = true; };
  }, [progressKey]);

  if (failed) {
    return <p role="alert" className="rounded-xl border border-[var(--br-border)] bg-surface p-5 text-sm font-semibold">The game could not be opened. Please reload this page.</p>;
  }

  return game ? <GameContent game={game} /> : <CenteredSpinner label="Loading IPA Snakes and Ladders…" />;
}

function GameContent({ game }: { game: GameMarkup }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = host.current;
    if (!element) return;

    const shadow = element.shadowRoot ?? element.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = game.styles;
    style.textContent += "\n.hero{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:20px;margin-bottom:16px}.hero>.intro{grid-column:1/-1}\n@media(max-width:680px){.page{padding-top:8px}.hero{display:flex;flex-direction:column;align-items:stretch;margin-bottom:6px}.hero>div{order:1}.hero>.top-actions{order:3;flex-wrap:nowrap;justify-content:flex-start;margin:6px 0 0;gap:5px;width:100%}}";
    shadow.replaceChildren(style);

    const content = document.createElement("div");
    content.innerHTML = game.markup;
    shadow.append(content);

    const accentSelect = shadow.querySelector<HTMLSelectElement>("#accent");
    const accentControl = accentSelect?.parentElement;
    let removeAccentPointerListener = () => {};
    let removeAccentStorageListener = () => {};
    if (accentSelect && accentControl) {
      try {
        const savedAccent = window.localStorage.getItem(ACCENT_PREFERENCE_KEY);
        if (savedAccent === "uk" || savedAccent === "us") accentSelect.value = savedAccent;
      } catch {}
      const persistAccent = () => {
        if (accentSelect.value !== "uk" && accentSelect.value !== "us") return;
        try { window.localStorage.setItem(ACCENT_PREFERENCE_KEY, accentSelect.value); } catch {}
      };
      accentSelect.addEventListener("change", persistAccent);
      removeAccentStorageListener = () => accentSelect.removeEventListener("change", persistAccent);

      accentSelect.classList.add("native-accent-select");
      const trigger = document.createElement("button");
      trigger.type = "button";
      trigger.className = "accent-trigger";
      trigger.setAttribute("role", "combobox");
      trigger.setAttribute("aria-label", "Pronunciation accent");
      trigger.setAttribute("aria-haspopup", "listbox");
      trigger.setAttribute("aria-expanded", "false");
      trigger.textContent = accentSelect.selectedOptions[0]?.textContent ?? "British English";

      const menu = document.createElement("div");
      menu.className = "accent-menu";
      menu.setAttribute("role", "listbox");
      menu.setAttribute("aria-label", "Choose pronunciation accent");
      menu.hidden = true;

      const closeMenu = () => {
        menu.hidden = true;
        trigger.setAttribute("aria-expanded", "false");
      };
      const updateOptions = () => {
        for (const option of Array.from(menu.querySelectorAll<HTMLButtonElement>(".accent-option"))) {
          option.setAttribute("aria-selected", String(option.dataset.value === accentSelect.value));
        }
      };
      for (const option of Array.from(accentSelect.options)) {
        const choice = document.createElement("button");
        choice.type = "button";
        choice.className = "accent-option";
        choice.setAttribute("role", "option");
        choice.dataset.value = option.value;
        choice.textContent = option.textContent;
        choice.setAttribute("aria-selected", String(option.value === accentSelect.value));
        choice.addEventListener("click", () => {
          accentSelect.value = option.value;
          trigger.textContent = option.textContent;
          accentSelect.dispatchEvent(new Event("change", { bubbles: true }));
          updateOptions();
          closeMenu();
          trigger.focus();
        });
        menu.append(choice);
      }
      trigger.setAttribute("aria-controls", "accent-options");
      menu.id = "accent-options";
      trigger.addEventListener("click", () => {
        const open = trigger.getAttribute("aria-expanded") === "true";
        menu.hidden = open;
        trigger.setAttribute("aria-expanded", String(!open));
      });
      trigger.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeMenu();
      });
      const handleOutsidePointer = (event: Event) => {
        if (!accentControl.contains(event.target as Node)) closeMenu();
      };
      shadow.addEventListener("pointerdown", handleOutsidePointer);
      removeAccentPointerListener = () => shadow.removeEventListener("pointerdown", handleOutsidePointer);
      accentControl.append(trigger, menu);
    }

    const gameWindow = window as GameWindow;
    gameWindow.__brenupIpaSnakesCleanup?.();
    gameWindow.__brenupIpaSnakesRoot = shadow;

    const scopedScript = game.script
      .replace("const animatedSnakes=[];", "const animatedSnakes=[]; let snakeAnimationFrame=0; let gameDisposed=false;")
      .replaceAll("requestAnimationFrame(animateSnakeBodies);", "snakeAnimationFrame=requestAnimationFrame(animateSnakeBodies);")
      .replace("function animateSnakeBodies(timestamp){", "function animateSnakeBodies(timestamp){if(gameDisposed)return;");
    const script = document.createElement("script");
    script.textContent = `(function(gameRoot){
      const document = new Proxy(window.document, {
        get(target, property) {
          if (property === "getElementById") return (id) => gameRoot.querySelector("#" + CSS.escape(id));
          if (property === "querySelector") return gameRoot.querySelector.bind(gameRoot);
          if (property === "querySelectorAll") return gameRoot.querySelectorAll.bind(gameRoot);
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        }
      });
      ${scopedScript}
      window.__brenupIpaSnakesCleanup = () => {
        gameDisposed = true;
        if (snakeAnimationFrame) cancelAnimationFrame(snakeAnimationFrame);
        if (musicTimer) clearInterval(musicTimer);
        if (currentAudio) currentAudio.pause();
        if ("speechSynthesis" in window) window.speechSynthesis.cancel();
        if (audioContext && audioContext.state !== "closed") void audioContext.close();
      };
    })(window.__brenupIpaSnakesRoot);`;
    document.body.append(script);
    script.remove();
    delete gameWindow.__brenupIpaSnakesRoot;

    return () => {
      gameWindow.__brenupIpaSnakesCleanup?.();
      delete gameWindow.__brenupIpaSnakesCleanup;
      removeAccentPointerListener();
      removeAccentStorageListener();
      shadow.replaceChildren();
    };
  }, [game]);

  return <div ref={host} className="w-full min-w-0" aria-label="IPA Snakes and Ladders game" />;
}
