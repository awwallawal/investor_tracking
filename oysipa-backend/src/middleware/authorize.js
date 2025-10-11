const authorize = (roles = []) => {
  if (typeof roles === 'string') {
    roles = [roles];
  }

  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({ msg: 'No authorization token, authorization denied' });
    }

    if (roles.length && !roles.includes(req.user.role)) {
      return res.status(403).json({ msg: 'Forbidden: You do not have access to this resource' });
    }

    next();
  };
};

module.exports = authorize;