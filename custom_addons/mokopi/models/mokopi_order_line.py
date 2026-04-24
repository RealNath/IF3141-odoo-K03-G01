from odoo import models, fields

class MokopiOrderLine(models.Model):
    _name = 'mokopi.order.line'
    _description = 'Kitchen Order Line'

    order_id = fields.Many2one('mokopi.order', string='Pesanan', required=True, ondelete='cascade')
    menu_item_id = fields.Many2one('mokopi.stock', string='Menu', required=True)
    quantity = fields.Integer(string='Qty', default=1)
    notes = fields.Char(string='Notes', placeholder='e.g., No onions')