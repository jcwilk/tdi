import React, { ReactNode, useState } from 'react';
import ContentPasteIcon from '@mui/icons-material/ContentPaste';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import copy from 'copy-to-clipboard';
import CornerButton from './cornerButton';

type CopyButtonProps = {
  contentToCopy: string;
  copyIcon?: ReactNode;
};

const CopyButton: React.FC<CopyButtonProps> = ({ contentToCopy, copyIcon=<ContentPasteIcon fontSize='inherit' /> }) => {
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
          : copyIcon
      }
    />
  );
};

export default CopyButton;
