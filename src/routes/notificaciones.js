const express = require('express');
const router  = express.Router();
const { enviarNotificacionMedicamento, enviarNotificacionesProximas } = require('../utils/notificacionFCM');

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


router.post('/enviar-proximas', async (req, res) => {
    await enviarNotificacionesProximas();
    res.json({ mensaje: 'Revisión de próximas tomas ejecutada' });
});

module.exports = router;
