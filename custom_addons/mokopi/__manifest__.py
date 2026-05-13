{
    'name': 'Mokopi',
    'version': '1.0',
    'summary': 'Manage ongoing orders and kitchen stock',
    'category': 'Point of Sale',
    'depends': ['base', 'web', 'account'],
    'data': [
        'security/mokopi_kds_security.xml',
        'security/ir.model.access.csv',
        'views/res_users_views.xml',
        'views/mokopi_stock_views.xml',
        'views/mokopi_order_views.xml',
        'views/mokopi_log_views.xml',
        'views/mokopi_menus.xml',
    ],
    'assets': {
        'web.assets_backend': [
            'mokopi/static/src/kitchen/mokopi_kitchen.js',
            'mokopi/static/src/kitchen/mokopi_kitchen.xml',
            'mokopi/static/src/kitchen/mokopi_kitchen.scss',

            'mokopi/static/src/cashier/mokopi_cashier.js',
            'mokopi/static/src/cashier/mokopi_cashier.xml',
            'mokopi/static/src/cashier/mokopi_cashier.scss',
        ],
    },
    'installable': True,
    'application': True,
}