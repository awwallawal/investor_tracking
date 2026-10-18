import React, { useState, useEffect } from 'react';
import { Alert, Button, Menu, MenuItem, ListItemIcon, ListItemText } from '@mui/material';
import ArrowDropDownIcon from '@mui/icons-material/ArrowDropDown';
import apiClient from '../api/api';

const FORBIDDEN_MSG = 'You can only change projects of investors assigned to you';
const GENERIC_MSG = 'Failed to update stage. Please try again.';

const LifecycleStatusChanger = ({ project, onStageUpdate }) => {
  const [anchorEl, setAnchorEl] = useState(null);
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [saveError, setSaveError] = useState(null);

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

    setSaveError(null);
    try {
      await apiClient.put(`/api/projects/${project._id}`, { lifecycleStatus: stageId });
      onStageUpdate(); // Notify parent to re-fetch project data
    } catch (err) {
      console.error('Failed to update stage:', err);
      setSaveError(err?.response?.status === 403 ? FORBIDDEN_MSG : GENERIC_MSG);
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
      {saveError && (
        <Alert severity="error" sx={{ mt: 1 }} onClose={() => setSaveError(null)}>
          {saveError}
        </Alert>
      )}
    </div>
  );
};

export default LifecycleStatusChanger;
