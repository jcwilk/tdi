import React from 'react';
import EditIcon from '@mui/icons-material/Edit';
import CornerButton from './cornerButton';

type EditButtonProps = {
  onClick: (event: React.MouseEvent) => void;
};

const EditButton: React.FC<EditButtonProps> = ({ onClick }) => {
  return (
    <CornerButton
      onClick={onClick}
      icon={<EditIcon fontSize='small' />}
    />
  );
};

export default EditButton;
