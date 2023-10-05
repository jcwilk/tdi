import React, { useCallback } from 'react';
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd';
import { emojiSha } from '../../chat/emojiSha';
import CopyButton from './copyButton';

type EmojiShaButtonProps = {
  hash: string;
  openConversation: (hash: string) => void;
};

const EmojiShaButton: React.FC<EmojiShaButtonProps> = ({ hash, openConversation }) => {
  const handleOpen = useCallback(() => {
    openConversation(hash);
  }, [hash, openConversation]);

  return (
    <>
      <span onClick={handleOpen}>{emojiSha(hash, 5)}</span>
      <CopyButton contentToCopy={hash} copyIcon={<AssignmentIndIcon fontSize='inherit' />} />
    </>
  );
};

export default EmojiShaButton;
