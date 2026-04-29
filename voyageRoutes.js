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
  return dateAllerObj <= aujourdhui ? 'termine' : 'en_attente';
};

// Vérifier si l'utilisateur peut ajouter un voyage
const canAddVoyage = async (userId, userRole) => {
  if (userRole === 'super_admin') return true;
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
    
    if (req.userRole !== 'super_admin' && voyage.statut === 'termine') {
      return res.status(403).json({ 
        message: 'Ce voyage est terminé. Vous ne pouvez plus le modifier.' 
      });
    }
    
    const updateData = { ...req.body };
    delete updateData.matricule;
    
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
    
    if (req.userRole !== 'super_admin' && voyage.statut === 'termine') {
      return res.status(403).json({ 
        message: 'Vous ne pouvez pas supprimer un voyage terminé.' 
      });
    }
    
    await Client.deleteMany({ voyageId: req.params.id });
    await Voyage.findByIdAndDelete(req.params.id);
    
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

// GET - Tous les voyages
router.get('/', authenticateToken, async (req, res) => {
  try {
    let voyages;
    
    if (req.userRole === 'super_admin') {
      voyages = await Voyage.find({})
        .sort({ dateCreation: 1 })
        .populate('clients');
    } else {
      voyages = await Voyage.find({ userId: req.userId })
        .sort({ dateCreation: 1 })
        .populate('clients');
    }
    
    for (let voyage of voyages) {
      const nouveauStatut = calculerStatut(voyage.dateAller);
      if (voyage.statut !== nouveauStatut) {
        voyage.statut = nouveauStatut;
        await voyage.save();
      }
    }
    
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

// ========== ROUTES CLIENTS ==========

// GET - Tous les clients d'un voyage
router.get('/:voyageId/clients', authenticateToken, async (req, res) => {
  try {
    const clients = await Client.find({ voyageId: req.params.voyageId });
    res.json(clients);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// POST - Ajouter un client à un voyage (avec matricule auto)
router.post('/:voyageId/clients', authenticateToken, async (req, res) => {
  try {
    const voyage = await Voyage.findOne({ _id: req.params.voyageId, userId: req.userId });
    if (!voyage) {
      return res.status(404).json({ message: 'Voyage non trouvé' });
    }
    
    const Counter = require('./models/Counter');
    let counter = await Counter.findOne({ name: 'clientCounter_' + req.params.voyageId });
    if (!counter) {
      counter = new Counter({ name: 'clientCounter_' + req.params.voyageId, sequenceValue: 1 });
    } else {
      counter.sequenceValue += 1;
    }
    await counter.save();
    
    const matricule = counter.sequenceValue.toString();
    
    const client = new Client({
      ...req.body,
      matricule: matricule,
      voyageId: req.params.voyageId
    });
    
    const savedClient = await client.save();
    voyage.clients.push(savedClient._id);
    await voyage.save();
    
    res.status(201).json(savedClient);
  } catch (error) {
    console.error('Erreur:', error);
    res.status(400).json({ message: error.message });
  }
});

module.exports = router;