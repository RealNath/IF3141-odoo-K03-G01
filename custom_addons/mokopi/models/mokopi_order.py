from odoo import models, fields, api
from odoo.exceptions import UserError
import pytz

class MokopiOrder(models.Model):
    _name = 'mokopi.order'
    _description = 'Kitchen Order'

    def _get_default_name(self):
        tz_name = self.env.user.tz or 'UTC'
        user_tz = pytz.timezone(tz_name)
        
        local_time = fields.Datetime.now().replace(tzinfo=pytz.utc).astimezone(user_tz)

        formatted_time = local_time.strftime("%Y-%m-%d %H:%M:%S %Z")
        
        return f"Pesanan - {formatted_time}"

    name = fields.Char(string='Nama', required=True, copy=False, default=_get_default_name)
    order_number = fields.Char(string='Nomor Pesanan')
    
    status = fields.Selection([
        ('dipesan', 'Dipesan'),
        ('diproses', 'Diproses'),
        ('siap', 'Siap'),
        ('dibatalkan', 'Dibatalkan'),
        ('ditolak', 'ditolak'),
    ], string='Status', default='dipesan', tracking=True)

    for_bar = fields.Boolean(string='Untuk Bar', default=False)

    line_ids = fields.One2many('mokopi.order.line', 'order_id', string='Detail Pesanan')

    ALLOWED_TRANSITIONS = {
        'dipesan': ['dipesan', 'diproses', 'dibatalkan', 'ditolak'],
        'diproses': ['diproses', 'siap', 'dibatalkan'],
        'siap': ['siap'],
        'dibatalkan': ['dibatalkan'],
        'ditolak': ['ditolak'],
    }

    @api.model
    def get_fsm_transitions(self):
        """Returns the FSM rules dictionary to the OWL frontend."""
        return self.ALLOWED_TRANSITIONS
    
    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)
        for record in records:
            record._create_audit_log('Dibuat', f'Pesanan dibuat untuk: {record.name}')
        return records
    
    def write(self, vals):
        if 'status' in vals:
            new_status = vals['status']
            for order in self:
                current_status = order.status
                if current_status != new_status:
                    allowed = self.ALLOWED_TRANSITIONS.get(current_status, [])
                    
                    if new_status not in allowed:
                        raise UserError(f"Transisi tidak valid dari '{current_status}' ke '{new_status}'.")
                    
                    order._create_audit_log(
                        'Update Status', 
                        f'Status dipindahkan dari "{current_status}" ke "{new_status}"'
                    )
                        
        return super().write(vals)
    
    def unlink(self):
        for order in self:
            order._create_audit_log('Dihapus', f'Pesanan {order.name} dihapus dari sistem.')
        return super().unlink()
    
    def _create_audit_log(self, action_type, description):
        for order in self:
            self.env['mokopi.order.log'].create({
                'order_id': order.id,
                'order_name': order.name,
                'action_type': action_type,
                'description': description,
            })
