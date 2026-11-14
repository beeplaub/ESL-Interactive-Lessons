"use client";

import { Plus, X } from "lucide-react";
import { useState } from "react";

export type TableMergeRegion = { startRow: number; startCol: number; rowSpan: number; colSpan: number };

export function ModernTableGrid({ headers, rows, setHeaders, setRows, onAddRow, onRemoveRow, onAddColumn, onRemoveColumn, merges = [], onMerge, onUnmerge, bengali = false }: {
  headers: string[];
  rows: string[][];
  setHeaders: (headers: string[] | ((current: string[]) => string[])) => void;
  setRows: (rows: string[][] | ((current: string[][]) => string[][])) => void;
  onAddRow: () => void;
  onRemoveRow: (index: number) => void;
  onAddColumn: () => void;
  onRemoveColumn: (index: number) => void;
  merges?: TableMergeRegion[];
  onMerge?: (region: TableMergeRegion) => string | null | void;
  onUnmerge?: (region: TableMergeRegion) => void;
  bengali?: boolean;
}) {
  const [mergeMode, setMergeMode] = useState(false);
  const [selection, setSelection] = useState<TableMergeRegion | null>(null);
  const [mergeError, setMergeError] = useState<string | null>(null);
  const selectionArea = selection ? selection.rowSpan * selection.colSpan : 0;
  const selectedMerge = selection && merges.find((region) => region.startRow === selection.startRow && region.startCol === selection.startCol && region.rowSpan === selection.rowSpan && region.colSpan === selection.colSpan);
  const isCovered = (row: number, col: number) => merges.some((region) => row >= region.startRow && row < region.startRow + region.rowSpan && col >= region.startCol && col < region.startCol + region.colSpan && !(row === region.startRow && col === region.startCol));
  const mergeAt = (row: number, col: number) => merges.find((region) => row === region.startRow && col === region.startCol);
  const isSelected = (row: number, col: number) => Boolean(selection && row >= selection.startRow && row < selection.startRow + selection.rowSpan && col >= selection.startCol && col < selection.startCol + selection.colSpan);
  function chooseCell(row: number, col: number) {
    const existing = mergeAt(row, col);
    if (existing) { setSelection(existing); return; }
    setMergeError(null);
    if (!selection || !mergeMode || selectionArea > 1) setSelection({ startRow: row, startCol: col, rowSpan: 1, colSpan: 1 });
    else setSelection({ startRow: Math.min(row, selection.startRow), startCol: Math.min(col, selection.startCol), rowSpan: Math.abs(row - selection.startRow) + 1, colSpan: Math.abs(col - selection.startCol) + 1 });
  }
  const overlapping = selection ? merges.some((region) => selection.startRow < region.startRow + region.rowSpan && selection.startRow + selection.rowSpan > region.startRow && selection.startCol < region.startCol + region.colSpan && selection.startCol + selection.colSpan > region.startCol) : false;
  return <section className="overflow-hidden rounded-2xl border border-[var(--br-border)] bg-white shadow-[0_8px_24px_rgba(38,35,78,0.06)]">
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--br-border)] bg-[var(--br-surface-muted)]/60 px-3 py-2.5 sm:px-4">
      <div><p className="text-sm font-bold text-[var(--br-dark-card)]">{bengali ? "সারণির ঘর" : "Table cells"}</p><p className="text-xs text-[var(--br-text-muted)]">{rows.length} rows · {headers.length} columns</p></div>
      <div className="flex items-center gap-2"><button type="button" onClick={() => { setMergeMode((active) => !active); setSelection(null); }} aria-pressed={mergeMode} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition ${mergeMode ? "border-[var(--br-brand)] bg-[var(--br-brand-soft)]/35 text-[var(--br-brand)]" : "border-[var(--br-border)] bg-white text-[var(--br-text-muted)] hover:border-[var(--br-brand)]/40 hover:text-[var(--br-brand)]"}`}>Merge cells</button><button type="button" onClick={onAddColumn} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--br-border)] bg-white px-3 py-2 text-xs font-bold text-[var(--br-brand)] transition hover:border-[var(--br-brand)]/40 hover:bg-[var(--br-brand-soft)]/30"><Plus size={14} /> Add column</button></div>
    </div>
    {mergeMode ? <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--br-brand)]/15 bg-[var(--br-brand-soft)]/15 px-3 py-2 text-xs"><span className="text-[var(--br-text-muted)]">Select the first and last cells in a rectangular range. The merge applies to both languages.</span>{selectedMerge ? <button type="button" onClick={() => { onUnmerge?.(selectedMerge); setSelection(null); }} className="rounded-lg border border-[var(--br-brand)]/25 bg-white px-3 py-1.5 font-bold text-[var(--br-brand)]">Unmerge cells</button> : selectionArea > 1 && !overlapping ? <button type="button" onClick={() => { const error = onMerge?.(selection!); if (error) { setMergeError(error); return; } setSelection(null); setMergeMode(false); }} className="rounded-lg bg-[var(--br-action)] px-3 py-1.5 font-bold text-white">Merge {selectionArea} cells</button> : null}{overlapping && !selectedMerge ? <p className="basis-full text-[var(--br-text-muted)]">Unmerge an existing area before selecting cells that overlap it.</p> : null}{mergeError ? <p className="basis-full text-[var(--br-danger)]">{mergeError}</p> : null}</div> : null}
    <div className="overflow-x-auto">
      <table className="w-full min-w-[500px] border-collapse text-sm">
        <thead><tr className="bg-white">
          <th className="w-10 border-b border-r border-[var(--br-border)] bg-[var(--br-surface-muted)]/60 p-2 text-center text-[10px] font-bold text-[var(--br-text-muted)]">#</th>
          {headers.map((header, col) => <th key={col} className="min-w-36 border-b border-r border-[var(--br-border)] p-1.5 text-left"><input value={header} onChange={(event) => setHeaders((current) => current.map((value, index) => index === col ? event.target.value : value))} placeholder={bengali ? `কলাম ${col + 1}` : `Column ${col + 1}`} className="w-full rounded-lg bg-transparent px-2.5 py-2 font-bold text-[var(--br-dark-card)] outline-none transition placeholder:font-medium placeholder:text-[var(--br-text-muted)]/70 hover:bg-[var(--br-surface-muted)]/60 focus:bg-white focus:ring-1 focus:ring-[var(--br-brand)]/25" />{headers.length > 1 ? <button type="button" title="Remove column" onClick={() => onRemoveColumn(col)} className="ml-2 text-[var(--br-text-muted)] hover:text-coral"><X size={13} /></button> : null}</th>)}
        </tr></thead>
        <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex} className="group/row hover:bg-[var(--br-surface-muted)]/30">
          <td className="border-b border-r border-[var(--br-border)] bg-[var(--br-surface-muted)]/45 px-2 text-center text-xs font-semibold text-[var(--br-text-muted)]">{rowIndex + 1}</td>
          {headers.map((_, colIndex) => { if (isCovered(rowIndex, colIndex)) return null; const merge = mergeAt(rowIndex, colIndex); return <td key={colIndex} rowSpan={merge?.rowSpan} colSpan={merge?.colSpan} onClick={mergeMode ? () => chooseCell(rowIndex, colIndex) : undefined} className={`border-b border-r border-[var(--br-border)] p-1 ${merge ? "align-middle" : ""} ${isSelected(rowIndex, colIndex) ? "bg-[var(--br-brand-soft)]/35" : ""}`}><input lang={bengali ? "bn" : undefined} readOnly={mergeMode} value={row[colIndex] || ""} onClick={mergeMode ? () => chooseCell(rowIndex, colIndex) : undefined} onChange={(event) => setRows((current) => current.map((r, ri) => ri === rowIndex ? r.map((cell, ci) => ci === colIndex ? event.target.value : cell) : r))} onKeyDown={(event) => { if (event.key === "Enter" && rowIndex === rows.length - 1) { event.preventDefault(); onAddRow(); } }} placeholder={bengali ? "লিখুন…" : "Type here…"} className={`min-h-10 w-full rounded-lg bg-transparent px-2.5 py-2 text-[var(--br-text)] outline-none transition placeholder:text-[var(--br-text-muted)]/60 hover:bg-white focus:bg-white focus:ring-1 focus:ring-[var(--br-brand)]/25 ${merge ? "h-full min-h-[3rem] text-center" : ""}`} /></td>; })}
          <td className="w-9 border-b border-[var(--br-border)] px-1 text-center"><button type="button" title="Remove row" onClick={() => onRemoveRow(rowIndex)} disabled={rows.length <= 1} className="rounded-md p-1 text-[var(--br-text-muted)] opacity-0 transition hover:bg-coral/10 hover:text-coral disabled:hidden group-hover/row:opacity-100 focus:opacity-100"><X size={14} /></button></td>
        </tr>)}</tbody>
      </table>
    </div>
    <button type="button" onClick={onAddRow} className="m-2 inline-flex items-center gap-1.5 rounded-lg bg-[var(--br-action)] px-3 py-2 text-xs font-bold text-white transition hover:brightness-95"><Plus size={14} /> Add row</button>
  </section>;
}

