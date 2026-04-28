const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./db');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

dotenv.config();

// Connexion à MongoDB
connectDB();

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration CORS complète
const allowedOrigins = [
  'http://localhost:4200',
  'https://mariemmaghrebi.github.io'
];
app.use(cors({
  origin: function(origin, callback) {
    // Permettre les requêtes sans origin (comme les apps mobiles ou curl)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('Origin bloquée par CORS:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.options('*', cors());
// Middleware
app.use(express.json());

// Créer le dossier uploads s'il n'existe pas
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Servir les images statiquement
app.use('/uploads', express.static('uploads'));

// Configuration multer pour l'upload des images
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

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

// Rendre upload disponible dans les routes
app.set('upload', upload);

// Routes
const authRoutes = require('./authRoutes');
const voyageRoutes = require('./voyageRoutes');
const pointGeographiqueRoutes = require('./pointGeographiqueRoutes');

app.use('/api/auth', authRoutes);
app.use('/api/voyages', voyageRoutes);
app.use('/api/points-geographiques', pointGeographiqueRoutes);

// Route de test
app.get('/api/health', (req, res) => {
  res.json({ message: 'Backend fonctionne avec MongoDB !' });
});

// Démarrer le serveur
app.listen(PORT, () => {
  console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`);
});