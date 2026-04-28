const mongoose = require('mongoose');

const voyageSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  matricule: {
    type: String,
    required: true,
    unique: true
  },
  dateCreation: {
    type: Date,
    default: Date.now
  },
  dateAller: {
    type: Date,
    required: true
  },
  dateRetour: {
    type: Date,
    required: true
  },
  clients: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Client'
  }],
  statut: {
    type: String,
    enum: ['en_attente', 'en_cours', 'termine', 'annule'],
    default: 'en_attente'
  }
});

module.exports = mongoose.model('Voyage', voyageSchema);