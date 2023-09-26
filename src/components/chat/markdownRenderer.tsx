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
        p({ node, children, ...props }) {
          console.log("p", node, children, props);
          children = children.map((child) => {
            if (typeof(child) === "string") {
              return parseContent(child, openOtherHash)
            }
            return child;
          });
          return <p {...props} style={{ marginBlockStart: '0', marginBlockEnd: '0' }} children={children} />;
        },
        code({ node, inline, className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');

          if (inline) {
            return (
              <code {...props} className={className}>
                {parseContent(String(children), openOtherHash)}
              </code>
            )
          }

          return match ? (
            <SyntaxHighlighter
              {...props}
              children={String(children).trim()}
              language={match[1]}
              style={dracula}
            />
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
