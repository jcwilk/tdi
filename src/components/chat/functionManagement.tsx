import React, { useState } from 'react';
import { Dialog, DialogTitle, DialogContent, Checkbox, ListItem, List, Button } from '@mui/material';
import { FunctionOption } from '../../openai_api';

interface FunctionManagementProps {
    availableFunctions: FunctionOption[];
    selectedFunctions: FunctionOption[];
    onUpdate: (updatedFunctions: FunctionOption[]) => void;
    onClose: () => void;
}

export const FunctionManagement: React.FC<FunctionManagementProps> = ({ availableFunctions, selectedFunctions, onUpdate, onClose }) => {
    const [currentSelected, setCurrentSelected] = useState<FunctionOption[]>(selectedFunctions);

    const handleToggle = (func: FunctionOption) => {
        setCurrentSelected(prevSelected => {
            const isSelected = prevSelected.some(f => f.name === func.name);
            if (isSelected) {
                return prevSelected.filter(f => f.name !== func.name);
            } else {
                return [...prevSelected, func];
            }
        });
    };

    const calculateTokenCount = (selectedFuncs: FunctionOption[]) => {
        // Mock implementation for now.
        // You can replace this with your function to calculate token count.
        return selectedFuncs.length * 20;
    };

    const handleSave = () => {
        onUpdate(currentSelected);
        onClose();
    };

    return (
        <Dialog open={true} onClose={onClose}>
            <DialogTitle>Function Management</DialogTitle>
            <DialogContent>
                <List>
                    {availableFunctions.map(func => (
                        <ListItem key={func.name} button onClick={() => handleToggle(func)}>
                            <Checkbox checked={currentSelected.some(f => f.name === func.name)} />
                            {func.name}
                        </ListItem>
                    ))}
                </List>
                <div>
                    Token Count: {calculateTokenCount(currentSelected)}
                </div>
            </DialogContent>
            <Button onClick={handleSave}>Save</Button>
            <Button onClick={onClose}>Cancel</Button>
        </Dialog>
    );
};
