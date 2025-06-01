const express = require('express');
const router = express.Router();
const penggunaController = require('../controllers/penggunaController');
const authMiddleware = require('../middleware/authMiddleware');

router.post('/tambah', penggunaController.tambahPengguna);
router.get('/jumlah', penggunaController.jumlahPengguna); 
router.get('/', penggunaController.getPengguna);
router.get('/pengguna', authMiddleware, penggunaController.getPengguna);
router.post('/login', penggunaController.loginPengguna);
router.put('/edit/:id', penggunaController.editPengguna);
router.delete('/hapus/:id', penggunaController.hapusPengguna);
router.put('/reset-password/:id', penggunaController.resetPassword);

module.exports = router;
