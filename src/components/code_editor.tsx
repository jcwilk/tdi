import React from 'react';
import MonacoEditor from 'react-monaco-editor';

interface CodeEditorProps {
  code: string;
  onChange: (newValue: string) => void;
}

const CodeEditor: React.FC<CodeEditorProps> = ({ code, onChange }) => {
  return (
    <MonacoEditor
      width="100%"
      height="500px"
      language="javascript"
      theme="vs-dark"
      value={code}
      onChange={onChange}
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
