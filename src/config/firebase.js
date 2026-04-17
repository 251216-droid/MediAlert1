const admin = require('firebase-admin');

let firebaseApp = null;

function inicializarFirebase() {
    if (firebaseApp) return firebaseApp;

    try {
        let serviceAccount;

        // PRIORIDAD: Railway (Variable de entorno)
        if (process.env.FIREBASE_SERVICE_ACCOUNT) {
            serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
            console.log('✅ Firebase: Cargado desde variable de entorno');
        } 
        // SEGUNDO: Local (Archivo)
        else {
            try {
                serviceAccount = require('./serviceAccountKey.json');
                console.log('🏠 Firebase: Cargado desde archivo local');
            } catch (e) {
                throw new Error("No hay variable FIREBASE_SERVICE_ACCOUNT ni archivo local.");
            }
        }

        firebaseApp = admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });

    } catch (error) {
        console.error('❌ Error crítico en Firebase:', error.message);
    }

    return firebaseApp;
}

inicializarFirebase();
module.exports = admin;