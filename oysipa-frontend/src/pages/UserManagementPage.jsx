import React, { useState, useEffect } from 'react';
import apiClient from '../api/api'; // Corrected import path
import {
  Box,
  TextField,
  Button,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Typography,
  Alert,
} from '@mui/material';
import PageHeader from '../components/ui/PageHeader';
import SectionCard from '../components/ui/SectionCard';
import DataTable from '../components/ui/DataTable';
import EmptyState from '../components/ui/EmptyState';
import StatusBadge from '../components/ui/StatusBadge';

// "active" → "Active" for the badge.
const statusLabel = (status) => (status ? `${status.charAt(0).toUpperCase()}${status.slice(1)}` : '—');

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

  const columns = [
    {
      key: 'name',
      label: 'Name',
      sortable: true,
      render: (user) => (
        <>
          {user.name}
          {/* On phones the email shows under the name. */}
          <Typography component="span" variant="body2" color="text.secondary" sx={{ display: { xs: 'block', sm: 'none' }, overflowWrap: 'anywhere' }}>{user.email}</Typography>
        </>
      ),
    },
    { key: 'email', label: 'Email', hideOnPhone: true, sortable: true },
    { key: 'role', label: 'Role', sortable: true, render: (user) => <StatusBadge label={user.role} /> },
    { key: 'status', label: 'Status', sortable: true, render: (user) => <StatusBadge label={statusLabel(user.status)} /> },
    {
      key: 'actions',
      label: 'Actions',
      align: 'right',
      render: (user) => (user.status === 'active' ? (
        <Button size="small" variant="outlined" color="error" onClick={() => handleRevoke(user._id)}>Revoke Access</Button>
      ) : null),
    },
  ];

  return (
    <Box sx={{ minWidth: 0 }}>
      <PageHeader eyebrow="Admin" title="User Management" subtitle="Invite officers and revoke access. Roles decide what each user can see and change." />

      {message && <Alert severity="success" sx={{ mb: 2 }}>{message}</Alert>}
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2.5, alignItems: 'flex-start' }}>
        <Box sx={{ flex: '1 1 320px', minWidth: 0, maxWidth: { md: 420 } }}>
          <SectionCard title="Invite New User" subtitle="They sign in with this temporary password.">
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
              <Button type="submit" variant="contained" sx={{ alignSelf: 'flex-end' }}>Invite User</Button>
            </Box>
          </SectionCard>
        </Box>

        <Box sx={{ flex: '999 1 480px', minWidth: 0 }}>
          <SectionCard title="Current Users" flush>
            <DataTable
              ariaLabel="Current users"
              columns={columns}
              rows={users}
              embedded
              emptyState={<EmptyState title="No users yet" />}
            />
          </SectionCard>
        </Box>
      </Box>
    </Box>
  );
};

export default UserManagementPage;
