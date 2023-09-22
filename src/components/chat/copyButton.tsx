import React, { useState } from 'react';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import copy from 'copy-to-clipboard';
import CornerButton from './cornerButton';

type CopyButtonProps = {
  contentToCopy: string;
};

const CopyButton: React.FC<CopyButtonProps> = ({ contentToCopy }) => {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopyClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    copy(contentToCopy);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <CornerButton
      onClick={handleCopyClick}
      icon={
        isCopied
          ? <CheckCircleOutlineIcon fontSize='inherit' />
          : <ContentCopyIcon fontSize='inherit' />
      }
    />
  );
};

export default CopyButton;
