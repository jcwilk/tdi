import React, { ReactNode } from 'react';
import { Box, Button, Tooltip } from '@mui/material';
import FileCopyIcon from '@mui/icons-material/FileCopy';
import { Message } from '../../chat/conversation';
import MarkdownRenderer from './markdownRenderer';

type MessageProps = {
  message: Message;
  openConversation?: () => void;
};

interface CodeBlockProps {
  node?: any; // Depending on the ReactMarkdown types, this can be more specific.
  children: ReactNode | ReactNode[];
}

const CodeBlock: React.FC<CodeBlockProps> = ({ node, children, ...props }) => {
  const handleCopy = () => {
    const content = Array.isArray(children) ? children.join('') : children;
    navigator.clipboard.writeText(content?.toString() ?? "");
  };

  return (
    <div style={{ position: 'relative' }}>
      <Tooltip title="Copy to clipboard">
        <Button
          onClick={handleCopy}
          style={{ position: 'absolute', top: 5, right: 5, zIndex: 10 }}
          size="small"
        >
          <FileCopyIcon fontSize="small" />
        </Button>
      </Tooltip>
      <pre>
        <code {...props}>{children}</code>
      </pre>
    </div>
  );
};

const MessageBox: React.FC<MessageProps> = ({ message, openConversation }) => {
  let alignSelf: 'flex-end' | 'flex-start' | 'center';
  let backgroundColor: string;
  let textColor: string;

  switch (message.role) {
    case 'user':
      alignSelf = 'flex-end';
      backgroundColor = '#1976d2';
      textColor = '#fff';
      break;
    case 'assistant':
      alignSelf = 'flex-start';
      backgroundColor = '#616161';
      textColor = '#f5f5f5';
      break;
    case 'system':
      alignSelf = 'center';
      backgroundColor = '#000'; // Black background for system messages
      textColor = '#E0E0E0';  // Light gray text color
      break;
    default:
      alignSelf = 'center';
      backgroundColor = '#4b4b4b';
      textColor = '#f5f5f5';
  }

  return (
    <Box
      sx={{
        marginBottom: '10px',
        alignSelf: alignSelf,
        backgroundColor: backgroundColor,
        borderRadius: '10px',
        padding: '0px 20px',  // Adjusted padding: 5px vertical, 10px horizontal
        maxWidth: '70%',
        wordWrap: 'break-word',
        color: textColor,
        whiteSpace: 'pre-wrap',
      }}
    >
      <div className="markdown-content" onClick={openConversation}>  {/* Add a wrapper div with class */}
        <MarkdownRenderer content={message.content} />
      </div>
    </Box>
  );
};

export default MessageBox;
