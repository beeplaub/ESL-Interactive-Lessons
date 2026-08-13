"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type BuilderPreviewDevice = "DESKTOP" | "TABLET" | "MOBILE";

const deviceWidths: Record<BuilderPreviewDevice, string> = {
  DESKTOP: "100%",
  TABLET: "768px",
  MOBILE: "390px",
};

type Props = {
  children: ReactNode;
  device: BuilderPreviewDevice;
  title: string;
  minHeight?: number;
};

function copyDocumentTheme(source: Document, target: Document) {
  target.head.querySelectorAll("[data-builder-preview-style]").forEach((node) => node.remove());
  source.head.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
    const clone = node.cloneNode(true) as HTMLElement;
    clone.setAttribute("data-builder-preview-style", "true");
    target.head.appendChild(clone);
  });

  for (const attribute of Array.from(source.documentElement.attributes)) {
    if (attribute.name === "class" || attribute.name === "style" || attribute.name.startsWith("data-")) {
      target.documentElement.setAttribute(attribute.name, attribute.value);
    }
  }

  target.body.className = source.body.className;
  target.body.style.cssText = "margin:0;min-width:0;overflow:hidden;background:transparent;";
}

/** A real responsive viewport for the interactive builder preview. */
export function BuilderDevicePreviewFrame({ children, device, title, minHeight = 480 }: Props) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [frameBody, setFrameBody] = useState<HTMLElement | null>(null);
  const [height, setHeight] = useState(minHeight);

  const prepareFrame = useCallback(() => {
    const frame = frameRef.current;
    const document = frame?.contentDocument;
    if (!frame || !document?.body) return;
    copyDocumentTheme(window.document, document);
    setFrameBody(document.body);
  }, []);

  useEffect(() => {
    if (!frameBody) return;
    if (!frameRef.current?.contentWindow) return;

    const updateHeight = () => {
      const nextHeight = Math.max(minHeight, Math.ceil(frameBody.scrollHeight));
      setHeight((current) => current === nextHeight ? current : nextHeight);
    };
    const observer = new ResizeObserver(updateHeight);
    observer.observe(frameBody);
    updateHeight();
    return () => observer.disconnect();
  }, [frameBody, minHeight, children, device]);

  return (
    <div className="w-full overflow-x-auto pb-1">
      <iframe
        ref={frameRef}
        title={title}
        srcDoc="<!doctype html><html><head></head><body></body></html>"
        onLoad={prepareFrame}
        allowFullScreen
        className="mx-auto block max-w-none border-0 bg-transparent transition-[width,height] duration-300"
        style={{ width: deviceWidths[device], height }}
        data-preview-device={device.toLowerCase()}
      />
      {frameBody ? createPortal(children, frameBody) : null}
    </div>
  );
}
