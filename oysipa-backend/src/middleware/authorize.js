const authorize = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      // This case should ideally be caught by the `auth` middleware first
      return res.status(401).json({ msg: 'Authentication error: User data is missing.' });
    }

    const userRole = req.user.role;
    
    // The roles are passed as arguments, e.g., authorize('Admin', 'User')
    // The '...allowedRoles' syntax automatically captures them into an array.
    if (allowedRoles.includes(userRole)) {
      return next(); // Role is allowed, proceed to the next middleware/controller
    } else {
      console.log(`Authorization failed for user ${req.user.email} with role '${userRole}'. Allowed roles: ${allowedRoles.join(', ')}`);
      return res.status(403).json({ msg: 'Forbidden: You do not have access to this resource' });
    }
  };
};

module.exports = authorize;