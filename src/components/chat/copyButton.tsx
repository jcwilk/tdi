import React, { useState } from 'react';
import { Button } from '@mui/material';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import copy from 'copy-to-clipboard';

type CopyButtonProps = {
  contentToCopy: string;
};

const CopyButton: React.FC<CopyButtonProps> = ({ contentToCopy }) => {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopyClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    copy(contentToCopy);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000); // Reset after 2s
  };

  return (
    <Button
      style={{
        position: 'absolute',
        right: '-2px',  // Decreased the padding to the edge
        top: '-2px',    // Same here
        zIndex: 10,
        cursor: 'pointer',
        color: '#ffffff',  // Set icon color to white
        backgroundColor: 'rgba(0, 0, 0, 0.3)',  // Semi-transparent dark circle
        borderRadius: '50%',  // Make the background a circle
        padding: '4px',  // Give a little padding to the icon
        minWidth: 'auto',  // Ensure the button does not have a minimum width
      }}
      onClick={handleCopyClick}
    >
      {isCopied ? <CheckCircleOutlineIcon fontSize='small'/> : <ContentCopyIcon fontSize='small'/>}
    </Button>
  );
};

export default CopyButton;
