import React from 'react';
import { Button } from '@mui/material';

type CornerButtonProps = {
  onClick: (event: React.MouseEvent) => void;
  icon: React.ReactNode;
  disabled?: boolean;
};

const CornerButton: React.FC<CornerButtonProps> = ({ onClick, icon, disabled = false }) => (
  <Button
    variant="contained"
    style={{
      borderRadius: '18px',
      backgroundColor: disabled ? '#333' : '#424242', // Darker background color for dark mode
      color: disabled ? '#424242' : '#E0E0E0', // Lighter text color for dark mode
      padding: '4px 8px',
      fontSize: '0.8rem',
      lineHeight: '1',
      minHeight: 'initial',
      maxWidth: '100%', // Allow it to take up to 100% of the container width
      overflow: 'hidden', // Hide overflow
      whiteSpace: 'nowrap', // Keep text in a single line
      minWidth: 'initial', // Allow the button to shrink to fit the icon
    }}
    onClick={onClick}
    disabled={disabled}
  >
    {icon}
  </Button>
);

export default CornerButton;
