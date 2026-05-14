from odoo import models, fields, api

class MokopiOrderLine(models.Model):
    _name = 'mokopi.order.line'
    _description = 'Kitchen Order Line'

    order_id = fields.Many2one('mokopi.order', string='Pesanan', required=True, ondelete='cascade')
    menu_item_id = fields.Many2one('mokopi.stock', string='Menu', required=True)
    quantity = fields.Integer(string='Qty', default=1)
    notes = fields.Char(string='Notes', placeholder='e.g., No onions')
    price = fields.Integer(string='Harga Satuan (Rp)', default=0)  
    subtotal = fields.Integer(                                       
        string='Subtotal (Rp)',
        compute='_compute_subtotal',
        store=True,
    )

    @api.depends('quantity', 'price')                                        # [BARU]
    def _compute_subtotal(self):
        for line in self:
            line.subtotal = line.quantity * line.price

    @api.onchange('menu_item_id')                                            # [BARU] auto-fill harga
    def _onchange_menu_item(self):
        if self.menu_item_id:
            self.price = self.menu_item_id.price