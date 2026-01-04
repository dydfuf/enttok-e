import * as React from "react";

export interface SelectionRange {
  from: number;
  to: number;
}

export interface EditorContextValue {
  noteContent: string | null;
  notePath: string | null;
  selectedText: string | null;
  selectionRange: SelectionRange | null;
  includeNoteContext: boolean;

  setNoteContent: (content: string | null) => void;
  setNotePath: (path: string | null) => void;
  setSelection: (text: string | null, range: SelectionRange | null) => void;
  setIncludeNoteContext: (include: boolean) => void;
  clearSelection: () => void;
  appendToNote: (text: string) => void;
}

const EditorContext = React.createContext<EditorContextValue | null>(null);

export function EditorProvider({ children }: { children: React.ReactNode }) {
  const [noteContent, setNoteContent] = React.useState<string | null>(null);
  const [notePath, setNotePath] = React.useState<string | null>(null);
  const [selectedText, setSelectedText] = React.useState<string | null>(null);
  const [selectionRange, setSelectionRange] = React.useState<SelectionRange | null>(null);
  const [includeNoteContext, setIncludeNoteContext] = React.useState(true);

  const setSelection = React.useCallback(
    (text: string | null, range: SelectionRange | null) => {
      setSelectedText(text);
      setSelectionRange(range);
    },
    []
  );

  const clearSelection = React.useCallback(() => {
    setSelectedText(null);
    setSelectionRange(null);
  }, []);

  const appendToNote = React.useCallback((text: string) => {
    if (!text.trim()) return;
    window.dispatchEvent(
      new CustomEvent("editor:append", { detail: { text } })
    );
  }, []);

  const value = React.useMemo<EditorContextValue>(
    () => ({
      noteContent,
      notePath,
      selectedText,
      selectionRange,
      includeNoteContext,
      setNoteContent,
      setNotePath,
      setSelection,
      setIncludeNoteContext,
      clearSelection,
      appendToNote,
    }),
    [
      noteContent,
      notePath,
      selectedText,
      selectionRange,
      includeNoteContext,
      setSelection,
      clearSelection,
      appendToNote,
    ]
  );

  return (
    <EditorContext.Provider value={value}>{children}</EditorContext.Provider>
  );
}

export function useEditor(): EditorContextValue {
  const context = React.useContext(EditorContext);
  if (!context) {
    throw new Error("useEditor must be used within EditorProvider");
  }
  return context;
}

export function useEditorOptional(): EditorContextValue | null {
  return React.useContext(EditorContext);
}
