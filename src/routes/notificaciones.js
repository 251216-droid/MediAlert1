const express = require('express');
const router  = express.Router();
const { enviarNotificacionMedicamento, enviarNotificacionesProximas } = require('../utils/notificacionFCM');

// POST /api/notificaciones/enviar — enviar notificación a un usuario específico
router.post('/enviar', async (req, res) => {
    const { idUsuario, idProgramacion, nombreMedicamento, dosis } = req.body;
    if (!idUsuario || !idProgramacion || !nombreMedicamento) {
        return res.status(400).json({ error: 'Faltan: idUsuario, idProgramacion, nombreMedicamento' });
    }
    const exito = await enviarNotificacionMedicamento(idUsuario, idProgramacion, nombreMedicamento, dosis || '');
    if (exito) {
        res.json({ mensaje: 'Notificación enviada' });
    } else {
        res.status(500).json({ error: 'No se pudo enviar. Verifica token FCM y Firebase.' });
    }
});

// POST /api/notificaciones/enviar-proximas — llamado por el cron job interno
// También puede llamarse manualmente para pruebas
router.post('/enviar-proximas', async (req, res) => {
    await enviarNotificacionesProximas();
    res.json({ mensaje: 'Revisión de próximas tomas ejecutada' });
});

module.exports = router;
