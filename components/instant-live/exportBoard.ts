import { BOARD_HEIGHT, BOARD_WIDTH } from "@/lib/instant-live/types";

/** Export the document, independent of each viewer's pan/zoom and selection. */
export async function exportBoard(element: SVGSVGElement): Promise<Blob> {
  await document.fonts.ready;
  const copy = element.cloneNode(true) as SVGSVGElement;
  copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  copy.setAttribute("width", String(BOARD_WIDTH * 2));
  copy.setAttribute("height", String(BOARD_HEIGHT * 2));
  copy.style.cssText = "background:white;";
  const originals = element.querySelectorAll("foreignObject *");
  const clones = copy.querySelectorAll("foreignObject *");
  originals.forEach((original, index) => {
    const target = clones[index] as HTMLElement;
    if (!target) return;
    const computed = getComputedStyle(original);
    for (const property of ["font-family", "font-size", "font-weight", "font-style", "color", "line-height", "text-decoration", "text-align", "white-space", "margin", "padding", "display", "list-style-type", "overflow-wrap"]) target.style.setProperty(property, computed.getPropertyValue(property));
    target.removeAttribute("contenteditable");
    target.style.caretColor = "transparent";
  });
  copy.querySelector("[data-board-document]")?.removeAttribute("transform");
  copy.querySelectorAll("[data-export-exclude]").forEach(node => node.remove());
  await Promise.all(Array.from(copy.querySelectorAll("image")).map(async image => {
    const href = image.getAttribute("href");
    if (!href) return;
    const response = await fetch(href);
    if (!response.ok) throw new Error("Could not load a board image. Retry the export.");
    const blob = await response.blob();
    const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(blob); });
    image.setAttribute("href", data);
  }));
  const source = new XMLSerializer().serializeToString(copy);
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
  await image.decode();
  const canvas = document.createElement("canvas"); canvas.width = BOARD_WIDTH * 2; canvas.height = BOARD_HEIGHT * 2;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image export is not supported on this device.");
  context.fillStyle = "white"; context.fillRect(0,0,canvas.width,canvas.height);
  context.drawImage(image,0,0,canvas.width,canvas.height);
  return new Promise((resolve,reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Could not export the whiteboard.")), "image/png"));
}
export function saveLocalFile(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob), link = document.createElement("a");
  link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** Android WebView cannot reliably download a blob URL; save local recordings with SAF instead. */
export type RecordingDirectoryHandle = {
  name: string;
  getFileHandle(name: string, options: { create: boolean }): Promise<{ createWritable(): Promise<{ write(blob: Blob): Promise<void>; close(): Promise<void> }> }>;
};
export async function saveRecordingFile(blob: Blob, name: string, directory?: RecordingDirectoryHandle | null): Promise<boolean> {
  if (directory) {
    const file = await directory.getFileHandle(name, { create: true });
    const writer = await file.createWritable();
    await writer.write(blob);
    await writer.close();
    return true;
  }
  await Promise.resolve(saveLocalFile(blob, name));
  return true;
