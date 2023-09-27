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
  const parts = splitString(content.trim());

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
        pre({ node, children, ...props }) {
          return (
            <pre {...props} style={{ whiteSpace: 'pre-wrap' }}>
              {children}
            </pre>
          );
        },
        p({ node, children, ...props }) {
          //console.log("p", node, children, props);
          children = children.map((child) => {
            if (typeof(child) === "string") {
              return parseContent(child, openOtherHash)
            }
            return child;
          });
          return <p {...props} style={{ marginBlockStart: '0', marginBlockEnd: '0' }} children={children} />;
        },
        li({ node, children, ...props }) {
          //console.log("li", node, children, props);

          if(!children) {
            // NB: Supposedly, this isn't supposed to be undefined according to the types, but it sometimes is
            // rather than sink a bunch of time into it, just returning it as-is and moving on.
            return <li children={children} {...props} />;
          }

          children = children.map((child) => {
            if (!child || typeof(child) === "number" || typeof(child) === "boolean") {
              return child;
            }

            if (typeof(child) === "string") {
              return parseContent(child, openOtherHash)
            }

            if (React.isValidElement(child)) {
              const props = child.props;

              if (props && props.node?.tagName === "p") {
                return child.props.children
              }
            }
            return child;
          });
          return <li {...props} children={children} />;
        },
        ol({ node, children, ...props }) {
          //console.log("ol", node, children, props);
          return <ol {...props} style={{ marginBlockStart: '0', marginBlockEnd: '0' }} children={children} />;
        },
        code({ node, inline, className, children, ...props }) {
          const match = /language-(\w+)/.exec(className || '');

          if (inline) {
            return (
              <code {...props} className={className} style={{ whiteSpace: 'pre-wrap' }}>
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
              wrapLongLines={true}
            />
          ) : (
            <code {...props} className={className} style={{ whiteSpace: 'pre-wrap' }}>
              {parseContent(String(children), openOtherHash)}
            </code>
          );
        },
      }}
    />
  );
};

export default MarkdownRenderer;
