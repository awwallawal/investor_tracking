import React, { useState, useEffect } from 'react';
import { Button, Menu, MenuItem, ListItemIcon, ListItemText } from '@mui/material';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import apiClient from '../api/api';

const LifecycleStatusChanger = ({ project, onStageUpdate }) => {
  const [anchorEl, setAnchorEl] = useState(null);
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchStages = async () => {
      try {
        setLoading(true);
        const response = await apiClient.get('/api/lifecyclestatuses');
        setStages(response.data);
        setError(null);
      } catch (err) {
        setError('Failed to fetch lifecycle stages.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchStages();
  }, []);

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleStageSelect = async (stageId) => {
    handleClose();
    if (stageId === project.lifecycleStatus) return;

    try {
      await apiClient.put(`/api/projects/${project._id}`, { lifecycleStatus: stageId });
      onStageUpdate(); // Notify parent to re-fetch project data
    } catch (err) {
      console.error('Failed to update stage:', err);
      // Optionally, show an error message to the user
    }
  };

  return (
    <div>
      <Button
        variant="contained"
        onClick={handleClick}
        endIcon={<ArrowDropDownIcon />}
        disabled={loading}
      >
        Update Stage
      </Button>
      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleClose}
        data-testid="lifecycle-stage-menu"
      >
        {error && <MenuItem disabled>{error}</MenuItem>}
        {stages.map((stage) => (
          <MenuItem 
            key={stage._id} 
            onClick={() => handleStageSelect(stage._id)}
            selected={stage._id === project.lifecycleStatus}
            data-testid={`stage-option-${stage._id}`}
          >
            <ListItemText primary={stage.name} />
          </MenuItem>
        ))}
      </Menu>
    </div>
  );
};

export default LifecycleStatusChanger;
