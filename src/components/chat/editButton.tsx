import React from 'react';
import EditIcon from '@mui/icons-material/Edit';
import CornerButton from './cornerButton';

type EditButtonProps = {
  onClick: () => void;
};

const EditButton: React.FC<EditButtonProps> = ({ onClick }) => {
  return (
    <CornerButton
      onClick={onClick}
      icon={<EditIcon fontSize='inherit' />}
    />
  );
};

export default EditButton;
