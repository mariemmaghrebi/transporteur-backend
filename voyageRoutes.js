const express = require('express');
const router = express.Router();
const Voyage = require('./models/Voyage');
const Client = require('./models/Client');
const { authenticateToken } = require('./middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');


// Configuration multer pour stockage en mémoire (Blob)
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) {
    cb(null, true);
  } else {
    cb(new Error('Seules les images sont autorisées'), false);
  }
};

const upload = multer({ 
  storage: storage, 
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB max
});
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
    console.log('🔧 Modification voyage ID:', req.params.id);
    console.log('📦 Données reçues:', req.body);
    
    const voyage = await Voyage.findOne({ _id: req.params.id, userId: req.userId });
    if (!voyage) {
      console.log('❌ Voyage non trouvé');
      return res.status(404).json({ message: 'Voyage non trouvé' });
    }
    
    if (req.userRole !== 'super_admin' && voyage.statut === 'termine') {
      console.log('❌ Voyage terminé, modification interdite');
      return res.status(403).json({ 
        message: 'Ce voyage est terminé. Vous ne pouvez plus le modifier.' 
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
    
    console.log('✅ Voyage modifié avec succès');
    res.json(updatedVoyage);
  } catch (error) {
    console.error('❌ Erreur modification voyage:', error);
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
    
    // Supprimer tous les clients associés à ce voyage
    await Client.deleteMany({ voyageId: req.params.id });
    
    // Supprimer le voyage
    await Voyage.findByIdAndDelete(req.params.id);
    
    // Récupérer les voyages restants de l'utilisateur
    const remainingVoyages = await Voyage.find({ userId: req.userId }).sort({ dateCreation: 1 });
    
    // Réorganiser les matricules dans l'ordre
    for (let i = 0; i < remainingVoyages.length; i++) {
      const newMatricule = (i + 1).toString();
      if (remainingVoyages[i].matricule !== newMatricule) {
        remainingVoyages[i].matricule = newMatricule;
        await remainingVoyages[i].save();
      }
    }
    
    // Mettre à jour le compteur global
    const Counter = require('./models/Counter');
    let counter = await Counter.findOne({ name: 'voyageCounter' });
    if (counter) {
      counter.sequenceValue = remainingVoyages.length;
      await counter.save();
    }
    
    res.json({ message: 'Voyage supprimé avec succès, matricules réorganisés' });
  } catch (error) {
    console.error('Erreur:', error);
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
    // Ne pas envoyer les images complètes dans la liste (trop lourd)
    const clientsSansImages = clients.map(client => {
      const clientObj = client.toObject();
      clientObj.images = client.images.map(img => ({
        _id: img._id,           // ← Changé : id → _id
        filename: img.filename,
        contentType: img.contentType,
        uploadDate: img.uploadDate
      }));
      return clientObj;
    });
    res.json(clientsSansImages);
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
      voyageId: req.params.voyageId,
      images: [] // Pas d'images à la création
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

// POST - Upload d'image pour un client (stockage BLOB)
router.post('/clients/:clientId/upload', authenticateToken, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Aucun fichier uploadé' });
    }
    
    const client = await Client.findById(req.params.clientId);
    if (!client) {
      return res.status(404).json({ message: 'Client non trouvé' });
    }
    
    const imageData = {
      data: req.file.buffer,
      contentType: req.file.mimetype,
      filename: req.file.originalname,
      uploadDate: new Date()
    };
    
    client.images.push(imageData);
    await client.save();
    
    res.status(200).json({ 
      message: 'Image uploadée avec succès',
      imageId: client.images[client.images.length - 1]._id,
      filename: req.file.originalname
    });
  } catch (error) {
    console.error('Erreur upload:', error);
    res.status(500).json({ message: error.message });
  }
});

// GET - Récupérer une image spécifique (public)
router.get('/clients/:clientId/images/:imageId', async (req, res) => {
  try {
    console.log('📸 Récupération image:', req.params.clientId, req.params.imageId);
    
    const client = await Client.findById(req.params.clientId);
    if (!client) {
      console.log('❌ Client non trouvé');
      return res.status(404).json({ message: 'Client non trouvé' });
    }
    
    const image = client.images.id(req.params.imageId);
    if (!image) {
      console.log('❌ Image non trouvée');
      return res.status(404).json({ message: 'Image non trouvée' });
    }
    
    console.log('✅ Image trouvée, type:', image.contentType);
    res.set('Content-Type', image.contentType);
    res.send(image.data);
  } catch (error) {
    console.error('❌ Erreur:', error);
    res.status(500).json({ message: error.message });
  }
});

// PUT - Modifier un client
router.put('/clients/:clientId', authenticateToken, async (req, res) => {
  try {
    console.log('🔧 Modification client ID:', req.params.clientId);
    console.log('📦 Données reçues:', req.body);
    
    const client = await Client.findById(req.params.clientId);
    if (!client) {
      console.log('❌ Client non trouvé');
      return res.status(404).json({ message: 'Client non trouvé' });
    }
    
    const voyage = await Voyage.findOne({ _id: client.voyageId, userId: req.userId });
    if (!voyage) {
      console.log('❌ Voyage non trouvé ou accès non autorisé');
      return res.status(403).json({ message: 'Accès non autorisé' });
    }
    
    if (voyage.statut === 'termine' && req.userRole !== 'super_admin') {
      console.log('❌ Voyage terminé, modification interdite');
      return res.status(403).json({ 
        message: 'Ce voyage est terminé. Vous ne pouvez plus modifier de client.' 
      });
    }
    
    // Mise à jour des champs
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
    console.log('✅ Client modifié avec succès');
    res.json(client);
  } catch (error) {
    console.error('❌ Erreur modification client:', error);
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
    
    client.images.pull({ _id: req.params.imageId });
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
    
    // Supprimer le client
    await Client.findByIdAndDelete(req.params.clientId);
    
    // Retirer le client du tableau clients du voyage
    voyage.clients = voyage.clients.filter(c => c.toString() !== req.params.clientId);
    await voyage.save();
    
    // Récupérer les clients restants de ce voyage et réorganiser les matricules
    const remainingClients = await Client.find({ voyageId: client.voyageId }).sort({ date: 1 });
    for (let i = 0; i < remainingClients.length; i++) {
      const newMatricule = (i + 1).toString();
      if (remainingClients[i].matricule !== newMatricule) {
        remainingClients[i].matricule = newMatricule;
        await remainingClients[i].save();
      }
    }
    
    // Mettre à jour le compteur
    const Counter = require('./models/Counter');
    let counter = await Counter.findOne({ name: 'clientCounter_' + client.voyageId });
    if (counter) {
      counter.sequenceValue = remainingClients.length;
      await counter.save();
    }
    
    res.json({ message: 'Client supprimé avec succès, matricules réorganisés' });
  } catch (error) {
    console.error('Erreur:', error);
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;