import React from 'react';
import { useNavigate } from 'react-router-dom';

const KpiWidget = ({ title, value, navigateTo }) => {
  const navigate = useNavigate();

  const handleClick = () => {
    if (navigateTo) {
      navigate(navigateTo);
    }
  };

  return (
    <div onClick={handleClick} style={{ cursor: navigateTo ? 'pointer' : 'default' }}>
      <h2>{title}</h2>
      <p>{value}</p>
    </div>
  );
};

export default KpiWidget;