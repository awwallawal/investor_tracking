const jwt = require('jsonwebtoken');
const User = require('../models/User');
const auditContext = require('../utils/auditContext');

module.exports = async function (req, res, next) {
  const authHeader = req.header('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ msg: 'No token, authorization denied' });
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ msg: 'No token, authorization denied' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Correctly access the user ID from the nested payload
    req.user = await User.findById(decoded.user.id).select('-password');

    if (!req.user) {
        return res.status(401).json({ msg: 'Token is not valid, user not found' });
    }
  } catch (err) {
    return res.status(401).json({ msg: 'Token is not valid' });
  }

  // Story 11.10: the rest of the request runs with this user as the audit
  // actor (ChangeLog `by`), see utils/auditContext.js.
  return auditContext.middleware(req, res, next);
};
