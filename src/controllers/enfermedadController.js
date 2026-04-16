const db = require('../config/db'); // Tu conexión a MySQL

exports.agregarEnfermedad = (req, res) => {
    // Los nombres aquí deben coincidir con los que envía la App Android
    const { idUsuario, nombreEnfermedad, descripcion } = req.body;

    const query = "INSERT INTO enfermedades (id_usuario_fk, nombre_enfermedad, descripcion) VALUES (?, ?, ?)";

    db.query(query, [idUsuario, nombreEnfermedad, descripcion], (err, result) => {
        if (err) {
            console.error("Error en MySQL:", err);
            return res.status(500).json({ error: "No se pudo guardar la enfermedad" });
        }
        res.status(201).json({ message: "Enfermedad guardada", id: result.insertId });
    });
};

exports.obtenerEnfermedades = (req, res) => {
    const { idUsuario } = req.params;
    const query = "SELECT idEnfermedad as id, nombre_enfermedad as nombreEnfermedad, descripcion FROM enfermedades WHERE id_usuario_fk = ?";

    db.query(query, [idUsuario], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
};