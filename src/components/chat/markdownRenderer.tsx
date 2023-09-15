import React, {  } from 'react';
import ReactMarkdown from 'react-markdown';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { dracula } from 'react-syntax-highlighter/dist/esm/styles/prism';
import CopyButton from './copyButton';
import { emojiSha } from '../../chat/emojiSha';
import { Link } from '@mui/material';

// This regex matches SHA hashes (0-9, a-f, 40 characters long)
const shaRegex = /([a-f0-9]{40,})/;

function splitString(input: string): string[] {
  // This regex matches SHA strings (a-f0-9) or non-SHA strings (any character that is not a-f0-9)
  const regex = /([a-f0-9]+|[^a-f0-9]+)/g;

  // Use the match function with a global regex to find all matches
  return input.match(regex) || [];
}

const parseContent = (content: string, openOtherHash: (hash: string) => void) => {
  const parts = splitString(content);
  console.log("split!", content, parts)

  return parts.reduce<(string | JSX.Element)[]>((acc, part, index) => {
    if (shaRegex.test(part)) {
      acc.push(
        <CopyButton contentToCopy={part} key={index} />,
        <Link
          component="button"
          variant="body2"
          onClick={(event) => {
            event.preventDefault();
            openOtherHash(part);
          }}
          key={index + "_link"}
        >
          {emojiSha(part, 5)}
        </Link>
      );
    }
    else {
      acc.push(part);
    }
    return acc;
  }, []);
};

const MarkdownRenderer: React.FC<{ content: string, openOtherHash: (hash: string) => void }> = ({ content, openOtherHash }) => {
  return (
    <ReactMarkdown
      children={content}
      components={{
        code({ node, inline, className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');

          if (inline) {
            return (
              <code {...props} className={className}>
                {children}
              </code>
            )
          }

          return match ? (
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
              {parseContent(String(children), openOtherHash)}
            </code>
          );
        },
      }}
    />
  );
};

export default MarkdownRenderer;
