import React from 'react';
import { Button } from '@mui/material';

type CornerButtonProps = {
  onClick: (event: React.MouseEvent) => void;
  icon: React.ReactNode;
};

const CornerButton: React.FC<CornerButtonProps> = ({ onClick, icon }) => (
  <Button
    variant="contained"
    style={{
      borderRadius: '18px',
      backgroundColor: '#424242', // Darker background color for dark mode
      color: '#E0E0E0', // Lighter text color for dark mode
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
  >
    {icon}
  </Button>
);

export default CornerButton;
