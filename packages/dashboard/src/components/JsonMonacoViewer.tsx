import Editor from "@monaco-editor/react";

interface JsonMonacoViewerProps {
  value: string;
  className?: string;
}

export function JsonMonacoViewer({ value, className }: JsonMonacoViewerProps) {
  return (
    <div className={className ?? "h-full min-h-0"}>
      <Editor
        height="100%"
        defaultLanguage="json"
        value={value}
        theme="vs-dark"
        options={{
          readOnly: true,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          fontSize: 12,
          lineNumbers: "on",
          wordWrap: "on",
          automaticLayout: true,
          padding: { top: 12, bottom: 12 },
        }}
      />
    </div>
  );
}
