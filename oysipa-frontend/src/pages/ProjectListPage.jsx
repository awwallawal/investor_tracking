import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';

const ProjectListPage = () => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchParams] = useSearchParams();

  const lifecycleStatus = searchParams.get('lifecycleStatus');

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        setLoading(true);
        setError(null);
        const token = localStorage.getItem('token');
        const config = {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        };
        const url = lifecycleStatus ? `/api/projects?lifecycleStatus=${lifecycleStatus}` : '/api/projects';
        const res = await axios.get(url, config);
        setProjects(res.data);
      } catch (err) {
        setError('Failed to fetch projects.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchProjects();
  }, [lifecycleStatus]);

  if (loading) {
    return <div>Loading projects...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div>
      <h1>Project List {lifecycleStatus ? `(Status: ${lifecycleStatus})` : ''}</h1>
      {projects.length === 0 ? (
        <p>No projects found.</p>
      ) : (
        <ul>
          {projects.map((project) => (
            <li key={project._id}>
              {project.projectTitle} (Investor: {project.investor.investorName})
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ProjectListPage;