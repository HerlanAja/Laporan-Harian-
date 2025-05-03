// routes/beritaRoutes.js

const express = require("express");
const router = express.Router();
const beritaController = require("../controllers/beritaController");

// Ambil middleware upload dari controller
const { upload } = beritaController;

// Route untuk mendapatkan semua berita
router.get("/", beritaController.getAllBerita);

// Route untuk mendapatkan berita berdasarkan ID
router.get("/:id", beritaController.getBeritaById);

// Route untuk menambahkan berita baru (dengan upload gambar)
router.post("/", upload.single("image"), beritaController.createBerita);

// Route untuk mengupdate berita berdasarkan ID (dengan upload gambar)
router.put("/:id", upload.single("image"), beritaController.updateBerita);

// Route untuk menghapus berita berdasarkan ID
router.delete("/:id", beritaController.deleteBerita);

module.exports = router;
