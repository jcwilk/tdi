import React from 'react';
import MonacoEditor from 'react-monaco-editor';

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  height?: string | number; // Add height prop
}

const CodeEditor: React.FC<CodeEditorProps> = ({ value, onChange, height = '200px' }) => {
  return (
    <MonacoEditor
      language="javascript"
      theme="vs-dark"
      value={value}
      onChange={onChange}
      height={height}
      options={{
        selectOnLineNumbers: true,
        roundedSelection: false,
        readOnly: false,
        cursorStyle: 'line',
        automaticLayout: true,
        minimap: { enabled: false },
      }}

    />
  );
};

export default CodeEditor;
