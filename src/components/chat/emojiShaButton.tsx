import React, { useCallback } from 'react';
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd';
import { emojiSha } from '../../chat/emojiSha';
import CopyButton from './copyButton';
import PillButton from './pillButton';

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
      <PillButton
        contents={emojiSha(hash, 5)}
        onOpen={activeLink ? handleOpen : undefined}
      />
      <CopyButton contentToCopy={hash} copyIcon={<AssignmentIndIcon fontSize='inherit' />} />
    </>
  );
};

export default EmojiShaButton;
