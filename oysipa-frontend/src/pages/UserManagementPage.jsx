import React, { useState, useEffect } from 'react';
import apiClient from '../api/api'; // Corrected import path
import { 
  Box, 
  Typography, 
  TextField, 
  Button, 
  Select, 
  MenuItem, 
  FormControl, 
  InputLabel, 
  Table, 
  TableBody, 
  TableCell, 
  TableContainer, 
  TableHead, 
  TableRow, 
  Paper, 
  Alert 
} from '@mui/material';

const hideOnPhone = { display: { xs: 'none', sm: 'table-cell' } };

const UserManagementPage = () => {
  const [users, setUsers] = useState([]);
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    role: 'Staff',
  });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await apiClient.get('/api/users');
        setUsers(res.data);
      } catch (err) {
        setError(err.response?.data?.msg || 'Failed to fetch users');
      }
    };
    fetchUsers();
  }, []);

  const handleInviteChange = (e) => {
    setNewUser({ ...newUser, [e.target.name]: e.target.value });
  };

  const handleInviteSubmit = async (e) => {
    e.preventDefault();
    try {
      const res = await apiClient.post('/api/users/invite', newUser);
      setMessage(res.data.msg);
      setError('');
      // Optimistically add the new user to the list
      setUsers(prev => [...prev, res.data.user]);
      setNewUser({ name: '', email: '', password: '', role: 'Staff' });
    } catch (err) {
      setError(err.response?.data?.msg || 'Failed to invite user');
      setMessage('');
    }
  };

  const handleRevoke = async (userId) => {
    try {
      const res = await apiClient.put(`/api/users/${userId}/revoke`);
      setMessage(res.data.msg);
      setError('');
      // Optimistically update the user's status
      setUsers(prev => prev.map(user => 
        user._id === userId ? { ...user, status: 'revoked' } : user
      ));
    } catch (err) {
      setError(err.response?.data?.msg || 'Failed to revoke access');
      setMessage('');
    }
  };

  return (
    <Box>
      <Typography variant="h2" component="h1" gutterBottom>
        User Management
      </Typography>
      
      {message && <Alert severity="success" sx={{ mb: 2 }}>{message}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper sx={{ p: 2, mb: 4 }}>
        <Typography variant="h3" component="h2" gutterBottom>
          Invite New User
        </Typography>
        <Box component="form" onSubmit={handleInviteSubmit} sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField label="Name" name="name" value={newUser.name} onChange={handleInviteChange} required fullWidth />
          <TextField label="Email" name="email" type="email" value={newUser.email} onChange={handleInviteChange} required fullWidth />
          <TextField label="Temporary Password" name="password" type="password" value={newUser.password} onChange={handleInviteChange} required fullWidth />
          <FormControl fullWidth>
            <InputLabel id="role-select-label">Role</InputLabel>
            <Select
              labelId="role-select-label"
              name="role"
              value={newUser.role}
              label="Role"
              onChange={handleInviteChange}
            >
              <MenuItem value="Director-General">Director-General</MenuItem>
              <MenuItem value="Portal-Admin">Portal-Admin</MenuItem>
              <MenuItem value="Staff">Staff</MenuItem>
            </Select>
          </FormControl>
          <Button type="submit" variant="contained">Invite User</Button>
        </Box>
      </Paper>

      <Typography variant="h3" component="h2" gutterBottom>
        Current Users
      </Typography>
      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell sx={hideOnPhone}>Email</TableCell>
              <TableCell sx={hideOnPhone}>Role</TableCell>
              <TableCell sx={hideOnPhone}>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user._id}>
                <TableCell>
                  {user.name}
                  {/* On phones the email, role and status show under the name. */}
                  <Box sx={{ display: { xs: 'block', sm: 'none' } }}>
                    <Typography variant="body2" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>{user.email}</Typography>
                    <Typography variant="body2" color="text.secondary">{`${user.role} · ${user.status}`}</Typography>
                  </Box>
                </TableCell>
                <TableCell sx={hideOnPhone}>{user.email}</TableCell>
                <TableCell sx={hideOnPhone}>{user.role}</TableCell>
                <TableCell sx={hideOnPhone}>{user.status}</TableCell>
                <TableCell align="right">
                  {user.status === 'active' && (
                    <Button size="small" variant="outlined" color="error" onClick={() => handleRevoke(user._id)}>Revoke Access</Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};

export default UserManagementPage;
