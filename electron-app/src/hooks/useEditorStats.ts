import { useMemo } from "react";
import { useEditorOptional } from "@/contexts/EditorContext";

export type EditorStats = {
  wordCount: number;
  charCount: number;
  selectionLength: number;
  cursorLine: number;
  cursorColumn: number;
  hasSelection: boolean;
  isDirty: boolean;
  isSaving: boolean;
};

function countWords(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) {
    return 0;
  }
  return trimmed.split(/\s+/).length;
}

function getLineColumn(text: string, position: number) {
  const safePos = Math.min(Math.max(position, 0), text.length);
  const before = text.slice(0, safePos);
  const line = before.split("\n").length;
  const lastNewline = before.lastIndexOf("\n");
  const column = safePos - lastNewline;
  return { line, column };
}

export function useEditorStats(): EditorStats {
  const editor = useEditorOptional();
  const content = editor?.noteContent ?? "";
  const selectionRange = editor?.selectionRange;
  const isDirty = editor?.isDirty ?? false;
  const isSaving = editor?.isSaving ?? false;

  const cursorIndex = selectionRange ? selectionRange.to : 0;

  const { line, column } = useMemo(
    () => getLineColumn(content, cursorIndex),
    [content, cursorIndex]
  );

  const wordCount = useMemo(() => countWords(content), [content]);
  const charCount = content.length;
  const hasSelection = Boolean(
    selectionRange && selectionRange.from !== selectionRange.to
  );
  const selectionLength = hasSelection && selectionRange
    ? Math.abs(selectionRange.to - selectionRange.from)
    : 0;

  return {
    wordCount,
    charCount,
    selectionLength,
    cursorLine: line,
    cursorColumn: column,
    hasSelection,
    isDirty,
    isSaving,
  };
}
