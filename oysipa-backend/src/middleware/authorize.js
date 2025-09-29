module.exports = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({ msg: 'No role found, authorization denied' });
    }
    const rolesArray = [...allowedRoles];
    const result = rolesArray.includes(req.user.role);
    if (result) {
      next();
    } else {
      res.status(403).json({ msg: 'Forbidden: You do not have access to this resource' });
    }
  };
};
