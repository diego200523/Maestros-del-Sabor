const express = require('express')
const { sql, poolPromise } = require('../db')
const { requireAuth, requireAdmin } = require('../middleware/auth')
const { notificarUsuario } = require('../socket')
const { registrarAuditoria } = require('../audit')
const { esTextoValido, esEnteroPositivo } = require('../utils/validators')

const router = express.Router()

// Trae los items (detalle) de una lista de pedidos y los agrega a cada uno
async function attachItems(pool, pedidos) {
  for (const pedido of pedidos) {
    const items = await pool.request()
      .input('idPedido', sql.Int, pedido.id)
      .query(`
        SELECT dp.cantidad, dp.precio_unitario, p.nombre, p.id AS id_producto, p.stock AS stock_actual
        FROM detalle_pedido dp JOIN productos p ON p.id = dp.id_producto
        WHERE dp.id_pedido = @idPedido
      `)
    pedido.items = items.recordset
  }
  return pedidos
}

// ── POST /api/orders ──────────────────────────────────────────────────
// Cliente: crea un pedido nuevo a partir de su carrito
// body esperado: { direccion_entrega, items: [{ id_producto, cantidad }] }
//
// IMPORTANTE (seguridad): el precio y la disponibilidad de stock se verifican
// SIEMPRE contra la base de datos aquí en el servidor — nunca se confía en el
// precio que venga del navegador, para evitar que alguien lo manipule antes
// de enviarlo.
router.post('/', requireAuth, async (req, res) => {
  const pool = await poolPromise
  const transaction = new sql.Transaction(pool)
  try {
    const { direccion_entrega, items } = req.body

    if (!esTextoValido(direccion_entrega, { min: 5, max: 255 })) {
      return res.status(400).json({ error: 'Ingresa una dirección de entrega válida.' })
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'El pedido debe tener al menos un producto.' })
    }
    for (const it of items) {
      if (!esEnteroPositivo(it.id_producto, { permitirCero: false }) || !esEnteroPositivo(it.cantidad, { permitirCero: false }) || it.cantidad > 100) {
        return res.status(400).json({ error: 'Hay un producto o cantidad inválida en el pedido.' })
      }
    }

    await transaction.begin()

    const pedidoResult = await new sql.Request(transaction)
      .input('idUsuario', sql.Int, req.user.id)
      .input('direccion', sql.VarChar, direccion_entrega.trim())
      .query(`
        INSERT INTO pedidos (id_usuario, direccion_entrega, estado, total)
        OUTPUT INSERTED.id
        VALUES (@idUsuario, @direccion, 'pendiente', 0)
      `)
    const idPedido = pedidoResult.recordset[0].id

    let total = 0

    for (const item of items) {
      // Bloquea la fila del producto mientras verificamos precio y stock,
      // para evitar condiciones de carrera con pedidos simultáneos.
      const productoResult = await new sql.Request(transaction)
        .input('id', sql.Int, item.id_producto)
        .query('SELECT id, precio, stock, nombre FROM productos WITH (UPDLOCK, ROWLOCK) WHERE id = @id')

      if (productoResult.recordset.length === 0) {
        throw { status: 400, mensaje: 'Uno de los productos ya no existe.' }
      }
      const producto = productoResult.recordset[0]

      if (producto.stock < item.cantidad) {
        throw { status: 409, mensaje: `No hay suficiente stock de "${producto.nombre}" (disponible: ${producto.stock}).` }
      }

      const precioReal = Number(producto.precio) // el precio SIEMPRE viene de la base de datos, no del cliente
      total += precioReal * item.cantidad

      await new sql.Request(transaction)
        .input('idPedido', sql.Int, idPedido)
        .input('idProducto', sql.Int, item.id_producto)
        .input('cantidad', sql.Int, item.cantidad)
        .input('precio', sql.Decimal(10, 2), precioReal)
        .query(`
          INSERT INTO detalle_pedido (id_pedido, id_producto, cantidad, precio_unitario)
          VALUES (@idPedido, @idProducto, @cantidad, @precio)
        `)

      await new sql.Request(transaction)
        .input('cantidad', sql.Int, item.cantidad)
        .input('idProducto', sql.Int, item.id_producto)
        .query('UPDATE productos SET stock = stock - @cantidad WHERE id = @idProducto')
    }

    await new sql.Request(transaction)
      .input('idPedido', sql.Int, idPedido)
      .input('total', sql.Decimal(10, 2), total)
      .query('UPDATE pedidos SET total = @total WHERE id = @idPedido')

    await transaction.commit()
    res.status(201).json({ id: idPedido, mensaje: 'Pedido creado correctamente.' })
  } catch (err) {
    await transaction.rollback()
    if (err && err.status) {
      return res.status(err.status).json({ error: err.mensaje })
    }
    console.error(err)
    res.status(500).json({ error: 'Error al crear el pedido.' })
  }
})

// ── GET /api/orders/mine ──────────────────────────────────────────────
router.get('/mine', requireAuth, async (req, res) => {
  const pool = await poolPromise
  const result = await pool.request()
    .input('idUsuario', sql.Int, req.user.id)
    .query('SELECT * FROM pedidos WHERE id_usuario = @idUsuario ORDER BY creado_en DESC')

  const pedidos = await attachItems(pool, result.recordset)
  res.json(pedidos)
})

// ── GET /api/orders ────────────────────────────────────────────────────
// Solo admin: ve todos los pedidos de todos los clientes
router.get('/', requireAuth, requireAdmin, async (req, res) => {
  const pool = await poolPromise
  const result = await pool.request().query(`
    SELECT pe.*, u.nombre AS cliente, u.correo
    FROM pedidos pe JOIN usuarios u ON u.id = pe.id_usuario
    ORDER BY pe.creado_en DESC
  `)

  const pedidos = await attachItems(pool, result.recordset)
  res.json(pedidos)
})

// ── PATCH /api/orders/:id/cancel ────────────────────────────────────────
// Cliente: cancela su PROPIO pedido, solo si todavía está "pendiente".
// Devuelve el stock de los productos al inventario.
router.patch('/:id/cancel', requireAuth, async (req, res) => {
  const pool = await poolPromise
  const transaction = new sql.Transaction(pool)
  try {
    await transaction.begin()
    const request = new sql.Request(transaction)

    const pedidoResult = await request
      .input('id', sql.Int, req.params.id)
      .input('idUsuario', sql.Int, req.user.id)
      .query('SELECT * FROM pedidos WHERE id = @id AND id_usuario = @idUsuario')

    if (pedidoResult.recordset.length === 0) {
      await transaction.rollback()
      return res.status(404).json({ error: 'Pedido no encontrado.' })
    }
    const pedido = pedidoResult.recordset[0]
    if (pedido.estado !== 'pendiente') {
      await transaction.rollback()
      return res.status(400).json({ error: 'Solo puedes cancelar pedidos que todavía están pendientes.' })
    }

    const itemsResult = await new sql.Request(transaction)
      .input('idPedido', sql.Int, pedido.id)
      .query('SELECT id_producto, cantidad FROM detalle_pedido WHERE id_pedido = @idPedido')

    for (const item of itemsResult.recordset) {
      await new sql.Request(transaction)
        .input('cantidad', sql.Int, item.cantidad)
        .input('idProducto', sql.Int, item.id_producto)
        .query('UPDATE productos SET stock = stock + @cantidad WHERE id = @idProducto')
    }

    await new sql.Request(transaction)
      .input('id', sql.Int, pedido.id)
      .query("UPDATE pedidos SET estado = 'cancelado' WHERE id = @id")

    await transaction.commit()
    res.json({ mensaje: 'Pedido cancelado correctamente.' })
  } catch (err) {
    await transaction.rollback()
    console.error(err)
    res.status(500).json({ error: 'Error al cancelar el pedido.' })
  }
})

// ── PATCH /api/orders/:id/status ───────────────────────────────────────
router.patch('/:id/status', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { estado } = req.body
    const validos = ['pendiente', 'en proceso', 'entregado', 'cancelado']
    if (!validos.includes(estado)) {
      return res.status(400).json({ error: 'Estado inválido.' })
    }
    const pool = await poolPromise

    const pedidoResult = await pool.request()
      .input('id', sql.Int, req.params.id)
      .query('SELECT id, id_usuario FROM pedidos WHERE id = @id')

    if (pedidoResult.recordset.length === 0) {
      return res.status(404).json({ error: 'Pedido no encontrado.' })
    }
    const pedido = pedidoResult.recordset[0]

    await pool.request()
      .input('estado', sql.VarChar, estado)
      .input('id', sql.Int, req.params.id)
      .query('UPDATE pedidos SET estado = @estado WHERE id = @id')

    // Aviso automático en el chat del cliente sobre el cambio de estado
    const ETIQUETAS = {
      pendiente: 'Pendiente',
      'en proceso': 'En proceso',
      entregado: 'Entregado',
      cancelado: 'Cancelado',
    }
    const folio = `#MDS-${String(pedido.id).padStart(4, '0')}`
    const textoAviso = `📦 Actualización de tu pedido ${folio}: el estado cambió a "${ETIQUETAS[estado]}".`

    const resultadoMensaje = await pool.request()
      .input('idUsuario', sql.Int, pedido.id_usuario)
      .input('mensaje', sql.VarChar, textoAviso)
      .query(`INSERT INTO mensajes_chat (id_usuario, remitente, mensaje) OUTPUT INSERTED.* VALUES (@idUsuario, 'admin', @mensaje)`)

    notificarUsuario(pedido.id_usuario, 'nuevo_mensaje', { mensaje: resultadoMensaje.recordset[0] })

    registrarAuditoria({
      idUsuario: req.user.id, correo: req.user.correo, accion: 'pedido_estado_cambiado',
      detalle: `pedido #${pedido.id} → ${estado}`, ip: req.ip,
    })

    res.json({ mensaje: 'Estado actualizado.' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error al actualizar el estado del pedido.' })
  }
})

// ── GET /api/orders/reports ─────────────────────────────────────────────
// Solo admin: resumen de ventas, ventas diarias (últimos 14 días) y top productos
router.get('/reports', requireAuth, requireAdmin, async (req, res) => {
  try {
    const pool = await poolPromise

    const resumen = await pool.request().query(`
      SELECT
        ISNULL(SUM(total), 0) AS ventas_mes,
        COUNT(*) AS pedidos_mes
      FROM pedidos
      WHERE estado <> 'cancelado'
        AND MONTH(creado_en) = MONTH(GETDATE())
        AND YEAR(creado_en) = YEAR(GETDATE())
    `)

    const ventasDiarias = await pool.request().query(`
      SELECT CAST(creado_en AS DATE) AS fecha, SUM(total) AS total_dia, COUNT(*) AS pedidos
      FROM pedidos
      WHERE estado <> 'cancelado'
        AND creado_en >= DATEADD(DAY, -13, CAST(GETDATE() AS DATE))
      GROUP BY CAST(creado_en AS DATE)
      ORDER BY fecha ASC
    `)

    const topProductos = await pool.request().query(`
      SELECT TOP 5
        p.nombre,
        SUM(dp.cantidad) AS cantidad_vendida,
        SUM(dp.cantidad * dp.precio_unitario) AS ingresos
      FROM detalle_pedido dp
      JOIN pedidos pe ON pe.id = dp.id_pedido
      JOIN productos p ON p.id = dp.id_producto
      WHERE pe.estado <> 'cancelado'
        AND pe.creado_en >= DATEADD(DAY, -29, CAST(GETDATE() AS DATE))
      GROUP BY p.nombre
      ORDER BY cantidad_vendida DESC
    `)

    const { ventas_mes, pedidos_mes } = resumen.recordset[0]

    res.json({
      resumen: {
        ventasMes: Number(ventas_mes),
        pedidosMes: pedidos_mes,
        ticketPromedio: pedidos_mes > 0 ? Number(ventas_mes) / pedidos_mes : 0,
      },
      ventasDiarias: ventasDiarias.recordset.map(v => ({
        fecha: v.fecha,
        total: Number(v.total_dia),
        pedidos: v.pedidos,
      })),
      topProductos: topProductos.recordset.map(p => ({
        nombre: p.nombre,
        cantidad: p.cantidad_vendida,
        ingresos: Number(p.ingresos),
      })),
    })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error al generar el reporte de ventas.' })
  }
})

module.exports = router
