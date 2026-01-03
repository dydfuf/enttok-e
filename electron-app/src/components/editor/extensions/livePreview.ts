import type { Extension } from "@codemirror/state";
import { ViewPlugin, Decoration, EditorView, WidgetType } from "@codemirror/view";
import type { ViewUpdate, DecorationSet } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import type { SyntaxNodeRef } from "@lezer/common";
import { resolveAssetUrl } from "@/lib/vault-paths";

// Checkbox Widget for task lists
class CheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean, readonly pos: number) {
    super();
  }

  toDOM(view: EditorView): HTMLElement {
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = this.checked;
    checkbox.className = "cm-md-checkbox";
    checkbox.setAttribute("aria-label", this.checked ? "Completed task" : "Incomplete task");

    // Handle click to toggle checkbox
    checkbox.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const pos = this.pos;
      const newChar = this.checked ? " " : "x";
      view.dispatch({
        changes: { from: pos, to: pos + 1, insert: newChar }
      });
    });

    return checkbox;
  }

  eq(other: CheckboxWidget): boolean {
    return other.checked === this.checked && other.pos === this.pos;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

class ImageWidget extends WidgetType {
  constructor(readonly src: string, readonly alt: string) {
    super();
  }

  toDOM(): HTMLElement {
    const wrapper = document.createElement("span");
    wrapper.className = "cm-md-image";

    const image = document.createElement("img");
    image.src = this.src;
    image.alt = this.alt;
    image.loading = "lazy";

    wrapper.appendChild(image);
    return wrapper;
  }

  eq(other: ImageWidget): boolean {
    return other.src === this.src && other.alt === this.alt;
  }
}

// Check if cursor is within a given range (inclusive)
export function isCursorInRange(view: EditorView, from: number, to: number): boolean {
  const { state } = view;
  const selection = state.selection.main;

  // Check if any part of the selection overlaps with the range
  // or if cursor (when no selection) is within the range
  return (selection.from <= to && selection.to >= from);
}

// Check if the line containing the range has cursor
export function isLineWithCursor(view: EditorView, pos: number): boolean {
  const { state } = view;
  const line = state.doc.lineAt(pos);
  const selection = state.selection.main;

  return (selection.from <= line.to && selection.to >= line.from);
}

// Decoration classes for hidden markers
export const hiddenMarkerDecoration = Decoration.mark({ class: "cm-md-hidden" });

// Style decorations for rendered elements
export const boldDecoration = Decoration.mark({ class: "cm-md-bold" });
export const italicDecoration = Decoration.mark({ class: "cm-md-italic" });
export const codeDecoration = Decoration.mark({ class: "cm-md-code" });
export const linkDecoration = Decoration.mark({ class: "cm-md-link" });
export const strikethroughDecoration = Decoration.mark({ class: "cm-md-strikethrough" });

// Heading decorations
export const heading1Decoration = Decoration.mark({ class: "cm-md-heading cm-md-heading-1" });
export const heading2Decoration = Decoration.mark({ class: "cm-md-heading cm-md-heading-2" });
export const heading3Decoration = Decoration.mark({ class: "cm-md-heading cm-md-heading-3" });
export const heading4Decoration = Decoration.mark({ class: "cm-md-heading cm-md-heading-4" });
export const heading5Decoration = Decoration.mark({ class: "cm-md-heading cm-md-heading-5" });
export const heading6Decoration = Decoration.mark({ class: "cm-md-heading cm-md-heading-6" });

export const quoteDecoration = Decoration.mark({ class: "cm-md-quote" });
export const listMarkerDecoration = Decoration.mark({ class: "cm-md-list-marker" });

// Task list decorations
export const taskTextCheckedDecoration = Decoration.mark({ class: "cm-md-task-checked" });


// Type for decoration builder
type DecorationBuilder = {
  add: (from: number, to: number, deco: Decoration) => void;
  addWidget: (pos: number, widget: WidgetType, side?: number) => void;
};

// Process inline emphasis (bold, italic)
function processEmphasis(
  node: SyntaxNodeRef,
  view: EditorView,
  builder: DecorationBuilder
) {
  const { from, to } = node;
  const text = view.state.doc.sliceString(from, to);

  // Skip if cursor is in range
  if (isLineWithCursor(view, from)) return;

  // Detect emphasis type
  const isBold = text.startsWith("**") || text.startsWith("__");
  const starCount = isBold ? 2 : 1;

  if (isBold) {
    // Hide opening markers
    builder.add(from, from + starCount, hiddenMarkerDecoration);
    // Apply bold style
    builder.add(from + starCount, to - starCount, boldDecoration);
    // Hide closing markers
    builder.add(to - starCount, to, hiddenMarkerDecoration);
  } else {
    // Hide opening marker
    builder.add(from, from + starCount, hiddenMarkerDecoration);
    // Apply italic style
    builder.add(from + starCount, to - starCount, italicDecoration);
    // Hide closing marker
    builder.add(to - starCount, to, hiddenMarkerDecoration);
  }
}

type ImageMatch = {
  alt: string;
  url: string;
};

function parseImageMarkdown(text: string): ImageMatch | null {
  const match = text.match(/^!\[([^\]]*)\]\(([^)]*)\)$/);
  if (!match) {
    return null;
  }
  const alt = match[1];
  let url = match[2].trim();
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
  if (!url) {
    return null;
  }
  return { alt, url };
}

function processImage(
  node: SyntaxNodeRef,
  view: EditorView,
  builder: DecorationBuilder
) {
  const { from, to } = node;

  if (isLineWithCursor(view, from)) return;

  const text = view.state.doc.sliceString(from, to);
  const parsed = parseImageMarkdown(text);
  if (!parsed) {
    return;
  }

  const notePath = view.dom.dataset.filePath || null;
  const resolvedSrc = resolveAssetUrl(notePath, parsed.url);
  if (!resolvedSrc) {
    return;
  }

  builder.add(from, to, hiddenMarkerDecoration);
  builder.addWidget(from, new ImageWidget(resolvedSrc, parsed.alt), 1);
}

// Process inline code
function processInlineCode(
  node: SyntaxNodeRef,
  view: EditorView,
  builder: DecorationBuilder
) {
  const { from, to } = node;

  if (isLineWithCursor(view, from)) return;

  // Hide opening backtick
  builder.add(from, from + 1, hiddenMarkerDecoration);
  // Apply code style
  builder.add(from + 1, to - 1, codeDecoration);
  // Hide closing backtick
  builder.add(to - 1, to, hiddenMarkerDecoration);
}

// Process links
function processLink(
  node: SyntaxNodeRef,
  view: EditorView,
  builder: DecorationBuilder
) {
  const { from, to } = node;
  const text = view.state.doc.sliceString(from, to);

  if (isLineWithCursor(view, from)) return;

  // Parse link: [text](url)
  const match = text.match(/^\[([^\]]*)\]\(([^)]*)\)$/);
  if (!match) return;

  const linkTextLength = match[1].length;

  // Hide [
  builder.add(from, from + 1, hiddenMarkerDecoration);
  // Apply link style to text
  builder.add(from + 1, from + 1 + linkTextLength, linkDecoration);
  // Hide ](url)
  builder.add(from + 1 + linkTextLength, to, hiddenMarkerDecoration);
}

// Process strikethrough
function processStrikethrough(
  node: SyntaxNodeRef,
  view: EditorView,
  builder: DecorationBuilder
) {
  const { from, to } = node;

  if (isLineWithCursor(view, from)) return;

  // Hide opening ~~
  builder.add(from, from + 2, hiddenMarkerDecoration);
  // Apply strikethrough style
  builder.add(from + 2, to - 2, strikethroughDecoration);
  // Hide closing ~~
  builder.add(to - 2, to, hiddenMarkerDecoration);
}

// Process headings
function processHeading(
  node: SyntaxNodeRef,
  view: EditorView,
  builder: DecorationBuilder,
  level: number
) {
  const { from } = node;
  const line = view.state.doc.lineAt(from);

  if (isLineWithCursor(view, from)) return;

  // Find the heading mark (# symbols)
  const lineText = view.state.doc.sliceString(line.from, line.to);
  const markMatch = lineText.match(/^(#{1,6})\s/);

  if (markMatch) {
    const markLength = markMatch[1].length + 1; // # symbols + space

    // Hide the # marks and space
    builder.add(line.from, line.from + markLength, hiddenMarkerDecoration);

    // Apply heading style to content
    const headingDecos = [
      heading1Decoration,
      heading2Decoration,
      heading3Decoration,
      heading4Decoration,
      heading5Decoration,
      heading6Decoration,
    ];
    builder.add(line.from + markLength, line.to, headingDecos[level - 1] || heading1Decoration);
  }
}

// Process blockquotes
function processBlockquote(
  node: SyntaxNodeRef,
  view: EditorView,
  builder: DecorationBuilder
) {
  const { from } = node;
  const line = view.state.doc.lineAt(from);

  if (isLineWithCursor(view, from)) return;

  const lineText = view.state.doc.sliceString(line.from, line.to);
  const match = lineText.match(/^>\s?/);

  if (match) {
    // Hide > marker
    builder.add(line.from, line.from + match[0].length, hiddenMarkerDecoration);
    // Apply quote style to content
    builder.add(line.from + match[0].length, line.to, quoteDecoration);
  }
}

// Process list items
function processListItem(
  node: SyntaxNodeRef,
  view: EditorView,
  builder: DecorationBuilder
) {
  const { from } = node;
  const line = view.state.doc.lineAt(from);

  if (isLineWithCursor(view, from)) return;

  const lineText = view.state.doc.sliceString(line.from, line.to);

  // Match unordered list markers (-, *, +) or ordered (1., 2., etc.)
  const match = lineText.match(/^(\s*)([-*+]|\d+\.)\s/);

  if (match) {
    const indentLength = match[1].length;
    const markerLength = match[2].length + 1; // marker + space

    // Apply list marker style
    builder.add(
      line.from + indentLength,
      line.from + indentLength + markerLength,
      listMarkerDecoration
    );
  }
}

// Process task list items (checkboxes)
function processTaskList(
  view: EditorView,
  builder: DecorationBuilder
) {
  const doc = view.state.doc;

  // Iterate through all lines to find task list items
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const lineText = line.text;

    // Match task list pattern: - [ ] or - [x] or * [ ] or * [x]
    const match = lineText.match(/^(\s*)([-*+])\s\[([ xX])\]\s/);

    if (match) {
      if (isLineWithCursor(view, line.from)) continue;

      const indentLength = match[1].length;
      const markerLength = match[2].length; // - or * or +
      const isChecked = match[3].toLowerCase() === "x";

      // Position of the character inside [ ]
      const checkboxCharPos = line.from + indentLength + markerLength + 2; // "- [" = 3 chars

      // Hide the list marker and checkbox syntax: "- [ ] " or "- [x] "
      const syntaxEnd = line.from + indentLength + markerLength + 5; // "- [x] " = 6 chars
      builder.add(line.from + indentLength, syntaxEnd, hiddenMarkerDecoration);

      // Add checkbox widget
      builder.addWidget(
        line.from + indentLength,
        new CheckboxWidget(isChecked, checkboxCharPos),
        1
      );

      // If checked, apply strikethrough style to the text
      if (isChecked && syntaxEnd < line.to) {
        builder.add(syntaxEnd, line.to, taskTextCheckedDecoration);
      }
    }
  }
}


// Main ViewPlugin for live preview
class LivePreviewPlugin {
  decorations: DecorationSet;

  constructor(view: EditorView) {
    this.decorations = this.buildDecorations(view);
  }

  update(update: ViewUpdate) {
    if (update.docChanged || update.selectionSet || update.viewportChanged) {
      this.decorations = this.buildDecorations(update.view);
    }
  }

  buildDecorations(view: EditorView): DecorationSet {
    const decorations: { from: number; to: number; deco: Decoration }[] = [];
    const widgets: { pos: number; widget: WidgetType; side: number }[] = [];

    const builder: DecorationBuilder = {
      add: (from, to, deco) => {
        if (from < to) {
          decorations.push({ from, to, deco });
        }
      },
      addWidget: (pos, widget, side = 1) => {
        widgets.push({ pos, widget, side });
      },
    };

    // Iterate through visible ranges for performance
    for (const { from, to } of view.visibleRanges) {
      syntaxTree(view.state).iterate({
        from,
        to,
        enter: (node) => {
          const nodeName = node.name;

          // Process different node types
          switch (nodeName) {
            case "StrongEmphasis":
              processEmphasis(node, view, builder);
              break;
            case "Emphasis":
              processEmphasis(node, view, builder);
              break;
            case "InlineCode":
              processInlineCode(node, view, builder);
              break;
            case "Link":
              processLink(node, view, builder);
              break;
            case "Image":
              processImage(node, view, builder);
              break;
            case "Strikethrough":
              processStrikethrough(node, view, builder);
              break;
            case "ATXHeading1":
              processHeading(node, view, builder, 1);
              break;
            case "ATXHeading2":
              processHeading(node, view, builder, 2);
              break;
            case "ATXHeading3":
              processHeading(node, view, builder, 3);
              break;
            case "ATXHeading4":
              processHeading(node, view, builder, 4);
              break;
            case "ATXHeading5":
              processHeading(node, view, builder, 5);
              break;
            case "ATXHeading6":
              processHeading(node, view, builder, 6);
              break;
            case "Blockquote":
              processBlockquote(node, view, builder);
              break;
            case "ListItem":
              processListItem(node, view, builder);
              break;
          }
        },
      });
    }

    // Process task lists (checkboxes) - not part of syntax tree iteration
    processTaskList(view, builder);

    // Combine mark decorations and widget decorations
    const allDecorations: { from: number; to: number; value: Decoration }[] = [];

    // Add mark decorations
    for (const d of decorations) {
      allDecorations.push({ from: d.from, to: d.to, value: d.deco });
    }

    // Add widget decorations
    for (const w of widgets) {
      allDecorations.push({
        from: w.pos,
        to: w.pos,
        value: Decoration.widget({ widget: w.widget, side: w.side }),
      });
    }

    // Sort all decorations by position
    allDecorations.sort((a, b) => a.from - b.from || a.to - b.to);

    return Decoration.set(
      allDecorations.map((d) =>
        d.from === d.to
          ? (d.value as Decoration).range(d.from)
          : d.value.range(d.from, d.to)
      ),
      true
    );
  }
}

// Create the ViewPlugin
export const livePreviewPlugin = ViewPlugin.fromClass(LivePreviewPlugin, {
  decorations: (v) => v.decorations,
});

// Live preview theme with styles
export const livePreviewTheme = EditorView.baseTheme({
  // Hidden marker style - text remains selectable but invisible
  ".cm-md-hidden": {
    color: "transparent",
    fontSize: "1px",
    letterSpacing: "-1px",
  },

  // Bold
  ".cm-md-bold": {
    fontWeight: "700",
  },

  // Italic
  ".cm-md-italic": {
    fontStyle: "italic",
  },

  // Inline code
  ".cm-md-code": {
    fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace",
    backgroundColor: "hsl(var(--muted))",
    padding: "0.125rem 0.25rem",
    borderRadius: "0.25rem",
    fontSize: "0.875em",
  },

  // Link
  ".cm-md-link": {
    color: "hsl(var(--primary))",
    textDecoration: "underline",
    cursor: "pointer",
  },

  // Strikethrough
  ".cm-md-strikethrough": {
    textDecoration: "line-through",
    opacity: "0.7",
  },

  // Headings
  ".cm-md-heading": {
    fontWeight: "700",
    lineHeight: "1.3",
  },
  ".cm-md-heading-1": {
    fontSize: "2em",
  },
  ".cm-md-heading-2": {
    fontSize: "1.5em",
  },
  ".cm-md-heading-3": {
    fontSize: "1.25em",
  },
  ".cm-md-heading-4": {
    fontSize: "1.1em",
  },
  ".cm-md-heading-5": {
    fontSize: "1em",
  },
  ".cm-md-heading-6": {
    fontSize: "0.9em",
  },

  // Blockquote
  ".cm-md-quote": {
    borderLeft: "3px solid hsl(var(--border))",
    paddingLeft: "1rem",
    fontStyle: "italic",
    color: "hsl(var(--muted-foreground))",
  },

  // List marker
  ".cm-md-list-marker": {
    color: "hsl(var(--primary))",
    fontWeight: "600",
  },

  // Checkbox
  ".cm-md-checkbox": {
    width: "16px",
    height: "16px",
    marginRight: "8px",
    verticalAlign: "middle",
    cursor: "pointer",
    accentColor: "hsl(var(--primary))",
  },

  // Task checked text
  ".cm-md-task-checked": {
    textDecoration: "line-through",
    opacity: "0.6",
    color: "hsl(var(--muted-foreground))",
  },

  ".cm-md-image": {
    display: "block",
    padding: "0.5rem 0",
  },

  ".cm-md-image img": {
    display: "block",
    maxWidth: "100%",
    height: "auto",
    borderRadius: "0.5rem",
  },
});

// Combined extension
export function livePreview(): Extension {
  return [livePreviewPlugin, livePreviewTheme];
}

export default livePreview;
