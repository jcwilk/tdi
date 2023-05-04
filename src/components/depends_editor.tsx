import React from "react";
import {
  Typography,
  TextField,
  IconButton,
  Button,
  Stack,
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";

type DependsEditorProps = {
  depends: string[];
  onDependsChange: (depends: string[]) => void;
};

const DependsEditor: React.FC<DependsEditorProps> = ({
  depends,
  onDependsChange,
}) => {
  const handleInputChange = (index: number, value: string) => {
    const newDepends = [...depends];
    newDepends[index] = value;
    onDependsChange(newDepends);
  };

  const handleAdd = () => {
    onDependsChange([...depends, ""]);
  };

  const handleDelete = (index: number) => {
    const newDepends = depends.filter((_, i) => i !== index);
    onDependsChange(newDepends);
  };

  const renderDepend = (depend: string, index: number) => {
    return (
      <Stack spacing={1} direction="row" key={index}>
        <TextField
          label="Dependency"
          value={depend}
          onChange={(e) => handleInputChange(index, e.target.value)}
        />
        <IconButton
          onClick={() => handleDelete(index)}
          color="error"
        >
          <DeleteIcon />
        </IconButton>
      </Stack>
    );
  };

  return (
    <>
      <Typography variant="h6">Dependencies</Typography>
      {depends && depends.map((depend, index) => renderDepend(depend, index))}
      <Stack direction="row" spacing={1}>
        <Button onClick={handleAdd} startIcon={<AddIcon />}>
          Add Dependency
        </Button>
      </Stack>
    </>
  );
};

export default DependsEditor;
