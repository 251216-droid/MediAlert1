require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const cron    = require('node-cron');

const authRoutes           = require('./src/routes/authRoutes');
const enfermedadesRoutes   = require('./src/routes/enfermedadesRoutes');
const medicamentosRoutes   = require('./src/routes/medicamentos');
const programacionRoutes   = require('./src/routes/programacion');
const historialRoutes      = require('./src/routes/historialRoutes');
const notificacionesRoutes = require('./src/routes/notificaciones');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api/auth',           authRoutes);
app.use('/api/enfermedades',   enfermedadesRoutes);
app.use('/api/medicamentos',   medicamentosRoutes);
app.use('/api/programacion',   programacionRoutes);
app.use('/api/historial',      historialRoutes);
app.use('/api/notificaciones', notificacionesRoutes);

app.get('/', (req, res) => {
    res.send('🚀 API de MediAlert con Firebase FCM funcionando al 100%');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 Servidor MediAlert en puerto ${PORT}`);

    // Cron: cada minuto revisa tomas próximas y envía notificaciones FCM
    const { enviarNotificacionesProximas } = require('./src/utils/notificacionFCM');
    cron.schedule('* * * * *', async () => {
        try {
            await enviarNotificacionesProximas();
        } catch (err) {
            console.error('❌ Error en cron FCM:', err.message);
        }
    });

    console.log('⏰ Cron job FCM activo: revisando tomas cada minuto');
});
