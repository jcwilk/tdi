import React, {  } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { dracula } from 'react-syntax-highlighter/dist/esm/styles/prism';
import CopyButton from './copyButton';

const MarkdownRenderer: React.FC<{ content: string }> = ({ content }) => {
  return (
    <ReactMarkdown
      children={content}
      components={{
        code({ node, inline, className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');

          return !inline && match ? (
            <div style={{ position: 'relative' }}>
              <CopyButton contentToCopy={String(children).replace(/\n$/, '')} />
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
