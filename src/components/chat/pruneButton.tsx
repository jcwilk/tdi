import React from 'react';
import BackspaceIcon from '@mui/icons-material/Backspace';
import CornerButton from './cornerButton';

type PruneButtonProps = {
  onClick: (event: React.MouseEvent) => void;
};

const PruneButton: React.FC<PruneButtonProps> = ({ onClick }) => {
  return (
    <CornerButton
      onClick={onClick}
      icon={<BackspaceIcon fontSize='inherit' />}
    />
  );
};

export default PruneButton;
