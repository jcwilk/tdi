import React from 'react';
import PillButton from './pillButton';

type CornerButtonProps = {
  onClick: () => void;
  icon: React.ReactNode;
  disabled?: boolean;
};

const CornerButton: React.FC<CornerButtonProps> = ({ onClick, icon, disabled = false }) => (
  <PillButton
    contents={icon}
    style={{
      maxWidth: '100%', // Allow it to take up to 100% of the container width
      overflow: 'hidden', // Hide overflow
    }}
    onOpen={onClick}
  />
);

export default CornerButton;
