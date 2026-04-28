const mongoose = require('mongoose');
const connectDB = require('./db');

const listPoints = async () => {
  try {
    await connectDB();
    
    const PointGeographique = require('./models/PointGeographique');
    const points = await PointGeographique.find();
    
    console.log('📋 Points géographiques trouvés:', points.length);
    
    if (points.length === 0) {
      console.log('❌ Aucun point géographique dans la base');
      
      // Créer des points par défaut
      const User = require('./models/User');
      const user = await User.findOne({ email: 'admin@transportmoez.com' });
      
      if (user) {
        const defaultPoints = [
          { nom: 'Dépôt Nantes', userId: user._id },
          { nom: 'Dépôt Tunis', userId: user._id },
          { nom: 'Aéroport Nantes', userId: user._id },
          { nom: 'Aéroport Tunis', userId: user._id }
        ];
        
        for (const point of defaultPoints) {
          const existing = await PointGeographique.findOne({ nom: point.nom, userId: user._id });
          if (!existing) {
            await PointGeographique.create(point);
            console.log(`✅ Ajouté: ${point.nom}`);
          }
        }
        
        // Afficher la nouvelle liste
        const newPoints = await PointGeographique.find();
        console.log(`📋 Maintenant ${newPoints.length} points:`);
        newPoints.forEach(p => console.log(`   - ${p.nom}`));
      }
    } else {
      points.forEach(point => {
        console.log(`   - ${point.nom} (ID: ${point._id})`);
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Erreur:', error);
    process.exit(1);
  }
};

listPoints();