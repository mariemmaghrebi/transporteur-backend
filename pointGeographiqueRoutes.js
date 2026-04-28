const express = require('express');
const router = express.Router();
const PointGeographique = require('./models/PointGeographique');
const { authenticateToken, requireSuperAdmin } = require('./middleware/auth');

// GET - accessible à tous (mais seulement super admin peut voir)
router.get('/', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const points = await PointGeographique.find().sort({ createdAt: -1 });
    res.json(points);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST - uniquement Super Admin
router.post('/', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const point = new PointGeographique({
      nom: req.body.nom,
      userId: req.userId
    });
    const savedPoint = await point.save();
    res.status(201).json(savedPoint);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// PUT - uniquement Super Admin
router.put('/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const point = await PointGeographique.findOne({ _id: req.params.id });
    if (!point) {
      return res.status(404).json({ message: 'Point géographique non trouvé' });
    }
    
    point.nom = req.body.nom;
    const updatedPoint = await point.save();
    res.json(updatedPoint);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// DELETE - uniquement Super Admin
router.delete('/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
  try {
    const point = await PointGeographique.findOneAndDelete({ _id: req.params.id });
    if (!point) {
      return res.status(404).json({ message: 'Point géographique non trouvé' });
    }
    res.json({ message: 'Point géographique supprimé avec succès' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;