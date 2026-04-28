const express = require('express');
const router = express.Router();
const Voyage = require('./models/Voyage');
const Client = require('./models/Client');
const { authenticateToken } = require('./middleware/auth');

// Calculer le statut simplifié
const calculerStatut = (dateAller) => {
  const aujourdhui = new Date();
  aujourdhui.setHours(0, 0, 0, 0);
  const dateAllerObj = new Date(dateAller);
  dateAllerObj.setHours(0, 0, 0, 0);
  
  // Si la date d'aller est aujourd'hui ou dans le futur = terminé
  // Si la date d'aller est dans le passé = en attente
  return dateAllerObj <= aujourdhui ? 'termine' : 'en_attente';
};

// Vérifier si l'utilisateur peut ajouter un voyage
const canAddVoyage = async (userId, userRole) => {
  if (userRole === 'super_admin') return true;
  
  // Vérifier s'il y a un voyage en attente (date aller > aujourd'hui)
  const aujourdhui = new Date();
  aujourdhui.setHours(0, 0, 0, 0);
  
  const voyageEnAttente = await Voyage.findOne({
    userId: userId,
    dateAller: { $gt: aujourdhui }
  });
  
  return !voyageEnAttente;
};

// POST - Créer un voyage
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { dateAller, dateRetour } = req.body;
    
    // Vérifier si l'utilisateur peut ajouter un voyage
    const peutAjouter = await canAddVoyage(req.userId, req.userRole);
    if (!peutAjouter) {
      return res.status(403).json({ 
        message: 'Vous avez déjà un voyage en attente. Impossible d\'ajouter un nouveau voyage.' 
      });
    }
    
    const Counter = require('./models/Counter');
    
    let counter = await Counter.findOne({ name: 'voyageCounter' });
    if (!counter) {
      counter = new Counter({ name: 'voyageCounter', sequenceValue: 1 });
    } else {
      counter.sequenceValue += 1;
    }
    await counter.save();
    
    const matricule = counter.sequenceValue.toString();
    const statut = calculerStatut(dateAller);
    
    const voyage = new Voyage({
      ...req.body,
      matricule: matricule,
      userId: req.userId,
      dateCreation: new Date(),
      statut: statut
    });
    
    const savedVoyage = await voyage.save();
    res.status(201).json(savedVoyage);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// PUT - Modifier un voyage
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const voyage = await Voyage.findOne({ _id: req.params.id, userId: req.userId });
    if (!voyage) {
      return res.status(404).json({ message: 'Voyage non trouvé' });
    }
    
    // Vérifier si l'utilisateur peut modifier ce voyage
    if (req.userRole !== 'super_admin' && voyage.statut === 'termine') {
      return res.status(403).json({ 
        message: 'Ce voyage est terminé. Vous ne pouvez plus le modifier.' 
      });
    }
    
    const updateData = { ...req.body };
    delete updateData.matricule;
    
    // Recalculer le statut si la date d'aller change
    if (updateData.dateAller) {
      updateData.statut = calculerStatut(updateData.dateAller);
    }
    
    Object.assign(voyage, updateData);
    const updatedVoyage = await voyage.save();
    res.json(updatedVoyage);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// DELETE - Supprimer un voyage
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const voyage = await Voyage.findOne({ _id: req.params.id, userId: req.userId });
    if (!voyage) {
      return res.status(404).json({ message: 'Voyage non trouvé' });
    }
    
    // Super Admin peut tout supprimer, Admin ne peut pas supprimer un voyage terminé
    if (req.userRole !== 'super_admin' && voyage.statut === 'termine') {
      return res.status(403).json({ 
        message: 'Vous ne pouvez pas supprimer un voyage terminé.' 
      });
    }
    
    await Client.deleteMany({ voyageId: req.params.id });
    await Voyage.findByIdAndDelete(req.params.id);
    
    // Réorganiser les matricules
    const remainingVoyages = await Voyage.find({ userId: req.userId }).sort({ dateCreation: 1 });
    for (let i = 0; i < remainingVoyages.length; i++) {
      remainingVoyages[i].matricule = (i + 1).toString();
      await remainingVoyages[i].save();
    }
    
    const Counter = require('./models/Counter');
    let counter = await Counter.findOne({ name: 'voyageCounter' });
    if (counter) {
      counter.sequenceValue = remainingVoyages.length;
      await counter.save();
    }
    
    res.json({ message: 'Voyage supprimé avec succès' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET - Tous les voyages (Super Admin voit tout, Admin voit seulement ses voyages)
router.get('/', authenticateToken, async (req, res) => {
  try {
    let voyages;
    
    if (req.userRole === 'super_admin') {
      // Super Admin voit tous les voyages de tous les utilisateurs
      voyages = await Voyage.find({})
        .sort({ dateCreation: 1 })
        .populate('clients');
    } else {
      // Admin normal voit seulement ses propres voyages
      voyages = await Voyage.find({ userId: req.userId })
        .sort({ dateCreation: 1 })
        .populate('clients');
    }
    
    // Mettre à jour les statuts
    for (let voyage of voyages) {
      const aujourdhui = new Date();
      aujourdhui.setHours(0, 0, 0, 0);
      const dateAllerObj = new Date(voyage.dateAller);
      dateAllerObj.setHours(0, 0, 0, 0);
      const nouveauStatut = dateAllerObj <= aujourdhui ? 'termine' : 'en_attente';
      
      if (voyage.statut !== nouveauStatut) {
        voyage.statut = nouveauStatut;
        await voyage.save();
      }
    }
    
    // Trier par matricule numérique
    voyages.sort((a, b) => {
      const numA = parseInt(a.matricule);
      const numB = parseInt(b.matricule);
      return numA - numB;
    });
    
    res.json(voyages);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ... reste des routes clients
module.exports = router;