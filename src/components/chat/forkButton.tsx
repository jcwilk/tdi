import React from 'react';
import ForkRightIcon from '@mui/icons-material/ForkRight';
import CornerButton from './cornerButton';

type ForkButtonProps = {
  onClick: () => void;
};

const ForkButton: React.FC<ForkButtonProps> = ({ onClick }) => {
  return (
    <CornerButton
      onClick={onClick}
      icon={<ForkRightIcon fontSize='inherit' />}
    />
  );
};

export default ForkButton;
