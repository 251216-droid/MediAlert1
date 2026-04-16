const admin = require('firebase-admin');

let firebaseApp = null;

function inicializarFirebase() {
    if (firebaseApp) return firebaseApp;

    try {
        let serviceAccount;

        if (process.env.FIREBASE_SERVICE_ACCOUNT) {
            // Producción (Railway) — lee desde variable de entorno
            serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
            console.log('🌐 Firebase: usando variable de entorno');
        } else {
            // Local — lee desde archivo
            serviceAccount = require('./serviceAccountKey.json');
            console.log('📁 Firebase: usando serviceAccountKey.json local');
        }

        firebaseApp = admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });

        console.log('✅ Firebase Admin inicializado correctamente');

    } catch (error) {
        console.error('❌ Error al inicializar Firebase Admin:', error.message);

        if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
            console.error('   Asegúrate de que serviceAccountKey.json esté en src/config/');
        } else {
            console.error('   Revisa que FIREBASE_SERVICE_ACCOUNT sea un JSON válido en Railway');
        }
    }

    return firebaseApp;
}

inicializarFirebase();

module.exports = admin;