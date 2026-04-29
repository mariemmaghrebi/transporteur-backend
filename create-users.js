const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// URI de connexion à MongoDB Atlas (remplace par la tienne si différente)
const MONGO_URI = 'mongodb://mariemmaghrebi_db_user:admin123@cluster0.tyyhzfg.mongodb.net:27017/transporteur?retryWrites=true&w=majority';
const createUsers = async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connecté à MongoDB Atlas');

    // Définir le schéma User
    const userSchema = new mongoose.Schema({
      email: String,
      password: String,
      nom: String,
      prenom: String,
      role: String,
      createdAt: Date
    });
    
    const User = mongoose.model('User', userSchema);

    // Hacher les mots de passe
    const adminPassword = await bcrypt.hash('admin123', 10);
    const superPassword = await bcrypt.hash('superadmin080524', 10);

    // Supprimer les anciens utilisateurs
    await User.deleteMany({ email: { $in: ['admin@transportmoez.com', 'superadmin@gmail.com'] } });
    console.log('✅ Anciens utilisateurs supprimés');

    // Créer Admin
    const admin = new User({
      email: 'admin@transportmoez.com',
      password: adminPassword,
      nom: 'Admin',
      prenom: 'Transport',
      role: 'admin',
      createdAt: new Date()
    });
    await admin.save();
    console.log('✅ Admin créé');

    // Créer Super Admin
    const superAdmin = new User({
      email: 'superadmin@gmail.com',
      password: superPassword,
      nom: 'Super',
      prenom: 'Admin',
      role: 'super_admin',
      createdAt: new Date()
    });
    await superAdmin.save();
    console.log('✅ Super Admin créé');

    console.log('\n📋 Identifiants :');
    console.log('Admin : admin@transportmoez.com / admin123');
    console.log('Super Admin : superadmin@gmail.com / superadmin080524');

    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  }
};

createUsers();