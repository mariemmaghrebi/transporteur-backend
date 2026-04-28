const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema({
  voyageId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Voyage',
    required: true
  },
  date: {
    type: Date,
    default: Date.now
  },
  matricule: {
    type: String,
    required: true
  },
  expediteur: {
    nom: { type: String, required: true },
    prenom: { type: String, required: true },
    telephone: { type: String, required: true }
  },
  destinataire: {
    nom: { type: String, required: true },
    prenom: { type: String, required: true },
    telephone: { type: String, required: true }
  },
  pointGeo: {
    type: String,
    required: true
  },
  nombrePieces: {
    type: Number,
    required: true,
    min: 1
  },
  totalMontant: {
    type: Number,
    required: true,
    min: 0
  },
  statutPaiement: {
    type: String,
    enum: ['paye', 'non_paye', 'partiel'],
    default: 'non_paye'
  },
  images: [{
    url: String,
    filename: String,
    uploadDate: { type: Date, default: Date.now }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Client', clientSchema);