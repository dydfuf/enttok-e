import { useEffect, useRef, useMemo } from "react";
import { EditorView, keymap, placeholder, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from "@codemirror/view";
import { EditorState, Compartment } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { syntaxHighlighting, defaultHighlightStyle, bracketMatching, indentOnInput } from "@codemirror/language";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { autocompletion, completionKeymap } from "@codemirror/autocomplete";
import { oneDark } from "@codemirror/theme-one-dark";
import { cn } from "@/lib/utils";

interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholderText?: string;
  readOnly?: boolean;
}

// Custom light theme matching Tailwind CSS variables
const lightTheme = EditorView.theme({
  "&": {
    backgroundColor: "hsl(var(--background))",
    color: "hsl(var(--foreground))",
    height: "100%",
  },
  ".cm-content": {
    caretColor: "hsl(var(--primary))",
    fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
    fontSize: "14px",
    lineHeight: "1.6",
    padding: "16px 0",
  },
  ".cm-cursor": {
    borderLeftColor: "hsl(var(--primary))",
    borderLeftWidth: "2px",
  },
  ".cm-selectionBackground": {
    backgroundColor: "hsl(var(--accent)) !important",
  },
  "&.cm-focused .cm-selectionBackground": {
    backgroundColor: "hsl(var(--accent)) !important",
  },
  ".cm-gutters": {
    backgroundColor: "hsl(var(--muted))",
    color: "hsl(var(--muted-foreground))",
    border: "none",
    paddingRight: "8px",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "hsl(var(--accent))",
  },
  ".cm-activeLine": {
    backgroundColor: "hsl(var(--accent) / 0.3)",
  },
  ".cm-line": {
    padding: "0 16px",
  },
  ".cm-scroller": {
    overflow: "auto",
  },
  ".cm-placeholder": {
    color: "hsl(var(--muted-foreground))",
  },
}, { dark: false });

// Dark theme extension
const darkTheme = EditorView.theme({
  "&": {
    backgroundColor: "hsl(var(--background))",
    color: "hsl(var(--foreground))",
    height: "100%",
  },
  ".cm-content": {
    caretColor: "hsl(var(--primary))",
    fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
    fontSize: "14px",
    lineHeight: "1.6",
    padding: "16px 0",
  },
  ".cm-cursor": {
    borderLeftColor: "hsl(var(--primary))",
    borderLeftWidth: "2px",
  },
  ".cm-selectionBackground": {
    backgroundColor: "hsl(var(--accent)) !important",
  },
  "&.cm-focused .cm-selectionBackground": {
    backgroundColor: "hsl(var(--accent)) !important",
  },
  ".cm-gutters": {
    backgroundColor: "hsl(var(--muted))",
    color: "hsl(var(--muted-foreground))",
    border: "none",
    paddingRight: "8px",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "hsl(var(--accent))",
  },
  ".cm-activeLine": {
    backgroundColor: "hsl(var(--accent) / 0.3)",
  },
  ".cm-line": {
    padding: "0 16px",
  },
  ".cm-scroller": {
    overflow: "auto",
  },
  ".cm-placeholder": {
    color: "hsl(var(--muted-foreground))",
  },
}, { dark: true });

export function MarkdownEditor({
  value,
  onChange,
  className,
  placeholderText = "Start writing...",
  readOnly = false,
}: MarkdownEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment());
  const readOnlyCompartment = useRef(new Compartment());

  // Check initial dark mode
  const isDark = useMemo(() => {
    if (typeof document !== "undefined") {
      return document.documentElement.classList.contains("dark");
    }
    return false;
  }, []);

  // Initialize editor
  useEffect(() => {
    if (!containerRef.current) return;

    const extensions = [
      lineNumbers(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      history(),
      bracketMatching(),
      indentOnInput(),
      highlightSelectionMatches(),
      markdown({
        base: markdownLanguage,
        codeLanguages: languages,
      }),
      syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
      keymap.of([
        ...defaultKeymap,
        ...historyKeymap,
        ...searchKeymap,
        ...completionKeymap,
      ]),
      autocompletion(),
      placeholder(placeholderText),
      themeCompartment.current.of(isDark ? [oneDark, darkTheme] : [lightTheme]),
      readOnlyCompartment.current.of(EditorState.readOnly.of(readOnly)),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const newValue = update.state.doc.toString();
          onChange(newValue);
        }
      }),
      EditorView.lineWrapping,
    ];

    const state = EditorState.create({
      doc: value,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    editorRef.current = view;

    return () => {
      view.destroy();
      editorRef.current = null;
    };
  }, []);

  // Watch for dark mode changes
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.attributeName === "class") {
          const isDarkMode = document.documentElement.classList.contains("dark");
          if (editorRef.current) {
            editorRef.current.dispatch({
              effects: themeCompartment.current.reconfigure(
                isDarkMode ? [oneDark, darkTheme] : [lightTheme]
              ),
            });
          }
        }
      }
    });

    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, []);

  // Update content when value prop changes externally
  useEffect(() => {
    if (editorRef.current) {
      const currentValue = editorRef.current.state.doc.toString();
      if (value !== currentValue) {
        editorRef.current.dispatch({
          changes: {
            from: 0,
            to: currentValue.length,
            insert: value,
          },
        });
      }
    }
  }, [value]);

  // Update readOnly state
  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.dispatch({
        effects: readOnlyCompartment.current.reconfigure(
          EditorState.readOnly.of(readOnly)
        ),
      });
    }
  }, [readOnly]);

  return (
    <div
      ref={containerRef}
      className={cn("h-full w-full overflow-hidden", className)}
    />
  );
}

export default MarkdownEditor;
