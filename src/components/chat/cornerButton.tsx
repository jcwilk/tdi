import React from 'react';
import { Button } from '@mui/material';

type CornerButtonProps = {
  onClick: (event: React.MouseEvent) => void;
  icon: React.ReactNode;
};

const CornerButton: React.FC<CornerButtonProps> = ({ onClick, icon }) => (
  <Button
    style={{
      zIndex: 10,
      cursor: 'pointer',
      color: '#ffffff',
      backgroundColor: 'rgba(0, 0, 0, 0.3)',
      borderRadius: '50%',
      padding: '4px',
      minWidth: 'auto',
      marginRight: '5px',
    }}
    onClick={onClick}
  >
    {icon}
  </Button>
);

export default CornerButton;
