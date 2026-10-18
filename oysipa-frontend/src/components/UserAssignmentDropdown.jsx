import React, { useState, useEffect } from 'react';
import {
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box
} from '@mui/material';
import apiClient from '../api/api';

const UserAssignmentDropdown = ({ currentAssignedUser, onAssign }) => {
  const [users, setUsers] = useState([]);
  const [selectedUser, setSelectedUser] = useState('');

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const response = await apiClient.get('/api/users/staff'); // Fetch only staff users
        setUsers(response.data);
        // After fetching users, if currentAssignedUser is present, set the selectedUser
        if (currentAssignedUser && response.data.some(user => user._id === currentAssignedUser._id)) {
          setSelectedUser(currentAssignedUser._id);
        }
      } catch (error) {
        console.error("Error fetching users:", error);
      }
    };
    fetchUsers();
  }, [currentAssignedUser]);

  const handleChange = (event) => {
    const userId = event.target.value;
    setSelectedUser(userId);
    onAssign(userId); // Callback to parent to handle assignment logic
  };

  return (
    <Box sx={{ minWidth: 220 }}>
      <FormControl fullWidth size="small">
        <InputLabel id="assign-user-label">Assign Staff</InputLabel>
        <Select
          labelId="assign-user-label"
          id="assign-user-select"
          value={selectedUser}
          label="Assign Staff"
          onChange={handleChange}
        >
          <MenuItem value="">
            <em>None</em>
          </MenuItem>
          {users.map((user) => (
            <MenuItem key={user._id} value={user._id}>
              {user.name} ({user.role})
            </MenuItem>
          ))}
        </Select>
      </FormControl>
    </Box>
  );
};

export default UserAssignmentDropdown;
