from odoo import models, fields

class MokopiStock(models.Model):
    _name = 'mokopi.stock'
    _description = 'Menu Item & Stock'

    name = fields.Char(string='Nama', required=True)
    stock_qty = fields.Integer(string='Stok Tersedia', default=0)
    for_bar = fields.Boolean(string='Dibuat oleh Bar', default=False)