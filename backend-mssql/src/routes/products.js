const express = require('express')
const { sql, poolPromise } = require('../db')
const { requireAuth, requireAdmin } = require('../middleware/auth')
const { upload, guardarImagenValidada, borrarImagenAnterior } = require('../middleware/upload')
const { esTextoValido, esNumeroPositivo, esEnteroPositivo, limpiar } = require('../utils/validators')
const { registrarAuditoria } = require('../audit')

const router = express.Router()

const CATEGORIAS_VALIDAS = ['embutidos', 'otros']

// ── GET /api/products ─────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const pool = await poolPromise
  const result = await pool.request().query('SELECT * FROM productos ORDER BY id DESC')
  res.json(result.recordset)
})

// ── POST /api/products ────────────────────────────────────────────────
// Solo admin: crear producto nuevo. Acepta la imagen como archivo (campo "imagen")
// o, si no se sube archivo, una URL externa opcional en el campo "imagen_url".
router.post('/', requireAuth, requireAdmin, upload.single('imagen'), async (req, res) => {
  try {
    const nombre = limpiar(req.body.nombre)
    const descripcion = limpiar(req.body.descripcion) || ''
    const categoria = CATEGORIAS_VALIDAS.includes(req.body.categoria) ? req.body.categoria : 'embutidos'
    const precio = req.body.precio
    const stock = req.body.stock ?? 0

    if (!esTextoValido(nombre, { min: 2, max: 150 })) {
      return res.status(400).json({ error: 'El nombre del producto debe tener entre 2 y 150 caracteres.' })
    }
    if (!esNumeroPositivo(precio, { permitirCero: false })) {
      return res.status(400).json({ error: 'El precio debe ser un número mayor a 0.' })
    }
    if (!esEnteroPositivo(stock)) {
      return res.status(400).json({ error: 'El stock debe ser un número entero mayor o igual a 0.' })
    }

    // Si se subió un archivo, validamos su contenido real y lo guardamos;
    // si no, se acepta una URL externa (opcional)
    let imagenUrl = null
    if (req.file) {
      try {
        imagenUrl = guardarImagenValidada(req.file)
      } catch (e) {
        return res.status(400).json({ error: e.message })
      }
    } else {
      imagenUrl = limpiar(req.body.imagen_url) || null
    }

    const pool = await poolPromise
    const result = await pool.request()
      .input('nombre', sql.VarChar, nombre)
      .input('descripcion', sql.VarChar, descripcion)
      .input('categoria', sql.VarChar, categoria)
      .input('precio', sql.Decimal(10, 2), Number(precio))
      .input('stock', sql.Int, Number(stock))
      .input('imagen_url', sql.VarChar, imagenUrl)
      .query(`
        INSERT INTO productos (nombre, descripcion, categoria, precio, stock, imagen_url)
        OUTPUT INSERTED.id
        VALUES (@nombre, @descripcion, @categoria, @precio, @stock, @imagen_url)
      `)

    registrarAuditoria({ idUsuario: req.user.id, correo: req.user.correo, accion: 'producto_creado', detalle: nombre, ip: req.ip })

    res.status(201).json({ id: result.recordset[0].id, mensaje: 'Producto creado.' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error al crear el producto.' })
  }
})

// ── PUT /api/products/:id ─────────────────────────────────────────────
// Solo admin: editar producto. Si se sube una imagen nueva, reemplaza la anterior
// (y borra el archivo viejo del disco); si no, conserva la imagen que ya tenía.
router.put('/:id', requireAuth, requireAdmin, upload.single('imagen'), async (req, res) => {
  try {
    const nombre = limpiar(req.body.nombre)
    const descripcion = limpiar(req.body.descripcion) || ''
    const categoria = CATEGORIAS_VALIDAS.includes(req.body.categoria) ? req.body.categoria : 'embutidos'
    const precio = req.body.precio
    const stock = req.body.stock

    if (!esTextoValido(nombre, { min: 2, max: 150 })) {
      return res.status(400).json({ error: 'El nombre del producto debe tener entre 2 y 150 caracteres.' })
    }
    if (!esNumeroPositivo(precio, { permitirCero: false })) {
      return res.status(400).json({ error: 'El precio debe ser un número mayor a 0.' })
    }
    if (!esEnteroPositivo(stock)) {
      return res.status(400).json({ error: 'El stock debe ser un número entero mayor o igual a 0.' })
    }

    const pool = await poolPromise

    // Trae la imagen actual para poder borrarla si se reemplaza
    const actual = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('SELECT imagen_url FROM productos WHERE id = @id')

    if (actual.recordset.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado.' })
    }

    let imagenUrl = actual.recordset[0].imagen_url
    if (req.file) {
      let nuevaImagen
      try {
        nuevaImagen = guardarImagenValidada(req.file)
      } catch (e) {
        return res.status(400).json({ error: e.message })
      }
      borrarImagenAnterior(imagenUrl)
      imagenUrl = nuevaImagen
    } else if (limpiar(req.body.imagen_url)) {
      // Permite también actualizar por URL externa si no se sube archivo
      imagenUrl = limpiar(req.body.imagen_url)
    }

    await pool.request()
      .input('id', sql.Int, req.params.id)
      .input('nombre', sql.VarChar, nombre)
      .input('descripcion', sql.VarChar, descripcion)
      .input('categoria', sql.VarChar, categoria)
      .input('precio', sql.Decimal(10, 2), Number(precio))
      .input('stock', sql.Int, Number(stock))
      .input('imagen_url', sql.VarChar, imagenUrl)
      .query(`
        UPDATE productos
        SET nombre=@nombre, descripcion=@descripcion, categoria=@categoria,
            precio=@precio, stock=@stock, imagen_url=@imagen_url
        WHERE id=@id
      `)

    registrarAuditoria({ idUsuario: req.user.id, correo: req.user.correo, accion: 'producto_editado', detalle: `id ${req.params.id}: ${nombre}`, ip: req.ip })

    res.json({ mensaje: 'Producto actualizado.' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error al actualizar el producto.' })
  }
})

// ── PATCH /api/products/:id/stock ─────────────────────────────────────
// Solo admin: actualizar rápido solo el stock (botones +/-)
router.patch('/:id/stock', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { stock } = req.body
    if (!esEnteroPositivo(stock)) return res.status(400).json({ error: 'Stock inválido.' })
    const pool = await poolPromise
    await pool.request()
      .input('stock', sql.Int, Number(stock))
      .input('id', sql.Int, req.params.id)
      .query('UPDATE productos SET stock = @stock WHERE id = @id')
    res.json({ mensaje: 'Stock actualizado.' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error al actualizar el stock.' })
  }
})

// ── DELETE /api/products/:id ──────────────────────────────────────────
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const pool = await poolPromise

    const actual = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('SELECT imagen_url, nombre FROM productos WHERE id = @id')

    await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('DELETE FROM productos WHERE id = @id')

    if (actual.recordset.length > 0) borrarImagenAnterior(actual.recordset[0].imagen_url)

    registrarAuditoria({
      idUsuario: req.user.id, correo: req.user.correo, accion: 'producto_eliminado',
      detalle: actual.recordset[0]?.nombre || `id ${req.params.id}`, ip: req.ip,
    })

    res.json({ mensaje: 'Producto eliminado.' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error al eliminar el producto.' })
  }
})

module.exports = router
