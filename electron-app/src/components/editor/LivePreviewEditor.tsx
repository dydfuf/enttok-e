import { useEffect, useRef, useMemo } from "react";
import {
  EditorView,
  keymap,
  placeholder,
  highlightActiveLine,
} from "@codemirror/view";
import { EditorState, Compartment } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
  indentOnInput,
  syntaxTree,
} from "@codemirror/language";
import type { SyntaxNodeRef } from "@lezer/common";
import { searchKeymap, highlightSelectionMatches } from "@codemirror/search";
import { autocompletion, completionKeymap } from "@codemirror/autocomplete";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { livePreview } from "./extensions/livePreview";
import { getElectronAPI } from "@/lib/electron";
import {
  joinPath,
  relativePathFromFile,
  validateAssetsFolder,
} from "@/lib/vault-paths";

export interface SelectionInfo {
  text: string;
  from: number;
  to: number;
}

interface LivePreviewEditorProps {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  placeholderText?: string;
  readOnly?: boolean;
  filePath?: string | null;
  vaultPath?: string | null;
  onSelectionChange?: (selection: SelectionInfo | null) => void;
  onOpenNote?: (noteId: string) => void;
}

// Light theme for live preview editor
const lightTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "hsl(var(--background))",
      color: "hsl(var(--foreground))",
      height: "100%",
    },
    ".cm-content": {
      caretColor: "hsl(var(--primary))",
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      fontSize: "16px",
      lineHeight: "1.75",
      padding: "24px 0",
      maxWidth: "65ch",
      margin: "0 auto",
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
    ".cm-activeLine": {
      backgroundColor: "transparent",
    },
    ".cm-line": {
      padding: "0 24px",
    },
    ".cm-scroller": {
      overflow: "auto",
    },
    ".cm-placeholder": {
      color: "hsl(var(--muted-foreground))",
      fontStyle: "italic",
    },
  },
  { dark: false }
);

// Dark theme for live preview editor
const darkTheme = EditorView.theme(
  {
    "&": {
      backgroundColor: "hsl(var(--background))",
      color: "hsl(var(--foreground))",
      height: "100%",
    },
    ".cm-content": {
      caretColor: "hsl(var(--primary))",
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      fontSize: "16px",
      lineHeight: "1.75",
      padding: "24px 0",
      maxWidth: "65ch",
      margin: "0 auto",
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
    ".cm-activeLine": {
      backgroundColor: "transparent",
    },
    ".cm-line": {
      padding: "0 24px",
    },
    ".cm-scroller": {
      overflow: "auto",
    },
    ".cm-placeholder": {
      color: "hsl(var(--muted-foreground))",
      fontStyle: "italic",
    },
  },
  { dark: true }
);

const IMAGE_EXTENSION_MAP: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/heic": "heic",
  "image/heif": "heif",
};

function getImageExtension(mimeType: string): string {
  if (!mimeType) {
    return "png";
  }
  const normalized = mimeType.toLowerCase();
  if (IMAGE_EXTENSION_MAP[normalized]) {
    return IMAGE_EXTENSION_MAP[normalized];
  }
  const suffix = normalized.split("/")[1];
  if (!suffix) {
    return "png";
  }
  if (suffix === "jpeg") {
    return "jpg";
  }
  return suffix;
}

function buildImageFileName(extension: string): string {
  const now = new Date();
  const date = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(
    2,
    "0"
  )}${String(now.getDate()).padStart(2, "0")}`;
  const time = `${String(now.getHours()).padStart(2, "0")}${String(
    now.getMinutes()
  ).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
  const random = Math.random().toString(36).slice(2, 8);
  return `image-${date}-${time}-${random}.${extension}`;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Failed to read image data"));
        return;
      }
      const base64 = reader.result.split(",")[1];
      if (!base64) {
        reject(new Error("Missing image data"));
        return;
      }
      resolve(base64);
    };
    reader.onerror = () => {
      reject(reader.error || new Error("Failed to read image data"));
    };
    reader.readAsDataURL(file);
  });
}

const BARE_URL_REGEX =
  /(?:https?:\/\/|www\.)[^\s<>()]+|mailto:[^\s<>()]+/gi;
const WIKI_LINK_REGEX = /\[\[([^\]]+)\]\]/g;

function stripTrailingPunctuation(url: string): string {
  let trimmed = url;
  while (/[.,;:!?)]$/.test(trimmed)) {
    if (trimmed.endsWith(")")) {
      const openCount = (trimmed.match(/\(/g) ?? []).length;
      const closeCount = (trimmed.match(/\)/g) ?? []).length;
      if (closeCount <= openCount) {
        break;
      }
    }
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed;
}

function normalizeLinkTarget(raw: string): string | null {
  let url = raw.trim();
  if (!url) {
    return null;
  }
  if (url.startsWith("<") && url.endsWith(">")) {
    url = url.slice(1, -1).trim();
  }
  const titleMatch = url.match(/^(\S+)\s+['"].*['"]$/);
  if (titleMatch) {
    url = titleMatch[1];
  }
  url = stripTrailingPunctuation(url);
  if (!url) {
    return null;
  }
  return url;
}

function coerceExternalUrl(raw: string): string | null {
  const normalized = normalizeLinkTarget(raw);
  if (!normalized) {
    return null;
  }
  if (/^www\./i.test(normalized)) {
    return `https://${normalized}`;
  }
  return normalized;
}

function coerceExternalUrlFromNormalized(normalized: string): string | null {
  if (!normalized) {
    return null;
  }
  if (/^www\./i.test(normalized)) {
    return `https://${normalized}`;
  }
  return normalized;
}

function isAllowedExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ["http:", "https:", "mailto:"].includes(parsed.protocol);
  } catch {
    return false;
  }
}

type LinkTarget =
  | { type: "external"; url: string }
  | { type: "note"; noteId: string };

function decodeIfEncoded(value: string): string {
  if (!/%[0-9A-Fa-f]{2}/.test(value)) {
    return value;
  }
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function normalizeNoteTitle(raw: string): string | null {
  let title = raw.trim();
  if (!title) {
    return null;
  }
  title = decodeIfEncoded(title);
  if (!title) {
    return null;
  }
  return title;
}

function sanitizeNoteTitle(raw: string): string | null {
  let title = raw.trim();
  if (!title) {
    return null;
  }
  const aliasSplit = title.split("|");
  title = aliasSplit[0].trim();
  if (!title) {
    return null;
  }
  const hashIndex = title.indexOf("#");
  if (hashIndex !== -1) {
    title = title.slice(0, hashIndex).trim();
  }
  if (!title) {
    return null;
  }
  if (title.toLowerCase().endsWith(".md")) {
    title = title.slice(0, -3).trim();
  }
  if (!title) {
    return null;
  }
  return normalizeNoteTitle(title);
}

function parseNoteTitleFromLinkTarget(raw: string): string | null {
  const normalized = normalizeLinkTarget(raw);
  if (!normalized) {
    return null;
  }
  const noteMatch = normalized.match(/^note:(\/\/)?(.+)$/i);
  if (noteMatch) {
    return sanitizeNoteTitle(noteMatch[2]);
  }
  return null;
}

function buildNoteId(title: string): string {
  return encodeURIComponent(title);
}

function findWikiLinkTarget(
  lineText: string,
  lineStart: number,
  pos: number
): string | null {
  for (const match of lineText.matchAll(WIKI_LINK_REGEX)) {
    const index = match.index ?? 0;
    const from = lineStart + index;
    const to = from + match[0].length;
    if (pos < from || pos > to) {
      continue;
    }
    const rawTitle = match[1];
    const title = sanitizeNoteTitle(rawTitle);
    if (!title) {
      return null;
    }
    return buildNoteId(title);
  }
  return null;
}

function findLinkTargetAtPos(view: EditorView, pos: number): LinkTarget | null {
  const tree = syntaxTree(view.state);
  let node: SyntaxNodeRef | null = tree.resolveInner(pos, -1);

  while (node) {
    if (node.name === "Link") {
      const text = view.state.doc.sliceString(node.from, node.to);
      const match = text.match(/^\[([^\]]*)\]\(([^)]*)\)$/);
      if (match) {
        const noteTitle = parseNoteTitleFromLinkTarget(match[2]);
        if (noteTitle) {
          return { type: "note", noteId: buildNoteId(noteTitle) };
        }
        const normalized = normalizeLinkTarget(match[2]);
        if (!normalized) {
          return null;
        }
        const externalUrl = coerceExternalUrlFromNormalized(normalized);
        if (!externalUrl) {
          return null;
        }
        return { type: "external", url: externalUrl };
      }
    }

    if (node.name === "Autolink" || node.name === "URL") {
      const text = view.state.doc.sliceString(node.from, node.to);
      const externalUrl = coerceExternalUrl(text);
      if (!externalUrl) {
        return null;
      }
      return { type: "external", url: externalUrl };
    }

    node = node.parent;
  }

  const line = view.state.doc.lineAt(pos);
  const wikiTarget = findWikiLinkTarget(line.text, line.from, pos);
  if (wikiTarget) {
    return { type: "note", noteId: wikiTarget };
  }
  for (const match of line.text.matchAll(BARE_URL_REGEX)) {
    const index = match.index ?? 0;
    const from = line.from + index;
    const to = from + match[0].length;
    if (pos >= from && pos <= to) {
      const externalUrl = coerceExternalUrl(match[0]);
      if (!externalUrl) {
        return null;
      }
      return { type: "external", url: externalUrl };
    }
  }

  return null;
}

async function openExternalLink(url: string) {
  if (!isAllowedExternalUrl(url)) {
    toast.error("Unsupported link type");
    return;
  }
  const api = getElectronAPI();
  if (!api) {
    if (typeof window !== "undefined") {
      window.open(url, "_blank", "noopener");
    }
    return;
  }
  try {
    const result = await api.openExternal(url);
    if (!result.success) {
      toast.error(result.error || "Failed to open link");
    }
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Failed to open link");
  }
}

function getClipboardImageFiles(data: DataTransfer | null): File[] {
  if (!data) {
    return [];
  }
  const filesFromItems: File[] = [];
  if (data.items && data.items.length > 0) {
    for (const item of Array.from(data.items)) {
      if (item.kind !== "file" || !item.type.startsWith("image/")) {
        continue;
      }
      const file = item.getAsFile();
      if (file) {
        filesFromItems.push(file);
      }
    }
  }
  if (filesFromItems.length > 0) {
    return pickPrimaryClipboardImages(filesFromItems);
  }

  const filesFromFiles: File[] = [];
  if (data.files && data.files.length > 0) {
    for (const file of Array.from(data.files)) {
      if (file.type.startsWith("image/")) {
        filesFromFiles.push(file);
      }
    }
  }
  return pickPrimaryClipboardImages(filesFromFiles);
}

function pickPrimaryClipboardImages(files: File[]): File[] {
  if (files.length <= 1) {
    return files;
  }
  const namedFiles = files.filter((file) => file.name);
  const uniqueNames = new Set(namedFiles.map((file) => file.name));
  if (uniqueNames.size > 1) {
    return files;
  }
  const preferredTypes = ["image/png", "image/jpeg", "image/webp", "image/gif"];
  for (const type of preferredTypes) {
    const match = files.find((file) => file.type === type);
    if (match) {
      return [match];
    }
  }
  return [files[0]];
}

export function LivePreviewEditor({
  value,
  onChange,
  className,
  placeholderText = "Start writing...",
  readOnly = false,
  filePath = null,
  vaultPath = null,
  onSelectionChange,
  onOpenNote,
}: LivePreviewEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<EditorView | null>(null);
  const themeCompartment = useRef(new Compartment());
  const readOnlyCompartment = useRef(new Compartment());
  const vaultPathRef = useRef<string | null>(vaultPath);
  const filePathRef = useRef<string | null>(filePath);
  const readOnlyRef = useRef(readOnly);
  const selectionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const onOpenNoteRef = useRef(onOpenNote);

  useEffect(() => {
    vaultPathRef.current = vaultPath;
  }, [vaultPath]);

  useEffect(() => {
    filePathRef.current = filePath;
  }, [filePath]);

  useEffect(() => {
    onSelectionChangeRef.current = onSelectionChange;
  }, [onSelectionChange]);

  useEffect(() => {
    onOpenNoteRef.current = onOpenNote;
  }, [onOpenNote]);

  useEffect(() => {
    return () => {
      if (selectionTimeoutRef.current) {
        clearTimeout(selectionTimeoutRef.current);
      }
    };
  }, []);

  const isDark = useMemo(() => {
    if (typeof document !== "undefined") {
      return document.documentElement.classList.contains("dark");
    }
    return false;
  }, []);

  const handlePasteImages = async (view: EditorView, files: File[]) => {
    const api = getElectronAPI();
    if (!api) {
      toast.error("Image paste is unavailable");
      return;
    }
    const currentVaultPath = vaultPathRef.current;
    const currentFilePath = filePathRef.current;
    if (!currentVaultPath || !currentFilePath) {
      toast.error("Save the note before pasting images");
      return;
    }

    let storedAssetsFolder: string | null = null;
    try {
      storedAssetsFolder = await api.getAssetsFolder();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to load assets folder"
      );
    }
    const validation = validateAssetsFolder(storedAssetsFolder);
    if (!validation.valid) {
      toast.error(validation.error || "Invalid assets folder, using default");
    }
    const assetsFolder = validation.normalized;

    const markdownSnippets: string[] = [];

    for (const file of files) {
      try {
        const extension = getImageExtension(file.type);
        const base64 = await readFileAsBase64(file);
        const fileName = buildImageFileName(extension);
        const assetFilePath = joinPath(
          currentVaultPath,
          assetsFolder,
          fileName
        );
        const writeResult = await api.writeBinaryFile(assetFilePath, base64);
        if (!writeResult.success) {
          toast.error(writeResult.error || "Failed to save image");
          continue;
        }
        const relativePath = relativePathFromFile(
          currentFilePath,
          assetFilePath
        );
        markdownSnippets.push(`![](${relativePath})`);
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to paste image"
        );
      }
    }

    if (!markdownSnippets.length || !view.dom.isConnected) {
      return;
    }

    const insertText = markdownSnippets.join("\n");
    const selection = view.state.selection.main;
    view.dispatch({
      changes: {
        from: selection.from,
        to: selection.to,
        insert: insertText,
      },
      selection: { anchor: selection.from + insertText.length },
    });
  };

  // Initialize editor
  useEffect(() => {
    if (!containerRef.current) return;

    const extensions = [
      highlightActiveLine(),
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
      EditorView.domEventHandlers({
        paste: (event, view) => {
          const files = getClipboardImageFiles(event.clipboardData);
          if (files.length === 0) {
            return false;
          }
          event.preventDefault();
          if (readOnlyRef.current) {
            toast.error("Editing is disabled");
            return true;
          }
          void handlePasteImages(view, files);
          return true;
        },
        click: (event, view) => {
          const mouseEvent = event as MouseEvent;
          if (mouseEvent.button !== 0) {
            return false;
          }
          const pos = view.posAtCoords({
            x: mouseEvent.clientX,
            y: mouseEvent.clientY,
          });
          if (pos == null) {
            return false;
          }
          const linkTarget = findLinkTargetAtPos(view, pos);
          if (!linkTarget) {
            return false;
          }
          mouseEvent.preventDefault();
          if (linkTarget.type === "note") {
            if (onOpenNoteRef.current) {
              onOpenNoteRef.current(linkTarget.noteId);
              return true;
            }
            if (typeof window !== "undefined") {
              window.location.hash = `#/notes/${linkTarget.noteId}`;
            }
            return true;
          }
          void openExternalLink(linkTarget.url);
          return true;
        },
      }),
      autocompletion(),
      placeholder(placeholderText),
      themeCompartment.current.of(isDark ? darkTheme : lightTheme),
      readOnlyCompartment.current.of(EditorState.readOnly.of(readOnly)),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const newValue = update.state.doc.toString();
          onChange(newValue);
        }

        if (update.selectionSet || update.docChanged) {
          if (selectionTimeoutRef.current) {
            clearTimeout(selectionTimeoutRef.current);
          }

          selectionTimeoutRef.current = setTimeout(() => {
            const selection = update.state.selection.main;
            const hasSelection = selection.from !== selection.to;

            if (hasSelection && onSelectionChangeRef.current) {
              const selectedText = update.state.sliceDoc(selection.from, selection.to);
              onSelectionChangeRef.current({
                text: selectedText,
                from: selection.from,
                to: selection.to,
              });
            } else if (onSelectionChangeRef.current) {
              onSelectionChangeRef.current(null);
            }
          }, 150);
        }
      }),
      EditorView.lineWrapping,
      // Live preview extension
      livePreview(),
    ];

    const state = EditorState.create({
      doc: value,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    view.dom.dataset.filePath = filePath ?? "";

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
          const isDarkMode =
            document.documentElement.classList.contains("dark");
          if (editorRef.current) {
            editorRef.current.dispatch({
              effects: themeCompartment.current.reconfigure(
                isDarkMode ? darkTheme : lightTheme
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

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.dom.dataset.filePath = filePath ?? "";
    }
  }, [filePath]);

  // Update readOnly state
  useEffect(() => {
    readOnlyRef.current = readOnly;
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

export default LivePreviewEditor;
