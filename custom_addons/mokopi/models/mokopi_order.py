from odoo import models, fields, api
from odoo.exceptions import UserError
import pytz

class MokopiOrder(models.Model):
    _name = 'mokopi.order'
    _description = 'Kitchen Order'
    _order = 'sequence, id'

    def _get_default_name(self):
        tz_name = self.env.user.tz or 'UTC'
        user_tz = pytz.timezone(tz_name)
        local_time = fields.Datetime.now().replace(tzinfo=pytz.utc).astimezone(user_tz)
        formatted_time = local_time.strftime("%Y-%m-%d %H:%M:%S")
        return f"Pesanan - {formatted_time}"

    name = fields.Char(string='ID Pesanan', required=True, copy=False, default=_get_default_name)
    order_number = fields.Char(string='Nomor Pesanan')
    customer_name = fields.Char(string='Nama Pelanggan', required=True)
    no_meja = fields.Char(string='No. Meja')
    sequence = fields.Integer(string='Urutan Antrean', default=10)
    
    status = fields.Selection([
        ('dipesan', 'Dipesan'),
        ('diproses', 'Diproses'),
        ('siap', 'Siap'),
        ('ditolak', 'Ditolak'),
        ('dibatalkan', 'Dibatalkan'),
        ('selesai', 'Selesai'),
    ], string='Status', default='dipesan', tracking=True)

    for_bar = fields.Boolean(string='Untuk Bar', default=False)
    line_ids = fields.One2many('mokopi.order.line', 'order_id', string='Detail Pesanan')

    # Status transitions allowed for Bar (and Cashier for Bar items)
    ALLOWED_TRANSITIONS_BAR = {
        'dipesan': ['dipesan', 'diproses', 'dibatalkan'],
        'diproses': ['diproses', 'siap', 'dibatalkan'],
        'siap': ['siap', 'selesai'],
        'ditolak': ['ditolak', 'selesai'], #masih ada takut programnya rusak (tapi tidak berguna)
        'dibatalkan': ['dibatalkan', 'selesai'],
        'selesai': ['selesai'],
    }

    # Status transitions allowed for Kitchen
    ALLOWED_TRANSITIONS_KITCHEN = {
        'dipesan': ['dipesan', 'diproses', 'ditolak'],
        'diproses': ['diproses', 'siap', 'ditolak'],
        'siap': ['siap'],
        'ditolak': ['ditolak'],
        'dibatalkan': ['dibatalkan', 'selesai'],
        'selesai': ['selesai'],
    }

    # Restricted transitions for Cashier looking at Kitchen items
    ALLOWED_TRANSITIONS_CASHIER_KITCHEN = {
        'dipesan': ['dipesan', 'dibatalkan'],
        'diproses': ['diproses', 'dibatalkan'],
        'siap': ['siap', 'selesai'],
        'ditolak': ['ditolak', 'selesai'],
        'dibatalkan': ['dibatalkan'],
        'selesai': ['selesai'],
    }

    @api.model
    def get_fsm_transitions(self, **kwargs):
        """Returns all FSM rules to the frontend"""
        return {
            'bar': self.ALLOWED_TRANSITIONS_BAR,
            'kitchen': self.ALLOWED_TRANSITIONS_KITCHEN,
            'cashier_kitchen': self.ALLOWED_TRANSITIONS_CASHIER_KITCHEN,
        }

    @api.model
    def resequence_orders(self, order_ids):
        """Updates sequences for a list of order IDs in one go"""
        for index, order_id in enumerate(order_ids):
            self.sudo().browse(order_id).write({'sequence': (index + 1) * 10})
        return True

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if 'sequence' not in vals:
                max_seq = self.env['mokopi.order'].sudo().search([], order='sequence desc', limit=1).sequence or 0
                vals['sequence'] = max_seq + 1

        # Create with sudo for internal process
        records = super(MokopiOrder, self.sudo()).create(vals_list)

        for record in records:
            # 1. AUTO-REDUCE STOCK
            for line in record.line_ids:
                menu = line.menu_item_id
                if menu.stock_qty < line.quantity:
                    raise UserError(f"Maaf, stok {menu.name} tidak mencukupi (Tersedia: {menu.stock_qty}, Diminta: {line.quantity})")

                new_qty = menu.stock_qty - line.quantity
                menu.sudo().write({'stock_qty': new_qty})

            # 2. AUTO-CREATE INVOICE
            self._create_invoice_from_order(record)

            record._create_audit_log('Tambah Pesanan', f'Pesanan baru dikirim untuk {record.customer_name}. Stok otomatis dikurangi dan Invoice dibuat.')
        return records

    def _create_invoice_from_order(self, order):
        """Helper to create a draft invoice automatically"""
        Partner = self.env['res.partner'].sudo()
        partner = Partner.search([('name', '=', order.customer_name)], limit=1)
        if not partner:
            partner = Partner.create({'name': order.customer_name})

        journal = self.env['account.journal'].sudo().search([('type', '=', 'sale')], limit=1)
        if not journal:
            return

        invoice_lines = []
        for line in order.line_ids:
            # Gunakan harga dari baris pesanan, atau fallback ke harga produk
            price = line.price or line.menu_item_id.price
            invoice_lines.append((0, 0, {
                'name': line.menu_item_id.name,
                'quantity': line.quantity,
                'price_unit': price,
                'account_id': journal.default_account_id.id or self.env['account.account'].sudo().search([('account_type', '=', 'income_revenue')], limit=1).id,
            }))

        if invoice_lines:
            # Pastikan journal memiliki account_id default
            account_id = journal.default_account_id.id
            if not account_id:
                # Fallback jika tidak ada default account pada journal
                account_id = self.env['account.account'].sudo().search([('account_type', '=', 'income_revenue')], limit=1).id

            self.env['account.move'].sudo().create({
                'move_type': 'out_invoice',
                'partner_id': partner.id,
                'journal_id': journal.id,
                'invoice_date': fields.Date.today(),
                'invoice_line_ids': invoice_lines,
                'ref': order.order_number or order.name,
            })

    def write(self, vals):
        if 'status' in vals:
            is_bar = self.env.user.has_group('mokopi.group_kds_front')

            new_status = vals['status']
            for order in self:
                # Decide which rule to apply
                if is_bar:
                    transitions = self.ALLOWED_TRANSITIONS_BAR if order.for_bar else self.ALLOWED_TRANSITIONS_CASHIER_KITCHEN
                else:
                    transitions = self.ALLOWED_TRANSITIONS_KITCHEN

                allowed = transitions.get(order.status, [])
                if new_status not in allowed:
                    raise UserError(f"Transisi tidak valid untuk {order.name}: {order.status} -> {new_status}")

                if order.status != new_status:
                    # LOGIKA PENGEMBALIAN STOK
                    # Jika status berubah jadi Dibatalkan/Ditolak, dan sebelumnya bukan Dibatalkan/Ditolak
                    if new_status in ['dibatalkan', 'ditolak'] and order.status not in ['dibatalkan', 'ditolak']:
                        for line in order.line_ids:
                            menu = line.menu_item_id
                            new_qty = menu.stock_qty + line.quantity
                            menu.sudo().write({'stock_qty': new_qty})

                        order._create_audit_log('Pengembalian Stok', f'Stok dikembalikan karena pesanan {new_status}.')

                    order._create_audit_log('Update Status', f'Status: {order.status} -> {new_status}')
        return super(MokopiOrder, self.sudo()).write(vals)

    def _create_audit_log(self, action_type, description):
        for order in self:
            total = sum(line.subtotal for line in order.line_ids)
            self.env['mokopi.order.log'].sudo().create({
                'order_id': order.id,
                'order_name': order.name,
                'action_type': action_type,
                'description': description,
                'total_price': total,
            })

    def action_diproses(self):
        self.write({'status': 'diproses'})

    def action_siap(self):
        self.write({'status': 'siap'})

    def action_tolak(self):
        self.write({'status': 'ditolak'})

    def action_batalkan(self):
        self.write({'status': 'dibatalkan'})

    def action_ambil(self):
        self.write({'status': 'selesai'})
