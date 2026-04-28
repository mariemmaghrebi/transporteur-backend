const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const connectDB = require('./db');

const createSuperAdmin = async () => {
  try {
    await connectDB();
    
    const User = require('./models/User');
    
    const hashedPassword = await bcrypt.hash('superadmin080524', 10);
    
    const superAdminData = {
      email: 'superadmin@gmail.com',
      password: hashedPassword,
      nom: 'Super',
      prenom: 'Admin',
      role: 'super_admin'
    };
    
    // Supprimer l'ancien super admin s'il existe
    await User.deleteOne({ email: superAdminData.email });
    
    // Créer le super admin
    const user = new User(superAdminData);
    await user.save();
    
    console.log('✅ Super Admin créé avec succès !');
    console.log('📧 Email: superadmin@gmail.com');
    console.log('🔑 Mot de passe: superadmin080524');
    console.log('👑 Rôle: super_admin');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  }
};

createSuperAdmin();