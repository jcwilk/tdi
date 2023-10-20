import React, { useCallback, useMemo } from 'react';
import PushPinIcon from '@mui/icons-material/PushPin';
import CornerButton from './cornerButton';
import { getStores } from './useConversationStore';
import { MessageDB } from '../../chat/conversationDb';
import { useLiveQuery } from 'dexie-react-hooks';
import { pinConversationByLeaf, unpinConversationByLeaf } from '../../chat/convoPinning';

type PinButtonProps = {
  message: MessageDB
};

const PinButton: React.FC<PinButtonProps> = ({ message }) => {
  const { messagesStore } = getStores();
  const [isPinned, setIsPinned] = React.useState(false);

  useLiveQuery(() => {
    messagesStore.hasPin(message).then(setIsPinned);
  }, [messagesStore, message]);

  const handleClick = useCallback(() => {
    if (isPinned) {
      console.log("unpinning!")
      unpinConversationByLeaf(message, messagesStore);
    }
    else {
      pinConversationByLeaf(message, messagesStore);
    }
  }, [isPinned, message, messagesStore]);

  return (
    <CornerButton
      onClick={handleClick}
      icon={<PushPinIcon fontSize='inherit' color={isPinned ? 'primary' : 'disabled'} />}
    />
  );
};

export default PinButton;
