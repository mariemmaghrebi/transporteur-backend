const connectDB = require('./db');

const createUser = async () => {
  try {
    await connectDB();
    
    const User = require('./models/User');
    
    const userData = {
      email: 'admin@transportmoez.com',
      password: 'admin123',
      nom: 'Admin',
      prenom: 'Transport'
    };
    
    // Vérifier si l'utilisateur existe déjà
    const existingUser = await User.findOne({ email: userData.email });
    if (existingUser) {
      console.log('⚠️ Utilisateur existe déjà');
      console.log('📧 Email:', userData.email);
      process.exit(0);
    }
    
    // Créer le nouvel utilisateur
    const user = new User(userData);
    await user.save();
    
    console.log('✅ Utilisateur créé avec succès !');
    console.log('📧 Email:', userData.email);
    console.log('🔑 Mot de passe:', userData.password);
    process.exit(0);
  } catch (error) {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  }
};

createUser();