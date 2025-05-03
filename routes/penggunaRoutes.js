const express = require('express');
const router = express.Router();
const penggunaController = require('../controllers/penggunaController');

router.post('/tambah', penggunaController.tambahPengguna);
router.get('/jumlah', penggunaController.jumlahPengguna); 
router.get('/', penggunaController.getPengguna);
router.get('/:id', penggunaController.getPengguna);
router.post('/login', penggunaController.loginPengguna);
router.put('/edit/:id', penggunaController.editPengguna);
router.delete('/hapus/:id', penggunaController.hapusPengguna);
router.put('/reset-password/:id', penggunaController.resetPassword);

module.exports = router;
