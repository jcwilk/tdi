import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { dracula } from 'react-syntax-highlighter/dist/esm/styles/prism';
import copy from 'copy-to-clipboard';

const MarkdownRenderer: React.FC<{ content: string }> = ({ content }) => {
  return (
    <ReactMarkdown
      children={content}
      components={{
        code({ node, inline, className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');
          const [isCopied, setIsCopied] = useState(false);

          const handleCopyClick = (event: React.MouseEvent) => {
            copy(String(children));
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2000); // Reset after 2s
            event.stopPropagation();
          };

          return !inline && match ? (
            <div style={{ position: 'relative' }}>
              <button
                style={{
                  position: 'absolute',
                  right: '5px',
                  top: '5px',
                  zIndex: 10,
                }}
                onClick={handleCopyClick}
              >
                {isCopied ? 'Copied!' : 'Copy'}
              </button>
              <SyntaxHighlighter
                {...props}
                children={String(children).replace(/\n$/, '')}
                language={match[1]}
                PreTag="div"
                style={dracula}
              />
            </div>
          ) : (
            <code {...props} className={className}>
              {children}
            </code>
          );
        },
      }}
    />
  );
};

export default MarkdownRenderer;
