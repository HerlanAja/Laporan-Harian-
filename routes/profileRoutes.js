const express = require('express');
const router = express.Router();
const profileController = require('../controllers/profileController');

// Tambah profile (upload gambar)
router.post('/tambah', profileController.upload.fields([
  { name: 'visi_misi_image', maxCount: 1 },
  { name: 'berakhlak_image', maxCount: 1 }
]), profileController.createProfile);

// Ambil semua data profile
router.get('/', profileController.getAllProfile);

// Ambil hanya gambar visi misi
router.get('/visi-misi', profileController.getVisiMisi);

// Ambil hanya gambar berakhlak
router.get('/berakhlak', profileController.getBerakhlak);

// Edit profile (dengan opsi upload gambar baru)
router.put('/edit/:id', profileController.upload.fields([
  { name: 'visi_misi_image', maxCount: 1 },
  { name: 'berakhlak_image', maxCount: 1 }
]), profileController.updateProfile);

// Hapus profile dan gambar terkait
router.delete('/hapus/:id', profileController.deleteProfile);

module.exports = router;
