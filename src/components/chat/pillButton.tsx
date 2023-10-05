import React, { ReactNode } from 'react';
import { Button } from '@mui/material';

type PillButtonProps = {
  contents: ReactNode;
  style?: React.CSSProperties;
  onOpen?: () => void;
};

const PillButton: React.FC<PillButtonProps> = ({ contents, style={}, onOpen }) => {
  const disabled = !onOpen;
  const handleOpen = (event: React.MouseEvent) => {
    event.preventDefault();
    if (onOpen) {
      onOpen();
    }
  }

  return (<Button
    variant="contained"
    style={{
      borderRadius: '18px',
      backgroundColor: disabled ? '#333' : '#424242', // Darker background color for dark mode
      color: disabled ? '#424242' : '#E0E0E0', // Lighter text color for dark mode
      padding: '4px 8px',
      fontSize: '0.8rem',
      lineHeight: '1',
      minHeight: 'initial',
      whiteSpace: 'nowrap', // Keep text in a single line
      minWidth: 'initial', // Allow the button to shrink to fit the icon
      ...style,
    }}
    onClick={handleOpen}
    disabled={disabled}
  >
    {contents}
  </Button>);
};

export default PillButton;
