"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Editor, {
  type BeforeMount,
  type Monaco,
  type OnChange,
  type OnMount,
  loader,
} from "@monaco-editor/react";
/* The npm build, not the loader's jsdelivr CDN. The namespace import sits
   behind a dynamic `import()` (below) rather than at module scope: evaluating
   monaco's ESM graph touches `window`, which killed the /email-templates
   prerender. Deferred to an effect it also costs nothing until the component
   mounts, and nothing at runtime comes from a third-party origin — workers
   are bundled, not fetched from a CDN a future CSP would have to allow. */
import type { editor } from "monaco-editor";
import { useTheme } from "@/components/theme-provider";
import { useT } from "@/lib/i18n/provider";

type CodeEditorProps = {
  readonly value: string;
  readonly onChange: (value: string) => void;
  /** Built-in templates are shown, never edited. */
  readonly readOnly?: boolean;
};

const LIGHT_THEME = "senka-email-light";
const DARK_THEME = "senka-email-dark";

/**
 * Both themes are defined once per Monaco instance and then only switched
 * between. Monaco keeps themes global rather than per-editor, so defining them
 * on every mount would have two editors fighting over one name.
 */
function defineThemes(monaco: Monaco): void {
  monaco.editor.defineTheme(LIGHT_THEME, {
    base: "vs",
    inherit: true,
    rules: [
      { token: "comment", foreground: "8a8578", fontStyle: "italic" },
      { token: "keyword", foreground: "7c5cff" },
      { token: "string", foreground: "3f7d58" },
      { token: "number", foreground: "b06500" },
      { token: "type", foreground: "2f6fb0" },
      { token: "delimiter", foreground: "8a8578" },
    ],
    colors: {
      // Transparent, so the editor sits on the page's own card colour and
      // follows it — a hardcoded #fafafa was a light rectangle in dark mode.
      "editor.background": "#00000000",
      "editorGutter.background": "#00000000",
      "editorLineNumber.foreground": "#b5b0a4",
      "editorLineNumber.activeForeground": "#6b6559",
      "editor.lineHighlightBorder": "#00000000",
      "editor.lineHighlightBackground": "#00000008",
      "editor.selectionBackground": "#7c5cff26",
      "editorCursor.foreground": "#7c5cff",
      "editorIndentGuide.background1": "#00000010",
      // Left undefined, these fall back to Monaco's stock "vs" blue — a
      // solid blue box around the word wherever it's clicked, clashing with
      // the rest of the theme's violet accent.
      "editor.wordHighlightBackground": "#7c5cff1a",
      "editor.wordHighlightBorder": "#7c5cff4d",
      "editor.wordHighlightStrongBackground": "#7c5cff26",
      "editor.wordHighlightStrongBorder": "#7c5cff66",
      "editor.selectionHighlightBackground": "#7c5cff1a",
      "editor.selectionHighlightBorder": "#7c5cff4d",
      "editorBracketMatch.background": "#7c5cff1a",
      "editorBracketMatch.border": "#7c5cff4d",
    },
  });

  monaco.editor.defineTheme(DARK_THEME, {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "6f6a60", fontStyle: "italic" },
      { token: "keyword", foreground: "b3a0ff" },
      { token: "string", foreground: "8fd3a8" },
      { token: "number", foreground: "e6b980" },
      { token: "type", foreground: "8fbde6" },
      { token: "delimiter", foreground: "8a8578" },
    ],
    colors: {
      "editor.background": "#00000000",
      "editorGutter.background": "#00000000",
      "editorLineNumber.foreground": "#565149",
      "editorLineNumber.activeForeground": "#9a948a",
      "editor.lineHighlightBorder": "#00000000",
      "editor.lineHighlightBackground": "#ffffff08",
      "editor.selectionBackground": "#b3a0ff33",
      "editorCursor.foreground": "#b3a0ff",
      "editorIndentGuide.background1": "#ffffff12",
      "editor.wordHighlightBackground": "#b3a0ff22",
      "editor.wordHighlightBorder": "#b3a0ff59",
      "editor.wordHighlightStrongBackground": "#b3a0ff33",
      "editor.wordHighlightStrongBorder": "#b3a0ff73",
      "editor.selectionHighlightBackground": "#b3a0ff22",
      "editor.selectionHighlightBorder": "#b3a0ff59",
      "editorBracketMatch.background": "#b3a0ff22",
      "editorBracketMatch.border": "#b3a0ff59",
    },
  });
}

export function CodeEditor({ value, onChange, readOnly = false }: CodeEditorProps) {
  const t = useT();
  const { theme } = useTheme();
  // Editor renders only once the bundled monaco has been handed to the loader;
  // before that the same loading plate the bridge itself would show covers it.
  const [monacoReady, setMonacoReady] = useState(false);

  useEffect(() => {
    let alive = true;
    void import("monaco-editor").then((monaco) => {
      loader.config({
        monaco: monaco as unknown as Parameters<typeof loader.config>[0]["monaco"],
      });
      if (alive) setMonacoReady(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const monacoRef = useRef<Monaco | null>(null);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  // Read inside `onMount`, which is created once and would otherwise close
  // over whatever the theme was on first render.
  const themeRef = useRef(theme);
  themeRef.current = theme;

  // Themes are defined before the editor exists, not after it mounts.
  // `@monaco-editor/react` applies the `theme` prop as soon as Monaco loads —
  // which used to be before `onMount` had defined `senka-email-dark`, so on a
  // reload Monaco fell back to its own light theme and stayed there until the
  // next theme toggle.
  const handleBeforeMount: BeforeMount = useCallback((monaco) => {
    defineThemes(monaco);
  }, []);

  const handleMount: OnMount = useCallback((instance, monaco) => {
    editorRef.current = instance;
    monacoRef.current = monaco;
    // Belt and braces: whatever the prop did on the way in, the editor ends up
    // on the theme the app is actually wearing.
    monaco.editor.setTheme(themeRef.current === "dark" ? DARK_THEME : LIGHT_THEME);

    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
      allowJs: true,
      allowNonTsExtensions: true,
      target: monaco.languages.typescript.ScriptTarget.Latest,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    });

    // Semantic validation off: the editor has no type declarations for
    // `@react-email/components`, so every import would be underlined red in a
    // template that compiles and renders perfectly. Syntax errors — the ones
    // that actually break the preview — still show.
    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: false,
    });
  }, []);

  useEffect(() => {
    monacoRef.current?.editor.setTheme(theme === "dark" ? DARK_THEME : LIGHT_THEME);
  }, [theme]);

  const handleChange: OnChange = useCallback((next) => onChange(next ?? ""), [onChange]);

  if (!monacoReady) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        {t("emailTemplates.editorLoading")}
      </div>
    );
  }

  return (
    <Editor
      defaultLanguage="typescript"
      path="template.tsx"
      theme={theme === "dark" ? DARK_THEME : LIGHT_THEME}
      value={value}
      onChange={handleChange}
      beforeMount={handleBeforeMount}
      onMount={handleMount}
      options={{
        readOnly,
        domReadOnly: readOnly,
        fontSize: 12.5,
        lineHeight: 1.7,
        fontFamily: 'var(--font-mono), "JetBrains Mono", ui-monospace, monospace',
        fontLigatures: true,
        lineNumbers: "on",
        lineDecorationsWidth: 8,
        lineNumbersMinChars: 3,
        glyphMargin: false,
        folding: false,
        minimap: { enabled: false },
        overviewRulerLanes: 0,
        hideCursorInOverviewRuler: true,
        overviewRulerBorder: false,
        scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8, useShadows: false },
        scrollBeyondLastLine: false,
        wordWrap: "on",
        padding: { top: 16, bottom: 16 },
        renderLineHighlight: "line",
        cursorBlinking: "smooth",
        smoothScrolling: true,
        tabSize: 2,
        automaticLayout: true,
        guides: { indentation: true, highlightActiveIndentation: false },
      }}
      loading={
        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
          {t("emailTemplates.editorLoading")}
        </div>
      }
    />
  );
}
