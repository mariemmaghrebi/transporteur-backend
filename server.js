const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./db');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

dotenv.config();

connectDB();
const app = express();
const PORT = process.env.PORT || 3000;

// Configuration CORS simplifiée et plus permissive
app.use(cors({
  origin: 'https://mariemmaghrebi.github.io',  // ← URL exacte du front
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Gérer explicitement les requêtes OPTIONS
app.options('*', cors());

app.use(express.json());

// Servir les images statiquement
app.use('/uploads', express.static('uploads'));

// Configuration multer pour l'upload des images (stockage mémoire pour Blob)
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
  limits: { fileSize: 5 * 1024 * 1024 }
});

app.set('upload', upload);

// Routes
const authRoutes = require('./authRoutes');
const voyageRoutes = require('./voyageRoutes');
const pointGeographiqueRoutes = require('./pointGeographiqueRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/voyages', voyageRoutes);
app.use('/api/points-geographiques', pointGeographiqueRoutes);

app.get('/api/health', (req, res) => {
  res.json({ message: 'Backend fonctionne avec MongoDB !' });
});

app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`);
});