const jwt = require('jsonwebtoken');
const SECRET_KEY = 'votre_cle_secrete_tres_longue_et_complexe_2025';

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Accès non autorisé' });
  }

  jwt.verify(token, SECRET_KEY, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Token invalide' });
    }
    req.userId = user.userId;
    req.userRole = user.role;
    next();
  });
};

const requireSuperAdmin = (req, res, next) => {
  if (req.userRole !== 'super_admin') {
    return res.status(403).json({ message: 'Accès réservé au Super Administrateur' });
  }
  next();
};

module.exports = { authenticateToken, requireSuperAdmin };