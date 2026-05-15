from odoo import models, fields, api


class ResUsers(models.Model):
    _inherit = 'res.users'

    mokopi_role = fields.Selection([
        ('cashier', 'Kasir'),
        ('kitchen', 'Kitchen Staff'),
        ('supervisor', 'Supervisor'),
    ], string="Mokopi Role")

    @api.model
    def create(self, vals):
        user = super().create(vals)
        user._update_mokopi_groups()
        return user

    def write(self, vals):
        res = super().write(vals)

        if 'mokopi_role' in vals:
            self._update_mokopi_groups()

        return res

    def _update_mokopi_groups(self):
        cashier_group = self.env.ref('mokopi.group_kds_front')
        kitchen_group = self.env.ref('mokopi.group_kds_kitchen')
        supervisor_group = self.env.ref('mokopi.group_kds_supervisor')

        for user in self:

            # remove semua group mokopi dulu
            user.groups_id -= (
                cashier_group
                | kitchen_group
                | supervisor_group
            )

            # assign group sesuai role
            if user.mokopi_role == 'cashier':
                user.groups_id |= cashier_group

            elif user.mokopi_role == 'kitchen':
                user.groups_id |= kitchen_group

            elif user.mokopi_role == 'supervisor':
                user.groups_id |= supervisor_group