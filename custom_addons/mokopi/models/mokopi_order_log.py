from odoo import models, fields

class MokopiOrderLog(models.Model):
    _name = 'mokopi.order.log'
    _description = 'Order History Log'
    _order = 'create_date desc'

    create_date = fields.Datetime(string='Waktu', readonly=True)

    order_id = fields.Many2one('mokopi.order', string='Order', ondelete='set null')

    order_name = fields.Char(string='Nama Pesanan', required=True)
    
    action_type = fields.Char(string='Jenis Aksi', required=True)
    
    description = fields.Text(string='Deskripsi')