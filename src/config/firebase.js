const admin = require('firebase-admin');

let firebaseApp = null;

function inicializarFirebase() {
    if (firebaseApp) return firebaseApp;

    try {
        const serviceAccount = require('./serviceAccountKey.json');
        firebaseApp = admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log(' Firebase Admin inicializado');
    } catch (error) {
        console.error('❌ Error al inicializar Firebase Admin:', error.message);
        console.error('   Asegúrate de que serviceAccountKey.json esté en src/config/');
    }

    return firebaseApp;
}

inicializarFirebase();

module.exports = admin;
