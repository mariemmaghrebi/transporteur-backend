const express = require('express');
const router = express.Router();
const User = require('./models/User');
const jwt = require('jsonwebtoken');

const SECRET_KEY = 'votre_cle_secrete_tres_longue_et_complexe_2025';

// Route de connexion
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    console.log('Tentative de connexion:', email); // Debug
    
    const user = await User.findOne({ email });
    if (!user) {
      console.log('Utilisateur non trouvé');
      return res.status(401).json({ message: 'Email ou mot de passe incorrect' });
    }
    
    console.log('Utilisateur trouvé:', user.email, 'Rôle:', user.role);
    
    const isValid = await user.comparePassword(password);
    console.log('Mot de passe valide:', isValid);
    
    if (!isValid) {
      return res.status(401).json({ message: 'Email ou mot de passe incorrect' });
    }
    
    const token = jwt.sign({ 
      userId: user._id,
      role: user.role 
    }, SECRET_KEY, { expiresIn: '24h' });
    
    res.json({
      message: 'Connexion réussie',
      token,
      user: { 
        id: user._id, 
        email: user.email, 
        nom: user.nom, 
        prenom: user.prenom,
        role: user.role 
      }
    });
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ message: error.message });
  }
});

// Route d'inscription
router.post('/register', async (req, res) => {
  try {
    const { email, password, nom, prenom } = req.body;
    
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Cet email est déjà utilisé' });
    }
    
    const user = new User({ email, password, nom, prenom });
    await user.save();
    
    const token = jwt.sign({ 
      userId: user._id,
      role: user.role 
    }, SECRET_KEY, { expiresIn: '24h' });
    
    res.status(201).json({
      message: 'Utilisateur créé avec succès',
      token,
      user: { 
        id: user._id, 
        email: user.email, 
        nom: user.nom, 
        prenom: user.prenom,
        role: user.role 
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;