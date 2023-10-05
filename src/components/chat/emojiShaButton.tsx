import React, { useCallback } from 'react';
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd';
import { emojiSha } from '../../chat/emojiSha';
import CopyButton from './copyButton';

type EmojiShaButtonProps = {
  hash: string;
  openConversation: (hash: string) => void;
  activeLink?: boolean;
};

const EmojiShaButton: React.FC<EmojiShaButtonProps> = ({ hash, openConversation, activeLink=true }) => {
  const handleOpen = useCallback(() => {
    openConversation(hash);
  }, [hash, openConversation]);

  return (
    <>
      {
        activeLink ?
          <a href="#" onClick={(e) => { e.preventDefault(); handleOpen(); }}>{emojiSha(hash, 5)}</a>
          :
          emojiSha(hash, 5)
      }
      <CopyButton contentToCopy={hash} copyIcon={<AssignmentIndIcon fontSize='inherit' />} />
    </>
  );
};

export default EmojiShaButton;
