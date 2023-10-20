import { useEffect } from 'react';
import { getStores } from './useConversationStore';
import { mirrorPinsToDB } from '../../chat/convoPinning';

const usePinSyncing = (interval: number) => {
  const { messagesStore } = getStores();

  useEffect(() => {
    const intervalId = setInterval(() => {
      mirrorPinsToDB(messagesStore).catch(error => {
        console.error('Failed to process unpersisted files:', error);
      });
    }, interval);

    return () => {
      clearInterval(intervalId);
    };
  }, [messagesStore, interval]);
};

export default usePinSyncing;
