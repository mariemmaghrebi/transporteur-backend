const express = require('express');
const router = express.Router();
const Voyage = require('./models/Voyage');
const Client = require('./models/Client');
const { authenticateToken } = require('./middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
// Configuration Cloudinary avec TES identifiants
cloudinary.config({
  cloud_name: 'dzw5dzt9j',
  api_key: '529763536465724',
  api_secret: 'gZvYwoiYyYyf8b3J8SufvWqrklE'
});
// Configuration du stockage Cloudinary
const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'transporteur-app',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
    transformation: [{ width: 800, height: 800, crop: 'limit' }]
  }
});

const upload = multer({ storage: storage, limits: { fileSize: 5 * 1024 * 1024 } });



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
    const voyages = await Voyage.find({})
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

// POST - Ajouter un client à un voyage
router.post('/:voyageId/clients', authenticateToken, async (req, res) => {
  try {
    const voyage = await Voyage.findOne({ _id: req.params.voyageId, userId: req.userId });
    if (!voyage) {
      return res.status(404).json({ message: 'Voyage non trouvé' });
    }
    
    if (voyage.statut === 'termine' && req.userRole !== 'super_admin') {
      return res.status(403).json({ 
        message: 'Ce voyage est terminé. Vous ne pouvez plus ajouter de client.' 
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
    console.error('Erreur:', error);
    res.status(400).json({ message: error.message });
  }
});

// POST - Upload d'image pour un client
router.post('/clients/:clientId/upload', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Aucun fichier uploadé' });
    }
    
    const client = await Client.findById(req.params.clientId);
    if (!client) {
      return res.status(404).json({ message: 'Client non trouvé' });
    }
    
    // ✅ Cloudinary donne directement l'URL complète dans req.file.path
    const imageData = {
      url: req.file.path,  // ← ICI : URL Cloudinary (commence par http://res.cloudinary.com/...)
      filename: req.file.filename,
      uploadDate: new Date()
    };
    
    client.images.push(imageData);
    await client.save();
    
    res.status(200).json(imageData);
  } catch (error) {
    console.error('Erreur upload:', error);
    res.status(500).json({ message: error.message });
  }
});
// PUT - Modifier un client
router.put('/clients/:clientId', authenticateToken, async (req, res) => {
  try {
    const client = await Client.findById(req.params.clientId);
    if (!client) {
      return res.status(404).json({ message: 'Client non trouvé' });
    }
    
    const voyage = await Voyage.findOne({ _id: client.voyageId, userId: req.userId });
    if (!voyage) {
      return res.status(403).json({ message: 'Accès non autorisé' });
    }
    
    if (voyage.statut === 'termine' && req.userRole !== 'super_admin') {
      return res.status(403).json({ 
        message: 'Ce voyage est terminé. Vous ne pouvez plus modifier de client.' 
      });
    }
    
    const { devise, totalMontant, statutPaiement, pointGeo, nombrePieces } = req.body;
    
    if (devise !== undefined) client.devise = devise;
    if (totalMontant !== undefined) client.totalMontant = totalMontant;
    if (statutPaiement !== undefined) client.statutPaiement = statutPaiement;
    if (pointGeo !== undefined) client.pointGeo = pointGeo;
    if (nombrePieces !== undefined) client.nombrePieces = nombrePieces;
    
    await client.save();
    res.json(client);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

// DELETE - Supprimer une image d'un client
router.delete('/clients/:clientId/images/:imageId', authenticateToken, async (req, res) => {
  try {
    const client = await Client.findById(req.params.clientId);
    if (!client) {
      return res.status(404).json({ message: 'Client non trouvé' });
    }
    
    client.images = client.images.filter(img => img._id.toString() !== req.params.imageId);
    await client.save();
    
    res.json({ message: 'Image supprimée avec succès' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// DELETE - Supprimer un client
router.delete('/clients/:clientId', authenticateToken, async (req, res) => {
  try {
    const client = await Client.findById(req.params.clientId);
    if (!client) {
      return res.status(404).json({ message: 'Client non trouvé' });
    }
    
    const voyage = await Voyage.findOne({ _id: client.voyageId, userId: req.userId });
    if (!voyage) {
      return res.status(403).json({ message: 'Accès non autorisé' });
    }
    
    if (voyage.statut === 'termine' && req.userRole !== 'super_admin') {
      return res.status(403).json({ 
        message: 'Ce voyage est terminé. Vous ne pouvez plus supprimer de client.' 
      });
    }
    
    voyage.clients = voyage.clients.filter(c => c.toString() !== req.params.clientId);
    await voyage.save();
    
    await Client.findByIdAndDelete(req.params.clientId);
    
    const remainingClients = await Client.find({ voyageId: client.voyageId }).sort({ createdAt: 1 });
    for (let i = 0; i < remainingClients.length; i++) {
      const newMatricule = (i + 1).toString();
      if (remainingClients[i].matricule !== newMatricule) {
        remainingClients[i].matricule = newMatricule;
        await remainingClients[i].save();
      }
    }
    
    const Counter = require('./models/Counter');
    let counter = await Counter.findOne({ name: 'clientCounter_' + client.voyageId });
    if (counter) {
      counter.sequenceValue = remainingClients.length;
      await counter.save();
    }
    
    res.json({ message: 'Client supprimé avec succès' });
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;