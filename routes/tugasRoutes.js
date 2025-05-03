const express = require('express');
const router = express.Router();
const tugasController = require('../controllers/tugasController');
const authMiddleware = require('../middleware/authMiddleware');

// Admin Routes
// Buat tugas baru untuk user
router.post('/admin/tugas',authMiddleware, tugasController.createTugas);

// Melihat semua tugas (semua user)
router.get('/admin/tugas', tugasController.getAllTugas);

// Melihat tugas berdasarkan ID tugas
router.get('/admin/tugas/:tugasId', tugasController.getTugasById);

// Update tugas (status, judul, deskripsi, tanggal deadline)
router.put('/admin/tugas/:tugasId', tugasController.updateTugas);

// Hapus tugas
router.delete('/admin/tugas/:tugasId', tugasController.deleteTugas);

// User Routes
// Melihat semua tugas mereka
router.get('/user/:userId/tugas', tugasController.getTugasByUser);

// Update status tugas mereka
router.put('/user/tugas/:tugasId/status', tugasController.updateStatusTugas);

module.exports = router;
