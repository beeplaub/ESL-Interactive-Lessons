"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/core";
import {
  ArrowUpRight,
  Circle,
  Diamond,
  Eraser,
  Highlighter,
  ImagePlus,
  Minus,
  MousePointer2,
  Move,
  PenLine,
  Plus,
  Redo2,
  Square,
  Target,
  Trash2,
  Triangle,
  Type,
  Undo2,
} from "lucide-react";
import {
  BOARD_HEIGHT,
  BOARD_WIDTH,
  emptyDocument,
  type BoardObject,
} from "@/lib/instant-live/types";
import { BoardText, TextToolbar } from "./BoardText";

type Tool = "select" | "pan" | "pointer" | "eraser" | BoardObject["kind"];
const tools: Array<{ id: Tool; label: string; Icon: typeof PenLine }> = [
  { id: "select", label: "Select (V)", Icon: MousePointer2 },
  { id: "pen", label: "Pen (P)", Icon: PenLine },
  { id: "highlighter", label: "Highlighter (H)", Icon: Highlighter },
  { id: "eraser", label: "Eraser (E)", Icon: Eraser },
  { id: "pointer", label: "Laser pointer (L)", Icon: Target },
  { id: "pan", label: "Pan board", Icon: Move },
  { id: "text", label: "Text (T)", Icon: Type },
  { id: "rectangle", label: "Rectangle", Icon: Square },
  { id: "ellipse", label: "Ellipse", Icon: Circle },
  { id: "line", label: "Line", Icon: Minus },
  { id: "arrow", label: "Arrow", Icon: ArrowUpRight },
  { id: "triangle", label: "Triangle", Icon: Triangle },
  { id: "diamond", label: "Diamond", Icon: Diamond },
];
export function LiveBoard({
  objects,
  onChange,
  canEdit,
  roomId,
  onAddImage,
  pointer,
  onPointer,
}: {
  objects: BoardObject[];
  onChange: (objects: BoardObject[], committed?: boolean) => void;
  canEdit: boolean;
  roomId: string;
  onAddImage: () => void;
  pointer: [number, number] | null;
  onPointer: (point: [number, number] | null) => void;
}) {
  const [tool, setTool] = useState<Tool>("select");
  const [color, setColor] = useState("#635bdf");
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const svg = useRef<SVGSVGElement>(null);
  const current = useRef(objects);
  current.current = objects;
  const callbacks = useRef({ onChange, onPointer });
  callbacks.current = { onChange, onPointer };
  const history = useRef<BoardObject[][]>([]);
  const future = useRef<BoardObject[][]>([]);
  const drag = useRef<{
    action: "draw" | "move" | "resize" | "pan";
    start: [number, number];
    object?: BoardObject;
    pan?: { x: number; y: number };
  } | null>(null);
  const pointers = useRef(new Map<number, [number, number]>());
  const pinch = useRef<{ distance: number; zoom: number } | null>(null);
  const selectedObject = objects.find((object) => object.id === selected);
  const checkpoint = () => {
    history.current.push(structuredClone(current.current));
    if (history.current.length > 40) history.current.shift();
    future.current = [];
  };
  const undo = useCallback(() => {
    const previous = history.current.pop();
    if (!previous) return;
    future.current.push(current.current);
    callbacks.current.onChange(previous, true);
    setSelected(null);
    setEditing(null);
  }, []);
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    history.current.push(current.current);
    callbacks.current.onChange(next, true);
    setSelected(null);
    setEditing(null);
  }, []);
  const update = (object: BoardObject, committed = false) =>
    onChange(
      current.current.some((item) => item.id === object.id)
        ? current.current.map((item) => (item.id === object.id ? object : item))
        : [...current.current, object],
      committed,
    );
  const remove = useCallback(() => {
    if (!selected) return;
    history.current.push(structuredClone(current.current));
    future.current = [];
    callbacks.current.onChange(
      current.current.filter((item) => item.id !== selected),
      true,
    );
    setSelected(null);
    setEditing(null);
  }, [selected]);
  function choose(next: Tool) {
    setTool(next);
    setEditing(null);
    onPointer(null);
  }
  useEffect(() => {
    if (!canEdit) return;
    const handle = (event: KeyboardEvent) => {
      if (
        (event.target as HTMLElement).closest(
          "input,textarea,select,[contenteditable=true]",
        )
      )
        return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
        event.preventDefault();
        redo();
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        remove();
      }
      if (event.key === "Escape") {
        setEditing(null);
        setSelected(null);
        callbacks.current.onPointer(null);
      }
      const shortcuts: Record<string, Tool> = {
        v: "select",
        p: "pen",
        h: "highlighter",
        e: "eraser",
        t: "text",
        l: "pointer",
      };
      if (
        !event.ctrlKey &&
        !event.metaKey &&
        shortcuts[event.key.toLowerCase()]
      ) {
        setTool(shortcuts[event.key.toLowerCase()]);
        callbacks.current.onPointer(null);
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [canEdit, redo, remove, undo]);
  function point(event: React.PointerEvent): [number, number] {
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) return [0, 0];
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      matrix.inverse(),
    );
    return [(p.x - pan.x) / zoom, (p.y - pan.y) / zoom];
  }
  function nearestObject(p: [number, number], tolerance: number): BoardObject | undefined {
    const distanceToSegment = (
      point: [number, number],
      a: [number, number],
      b: [number, number],
    ) => {
      const dx = b[0] - a[0], dy = b[1] - a[1];
      const lengthSquared = dx * dx + dy * dy;
      const t = lengthSquared
        ? Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSquared))
        : 0;
      return Math.hypot(point[0] - (a[0] + t * dx), point[1] - (a[1] + t * dy));
    };
    let best: { object: BoardObject; distance: number; order: number } | undefined;
    current.current.forEach((object, order) => {
      let distance: number;
      if (object.kind === "pen" || object.kind === "highlighter" || object.kind === "line" || object.kind === "arrow") {
        const points = (object.points ?? []).map(([x, y]) => [object.x + x, object.y + y] as [number, number]);
        if (points.length < 2) points.push([object.x + object.w, object.y + object.h]);
        distance = points.slice(1).reduce(
          (minimum, next, index) => Math.min(minimum, distanceToSegment(p, points[index], next)),
          Number.POSITIVE_INFINITY,
        );
        distance = Math.max(0, distance - object.stroke / 2);
      } else {
        const left = Math.min(object.x, object.x + object.w);
        const right = Math.max(object.x, object.x + object.w);
        const top = Math.min(object.y, object.y + object.h);
        const bottom = Math.max(object.y, object.y + object.h);
        const dx = Math.max(left - p[0], 0, p[0] - right);
        const dy = Math.max(top - p[1], 0, p[1] - bottom);
        distance = Math.hypot(dx, dy);
      }
      if (distance <= tolerance && (!best || distance < best.distance || (distance === best.distance && order > best.order)))
        best = { object, distance, order };
    });
    return best?.object;
  }
  function start(event: React.PointerEvent<SVGSVGElement>) {
    if ((event.target as Element).closest("[data-text-editing=true]")) return;
    pointers.current.set(event.pointerId, [event.clientX, event.clientY]);
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinch.current = { distance: Math.hypot(a[0] - b[0], a[1] - b[1]), zoom };
      drag.current = null;
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    const p = point(event);
    if (!canEdit || tool === "pan") {
      drag.current = {
        action: "pan",
        start: [event.clientX, event.clientY],
        pan,
      };
      return;
    }
    const hitId = (event.target as Element)
      .closest("[data-object]")
      ?.getAttribute("data-object");
    const hit = current.current.find((item) => item.id === hitId);
    if (tool === "pointer") {
      onPointer(p);
      return;
    }
    if (tool === "eraser") {
      const rect = svg.current?.getBoundingClientRect();
      const targetTolerance = rect ? (24 * BOARD_WIDTH * zoom) / rect.width : 24;
      const erased = hit ?? nearestObject(p, targetTolerance);
      if (erased) {
        checkpoint();
        onChange(
          current.current.filter((item) => item.id !== erased.id),
          true,
        );
      }
      return;
    }
    if (tool === "select") {
      setSelected(hit?.id ?? null);
      // A single click on saved text should reopen its editor and toolbar.
      // Pointer movement still moves/resizes the selected object.
      setEditing(hit?.kind === "text" ? hit.id : null);
      if (hit) {
        checkpoint();
        drag.current = {
          action: (event.target as Element).hasAttribute("data-resize")
            ? "resize"
            : "move",
          start: p,
          object: structuredClone(hit),
        };
      }
      return;
    }
    setEditing(null);
    checkpoint();
    const object: BoardObject = {
      id: crypto.randomUUID(),
      kind: tool as BoardObject["kind"],
      x: p[0],
      y: p[1],
      w: 1,
      h: 1,
      color,
      stroke: tool === "highlighter" ? 18 : 3,
    };
    if (tool === "text") {
      object.color = "#24203d";
      object.w = 340;
      object.h = 60;
      object.document = structuredClone(emptyDocument);
      update(object, true);
      setSelected(object.id);
      setEditing(object.id);
      setTool("select");
      return;
    }
    object.points = [[0, 0]];
    update(object);
    drag.current = { action: "draw", start: p, object };
    setSelected(null);
  }
  function move(event: React.PointerEvent<SVGSVGElement>) {
    if (pointers.current.has(event.pointerId))
      pointers.current.set(event.pointerId, [event.clientX, event.clientY]);
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      setZoom(
        Math.min(
          4,
          Math.max(
            0.25,
            (pinch.current.zoom * Math.hypot(a[0] - b[0], a[1] - b[1])) /
              pinch.current.distance,
          ),
        ),
      );
      return;
    }
    if (canEdit && tool === "pointer") {
      onPointer(point(event));
      return;
    }
    const d = drag.current;
    if (!d) return;
    if (d.action === "pan") {
      const scale =
        BOARD_WIDTH /
        (svg.current?.getBoundingClientRect().width || BOARD_WIDTH);
      setPan({
        x: d.pan!.x + (event.clientX - d.start[0]) * scale,
        y: d.pan!.y + (event.clientY - d.start[1]) * scale,
      });
      return;
    }
    const p = point(event),
      dx = p[0] - d.start[0],
      dy = p[1] - d.start[1],
      original = d.object!;
    if (d.action === "move") {
      update({
        ...original,
        x: Math.min(2400, Math.max(-1200, original.x + dx)),
        y: Math.min(1400, Math.max(-700, original.y + dy)),
      });
      return;
    }
    if (d.action === "resize") {
      const w = Math.min(2000, Math.max(40, original.w + dx));
      update({
        ...original,
        w,
        h:
          original.kind === "image" && !event.shiftKey
            ? (w * original.h) / original.w
            : Math.min(1200, Math.max(30, original.h + dy)),
      });
      return;
    }
    if (original.kind === "pen" || original.kind === "highlighter") {
      if ((original.points?.length ?? 0) < 3000)
        original.points?.push([
          Math.min(3600, Math.max(-2400, dx)),
          Math.min(2100, Math.max(-1400, dy)),
        ]);
      update({
        ...original,
        points: [...original.points!],
        w: Math.max(1, ...original.points!.map(([x]) => Math.abs(x))),
        h: Math.max(1, ...original.points!.map(([, y]) => Math.abs(y))),
      });
    } else
      update({
        ...original,
        x: Math.min(d.start[0], p[0]),
        y: Math.min(d.start[1], p[1]),
        w: Math.max(1, Math.abs(dx)),
        h: Math.max(1, Math.abs(dy)),
        points: [
          [dx < 0 ? Math.abs(dx) : 0, dy < 0 ? Math.abs(dy) : 0],
          [dx < 0 ? 0 : Math.abs(dx), dy < 0 ? 0 : Math.abs(dy)],
        ],
      });
  }
  function end(event: React.PointerEvent<SVGSVGElement>) {
    pointers.current.delete(event.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (drag.current?.object) onChange(current.current, true);
    drag.current = null;
    if (tool === "pointer") onPointer(null);
  }
  return (
    <div className={`live-board-layout ${canEdit ? "with-tools" : ""}`}>
      {canEdit ? (
        <nav className="live-board-rail" aria-label="Whiteboard tools">
          {tools.map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              aria-label={label}
              title={label}
              aria-pressed={tool === id}
              className={tool === id ? "is-active" : ""}
              onClick={() => choose(id)}
            >
              <Icon size={19} />
            </button>
          ))}
          <button
            type="button"
            aria-label="Add image to whiteboard"
            title="Add image to whiteboard"
            onClick={onAddImage}
          >
            <ImagePlus size={19} />
            <Plus className="tool-plus" size={10} />
          </button>
          <span className="live-tool-divider" />
          <button type="button" aria-label="Undo" title="Undo" onClick={undo}>
            <Undo2 size={18} />
          </button>
          <button type="button" aria-label="Redo" title="Redo" onClick={redo}>
            <Redo2 size={18} />
          </button>
          <input
            aria-label="Ink and shape color"
            title="Ink and shape color"
            type="color"
            value={color}
            onChange={(event) => {
              setColor(event.target.value);
              if (selectedObject && selectedObject.kind !== "text") {
                checkpoint();
                update({ ...selectedObject, color: event.target.value }, true);
              }
            }}
          />
          {selectedObject ? (
            <button
              type="button"
              aria-label="Delete selected object"
              title="Delete selected object"
              onClick={remove}
            >
              <Trash2 size={18} />
            </button>
          ) : null}
        </nav>
      ) : null}
      <div className="live-board-surface">
        {editing && editor && canEdit ? <TextToolbar editor={editor} /> : null}
        <svg
          ref={svg}
          viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`}
          className="live-board-svg"
          aria-label="Shared whiteboard"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          onPointerLeave={() => {
            if (tool === "pointer") onPointer(null);
          }}
          onDoubleClick={(event) => {
            if (!canEdit) return;
            const id = (event.target as Element)
              .closest("[data-object]")
              ?.getAttribute("data-object");
            if (current.current.find((o) => o.id === id)?.kind === "text") {
              checkpoint();
              setSelected(id!);
              setEditing(id!);
              setTool("select");
            }
          }}
        >
          <defs>
            <marker
              id="live-arrow-head"
              markerWidth="8"
              markerHeight="8"
              refX="7"
              refY="4"
              orient="auto-start-reverse"
            >
              <path
                d="M0,0 L8,4 L0,8"
                fill="none"
                stroke="context-stroke"
                strokeWidth="1.5"
              />
            </marker>
          </defs>
          <rect width={BOARD_WIDTH} height={BOARD_HEIGHT} fill="white" />
          <g data-board-document transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
            {objects.map((object) => (
              <g
                key={object.id}
                data-object={object.id}
                transform={`translate(${object.x} ${object.y})`}
                style={{
                  cursor: canEdit
                    ? tool === "select"
                      ? "move"
                      : tool === "text"
                        ? "text"
                        : "crosshair"
                    : "grab",
                }}
              >
                {object.kind === "pen" || object.kind === "highlighter" ? (
                  <>
                    <polyline
                      points={object.points?.map((p) => p.join(",")).join(" ")}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={Math.max(14, object.stroke)}
                      pointerEvents="stroke"
                    />
                    <polyline
                      points={object.points?.map((p) => p.join(",")).join(" ")}
                      fill="none"
                      stroke={object.color}
                      strokeWidth={object.stroke}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={object.kind === "highlighter" ? 0.35 : 1}
                      pointerEvents="none"
                    />
                  </>
                ) : null}
                {object.kind === "rectangle" ? (
                  <rect
                    width={object.w}
                    height={object.h}
                    stroke={object.color}
                    strokeWidth={object.stroke}
                    fill="transparent"
                  />
                ) : null}
                {object.kind === "ellipse" ? (
                  <ellipse
                    cx={object.w / 2}
                    cy={object.h / 2}
                    rx={object.w / 2}
                    ry={object.h / 2}
                    stroke={object.color}
                    strokeWidth={object.stroke}
                    fill="transparent"
                  />
                ) : null}
                {object.kind === "triangle" || object.kind === "diamond" ? (
                  <polygon
                    points={
                      object.kind === "triangle"
                        ? `${object.w / 2},0 ${object.w},${object.h} 0,${object.h}`
                        : `${object.w / 2},0 ${object.w},${object.h / 2} ${object.w / 2},${object.h} 0,${object.h / 2}`
                    }
                    fill="transparent"
                    stroke={object.color}
                    strokeWidth={object.stroke}
                  />
                ) : null}
                {object.kind === "line" || object.kind === "arrow" ? (
                  <line
                    x1={object.points?.[0]?.[0] ?? 0}
                    y1={object.points?.[0]?.[1] ?? 0}
                    x2={object.points?.[1]?.[0] ?? object.w}
                    y2={object.points?.[1]?.[1] ?? object.h}
                    stroke={object.color}
                    strokeWidth={object.stroke}
                    markerEnd={
                      object.kind === "arrow"
                        ? "url(#live-arrow-head)"
                        : undefined
                    }
                  />
                ) : null}
                {object.kind === "image" ? (
                  <image
                    href={`/api/instant-live/rooms/${roomId}/assets/${object.assetId}`}
                    width={object.w}
                    height={object.h}
                    preserveAspectRatio="xMidYMid meet"
                  />
                ) : null}
                {object.kind === "text" ? (
                  <foreignObject
                    width={object.w}
                    height={object.h}
                    overflow="visible"
                    data-text-editing={editing === object.id ? "true" : "false"}
                  >
                    <div
                      style={{
                        color: object.color,
                        pointerEvents:
                          canEdit && tool === "select" ? "auto" : "none",
                      }}
                    >
                      <BoardText
                        document={object.document}
                        editing={canEdit && editing === object.id}
                        onEditor={setEditor}
                        onChange={(document, height) =>
                          update(
                            {
                              ...object,
                              document,
                              h: Math.min(1200, Math.max(object.h, height + 8)),
                            },
                            true,
                          )
                        }
                      />
                    </div>
                  </foreignObject>
                ) : null}
                {canEdit && selected === object.id ? (
                  <>
                    <rect
                      data-export-exclude
                      x={-3}
                      y={-3}
                      width={object.w + 6}
                      height={object.h + 6}
                      fill="none"
                      stroke="#8b83ee"
                      strokeWidth={1 / zoom}
                      pointerEvents="none"
                    />
                    <circle
                      data-export-exclude
                      data-resize
                      cx={object.w + 3}
                      cy={object.h + 3}
                      r={5 / zoom}
                      fill="white"
                      stroke="#8b83ee"
                      strokeWidth={1 / zoom}
                      style={{ cursor: "nwse-resize" }}
                    />
                  </>
                ) : null}
              </g>
            ))}
            {pointer ? (
              <circle
                data-export-exclude
                cx={pointer[0]}
                cy={pointer[1]}
                r={7}
                fill="#ff725e"
                opacity=".9"
                pointerEvents="none"
              />
            ) : null}
          </g>
        </svg>
        <div className="live-board-zoom">
          <button
            aria-label="Zoom out"
            onClick={() => setZoom(Math.max(0.25, +(zoom - 0.1).toFixed(2)))}
          >
            <Minus size={15} />
          </button>
          <button
            onClick={() => {
              setZoom(1);
              setPan({ x: 0, y: 0 });
            }}
            title="Fit board"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            aria-label="Zoom in"
            onClick={() => setZoom(Math.min(4, +(zoom + 0.1).toFixed(2)))}
          >
            <Plus size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
