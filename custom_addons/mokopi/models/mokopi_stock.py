from odoo import models, fields, api

class MokopiStock(models.Model):
    _name = 'mokopi.stock'
    _description = 'Menu Item & Stock'

    name = fields.Char(string='Nama Menu', required=True)
    stock_qty = fields.Integer(string='Jumlah Stok', default=0)
    status_stok = fields.Selection([
        ('tersedia', 'Tersedia'),
        ('habis', 'Habis'),
    ], string='Status Stok', compute='_compute_status_stok', store=True)
    for_bar = fields.Boolean(string='Untuk Bar', default=False)
    price = fields.Integer(string='Harga (Rp)', default=0)

    @api.depends('stock_qty')
    def _compute_status_stok(self):
        for record in self:
            record.status_stok = 'tersedia' if record.stock_qty > 0 else 'habis'

    def write(self, vals):
        if 'stock_qty' in vals:
            for record in self:
                old_qty = record.stock_qty
                new_qty = vals['stock_qty']
                if old_qty != new_qty:
                    # Logging perubahan stok menggunakan sudo() agar Kasir/Kitchen bisa akses
                    self.env['mokopi.order.log'].sudo().create({
                        'action_type': 'Perbarui Stok',
                        'order_name': f'Update Stok: {record.name}',
                        'description': f'Stok menu "{record.name}" diubah dari {old_qty} menjadi {new_qty}',
                    })
        return super(MokopiStock, self).write(vals)
