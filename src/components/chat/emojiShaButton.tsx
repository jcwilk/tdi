import React, { useCallback, useState } from 'react';
import CornerButton from './cornerButton';
import { emojiSha } from '../../chat/emojiSha';

type EmojiShaButtonProps = {
  hash: string;
  openConversation: (hash: string) => void;
};

const EmojiShaButton: React.FC<EmojiShaButtonProps> = ({ hash, openConversation }) => {
  const handleOpen = useCallback(() => {
    openConversation(hash);
  }, [hash, openConversation]);

  return (
    <CornerButton
      onClick={handleOpen}
      icon={emojiSha(hash, 5)}
    />
  );
};

export default EmojiShaButton;
