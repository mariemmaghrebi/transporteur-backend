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
const canAddVoyage = async (userId, userRole, dateAller) => {
  if (userRole === 'super_admin') return { canAdd: true, reason: '' };
  
  const aujourdhui = new Date();
  aujourdhui.setHours(0, 0, 0, 0);
  const dateAllerObj = new Date(dateAller);
  dateAllerObj.setHours(0, 0, 0, 0);
  
  if (dateAllerObj <= aujourdhui) {
    return { canAdd: false, reason: 'La date d\'aller doit être postérieure à aujourd\'hui' };
  }
  
  const voyageEnAttente = await Voyage.findOne({
    userId: userId,
    statut: 'en_attente'
  });
  
  if (voyageEnAttente) {
    return { canAdd: false, reason: 'Vous avez déjà un voyage en attente' };
  }
  
  return { canAdd: true, reason: '' };
};

// ========== ROUTES VOYAGES ==========

// POST - Créer un voyage
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { dateAller, dateRetour } = req.body;
    
    const { canAdd, reason } = await canAddVoyage(req.userId, req.userRole, dateAller);
    if (!canAdd) {
      return res.status(403).json({ message: reason });
    }
    
    const Counter = require('./models/Counter');
    let counter = await Counter.findOne({ name: 'voyageCounter' });
    
    let nouveauNumero = 1;
    if (counter) {
      nouveauNumero = counter.sequenceValue + 1;
      counter.sequenceValue = nouveauNumero;
      await counter.save();
    } else {
      counter = new Counter({ name: 'voyageCounter', sequenceValue: 1 });
      await counter.save();
    }
    
    const matricule = nouveauNumero.toString();
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
    let voyage;
    if (req.userRole === 'super_admin') {
      voyage = await Voyage.findOne({ _id: req.params.id, userId: req.userId });
    } else {
      voyage = await Voyage.findById(req.params.id);
    }
    
    if (!voyage) {
      return res.status(404).json({ message: 'Voyage non trouvé' });
    }
    
    if (req.userRole !== 'super_admin' && voyage.statut !== 'en_attente') {
      return res.status(403).json({ 
        message: 'Vous ne pouvez modifier que les voyages en attente.' 
      });
    }
    
    const updateData = { ...req.body };
    delete updateData.matricule;
    delete updateData._id;
    delete updateData.userId;
    delete updateData.clients;
    delete updateData.dateCreation;
    
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
    const voyage = await Voyage.findById(req.params.id);
    if (!voyage) {
      return res.status(404).json({ message: 'Voyage non trouvé' });
    }
    
    if (req.userRole !== 'super_admin' && voyage.userId.toString() !== req.userId) {
      return res.status(403).json({ message: 'Accès non autorisé' });
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
      const newMatricule = (i + 1).toString();
      remainingVoyages[i].matricule = newMatricule;
      await remainingVoyages[i].save();
    }
    
    const Counter = require('./models/Counter');
    let counter = await Counter.findOne({ name: 'voyageCounter' });
    if (counter) {
      counter.sequenceValue = remainingVoyages.length;
      await counter.save();
    }
    
    res.json({ message: 'Voyage supprimé, matricules réorganisés' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// GET - Tous les voyages
router.get('/', authenticateToken, async (req, res) => {
  try {
    let voyages = await Voyage.find({})
      .sort({ dateCreation: 1 })
      .populate('clients');
    
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
// GET - Un voyage spécifique
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    let voyage;
    
    if (req.userRole === 'super_admin') {
      voyage = await Voyage.findById(req.params.id).populate('clients');
    } else {
      voyage = await Voyage.findOne({ _id: req.params.id, userId: req.userId }).populate('clients');
    }
    
    if (!voyage) {
      return res.status(404).json({ message: 'Voyage non trouvé' });
    }
    
    res.json(voyage);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ========== ROUTES CLIENTS ==========

// GET - Tous les clients d'un voyage
router.get('/:voyageId/clients', authenticateToken, async (req, res) => {
  try {
    const voyageId = req.params.voyageId;
    console.log('🔍 Recherche clients - Rôle:', req.userRole);
    
    let voyage;
    
    // Super Admin peut voir n'importe quel voyage
    if (req.userRole === 'super_admin') {
      voyage = await Voyage.findById(voyageId);
    } else {
      voyage = await Voyage.findOne({ _id: voyageId, userId: req.userId });
    }
    
    if (!voyage) {
      console.log('❌ Voyage non trouvé');
      return res.status(404).json({ message: 'Voyage non trouvé' });
    }
    
    console.log('✅ Voyage trouvé');
    
    const clients = await Client.find({ voyageId: voyageId });
    console.log(`📋 ${clients.length} clients trouvés`);
    
    res.json(clients);
  } catch (error) {
    console.error('❌ Erreur:', error);
    res.status(500).json({ message: error.message });
  }
});

// POST - Ajouter un client à un voyage
router.post('/:voyageId/clients', authenticateToken, async (req, res) => {
  try {
    let voyage;
    
    if (req.userRole === 'super_admin') {
      voyage = await Voyage.findOne({ _id: req.params.voyageId, userId: req.userId });
    } else {
      voyage = await Voyage.findById(req.params.voyageId);
    }
    
    if (!voyage) {
      return res.status(404).json({ message: 'Voyage non trouvé' });
    }
    
    if (req.userRole !== 'super_admin' && voyage.statut !== 'en_attente') {
      return res.status(403).json({ 
        message: 'Vous ne pouvez ajouter des clients qu\'aux voyages en attente.' 
      });
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
    res.status(400).json({ message: error.message });
  }
});

// PUT - Modifier un client
router.put('/clients/:clientId', authenticateToken, async (req, res) => {
  try {
    const client = await Client.findById(req.params.clientId);
    if (!client) {
      return res.status(404).json({ message: 'Client non trouvé' });
    }
    
    let voyage;
    if (req.userRole === 'super_admin') {
      voyage = await Voyage.findOne({ _id: client.voyageId, userId: req.userId });
    } else {
      voyage = await Voyage.findById(client.voyageId);
    }
    
    if (!voyage) {
      return res.status(404).json({ message: 'Voyage non trouvé' });
    }
    
    if (req.userRole !== 'super_admin' && voyage.statut !== 'en_attente') {
      return res.status(403).json({ 
        message: 'Vous ne pouvez modifier un client que si le voyage est en attente.' 
      });
    }
    
    const { devise, totalMontant, statutPaiement, pointGeo, nombrePieces, expediteur, destinataire } = req.body;
    
    if (devise !== undefined) client.devise = devise;
    if (totalMontant !== undefined) client.totalMontant = totalMontant;
    if (statutPaiement !== undefined) client.statutPaiement = statutPaiement;
    if (pointGeo !== undefined) client.pointGeo = pointGeo;
    if (nombrePieces !== undefined) client.nombrePieces = nombrePieces;
    
    if (expediteur) {
      if (expediteur.nomPrenom !== undefined) client.expediteur.nomPrenom = expediteur.nomPrenom;
      if (expediteur.telephone !== undefined) client.expediteur.telephone = expediteur.telephone;
    }
    
    if (destinataire) {
      if (destinataire.nomPrenom !== undefined) client.destinataire.nomPrenom = destinataire.nomPrenom;
      if (destinataire.telephone !== undefined) client.destinataire.telephone = destinataire.telephone;
    }
    
    await client.save();
    res.json(client);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// DELETE - Supprimer un client (SANS réorganisation des matricules)
router.delete('/clients/:clientId', authenticateToken, async (req, res) => {
  try {
    const client = await Client.findById(req.params.clientId);
    if (!client) {
      return res.status(404).json({ message: 'Client non trouvé' });
    }
    
    const voyage = await Voyage.findOne({ _id: client.voyageId });
    if (!voyage) {
      return res.status(404).json({ message: 'Voyage non trouvé' });
    }
    
    if (req.userRole !== 'super_admin' && voyage.userId.toString() !== req.userId) {
      return res.status(403).json({ message: 'Accès non autorisé' });
    }
    
    if (voyage.statut === 'termine' && req.userRole !== 'super_admin') {
      return res.status(403).json({ 
        message: 'Ce voyage est terminé. Vous ne pouvez plus supprimer de client.' 
      });
    }
    
    // Supprimer le client
    await Client.findByIdAndDelete(req.params.clientId);
    
    // Retirer le client du tableau clients du voyage
    voyage.clients = voyage.clients.filter(c => c.toString() !== req.params.clientId);
    await voyage.save();
    
    // ⚠️ PAS de réorganisation des matricules
    // Les matricules des autres clients RESTENT INCHANGÉS
    
    res.json({ message: 'Client supprimé avec succès' });
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;